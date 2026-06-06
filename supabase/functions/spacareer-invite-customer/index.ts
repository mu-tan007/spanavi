// スパキャリ受講生 招待 Edge Function。
//
// 入力:
//   { name: string, email: string }
//
// 出力（成功時）:
//   {
//     customer_id, member_id, auth_user_id, response_id,
//     email, initial_password, login_url, existing_user, email_sent
//   }
//
// 処理:
//   1. 認証チェック（スパキャリ運営の hardcode 許可リスト）
//   2. auth.users
//        - 既存 → password を新しいランダム16文字に再設定（admin.updateUserById）
//        - 新規 → admin.createUser(email, password, email_confirm=true) で作成
//   3. members(rank='student') 作成（既存なら再利用）
//   4. spacareer_customers 作成（既存なら再利用、nickname=name）
//      → DBトリガが第0-8回 sessions / kickoff_checks / kickoff_hearing_session を自動生成
//   5. spacareer_social_style_responses 行を customer_id 紐付きで先回し挿入
//   6. send-email Edge Function を呼んで「ログインURL / ID / 初期パスワード」3点を本文に含めた招待メールを送信
//      （Supabase Auth の inviteUserByEmail はテンプレ依存で本文カスタムが難しいため使わない）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SPACAREER_ADMIN_EMAILS = [
  'shinomiya@ma-sp.co',
  'koyama@ma-sp.co',
]

// MASP org_id（既存ハードコード、他org運用が始まる際に拡張）
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

// 本番ログインURL
const SPACAREER_LOGIN_URL = 'https://spanavi.jp/spacareer/login'

