import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // MASP社員で実メールが設定されているメンバーを取得
    const { data: members, error: membersErr } = await adminClient
      .from('members')
      .select('id, name, email')
      .eq('org_id', 'a0000000-0000-0000-0000-000000000001')
      .eq('is_active', true)
      .not('email', 'like', '%@masp-internal.com')
      .not('email', 'like', '%spanavi.internal')

    if (membersErr) {
      return new Response(JSON.stringify({ error: membersErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: { name: string; email: string; status: string }[] = []

    for (const m of members || []) {
      if (!m.email) continue

      // 既に同じメールのauth userがあるかチェック
      const { data: existing } = await adminClient.auth.admin.listUsers()
      const alreadyExists = existing?.users?.find(u => u.email === m.email)

      if (alreadyExists) {
        results.push({ name: m.name, email: m.email, status: 'skipped (already exists)' })
        continue
      }

      // 新規auth userを作成（メール確認済み、パスワード設定済み）
      const { error: createErr } = await adminClient.auth.admin.createUser({
        email: m.email,
        password: 'masp2026',
        email_confirm: true,
        user_metadata: { name: m.name },
      })

      if (createErr) {
        results.push({ name: m.name, email: m.email, status: `error: ${createErr.message}` })
      } else {
        results.push({ name: m.name, email: m.email, status: 'created' })
      }
    }

    return new Response(JSON.stringify({ results, total: results.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
