// 管理者（篠宮）が任意のスパキャリ受講生としてスパキャリポータルにログインするための magic link を発行するEdge Function。
// 営業代行のクライアントポータル用 `admin-impersonate-client` とは完全に別系統。
//   - 入力: spacareer_customers.id
//   - 経路: spacareer_customers.member_id → members.user_id → auth.users.email
//   - redirect は /spacareer に固定（営業代行ポータル /client に飛ぶ事故を物理的に防ぐ）
//   - 権限: SUPER_ADMIN_EMAILS のみ（現状は篠宮hardcode）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 受講生代理ログイン権限を持つ管理者の email
//   スパキャリ事業に関わる運営者だけが代理ログインできる。
//   営業代行ポータルの admin-impersonate-client とは別配列で管理し、
//   「スパキャリにだけ権限を渡したい人」を独立して制御できる構造にしている。
//   将来的には members.role や専用フラグに移行する想定。
const SUPER_ADMIN_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
]

// スパキャリ受講生ポータルへの redirect は固定。営業代行と混線させない。
// （フロント側 lib/supabase.js は、この magic link で着地した際のハッシュ type=magiclink を
//  検知して「代理ログインタブ」と判定し、認証セッションをメモリ内のみで保持する隔離クライアントに
//  切り替える。これにより共有 localStorage を上書きせず別タブの管理者セッションを汚さない。
//  redirect 先を変えないのは、Auth のリダイレクト許可URL設定に依存させないため。）
const SPACAREER_REDIRECT_PATH = '/spacareer'

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

    // 3. 対象 customer_id をリクエストから取得
    const body = await req.json().catch(() => ({}))
    const { customer_id } = body
    if (!customer_id) {
      return jsonResp({ error: 'customer_id is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceKey)

    // 4. spacareer_customers から member_id 取得（顧客名は監査ログ用）
    const { data: customer, error: customerErr } = await adminClient
      .from('spacareer_customers')
      .select('id, member_id')
      .eq('id', customer_id)
      .single()
    if (customerErr || !customer) {
      return jsonResp({ error: 'spacareer customer not found' }, 404)
    }
    if (!customer.member_id) {
      return jsonResp({ error: 'this customer has no linked member (member_id is null)' }, 400)
    }

    // 5. members から user_id + name を取得
    const { data: member, error: memberErr } = await adminClient
      .from('members')
      .select('id, user_id, name')
      .eq('id', customer.member_id)
      .single()
    if (memberErr || !member) {
      return jsonResp({ error: 'member not found' }, 404)
    }
    if (!member.user_id) {
      return jsonResp({ error: 'this member has no auth user (user_id is null)' }, 400)
    }

    // 6. auth.users.email を取得
    const { data: authUserData, error: authErr } = await adminClient.auth.admin.getUserById(member.user_id)
    if (authErr || !authUserData?.user?.email) {
      return jsonResp({ error: 'failed to fetch auth user' }, 500)
    }
    const studentEmail = authUserData.user.email

    // 7. Magic Link 生成（redirect は /spacareer 固定）
    const origin = req.headers.get('origin') || ''
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: studentEmail,
      options: {
        redirectTo: origin ? `${origin}${SPACAREER_REDIRECT_PATH}` : undefined,
      },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      return jsonResp({
        error: 'failed to generate magic link',
        detail: linkErr?.message || 'unknown',
      }, 500)
    }

    // 監査ログ（コンソールに残す。将来 audit テーブルへ）
    console.log(`[admin-impersonate-spacareer-customer] ${callerEmail} → ${member.name} (${studentEmail}) [customer_id=${customer_id}]`)

    return jsonResp({
      url: linkData.properties.action_link,
      customer_name: member.name,
      customer_email_masked: maskEmail(studentEmail),
    }, 200)

  } catch (e) {
    console.error('[admin-impersonate-spacareer-customer] unhandled:', e)
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
