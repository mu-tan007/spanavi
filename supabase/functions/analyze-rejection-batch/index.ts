// 未分析の キーマン断り を 自動で AI 分析する batch Edge Function
// pg_cron から定期呼び出しされる（30分毎）
//
// 動作:
//   1. RPC ai_rejection_pending_targets(p_limit) で未分析 N 件の id を取得
//   2. analyze-rejection-recording を 並列 CONCURRENCY で内部呼出
//   3. 結果は analyze-rejection-recording 側で call_records.rejection_reason に save
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// analyze-rejection-recording 呼出用 anon JWT (公開鍵相当、 hardcode 可)
const ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const CONCURRENCY    = 5
const DEFAULT_LIMIT  = 10
const MAX_LIMIT      = 30
const ANALYZE_FN_URL = `${SUPABASE_URL}/functions/v1/analyze-rejection-recording`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body  = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(1, Number(body.limit) || DEFAULT_LIMIT), MAX_LIMIT)

    // 未分析 target を RPC で取得
    const { data: rows, error } = await supabase.rpc('ai_rejection_pending_targets', { p_limit: limit })
    if (error) return json({ error: `RPC failed: ${error.message}` }, 500)

    const ids: string[] = (rows as Array<{ id: string }> || []).map(r => r.id)

    if (ids.length === 0) {
      return json({ processed: 0, success: 0, failed: 0, message: 'no pending targets' })
    }

    async function processOne(record_id: string) {
      const res = await fetch(ANALYZE_FN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_JWT}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ record_id, save_to_db: true }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
      }
      const data = await res.json()
      if (data?.error) throw new Error(data.error)
      return data
    }

    let success = 0, failed = 0
    const errors: Array<{ id: string; error: string }> = []
    let idx = 0

    async function worker() {
      while (idx < ids.length) {
        const i = idx++
        const id = ids[i]
        try {
          await processOne(id)
          success++
        } catch (e) {
          failed++
          errors.push({ id, error: (e as Error).message })
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    return json({
      processed: ids.length,
      success,
      failed,
      errors: errors.slice(0, 5),
    })
  } catch (err) {
    console.error('[analyze-rejection-batch] Unhandled:', err)
    return json({ error: (err as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
