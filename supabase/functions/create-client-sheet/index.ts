// ============================================================
// create-client-sheet
// ------------------------------------------------------------
// クライアント用のGoogle Spreadsheetを新規作成し、
// 指定メアドへ「閲覧者(コメント可)」で共有、
// client_sheetsに保存し、全リストを初回同期キューに積む。
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SHEETS_CLIENT_ID = '570031099308-99lcefvcduu9l5etibuqostp261jpker.apps.googleusercontent.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_SHEETS_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET')
  if (!refreshToken || !clientSecret) throw new Error('Missing google secrets')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SHEETS_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })
  const j = await res.json()
  if (!j.access_token) throw new Error('token failed: ' + JSON.stringify(j))
  return j.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    // Platform-level JWT verification (--verify-jwt) でアクセス制御するので
    // 関数内では追加の user チェックは行わない。
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { client_id, share_email } = await req.json()
    if (!client_id || !share_email) return json({ error: 'client_id and share_email required' }, 400)

    // クライアント取得
    const { data: client, error: clientErr } = await supabase
      .from('clients').select('*').eq('id', client_id).single()
    if (clientErr || !client) return json({ error: 'client not found' }, 404)

    // 既存の連携があれば返す
    const { data: existing } = await supabase
      .from('client_sheets').select('*').eq('client_id', client_id).maybeSingle()
    if (existing) {
      return json({ ok: true, already: true, spreadsheet_url: existing.spreadsheet_url, spreadsheet_id: existing.spreadsheet_id })
    }

    const accessToken = await getAccessToken()

    // 1. スプレッドシート新規作成
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: `Spanavi - ${client.name}` },
      }),
    })
    const created = await createRes.json()
    if (!createRes.ok) return json({ error: 'create failed: ' + JSON.stringify(created) }, 500)
    const spreadsheetId = created.spreadsheetId
    const spreadsheetUrl = created.spreadsheetUrl

    // 2. fujii@noahub.jp に閲覧者(コメント可)で共有
    //    Drive API: role=commenter (コメント可), type=user
    const shareRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent('Spanaviの架電結果リアルタイム共有用シートです')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'commenter',
          type: 'user',
          emailAddress: share_email,
        }),
      }
    )
    if (!shareRes.ok) {
      const err = await shareRes.json()
      console.error('share failed:', err)
      // 共有失敗してもシート自体は作成済みなので続行
    }

    // 3. client_sheets に保存
    const { error: insErr } = await supabase.from('client_sheets').insert({
      org_id: client.org_id,
      client_id,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      shared_with: share_email,
      created_by: null,
    })
    if (insErr) return json({ error: 'db insert failed: ' + insErr.message }, 500)

    // 4. このクライアントの全リストを同期キューへ
    const { data: lists } = await supabase
      .from('call_lists').select('id').eq('client_id', client_id).eq('is_archived', false)
    if (lists && lists.length > 0) {
      await supabase.from('sheet_sync_queue').upsert(
        lists.map((l: any) => ({ list_id: l.id, requested_at: new Date().toISOString() })),
        { onConflict: 'list_id' }
      )
    }

    // 5. 即同期キック（pg_cronを待たない）
    const syncSecret = Deno.env.get('SHEET_SYNC_SECRET')
    if (syncSecret) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-list-to-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
        body: '{}',
      }).catch(e => console.error('sync kick failed:', e))
    }

    return json({ ok: true, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl })
  } catch (e) {
    console.error('[create-client-sheet]', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
