// ============================================================
// §8.1 AI議事録自動生成
// ----------------------------------------------------------------
// 既存 supabaseWrite.js の invokeAnalyzeRoleplay / pollRoleplayAnalysis
// と同じパターン。Edge Function: analyze-spacareer-session
// ============================================================
import { supabase } from '../../supabase';
import { logSpacareerAiUsage } from './usageLog';

export type MinutesAnalysisStatus = 'pending' | 'processing' | 'done' | 'error';

export type MinutesAnalysisPayload = {
  session_id: string;          // spacareer_sessions.id
  session_video_id: string;    // spacareer_session_videos.id
  storage_path?: string;       // Storage パス（推奨）
  recording_url?: string;      // 外部URL（fallback）
  customer_id?: string;        // ログ記録用
};

export type MinutesAnalysisResult = {
  status: MinutesAnalysisStatus;
  transcript?: string | null;
  ai_feedback?: unknown;
  error?: string | null;
};

/**
 * analyze-spacareer-session Edge Function を呼び出す。
 * Edge Function 側は即座に { status: 'processing' } を返し、
 * バックグラウンドで Whisper → Claude Haiku 4.5 を実行する。
 */
export async function invokeAnalyzeSpacareerSession(
  payload: MinutesAnalysisPayload,
): Promise<{ data: MinutesAnalysisResult | { error: string } | null; error: unknown }> {
  const { data, error } = await supabase.functions.invoke('analyze-spacareer-session', {
    body: payload,
  });
  if (error) {
    console.error('[Edge] analyze-spacareer-session error:', error);
    // 既存 invokeAnalyzeRoleplay と同様、context から本体メッセージを抽出
    // deno-lint-ignore no-explicit-any
    const ctx = (error as any)?.context;
    if (ctx) {
      try {
        const body = await ctx.json();
        const msg = body?.error || body?.message || null;
        if (msg) return { data: { error: msg }, error: null };
      } catch { /* noop */ }
    }
  }
  return { data: data as MinutesAnalysisResult, error };
}

/**
 * 議事録生成のポーリング。spacareer_session_videos.ai_status を監視。
 */
export async function pollSpacareerMinutesAnalysis(
  sessionVideoId: string,
  { intervalMs = 5000, timeoutMs = 300_000, signal }: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<MinutesAnalysisResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const poll = async () => {
      if (signal?.aborted) {
        clearInterval(intervalId);
        resolve({ status: 'error', error: '議事録生成がキャンセルされました。' });
        return;
      }
      try {
        const { data, error } = await supabase
          .from('spacareer_session_videos')
          .select('ai_status, transcript, ai_feedback, ai_error')
          .eq('id', sessionVideoId)
          .single();

        if (error) {
          console.error('[Poll] spacareer minutes error:', error);
          return; // transient
        }
        if (data.ai_status === 'done') {
          clearInterval(intervalId);
          resolve({
            status: 'done',
            transcript: data.transcript,
            ai_feedback: data.ai_feedback,
          });
          return;
        }
        if (data.ai_status === 'error') {
          clearInterval(intervalId);
          resolve({
            status: 'error',
            error: data.ai_error || (typeof data.ai_feedback === 'object' && data.ai_feedback && 'error' in (data.ai_feedback as object) ? (data.ai_feedback as { error?: string }).error : null) || 'AI議事録生成でエラーが発生しました。',
          });
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          resolve({ status: 'error', error: '議事録生成がタイムアウトしました。再度お試しください。' });
        }
      } catch (e) {
        console.error('[Poll] spacareer minutes unexpected:', e);
      }
    };
    const intervalId = setInterval(poll, intervalMs);
    poll();
  });
}

/**
 * 完了通知用：spacareer_sessions.minutes_draft に AI 生成議事録を反映。
 * Edge Function 側でも書き込むが、UI 側で議事録テキストを手動編集した際の保存にも使う。
 */
export async function saveMinutesDraft(
  sessionId: string,
  minutesDraft: string,
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('spacareer_sessions')
    .update({ minutes_draft: minutesDraft })
    .eq('id', sessionId);
  if (error) console.error('[DB] saveMinutesDraft error:', error);
  return { error };
}

// 利用ログのフロント側ラッパー（Edge Function 側でも記録するが、フロント呼び出し失敗時の検知用に提供）
export async function logMinutesUsage(
  customerId: string,
  status: 'success' | 'error',
  errorMessage?: string,
): Promise<void> {
  return logSpacareerAiUsage({
    feature: 'minutes_generation',
    customerId,
    status,
    errorMessage,
  });
}
