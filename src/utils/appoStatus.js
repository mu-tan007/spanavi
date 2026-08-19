/**
 * アポ登録時の appointments.status 初期値を決める。
 *
 * 事前確認ページ (PreCheckView) は status='アポ取得' のアポだけを対象にしているので、
 * 事前確認を行わない運用のものは最初から「事前確認済」で登録する。
 *
 * 対象:
 *   - クライアント開拓リスト (call_lists.is_prospecting = true)
 *   - 「アポ取得時に事前確認をスキップ」設定のクライアント (clients.skip_pre_check = true)
 *
 * @param {object} list 架電リスト（useSpanaviData で整形済み。is_prospecting / skipPreCheck を持つ）
 * @returns {'事前確認済'|'アポ取得'}
 */
export function initialAppoStatus(list) {
  return (list?.is_prospecting || list?.skipPreCheck) ? '事前確認済' : 'アポ取得';
}
