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
    // 1. Authorization ヘッダーから JWT を取得し、ユーザーを検証
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '認証が必要です' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { newSeatCount } = await req.json()
    if (!newSeatCount || typeof newSeatCount !== 'number' || newSeatCount < 1) {
      return new Response(JSON.stringify({ error: 'newSeatCount は 1 以上の数値で指定してください' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. members テーブルから org_id を取得
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: member, error: memberError } = await adminClient
      .from('members')
      .select('org_id')
      .or(`email.eq.${user.email},id.eq.${user.email?.match(/^user_(.+)@masp-internal\.com$/)?.[1] || ''}`)
      .single()

    if (memberError || !member) {
      return new Response(JSON.stringify({ error: 'メンバー情報が見つかりません' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. organizations テーブルから stripe_subscription_id を取得
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('stripe_subscription_id')
      .eq('id', member.org_id)
      .single()

    if (orgError || !org) {
      return new Response(JSON.stringify({ error: '組織情報が見つかりません' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. stripe_subscription_id が null なら何もせず返す（MASP 等）
    if (!org.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ success: true, seatCount: newSeatCount, message: 'Stripe サブスクリプション対象外のため更新不要' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Stripe サブスクリプションを取得して items[0].id を特定
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const itemId = subscription.items.data[0]?.id

    if (!itemId) {
      return new Response(JSON.stringify({ error: 'サブスクリプションアイテムが見つかりません' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. サブスクリプションの quantity を更新
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: itemId, quantity: newSeatCount }],
    })

    // 7. organizations.seat_count を更新
    const { error: updateError } = await adminClient
      .from('organizations')
      .update({ seat_count: newSeatCount })
      .eq('id', member.org_id)

    if (updateError) {
      console.error('organizations seat_count update error:', updateError)
    }

    // 8. 結果を返す
    return new Response(
      JSON.stringify({ success: true, seatCount: newSeatCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('stripe-update-seats error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
