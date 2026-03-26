// ============================================================
// 組織ID（マルチテナント）コンテキスト
// useAuth で認証時に setOrgId() を呼び、各モジュールが getOrgId() で参照する
// ============================================================
let _orgId = null

export function setOrgId(id) { _orgId = id }

export function getOrgId() {
  // _orgIdが未設定の場合はMASPのデフォルトを返す（fetchProfile完了前の初期ロード対応）
  return _orgId || 'a0000000-0000-0000-0000-000000000001'
}

export function clearOrgId() { _orgId = null }
