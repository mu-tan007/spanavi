import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 処理対象のWebhookイベント
const INCOMING_EVENT = 'phone.callee_ringing'
const OUTBOUND_EVENTS = new Set([
  'phone.caller_call_ringing',
  'phone.caller_call_connected',
  'phone.caller_call_ended',
  'phone.callee_call_connected',
  'phone.callee_call_ended',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Zoom Webhook URL検証リクエストへの応答
    if (body.event === 'endpoint.url_validation') {
      const plainToken = body.payload?.plainToken ?? ''
      const encoder = new TextEncoder()
      const keyData = encoder.encode(Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') ?? '')
      const messageData = encoder.encode(plainToken)
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
      const hashForValidate = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
      return new Response(
        JSON.stringify({ plainToken, encryptedToken: hashForValidate }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const eventType = body.event ?? ''

    // ============================================================
    // 発信系イベント → active_calls テーブル管理
    // ============================================================
    if (OUTBOUND_EVENTS.has(eventType)) {
      const payload = body.payload ?? {}
      const object = payload.object ?? {}
      const callId = object.call_id ?? ''

      if (!callId) {
        console.warn('[receive-zoom-webhook] call_id なし:', eventType)
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // caller/callee情報
      const callerUserId = object.caller?.user_id ?? object.user_id ?? ''
      const calleeNumber = (object.callee?.phone_number ?? '').replace(/[^\d]/g, '')
      const callerName = object.caller?.name ?? object.caller?.display_name ?? ''
      const calleeName = object.callee?.name ?? object.callee?.display_name ?? ''

      // org_idをmembersテーブルから解決
      let orgId: string | null = null
      if (callerUserId) {
        const { data: member } = await supabase
          .from('members')
          .select('org_id, name')
          .eq('zoom_user_id', callerUserId)
          .limit(1)
          .single()
        if (member) {
          orgId = member.org_id
        }
      }
      // フォールバック: 最初のorgを使用
      if (!orgId) {
        const { data: firstOrg } = await supabase
          .from('members')
          .select('org_id')
          .limit(1)
          .single()
        orgId = firstOrg?.org_id ?? null
      }

      if (!orgId) {
        console.error('[receive-zoom-webhook] org_id 解決不可:', eventType, callerUserId)
        return new Response(JSON.stringify({ ok: false, error: 'org_id not found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // callee_number → 企業名解決
      let resolvedCalleeName = calleeName
      let resolvedCallerName = callerName
      if (calleeNumber && !resolvedCalleeName) {
        const { data: items } = await supabase
          .from('call_list_items')
          .select('company')
          .or(`phone.eq.${calleeNumber},phone.eq.0${calleeNumber}`)
          .limit(1)
        if (items?.length) resolvedCalleeName = items[0].company ?? ''
      }
      // caller名をmembersから解決
      if (callerUserId && !resolvedCallerName) {
        const { data: member } = await supabase
          .from('members')
          .select('name')
          .eq('zoom_user_id', callerUserId)
          .limit(1)
          .single()
        if (member) resolvedCallerName = member.name
      }

      // イベントタイプに応じた処理
      if (eventType === 'phone.caller_call_ringing') {
        // 発信開始 → INSERT
        const { error } = await supabase.from('active_calls').upsert({
          zoom_call_id: callId,
          org_id: orgId,
          caller_zoom_user_id: callerUserId || null,
          caller_name: resolvedCallerName || null,
          callee_number: object.callee?.phone_number || null,
          callee_name: resolvedCalleeName || null,
          call_status: 'ringing',
          direction: 'outbound',
          started_at: new Date().toISOString(),
        }, { onConflict: 'zoom_call_id' })
        if (error) console.error('[receive-zoom-webhook] active_calls upsert error:', error.message)
        console.log('[receive-zoom-webhook] 📞 ringing:', resolvedCallerName, '→', resolvedCalleeName || calleeNumber)
      }

      if (eventType === 'phone.caller_call_connected' || eventType === 'phone.callee_call_connected') {
        // 通話接続 → UPDATE
        const { error } = await supabase
          .from('active_calls')
          .update({ call_status: 'connected', connected_at: new Date().toISOString() })
          .eq('zoom_call_id', callId)
        if (error) console.error('[receive-zoom-webhook] active_calls update error:', error.message)
        console.log('[receive-zoom-webhook] 🟢 connected:', callId)
      }

      if (eventType === 'phone.caller_call_ended' || eventType === 'phone.callee_call_ended') {
        // 通話終了 → UPDATE
        const { error } = await supabase
          .from('active_calls')
          .update({ call_status: 'ended', ended_at: new Date().toISOString() })
          .eq('zoom_call_id', callId)
        if (error) console.error('[receive-zoom-webhook] active_calls update error:', error.message)
        console.log('[receive-zoom-webhook] 🔴 ended:', callId)
      }

      return new Response(
        JSON.stringify({ ok: true, event: eventType, callId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================
    // 着信イベント → incoming_calls テーブル（既存ロジック）
    // ============================================================
    if (eventType === INCOMING_EVENT) {
      const payload = body.payload ?? {}
      const object = payload.object ?? {}

      const rawNumber: string = object.caller?.phone_number ?? object.caller_number ?? ''
      const callerNumber = rawNumber.replace(/[^\d]/g, '')
      const callerNameIncoming: string = object.caller?.name ?? object.caller_name ?? ''

      // org_id解決: callee(着信先)のuser_idからmembersを引く
      let orgId: string | null = null
      const calleeUserId = object.callee?.user_id ?? ''
      if (calleeUserId) {
        const { data: member } = await supabase
          .from('members')
          .select('org_id')
          .eq('zoom_user_id', calleeUserId)
          .limit(1)
          .single()
        if (member) orgId = member.org_id
      }
      if (!orgId) {
        const { data: firstOrg } = await supabase.from('members').select('org_id').limit(1).single()
        orgId = firstOrg?.org_id ?? null
      }

      let itemId: string | null = null
      let companyName: string | null = null

      if (callerNumber) {
        const { data: items } = await supabase
          .from('call_list_items')
          .select('id, company, phone')
          .or(`phone.eq.${callerNumber},phone.eq.0${callerNumber},phone.eq.+81${callerNumber}`)
          .limit(1)

        if (items && items.length > 0) {
          itemId = items[0].id
          companyName = items[0].company ?? null
        }
      }

      const { error: insertError } = await supabase
        .from('incoming_calls')
        .insert({
          org_id: orgId,
          caller_number: rawNumber || null,
          caller_name: callerNameIncoming || null,
          item_id: itemId,
          company_name: companyName,
          received_at: new Date().toISOString(),
          status: '未対応',
        })

      if (insertError) {
        console.error('[receive-zoom-webhook] insert error:', insertError.message)
        return new Response(
          JSON.stringify({ ok: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('[receive-zoom-webhook] 着信登録完了 | caller:', rawNumber, '| company:', companyName)
      return new Response(
        JSON.stringify({ ok: true, callerNumber: rawNumber, companyName, itemId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================
    // その他のイベント → スキップ
    // ============================================================
    console.log('[receive-zoom-webhook] skipped event:', eventType)
    return new Response(
      JSON.stringify({ ok: true, skipped: true, event: eventType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[receive-zoom-webhook] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
