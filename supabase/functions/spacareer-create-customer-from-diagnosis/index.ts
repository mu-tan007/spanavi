// 診断完了の招待行から、スパキャリ受講生のアカウント一式を発行するEdge Function。
//
// 入力:
//   { response_id: uuid }   // spacareer_social_style_responses.id
//
// 出力（成功時）:
//   {
//     customer_id, member_id, auth_user_id,
//     email, initial_password,
//     login_url
//   }
//
// 処理:
//   1. response 行を Service Role で取得
//   2. 既に customer_id 紐付け済 or 未完了 ならエラー
//   3. 同 email の auth user が既に存在するか確認（あれば再利用）
//   4. auth.users 作成（初期パスワード16文字ランダム）
//   5. members 作成（rank='student'）
//   6. spacareer_customers 作成
//      → DBトリガーが spacareer_sessions 9件 + kickoff_checks + kickoff_hearing_session を自動生成
//   7. spacareer_social_style_responses.customer_id を書き戻し
//
// 権限:
//   篠宮+小山 hardcode（営業代行 admin-impersonate-client と同じ思想）。
//   将来は members.role などに移行する。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// スパキャリ運営者の email 許可リスト（既存 admin-impersonate-spacareer-customer と同じ）
const SPACAREER_ADMIN_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
]

function generatePassword(length = 16) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pw = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(length)
    crypto.getRandomValues(arr)
    for (let i = 0; i < length; i++) pw += charset[arr[i] % charset.length]
  } else {
    for (let i = 0; i < length; i++) pw += charset[Math.floor(Math.random() * charset.length)]
  }
  return pw
}

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
    if (!SPACAREER_ADMIN_EMAILS.includes(callerEmail)) {
      return jsonResp({ error: 'forbidden: not allowed to create customers' }, 403)
    }

    // 2. 入力
    const body = await req.json().catch(() => ({}))
    const { response_id } = body
    if (!response_id) {
      return jsonResp({ error: 'response_id is required' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceKey)

    // 3. 診断行取得 + 重複/未完了チェック
    const { data: response, error: respErr } = await adminClient
      .from('spacareer_social_style_responses')
      .select('id, org_id, invite_email, customer_id, completed_at, result_type')
      .eq('id', response_id)
      .single()
    if (respErr || !response) {
      return jsonResp({ error: 'diagnosis response not found' }, 404)
    }
    if (!response.completed_at) {
      return jsonResp({ error: 'diagnosis is not completed yet' }, 400)
    }
    if (response.customer_id) {
      return jsonResp({ error: 'this diagnosis is already linked to a customer' }, 409)
    }
    if (!response.invite_email) {
      return jsonResp({ error: 'this diagnosis has no invite_email; cannot create account' }, 400)
    }

    const email = response.invite_email.trim().toLowerCase()
    const orgId = response.org_id
    const initialPassword = generatePassword(16)

    // 4. 既存 auth user チェック → 無ければ作成
    let authUserId: string | null = null
    const { data: existingList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = existingList?.users?.find(u => (u.email || '').toLowerCase() === email)
    if (existing) {
      authUserId = existing.id
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { role: 'member' },
      })
      if (createErr || !created?.user) {
        return jsonResp({ error: `failed to create auth user: ${createErr?.message || 'unknown'}` }, 500)
      }
      authUserId = created.user.id
    }

    // 5. 既存 member チェック → 無ければ作成
    let memberId: string | null = null
    const { data: existingMember } = await adminClient
      .from('members')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle()
    if (existingMember) {
      memberId = existingMember.id
    } else {
      // 表示名は email のローカル部をフォールバックに（後から運営が編集する想定）
      const fallbackName = email.split('@')[0]
      const { data: newMember, error: mErr } = await adminClient
        .from('members')
        .insert({
          org_id: orgId,
          user_id: authUserId,
          name: fallbackName,
          email,
          rank: 'student',
        })
        .select('id')
        .single()
      if (mErr || !newMember) {
        return jsonResp({ error: `failed to create member: ${mErr?.message || 'unknown'}` }, 500)
      }
      memberId = newMember.id
    }

    // 6. spacareer_customers 作成
    //    トリガーで spacareer_sessions / kickoff_checks / kickoff_hearing_session が自動生成される
    const { data: existingCust } = await adminClient
      .from('spacareer_customers')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()
    let customerId: string | null = existingCust?.id || null
    if (!customerId) {
      const { data: newCust, error: cErr } = await adminClient
        .from('spacareer_customers')
        .insert({
          org_id: orgId,
          member_id: memberId,
          status: 'pre_kickoff',
          contract_started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (cErr || !newCust) {
        return jsonResp({ error: `failed to create customer: ${cErr?.message || 'unknown'}` }, 500)
      }
      customerId = newCust.id
    }

    // 7. 診断行に customer_id を書き戻し
    const { error: linkErr } = await adminClient
      .from('spacareer_social_style_responses')
      .update({ customer_id: customerId })
      .eq('id', response.id)
    if (linkErr) {
      console.warn('[spacareer-create-customer-from-diagnosis] link error:', linkErr.message)
    }

    const origin = req.headers.get('origin') || ''
    const loginUrl = origin ? `${origin}/spacareer/login` : '/spacareer/login'

    console.log(`[spacareer-create-customer-from-diagnosis] ${callerEmail} created customer ${customerId} for ${email}`)

    return jsonResp({
      customer_id: customerId,
      member_id: memberId,
      auth_user_id: authUserId,
      email,
      initial_password: existing ? null : initialPassword,
      reused_existing_user: !!existing,
      login_url: loginUrl,
    }, 200)

  } catch (e) {
    console.error('[spacareer-create-customer-from-diagnosis] unhandled:', e)
    return jsonResp({ error: (e as Error).message }, 500)
  }
})

function jsonResp(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
