// ============================================================
// スパキャリ 動画アップロード基盤
// 仕様書 §9.2 動画ホスティング
// ----------------------------------------------------------------
// 既存 uploadRoleplayRecording (src/lib/supabaseWrite.js) のパターンを
// 流用し、バケットだけ spacareer-session-videos / spacareer-course-videos
// に分離した実装。
//
// 大容量(数百MB〜2GB)対応:
//   キックオフ/通常セッションのZoom録画は数百MBが普通のため、
//   標準アップロード(同期POST)ではプロジェクトのGlobal File Size Limit
//   (Supabase標準=50MB)で弾かれる。Resumable Upload(TUS)経路に切り替えると
//   bucket側のfile_size_limit(2GB)が直接効き、ネットワーク断にも強くなる。
// ============================================================
import * as tus from 'tus-js-client';
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
 *
 * ----------------------------------------------------------------
 * 置き場所は **Cloudflare R2 が正**（2026-08-23 移設）。
 * Supabase Storage の組織上限100GBを超えたため、31.5GB/163件をR2へ移した。
 *
 * ⚠️ まずR2に聞き、無ければSupabase Storageへ回る。
 *    移設の途中や、これから足す分の取りこぼしを黙って再生不能にしないため。
 *    Supabase側を消したあとは、この回り道は自然に使われなくなる。
 *
 * ⚠️ R2の署名は Edge Function `r2` が出す。ブラウザからR2の鍵は触らない。
 *    その口では「呼んだ人のorgに、その鍵の動画が登録されているか」を
 *    必ず確かめている（鍵を名前で指定できるため、省くと他社の動画が取れる）。
 */
export async function createSessionVideoSignedUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  return (await resolveSessionVideoUrl(storagePath, expiresSec)).url;
}

/**
 * 再生URLと「なぜ出せなかったか」を返す。
 *
 * gone = true は **どちらにも実体が無い**とき。
 * R2は180日で自動削除するので、期限を過ぎた録画がこれに当たる。
 * 一時的な障害と区別できないと、画面に「議事録は残っています」と
 * 出してよいのか判断できない。
 */
