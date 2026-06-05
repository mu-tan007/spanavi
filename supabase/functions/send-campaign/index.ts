// send-campaign: メルマガキャンペーンを Resend API で配信する
//
// 呼出方法:
//   POST { "campaign_id": "<uuid>" }
//
// 認証:
//   - UI から: ユーザー JWT (verify_jwt=true)
//   - pg_cron から: service_role_key を Authorization に
//
// 動作:
//   1. campaign を 'scheduled'|'draft' → 'sending' に楽観ロック更新
//   2. compute_campaign_segment で配信対象を取得し email_campaign_recipients に INSERT
//      （unsubscribe_token = HMAC-SHA256(secret, recipient_id) を生成して保存）
//   3. body_html に merge_vars + unsubscribe_url を差込
//   4. Resend /emails/batch で 100件ずつ送信、10 req/s レート制御
//   5. resend_message_id を recipients に UPDATE
//   6. campaign を 'sent' (失敗時 'failed') に更新

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RESEND_API = 'https://api.resend.com/emails/batch'
const BATCH_SIZE = 100
const RATE_LIMIT_MS = 110 // 10 req/s 弱（安全マージン）

/** HMAC-SHA256 で unsubscribe token 生成 */
async function generateUnsubscribeToken(recipientId: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(recipientId))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** {{var}} を merge_vars で置換。未定義変数は空文字 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? '')
}

/** HTML 末尾に配信停止フッターを差し込む（特定電子メール法対応） */
function appendUnsubscribeFooter(html: string, unsubscribeUrl: string, orgName: string): string {
  const footer = `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #e0e0e0;padding-top:16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#666;line-height:1.6;">
  <tr><td>
    <p style="margin:0 0 8px 0;">本メールの配信元: ${orgName}</p>
    <p style="margin:0 0 8px 0;">所在地: 東京都港区南青山2-2-15 ウィン青山1F</p>
    <p style="margin:0;"><a href="${unsubscribeUrl}" style="color:#0176D3;text-decoration:underline;">このメールの配信を停止する</a></p>
  </td></tr>
</table>`
  // </body> 直前に挿入、なければ末尾に追加
  if (html.includes('</body>')) {
    return html.replace('</body>', footer + '</body>')
  }
  return html + footer
}

