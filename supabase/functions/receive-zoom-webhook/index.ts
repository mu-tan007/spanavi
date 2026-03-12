import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

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

    // 対象イベント以外はスキップ
    if (body.event !== 'phone.callee_ringing') {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, event: body.event }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = body.payload ?? {}
    const object = payload.object ?? {}

    // 発信者番号を正規化（数字のみ）
    const rawNumber: string = object.caller?.phone_number ?? object.caller_number ?? ''
    const callerNumber = rawNumber.replace(/[^\d]/g, '')
    const callerName: string = object.caller?.name ?? object.caller_name ?? ''

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // caller_number で call_list_items を検索（正規化した番号で照合）
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

    // incoming_calls にレコードを insert
    const { error: insertError } = await supabase
      .from('incoming_calls')
      .insert({
        org_id: ORG_ID,
        caller_number: rawNumber || null,
        caller_name: callerName || null,
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
  } catch (err) {
    console.error('[receive-zoom-webhook] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
