// ============================================================
// 累計売上(members.cumulative_sales)の増減判定
// ----------------------------------------------------------------
// cumulative_sales は「面談済のアポの売上合計」を保持するカウンター。
// アポのステータスや売上額が変わるたびに差分を足し引きして維持する。
//
// 判定を1箇所に集約する理由:
//   以前はアポ一覧の編集・一括変更それぞれに同じ分岐が書かれていて、
//   事前確認画面からキャンセルにする経路だけ減算が漏れていた。
//   計上漏れ・減算漏れはランク（＝インセンティブ率）に効くので、
//   ステータスを書き換える画面は必ずこの関数を通すこと。
//
// ズレの検知は DB ビュー v_member_cumulative_sales_audit /
// v_appointment_cumulative_flag_mismatch を参照（報酬ページで警告表示）。
// ============================================================

/** 累計売上に計上されるステータス */
export const CUMULATIVE_STATUS = '面談済';

/**
 * ステータス／売上額の変更に対する累計売上の増減を返す。
 *
 *  1) 面談済以外 → 面談済 : +新売上
 *  2) 面談済 → 面談済以外 : -元売上（キャンセル・リスケ・アポ取得戻しすべて含む）
 *  3) 面談済 → 面談済     : +(新売上 - 元売上)  ※金額修正の差分
 *  4) それ以外            : 0
 *
 * @param {object} p
 * @param {string} p.prevStatus 変更前ステータス
 * @param {string} p.nextStatus 変更後ステータス
 * @param {number} p.prevSales  変更前の売上額
 * @param {number} p.nextSales  変更後の売上額
 * @returns {number} 累計売上に加算すべき差分（マイナスなら減算）
 */
export function cumulativeSalesDelta({ prevStatus, nextStatus, prevSales, nextSales }) {
  const was = prevStatus === CUMULATIVE_STATUS;
  const is = nextStatus === CUMULATIVE_STATUS;
  const before = Number(prevSales || 0);
  const after = Number(nextSales || 0);
  if (!was && is) return after;
  if (was && !is) return before ? -before : 0;  // 0円のとき -0 を返さない
  if (was && is) return after - before;
  return 0;
}

/**
 * 変更後に is_counted_in_cumulative へ入れるべき値。
 * ステータスが面談済かどうかと常に一致させる（不一致は減算漏れの痕跡になる）。
 * @param {string} nextStatus
 */
export function shouldBeCountedInCumulative(nextStatus) {
  return nextStatus === CUMULATIVE_STATUS;
}
