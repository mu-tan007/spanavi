// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getZoomToken(accountId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  const data = await res.json()
  if (!data.access_token) {
    console.error('[zoom-hangup] トークン取得失敗:', JSON.stringify(data))
    return null
  }
  return data.access_token
}

// 電話番号の表記揺れを吸収して active_calls.callee_number の候補を作る。
// active_calls には +81 形式（例 +81946241862）で記録される。
function phoneVariants(phone: string): string[] {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return []
  const noZero = d.replace(/^0/, '')
  return Array.from(new Set([
    d,                 // 0946241862
    `+81${noZero}`,    // +81946241862
    `81${noZero}`,     // 81946241862
    `+${d}`,           // +0946241862（保険）
  ]))
}

// 「いま架電している企業の番号」で進行中通話の call_id を特定する（最も確実）。
// 発信はZoomデスクトップアプリ経由のためフロントは call_id を持たず、
// receive-zoom-webhook が active_calls にリアルタイム記録した値を使う。
// Webhook到達には数秒の遅延があるため、見つかるまで最大数秒リトライする。
// 番号で一意に絞るので、次企業の通話を誤って切ることはない。
async function resolveByPhone(supabase: any, zoomUserId: string, phone: string): Promise<string | null> {
  const variants = phoneVariants(phone)
  if (variants.length === 0) return null

  const attempts = 4
  for (let i = 0; i < attempts; i++) {
    const since = new Date(Date.now() - 120_000).toISOString()
    const { data, error } = await supabase
      .from('active_calls')
      .select('zoom_call_id, call_status, started_at')
      .eq('caller_zoom_user_id', zoomUserId)
      .is('ended_at', null)
      .in('callee_number', variants)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[zoom-hangup] active_calls 検索エラー:', error.message)
      return null
    }
    if (data && data.length > 0) {
      console.log('[zoom-hangup] 番号一致 対象通話:', data[0].zoom_call_id, '/ status:', data[0].call_status, '/ attempt:', i + 1)
      return data[0].zoom_call_id ?? null
    }
    // まだWebhook未到達 → 少し待って再検索（最終回は待たない）
    if (i < attempts - 1) await sleep(1200)
  }
  console.warn('[zoom-hangup] 番号一致の進行中通話が見つかりません phone:', phone, 'variants:', JSON.stringify(variants))
  return null
}

// 番号が無い場合のフォールバック: 直近120秒で最も新しい進行中通話。
async function resolveNewestActive(supabase: any, zoomUserId: string): Promise<string | null> {
  const since = new Date(Date.now() - 120_000).toISOString()
  const { data, error } = await supabase
    .from('active_calls')
    .select('zoom_call_id, call_status, started_at')
    .eq('caller_zoom_user_id', zoomUserId)
    .is('ended_at', null)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  console.log('[zoom-hangup] フォールバック 最新通話:', data[0].zoom_call_id, '/ status:', data[0].call_status)
  return data[0].zoom_call_id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    let { callId } = body
    const { zoomUserId, phone } = body

    console.log('[zoom-hangup] 受信 callId:', callId ?? '(なし)', '/ zoomUserId:', zoomUserId ?? '(なし)', '/ phone:', phone ?? '(なし)')

    // callId未指定なら zoomUserId（+ phone）から特定
    if (!callId && zoomUserId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey)
        if (phone) callId = await resolveByPhone(supabase, zoomUserId, phone)
        if (!callId) callId = await resolveNewestActive(supabase, zoomUserId)
      } else {
        console.error('[zoom-hangup] Supabase 認証情報が未設定 — active_calls 検索不可')
      }
    }

    if (!callId) {
      console.warn('[zoom-hangup] 切電対象なし — スキップ')
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: 'no active call' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const accountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
    const clientId     = Deno.env.get('ZOOM_CLIENT_ID')
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

    if (!accountId || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Zoom credentials not configured' }), {
        status: 500, headers: corsHeaders,
      })
    }

    const token = await getZoomToken(accountId, clientId, clientSecret)
    if (!token) {
      return new Response(JSON.stringify({ error: 'Failed to get Zoom token' }), {
        status: 500, headers: corsHeaders,
      })
    }

    const res = await fetch(`https://api.zoom.us/v2/phone/calls/${callId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    console.log('[zoom-hangup] DELETE /v2/phone/calls/' + callId + ' → HTTP ' + res.status)

    // 204 No Content = 切断成功、404 = すでに切断済み（どちらも正常系）
    const ok = res.status === 204 || res.status === 404
    return new Response(JSON.stringify({ ok, callId, httpStatus: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[zoom-hangup] エラー:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: corsHeaders,
    })
  }
})
