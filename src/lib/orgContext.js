// ============================================================
// 組織ID（マルチテナント）コンテキスト
// useAuth で認証時に setOrgId() を呼び、各モジュールが getOrgId() で参照する
// ============================================================
let _orgId = null

export function setOrgId(id) { _orgId = id }

export function getOrgId() {
  // 移行期フォールバック：未設定時は既存の単一テナント ID を返す
  if (!_orgId) return 'a0000000-0000-0000-0000-000000000001'
  return _orgId
}

export function clearOrgId() { _orgId = null }
