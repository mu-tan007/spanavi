import { createClient } from '@supabase/supabase-js'

// Supabase の auth-js は初期化時に URL の hash を処理して即座にクリアする。
// 「招待リンクからの初回ログイン」を検知するには、createClient より先に hash を読む必要がある。
// hash 例: #access_token=...&type=invite&...
const _initialHash = typeof window !== 'undefined' ? window.location.hash : ''
export const isInviteFlow = _initialHash.includes('type=invite')

// パスワード再設定（recovery）リンクからの着地も招待と同様に同期捕捉する。
// auth-js は URL ハッシュ(#access_token...&type=recovery)を Web Locks 取得後に
// 「非同期」で読むため、React Router が同期的に <Navigate to="/login"> を描画して
// ハッシュを消すと、auth-js がトークンを読む前に失われ、セッション未確立のまま
// 通常ログイン画面に着地してしまう（recovery だけ isInviteFlow のような同期捕捉が
// 無く無防備だったのが根因）。invite と同じく着地直後に同期で検知する。
export const isRecoveryFlow = _initialHash.includes('type=recovery')

// 招待 or パスワード再設定リンクからの着地（= パスワード設定画面へ誘導すべきコールバック）
export const isPasswordSetupFlow = isInviteFlow || isRecoveryFlow

// リンク期限切れ・使用済み等のエラー着地（#error=access_denied&error_code=otp_expired...）。
// この場合ハッシュに type=invite/recovery は含まれないため別途検知する。
export const isAuthCallbackError =
  _initialHash.includes('error_code=') || _initialHash.includes('error=access_denied')

// 代理ログイン（受講生ポータルを別タブで開く）タブの判定。
// Supabase の認証セッションはタブ間共有の localStorage に保存されるため、
// 代理ログインの magic link を通常クライアントで消費すると、共有セッションが
// 受講生のものに上書きされ、別タブの管理画面まで受講生として実行されてしまう
// （顧客一覧が「本人1名のみ」に化ける混線バグの原因）。
//
// 代理ログインは /spacareer に magic link で着地する（ハッシュに type=magiclink を含む）。
// 通常の受講生ログインはパスワード方式でハッシュが付かないため、この組み合わせで
// 代理ログインタブだけを判定できる。該当タブのみ persistSession=false の隔離クライアントにし、
// 受講生セッションをメモリ内のみで保持して共有 localStorage を汚さないようにする。
// （redirect 先を変えず Auth のリダイレクト許可URL設定に依存しない方式）
const _initialPath = typeof window !== 'undefined' ? window.location.pathname : ''
export const isImpersonationFlow =
  _initialPath.startsWith('/spacareer') && _initialHash.includes('type=magiclink')

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 認証セッションを localStorage に永続化し、access token を自動 refresh。
// refresh token は Supabase 側で30日有効、毎日アクセスがあれば実質無期限。
// storageKey と flowType はデフォルトを継承（変更すると既存セッション・招待リンクが壊れる）。
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: isImpersonationFlow
    ? {
        // 代理ログインタブ専用: メモリ内セッション（永続化しない）。
        // 共有 localStorage を一切触らないため、他タブの管理者セッションを上書きしない。
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-spacareer-impersonation',
      }
    : {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
})
