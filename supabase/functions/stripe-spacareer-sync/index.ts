// スパキャリ売上のバックフィル / 手動全同期。
// UI「今すぐ同期」ボタンから管理者が呼ぶ。Stripe の全 Invoice を取得し spacareer_invoices へ upsert。
// 初回移行にも使用。管理者(users.role='admin')のみ許可。
import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveSpacareerOrgId, syncInvoice } from '../_shared/spacareerInvoiceSync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: '認証が必要です' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!

    // 呼び出し元が管理者か検証（売上は経営情報のため admin 限定）
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json(401, { error: '認証に失敗しました' })

    const { data: callerUser } = await userClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!callerUser || callerUser.role !== 'admin') {
      return json(403, { error: '管理者権限が必要です' })
    }

    // 任意: 期間指定（created[gte]）。未指定なら全件。
    const bodyJson = await req.json().catch(() => ({}))
    const createdGte: number | undefined = bodyJson?.created_gte // unix秒

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const orgId = await resolveSpacareerOrgId(supabase)
    if (!orgId) return json(500, { error: 'spartia_career org_id が解決できません' })

    let synced = 0
    let hasMore = true
    let startingAfter: string | undefined = undefined

    while (hasMore) {
      const params: Stripe.InvoiceListParams = { limit: 100 }
      if (startingAfter) params.starting_after = startingAfter
      if (createdGte) params.created = { gte: createdGte }

      const page = await stripe.invoices.list(params)
      for (const inv of page.data) {
        await syncInvoice(supabase, orgId, inv)
        synced++
      }
      hasMore = page.has_more
      if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id
      else hasMore = false
    }

    console.log(`spacareer sync 完了: ${synced}件`)
    return json(200, { ok: true, synced })
  } catch (err) {
    console.error('spacareer sync エラー:', (err as Error).message)
    return json(500, { error: (err as Error).message })
  }
})
