// ============================================================
// アクセストークン期限切れ（401）の自動復旧
// ------------------------------------------------------------
// supabase-js は access token（有効1時間）をタイマーで自動更新するが、
// タブがバックグラウンドで凍結されているとそのタイマーが止まる。復帰直後は
// 期限切れのトークンのまま送信され、PostgREST が 401 を返す。
// supabase-js の更新が追いつくまでの数分間、その間の読み書きが全部落ちる。
//
// 実害（2026-09-15 JST 11:18 興村さん）:
//   POST /rest/v1/appointments が 401 → アポが1件も作られないまま
//   画面には「アポ登録は完了」と表示された。同24時間で call_records の
//   登録も5件、同じ401で失われている。
//
// → 401 を掴んだら refreshSession でトークンを取り直し、同じリクエストを
//   1回だけ再送する。成功すれば利用者側には何も起きなかったように見える。
// ============================================================

const AUTH_PATH = '/auth/v1/';

/**
 * 401 を掴んだらトークンを更新して1回だけ再送する fetch を作る。
 * supabase.js から createClient の global.fetch に渡して使う。
 *
 * @param {object}   deps
 * @param {Function} deps.fetch          実際の fetch
 * @param {Function} deps.refreshSession supabase.auth.refreshSession
 * @param {string}   deps.anonKey        匿名キー（未ログイン要求の判別に使う）
 * @returns {Function} fetch 互換関数
 */
export function createAuthRetryFetch({ fetch: baseFetch, refreshSession, anonKey }) {
  // 401 が一斉に返る（画面の再読込は10本以上同時に飛ぶ）ので、
  // 同時に走る更新は1本にまとめる。refresh token は使うたび回転するため、
  // まとめないと無効なトークンでの更新が並んで失敗しやすい。
  let inflightRefresh = null;
  const refreshOnce = () => {
    if (!inflightRefresh) {
      inflightRefresh = Promise.resolve()
        .then(() => refreshSession())
        .catch(() => null)
        .finally(() => { inflightRefresh = null; });
    }
    return inflightRefresh;
  };

  return async function authRetryFetch(input, init = {}) {
    const res = await baseFetch(input, init);
    if (res.status !== 401) return res;

    // 認証API自体の401は正しい失敗（パスワード違い・refresh token失効）。
    // ここで更新を挟むと更新の中で更新を呼ぶ形になるので触らない。
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.includes(AUTH_PATH)) return res;

    // 再送できない要求は対象外。Request オブジェクトと
    // 文字列でない body（Blob/FormData/ReadableStream）は読み切り済みで送り直せない。
    if (typeof input !== 'string') return res;
    if (init.body != null && typeof init.body !== 'string') return res;

    const headers = new Headers(init.headers || {});
    const authHeader = headers.get('Authorization') || '';
    const staleToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    // 匿名キーのまま投げた要求（未ログイン・公開API）は更新しても結果が変わらない。
    if (!staleToken || staleToken === anonKey) return res;

    const refreshed = await refreshOnce();
    const nextToken = refreshed?.data?.session?.access_token;
    // 更新できなかった / トークンが変わらなかった場合は再送しない（無限ループ防止）。
    if (!nextToken || nextToken === staleToken) return res;

    headers.set('Authorization', `Bearer ${nextToken}`);
    return baseFetch(input, { ...init, headers });
  };
}
