// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getZoomToken(): Promise<string> {
  const accountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
  const clientId     = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom credentials not configured')
  }
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
  if (!data.access_token) throw new Error('Zoom token failed: ' + JSON.stringify(data))
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { call_record_id, zoom_recording_url } = await req.json()

    if (!call_record_id || !zoom_recording_url) {
      return json({ error: 'call_record_id and zoom_recording_url are required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    // SUPABASE_SERVICE_ROLE_KEY は新フォーマット(sb_secret_)のため Storage では使用不可
    // JWT形式のキーを STORAGE_SERVICE_KEY として別途登録
    const supabaseKey = Deno.env.get('STORAGE_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured')
    }

    console.log('[upload-recording] 開始 call_record_id:', call_record_id)

    // ── Step 1: Zoomアクセストークン取得 ─────────────────────────────────
    console.log('[upload-recording] Zoomトークン取得中...')
    const zoomToken = await getZoomToken()

    // ── Step 2: Zoom録音バイナリをダウンロード ────────────────────────────
    console.log('[upload-recording] 録音DL中:', zoom_recording_url)
    const audioRes = await fetch(zoom_recording_url, {
      headers: { 'Authorization': `Bearer ${zoomToken}` },
    })
    if (!audioRes.ok) {
      throw new Error(`Zoom audio fetch failed: ${audioRes.status} ${await audioRes.text()}`)
    }
    const audioBuffer = await audioRes.arrayBuffer()
    console.log('[upload-recording] 録音DL完了 bytes:', audioBuffer.byteLength)

    // ── Step 3: recordingsバケット作成（既存の場合は無視） ────────────────
    await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'recordings', name: 'recordings', public: true }),
    })

    // ── Step 4: Supabase Storageにアップロード ────────────────────────────
    const filename = `recordings/${call_record_id}_${Date.now()}.m4a`
    console.log('[upload-recording] Storage upload開始 filename:', filename)
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${filename}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'audio/mp4',
        'x-upsert': 'true',
      },
      body: audioBuffer,
    })
    if (!uploadRes.ok) {
      throw new Error(`Storage upload failed: ${uploadRes.status} ${await uploadRes.text()}`)
    }
    console.log('[upload-recording] Storage upload完了 HTTP:', uploadRes.status)

    // ── Step 5: 公開URL生成 ───────────────────────────────────────────────
    const public_url = `${supabaseUrl}/storage/v1/object/public/${filename}`
    console.log('[upload-recording] public_url:', public_url)

    // ── Step 6: call_records テーブル更新 ────────────────────────────────
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/call_records?id=eq.${call_record_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ recording_url: public_url }),
      }
    )
    console.log('[upload-recording] call_records更新 HTTP:', updateRes.status)

    // ── Step 7: レスポンス ────────────────────────────────────────────────
    return json({ public_url })

  } catch (err) {
    console.error('[upload-recording] エラー:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
