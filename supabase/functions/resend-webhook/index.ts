// resend-webhook: Resend からの配信イベントを受信し email_events に記録する
//
// Resend Webhook 仕様:
//   - POST /webhooks/resend
//   - headers: svix-id / svix-timestamp / svix-signature
//   - body: { type: "email.opened", created_at, data: { email_id, to, tags: [...] } }
//
// イベントタイプ: email.sent / email.delivered / email.opened / email.clicked /
//                 email.bounced / email.complained / email.delivery_delayed
//
// 署名検証: Svix HMAC-SHA256
// 重複排除: svix-id を resend_event_id に保存し unique 制約で弾く

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Svix 署名検証 */
async function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  // secret は "whsec_xxx" 形式、xxx 部分が base64
  const secretBase64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const secretBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0))

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw', secretBytes,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

  // svix-signature は "v1,base64sig v1,base64sig2 ..." 形式（複数署名対応）
  const signatures = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean)
  return signatures.some((s) => s === expected)
}

/** Resend event type を email_events.event_type にマップ */
function mapEventType(resendType: string): string | null {
  const map: Record<string, string> = {
    'email.sent':             'sent',
    'email.delivered':        'delivered',
    'email.opened':           'opened',
    'email.clicked':          'clicked',
    'email.bounced':          'bounced',
    'email.complained':       'complained',
    'email.delivery_delayed': null as unknown as string, // 無視
  }
  return map[resendType] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const webhookSecret = (Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '').trim()

  const rawBody = await req.text()
  const svixId = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  // 署名検証（secret 未設定なら警告のみ、本番では必須）
  if (webhookSecret) {
    try {
      const ok = await verifySvixSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret)
      if (!ok) {
        return new Response('Invalid signature', { status: 401, headers: corsHeaders })
      }
    } catch (e) {
      console.error('Signature verification error:', e)
      return new Response('Signature error', { status: 401, headers: corsHeaders })
    }
  }

  let payload: {
    type: string;
    created_at: string;
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
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
  }

  const eventType = mapEventType(payload.type)
  if (!eventType) {
    return new Response(JSON.stringify({ ok: true, ignored: payload.type }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // tags から recipient_id を抽出
  const recipientIdTag = payload.data.tags?.find((t) => t.name === 'recipient_id')
  if (!recipientIdTag?.value) {
    console.warn('No recipient_id tag in webhook payload', payload.data.email_id)
    return new Response(JSON.stringify({ ok: true, skipped: 'no recipient_id tag' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const recipientId = recipientIdTag.value

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // recipient から org_id を引く
  const { data: recipient, error: recError } = await supabase
    .from('email_campaign_recipients')
    .select('id, org_id, status, first_opened_at, first_clicked_at, delivered_at')
    .eq('id', recipientId)
    .single()

  if (recError || !recipient) {
    console.error('Recipient not found:', recipientId, recError?.message)
    return new Response('Recipient not found', { status: 404, headers: corsHeaders })
  }

  // email_events に INSERT (svix-id で重複排除)
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

  if (eventError) {
    // unique 違反は重複POSTなので 200 で返す
    if (eventError.code === '23505') {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('Event insert failed:', eventError)
    return new Response(JSON.stringify({ error: eventError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // recipient の status と timestamp を更新（trigger が前進のみ許可）
  const updates: Record<string, unknown> = { status: eventType }
  if (eventType === 'delivered' && !recipient.delivered_at) updates.delivered_at = occurredAt
  if (eventType === 'opened' && !recipient.first_opened_at) updates.first_opened_at = occurredAt
  if (eventType === 'clicked' && !recipient.first_clicked_at) updates.first_clicked_at = occurredAt

  await supabase
    .from('email_campaign_recipients')
    .update(updates)
    .eq('id', recipient.id)

  return new Response(JSON.stringify({ ok: true, event_type: eventType }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
