// ============================================================
// 1営業日前の夕方に、事前確認が終わっていないアポを拾う（pg_cron・平日）
// ------------------------------------------------------------
//   mode: 'remind'（17時）… #事前確認 の朝の通知のスレッドで、アポ取得者とチームリーダーにメンションして催促
//   mode: 'report'（19時）… まだ終わっていなければ precheck_events に「未完了」を1行入れる。
//                            文面の作成・Gmail の返信下書き・スレッドへの返信は process-precheck-events が行う
// 対象は「翌日〜次の営業日」が面談日で、アポが「アポ取得」のまま（確認完了・リスケ・キャンセルになっていない）もの。
// 土日・祝日は動かない。
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadJpHolidays, listDaysThroughBusinessDay, isBusinessDay, formatDateJP } from '../_shared/jpBusinessDays.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SPANAVI_URL = 'https://spanavi.jp'
const AUTO_CALLER = 'Spanavi（自動）'

interface Appo {
  id: string; org_id: string; item_id: string | null; company_name: string | null; getter_name: string | null
  client_id: string | null; meeting_date: string; meeting_time: string | null; pre_check_status: string | null
}

async function orgSetting(sb: SupabaseClient, orgId: string, key: string): Promise<string> {
  const { data } = await sb.from('org_settings').select('setting_value').eq('org_id', orgId).eq('setting_key', key).maybeSingle()
  return (data?.setting_value as string) || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: { mode?: string; dry_run?: boolean; today?: string } = {}
  try { body = await req.json() } catch { /* 空 */ }
  const mode = body.mode === 'report' ? 'report' : 'remind'
  // dry_run は件数だけ返す（公開鍵でも呼べるため社名は返さない）
  const dryRun = body.dry_run === true

  const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const today = new Date(((dryRun && /^\d{4}-\d{2}-\d{2}$/.test(body.today || '')) ? body.today : jstNow.toISOString().slice(0, 10)) + 'T00:00:00Z')
  const holidays = await loadJpHolidays()
  if (!isBusinessDay(today, holidays)) return json({ ok: true, skipped: 'holiday' })

  const days = listDaysThroughBusinessDay(today, 1, holidays).slice(1)
  const from = days[0].date
  const to = days[days.length - 1].date

  const { data: rows, error } = await sb.from('appointments')
    .select('id, org_id, item_id, company_name, getter_name, client_id, meeting_date, meeting_time, pre_check_status')
    .eq('status', 'アポ取得')
    .gte('meeting_date', `${from}T00:00:00+00:00`)
    .lte('meeting_date', `${to}T23:59:59+00:00`)
    .order('meeting_date')
  if (error) return json({ error: error.message }, 500)
  const appos = ((rows || []) as Appo[]).filter(a => (a.pre_check_status || '') !== '確認完了')

  if (dryRun) return json({ ok: true, mode, dates: days.map(d => d.date), count: appos.length })
  if (appos.length === 0) return json({ ok: true, mode, count: 0 })

  /* ---------- 19時：未完了の報告 ---------- */
  if (mode === 'report') {
    const startOfToday = new Date(today.getTime() - 9 * 3600 * 1000).toISOString() // JSTの今日0時
    let created = 0
    for (const a of appos) {
      // 同じ日に2回作らない
      const { data: dup } = await sb.from('precheck_events').select('id')
        .eq('appointment_id', a.id).eq('result', '未完了').gte('created_at', startOfToday).limit(1)
      if (dup && dup.length) continue
      const { error: insErr } = await sb.from('precheck_events').insert({
        org_id: a.org_id, appointment_id: a.id, item_id: a.item_id, result: '未完了',
        caller_name: AUTO_CALLER, recording_status: 'none', draft_status: 'pending', slack_status: 'pending',
      })
      if (insErr) console.error('[precheck-evening] insert', a.id, insErr.message)
      else created++
    }
    return json({ ok: true, mode, count: appos.length, created })
  }

  /* ---------- 17時：催促 ---------- */
  const token = Deno.env.get('SLACK_BOT_TOKEN')?.trim()
  if (!token) return json({ error: 'SLACK_BOT_TOKEN がありません' }, 500)

  // 組織ごと・朝の通知のスレッドごとにまとめて1回だけ返信する
  const byOrg: Record<string, Appo[]> = {}
  for (const a of appos) (byOrg[a.org_id] ||= []).push(a)

  let posted = 0
  for (const [orgId, list] of Object.entries(byOrg)) {
    const channel = await orgSetting(sb, orgId, 'slack_channel_precheck')
    if (!channel) continue

    // メンション先：アポ取得者と、その人のチームのリーダー
    const names = [...new Set(list.map(a => a.getter_name).filter(Boolean))] as string[]
    const { data: ms } = await sb.from('members').select('id, name, team, slack_user_id').eq('org_id', orgId).in('name', names)
    const memberByName: Record<string, { team: string | null; slack: string | null }> = {}
    for (const m of (ms || [])) memberByName[m.name as string] = { team: m.team as string | null, slack: m.slack_user_id as string | null }
    const { data: leaders } = await sb.from('member_engagements')
      .select('member:members!inner(name, team, slack_user_id), role:engagement_roles!inner(name)')
      .eq('org_id', orgId).eq('role.name', 'リーダー')
    const leaderByTeam: Record<string, string> = {}
    for (const l of (leaders || []) as Array<{ member: { team: string | null; slack_user_id: string | null } }>) {
      if (l.member?.team && l.member?.slack_user_id) leaderByTeam[l.member.team] = l.member.slack_user_id
    }
    const at = (id: string | null | undefined, fallback: string) => id ? `<@${id}>` : fallback

    // 朝の通知の投稿（その日いちばん新しいもの）ごとにまとめる
    const groups: Record<string, Appo[]> = {}
    for (const a of list) {
      const { data: post } = await sb.from('precheck_slack_posts').select('ts')
        .eq('org_id', orgId).eq('channel_id', channel).contains('appointment_ids', [a.id])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      ;(groups[post?.ts || ''] ||= []).push(a)
    }

    for (const [threadTs, items] of Object.entries(groups)) {
      const lines = ['【17時時点で事前確認が未完了です】19時までに確認できなければ、クライアントへ「未完了」の報告を出します。']
      for (const a of items) {
        const m = a.getter_name ? memberByName[a.getter_name] : null
        const leader = m?.team ? leaderByTeam[m.team] : null
        const mentions = [at(m?.slack, a.getter_name || ''), leader && leader !== m?.slack ? `<@${leader}>` : ''].filter(Boolean).join(' ')
        const meet = formatDateJP(new Date(a.meeting_date.slice(0, 10) + 'T00:00:00Z')) + (a.meeting_time ? ` ${a.meeting_time}〜` : '')
        lines.push(`・${a.company_name} ／ 面談 ${meet} ／ ${mentions} ／ <${SPANAVI_URL}/?precheck=${a.id}|集中モードで開く>`)
      }
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel, text: lines.join('\n'), ...(threadTs ? { thread_ts: threadTs } : {}), unfurl_links: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) posted++
      else console.error('[precheck-evening] Slack error:', data.error)
    }
  }
  return json({ ok: true, mode, count: appos.length, posted })
})
