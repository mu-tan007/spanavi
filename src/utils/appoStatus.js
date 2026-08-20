/**
 * アポ登録時の appointments.status 初期値を決める。
 *
 * 事前確認ページ (PreCheckView) は status='アポ取得' のアポだけを対象にしているので、
 * 事前確認を行わない運用のものは最初から「事前確認済」で登録する。
 *
 * 対象:
 *   - クライアント開拓リスト (call_lists.is_prospecting = true)
 *   - 買い手マッチング (engagements.type = 'matching')
 *   - 「アポ取得時に事前確認をスキップ」設定のクライアント (clients.skip_pre_check = true)
 *
 * @param {object} list 架電リスト（useSpanaviData で整形済み。
 *                      is_prospecting / engagementType / engagementSlug / skipPreCheck を持つ）
 * @returns {'事前確認済'|'アポ取得'}
 */
export function initialAppoStatus(list) {
  // 商材別に slug が分かれても type は 'matching' で共通。
  // type 未設定の古いデータのために slug も見る。
  const isMatching = list?.engagementType === 'matching' || list?.engagementSlug === 'matching';
  const skipPreCheck = list?.is_prospecting || isMatching || list?.skipPreCheck;
  return skipPreCheck ? '事前確認済' : 'アポ取得';
}
