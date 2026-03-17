// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { callId } = await req.json()
    if (!callId) {
      return new Response(JSON.stringify({ error: 'callId required' }), {
        status: 400, headers: corsHeaders,
      })
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
    return new Response(JSON.stringify({ ok, httpStatus: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[zoom-hangup] エラー:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: corsHeaders,
    })
  }
})
