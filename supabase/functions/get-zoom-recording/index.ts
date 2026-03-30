// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// "+81312345678" / "+81-3-1234-5678" → "0312345678"
function normalizePhone(n: string): string {
  if (!n) return ''
  const digits = n.replace(/\D/g, '')
  if (digits.startsWith('81')) return '0' + digits.slice(2)
  return digits
}

// Zoomアクセストークンを取得する共通関数
async function getZoomToken(accountId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const tokenRes = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  const tokenData = await tokenRes.json()
  console.log('[get-zoom-recording] トークン取得 HTTP:', tokenRes.status, '/ token_type:', tokenData.token_type ?? '—')
  if (!tokenData.access_token) {
    console.error('[get-zoom-recording] トークン取得失敗:', JSON.stringify(tokenData))
    return null
  }
  return tokenData.access_token
}

// 全ページ取得（next_page_token によるページネーション対応）
async function fetchAllRecordings(token: string, from: string, to: string): Promise<{
  owner?: { id?: string; name?: string; type?: string }
  callee_number?: string
  download_url?: string
  date_time?: string
}[]> {
  const all: {
    owner?: { id?: string; name?: string; type?: string }
    callee_number?: string
    download_url?: string
    date_time?: string
  }[] = []
  let nextPageToken = ''
  let page = 1

  do {
    const params = new URLSearchParams({ page_size: '100', from, to })
    if (nextPageToken) params.set('next_page_token', nextPageToken)
    const url = `https://api.zoom.us/v2/phone/recordings?${params}`

    console.log(`[get-zoom-recording] 録音API p${page}:`, url)
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    const data = await res.json()

    console.log(`[get-zoom-recording] 録音API p${page} HTTP:${res.status} total_records:${data.total_records ?? '?'} 件数:${(data.recordings || []).length}`)
    if (!res.ok) {
      console.error('[get-zoom-recording] 録音API エラー:', JSON.stringify(data))
      break
    }

    all.push(...(data.recordings || []))
    nextPageToken = data.next_page_token || ''
    page++
  } while (nextPageToken)

  return all
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ════════════════════════════════════════════════════════════════════════
  // モード download: GETリクエスト + クエリパラメータで音声をプロキシ返却
  // URL例: /functions/v1/get-zoom-recording?mode=download&recording_url=xxx&token=ANON_KEY
  // ════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const reqUrl = new URL(req.url)
    const mode         = reqUrl.searchParams.get('mode')
    const recordingUrl = reqUrl.searchParams.get('recording_url')

    if (mode === 'download' && recordingUrl) {
      console.log('[get-zoom-recording] モードdownload: recording_url:', recordingUrl)
      try {
        const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
        const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
        const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

        if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
          return new Response('Zoom credentials not configured', { status: 500, headers: corsHeaders })
        }

        const zoomToken = await getZoomToken(zoomAccountId, zoomClientId, zoomClientSecret)
        if (!zoomToken) {
          return new Response('Failed to get Zoom token', { status: 500, headers: corsHeaders })
        }

        console.log('[get-zoom-recording] 音声フェッチ中:', recordingUrl)
        const audioRes = await fetch(recordingUrl, {
          headers: { 'Authorization': `Bearer ${zoomToken}` },
        })
        console.log('[get-zoom-recording] 音声フェッチ HTTP:', audioRes.status)

        if (!audioRes.ok) {
          return new Response(`Zoom audio fetch failed: ${audioRes.status}`, { status: audioRes.status, headers: corsHeaders })
        }

        return new Response(audioRes.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': audioRes.headers.get('Content-Type') || 'audio/mpeg',
            'Content-Disposition': 'inline',
          },
        })
      } catch (err) {
        console.error('[get-zoom-recording] モードdownload エラー:', err)
        return new Response('Internal error', { status: 500, headers: corsHeaders })
      }
    }

    return new Response('Bad Request', { status: 400, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { zoom_user_id, callee_phone, called_at, prev_called_at, recording_url: inputRecordingUrl } = body

    console.log('[get-zoom-recording] リクエスト受信')
    console.log('[get-zoom-recording] zoom_user_id:', zoom_user_id ?? '(なし)')
    console.log('[get-zoom-recording] callee_phone:', callee_phone ?? '(なし)')
    console.log('[get-zoom-recording] called_at:', called_at ?? '(なし)')
    console.log('[get-zoom-recording] recording_url(入力):', inputRecordingUrl ?? '(なし)')

    const zoomAccountId    = Deno.env.get('ZOOM_ACCOUNT_ID')
    const zoomClientId     = Deno.env.get('ZOOM_CLIENT_ID')
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')

    if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
      console.error('[get-zoom-recording] Zoom認証情報が未設定')
      return new Response(
        JSON.stringify({ error: 'Zoom credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Zoomアクセストークン取得（両モード共通） ──────────────────────────
    console.log('[get-zoom-recording] Zoomアクセストークン取得中...')
    const zoomToken = await getZoomToken(zoomAccountId, zoomClientId, zoomClientSecret)
    if (!zoomToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Zoom token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('[get-zoom-recording] トークン取得成功')

    // ════════════════════════════════════════════════════════════════════════
    // モード A: recording_url が指定 → アクセストークン付きURLを返す
    // ════════════════════════════════════════════════════════════════════════
    if (inputRecordingUrl) {
      const sep = inputRecordingUrl.includes('?') ? '&' : '?'
      const authenticated_url = `${inputRecordingUrl}${sep}access_token=${zoomToken}`
      console.log('[get-zoom-recording] モードA: 認証済みURL生成完了')
      return new Response(
        JSON.stringify({ authenticated_url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ════════════════════════════════════════════════════════════════════════
    // モード B: zoom_user_id + callee_phone → 録音URLを検索
    // ════════════════════════════════════════════════════════════════════════
    if (!zoom_user_id) {
      console.error('[get-zoom-recording] zoom_user_id も recording_url も未指定')
      return new Response(
        JSON.stringify({ recording_url: null, found: false, error: 'zoom_user_id or recording_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[get-zoom-recording] モードB: 録音URL検索開始')
    console.log('[get-zoom-recording] callee_phone(正規化):', normalizePhone(callee_phone || ''))

    // ── 日付範囲: 今日 + 昨日（セッション長に関わらず全営業日の録音をカバー）
    // Zoom API の from/to は YYYY-MM-DD（UTC基準）
    // 昨日を下限にすることで日付またぎ・長時間セッションに対応
    const toDate   = new Date().toISOString().slice(0, 10)
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 全ページ取得（ページネーション対応）
    const allRecordings = await fetchAllRecordings(zoomToken, fromDate, toDate)
    console.log(`[get-zoom-recording] 全体取得完了: ${allRecordings.length} 件`)

    // 全録音のowner・callee_numberを出力（デバッグ用）
    console.log('[get-zoom-recording] 全録音一覧:')
    allRecordings.forEach((r, i) => {
      console.log(`  [${i + 1}] owner.id=${r.owner?.id ?? '—'} / callee=${r.callee_number ?? '—'} / caller=${(r as any).caller_number ?? '—'} / direction=${(r as any).direction ?? '—'} / date_time=${r.date_time ?? '—'}`)
    })

    // owner.id でフィルタ（APIレスポンスは owner.id のネスト構造）
    const myRecordings = allRecordings.filter(r => r.owner?.id === zoom_user_id)
    console.log(`[get-zoom-recording] owner.id="${zoom_user_id}" フィルタ後: ${myRecordings.length} 件`)

    // callee_phone でさらに絞り込む（outbound: callee_number, inbound: caller_number の両方をチェック）
    const calleePhoneNorm = normalizePhone(callee_phone || '')
    const phoneFiltered = calleePhoneNorm
      ? myRecordings.filter(r =>
          normalizePhone(r.callee_number || '') === calleePhoneNorm ||
          normalizePhone((r as any).caller_number || '') === calleePhoneNorm
        )
      : myRecordings
    console.log(`[get-zoom-recording] callee_phone="${calleePhoneNorm}" フィルタ後: ${phoneFiltered.length} 件`)

    // 時間ウィンドウ方式で録音を選択
    // 窓: prev_called_at < date_time <= called_at + 10分
    // +10分バッファ: Zoomサーバーとクライアントの時刻ずれ・録音処理遅延を吸収
    let target = null
    if (phoneFiltered.length > 0) {
      phoneFiltered.forEach(r => {
        console.log(`  [候補] date_time=${r.date_time ?? '—'} / called_at=${called_at ?? '—'} / prev_called_at=${prev_called_at ?? '—'}`)
      })
      if (called_at) {
        const calledTime    = new Date(called_at).getTime() + 10 * 60 * 1000  // +10分バッファ
        const prevTime      = prev_called_at ? new Date(prev_called_at).getTime() : null
        // 3時間以上前の録音は除外（通話時間の上限として保守的に設定）
        const earliestTime  = new Date(called_at).getTime() - 3 * 60 * 60 * 1000
        // 時間窓フィルタ: MAX(prev_called_at, called_at-3h) < date_time <= called_at + 10min
        const inWindow = phoneFiltered.filter(r => {
          const st = new Date(r.date_time || 0).getTime()
          if (st > calledTime) return false                              // called_at+10minより後 → 次の通話の録音
          if (prevTime !== null && st <= prevTime) return false         // prev_called_at 以前 → 前の通話の録音
          if (st < earliestTime) return false                           // called_at-3h以前 → 別日の古い録音
          return true
        })
        console.log(`[get-zoom-recording] 時間窓フィルタ後: ${inWindow.length}/${phoneFiltered.length} 件`)
        if (inWindow.length > 0) {
          target = inWindow.sort((a, b) => (b.date_time || '').localeCompare(a.date_time || ''))[0]
          console.log(`[get-zoom-recording] 選択: date_time=${target?.date_time ?? '—'}`)
        } else {
          console.log('[get-zoom-recording] 時間窓内の録音なし → null を返す')
          target = null
        }
      } else {
        // called_at なし（AppoReportModal等）: 最新を選択
        target = phoneFiltered.sort((a, b) => (b.date_time || '').localeCompare(a.date_time || ''))[0]
        console.log(`[get-zoom-recording] called_at未指定: 最新録音を選択 date_time=${target?.date_time ?? '—'}`)
      }
    }

    const recording_url = target?.download_url || null
    console.log('[get-zoom-recording] 取得結果 recording_url:', recording_url ?? '(なし)')

    return new Response(
      JSON.stringify({ recording_url, found: !!recording_url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[get-zoom-recording] 予期せぬエラー:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
