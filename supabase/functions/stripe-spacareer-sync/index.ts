// スパキャリ売上のバックフィル / 手動全同期。
// UI「今すぐ同期」ボタンから管理者が呼ぶ。Stripe の全 Invoice を取得し spacareer_invoices へ upsert。
// 初回移行にも使用。管理者(users.role='admin')のみ許可。
import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveSpacareerOrgId, syncInvoice, syncSubscription, syncRefund, syncStripeCustomer } from '../_shared/spacareerInvoiceSync.ts'

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
    // スパキャリ専用キーを優先（Live用に STRIPE_SPACAREER_SECRET_KEY を使う。無ければ共有キーにフォールバック）
    const stripeSecretKey = Deno.env.get('STRIPE_SPACAREER_SECRET_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY')!

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
        await syncInvoice(supabase, orgId, inv, stripe)
        synced++
      }
      hasMore = page.has_more
      if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id
      else hasMore = false
    }

    // ── サブスクリプションも取り込む（MRR / 有効サブスク登録者用）──
    let syncedSubs = 0
    let subsHasMore = true
    let subsAfter: string | undefined = undefined
    while (subsHasMore) {
      const subParams: Stripe.SubscriptionListParams = {
        status: 'all',
        limit: 100,
        expand: ['data.customer'],
      }
      if (subsAfter) subParams.starting_after = subsAfter
      const subPage = await stripe.subscriptions.list(subParams)
      for (const sub of subPage.data) {
        await syncSubscription(supabase, orgId, sub)
        syncedSubs++
      }
      subsHasMore = subPage.has_more
      if (subPage.data.length > 0) subsAfter = subPage.data[subPage.data.length - 1].id
      else subsHasMore = false
    }

    // ── 返金も取り込む（純売上高の控除用）──
    let syncedRefunds = 0
    let rHasMore = true
    let rAfter: string | undefined = undefined
    while (rHasMore) {
      const rParams: Stripe.RefundListParams = { limit: 100 }
      if (rAfter) rParams.starting_after = rAfter
      const rPage = await stripe.refunds.list(rParams)
      for (const rf of rPage.data) {
        await syncRefund(supabase, orgId, rf)
        syncedRefunds++
      }
      rHasMore = rPage.has_more
      if (rPage.data.length > 0) rAfter = rPage.data[rPage.data.length - 1].id
      else rHasMore = false
    }

    // ── 顧客も取り込む（新規顧客を作成日ベースで数えるため）──
    let syncedCustomers = 0
    let cHasMore = true
    let cAfter: string | undefined = undefined
    while (cHasMore) {
      const cParams: Stripe.CustomerListParams = { limit: 100 }
      if (cAfter) cParams.starting_after = cAfter
      const cPage = await stripe.customers.list(cParams)
      for (const cus of cPage.data) {
        await syncStripeCustomer(supabase, orgId, cus)
        syncedCustomers++
      }
      cHasMore = cPage.has_more
      if (cPage.data.length > 0) cAfter = cPage.data[cPage.data.length - 1].id
      else cHasMore = false
    }

    console.log(`spacareer sync 完了: 請求書${synced} / サブスク${syncedSubs} / 返金${syncedRefunds} / 顧客${syncedCustomers}`)
    return json(200, { ok: true, synced, syncedSubs, syncedRefunds, syncedCustomers })
  } catch (err) {
    console.error('spacareer sync エラー:', (err as Error).message)
    return json(500, { error: (err as Error).message })
  }
})
