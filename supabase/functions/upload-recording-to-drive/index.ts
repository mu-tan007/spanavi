// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { r2PutFromBuffer } from '../_shared/recordingSource.ts'

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

    // ── Step 3-4: 保存先は Cloudflare R2（2026-08-24 移設）────────────────
    //
    // ⚠️ Supabase Storage には置かない。組織の上限100GBを超えたため、
    //    録音80GB/150,800件をR2へ移した。ここで置き続けると、
    //    削除した端からまた溜まる。
    //
    // ⚠️ recording_url に入れる形は**移設前の公開URLのまま**にする。
    //    DBに14.8万行あり書き換えないので、新旧で形が違うと
    //    再生側で2通りの読み方が要る。URLは「鍵の入れ物」として扱う。
    const key = `${call_record_id}_${Date.now()}.m4a`
    const filename = `recordings/${key}`
    console.log('[upload-recording] R2へ保存 key:', key)

    const put = await r2PutFromBuffer(key, audioBuffer, 'audio/mp4')
    if (!put.ok) {
      throw new Error(`R2 upload failed: ${put.status} ${put.body}`)
    }
    console.log('[upload-recording] R2保存完了 HTTP:', put.status)

    // ── Step 5: 再生用のURL（実体はR2。形は従来どおり）───────────────────
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
