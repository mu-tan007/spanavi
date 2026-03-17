// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLIENT_ID = '6bOsuwf0T3GnH7o_I03DGQ'
const REDIRECT_URI = 'https://spanavi.vercel.app'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code } = await req.json()
    if (!code) {
      return new Response(JSON.stringify({ error: 'missing code' }), { status: 400, headers: corsHeaders })
    }

    const clientSecret = Deno.env.get('ZOOM_SMART_EMBED_CLIENT_SECRET')
    if (!clientSecret) {
      return new Response(JSON.stringify({ error: 'server misconfigured' }), { status: 500, headers: corsHeaders })
    }

    const credentials = btoa(`${CLIENT_ID}:${clientSecret}`)
    const resp = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    })

    const data = await resp.json()
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
