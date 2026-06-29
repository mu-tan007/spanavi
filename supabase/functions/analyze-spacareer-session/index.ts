// ============================================================
// analyze-spacareer-session
// ----------------------------------------------------------------
// スパキャリ セッション動画 → AI 議事録 パイプライン。
// 既存 analyze-roleplay (Whisper + Claude Haiku 4.5) のパターンを踏襲。
//
// 入力:
//   {
//     session_id: uuid              -- spacareer_sessions.id
//     session_video_id: uuid        -- spacareer_session_videos.id
//     storage_path?: string         -- spacareer-session-videos バケットのパス
//     recording_url?: string        -- 外部URL（fallback）
//     customer_id?: uuid            -- ログ集計用
//   }
//
// 出力（即時）:
//   { status: 'processing', session_video_id }
//
// バックグラウンド完了後の DB 更新先:
//   spacareer_session_videos.{ ai_status, transcript, ai_feedback, ai_error }
//   spacareer_sessions.minutes_draft（議事録ドラフト文字列）
//   spacareer_ai_usage_logs (feature='minutes_generation')
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const STORAGE_BUCKET = 'spacareer-session-videos'

// 議事録生成モデル。ロープレ(Haiku 4.5)より情報密度の濃い議事録が要件のため、
// 長尺文字起こしの構造化に強い Sonnet 4.6 を使う（$3/$15 per 1M tokens）。
const MINUTES_MODEL = 'claude-sonnet-4-6'
// 長尺セッション(60〜90分)の構造化議事録は出力が長くなりやすい。8192だと
// 出力途中で max_tokens に達して JSON が途切れ →「結果が空」になっていたため引き上げる。
const MINUTES_MAX_TOKENS = 16000
// cost_usd 計算用 (USD per 1M tokens)
const COST_INPUT_PER_M = 3.0
const COST_OUTPUT_PER_M = 15.0

// Whisper の上限: 25 MB
// セッションは60〜90分が普通なので、ロープレ(15MB)より広めに取り
// 32kbps mono MP3 で約100分まで丸ごと文字起こしできるようにする。
const SAFE_LIMIT = 24 * 1024 * 1024 // 24 MB（Whisper上限ギリギリ手前で truncate）

// Whisper 並列文字起こし設定。
// 80〜100分(18〜24MB)の音声を1回の Whisper 呼び出しで文字起こしすると、
// OpenAI 側処理が 280s を超えて Edge Function の wall-clock 上限(Pro=400s)に
// 収まらず「Signal timed out」で失敗していた。そこで MP3 をフレーム境界で
// 約4MB(≒17分)ずつに分割し、並列(Promise.all)で文字起こしして結合する。
// 並列なので全体の所要時間は「最も遅い1チャンク」分（概ね60〜120s）に収まる。
const WHISPER_CHUNK_BYTES = 4 * 1024 * 1024  // 1チャンクの目安サイズ（≒17分）
const WHISPER_CHUNK_TIMEOUT_MS = 150_000     // 1チャンクあたりのタイムアウト
const WHISPER_SINGLE_TIMEOUT_MS = 200_000    // 非MP3(mp4等)の単発呼び出し用

const EXT_ALIAS: Record<string, string> = {
  mov: 'mp4',
  aac: 'm4a',
  wma: 'mp3',
  aiff: 'wav',
  avi: 'mp4',
  '3gp': 'mp4',
}

const MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
}

