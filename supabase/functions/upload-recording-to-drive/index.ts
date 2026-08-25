// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { r2PutFromBuffer, recShareUrl } from '../_shared/recordingSource.ts'

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
    const key = `${call_record_id}_${Date.now()}.m4a`
    console.log('[upload-recording] R2へ保存 key:', key)

    const put = await r2PutFromBuffer(key, audioBuffer, 'audio/mp4')
    if (!put.ok) {
      throw new Error(`R2 upload failed: ${put.status} ${put.body}`)
    }
    console.log('[upload-recording] R2保存完了 HTTP:', put.status)

    // ── Step 5: 再生用のURL ──────────────────────────────────────────────
    //
    // ⚠️ ここで作るURLは**アポ取得報告に貼られて先方へ送られる**。
    //    以前は移設前の公開URLの形をそのまま入れていたが、
    //    recordings バケットを非公開にした時点で社外からは400になり、
    //    先方が録音を1本も聴けない状態が続いていた（2026-08-25 発覚）。
    //    押せば再生できる rec の形で入れる。中身が鍵であることは変わらない。
    const public_url = (await recShareUrl(key))
      || `${supabaseUrl}/storage/v1/object/public/recordings/${key}`
    console.log('[upload-recording] public_url:', public_url)

    const rest = (query: string, init: RequestInit = {}) =>
      fetch(`${supabaseUrl}/rest/v1/${query}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          ...(init.headers ?? {}),
        },
      })

    // ── Step 6: call_records テーブル更新 ────────────────────────────────
    // どのリストの何番の企業だったかは、更新の戻りでそのまま受け取る。
    const updateRes = await rest(`call_records?id=eq.${call_record_id}&select=item_id`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ recording_url: public_url }),
    })
    console.log('[upload-recording] call_records更新 HTTP:', updateRes.status)
    const updated: { item_id?: string }[] = updateRes.ok ? await updateRes.json().catch(() => []) : []
    const item_id = updated[0]?.item_id

    // ── Step 7: 同じ架電のアポにも反映する ───────────────────────────────
    //
    // ⚠️ ここを call_records だけで済ませていたため、アポ取得報告を先に保存すると
    //    appointments.recording_url が **Zoomの生URL**（OAuthが要る＝誰も開けない）の
    //    まま取り残されていた。ポータルでも報告メールでも再生できない。
    //    2026-08-25 時点で18件。報告書の本文に貼られた行も一緒に直す。
    try {
      if (!item_id) throw new Error('item_id が取れませんでした')
      const res = await rest(`appointments?select=id,recording_url,appo_report&item_id=eq.${item_id}`)
      const appos: { id: string; recording_url: string | null; appo_report: string | null }[] =
        res.ok ? await res.json() : []

      // すでにR2の鍵を指しているものは触らない。取り残されたZoomの生URLだけ差し替える。
      for (const a of appos.filter((a) => !a.recording_url || /zoom\.us/i.test(a.recording_url))) {
        const line = /^[\s　]*・?録音URL[：:].*$/m
        const report = a.appo_report && line.test(a.appo_report)
          ? a.appo_report.replace(line, `　・録音URL：${public_url}`)
          : a.appo_report
        const r = await rest(`appointments?id=eq.${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ recording_url: public_url, appo_report: report }),
        })
        console.log('[upload-recording] appointments更新 HTTP:', r.status, a.id)
      }
    } catch (e) {
      // 本体（call_records）は済んでいる。ここで落ちても録音は失わない。
      console.error('[upload-recording] appointments反映に失敗:', e)
    }

    // ── Step 8: レスポンス ────────────────────────────────────────────────
    return json({ public_url })

  } catch (err) {
    console.error('[upload-recording] エラー:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
