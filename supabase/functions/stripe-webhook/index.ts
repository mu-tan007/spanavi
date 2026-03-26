import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** org_name を URL-safe なslugに変換 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // アクセント除去
    .replace(/[^a-z0-9]+/g, '-')    // 英数字以外をハイフンに
    .replace(/^-+|-+$/g, '')        // 先頭・末尾のハイフン除去
    || 'org'                         // 空になった場合のフォールバック
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Webhook署名検証
    const body = await req.text()
    let event: Stripe.Event

    if (webhookSecret) {
      const sig = req.headers.get('stripe-signature')
      if (!sig) {
        return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      try {
        event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message)
        return new Response(JSON.stringify({ error: `Webhook signature failed: ${err.message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      console.warn('STRIPE_WEBHOOK_SECRET未設定: 署名検証をスキップします')
      event = JSON.parse(body)
    }

    console.log(`Stripe webhook received: ${event.type} (${event.id})`)

    switch (event.type) {
      // ─── 新規テナント作成 ───────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // metadataはsession自体 or subscription に入る可能性があるため両方チェック
        let pendingSignupId = session.metadata?.pending_signup_id
        if (!pendingSignupId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          pendingSignupId = sub.metadata?.pending_signup_id
        }
        // それでも取得できない場合、checkout_session_idからpending_signupsを検索
        if (!pendingSignupId) {
          const { data: signupBySession } = await supabase
            .from('pending_signups')
            .select('id')
            .eq('stripe_checkout_session_id', session.id)
            .eq('status', 'pending')
            .single()
          if (signupBySession) pendingSignupId = signupBySession.id
        }
        if (!pendingSignupId) {
          console.log('pending_signup_id が取得できないセッション、スキップ')
          break
        }

        // pending_signups 取得（status='pending' のみ → べき等性）
        const { data: signup, error: signupError } = await supabase
          .from('pending_signups')
          .select('*')
          .eq('id', pendingSignupId)
          .eq('status', 'pending')
          .single()

        if (signupError || !signup) {
          console.log(`pending_signup ${pendingSignupId} は処理済みまたは不在、スキップ`)
          break
        }

        const stripeCustomerId = session.customer as string
        const stripeSubscriptionId = session.subscription as string
        const slug = slugify(signup.org_name)

        // organizations INSERT
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: signup.org_name,
            slug,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            plan_status: 'active',
            setup_fee_paid: true,
            billing_email: signup.email,
            seat_count: signup.seat_count,
          })
          .select('id')
          .single()

        if (orgError) {
          console.error('organizations INSERT失敗:', orgError.message)
          throw new Error(`organizations INSERT失敗: ${orgError.message}`)
        }

        // members INSERT（管理者）
        const adminName = signup.email.split('@')[0]
        const { error: memberError } = await supabase
          .from('members')
          .insert({
            org_id: org.id,
            name: adminName,
            email: signup.email,
            role: 'admin',
            rank: 'トレーニー',
            position: '代表',
            is_active: true,
          })

        if (memberError) {
          console.error('members INSERT失敗:', memberError.message)
          throw new Error(`members INSERT失敗: ${memberError.message}`)
        }

        // 管理者に招待メール送信
        const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(signup.email, {
          data: { name: adminName },
        })

        if (inviteError) {
          console.error('招待メール送信失敗:', inviteError.message)
          // 招待失敗はクリティカルではないのでログのみ
        }

        // pending_signups を完了にする
        await supabase
          .from('pending_signups')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', pendingSignupId)

        console.log(`テナント作成完了: org=${org.id}, email=${signup.email}`)
        break
      }

      // ─── サブスクリプション更新 ──────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
        const seatCount = subscription.items.data[0]?.quantity ?? null

        const { error } = await supabase
          .from('organizations')
          .update({
            plan_status: subscription.status,
            seat_count: seatCount,
            current_period_end: periodEnd,
          })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('subscription.updated 更新失敗:', error.message)
          throw new Error(`subscription.updated 更新失敗: ${error.message}`)
        }

        console.log(`サブスクリプション更新: customer=${customerId}, status=${subscription.status}`)
        break
      }

      // ─── サブスクリプション削除 ──────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { error } = await supabase
          .from('organizations')
          .update({
            plan_status: 'canceled',
            canceled_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('subscription.deleted 更新失敗:', error.message)
          throw new Error(`subscription.deleted 更新失敗: ${error.message}`)
        }

        console.log(`サブスクリプション削除: customer=${customerId}`)
        break
      }

      // ─── 支払い失敗 ─────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { error } = await supabase
          .from('organizations')
          .update({ plan_status: 'past_due' })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('invoice.payment_failed 更新失敗:', error.message)
          throw new Error(`invoice.payment_failed 更新失敗: ${error.message}`)
        }

        console.log(`支払い失敗: customer=${customerId}`)
        break
      }

      // ─── 支払い成功 ─────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { error } = await supabase
          .from('organizations')
          .update({ plan_status: 'active' })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('invoice.paid 更新失敗:', error.message)
          throw new Error(`invoice.paid 更新失敗: ${error.message}`)
        }

        console.log(`支払い成功: customer=${customerId}`)
        break
      }

      default:
        console.log(`未処理のイベント: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook処理エラー:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
