import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadJpHolidays, listDaysThroughBusinessDay } from '../_shared/jpBusinessDays.ts'

const SPANAVI_URL = 'https://spanavi.jp'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // dry_run: Slack へ送らず本文だけ返す（確認用）。today で基準日を差し替えられる（dry_run 時のみ）
    let dryRun = false
    let todayOverride = ''
    try {
      const body = await req.json()
      dryRun = body?.dry_run === true
      if (dryRun && /^\d{4}-\d{2}-\d{2}$/.test(body?.today || '')) todayOverride = body.today
    } catch { /* cron は空ボディ */ }

    // JST の今日（UTC 0時の Date として扱う）
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const todayJST = new Date((todayOverride || jstNow.toISOString().slice(0, 10)) + 'T00:00:00Z')

    // 当日〜2営業日後までの全日付（間の土日・祝日も含める。以前は平日の日付だけで休日の面談が漏れていた）
    const holidays = await loadJpHolidays()
    const targetDays = listDaysThroughBusinessDay(todayJST, 2, holidays)
    const targetDates = targetDays.map(d => d.date)

    // 通知対象 org = org_settings.slack_webhook_precheck に有効URLが設定されている org のみ
    const { data: webhookRows, error: webhookErr } = await supabase
      .from('org_settings')
      .select('org_id, setting_value')
      .eq('setting_key', 'slack_webhook_precheck')
    if (webhookErr) throw new Error(`org_settings fetch error: ${webhookErr.message}`)

    const orgWebhooks: Array<{ org_id: string; url: string }> = []
    for (const row of (webhookRows || [])) {
      const url = (row.setting_value as string | null) || ''
      if (url.startsWith('http')) orgWebhooks.push({ org_id: row.org_id as string, url })
    }
    if (orgWebhooks.length === 0) {
      console.log('[notify-pre-check] slack_webhook_precheck 設定済 org なし')
      return new Response(
        JSON.stringify({ ok: true, message: 'No org webhook configured', targetDates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const summary: Array<{ org_id: string; appoCount: number; sent: boolean }> = []
    const previews: Array<{ org_id: string; days: Array<{ date: string; label: string; count: number }> }> = []

    for (const { org_id: orgId, url: webhookUrl } of orgWebhooks) {
      // 当該 org のアポのみ取得（status='アポ取得' / 対象日範囲）
      const { data: rawOrg, error: apposError } = await supabase
        .from('appointments')
        .select('id, company_name, getter_name, meeting_date, client_id, notes')
        .eq('org_id', orgId)
        .eq('status', 'アポ取得')
        .gte('meeting_date', `${targetDates[0]}T00:00:00+00:00`)
        .lte('meeting_date', `${targetDates[targetDates.length - 1]}T23:59:59+00:00`)
        .order('meeting_date')
        .order('company_name')
      if (apposError) {
        console.warn(`[notify-pre-check] org ${orgId} appos fetch warn:`, apposError.message)
        continue
      }

      const appos = (rawOrg || []).filter(a => {
        const d = (a.meeting_date as string).slice(0, 10)
        return targetDates.includes(d)
      })
      if (appos.length === 0) {
        summary.push({ org_id: orgId, appoCount: 0, sent: false })
        continue
      }

      // client_id → クライアント名 マップを構築（org スコープ）
      const clientIds = [...new Set(appos.map(a => a.client_id).filter(Boolean))]
      const clientMap: Record<string, string> = {}
      if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
          .from('clients')
          .select('id, name')
          .eq('org_id', orgId)
          .in('id', clientIds)
        if (clientsError) console.warn(`[notify-pre-check] org ${orgId} clients fetch warn:`, clientsError.message)
        for (const c of (clients || [])) clientMap[c.id] = c.name
      }

      // アポ取得者へのメンション（members.slack_user_id）。IDが無い人は名前のまま
      const getterNames = [...new Set(appos.map(a => a.getter_name).filter(Boolean))]
      const slackIdByName: Record<string, string> = {}
      if (getterNames.length > 0) {
        const { data: ms } = await supabase.from('members').select('name, slack_user_id')
          .eq('org_id', orgId).in('name', getterNames)
        for (const m of (ms || [])) if (m.slack_user_id) slackIdByName[m.name as string] = m.slack_user_id as string
      }
      const getterLabel = (name: string | null) => (name && slackIdByName[name]) ? `<@${slackIdByName[name]}>` : (name || '')

      // 日付ごとにグループ化
      const grouped: Record<string, typeof appos> = {}
      for (const a of appos) {
        const dateKey = (a.meeting_date as string)?.slice(0, 10) || ''
        if (!grouped[dateKey]) grouped[dateKey] = []
        grouped[dateKey].push(a)
      }

      const sections: string[] = []
      for (const day of targetDays) {
        if (!grouped[day.date]) continue
        sections.push(`【事前確認】${day.jp}（${day.label}）`)
        for (const a of grouped[day.date]) {
          const clientName = clientMap[a.client_id] || 'クライアント不明'
          sections.push(`・${a.company_name} / アポ取得者：${getterLabel(a.getter_name)} / クライアント：${clientName} / <${SPANAVI_URL}/?precheck=${a.id}|架電ページで開く>`)
          if (a.notes && (a.notes as string).trim()) {
            sections.push(`　備考：${(a.notes as string).trim()}`)
          }
        }
        sections.push('')
      }

      const text = sections.join('\n').trimEnd()
      if (dryRun) {
        // 確認用の返り値に社名は載せない（この関数は公開鍵でも呼べるため）。見出しと件数だけ
        previews.push({
          org_id: orgId,
          days: targetDays.filter(d => grouped[d.date]).map(d => ({ date: d.date, label: d.label, count: grouped[d.date].length })),
        })
        summary.push({ org_id: orgId, appoCount: appos.length, sent: false })
        continue
      }
      // ボットで投稿できる組織はボットで出す。投稿の識別番号（ts）と載せたアポを控え、
      // 事前確認ボタンの結果をこの投稿のスレッドに返信できるようにする。
      // ボットの設定が無い組織・ボットが失敗したときは、従来どおり Webhook で出す
      const botToken = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
      const { data: chRow } = await supabase.from('org_settings').select('setting_value')
        .eq('org_id', orgId).eq('setting_key', 'slack_channel_precheck').maybeSingle()
      const channelId = (chRow?.setting_value as string | null) || ''
      let posted = false
      if (botToken && channelId) {
        const botRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
        })
        const bot = await botRes.json().catch(() => ({}))
        if (bot.ok) {
          posted = true
          const { error: tsErr } = await supabase.from('precheck_slack_posts').insert({
            org_id: orgId, channel_id: channelId, ts: bot.ts, appointment_ids: appos.map(a => a.id),
          })
          if (tsErr) console.warn(`[notify-pre-check] org ${orgId} ts save warn:`, tsErr.message)
        } else {
          console.error(`[notify-pre-check] org ${orgId} Slack bot error:`, bot.error, '→ Webhookで送ります')
        }
      }
      if (!posted) {
        const slackRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!slackRes.ok) {
          const body = await slackRes.text()
          console.error(`[notify-pre-check] org ${orgId} Slack error:`, slackRes.status, body)
          summary.push({ org_id: orgId, appoCount: appos.length, sent: false })
          continue
        }
      }
      summary.push({ org_id: orgId, appoCount: appos.length, sent: true })
    }

    console.log('[notify-pre-check] 送信完了 | 対象日:', targetDates, '| summary:', summary)
    return new Response(
      JSON.stringify(dryRun ? { ok: true, dryRun, targetDates, summary, previews } : { ok: true, targetDates, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[notify-pre-check] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
