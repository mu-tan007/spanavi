// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// gcal-proxyと同じClient IDを使用
const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'

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

async function getGoogleToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!refreshToken || !clientSecret) {
    throw new Error('Google credentials not configured')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Google token failed: ' + JSON.stringify(data))
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

    console.log('[upload-recording-to-drive] 開始 call_record_id:', call_record_id)

    // ── Step 1: Zoomアクセストークン取得 ─────────────────────────────────
    console.log('[upload-recording-to-drive] Zoomトークン取得中...')
    const zoomToken = await getZoomToken()

    // ── Step 2: Zoom録音バイナリをダウンロード ────────────────────────────
    console.log('[upload-recording-to-drive] 録音DL中:', zoom_recording_url)
    const audioRes = await fetch(zoom_recording_url, {
      headers: { 'Authorization': `Bearer ${zoomToken}` },
    })
    if (!audioRes.ok) {
      throw new Error(`Zoom audio fetch failed: ${audioRes.status} ${await audioRes.text()}`)
    }
    const audioBuffer = await audioRes.arrayBuffer()
    console.log('[upload-recording-to-drive] 録音DL完了 bytes:', audioBuffer.byteLength)

    // ── Step 3: Googleアクセストークン取得 ────────────────────────────────
    console.log('[upload-recording-to-drive] Googleトークン取得中...')
    const googleToken = await getGoogleToken()

    // ── Step 4: Google Drive multipart アップロード ───────────────────────
    const fileName = `recording_${call_record_id}_${Date.now()}.m4a`
    const boundary = `boundary_${Math.random().toString(36).slice(2)}`
    const metadata = JSON.stringify({ name: fileName, mimeType: 'audio/mp4' })

    const encoder = new TextEncoder()
    const metaPartStr = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      '',
    ].join('\r\n')
    const mediaHeaderStr = `--${boundary}\r\nContent-Type: audio/mp4\r\n\r\n`
    const footerStr = `\r\n--${boundary}--`

    const metaBytes    = encoder.encode(metaPartStr)
    const mediaHeader  = encoder.encode(mediaHeaderStr)
    const mediaFooter  = encoder.encode(footerStr)
    const audioBytes   = new Uint8Array(audioBuffer)

    const bodyBytes = new Uint8Array(
      metaBytes.length + mediaHeader.length + audioBytes.length + mediaFooter.length
    )
    let offset = 0
    bodyBytes.set(metaBytes,   offset); offset += metaBytes.length
    bodyBytes.set(mediaHeader, offset); offset += mediaHeader.length
    bodyBytes.set(audioBytes,  offset); offset += audioBytes.length
    bodyBytes.set(mediaFooter, offset)

    console.log('[upload-recording-to-drive] Drive uploadType=multipart 開始 fileName:', fileName)
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyBytes,
      }
    )
    const uploadData = await uploadRes.json()
    console.log('[upload-recording-to-drive] Drive upload HTTP:', uploadRes.status, 'fileId:', uploadData.id)
    if (!uploadRes.ok || !uploadData.id) {
      throw new Error('Drive upload failed: ' + JSON.stringify(uploadData))
    }
    const fileId = uploadData.id

    // ── Step 5: 共有設定変更（誰でも閲覧可能）────────────────────────────
    console.log('[upload-recording-to-drive] 共有設定変更中 fileId:', fileId)
    const permRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    )
    if (!permRes.ok) {
      console.warn('[upload-recording-to-drive] 共有設定失敗 HTTP:', permRes.status, await permRes.text())
    }

    // ── Step 6: 共有リンク生成 ────────────────────────────────────────────
    const drive_url = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
    console.log('[upload-recording-to-drive] drive_url:', drive_url)

    // ── Step 7: call_records テーブル更新 ────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseUrl && supabaseKey) {
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/call_records?id=eq.${call_record_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ recording_url: drive_url }),
        }
      )
      console.log('[upload-recording-to-drive] call_records更新 HTTP:', updateRes.status)
    }

    // ── Step 8: レスポンス ────────────────────────────────────────────────
    return json({ drive_url, file_id: fileId })

  } catch (err) {
    console.error('[upload-recording-to-drive] エラー:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