// プロンプト：スパキャリ向け議事録生成
// 営業代行ロープレ（総評+課題+ドリルの「評価レポート」型）とは別物として設計。
// キャリアコーチングのセッション記録として、
//   1) トレーナーが次回前に読み返す「申し送り資料」
//   2) 受講生に渡せる「セッションの記録」
// の両方を1本で満たす、情報密度の高い議事録を作る。
const SYSTEM_PROMPT = `あなたはキャリアコーチング「スパキャリ」のセッション議事録作成の専門家です。
受講生（お客様）とトレーナーの1on1セッションの文字起こしを読み、情報密度の高い構造化議事録を作成します。
この議事録は (1)トレーナーが次回セッション前に読み返す申し送り資料、(2)受講生に共有するセッション記録、の両方に使われます。

出力は必ず以下の JSON フォーマットのみを返してください（前後のテキストは一切不要）：

{
  "summary": "セッション全体の要約（400〜600字。何を扱い、どこまで進み、何が決まったかが一読で分かるように）",
  "homeworkReview": ["事前課題・前回宿題の振り返りで話された内容（提出状況、回答内容への言及、そこから広がった話）"],
  "topics": [
    {
      "heading": "トピック名（具体的に。例:「現職の評価制度への不満と転職動機の整理」）",
      "points": ["議論の流れと具体的内容。固有名詞・数値・経緯を省略せずに書く", "..."],
      "quotes": ["受講生本人の重要発言を原文のまま「」で引用（言い回し・ニュアンスを保持）", "..."],
      "takeaways": ["このトピックで得られた気づき・結論", "..."]
    }
  ],
  "studentCondition": ["受講生の状態観察（モチベーションの高低、感情の動き、迷い・不安、前回からの変化）"],
  "studentQuestions": ["セッション中に受講生（お客様）から出た質問・疑問・気になり事を、できるだけ原文のニュアンスを保って列挙する。質問への回答が出ていればその要旨も併記する。明確な質問が無ければ空配列"],
  "decisions": ["このセッションで決まったこと（方針・選択・合意事項）"],
  "openIssues": ["話し切れなかった・結論が出なかった持ち越し論点"],
  "nextActionsStudent": ["受講生が次回までにやること（期限・回数など数値があれば必ず含める）"],
  "nextActionsTrainer": ["トレーナー側がやること（資料準備、紹介、確認事項など）"],
  "homework": ["次回までの宿題として明示されたもの"],
  "nextSessionFocus": ["次回セッションで深掘りすべき論点・トレーナーが投げるべき問い"],
  "trainerNotes": "トレーナー専用の申し送りメモ（200字以内。受講生には見せない前提で、扱いの注意点・本音の兆候・リスクなど）"
}

記述ルール（情報密度を最優先）:
- 固有名詞（企業名・職種名・人名・サービス名）、数値（年収・期限・回数・年数）は絶対に丸めず原文どおり書く
- topics はセッションの時系列順に4〜8個。1トピックにつき points 3〜8個、quotes 1〜4個を目安に厚く書く
- 引用 quotes は要約せず、受講生の言い回しをそのまま残す（「」で括る）
- 結論・気づき・宿題・アクションは必ず分離し、重複させない
- 文字起こしに無いことは書かない。推測・憶測・一般論での水増しは禁止
- 該当する内容が無い項目は空配列 [] にする（無理に埋めない）
- 日本語、敬体ではなく簡潔な箇条書きスタイル`

type MinutesAI = {
  summary?: string
  homeworkReview?: string[]
  topics?: Array<{ heading?: string; points?: string[]; quotes?: string[]; takeaways?: string[] }>
  studentCondition?: string[]
  studentQuestions?: string[]
  decisions?: string[]
  openIssues?: string[]
  nextActionsStudent?: string[]
  nextActionsTrainer?: string[]
  homework?: string[]
  nextSessionFocus?: string[]
  trainerNotes?: string
  // 旧フォーマット互換（再分析前の既存データ表示用）
  sections?: Array<{ heading?: string; bullets?: string[] }>
  nextActions?: string[]
}

function pushList(lines: string[], heading: string, items?: string[]) {
  if (!items || !items.length) return
  lines.push(`### ${heading}`)
  for (const it of items) lines.push(`- ${it}`)
  lines.push('')
}

