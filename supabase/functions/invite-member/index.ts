import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: '認証が必要です' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // 呼び出し元ユーザーの認証確認（管理者のみ許可）
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json(401, { error: '認証に失敗しました' })

    const { data: callerMember } = await userClient
      .from('members')
      .select('rank')
      .or(`email.eq.${user.email},user_id.eq.${user.id}`)
      .single()

    if (!callerMember || callerMember.rank !== 'admin') {
      return json(403, { error: '管理者権限が必要です' })
    }

    const { email: rawEmail, name, orgId, rank, position, team, university, grade, referrer_name, operation_start_date, resend } = await req.json()
    if (!rawEmail || !name) return json(400, { error: 'email, name は必須です' })

    const email = String(rawEmail).trim().toLowerCase()
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // 既存 auth.users 検出（メールで一意検索）
    const { data: existingAuthUserId, error: rpcError } = await adminClient
      .rpc('find_auth_user_id_by_email', { p_email: email })
    if (rpcError) {
      return json(500, { error: `auth.users 検索失敗: ${rpcError.message}` })
    }
    const existingUserId: string | null = existingAuthUserId ?? null

    // ────────────────────────────────────────────────────────
    // 再送モード: members 行は触らず、メールだけ再送
    // ────────────────────────────────────────────────────────
    if (resend) {
      if (existingUserId) {
        // 既に Auth に居る → recovery メールで再設定リンク送信
        const publicClient = createClient(supabaseUrl, anonKey)
        const { error: resetError } = await publicClient.auth.resetPasswordForEmail(email)
        if (resetError) return json(400, { error: `再送失敗: ${resetError.message}` })
        return json(200, {
          success: true,
          existingUser: true,
          message: `${email} にパスワード再設定メールを送信しました`,
        })
      }
      // Auth 未登録 → 通常の invite メール
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { name } })
      if (inviteError) return json(400, { error: `招待メール送信失敗: ${inviteError.message}` })
      return json(200, {
        success: true,
        existingUser: false,
        message: `${email} に招待メールを再送しました`,
      })
    }

    // ────────────────────────────────────────────────────────
    // 新規追加モード
    // ────────────────────────────────────────────────────────
    if (!orgId) return json(400, { error: 'orgId は必須です' })

    const memberFields = {
      name,
      email,
      rank: rank || 'トレーニー',
      position: position || 'メンバー',
      team: team || null,
      university: university || null,
      grade: grade ? parseInt(grade) : null,
      referrer_name: referrer_name || null,
      operation_start_date: operation_start_date || null,
    }

    let memberId: string | null = null

    if (existingUserId) {
      // ===== 既存 Auth ユーザー：紐付け or 復活 =====
      // 同じ org に members 行が既にあるか（email or user_id で照合）
      const { data: existingMembers } = await adminClient
        .from('members')
        .select('id, is_active')
        .eq('org_id', orgId)
        .or(`email.eq.${email},user_id.eq.${existingUserId}`)
        .limit(1)

      const existingMember = existingMembers?.[0]

      if (existingMember) {
        // 復活：既存行を入力値で更新し、is_active=true / user_id 紐付けを保証
        const { error: updErr } = await adminClient
          .from('members')
          .update({
            ...memberFields,
            is_active: true,
            user_id: existingUserId,
          })
          .eq('id', existingMember.id)
        if (updErr) return json(400, { error: `メンバー復活失敗: ${updErr.message}` })
        memberId = existingMember.id
      } else {
        // 新規 members 行（既存 auth.users にリンク）
        const { data: m, error: insErr } = await adminClient
          .from('members')
          .insert({
            org_id: orgId,
            user_id: existingUserId,
            ...memberFields,
            incentive_rate: 0.22,
            cumulative_sales: 0,
            is_active: true,
            start_date: operation_start_date || new Date().toISOString().slice(0, 10),
          })
          .select('id')
          .single()
        if (insErr) return json(400, { error: `メンバー作成失敗: ${insErr.message}` })
        memberId = m.id
      }

      // 既存ユーザー宛にはパスワード再設定メールを送信
      const publicClient = createClient(supabaseUrl, anonKey)
      const { error: resetError } = await publicClient.auth.resetPasswordForEmail(email)
      if (resetError) {
        return json(200, {
          success: true,
          memberId,
          existingUser: true,
          warning: `メンバー追加は完了しましたが、再設定メール送信に失敗: ${resetError.message}`,
        })
      }

      return json(200, {
        success: true,
        memberId,
        existingUser: true,
        message: `${email} は既に登録済みのため、パスワード再設定メールを送信しました`,
      })
    }

    // ===== 新規 Auth ユーザー：従来フロー =====
    const { data: member, error: memberError } = await adminClient
      .from('members')
      .insert({
        org_id: orgId,
        ...memberFields,
        incentive_rate: 0.22,
        cumulative_sales: 0,
        is_active: true,
        start_date: operation_start_date || new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single()
    if (memberError) return json(400, { error: `メンバー作成失敗: ${memberError.message}` })
    memberId = member.id

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { name } })
    if (inviteError) {
      // 招待失敗時は members 行をロールバック
      if (memberId) await adminClient.from('members').delete().eq('id', memberId)
      return json(400, { error: `招待メール送信失敗: ${inviteError.message}` })
    }

    return json(200, {
      success: true,
      memberId,
      existingUser: false,
      message: `${email} に招待メールを送信しました`,
    })
  } catch (err) {
    return json(500, { error: (err as Error).message })
  }
})
