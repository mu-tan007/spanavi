import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, orgName, seatCount } = await req.json()

    // バリデーション
    if (!email || !orgName || !seatCount) {
      return new Response(
        JSON.stringify({ error: 'email, orgName, seatCount は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Stripe Customer を作成
    const customer = await stripe.customers.create({
      email,
      name: orgName,
    })

    // 2. pending_signups にレコード作成
    const { data: signupRecord, error: insertError } = await supabase
      .from('pending_signups')
      .insert({
        email,
        org_name: orgName,
        seat_count: seatCount,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !signupRecord) {
      console.error('pending_signups insert error:', insertError)
      return new Response(
        JSON.stringify({ error: '申込レコードの作成に失敗しました' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Stripe Checkout Session を作成
    // 初期費用をCustomerの保留インボイスアイテムとして追加
    // サブスクリプション作成時の最初のインボイスに自動的に含まれる
    await stripe.invoiceItems.create({
      customer: customer.id,
      price: Deno.env.get('STRIPE_PRICE_SETUP_FEE')!,
      quantity: 1,
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [
        {
          price: Deno.env.get('STRIPE_PRICE_MONTHLY_PER_SEAT')!,
          quantity: seatCount,
        },
      ],
      subscription_data: {
        metadata: {
          pending_signup_id: signupRecord.id,
          org_name: orgName,
        },
      },
      success_url: 'https://spanavi.jp/signup/complete?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://spanavi.jp/signup/canceled',
    })

    // 4. pending_signups の stripe_checkout_session_id を更新
    const { error: updateError } = await supabase
      .from('pending_signups')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', signupRecord.id)

    if (updateError) {
      console.error('pending_signups update error:', updateError)
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('stripe-create-checkout error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
