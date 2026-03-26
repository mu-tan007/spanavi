const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 名前正規化（スペース・括弧内読み仮名・髙→高）
function normalizeName(s: string): string {
  return s
    .replace(/[\s　]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')   // 括弧とその中身を除去
    .replace(/髙/g, '高')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
    const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
      return new Response(
        JSON.stringify({ error: 'Zoom credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 1. Zoom アクセストークン取得 ──────────────────────────────────────
    console.log('[sync-zoom-users] Zoom トークン取得中...')
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${zoomClientId}:${zoomClientSecret}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[sync-zoom-users] トークン取得失敗:', JSON.stringify(tokenData))
      return new Response(
        JSON.stringify({ error: 'Failed to get Zoom token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const zoomToken: string = tokenData.access_token
    console.log('[sync-zoom-users] Zoom トークン取得成功')

    // ── 2. Zoom Phone ユーザー全件取得（ページネーション対応） ─────────────
    console.log('[sync-zoom-users] Zoom Phone ユーザー取得中...')
    const zoomUsers: { id: string; name: string; email: string }[] = []
    let nextPageToken = ''
    do {
      const params = new URLSearchParams({ page_size: '100' })
      if (nextPageToken) params.set('next_page_token', nextPageToken)
      const res = await fetch(`https://api.zoom.us/v2/phone/users?${params}`, {
        headers: { 'Authorization': `Bearer ${zoomToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[sync-zoom-users] Zoom Phone ユーザー取得失敗:', JSON.stringify(data))
        return new Response(
          JSON.stringify({ error: `Zoom Phone API error: ${data.message ?? res.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      zoomUsers.push(...(data.users || []))
      nextPageToken = data.next_page_token || ''
    } while (nextPageToken)
    console.log(`[sync-zoom-users] Zoom Phone ユーザー: ${zoomUsers.length} 件`)

    // ── 3. Supabase の members テーブル全件取得 ───────────────────────────
    console.log('[sync-zoom-users] Supabase members 取得中...')
    const membersRes = await fetch(
      `${supabaseUrl}/rest/v1/members?select=id,name,email,zoom_user_id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!membersRes.ok) {
      const errText = await membersRes.text()
      console.error('[sync-zoom-users] members 取得失敗:', errText)
      return new Response(
        JSON.stringify({ error: `Supabase members fetch failed: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const members: { id: string; name: string; email: string | null; zoom_user_id: string | null }[] = await membersRes.json()
    console.log(`[sync-zoom-users] members: ${members.length} 件`)

    // ── 4. マッチング（メール優先 → 名前フォールバック） ──────────────────
    // メールアドレス → member のマップ
    const emailMap = new Map<string, typeof members[0]>()
    members.forEach(m => { if (m.email) emailMap.set(m.email.toLowerCase(), m) })

    // 正規化済み名前 → member のマップ（正引き・逆引き両方）
    const nameMap  = new Map<string, typeof members[0]>()
    const nameMapR = new Map<string, typeof members[0]>() // 姓名逆順
    members.forEach(m => {
      const key = normalizeName(m.name)
      nameMap.set(key, m)
      const parts = m.name.split(/[\s　]+/)
      nameMapR.set(normalizeName(parts.reverse().join('')), m)
    })

    const updated: string[] = []
    const skipped: string[] = []
    const unmatched: { name: string; email: string }[] = []
    const errors: string[] = []

    for (const zu of zoomUsers) {
      // パス1: メールマッチング
      let member = emailMap.get((zu.email || '').toLowerCase())

      // パス2: 名前マッチング（正引き・逆引き）
      if (!member) {
        const key = normalizeName(zu.name || '')
        member = nameMap.get(key) || nameMapR.get(key)
      }

      if (!member) {
        unmatched.push({ name: zu.name || '', email: zu.email || '' })
        continue
      }

      const hasRealEmail = member.email && !member.email.includes('@masp-internal.com')
      if (member.zoom_user_id === zu.id && hasRealEmail) {
        skipped.push(member.name)
        continue
      }

      // UPDATE
      const upRes = await fetch(
        `${supabaseUrl}/rest/v1/members?id=eq.${member.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ zoom_user_id: zu.id, email: zu.email }),
        }
      )
      if (upRes.ok) {
        console.log(`[sync-zoom-users] ✓ ${member.name} → ${zu.id}`)
        updated.push(member.name)
      } else {
        const errText = await upRes.text()
        console.error(`[sync-zoom-users] ✗ ${member.name} 更新失敗:`, errText)
        errors.push(member.name)
      }
    }

    console.log(`[sync-zoom-users] 完了 — 更新:${updated.length} スキップ:${skipped.length} 未マッチ:${unmatched.length} エラー:${errors.length}`)

    return new Response(
      JSON.stringify({ updated, skipped, unmatched, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[sync-zoom-users] 予期せぬエラー:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
