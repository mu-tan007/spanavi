// ============================================================
// スパキャリ セッション動画 → AI議事録 共通ヘルパー
// ----------------------------------------------------------------
// 営業代行のロープレ機能（TrainingRoleplaySection + analyze-roleplay）と
// 同じ要領のパイプラインをスパキャリ用に提供する。
//
//   1. uploadSessionVideoWithAudio:
//      動画本体を TUS で spacareer-session-videos にアップロードしつつ、
//      ブラウザ側で ffmpeg.wasm により Whisper 用 MP3 (32kbps mono) を抽出して
//      同バケットに並置 → spacareer_session_videos に1行登録する。
//      音声抽出は大容量動画で失敗し得るため、失敗しても動画のみで続行する
//      （その場合 Edge Function 側が動画冒頭を truncate して文字起こしする）。
//
//   2. generateSessionMinutes:
//      analyze-spacareer-session Edge Function を invoke し、
//      spacareer_session_videos.ai_status を done/error までポーリングする。
//      完了時には spacareer_sessions.minutes_draft が更新されている。
//
// 呼び出し元: CustomerDetail/SessionCompleteFlow.jsx, TabKickoff.jsx
// ============================================================
import { supabase } from '../supabase';
import { getOrgId } from '../orgContext';
import { uploadVideoResumable } from './integrations/videoUpload';
import { prepareAudioForWhisper } from '../convertAudio';

const SESSION_BUCKET = 'spacareer-session-videos';

function genUid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * セッション動画 + 抽出音声をアップロードし、spacareer_session_videos に登録する。
 *
 * @param {object} p
 * @param {string} p.customerId
 * @param {string} p.sessionId
 * @param {File}   p.file                動画ファイル
 * @param {(pct: number) => void} [p.onVideoProgress]  動画アップロード進捗 (0-100)
 * @param {(msg: string) => void} [p.onStatus]         状態メッセージ（音声抽出など）
 * @returns {Promise<{ videoId: string|null, audioWarning: string|null, error: unknown }>}
 */
export async function uploadSessionVideoWithAudio({
  customerId, sessionId, file, onVideoProgress, onStatus,
}) {
  const orgId = getOrgId();
  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch ? extMatch[1] : 'mp4').toLowerCase();
  const uid = genUid();
  const basePath = `${orgId}/${customerId}/${sessionId}/${uid}`;
  const videoPath = `${basePath}.${ext}`;

  // 1. 動画本体（TUS: 2GBまで）
  const { error: upErr } = await uploadVideoResumable({
    bucket: SESSION_BUCKET,
    path: videoPath,
    file,
    contentType: file.type || 'video/mp4',
    upsert: false,
    onProgress: (uploaded, total) => {
      if (total > 0) onVideoProgress?.(Math.floor((uploaded / total) * 100));
    },
  });
  if (upErr) return { videoId: null, audioWarning: null, error: upErr };

  // 2. Whisper 用 MP3 抽出（ロープレと同じ convertAudio 基盤）。
  //    数GB級では wasm のメモリ上限で失敗し得るので、失敗しても動画のみで続行。
  let audioPath = null;
  let audioWarning = null;
  try {
    onStatus?.('音声を抽出中...（議事録の文字起こしに使用します）');
    const audioFile = await prepareAudioForWhisper(file, onStatus);
    if (audioFile !== file) {
      audioPath = `${basePath}_audio.mp3`;
      onStatus?.('抽出した音声をアップロード中...');
      const { error: audioErr } = await uploadVideoResumable({
        bucket: SESSION_BUCKET,
        path: audioPath,
        file: audioFile,
        contentType: 'audio/mpeg',
        upsert: false,
      });
      if (audioErr) throw audioErr;
    } else {
      // 24MB以下のWhisper対応形式はそのまま動画を文字起こしに使える
      audioPath = null;
    }
  } catch (e) {
    console.warn('[sessionMinutes] audio extract failed, fallback to video:', e);
    audioPath = null;
    audioWarning = '音声の抽出に失敗したため、議事録は動画冒頭部分のみの文字起こしになる可能性があります。';
  }

  // 3. レコード登録
  const { data, error: insErr } = await supabase
    .from('spacareer_session_videos')
    .insert({
      org_id: orgId,
      session_id: sessionId,
      storage_path: videoPath,
      audio_storage_path: audioPath,
      file_size_bytes: file.size,
      ai_status: 'pending',
    })
    .select('id')
    .single();
  if (insErr) return { videoId: null, audioWarning, error: insErr };

  return { videoId: data.id, audioWarning, error: null };
}

/**
 * AI議事録生成を起動し、完了までポーリングする。
 * 完了時には spacareer_sessions.minutes_draft が更新済み。
 *
 * @param {object} p
 * @param {string} p.sessionId   spacareer_sessions.id
 * @param {string} [p.customerId] 利用ログ集計用
 * @param {string} [p.videoId]    対象動画。省略時はセッションの最新動画
 * @param {number} [p.timeoutMs]  ポーリング最大時間（default 10分）
 * @returns {Promise<{ minutesDraft: string|null }>} 失敗時は throw
 */
export async function generateSessionMinutes({
  sessionId, customerId, videoId, timeoutMs = 10 * 60 * 1000,
}) {
  // 対象動画の解決（指定がなければ最新）
  let targetId = videoId;
  if (!targetId) {
    const { data: latest, error: vErr } = await supabase
      .from('spacareer_session_videos')
      .select('id')
      .eq('session_id', sessionId)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!latest) throw new Error('このセッションにはまだ動画がアップロードされていません。');
    targetId = latest.id;
  }

  const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
    'analyze-spacareer-session',
    { body: { session_id: sessionId, session_video_id: targetId, customer_id: customerId || null } },
  );
  if (invokeErr) throw new Error(`議事録生成の起動に失敗しました: ${invokeErr.message || invokeErr}`);
  if (invokeData?.error) throw new Error(`議事録生成の起動に失敗しました: ${invokeData.error}`);

  // ai_status を done / error までポーリング（5秒間隔）
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data: row, error: pollErr } = await supabase
      .from('spacareer_session_videos')
      .select('ai_status, ai_error')
      .eq('id', targetId)
      .single();
    if (pollErr) continue; // 一時的な取得失敗はリトライ
    if (row.ai_status === 'done') {
      const { data: sess } = await supabase
        .from('spacareer_sessions')
        .select('minutes_draft')
        .eq('id', sessionId)
        .single();
      return { minutesDraft: sess?.minutes_draft || null };
    }
    if (row.ai_status === 'error') {
      throw new Error(row.ai_error || 'AI議事録の生成に失敗しました。再度お試しください。');
    }
  }
  throw new Error('AI議事録の生成がタイムアウトしました。しばらくしてからページを再読込してください（処理は継続している場合があります）。');
}
