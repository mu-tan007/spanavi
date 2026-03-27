// ============================================================
// 組織ID（マルチテナント）コンテキスト
// useAuth で認証時に setOrgId() を呼び、各モジュールが getOrgId() で参照する
// ============================================================
let _orgId = null

export function setOrgId(id) { _orgId = id }

export function getOrgId() {
  return _orgId || 'a0000000-0000-0000-0000-000000000001'
}

export function clearOrgId() { _orgId = null }