function buildMinutesDraftText(ai: MinutesAI): string {
  const lines: string[] = []
  lines.push('## セッション議事録（AI 自動生成ドラフト）')
  lines.push('')
  if (ai.summary) {
    lines.push('### 全体サマリー')
    lines.push(ai.summary)
    lines.push('')
  }
  pushList(lines, '事前課題・前回宿題の振り返り', ai.homeworkReview)
  for (const t of ai.topics || []) {
    if (!t.heading) continue
    lines.push(`### ${t.heading}`)
    for (const p of t.points || []) lines.push(`- ${p}`)
    for (const q of t.quotes || []) lines.push(`- 発言: ${q}`)
    for (const k of t.takeaways || []) lines.push(`- 気づき: ${k}`)
    lines.push('')
  }
  // 旧フォーマット互換
  for (const s of ai.sections || []) {
    if (!s.heading) continue
    lines.push(`### ${s.heading}`)
    for (const b of s.bullets || []) lines.push(`- ${b}`)
    lines.push('')
  }
  pushList(lines, '受講生の状態', ai.studentCondition)
  pushList(lines, 'セッション中にいただいたご質問', ai.studentQuestions)
  pushList(lines, '決定事項', ai.decisions)
  pushList(lines, '持ち越し論点', ai.openIssues)
  pushList(lines, '次回までのアクション（受講生）', ai.nextActionsStudent || ai.nextActions)
  pushList(lines, '次回までのアクション（トレーナー）', ai.nextActionsTrainer)
  pushList(lines, '次回までの宿題', ai.homework)
  pushList(lines, '次回セッションの焦点', ai.nextSessionFocus)
  if (ai.trainerNotes) {
    lines.push('### トレーナー専用メモ（受講生向けに共有する場合はこの節を削除）')
    lines.push(ai.trainerNotes)
    lines.push('')
  }
  lines.push('※ AI 生成ドラフトです。トレーナーが必ず確認・修正してください。')
  return lines.join('\n')
}

// MP3 のフレーム同期語(0xFF 0xEx)を from 以降から探す。見つからなければ末尾。
function findMp3FrameSync(buf: Uint8Array, from: number): number {
  for (let i = Math.max(0, from); i < buf.length - 1; i++) {
    if (buf[i] === 0xFF && (buf[i + 1] & 0xE0) === 0xE0) return i
  }
  return buf.length
}

// MP3 を「完全なフレーム列」で始まる複数チャンクに分割する。
// 各チャンクは単体で Whisper に渡せる有効な MP3 ストリームになる。
function splitMp3ByFrames(buffer: ArrayBuffer, targetBytes: number): ArrayBuffer[] {
  const bytes = new Uint8Array(buffer)
  if (bytes.length <= targetBytes) return [buffer]
  const offsets: number[] = [0]
  let pos = targetBytes
  while (pos < bytes.length) {
    const sync = findMp3FrameSync(bytes, pos)
    if (sync >= bytes.length) break
    // 直前の境界と同一/逆行は避ける（無限ループ防止）
    if (sync <= offsets[offsets.length - 1]) { pos = sync + targetBytes; continue }
    offsets.push(sync)
    pos = sync + targetBytes
  }
  offsets.push(bytes.length)
  const chunks: ArrayBuffer[] = []
  for (let i = 0; i < offsets.length - 1; i++) {
    if (offsets[i + 1] > offsets[i]) chunks.push(buffer.slice(offsets[i], offsets[i + 1]))
  }
  return chunks.length ? chunks : [buffer]
}

