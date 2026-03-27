// ============================================================
// 組織ID（マルチテナント）コンテキスト
// useAuth で認証時に setOrgId() を呼び、各モジュールが getOrgId() で参照する
// ============================================================
let _orgId = null

export function setOrgId(id) { _orgId = id }

export function getOrgId() {
  return _orgId
}

export function clearOrgId() { _orgId = null }
