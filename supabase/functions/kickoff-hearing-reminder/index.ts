// ============================================================
// kickoff-hearing-reminder
// ----------------------------------------------------------------
// 第1回前70問キックオフヒアリングの 72h期限24h前リマインダー (§9.1)
// pg_cron 'kickoff-hearing-reminder-hourly' から毎時叩かれる前提。
//
// 動作:
//   1. spacareer_kickoff_hearing_sessions を走査
//      条件: status in ('unstarted','in_progress')
//           AND deadline_at - now <= 24h AND > 0
//           AND reminder_24h_sent_at is null
//   2. 各顧客について spacareer-slack-notify を notify_key='kickoff_hearing_reminder' で呼ぶ
//   3. 成功したら reminder_24h_sent_at = now() でマーク
//
// 必要環境変数:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (自動設定)
//   - SLACK_BOT_TOKEN (運営エンジニア設定)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ヒアリングURL（受講生ポータルの該当画面、現状は /spacareer ルート）
const HEARING_URL_BASE = Deno.env.get('SPANAVI_BASE_URL')?.trim() || 'https://spanavi.vercel.app'
function buildHearingUrl(): string {
  return `${HEARING_URL_BASE}/spacareer`
}

const JP_WD = ['日','月','火','水','木','金','土']
function formatJpDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}(${JP_WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function callSlackNotify(payload: {
  org_id: string
  customer_id: string
  notify_key: string
  vars?: Record<string, string>
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/spacareer-slack-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 24時間以内に期限を迎えるセッションを抽出
    const nowMs = Date.now()
    const deadlineMax = new Date(nowMs + 24 * 3600 * 1000).toISOString()
    const deadlineMin = new Date(nowMs).toISOString()

    const { data: sessions, error: sErr } = await supabase
      .from('spacareer_kickoff_hearing_sessions')
      .select(`
        id, org_id, customer_id, status, deadline_at, deadline_extended_to,
        customer:spacareer_customers!spacareer_kickoff_hearing_sessions_customer_id_fkey (
          id, member_id,
          member:members!spacareer_customers_member_id_fkey ( name )
        )
      `)
      .in('status', ['unstarted', 'in_progress'])
      .is('reminder_24h_sent_at', null)
      .not('deadline_at', 'is', null)
      .lte('deadline_at', deadlineMax)
      .gte('deadline_at', deadlineMin)
      .limit(50)

    if (sErr) throw sErr

    if (!sessions || sessions.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'no targets' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const results = await Promise.allSettled(sessions.map(async (s) => {
      // deno-lint-ignore no-explicit-any
      const customer = (s as any).customer
      // deno-lint-ignore no-explicit-any
      const customerName = customer?.member?.name || '受講生'
      const effectiveDeadline = s.deadline_extended_to || s.deadline_at

      const r = await callSlackNotify({
        org_id: s.org_id,
        customer_id: s.customer_id,
        notify_key: 'kickoff_hearing_reminder',
        vars: {
          customer_name: customerName,
          hearing_url: buildHearingUrl(),
          deadline: formatJpDate(new Date(effectiveDeadline)),
        },
      })
      if (r.ok) {
        await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq('id', s.id)
      }
      return { customer_id: s.customer_id, ok: r.ok, error: r.error }
    }))

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const errorList = results
      .map((r) => r.status === 'fulfilled' ? r.value : { ok: false, error: String((r as PromiseRejectedResult).reason) })
      .filter((v) => !v.ok)

    console.log(`[kickoff-hearing-reminder] processed=${sessions.length} success=${successCount} errors=${errorList.length}`)

    return new Response(
      JSON.stringify({
        ok: true,
        processed: sessions.length,
        success: successCount,
        errors: errorList,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[kickoff-hearing-reminder] error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
