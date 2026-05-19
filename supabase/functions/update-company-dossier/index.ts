// =====================================================================
// update-company-dossier
//   MASP メンバーが company_dossiers の内容を編集する Edge Function。
//
//   クライアントロールの auth セッションでは RLS により company_dossiers を
//   更新できない（_select 以外）。代理ログイン中の MASP メンバーは
//   adminBackup.access_token を Authorization ヘッダに載せて本 Function を
//   呼ぶことで、admin の身元で書き込めるようにする。
//
//   フロー:
//     1. Authorization ヘッダの token を Supabase Auth で検証
//     2. その user が members.user_id に存在するか確認（=MASPメンバー）
//     3. 同 org の dossier であることを確認
//     4. service_role で UPDATE
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    // 1. Authorization 検証
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'missing authorization token' }, 401)

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'invalid token' }, 401)
    const authUser = userData.user

    // 2. クライアントロール拒否（明示的にブロック）
    if ((authUser.user_metadata as { role?: string })?.role === 'client') {
      return json({ error: 'client role cannot edit dossier' }, 403)
    }

    // 3. MASP メンバー判定: members テーブルに user_id 一致行があるか
    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from('members')
      .select('id, user_id, org_id')
      .eq('user_id', authUser.id)
      .maybeSingle()
    if (memberErr || !memberRow) return json({ error: 'not a member' }, 403)

    // 4. ペイロード検証
    const body = await req.json()
    const { dossier_id, content, free_notes, regenerate } = body
    if (!dossier_id || typeof dossier_id !== 'string') {
      return json({ error: 'dossier_id is required' }, 400)
    }

    // 5. dossier が同 org か確認
    const { data: dossier, error: dossierErr } = await supabaseAdmin
      .from('company_dossiers')
      .select('id, org_id, appointment_id')
      .eq('id', dossier_id)
      .maybeSingle()
    if (dossierErr || !dossier) return json({ error: 'dossier not found' }, 404)
    if (dossier.org_id !== memberRow.org_id) {
      return json({ error: 'org mismatch' }, 403)
    }

    // 6. UPDATE（content / free_notes が来ていれば）
    const updatePayload: Record<string, unknown> = {
      edited_at: new Date().toISOString(),
      edited_by: authUser.id,
    }
    if (content !== undefined) updatePayload.content = content
    if (free_notes !== undefined) updatePayload.free_notes = free_notes

    const { error: updErr } = await supabaseAdmin
      .from('company_dossiers')
      .update(updatePayload)
      .eq('id', dossier_id)
    if (updErr) return json({ error: `update failed: ${updErr.message}` }, 500)

    // 7. 再生成リクエスト
    if (regenerate) {
      // status=queued に戻し、generate-company-dossier を呼ぶ
      await supabaseAdmin
        .from('company_dossiers')
        .update({ generation_status: 'queued', generation_error: null })
        .eq('id', dossier_id)

      await fetch(`${SUPABASE_URL}/functions/v1/generate-company-dossier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ appointment_id: dossier.appointment_id }),
      }).catch(e => console.warn('[update-company-dossier] regenerate kickoff failed:', e))
    }

    return json({ success: true, edited_by: authUser.id }, 200)
  } catch (err) {
    console.error('[update-company-dossier] handler error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
