// スパキャリ売上管理用 Stripe Webhook（第2エンドポイント）。
// 既存 stripe-webhook（旧SaaSテナント課金・残骸）とは別系統。触らない。
// 受信イベント: invoice.* / charge.refunded を spacareer_invoices にミラー。
// 署名検証を有効化（STRIPE_SPACAREER_WEBHOOK_SECRET）。
import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveSpacareerOrgId, syncInvoice, syncSubscription, syncRefund, syncStripeCustomer } from '../_shared/spacareerInvoiceSync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // スパキャリ専用キーを優先（Live用に STRIPE_SPACAREER_SECRET_KEY を使う。無ければ共有キーにフォールバック）
  const stripeSecretKey = Deno.env.get('STRIPE_SPACAREER_SECRET_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY')!
  const webhookSecret = Deno.env.get('STRIPE_SPACAREER_WEBHOOK_SECRET')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 署名検証
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret)
  } catch (err) {
    console.error('署名検証失敗:', (err as Error).message)
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const orgId = await resolveSpacareerOrgId(supabase)
    if (!orgId) throw new Error('spartia_career org_id が解決できません')

    console.log(`spacareer webhook: ${event.type} (${event.id})`)

    switch (event.type) {
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.updated':
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.marked_uncollectible':
      case 'invoice.voided': {
        await syncInvoice(supabase, orgId, event.data.object, stripe)
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        await syncStripeCustomer(supabase, orgId, event.data.object)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(supabase, orgId, event.data.object)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id
        // 返金レコードを保存（純売上高の控除用）
        for (const rf of (charge.refunds?.data ?? [])) {
          await syncRefund(supabase, orgId, rf)
        }
        if (invoiceId) {
          const inv = await stripe.invoices.retrieve(invoiceId)
          await syncInvoice(supabase, orgId, inv, stripe)
        } else {
          console.log('請求書に紐づかない返金は返金レコードのみ保存')
        }
        break
      }

      default:
        console.log(`未処理イベント: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('spacareer webhook処理エラー:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
