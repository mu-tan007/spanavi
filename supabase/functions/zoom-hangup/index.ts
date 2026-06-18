// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

// zoom_user_id から「いま進行中の通話」の call_id を特定する。
// 発信はZoomデスクトップアプリ経由（zoomphonecall://）で行われるため、
// フロントのiframeは call_id を持たない。代わりに receive-zoom-webhook が
// active_calls にリアルタイム記録した call_id を信頼の単一ソースとして使う。
async function resolveActiveCallId(supabase: any, zoomUserId: string): Promise<string | null> {
  // 直近120秒以内に開始され、まだ終了していない自分の発信を最大5件取得。
  // 120秒の窓で「終了webhookを取りこぼした古いstuck行」を除外する。
  const since = new Date(Date.now() - 120_000).toISOString()
  const { data, error } = await supabase
    .from('active_calls')
    .select('zoom_call_id, call_status, started_at')
    .eq('caller_zoom_user_id', zoomUserId)
    .is('ended_at', null)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('[zoom-hangup] active_calls 検索エラー:', error.message)
    return null
  }
  if (!data || data.length === 0) {
    console.warn('[zoom-hangup] 進行中の通話が見つかりません zoomUserId:', zoomUserId)
    return null
  }

  // 通話中(connected)を最優先。なければ最新の進行中(ringing等)。
  // ステータス入力直後に次番号へ自動発信されるが、その新規発信の
  // webhook到達には数秒かかるため、この時点では基本「今切りたい通話」のみがヒットする。
  const connected = data.find((r: any) => r.call_status === 'connected')
  const target = connected || data[0]
  console.log('[zoom-hangup] 対象通話:', target.zoom_call_id, '/ status:', target.call_status)
  return target.zoom_call_id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    let { callId } = body
    const { zoomUserId } = body

    console.log('[zoom-hangup] リクエスト受信 callId:', callId ?? '(未指定)', '/ zoomUserId:', zoomUserId ?? '(未指定)')

    // callId未指定なら zoomUserId から進行中通話を特定
    if (!callId && zoomUserId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey)
        callId = await resolveActiveCallId(supabase, zoomUserId)
      } else {
        console.error('[zoom-hangup] Supabase 認証情報が未設定 — active_calls 検索不可')
      }
    }

    if (!callId) {
      // 切る対象が特定できない（=既に切れている/まだ繋がっていない等）。正常系として扱う。
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
