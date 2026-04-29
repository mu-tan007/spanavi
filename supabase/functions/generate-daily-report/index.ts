// ============================================================
// Daily Report 生成 Edge Function
// ------------------------------------------------------------
// 平日 18:00 JST に pg_cron からキックされる。
// Sourcing 事業の各チームについて当日の活動をサマリし、
// daily_reports テーブルに保存 + 事業所属メンバー全員に push 通知。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CONNECT_STATUSES = new Set(['社長再コール', 'アポ獲得', '社長お断り'])
const APPO_STATUS = 'アポ獲得'
const REJECT_STATUS = '社長お断り'

interface CallRow {
  id: string
  caller_id: string | null
  getter_name: string | null
  list_id: string | null
  item_id: string | null
  status: string | null
  called_at: string
  recording_url: string | null
  rejection_reason: string | null
}

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  return j.toISOString().slice(0, 10)
}

function jstHour(iso: string): number {
  const t = new Date(iso).getTime() + 9 * 3600 * 1000
  return new Date(t).getUTCHours()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // pg_cron 経由は x-daily-report-secret ヘッダで認証
  const secret = req.headers.get('x-daily-report-secret')
  const expected = Deno.env.get('DAILY_REPORT_SECRET')
  const isFromCron = expected && secret === expected
  if (!isFromCron) {
    // service_role JWT が来てる前提（Supabase 標準検証）
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 手動リラン用: body.target_date (YYYY-MM-DD JST) が来たらその日付で再生成。
    // 平日チェックや cron 認証は維持する。
    let overrideDate: string | null = null
    try {
      const body = await req.clone().json()
      if (body && typeof body.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.target_date)) {
        overrideDate = body.target_date
      }
    } catch { /* no body or non-JSON: ignore */ }

    const today = new Date()
    const targetDate = overrideDate || jstDateStr(today)

    // 平日のみ実行（保険）
    const dow = new Date(targetDate + 'T00:00:00Z').getUTCDay()
    if (dow === 0 || dow === 6) {
      return new Response(JSON.stringify({ ok: true, skipped: 'weekend', targetDate }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dayStart = `${targetDate}T00:00:00+09:00`
    const dayEnd = `${targetDate}T23:59:59+09:00`

    // Sourcing 事業
    const { data: engs } = await supabase
      .from('engagements').select('id, org_id')
      .eq('slug', 'seller_sourcing')
    if (!engs || engs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'no sourcing engagement' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const summary: any[] = []

    for (const eng of engs) {
      const orgId = eng.org_id as string
      const engagementId = eng.id as string

      // org の全メンバー（id, name, team で後でグルーピング用）
      const { data: members } = await supabase
        .from('members').select('id, name, user_id, team, avatar_url')
        .eq('org_id', orgId).eq('is_active', true)
      const memberById: Record<string, any> = {}
      const memberByName: Record<string, any> = {}
      ;(members || []).forEach(m => {
        memberById[m.id as string] = m
        if (m.name) memberByName[m.name as string] = m
      })

      // teams (active)
      const { data: teams } = await supabase
        .from('teams').select('id, name')
        .eq('org_id', orgId).eq('engagement_id', engagementId).eq('status', 'active')
        .order('display_order')

      // team_members (active)
      const { data: tmRows } = await supabase
        .from('team_members').select('team_id, member_id')
        .eq('org_id', orgId).is('left_at', null)
      const teamIdByMember: Record<string, string> = {}
      ;(tmRows || []).forEach(r => { teamIdByMember[r.member_id as string] = r.team_id as string })

      // 当日の call_records 全件
      // PostgREST のデフォルト 1000 行リミットで取り漏らすと
      // メンバー別の架電/アポ集計が壊れるため必ずページングする。
      const PAGE_SIZE = 1000
      const callsRawAll: any[] = []
      for (let pageFrom = 0; ; pageFrom += PAGE_SIZE) {
        const { data: page, error: pageErr } = await supabase
          .from('call_records')
          .select('id, caller_id, getter_name, list_id, item_id, status, called_at, recording_url, rejection_reason')
          .eq('org_id', orgId)
          .gte('called_at', dayStart)
          .lte('called_at', dayEnd)
          .order('called_at', { ascending: true })
          .range(pageFrom, pageFrom + PAGE_SIZE - 1)
        if (pageErr) {
          console.error('[daily-report] call_records page fetch error', pageFrom, pageErr)
          break
        }
        const rows = page || []
        callsRawAll.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }
      const callsRaw = callsRawAll
      console.log(`[daily-report] call_records fetched=${callsRaw.length} for ${targetDate}`)
      // caller_id が NULL の場合 getter_name で member を解決して補完
      const calls = ((callsRaw || []) as CallRow[]).map(c => {
        if (c.caller_id) return c
        if (c.getter_name) {
          const m = (members || []).find((mm: any) => mm.name === c.getter_name)
          if (m) return { ...c, caller_id: m.id as string }
        }
        return c
      })

      // 当日の appointments（売上）
      // 注: 当面は engagement_id でフィルタしない（既存データに NULL が混在しており
      // org_id だけで Sourcing 由来として扱う運用）
      const { data: appos } = await supabase
        .from('appointments')
        .select('id, getter_name, sales_amount, status, created_at')
        .eq('org_id', orgId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)

      // call_lists（リスト名）— PostgREST URL 長と max-rows 回避のため 100 件ずつチャンク
      const CHUNK = 100
      const listIds = Array.from(new Set(calls.map(c => c.list_id).filter(Boolean) as string[]))
      const listMap: Record<string, string> = {}
      for (let i = 0; i < listIds.length; i += CHUNK) {
        const chunk = listIds.slice(i, i + CHUNK)
        const { data: lists, error: lErr } = await supabase
          .from('call_lists').select('id, name').in('id', chunk)
        if (lErr) console.error('[daily-report] list fetch err', i, lErr)
        ;(lists || []).forEach(l => { listMap[l.id as string] = l.name as string })
      }
      console.log(`[daily-report] listMap size=${Object.keys(listMap).length} for ${listIds.length} ids`)

      // call_list_items
      const itemIds = Array.from(new Set(calls.map(c => c.item_id).filter(Boolean) as string[]))
      const itemMap: Record<string, { no: number; company: string; list_id: string }> = {}
      for (let i = 0; i < itemIds.length; i += CHUNK) {
        const chunk = itemIds.slice(i, i + CHUNK)
        const { data: items, error: iErr } = await supabase
          .from('call_list_items').select('id, no, company, list_id').in('id', chunk)
        if (iErr) console.error('[daily-report] item fetch err', i, iErr)
        ;(items || []).forEach(it => {
          itemMap[it.id as string] = {
            no: Number(it.no || 0),
            company: it.company as string || '',
            list_id: it.list_id as string,
          }
        })
      }
      console.log(`[daily-report] itemMap size=${Object.keys(itemMap).length} for ${itemIds.length} ids`)

      // shifts（当日）
      const { data: shifts } = await supabase
        .from('shifts').select('member_id, member_name, start_time, end_time')
        .eq('org_id', orgId).eq('shift_date', targetDate)

      // チームリーダー (engagement_roles.name='リーダー') を抽出 ─ シフト未稼働ピックから除外する
      const { data: leaderRows } = await supabase
        .from('member_engagements')
        .select('member_id, role:engagement_roles!inner(name)')
        .eq('org_id', orgId).eq('engagement_id', engagementId)
      const leaderMemberIds = new Set(
        ((leaderRows || []) as Array<{ member_id: string; role: { name: string } }>)
          .filter(r => r.role?.name === 'リーダー')
          .map(r => r.member_id)
      )

      // チームごとに集計
      for (const team of (teams || [])) {
        const teamId = team.id as string
        const teamName = team.name as string
        const teamMemberIds = Object.entries(teamIdByMember)
          .filter(([, tid]) => tid === teamId)
          .map(([mid]) => mid)
        const teamMemberSet = new Set(teamMemberIds)

        // チーム内の calls
        const teamCalls = calls.filter(c => c.caller_id && teamMemberSet.has(c.caller_id))

        // メンバー別集計
        const memberStats: Record<string, any> = {}
        for (const mid of teamMemberIds) {
          memberStats[mid] = {
            member_id: mid,
            name: memberById[mid]?.name || '',
            avatar_url: memberById[mid]?.avatar_url || null,
            calls: 0,
            connects: 0,
            appointments: 0,
            sales: 0,
            rejection_recordings: [] as any[],
            appo_recordings: [] as any[],
            // 集計用: list_id -> [no, no, ...]
            _list_nos: {} as Record<string, number[]>,
          }
        }

        for (const c of teamCalls) {
          const mid = c.caller_id!
          const ms = memberStats[mid]
          if (!ms) continue
          ms.calls++
          if (c.status && CONNECT_STATUSES.has(c.status)) ms.connects++
          if (c.status === APPO_STATUS) {
            ms.appointments++
            if (c.recording_url) {
              ms.appo_recordings.push({
                id: c.id,
                company: itemMap[c.item_id || '']?.company || '',
                called_at: c.called_at,
                recording_url: c.recording_url,
              })
            }
          }
          if (c.status === REJECT_STATUS && c.recording_url) {
            ms.rejection_recordings.push({
              id: c.id,
              company: itemMap[c.item_id || '']?.company || '',
              called_at: c.called_at,
              recording_url: c.recording_url,
              reason: c.rejection_reason || '',
            })
          }
          // 架電範囲（item の no）
          if (c.list_id && c.item_id && itemMap[c.item_id]) {
            const lno = ms._list_nos[c.list_id] || []
            lno.push(itemMap[c.item_id].no)
            ms._list_nos[c.list_id] = lno
          }
        }

        // 売上: status='アポ取得' は加算、'リスケ中'/'キャンセル' は控除
        const SALES_POSITIVE = new Set(['アポ取得'])
        const SALES_NEGATIVE = new Set(['リスケ中', 'キャンセル'])
        for (const a of (appos || []) as Array<{ getter_name: string | null; sales_amount: number | null; status: string | null }>) {
          if (!a.getter_name) continue
          const m = memberByName[a.getter_name]
          if (!m) continue
          const ms = memberStats[m.id]
          if (!ms || !teamMemberSet.has(m.id)) continue
          const amt = Number(a.sales_amount || 0)
          if (SALES_POSITIVE.has(a.status || '')) ms.sales += amt
          else if (SALES_NEGATIVE.has(a.status || '')) ms.sales -= amt
        }

        // 各メンバーの call_ranges を整形
        const memberArr = Object.values(memberStats).map((ms: any) => {
          const ranges = Object.entries(ms._list_nos as Record<string, number[]>).map(([lid, nos]) => {
            const sorted = (nos as number[]).sort((a, b) => a - b)
            return {
              list_id: lid,
              list_name: listMap[lid] || '不明リスト',
              start_no: sorted[0],
              end_no: sorted[sorted.length - 1],
              count: sorted.length,
            }
          })
          delete ms._list_nos
          return {
            ...ms,
            call_ranges: ranges,
            connect_rate: ms.calls > 0 ? +(ms.connects / ms.calls * 100).toFixed(1) : 0,
            appointment_rate: ms.connects > 0 ? +(ms.appointments / ms.connects * 100).toFixed(1) : 0,
          }
        })

        // 稼働メンバーのみ（1件以上架電）
        const activeMembers = memberArr.filter((m: any) => m.calls > 0)

        // チーム KPI
        const teamCallsTotal = activeMembers.reduce((s, m: any) => s + m.calls, 0)
        const teamConnects = activeMembers.reduce((s, m: any) => s + m.connects, 0)
        const teamAppos = activeMembers.reduce((s, m: any) => s + m.appointments, 0)
        const teamSales = activeMembers.reduce((s, m: any) => s + m.sales, 0)

        const kpi = {
          active_members: activeMembers.length,
          calls: teamCallsTotal,
          ceo_connects: teamConnects,
          appointments: teamAppos,
          ceo_connect_rate: teamCallsTotal > 0 ? +(teamConnects / teamCallsTotal * 100).toFixed(1) : 0,
          appointment_rate: teamConnects > 0 ? +(teamAppos / teamConnects * 100).toFixed(1) : 0,
          sales: teamSales,
        }

        // 時間別架電/接続/アポ（チーム）
        const hourlyCalls: Record<number, number> = {}
        const hourlyConnects: Record<number, number> = {}
        const hourlyAppos: Record<number, number> = {}
        for (let h = 7; h <= 21; h++) {
          hourlyCalls[h] = 0; hourlyConnects[h] = 0; hourlyAppos[h] = 0
        }
        for (const c of teamCalls) {
          const h = jstHour(c.called_at)
          hourlyCalls[h] = (hourlyCalls[h] || 0) + 1
          if (c.status && CONNECT_STATUSES.has(c.status)) hourlyConnects[h] = (hourlyConnects[h] || 0) + 1
          if (c.status === APPO_STATUS) hourlyAppos[h] = (hourlyAppos[h] || 0) + 1
        }
        const hourly_calls = Object.keys(hourlyCalls).map(h => ({
          hour: Number(h),
          count: hourlyCalls[Number(h)],
          connects: hourlyConnects[Number(h)] || 0,
          appointments: hourlyAppos[Number(h)] || 0,
        })).sort((a, b) => a.hour - b.hour)

        // リスト別集計
        const listAgg: Record<string, any> = {}
        for (const c of teamCalls) {
          if (!c.list_id) continue
          if (!listAgg[c.list_id]) listAgg[c.list_id] = {
            list_id: c.list_id,
            list_name: listMap[c.list_id] || '不明リスト',
            calls: 0, connects: 0, appointments: 0,
          }
          const a = listAgg[c.list_id]
          a.calls++
          if (c.status && CONNECT_STATUSES.has(c.status)) a.connects++
          if (c.status === APPO_STATUS) a.appointments++
        }
        const list_breakdown = Object.values(listAgg).map((a: any) => ({
          ...a,
          connect_rate: a.calls > 0 ? +(a.connects / a.calls * 100).toFixed(1) : 0,
          appointment_rate: a.connects > 0 ? +(a.appointments / a.connects * 100).toFixed(1) : 0,
        })).sort((a: any, b: any) => b.calls - a.calls)

        // コーチングピック（稼働メンバーのみ対象）+ 閾値も payload に保存
        const teamCallPerHourAvg = activeMembers.length > 0
          ? activeMembers.reduce((s, m: any) => s + m.calls, 0) / activeMembers.length / 6
          : 0
        const teamConnectRateAvg = teamCallsTotal > 0 ? teamConnects / teamCallsTotal : 0

        const coaching_picks = {
          team_call_per_hour_avg: +teamCallPerHourAvg.toFixed(1),
          team_connect_rate_avg: +(teamConnectRateAvg * 100).toFixed(1),
          low_calls_per_hour: activeMembers
            .filter((m: any) => (m.calls / 6) < teamCallPerHourAvg * 0.7)
            .map((m: any) => ({ member_id: m.member_id, name: m.name, calls_per_hour: +(m.calls / 6).toFixed(1) })),
          low_connect_rate: activeMembers
            .filter((m: any) => m.calls >= 20 && (m.connects / m.calls) < teamConnectRateAvg * 0.7)
            .map((m: any) => ({ member_id: m.member_id, name: m.name, connect_rate: m.connect_rate })),
          zero_appointments: activeMembers
            .filter((m: any) => m.calls >= 20 && m.appointments === 0)
            .map((m: any) => ({ member_id: m.member_id, name: m.name, calls: m.calls })),
        }

        // シフト提出済み + 架電 0 件
        const shifted_member_ids = new Set((shifts || [])
          .filter((s: any) => s.member_id && teamMemberSet.has(s.member_id))
          .map((s: any) => s.member_id as string))
        const active_member_ids = new Set(activeMembers.map((m: any) => m.member_id))
        const shift_no_call = Array.from(shifted_member_ids)
          .filter(id => !active_member_ids.has(id))
          .filter(id => !leaderMemberIds.has(id)) // リーダーは管理業務専念のため除外
          .filter(id => memberById[id])           // 退職者 (is_active=false) を除外
          .map(id => {
            const sh = (shifts || []).find((s: any) => s.member_id === id)
            return {
              member_id: id,
              name: memberById[id]?.name || sh?.member_name || '不明',
              shift_start: sh?.start_time || null,
              shift_end: sh?.end_time || null,
            }
          })

        const payload = {
          team: { id: teamId, name: teamName },
          kpi,
          members: activeMembers,
          coaching_picks,
          shift_no_call,
          list_breakdown,
          hourly_calls,
        }

        // upsert
        const { error: upErr } = await supabase
          .from('daily_reports')
          .upsert({
            org_id: orgId,
            engagement_id: engagementId,
            team_id: teamId,
            team_name: teamName,
            report_date: targetDate,
            payload,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'engagement_id,team_id,report_date' })
        if (upErr) console.error('[daily-report] upsert error', teamName, upErr)
        summary.push({ team: teamName, calls: kpi.calls, appointments: kpi.appointments, members: activeMembers.length })
      }

      // 全社サマリ（org_id+engagement_id+team_id=NULL の "all teams" レポート行も保存）
      // → 後で UI 側で「全体」ビューを出す場合に活用
      // 省略可能。今回は team 単位のみ。

      // 手動リランの場合は通知をスキップ（"本日" メッセージが過去日付を指して紛らわしいため）
      if (overrideDate) {
        continue
      }

      // Sourcing 全員に通知
      const { data: assignments } = await supabase
        .from('member_engagements')
        .select('member:members!inner(user_id)')
        .eq('org_id', orgId).eq('engagement_id', engagementId)
      const userIds = ((assignments || []) as any[])
        .map(a => a.member?.user_id).filter(Boolean) as string[]

      if (userIds.length > 0) {
        const totalAppos = summary.reduce((s, t) => s + (t.appointments || 0), 0)
        const totalCalls = summary.reduce((s, t) => s + (t.calls || 0), 0)
        const body = `本日: 架電 ${totalCalls} / アポ ${totalAppos}件。Library に詳細を格納しました。`

        // 1) アプリ内通知 inbox に直接 INSERT（必ず成功させる）
        const inboxRows = userIds.map(uid => ({
          org_id: orgId,
          user_id: uid,
          type: 'daily_report',
          title: 'デイリーレポート',
          body,
          link: '/sourcing/library?card=daily_report',
          data: { report_date: targetDate },
        }))
        const { error: ibErr } = await supabase.from('notifications').insert(inboxRows)
        if (ibErr) console.error('[daily-report] inbox insert error:', ibErr.message)

        // 2) プッシュ通知（best-effort、送信失敗しても inbox は確保済み）
        try {
          await supabase.functions.invoke('send-push', {
            body: {
              type: 'daily_report',
              title: 'デイリーレポート',
              body,
              user_ids: userIds,
              org_id: orgId,
              engagement_id: engagementId,
              link: '/sourcing/library?card=daily_report',
              data: { report_date: targetDate },
            },
          })
        } catch (pushErr) {
          console.warn('[daily-report] push invoke failed:', pushErr)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, targetDate, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[generate-daily-report] Unhandled:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
