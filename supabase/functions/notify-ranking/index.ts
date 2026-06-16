import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 集計対象 org（M&Aソーシング・パートナーズ本番）。
// 注意: この関数は service_role で動くため RLS が効かない。org を明示しないと
//       他テナント（例: 「Spanavi デモ」org のダミーデータ）が混入する。
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // JST の現在時刻を計算（日本はDST無し、常にUTC+9）
    const nowUtc = new Date()
    const jstOffset = 9 * 60 * 60 * 1000
    const jstNow = new Date(nowUtc.getTime() + jstOffset)

    // JST での今日の開始・終了（UTC ISO）
    const jstDateStr = jstNow.toISOString().slice(0, 10) // 'YYYY-MM-DD'
    const todayStartUtc = new Date(jstDateStr + 'T00:00:00+09:00').toISOString()
    const todayEndUtc   = new Date(jstDateStr + 'T23:59:59+09:00').toISOString()

    // 当日の個人別パフォーマンスを取得。
    // スパナビ アナリティクス画面と同一の集計（perf_ranking）を org 指定で呼ぶことで
    // 「架電件数 / キーマン接続数 / アポ取得数」を画面と完全一致させる。
    //   calls          = 当日の架電件数
    //   keyman_connect = org_settings のキーマン接続ラベルに該当する架電数
    //   appo           = 当日に作成された appointments 件数（アポ取得数）
    type RankRow = { getter_name: string; calls: number; keyman_connect: number; appo: number }
    const { data: rankData, error: rankErr } = await supabase.rpc('perf_ranking_org', {
      p_from: todayStartUtc,
      p_to: todayEndUtc,
      p_org: ORG_ID,
    })
    if (rankErr) throw new Error(`perf_ranking_org error: ${rankErr.message}`)
    const rows = (rankData || []) as RankRow[]

    // ランキング取得ヘルパー
    type RankKey = 'calls' | 'keyman_connect' | 'appo'
    const rankBy = (key: RankKey, limit: number | null): RankRow[] => {
      const sorted = rows
        .filter(r => (r[key] || 0) > 0)
        .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      return limit === null ? sorted : sorted.slice(0, limit)
    }

    const formatSection = (entries: RankRow[], key: RankKey, unit = '件'): string => {
      if (entries.length === 0) return '該当なし'
      return entries.map((r, i) => `${i + 1}. ${r.getter_name} — ${r[key]}${unit}`).join('\n')
    }

    const jstHour = jstNow.getUTCHours()
    const jstMin  = jstNow.getUTCMinutes()
    const timeStr = `${String(jstHour).padStart(2, '0')}:${String(jstMin).padStart(2, '0')}`

    const callEntries = rankBy('calls', null) // 1件以上全員
    const lines = [
      `📊 本日の架電ランキング（${timeStr}時点）`,
      '',
      `🔥 架電件数（全${callEntries.length}名）`,
      formatSection(callEntries, 'calls'),
      '',
      '📞 キーマン接続数 TOP3',
      formatSection(rankBy('keyman_connect', 3), 'keyman_connect'),
      '',
      '🎯 アポ取得数 TOP3',
      formatSection(rankBy('appo', 3), 'appo'),
    ]

    // 今月の売上 TOP5 を毎回追加（架電件数 / キーマン接続数 / アポ取得数と同様に常時通知）。
    // 当社売上ランキング（当月）。スパナビ SalesRanking.jsx / salesPeriod.js と同一定義を
    // notify_sales_ranking_org で再現する（面談実施日=meeting_date が当月、面談済/事前確認済/
    // アポ取得、クライアント開拓リスト除外、月全体）。
    {
      const monthStr = jstDateStr.slice(0, 7) // 'YYYY-MM'
      type SalesRow = { getter_name: string; sales: number; appo: number }
      const { data: salesData, error: salesErr } = await supabase.rpc('notify_sales_ranking_org', {
        p_org: ORG_ID,
        p_month: monthStr,
      })
      if (salesErr) throw new Error(`notify_sales_ranking_org error: ${salesErr.message}`)
      const top5 = ((salesData || []) as SalesRow[]).slice(0, 5)

      const monthLabel = `${parseInt(jstDateStr.slice(5, 7), 10)}月`
      const fmtYen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')
      lines.push('')
      lines.push(`💰 今月（${monthLabel}）面談実施分 売上ランキング TOP5`)
      if (top5.length === 0) {
        lines.push('該当なし')
      } else {
        lines.push(...top5.map((r, i) => `${i + 1}. ${r.getter_name} — ${fmtYen(Number(r.sales || 0))}`))
      }
    }

    const text = lines.join('\n')

    // org_settings から Webhook URL を取得（なければ env var にフォールバック）
    const { data: orgSetting } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', ORG_ID)
      .eq('setting_key', 'slack_webhook_ranking')
      .maybeSingle()
    const webhookUrl = (orgSetting?.setting_value && orgSetting.setting_value.startsWith('http'))
      ? orgSetting.setting_value
      : Deno.env.get('SLACK_RANKING_WEBHOOK_URL')
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'SLACK_RANKING_WEBHOOK_URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!slackRes.ok) {
      const body = await slackRes.text()
      console.error('[notify-ranking] Slack webhook error:', slackRes.status, body)
      return new Response(
        JSON.stringify({ ok: false, error: body }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[notify-ranking] posted at JST', timeStr, '/ getters:', rows.length)
    return new Response(
      JSON.stringify({ ok: true, timeStr, getterCount: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[notify-ranking] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