// 1チャンクを Whisper で文字起こし。失敗時は throw（上位の catch でまとめて処理）。
async function whisperTranscribeChunk(
  chunk: ArrayBuffer, idx: number, whisperExt: string, contentType: string,
  openaiKey: string, timeoutMs: number,
): Promise<string> {
  const fd = new FormData()
  fd.append('file', new Blob([chunk], { type: contentType }), `recording_${idx}.${whisperExt}`)
  fd.append('model', 'whisper-1')
  fd.append('language', 'ja')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}` },
    body: fd,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Whisper chunk ${idx} HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data.text as string) || ''
}

// Claude応答テキストから JSON オブジェクト文字列を堅牢に取り出す。
// - ```json ... ``` のコードフェンスを剥がす
// - 最初の { から最後の } までを対象にする（前後の説明文を無視）
function extractJsonText(text: string): string | null {
  let t = (text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return t.slice(start, end + 1)
}

function parseMinutes(text: string): { ai: MinutesAI; error: string | null } {
  const jsonText = extractJsonText(text)
  if (!jsonText) return { ai: {}, error: 'AI 応答に JSON 構造が含まれていません' }
  try {
    return { ai: JSON.parse(jsonText) as MinutesAI, error: null }
  } catch (e) {
    return { ai: {}, error: `JSON parse error: ${(e as Error).message}` }
  }
}

function minutesHasContent(ai: MinutesAI): boolean {
  return !!(ai.summary
    || (ai.topics && ai.topics.length)
    || (ai.decisions && ai.decisions.length)
    || (ai.sections && ai.sections.length)
    || (ai.nextActionsStudent && ai.nextActionsStudent.length)
    || (ai.nextActions && ai.nextActions.length))
}

// Claude を1回呼び出して議事録JSONテキストを得る。
// assistant ロールに "{" を prefill することで、説明文やコードフェンスを挟まず
// 必ず JSON オブジェクトの本文から書き始めさせる（空・パース失敗の主因対策）。
async function callClaudeMinutes(
  userPrompt: string, anthropicKey: string,
): Promise<{ text: string; usage: any; stopReason: string | null; httpError: string | null }> {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MINUTES_MODEL,
      max_tokens: MINUTES_MAX_TOKENS,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: '{' },
      ],
    }),
    signal: AbortSignal.timeout(200_000),
  })
  if (!claudeRes.ok) {
    const errText = await claudeRes.text()
    return { text: '', usage: {}, stopReason: null, httpError: errText.slice(0, 300) }
  }
  const claudeData = await claudeRes.json()
  // prefill した "{" は応答テキストに含まれないため復元する
  const text = '{' + (claudeData.content?.[0]?.text || '')
  return { text, usage: claudeData.usage || {}, stopReason: claudeData.stop_reason ?? null, httpError: null }
}

// ── バックグラウンド処理 ──────────────────────────────────────
async function processInBackground(
  session_id: string,
  session_video_id: string,
  storage_path?: string,
  recording_url?: string,
  customer_id?: string,
) {
  // 動画レコードから org_id（usage_logs の NOT NULL 制約用）と
  // 音声/動画パスを解決する。フロントは session_video_id だけ渡せばよい。
  const { data: videoRow } = await supabase
    .from('spacareer_session_videos')
    .select('org_id, storage_path, audio_storage_path, recording_url')
    .eq('id', session_video_id)
    .maybeSingle()
  const orgId: string | null = videoRow?.org_id ?? null
  // ブラウザ抽出済みの MP3 があれば最優先（動画 truncate より精度・網羅性が高い）
  if (videoRow?.audio_storage_path) storage_path = videoRow.audio_storage_path
  else if (!storage_path && videoRow?.storage_path) storage_path = videoRow.storage_path
  if (!recording_url && videoRow?.recording_url) recording_url = videoRow.recording_url

  const failVideo = async (message: string, detail?: string) => {
    await supabase.from('spacareer_session_videos').update({
      ai_status: 'error',
      ai_error: message,
      ai_feedback: detail ? { error: message, detail } : { error: message },
      processed_at: new Date().toISOString(),
    }).eq('id', session_video_id)
    if (orgId) {
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id: customer_id ?? null,
        feature: 'minutes_generation',
        model: MINUTES_MODEL,
        status: 'error',
        error_message: detail ? `${message}: ${detail}` : message,
      })
    }
  }

  if (!videoRow) {
    await failVideo('対象の動画レコードが見つかりません')
    return
  }

  try {
    // ── 1. 音声ファイルダウンロード ─────────────────────────
    let audioBuffer: ArrayBuffer
    let rawExt = 'mp4'

    if (storage_path) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storage_path, 300)
      if (signedUrlError || !signedUrlData?.signedUrl) {
        await failVideo('動画ファイルの取得に失敗しました', signedUrlError?.message || 'signed url failed')
        return
      }
      const storageRes = await fetch(signedUrlData.signedUrl, {
        signal: AbortSignal.timeout(40_000),
      })
      if (!storageRes.ok) {
        await failVideo('ストレージからのダウンロードに失敗しました', `HTTP ${storageRes.status}`)
        return
      }
      audioBuffer = await storageRes.arrayBuffer()
      rawExt = storage_path.split('.').pop()?.toLowerCase() || 'mp4'
    } else if (recording_url) {
      const res = await fetch(recording_url, {
        headers: { 'User-Agent': 'Spanavi-Spacareer/1.0' },
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        await failVideo('URL からのダウンロードに失敗しました', `HTTP ${res.status} ${res.statusText}`)
        return
      }
      audioBuffer = await res.arrayBuffer()
      const urlPath = new URL(recording_url).pathname
      rawExt = urlPath.split('.').pop()?.toLowerCase() || 'mp4'
    } else {
      await failVideo('動画ソースが指定されていません')
      return
    }

    // ── 2. Whisper 対応形式に正規化 ──────────────────────────
    const whisperExt = EXT_ALIAS[rawExt] ?? rawExt
    const contentType = MIME_MAP[whisperExt] ?? 'audio/mp4'

    // ── 3. サイズ truncate ───────────────────────────────────
    let finalBuffer = audioBuffer
    let sizeNote = ''
    if (audioBuffer.byteLength > SAFE_LIMIT) {
      finalBuffer = audioBuffer.slice(0, SAFE_LIMIT)
      sizeNote = '（ファイル冒頭部分のみ分析）'
      console.log(`[analyze-spacareer-session] Truncated ${rawExt} (${audioBuffer.byteLength}B) → ${finalBuffer.byteLength}B`)
    }
    // ── 4. Whisper で文字起こし（MP3は分割して並列実行）──────
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      await failVideo('OPENAI_API_KEY が設定されていません')
      return
    }

    // MP3 は約17分ごとに分割して並列文字起こし（長尺でも wall-clock 内に収める）。
    // 非MP3(mp4等のフォールバック)は分割できないため単発(200s)で処理する。
    let transcript = ''
    try {
      if (whisperExt === 'mp3' && finalBuffer.byteLength > WHISPER_CHUNK_BYTES) {
        const chunks = splitMp3ByFrames(finalBuffer, WHISPER_CHUNK_BYTES)
        console.log(`[analyze-spacareer-session] whisper parallel chunks=${chunks.length} totalBytes=${finalBuffer.byteLength}`)
        const parts = await Promise.all(
          chunks.map((c, i) => whisperTranscribeChunk(c, i, whisperExt, contentType, openaiKey, WHISPER_CHUNK_TIMEOUT_MS)),
        )
        transcript = parts.join('\n').trim()
      } else {
        transcript = (await whisperTranscribeChunk(finalBuffer, 0, whisperExt, contentType, openaiKey, WHISPER_SINGLE_TIMEOUT_MS)).trim()
      }
    } catch (we) {
      const isTo = (we as Error)?.name === 'TimeoutError' || /timed out|aborted/i.test((we as Error)?.message || '')
      console.error('[analyze-spacareer-session] Whisper error:', we)
      await failVideo(
        isTo ? '文字起こしがタイムアウトしました。再度お試しください。' : '文字起こしに失敗しました（Whisper）',
        (we as Error)?.message || 'whisper failed',
      )
      return
    }
    if (!transcript) {
      await failVideo('文字起こし結果が空でした', 'whisper returned empty text')
      return
    }

    // ── 5. Claude で構造化議事録 ────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await failVideo('ANTHROPIC_API_KEY が設定されていません')
      return
    }

    const userPrompt = `${SYSTEM_PROMPT}\n\n${sizeNote ? `※ ${sizeNote}\n\n` : ''}【セッション文字起こし】\n${transcript}`

    // Claude 呼び出し → JSON 抽出。空・パース失敗（フェンス混入や出力途切れ等）の場合は
    // 1 回だけ自動リトライしてから諦める。「結果が空」での失敗を実質的に潰す。
    // 想定 wall-clock: download40s + whisper(並列)〜150s + claude(最大2回)≦ 400s(Pro上限) に収まる範囲で運用。
    let aiFeedback: MinutesAI = {}
    let parseError: string | null = null
    let claudeText = ''
    let usage: any = {}
    let inputTokensTotal = 0
    let outputTokensTotal = 0
    const MAX_ATTEMPTS = 2
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const r = await callClaudeMinutes(userPrompt, anthropicKey)
      if (r.httpError) {
        console.error('[analyze-spacareer-session] Claude error:', r.httpError)
        // HTTP エラーは最終試行なら失敗確定、それ以外はリトライ
        if (attempt >= MAX_ATTEMPTS) {
          await failVideo('AI 議事録生成に失敗しました（Claude）', r.httpError)
          return
        }
        parseError = `Claude HTTP error: ${r.httpError}`
        continue
      }
      claudeText = r.text
      usage = r.usage
      inputTokensTotal += usage.input_tokens ?? 0
      outputTokensTotal += usage.output_tokens ?? 0
      const parsed = parseMinutes(claudeText)
      aiFeedback = parsed.ai
      parseError = parsed.error
      if (r.stopReason === 'max_tokens' && !parseError) {
        // 稀に上限到達で末尾が欠ける。パース成功していれば内容判定へ進む。
        console.warn('[analyze-spacareer-session] stop_reason=max_tokens (attempt ' + attempt + ')')
      }
      if (minutesHasContent(aiFeedback)) break
      console.warn(`[analyze-spacareer-session] empty/parse-fail attempt ${attempt}/${MAX_ATTEMPTS}: ${parseError || 'no content'}`)
    }

    const hasContent = minutesHasContent(aiFeedback)
    if (!hasContent) {
      await supabase.from('spacareer_session_videos').update({
        ai_status: 'error',
        transcript,
        ai_error: 'AI 議事録の結果が空でした。再分析してください。',
        ai_feedback: {
          error: 'AI 議事録の結果が空でした',
          detail: parseError || 'unknown',
          raw_excerpt: claudeText.slice(0, 500),
        },
        processed_at: new Date().toISOString(),
      }).eq('id', session_video_id)
      if (orgId) {
        await supabase.from('spacareer_ai_usage_logs').insert({
          org_id: orgId,
          customer_id: customer_id ?? null,
          feature: 'minutes_generation',
          model: MINUTES_MODEL,
          input_tokens: inputTokensTotal || null,
          output_tokens: outputTokensTotal || null,
          status: 'error',
          error_message: parseError || 'empty ai response',
        })
      }
      return
    }

    // ── 6. DB 更新 ──────────────────────────────────────────
    const minutesDraft = buildMinutesDraftText(aiFeedback)
    const now = new Date().toISOString()

    const { error: videoUpdErr } = await supabase
      .from('spacareer_session_videos')
      .update({
        transcript,
        ai_feedback: aiFeedback,
        ai_status: 'done',
        processed_at: now,
      })
      .eq('id', session_video_id)
    if (videoUpdErr) console.error('[analyze-spacareer-session] session_video update error:', videoUpdErr)

    const { error: sessUpdErr } = await supabase
      .from('spacareer_sessions')
      .update({ minutes_draft: minutesDraft })
      .eq('id', session_id)
    if (sessUpdErr) console.error('[analyze-spacareer-session] session update error:', sessUpdErr)

    // 利用ログ（リトライした場合は全試行分を合算）
    const inputTokens = inputTokensTotal
    const outputTokens = outputTokensTotal
    const costUsd = Number(((inputTokens / 1_000_000) * COST_INPUT_PER_M + (outputTokens / 1_000_000) * COST_OUTPUT_PER_M).toFixed(6))
    if (orgId) {
      await supabase.from('spacareer_ai_usage_logs').insert({
        org_id: orgId,
        customer_id: customer_id ?? null,
        feature: 'minutes_generation',
        model: MINUTES_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        status: 'success',
      })
    }

    console.log(`[analyze-spacareer-session] done session_video_id=${session_video_id}`)
  } catch (err) {
    console.error('[analyze-spacareer-session] unhandled:', err)
    const isTimeout = (err as Error)?.name === 'TimeoutError'
      || /timed out|aborted/i.test((err as Error)?.message || '')
    const message = isTimeout
      ? 'AI 議事録の生成がタイムアウトしました（動画が長すぎる可能性があります）。再度お試しください。'
      : 'AI 議事録生成中に予期しないエラーが発生しました'
    await failVideo(message, (err as Error).message)
  }
}

// ── メインハンドラ ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { session_id, session_video_id, storage_path, recording_url, customer_id } = await req.json()

    // storage_path / recording_url は省略可（session_video_id の行から解決する）
    if (!session_id || !session_video_id) {
      return new Response(
        JSON.stringify({ error: 'session_id and session_video_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 1. ai_status を 'processing' に ───────────────────────
    await supabase.from('spacareer_session_videos')
      .update({ ai_status: 'processing' })
      .eq('id', session_video_id)

    const bgPromise = processInBackground(session_id, session_video_id, storage_path, recording_url, customer_id)

    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime.waitUntil(bgPromise)
      return new Response(
        JSON.stringify({ status: 'processing', session_video_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ローカル / EdgeRuntime 無しの場合は同期完了
    await bgPromise
    const { data } = await supabase
      .from('spacareer_session_videos')
      .select('ai_status, transcript, ai_feedback, ai_error')
      .eq('id', session_video_id)
      .single()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[analyze-spacareer-session] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
