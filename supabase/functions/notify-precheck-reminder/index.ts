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

    // 通知種類カタログのデフォルトを 1 回取得
    const { data: catalogRow } = await supabase
      .from('notification_type_catalog')
      .select('default_recipients_scope, is_active')
      .eq('id', 'precheck_reminder')
      .maybeSingle()
    const catalogActive = catalogRow?.is_active !== false
    const catalogDefaultScope = catalogRow?.default_recipients_scope || 'getter_and_team_and_admin'

    for (const eng of (sourcingEngs || [])) {
      const orgId = eng.org_id as string
      const engagementId = eng.id as string

      // 組織側の通知ルール
      const { data: orgRule } = await supabase
        .from('engagement_notification_settings')
        .select('enabled, recipients_scope')
        .eq('engagement_id', engagementId)
        .eq('notification_type', 'precheck_reminder')
        .maybeSingle()
      let scope: string
      if (orgRule) {
        if (orgRule.enabled === false) {
          summary.push({ org_id: orgId, appoCount: 0, recipientCount: 0 })
          continue
        }
        scope = orgRule.recipients_scope as string
      } else {
        if (!catalogActive) {
          summary.push({ org_id: orgId, appoCount: 0, recipientCount: 0 })
          continue
        }
        scope = catalogDefaultScope
      }

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

      // 事業所属者（user_id / team / engagement_role.name）
      const { data: assignments } = await supabase
        .from('member_engagements')
        .select('member:members!inner(id, name, user_id, team), role:engagement_roles(name)')
        .eq('org_id', orgId)
        .eq('engagement_id', engagementId)
      const allMembers: Array<{ user_id: string; name: string; team: string | null; role_name: string | null }> = []
      const membersByName: Record<string, { user_id: string | null; team: string | null }> = {}
      for (const a of (assignments || []) as Array<{ member: { id: string; name: string; user_id: string | null; team: string | null }; role: { name: string } | null }>) {
        const uid = a.member?.user_id || null
        const name = a.member?.name || ''
        const team = a.member?.team || null
        const role_name = a.role?.name || null
        if (uid) allMembers.push({ user_id: uid, name, team, role_name })
        if (name) membersByName[name] = { user_id: uid, team }
      }

      // admin (public.users.role='admin')
      const { data: adminUsers } = await supabase
        .from('users')
        .select('id')
        .eq('org_id', orgId)
        .eq('role', 'admin')
      const adminUserIds = (adminUsers || []).map(u => u.id as string).filter(Boolean)

      // 受信者ごとにアポをまとめる
      const recipientAppos: Record<string, AppoRow[]> = {}
      const addRecipient = (uid: string | null | undefined, appo: AppoRow) => {
        if (!uid) return
        if (!recipientAppos[uid]) recipientAppos[uid] = []
        if (!recipientAppos[uid].some(x => x.id === appo.id)) recipientAppos[uid].push(appo)
      }

      for (const a of appos) {
        const getter = a.getter_name ? membersByName[a.getter_name] : null

        if (scope === 'admin_only') {
          for (const uid of adminUserIds) addRecipient(uid, a)
        } else if (scope === 'all_engagement_members') {
          for (const m of allMembers) addRecipient(m.user_id, a)
          for (const uid of adminUserIds) addRecipient(uid, a)
        } else if (scope === 'team_leaders_and_above') {
          for (const m of allMembers) {
            if (m.role_name === 'リーダー') addRecipient(m.user_id, a)
          }
          for (const uid of adminUserIds) addRecipient(uid, a)
        } else {
          // getter_and_team_and_admin (default)
          if (getter?.user_id) addRecipient(getter.user_id, a)
          if (getter?.team) {
            for (const m of allMembers) {
              if (m.team === getter.team && m.role_name === 'リーダー') addRecipient(m.user_id, a)
            }
          }
          for (const uid of adminUserIds) addRecipient(uid, a)
        }
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
            title: '事前確認リマインダー',
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
