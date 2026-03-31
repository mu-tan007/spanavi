import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = '570031099308-ni4qokds1jc1m5s0p080t6g2gb3vu8md.apps.googleusercontent.com'

async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!refreshToken || !clientSecret) {
    throw new Error('Missing GOOGLE_REFRESH_TOKEN or GOOGLE_CLIENT_SECRET')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error('Google token exchange failed: ' + (data.error_description || data.error || JSON.stringify(data)))
  }
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
    const { storage_path, filename, folder_id, mode, file_id, origin } = await req.json()

    // mode=init_resumable: Google Driveのresumable upload URIを返す（大ファイル向け）
    if (mode === 'init_resumable') {
      if (!filename) return json({ error: 'filename is required' }, 400)
      const accessToken = await getGoogleAccessToken()
      const metadata: Record<string, unknown> = { name: filename }
      if (folder_id) metadata.parents = [folder_id]
      const ext = filename.split('.').pop()?.toLowerCase() || 'mp4'
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4',
        webm: 'video/webm', wav: 'audio/wav', mov: 'video/quicktime',
      }
      const mimeType = mimeMap[ext] || 'application/octet-stream'

      // ブラウザからの直接アップロード用にOriginヘッダーを付与（CORS対応）
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
      }
      if (origin) {
        headers['Origin'] = origin
      }

      const initRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(metadata),
        }
      )
      if (!initRes.ok) {
        const err = await initRes.text()
        throw new Error('Resumable init failed: ' + err)
      }
      const uploadUri = initRes.headers.get('Location')
      return json({ upload_uri: uploadUri })
    }

    // mode=set_permissions: アップロード済みファイルに共有設定を付与
    if (mode === 'set_permissions') {
      if (!file_id) return json({ error: 'file_id is required' }, 400)
      const accessToken = await getGoogleAccessToken()
      const permRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}/permissions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }
      )
      if (!permRes.ok) {
        const err = await permRes.text()
        throw new Error('Permission set failed: ' + err)
      }
      const driveUrl = `https://drive.google.com/file/d/${file_id}/view?usp=sharing`
      return json({ drive_url: driveUrl, file_id })
    }

    if (!storage_path) {
      return json({ error: 'storage_path is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Step 1: Supabase Storageから署名付きURLを取得してダウンロード ──
    console.log('[upload-to-gdrive] Storage download:', storage_path)
    const { data: signedData, error: signedErr } = await supabase.storage
      .from('roleplay-recordings')
      .createSignedUrl(storage_path, 600) // 10分有効

    if (signedErr || !signedData?.signedUrl) {
      throw new Error('Failed to get signed URL: ' + (signedErr?.message || 'no URL'))
    }

    const fileRes = await fetch(signedData.signedUrl)
    if (!fileRes.ok) {
      throw new Error(`Storage download failed: ${fileRes.status}`)
    }
    const fileBuffer = await fileRes.arrayBuffer()
    console.log('[upload-to-gdrive] Downloaded bytes:', fileBuffer.byteLength)

    // ── Step 2: Google Drive アクセストークン取得 ──
    console.log('[upload-to-gdrive] Getting Google token...')
    const accessToken = await getGoogleAccessToken()

    // ── Step 3: Google Drive にアップロード（multipart upload） ──
    const driveName = filename || storage_path.split('/').pop() || 'roleplay_recording.mp4'
    const metadata: Record<string, unknown> = { name: driveName }
    if (folder_id) {
      metadata.parents = [folder_id]
    }

    // Content-Type推定
    const ext = driveName.split('.').pop()?.toLowerCase() || 'mp4'
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4',
      webm: 'video/webm', wav: 'audio/wav', mov: 'video/quicktime',
    }
    const mimeType = mimeMap[ext] || 'application/octet-stream'

    const boundary = '---spanavi-upload-boundary---'
    const metadataStr = JSON.stringify(metadata)
    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ]

    // ArrayBufferを結合
    const encoder = new TextEncoder()
    const part1 = encoder.encode(bodyParts[0])
    const part2 = encoder.encode(bodyParts[1])
    const part3 = encoder.encode(`\r\n--${boundary}--`)
    const fileBytes = new Uint8Array(fileBuffer)
    const body = new Uint8Array(part1.length + part2.length + fileBytes.length + part3.length)
    body.set(part1, 0)
    body.set(part2, part1.length)
    body.set(fileBytes, part1.length + part2.length)
    body.set(part3, part1.length + part2.length + fileBytes.length)

    console.log('[upload-to-gdrive] Uploading to Google Drive...')
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body,
      }
    )

    const uploadData = await uploadRes.json()
    if (!uploadRes.ok) {
      throw new Error('Drive upload failed: ' + JSON.stringify(uploadData))
    }

    const fileId = uploadData.id
    console.log('[upload-to-gdrive] Uploaded file ID:', fileId)

    // ── Step 4: 共有設定（リンクを知っている人が閲覧可能） ──
    const permRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    )
    if (!permRes.ok) {
      console.warn('[upload-to-gdrive] Permission set failed:', await permRes.text())
    }

    const driveUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
    console.log('[upload-to-gdrive] Share URL:', driveUrl)

    return json({ drive_url: driveUrl, file_id: fileId })

  } catch (err) {
    console.error('[upload-to-gdrive] Error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
