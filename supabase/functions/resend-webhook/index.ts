// resend-webhook: Resend からの配信イベントを受信し email_events に記録する
// v3: 受信者の特定を tags(recipient_id) 依存から email_id(=resend_message_id) 主体に変更。
//     Resend の webhook ペイロードに custom tags が期待形式で入らないケースがあり、
//     開封/クリックが記録されない不具合があったため。email_id は必ず入るので堅牢。
//     例外は全て 200 を返し Resend の re-delivery loop を避ける（署名検証は現状スキップ）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function mapEventType(resendType: string): string | null {
  const map: Record<string, string | null> = {
    'email.sent':             'sent',
    'email.delivered':        'delivered',
    'email.opened':           'opened',
    'email.clicked':          'clicked',
    'email.bounced':          'bounced',
    'email.complained':       'complained',
    'email.delivery_delayed': null,
  }
  return map[resendType] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const json = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // 例外は全て 200 で返し Resend の re-delivery loop を避ける
  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

    const rawBody = await req.text()
    const svixId = req.headers.get('svix-id') ?? ''

    let payload: {
      type: string;
      created_at?: string;
      data: {
        email_id?: string;
        to?: string | string[];
        click?: { link?: string };
        bounce?: { message?: string };
        tags?: Array<{ name: string; value: string }>;
      };
    }
    try {
      payload = JSON.parse(rawBody)
    } catch (e) {
      console.error('webhook: invalid JSON:', e, 'body:', rawBody.slice(0, 200))
      return json({ ok: true, skipped: 'invalid_json' })
    }

    const eventType = mapEventType(payload.type)
    if (!eventType) return json({ ok: true, ignored: payload.type })

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const cols = 'id, org_id, first_opened_at, first_clicked_at, delivered_at'
    const emailId = payload.data?.email_id ?? null
    const tagVal = Array.isArray(payload.data?.tags)
      ? payload.data.tags.find((t) => t?.name === 'recipient_id')?.value
      : undefined

    // 1) tag(recipient_id) があれば id で、無ければ email_id(=resend_message_id) で受信者を特定
    let recipient: { id: string; org_id: string; first_opened_at: string | null; first_clicked_at: string | null; delivered_at: string | null } | null = null
    if (tagVal) {
      const { data } = await supabase.from('email_campaign_recipients').select(cols).eq('id', tagVal).maybeSingle()
      recipient = data
    }
    if (!recipient && emailId) {
      const { data } = await supabase.from('email_campaign_recipients').select(cols).eq('resend_message_id', emailId).maybeSingle()
      recipient = data
    }
    if (!recipient) {
      console.warn('webhook: recipient not found', { emailId, tagVal, type: payload.type })
      return json({ ok: true, skipped: 'recipient_not_found' })
    }

    const occurredAt = payload.created_at ?? new Date().toISOString()
    const { error: eventError } = await supabase
      .from('email_events')
      .insert({
        recipient_id: recipient.id,
        org_id: recipient.org_id,
        event_type: eventType,
        occurred_at: occurredAt,
        clicked_url: payload.data.click?.link ?? null,
        raw_payload: payload,
        resend_event_id: svixId || null,
      })

    // unique 違反(重複POST)は握りつぶす。それ以外の失敗も 200 で返す(再送ループ回避)
    if (eventError && eventError.code !== '23505') {
      console.error('webhook: event insert failed:', eventError)
      return json({ ok: true, skipped: 'insert_failed', error: eventError.message })
    }

    const updates: Record<string, unknown> = { status: eventType }
    if (eventType === 'delivered' && !recipient.delivered_at) updates.delivered_at = occurredAt
    if (eventType === 'opened' && !recipient.first_opened_at) updates.first_opened_at = occurredAt
    if (eventType === 'clicked' && !recipient.first_clicked_at) updates.first_clicked_at = occurredAt

    await supabase.from('email_campaign_recipients').update(updates).eq('id', recipient.id)

    return json({ ok: true, event_type: eventType })

  } catch (e) {
    console.error('webhook: fatal error:', e)
    return json({ ok: true, fatal: (e as Error).message })
  }
})
