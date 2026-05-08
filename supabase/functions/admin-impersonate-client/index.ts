// 管理者（篠宮）が任意のクライアントとしてポータルにログインするための magic link を発行するEdge Function。
//   - 認証チェック: リクエストの Authorization から user を取得
//   - 権限チェック: email が SUPER_ADMIN_EMAILS のいずれかに一致すること
//   - 対象 client (id) の auth_user_id を Service Role で取得
//   - その auth user の email に対して magic link を発行
//   - フロントは返ってきた action_link を新タブで開く

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// クライアント代理ログイン権限を持つ管理者の email
//   将来的には members.role や専用フラグに移行する想定。今は篠宮のみ。
const SUPER_ADMIN_EMAILS = ['shinomiya@ma-sp.co']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. 認証チェック
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResp({ error: 'unauthorized: missing auth header' }, 401)
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return jsonResp({ error: 'unauthorized: invalid session' }, 401)
    }
    const callerEmail = userData.user.email || ''

    // 2. 権限チェック（篠宮のみ）
    if (!SUPER_ADMIN_EMAILS.includes(callerEmail)) {
      return jsonResp({ error: 'forbidden: not allowed to impersonate' }, 403)
    }

    // 3. 対象 client_id をリクエストから取得
    const body = await req.json().catch(() => ({}))
    const { client_id, redirect_path } = body
    if (!client_id) {
      return jsonResp({ error: 'client_id is required' }, 400)
    }

    // 4. Service Role で対象クライアントの auth_user_id を取得
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: client, error: clientErr } = await adminClient
      .from('clients')
      .select('id, auth_user_id, name')
      .eq('id', client_id)
      .single()
    if (clientErr || !client) {
      return jsonResp({ error: 'client not found' }, 404)
    }
    if (!client.auth_user_id) {
      return jsonResp({ error: 'this client has no portal user (auth_user_id is null)' }, 400)
    }

    // 5. クライアントの auth user の email を取得
    const { data: authUserData, error: authErr } = await adminClient.auth.admin.getUserById(client.auth_user_id)
    if (authErr || !authUserData?.user?.email) {
      return jsonResp({ error: 'failed to fetch client auth user' }, 500)
    }
    const clientEmail = authUserData.user.email

    // 6. Magic Link 生成（パスワード不要のサインインリンク）
    const origin = req.headers.get('origin') || ''
    const safePath = typeof redirect_path === 'string' && redirect_path.startsWith('/')
      ? redirect_path
      : '/client'
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: clientEmail,
      options: {
        redirectTo: origin ? `${origin}${safePath}` : undefined,
      },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      return jsonResp({
        error: 'failed to generate magic link',
        detail: linkErr?.message || 'unknown',
      }, 500)
    }

    // 監査ログ（コンソールに残す。将来 audit テーブルへ）
    console.log(`[admin-impersonate-client] ${callerEmail} → ${client.name} (${clientEmail}) [client_id=${client_id}]`)

    return jsonResp({
      url: linkData.properties.action_link,
      client_name: client.name,
      client_email_masked: maskEmail(clientEmail),
    }, 200)

  } catch (e) {
    console.error('[admin-impersonate-client] unhandled:', e)
    return jsonResp({ error: (e as Error).message }, 500)
  }
})

function jsonResp(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function maskEmail(e: string) {
  const [local, domain] = e.split('@')
  if (!local || !domain) return e
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local.slice(0, 2)}***@${domain}`
}
