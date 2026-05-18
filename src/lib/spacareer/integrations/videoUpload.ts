// ============================================================
// スパキャリ 動画アップロード基盤
// 仕様書 §9.2 動画ホスティング
// ----------------------------------------------------------------
// 既存 uploadRoleplayRecording (src/lib/supabaseWrite.js) のパターンを
// 流用し、バケットだけ spacareer-session-videos / spacareer-course-videos
// に分離した実装。
// ============================================================
import { supabase } from '../../supabase';
import { getOrgId } from '../../orgContext';

const SESSION_BUCKET = 'spacareer-session-videos';
const COURSE_BUCKET = 'spacareer-course-videos';

export type UploadResult = {
  path: string | null;
  url: string | null;
  error: unknown;
};

/**
 * セッション動画をアップロード（AI議事録生成あり）。
 * 既存 uploadRoleplayRecording パターン：
 *   - パス命名: `${customer_id}/${session_id}.${ext}`
 *   - upsert: true（再アップロード許容）
 *
 * 呼び出し後は spacareer_session_videos に行を作成し、
 * analyze-spacareer-session Edge Function を invoke する。
 */
export async function uploadSessionRecording(
  customerId: string,
  sessionId: string,
  file: File,
): Promise<UploadResult> {
  if (!customerId || !sessionId || !file) {
    return { path: null, url: null, error: 'missing params' };
  }
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${customerId}/${sessionId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(SESSION_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: true,
    });
  if (uploadError) {
    console.error('[DB] uploadSessionRecording error:', uploadError);
    return { path: null, url: null, error: uploadError };
  }
  const { data: urlData } = supabase.storage.from(SESSION_BUCKET).getPublicUrl(path);
  return { path, url: urlData.publicUrl, error: null };
}

/**
 * セッション動画用の署名付き URL（1時間有効）。
 * 受講生には公開しない（議事録のみ提供）ため、運営 / トレーナー向けの
 * プレビュー再生で利用する。
 */
export async function createSessionVideoSignedUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(SESSION_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error) {
    console.error('[DB] createSessionVideoSignedUrl error:', error);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * セッション動画レコードを spacareer_session_videos に作成し、
 * AI 議事録生成（analyze-spacareer-session）をキックする。
 * 戻り値: session_video_id（後段で poll 用に使う）
 */
export async function registerSessionVideo({
  sessionId,
  storagePath,
  recordingUrl,
  durationSeconds,
  fileSizeBytes,
  uploadedBy,
}: {
  sessionId: string;
  storagePath?: string;
  recordingUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  uploadedBy?: string;
}): Promise<{ id: string | null; error: unknown }> {
  const { data, error } = await supabase
    .from('spacareer_session_videos')
    .insert({
      org_id: getOrgId(),
      session_id: sessionId,
      storage_path: storagePath ?? null,
      recording_url: recordingUrl ?? null,
      duration_seconds: durationSeconds ?? null,
      file_size_bytes: fileSizeBytes ?? null,
      uploaded_by: uploadedBy ?? null,
      ai_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[DB] registerSessionVideo error:', error);
    return { id: null, error };
  }
  return { id: data.id, error: null };
}

// ----------------------------------------------------------------
// AI 講座動画（議事録なし、再生のみ）
// ----------------------------------------------------------------

/**
 * AI 講座動画をアップロード。
 * パス命名: `${category_id || 'uncategorized'}/${video_id}.${ext}`
 */
export async function uploadCourseVideo(
  videoId: string,
  categoryId: string | null,
  file: File,
): Promise<UploadResult> {
  if (!videoId || !file) return { path: null, url: null, error: 'missing params' };
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${categoryId || 'uncategorized'}/${videoId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(COURSE_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: true,
    });
  if (uploadError) {
    console.error('[DB] uploadCourseVideo error:', uploadError);
    return { path: null, url: null, error: uploadError };
  }
  const { data: urlData } = supabase.storage.from(COURSE_BUCKET).getPublicUrl(path);
  return { path, url: urlData.publicUrl, error: null };
}

export async function createCourseVideoSignedUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(COURSE_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error) {
    console.error('[DB] createCourseVideoSignedUrl error:', error);
    return null;
  }
  return data?.signedUrl || null;
}

export const SPACAREER_BUCKETS = {
  session: SESSION_BUCKET,
  course: COURSE_BUCKET,
} as const;