/** プレーンテキスト末尾にも配信停止URL */
function appendUnsubscribeFooterText(text: string, unsubscribeUrl: string, orgName: string): string {
  return `${text}\n\n---\n本メールの配信元: ${orgName}\n所在地: 東京都港区南青山2-2-15 ウィン青山1F\n配信停止: ${unsubscribeUrl}\n`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const resendApiKey = (Deno.env.get('RESEND_NEWSLETTER_API_KEY') ?? '').trim()
  const hmacSecret = (Deno.env.get('UNSUBSCRIBE_HMAC_SECRET') ?? '').trim()
  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://app.spanavi.jp').trim()

  if (!resendApiKey || !hmacSecret) {
    return new Response(
      JSON.stringify({ error: 'Missing RESEND_NEWSLETTER_API_KEY or UNSUBSCRIBE_HMAC_SECRET' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let campaignId: string
  try {
    const body = await req.json()
    campaignId = body.campaign_id
    if (!campaignId) throw new Error('campaign_id required')
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body: ' + (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ===== 1. campaign を排他的に 'sending' へ遷移 =====
  const { data: lockedCampaign, error: lockError } = await supabase
    .from('email_campaigns')
    .update({ status: 'sending', sent_at: new Date().toISOString() })
    .eq('id', campaignId)
    .in('status', ['scheduled', 'draft'])
    .select('*')
    .single()

  if (lockError || !lockedCampaign) {
    return new Response(
      JSON.stringify({
        error: 'Campaign not found or already sending/sent',
        detail: lockError?.message,
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const campaign = lockedCampaign as {
    id: string; org_id: string; subject: string; from_email: string; from_name: string;
    body_html: string; body_text: string | null; segment_definition: Record<string, unknown>;
  }

  try {
    // ===== 2. セグメント解釈 → 重複排除 =====
    const { data: segRows, error: segError } = await supabase
      .rpc('compute_campaign_segment', { p_segment: campaign.segment_definition, p_org_id: campaign.org_id })

    if (segError) throw new Error('Segment computation failed: ' + segError.message)

    const seen = new Set<string>()
    const recipients: Array<{
      recipient_type: string; client_id: string | null; client_contact_id: string | null;
      lead_company_id: string | null; email: string; display_name: string | null;
      merge_vars: Record<string, string>;
    }> = []
    for (const r of (segRows ?? [])) {
      if (!r.email || seen.has(r.email)) continue
      seen.add(r.email)
      recipients.push(r)
    }

    if (recipients.length === 0) {
      await supabase.from('email_campaigns').update({
        status: 'sent', total_recipients: 0, sent_count: 0,
      }).eq('id', campaign.id)
      return new Response(
        JSON.stringify({ ok: true, total_recipients: 0, sent_count: 0, message: 'No recipients matched' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== 3. recipients を INSERT (unsubscribe_token 付き) =====
    const recipientRows = await Promise.all(recipients.map(async (r) => {
      const tempId = crypto.randomUUID()
      const token = await generateUnsubscribeToken(tempId, hmacSecret)
      return {
        id: tempId,
        campaign_id: campaign.id,
        org_id: campaign.org_id,
        recipient_type: r.recipient_type,
        client_id: r.client_id,
        client_contact_id: r.client_contact_id,
        lead_company_id: r.lead_company_id,
        email: r.email,
        display_name: r.display_name,
        merge_vars: r.merge_vars,
        status: 'queued',
        unsubscribe_token: token,
      }
    }))

    const { error: insertError } = await supabase
      .from('email_campaign_recipients')
      .insert(recipientRows)

    if (insertError) throw new Error('Recipients insert failed: ' + insertError.message)

    await supabase
      .from('email_campaigns')
      .update({ total_recipients: recipientRows.length })
      .eq('id', campaign.id)

    // ===== 4. Resend バッチ送信 =====
    let sentCount = 0
    let failedCount = 0
    const orgName = campaign.from_name || 'M&Aソーシングパートナーズ'

    for (let i = 0; i < recipientRows.length; i += BATCH_SIZE) {
      const batch = recipientRows.slice(i, i + BATCH_SIZE)

      const payload = batch.map((r) => {
        const unsubUrl = `${siteUrl}/unsubscribe?rid=${r.id}&token=${r.unsubscribe_token}`
        const mergeVars = { ...(r.merge_vars as Record<string, string>), unsubscribe_url: unsubUrl }
        const subject = renderTemplate(campaign.subject, mergeVars)
        const html = appendUnsubscribeFooter(
          renderTemplate(campaign.body_html, mergeVars),
          unsubUrl,
          orgName,
        )
        const text = campaign.body_text
          ? appendUnsubscribeFooterText(renderTemplate(campaign.body_text, mergeVars), unsubUrl, orgName)
          : undefined
        return {
          from: `${orgName} <${campaign.from_email}>`,
          to: r.email,
          subject,
          html,
          ...(text ? { text } : {}),
          tags: [
            { name: 'campaign_id', value: campaign.id },
            { name: 'recipient_id', value: r.id },
          ],
        }
      })

      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Resend batch failed (${res.status}):`, errText)
        await supabase
          .from('email_campaign_recipients')
          .update({ status: 'failed', error_message: `Resend ${res.status}: ${errText.slice(0, 500)}` })
          .in('id', batch.map((r) => r.id))
        failedCount += batch.length
      } else {
        const result = await res.json()
        const data = result.data ?? []
        const nowIso = new Date().toISOString()
        // result.data は payload と同じ順序で id を返す
        await Promise.all(batch.map((r, idx) => {
          const msgId = data[idx]?.id ?? null
          return supabase
            .from('email_campaign_recipients')
            .update({ status: 'sent', sent_at: nowIso, resend_message_id: msgId })
            .eq('id', r.id)
        }))
        sentCount += batch.length
      }

      // 次バッチまでレート制御
      if (i + BATCH_SIZE < recipientRows.length) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    }

    // ===== 5. campaign を完了状態に =====
    await supabase
      .from('email_campaigns')
      .update({
        status: failedCount === recipientRows.length ? 'failed' : 'sent',
        sent_count: sentCount,
      })
      .eq('id', campaign.id)

    return new Response(
      JSON.stringify({ ok: true, total_recipients: recipientRows.length, sent_count: sentCount, failed_count: failedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('send-campaign fatal:', e)
    await supabase
      .from('email_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign.id)
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
