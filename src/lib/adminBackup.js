// 代理ログイン用の管理者セッション退避情報。
// 営業代行クライアント（DealsView -> ClientPortalApp）と
// スパキャリ受講生（CustomerDetail -> SpacareerClientApp）の両方で同じ構造を使う。
//
// なぜ共通化したか:
//   代理ログインは「magic link を新タブで開く」実装のため、
//   Supabase クライアントが localStorage を新セッションで上書きする。
//   元タブを後で操作すると本来の管理者が「クライアント」/「受講生」として
//   認識され、App.jsx の強制リダイレクトで /client や /spacareer に
//   飛ばされる事故が起きる。
//   App.jsx 側で「現セッションが client/student かつ管理者バックアップが
//   残っている = 戻し忘れ」を検知して自動復元するため、両方を1モジュールで扱う。

const KEY_CLIENT = 'spanavi_admin_session_backup';
const KEY_SPACAREER = 'spanavi_admin_session_backup_spacareer';
const TTL_MS = 12 * 60 * 60 * 1000; // 12時間（既存実装と合わせる）

function readBackup(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.refresh_token || !data?.access_token) return null;
    if (data.saved_at && Date.now() - data.saved_at > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function readClientAdminBackup() {
  return readBackup(KEY_CLIENT);
}

export function readSpacareerAdminBackup() {
  return readBackup(KEY_SPACAREER);
}

export function clearClientAdminBackup() {
  try { localStorage.removeItem(KEY_CLIENT); } catch {}
}

export function clearSpacareerAdminBackup() {
  try { localStorage.removeItem(KEY_SPACAREER); } catch {}
}
