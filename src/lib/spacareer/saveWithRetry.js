// ============================================================
// スパキャリ 保存リトライ（認証トークン期限切れ対策）
// ----------------------------------------------------------------
// 長時間フォームでアクセストークンが期限切れになると保存(upsert/update)が
// 401/JWTエラーで失敗する。その場合に一度だけ refreshSession で更新してから
// 再実行することで、ログアウトせずに保存を成功させる。
//
// 使い方:
//   const res = await saveWithAuthRetry(() => supabase.from('t').upsert(row));
//   if (res.error) throw res.error;
// ============================================================
import { supabase } from '../supabase';

// PostgREST / GoTrue の認証系エラーかどうかを判定する。
function isAuthError(err) {
  if (!err) return false;
  const status = err.status ?? err.statusCode;
  const code = err.code;
  const msg = (err.message || err.error_description || err.error || '').toString().toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    code === 'PGRST301' || // JWT expired
    code === 'PGRST302' || // JWT invalid
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('expired') ||
    msg.includes('not authenticated') ||
    msg.includes('invalid claim')
  );
}

/**
 * supabase クエリ（{ error } を返す or throw する）を実行し、
 * 認証エラーなら refreshSession 後に1回だけ再実行する。
 * @param {() => Promise<{ error?: any }>} fn
 * @returns {Promise<{ error?: any }>}
 */
export async function saveWithAuthRetry(fn) {
  let result;
  try {
    result = await fn();
  } catch (e) {
    result = { error: e };
  }

  if (result?.error && isAuthError(result.error)) {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // refresh 自体が失敗してもそのまま再試行し、最終結果を呼び出し元に返す
    }
    try {
      result = await fn();
    } catch (e) {
      result = { error: e };
    }
  }

  return result;
}