function generatePassword(length = 16): string {
  // 紛らわしい文字（0/O/1/I/l 等）を除外したセット
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

function buildInviteEmail(params: { name: string; email: string; password: string }) {
  const subject = '【スパキャリ】受講開始のご案内 / ログイン情報のお届け'
  const body =
    `${params.name} 様\n` +
    `\n` +
    `この度はスパキャリにお申し込みいただき、誠にありがとうございます。\n` +
    `受講開始にあたり、専用のログイン情報をご案内いたします。\n` +
    `\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `■ ログインURL\n` +
    `${SPACAREER_LOGIN_URL}\n` +
    `\n` +
    `■ ログインID（メールアドレス）\n` +
    `${params.email}\n` +
    `\n` +
    `■ パスワード\n` +
    `${params.password}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `\n` +
    `【ご利用にあたってのお願い】\n` +
    `・ログイン後、最初に「ソーシャルスタイル診断」（全30問・約5分）にご回答ください。\n` +
    `　診断完了をもって、カリキュラム各メニューにお進みいただけるようになります。\n` +
    `\n` +
    `ご不明点がございましたら、本メールへの返信、または担当トレーナーまでお気軽にお問い合わせください。\n` +
    `\n` +
    `今後ともどうぞよろしくお願いいたします。\n` +
    `\n` +
    `─────────────────────\n` +
    `スパキャリ事務局\n` +
    `M&Aソーシングパートナーズ株式会社\n` +
    `─────────────────────\n`
  return { subject, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim()
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim()
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()

    // ────────────────────────────────────────────────────────
    // 1. 認証
    // ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResp({ error: 'unauthorized: missing auth header' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return jsonResp({ error: 'unauthorized: invalid session' }, 401)
    }
    const callerEmail = (userData.user.email || '').toLowerCase()
    if (!SPACAREER_ADMIN_EMAILS.includes(callerEmail)) {
      return jsonResp({ error: 'forbidden: not allowed to invite customers' }, 403)
    }

    // ────────────────────────────────────────────────────────
    // 2. 入力
    // ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const rawName = String(body.name || '').trim()
    const rawEmail = String(body.email || '').trim().toLowerCase()
    if (!rawName) return jsonResp({ error: 'name is required' }, 400)
    if (!rawEmail) return jsonResp({ error: 'email is required' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return jsonResp({ error: 'invalid email format' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceKey)
    const orgId = DEFAULT_ORG_ID
    const initialPassword = generatePassword(16)

    // ────────────────────────────────────────────────────────
    // 3. auth.users: 既存検出 → 既存なら password 再設定、なければ createUser
    // ────────────────────────────────────────────────────────
    const { data: existingAuthUserId, error: rpcError } = await adminClient
      .rpc('find_auth_user_id_by_email', { p_email: rawEmail })
    if (rpcError) {
      return jsonResp({ error: `auth lookup failed: ${rpcError.message}` }, 500)
    }

    let authUserId: string | null = existingAuthUserId ?? null
    let existingUser = false

    if (authUserId) {
      existingUser = true
      // 既存 auth user の password を再設定（運営が新しい初期パスワードを発行する運用）
      const { error: updErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: initialPassword,
        email_confirm: true,
        user_metadata: { name: rawName, role: 'student' },
      })
      if (updErr) {
        return jsonResp({ error: `failed to reset password: ${updErr.message}` }, 500)
      }
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: rawEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { name: rawName, role: 'student' },
      })
      if (createErr || !created?.user) {
        return jsonResp({ error: `failed to create auth user: ${createErr?.message || 'unknown'}` }, 500)
      }
      authUserId = created.user.id
    }

    // ────────────────────────────────────────────────────────
    // 4. members: 既存なら再利用、なければ rank='student' で作成
    // ────────────────────────────────────────────────────────
    let memberId: string | null = null
    const { data: existingMember } = await adminClient
      .from('members')
      .select('id, rank')
      .eq('user_id', authUserId)
      .maybeSingle()

    if (existingMember) {
      memberId = existingMember.id
      if (existingMember.rank && existingMember.rank !== 'student') {
        return jsonResp({
          error: `この email は既に社内メンバー（rank=${existingMember.rank}）として登録されています。受講生は別のメールアドレスで招待してください。`,
        }, 409)
      }
    } else {
      const { data: newMember, error: mErr } = await adminClient
        .from('members')
        .insert({
          org_id: orgId,
          user_id: authUserId,
          name: rawName,
          email: rawEmail,
          rank: 'student',
        })
        .select('id')
        .single()
      if (mErr || !newMember) {
        return jsonResp({ error: `failed to create member: ${mErr?.message || 'unknown'}` }, 500)
      }
      memberId = newMember.id
    }

    // ────────────────────────────────────────────────────────
    // 5. spacareer_customers: 既存なら再利用、なければ作成
    // ────────────────────────────────────────────────────────
    let customerId: string | null = null
    const { data: existingCust } = await adminClient
      .from('spacareer_customers')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (existingCust) {
      customerId = existingCust.id
    } else {
      const { data: newCust, error: cErr } = await adminClient
        .from('spacareer_customers')
        .insert({
          org_id: orgId,
          member_id: memberId,
          nickname: rawName,
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

    // ────────────────────────────────────────────────────────
    // 6. spacareer_social_style_responses: customer_id 紐付きで先回し挿入
    // ────────────────────────────────────────────────────────
    let responseId: string | null = null
    const { data: existingResp } = await adminClient
      .from('spacareer_social_style_responses')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle()

    if (existingResp) {
      responseId = existingResp.id
    } else {
      const { data: newResp, error: rErr } = await adminClient
        .from('spacareer_social_style_responses')
        .insert({
          org_id: orgId,
          customer_id: customerId,
          invite_email: rawEmail,
          answers: [],
          current_question_no: 0,
        })
        .select('id')
        .single()
      if (rErr || !newResp) {
        return jsonResp({ error: `failed to create diagnosis response: ${rErr?.message || 'unknown'}` }, 500)
      }
      responseId = newResp.id
    }

    // ────────────────────────────────────────────────────────
    // 7. 招待メール送信（send-email Edge Function に委譲）
    // ────────────────────────────────────────────────────────
    const { subject, body: mailBody } = buildInviteEmail({
      name: rawName,
      email: rawEmail,
      password: initialPassword,
    })

    let emailSent = false
    let emailError: string | null = null
    try {
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
        body: JSON.stringify({ to: rawEmail, subject, body: mailBody }),
      })
      const sendData = await sendRes.json().catch(() => ({}))
      if (!sendRes.ok) {
        emailError = sendData?.error || `send-email returned status ${sendRes.status}`
        console.error('[spacareer-invite-customer] send-email failed:', emailError)
      } else {
        emailSent = true
      }
    } catch (e) {
      emailError = (e as Error).message
      console.error('[spacareer-invite-customer] send-email throw:', emailError)
    }

    console.log(
      `[spacareer-invite-customer] ${callerEmail} invited ${rawEmail} `
      + `(customer=${customerId}, member=${memberId}, existing=${existingUser}, email_sent=${emailSent})`
    )

    return jsonResp({
      customer_id: customerId,
      member_id: memberId,
      auth_user_id: authUserId,
      response_id: responseId,
      email: rawEmail,
      initial_password: initialPassword,
      login_url: SPACAREER_LOGIN_URL,
      existing_user: existingUser,
      email_sent: emailSent,
      email_error: emailError,
    }, 200)

  } catch (e) {
    console.error('[spacareer-invite-customer] unhandled:', e)
    return jsonResp({ error: (e as Error).message }, 500)
  }
})

function jsonResp(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
