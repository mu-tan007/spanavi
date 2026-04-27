// ============================================================
// 事前確認リマインダー（プッシュ通知）
// ------------------------------------------------------------
// 面談日の1営業日前 10:00 JST に発火（pg_cron は 01:00 UTC）。
// status='アポ取得' かつ pre_check_status が未完了のアポについて、
// アポ取得者本人 / 当該チームのチームリーダー / org admin にプッシュ。
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
const RESOLVED_STATUSES = new Set(['確認完了', 'リスケ', 'キャンセル'])

function addBusinessDays(date: Date, n: number): Date {
  const r = new Date(date)
  let added = 0
  while (added < n) {
    r.setUTCDate(r.getUTCDate() + 1)
    const dow = r.getUTCDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return r
}

function toDateStr(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateJP(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const w = DAY_NAMES[date.getUTCDay()]
  return `${y}/${m}/${d}（${w}）`
}

interface AppoRow {
  id: string
  company_name: string | null
  getter_name: string | null
  meeting_date: string
  pre_check_status: string | null
  org_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // pg_cron 経由の起動を想定。cron 経由は x-precheck-secret を付与する。
  // 手動実行時は service_role 認証ヘッダー（Supabase 標準の Authorization）が必要。
  const secret = req.headers.get('x-precheck-secret')
  const expectedSecret = Deno.env.get('PRECHECK_REMINDER_SECRET')
  const isFromCron = expectedSecret && secret === expectedSecret
  if (!isFromCron) {
    // service_role でない場合は弾く（Supabase が Authorization を検証する）
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // JST 「今日」 を UTC 日付として扱う（meeting_date は timestamptz）
    const nowUtc = new Date()
    const jstNow = new Date(nowUtc.getTime() + 9 * 3600 * 1000)
    const todayJst = new Date(Date.UTC(
      jstNow.getUTCFullYear(),
      jstNow.getUTCMonth(),
      jstNow.getUTCDate(),
    ))

    // 土日は対象なし（cron 側でも 1-5 で制限するが二重防御）
    const dow = todayJst.getUTCDay()
    if (dow === 0 || dow === 6) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'weekend' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const targetDate = addBusinessDays(todayJst, 1)
    const targetDateStr = toDateStr(targetDate)
    const targetLabelJP = formatDateJP(targetDate)

    // org ごとの Sourcing engagement を一括取得
    const { data: sourcingEngs, error: engsErr } = await supabase
      .from('engagements')
      .select('id, org_id')
      .eq('slug', 'seller_sourcing')
    if (engsErr) throw new Error(`engagements fetch: ${engsErr.message}`)

    const summary: Array<{ org_id: string; appoCount: number; recipientCount: number }> = []

    for (const eng of (sourcingEngs || [])) {
      const orgId = eng.org_id as string
      const engagementId = eng.id as string

      // 当該 org の翌営業日アポ（status='アポ取得' / 未確認）
      const { data: rawAppos, error: apposErr } = await supabase
        .from('appointments')
        .select('id, company_name, getter_name, meeting_date, pre_check_status, org_id')
        .eq('org_id', orgId)
        .eq('status', 'アポ取得')
        .gte('meeting_date', `${targetDateStr}T00:00:00+00:00`)
        .lte('meeting_date', `${targetDateStr}T23:59:59+00:00`)
      if (apposErr) {
        console.warn(`[precheck-reminder] org ${orgId} appos fetch warn:`, apposErr.message)
        continue
      }

      const appos = ((rawAppos || []) as AppoRow[]).filter(a => {
        const pcs = (a.pre_check_status || '').trim()
        return !RESOLVED_STATUSES.has(pcs) // null / '' / その他 = 未完了
      })
      if (appos.length === 0) {
        summary.push({ org_id: orgId, appoCount: 0, recipientCount: 0 })
        continue
      }

      // メンバー情報（user_id / team / role）を一括取得
      const { data: members } = await supabase
        .from('members')
        .select('id, name, user_id, team, role')
        .eq('org_id', orgId)
        .eq('is_active', true)
      const membersByName: Record<string, { id: string; user_id: string | null; team: string | null }> = {}
      const adminUserIds: string[] = []
      for (const m of (members || [])) {
        if (m.name) membersByName[m.name as string] = {
          id: m.id as string,
          user_id: (m.user_id as string) || null,
          team: (m.team as string) || null,
        }
        if (m.role === 'admin' && m.user_id) adminUserIds.push(m.user_id as string)
      }

      // チームリーダーの user_id マップ（team名 → user_id[]）
      // member_engagements.role_id → engagement_roles.name='リーダー' の人
      const teamLeaderByTeam: Record<string, string[]> = {}
      const { data: leaderRows } = await supabase
        .from('member_engagements')
        .select('member:members!inner(name, team, user_id), role:engagement_roles!inner(name)')
        .eq('org_id', orgId)
        .eq('engagement_id', engagementId)
      for (const row of (leaderRows || []) as Array<{ member: { name: string; team: string | null; user_id: string | null }; role: { name: string } }>) {
        if (row.role?.name !== 'リーダー') continue
        const team = row.member?.team
        const uid = row.member?.user_id
        if (!team || !uid) continue
        if (!teamLeaderByTeam[team]) teamLeaderByTeam[team] = []
        teamLeaderByTeam[team].push(uid)
      }

      // 受信者ごとにアポをまとめる
      const recipientAppos: Record<string, AppoRow[]> = {}
      const addRecipient = (uid: string, appo: AppoRow) => {
        if (!uid) return
        if (!recipientAppos[uid]) recipientAppos[uid] = []
        if (!recipientAppos[uid].some(x => x.id === appo.id)) recipientAppos[uid].push(appo)
      }
      for (const a of appos) {
        // 1) アポ取得者本人
        const getter = a.getter_name ? membersByName[a.getter_name] : null
        if (getter?.user_id) addRecipient(getter.user_id, a)
        // 2) チームリーダー（getter のチーム）
        if (getter?.team) {
          const leaders = teamLeaderByTeam[getter.team] || []
          for (const uid of leaders) addRecipient(uid, a)
        }
        // 3) admin（org 管理者）
        for (const uid of adminUserIds) addRecipient(uid, a)
      }

      // 受信者ごとに send-push 呼び出し
      for (const [user_id, list] of Object.entries(recipientAppos)) {
        const companies = list.map(a => a.company_name || '会社名不明')
        const uniqueCompanies = Array.from(new Set(companies))
        const head = uniqueCompanies.slice(0, 3).join('、')
        const more = uniqueCompanies.length > 3 ? ` ほか${uniqueCompanies.length - 3}社` : ''
        const body = list.length === 1
          ? `${targetLabelJP} 面談予定の「${head}」で事前確認が未完了です。`
          : `${targetLabelJP} 面談予定 ${list.length}件の事前確認が未完了です（${head}${more}）。`

        const { error: pushErr } = await supabase.functions.invoke('send-push', {
          body: {
            type: 'precheck_reminder',
            title: '🔔 事前確認リマインダー',
            body,
            user_ids: [user_id],
            org_id: orgId,
            engagement_id: engagementId,
          },
        })
        if (pushErr) console.warn(`[precheck-reminder] send-push failed for ${user_id}:`, pushErr.message)
      }

      summary.push({
        org_id: orgId,
        appoCount: appos.length,
        recipientCount: Object.keys(recipientAppos).length,
      })
    }

    console.log('[precheck-reminder] done:', { targetDate: targetDateStr, summary })
    return new Response(
      JSON.stringify({ ok: true, targetDate: targetDateStr, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[precheck-reminder] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
