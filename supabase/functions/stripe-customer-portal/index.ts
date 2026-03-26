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

    // 2. members テーブルからユーザーの org_id を取得
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

    // 3. organizations テーブルから stripe_customer_id を取得
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', member.org_id)
      .single()

    if (orgError || !org) {
      return new Response(JSON.stringify({ error: '組織情報が見つかりません' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. stripe_customer_id が null なら 403（MASP 等の直接契約）
    if (!org.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'Stripe による課金管理対象外の組織です' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Stripe Customer Portal セッションを作成
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    })

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: 'https://spanavi.jp',
    })

    // 6. ポータル URL を返す
    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('stripe-customer-portal error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