export async function resolveSessionVideoUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<{ url: string | null; gone: boolean }> {
  if (!storagePath) return { url: null, gone: false };

  const { data: r2, error: r2err } = await supabase.functions.invoke('r2', {
    body: { action: 'sign-get', kind: 'spacareer', key: storagePath, expires: expiresSec },
  });
  if (!r2err && r2?.ok && r2.url) return { url: r2.url as string, gone: false };

  console.warn('[videoUpload] R2から出せなかったのでSupabase Storageを見ます:', storagePath, r2err ?? r2);
  const { data, error } = await supabase.storage
    .from(SESSION_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (!error && data?.signedUrl) return { url: data.signedUrl, gone: false };

  // R2にも Supabase にも無い＝実体が消えている
  console.error('[DB] createSessionVideoSignedUrl error:', error);
  return { url: null, gone: true };
}

/**
 * Supabase Storage に上がったファイルを R2 へ移し、元を消す。
 *
 * ----------------------------------------------------------------
 * ⚠️ アップロード自体は TUS のまま残す。
 *    R2 へ直接置く形（署名付きPUT）にすると**単発の送信**になり、
 *    1.4GB級の録画が途中で切れたときに最初からやり直しになる。
 *    「TUSで上げる → サーバーがR2へ流す → 元を消す」なら、
 *    再開できる強さを保ったまま、Supabase側に残らない。
 *
 * ⚠️ 失敗しても投げない。移せなければ Supabase 側に残るだけで、
 *    再生も議事録もそちらに回るので動きは止まらない。
 *    容量が減らないことだけが起きる（あとでまとめて移せる）。
 */
export async function stowToR2(bucket: string, path: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('r2', {
      body: { action: 'migrate', kind: 'spacareer', bucket, path },
    });
    if (error || !data?.ok) {
      console.warn('[videoUpload] R2へ移せませんでした（Supabase側に残ります）:', path, error ?? data);
      return false;
    }
    const { error: rmErr } = await supabase.storage.from(bucket).remove([path]);
    if (rmErr) console.warn('[videoUpload] R2へは移せましたが元を消せませんでした:', path, rmErr);
    return true;
  } catch (e) {
    console.warn('[videoUpload] R2へ移せませんでした:', path, e);
    return false;
  }
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

/**
 * 複数の講座動画/サムネイルの署名付きURLを一括発行する。
 * 一覧表示でサムネイル・再生URLをまとめて解決する用途。
 * 戻り値: { storagePath: signedUrl } のマップ（失敗分は欠落）。
 */
export async function createCourseVideoSignedUrls(
  paths: string[],
  expiresSec = 3600,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set((paths || []).filter(Boolean)));
  if (!unique.length) return {};
  const { data, error } = await supabase.storage
    .from(COURSE_BUCKET)
    .createSignedUrls(unique, expiresSec);
  if (error) {
    console.error('[DB] createCourseVideoSignedUrls error:', error);
    return {};
  }
  const map: Record<string, string> = {};
  (data || []).forEach((d) => {
    if (d?.path && d?.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

/**
 * 講座動画のサムネイル画像を非公開バケットに保存する。
 * 冒頭フレームの自動JPEG・管理者が手動アップロードした画像の両方で使う。
 * パス命名: `${orgId}/${videoId}_thumb.jpg`（upsertで上書き＝1動画1枚）
 * contentType は実ファイルの種類（image/png 等）を渡せば配信時もその形式で返る。
 * 戻り値: 保存した object path（失敗時 null）。
 */
export async function uploadCourseThumbnail(
  orgId: string,
  videoId: string,
  blob: Blob,
  contentType = 'image/jpeg',
): Promise<{ path: string | null; error: unknown }> {
  if (!orgId || !videoId || !blob) return { path: null, error: 'missing params' };
  const path = `${orgId}/${videoId}_thumb.jpg`;
  const { error } = await supabase.storage
    .from(COURSE_BUCKET)
    .upload(path, blob, { contentType: contentType || 'image/jpeg', upsert: true });
  if (error) {
    console.error('[DB] uploadCourseThumbnail error:', error);
    return { path: null, error };
  }
  return { path, error: null };
}

export const SPACAREER_BUCKETS = {
  session: SESSION_BUCKET,
  course: COURSE_BUCKET,
} as const;

// ----------------------------------------------------------------
// Resumable Upload (TUS) — 240MB級のキックオフ録画用
// ----------------------------------------------------------------

export type ResumableUploadOptions = {
  bucket: string;
  path: string;
  file: File;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
};

// アクセストークンの残り寿命がこれ未満なら、チャンク送信前に先回りで更新する（秒）。
// 6MB チャンク1回分の送信時間 + 余裕を見た値。
const TOKEN_REFRESH_MARGIN_SEC = 180;

/**
 * TUS の各リクエスト直前に呼ぶ「常に有効なアクセストークン」取得。
 *
 * 数百MB〜GB級の動画は転送に1時間近くかかることがあり、開始時のトークンを
 * 使い回すと途中の PATCH が
 *   403 AccessDenied / "exp" claim timestamp check failed
 * で落ちる（supabase-js がバックグラウンドで更新しても、tus が保持している
 * Authorization ヘッダは古いままのため）。
 * さらにタブが非アクティブだとブラウザのタイマー抑制で自動更新自体が遅れる。
 * そこで期限が近い場合は明示的に refreshSession() する。
 */
async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0; // UNIX秒
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec > TOKEN_REFRESH_MARGIN_SEC) return session.access_token;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error) {
    // 更新に失敗しても手持ちのトークンで一度は試す（tus 側の再試行に委ねる）。
    console.warn('[videoUpload] refreshSession failed:', error);
    return session.access_token;
  }
  return refreshed?.session?.access_token ?? session.access_token;
}

/** 認証期限切れ由来のエラーか判定する（HTTPは400で返り、本文に403が入るケースがある）。 */
function isAuthExpiredError(err: unknown): boolean {
  const res = (err as { originalResponse?: { getStatus?: () => number; getBody?: () => string } })
    ?.originalResponse;
  const status = res?.getStatus?.() ?? 0;
  if (status === 401 || status === 403) return true;
  const body = `${res?.getBody?.() ?? ''} ${(err as Error)?.message ?? ''}`;
  return /exp["\s]*claim|AccessDenied|Unauthorized|jwt expired|token is expired/i.test(body);
}

/**
 * Supabase Storage に Resumable Upload (TUS) で動画を上げる。
 *
 * 標準の supabase.storage.from(...).upload() は同期POSTで、プロジェクトの
 * "Global file upload size limit" (Dashboard 設定、標準=50MB) で弾かれる。
 * TUS 経路は bucket 側の file_size_limit のみが効くため、2GB まで通る。
 * またネットワーク断時にも自動再開してくれる。
 *
 * 認証は onBeforeRequest で毎リクエスト付け直す（長時間アップロードでの
 * トークン期限切れ対策）。
 *
 * chunkSize は Supabase 推奨の 6MB。
 */
export async function uploadVideoResumable(
  opts: ResumableUploadOptions,
): Promise<{ error: unknown }> {
  const { bucket, path, file, contentType, upsert = false, onProgress } = opts;

  const accessToken = await getFreshAccessToken();
  if (!accessToken) {
    return { error: new Error('not authenticated') };
  }

  const supabaseUrl = (import.meta as unknown as { env: Record<string, string> })
    .env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: new Error('VITE_SUPABASE_URL is not defined') };
  }

  return new Promise((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      // 認証ヘッダはここに書かない（下の onBeforeRequest だけで付ける）。
      // tus-js-client はまず headers オプションを XMLHttpRequest.setRequestHeader で
      // セットし、その後 onBeforeRequest でもう一度セットする。XHR の仕様では
      // 同名ヘッダは連結されるため、両方に書くと実際に飛ぶのは
      //   authorization: Bearer <A>, Bearer <B>
      // となり、Storage 側が JWT として読めず
      //   403 AccessDenied / "Invalid Compact JWS"
      // でアップロード開始（POST /upload/resumable）が即失敗する。
      headers: {
        'x-upsert': upsert ? 'true' : 'false',
      },
      // 毎リクエスト直前に最新トークンを付け直す。
      // これが無いと長時間アップロードの途中で 403 "exp claim timestamp check failed" になる。
      onBeforeRequest: async (req) => {
        const token = (await getFreshAccessToken()) || accessToken;
        req.setHeader('authorization', `Bearer ${token}`);
      },
      // tus は既定で 4xx を再試行しない（=期限切れで即中断）。
      // 認証期限切れだけは再試行させ、onBeforeRequest が付け直した新トークンで続行する。
      onShouldRetry: (err, retryAttempt) => {
        if (isAuthExpiredError(err)) return retryAttempt < 5;
        const status = err.originalResponse?.getStatus() ?? 0;
        if (status >= 400 && status < 500 && status !== 409 && status !== 423) return false;
        return true;
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || file.type || 'video/mp4',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => {
        console.error('[videoUpload] tus error:', err);
        resolve({ error: err });
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        try { onProgress?.(bytesUploaded, bytesTotal); } catch { /* ignore */ }
      },
      onSuccess: () => resolve({ error: null }),
    });
    upload.start();
  });
}
