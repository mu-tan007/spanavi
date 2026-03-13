import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

    // 対象セッションを取得：finished_at IS NULL かつ最終活動から3時間以上経過
    const { data: stale, error: fetchError } = await supabase
      .from('call_sessions')
      .select('id, last_called_at, started_at')
      .is('finished_at', null)
      .or(`last_called_at.lt.${threeHoursAgo},and(last_called_at.is.null,started_at.lt.${threeHoursAgo})`)

    if (fetchError) throw new Error(`fetch error: ${fetchError.message}`)
    if (!stale || stale.length === 0) {
      console.log('[auto-close-sessions] 対象セッションなし')
      return new Response(
        JSON.stringify({ ok: true, closedCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 各セッションの finished_at = COALESCE(last_called_at, started_at) + 1秒 でクローズ
    const updates = stale.map(s => {
      const base = s.last_called_at || s.started_at
      const finishedAt = new Date(new Date(base).getTime() + 1000).toISOString()
      return supabase
        .from('call_sessions')
        .update({ finished_at: finishedAt })
        .eq('id', s.id)
        .is('finished_at', null) // 二重更新防止
    })

    const results = await Promise.all(updates)
    const errors = results.map(r => r.error).filter(Boolean)
    if (errors.length > 0) {
      console.error('[auto-close-sessions] 一部更新エラー:', errors)
    }

    const closedCount = results.filter(r => !r.error).length
    console.log('[auto-close-sessions] クローズ件数:', closedCount)

    return new Response(
      JSON.stringify({ ok: true, closedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[auto-close-sessions] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
