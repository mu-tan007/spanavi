// === dynamic import 失敗（chunk load error）の共通処理 ===
// 新しい版がデプロイされた後、古いタブが消えた chunk を取りに行って 404 になる
// 典型ケースを検知し、ユーザーにリロードを促す。
// グローバルハンドラ（main.jsx）と、import() を try/catch で握りつぶしている
// 個別処理（請求書生成など）の両方から呼べるよう共通化している。

export const isChunkLoadError = (msg = '') =>
  /Failed to fetch dynamically imported module/i.test(msg) ||
  /Importing a module script failed/i.test(msg) ||
  /error loading dynamically imported module/i.test(msg) ||
  /Loading chunk \d+ failed/i.test(msg) ||
  /ChunkLoadError/i.test(msg);

// エラー（Error / 文字列 / イベント reason 等）から判定し、
// chunk load error なら更新リロードを促す。
// 戻り値: true = chunk error として処理した（呼び出し側は通常エラー表示を抑制してよい）
export const handleChunkLoadError = (err) => {
  const msg = String(err?.message || err || '');
  if (!isChunkLoadError(msg)) return false;
  // 直近30秒以内に同種のリロードを実施済みなら再ループ防止
  const last = Number(sessionStorage.getItem('spanavi_chunk_reload_at') || '0');
  if (Date.now() - last < 30000) return true;
  sessionStorage.setItem('spanavi_chunk_reload_at', String(Date.now()));
  const ok = window.confirm(
    'Spanavi が新しいバージョンに更新されました。\nページを再読み込みして最新版を適用しますか？'
  );
  if (ok) window.location.reload();
  return true;
};
