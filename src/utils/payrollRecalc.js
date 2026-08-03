// ============================================================
// 確定済み報酬スナップショットの再計算
// ----------------------------------------------------------------
// 確定した月の payroll_snapshots を、最新のアポデータで引き直すための行を組み立てる。
//
// 「確定解除 → 再確定」ではダメな理由:
//   再確定は現在のチーム編成・役職・累計売上で全部を計算し直すため、
//   確定後に編成を組み替えた月の役職ボーナスが別人に移ってしまう。
//   ここではチーム・役職・ランク・適用率・紹介フィーを確定時の値に固定したまま、
//   金額（売上・インセンティブ・役職ボーナス・合計支給額）だけを更新する。
//
// 報酬ページの「再計算」ボタンと、アポ更新時の自動再計算（lib/payrollAutoSync.js）が
// この同じ関数を使う。片方だけ挙動がズレる事故を防ぐため、ロジックはここ一箇所に置く。
// ============================================================
import { calcMonthlyPayroll } from './money';

/**
 * 確定時のチーム編成を復元したメンバー配列を返す。
 * これをしないと、確定後にチームを組み替えた月の役職ボーナスが別人に移る。
 * @param {Array} members   現在のメンバー配列
 * @param {Array} snapshots 対象月の payroll_snapshots
 */
export function buildSnapshotMembers(members, snapshots) {
  const byName = new Map((snapshots || []).map(s => [s.member_name, s]));
  return (members || []).map(m => {
    if (typeof m !== 'object' || !m.name) return m;
    const s = byName.get(m.name);
    return s ? { ...m, team: s.team_name || '' } : m;
  });
}

/**
 * 確定時の役職を復元した { [member.id]: 役職名 } マップを返す。
 * @param {Array} members   現在のメンバー配列（id と name が必要）
 * @param {Array} snapshots 対象月の payroll_snapshots
 */
export function buildSnapshotRoleMap(members, snapshots) {
  const idByName = new Map(
    (members || []).filter(m => typeof m === 'object' && m.name && m.id).map(m => [m.name, m.id])
  );
  const map = {};
  (snapshots || []).forEach(s => {
    const id = idByName.get(s.member_name);
    if (id && s.role) map[id] = s.role;
  });
  return map;
}

/**
 * 確定済み月のスナップショットを最新のアポデータで引き直した行と、その差分を返す。
 * スナップショットが無い月（未確定）は何も返さない。未確定月は常にライブ計算で表示されるため、
 * 書き戻す必要がそもそも無い。
 *
 * @param {object} p
 * @param {Array}  p.snapshots   対象月の payroll_snapshots（そのままの行）
 * @param {Array}  p.appoData    アポ配列（useSpanaviData の整形済みフォーマット）
 * @param {Array}  p.members     メンバー配列（id / name / team / totalSales）
 * @param {string} p.payMonth    'YYYY-MM'
 * @param {object} [p.orgSettings]
 * @param {string} [p.orgId]     新規行を足す時に使う org_id
 * @param {string} [p.currentUser] 新規行の confirmed_by
 * @param {string} [p.now]       recalculated_at に入れる ISO 文字列（テスト用に外から渡せる）
 * @returns {{rows: Array, diffs: Array<{name, beforeTotal, afterTotal, isNew}>}}
 */
export function buildRecalcRows({
  snapshots,
  appoData,
  members,
  payMonth,
  orgSettings = {},
  orgId = null,
  currentUser = '',
  now = new Date().toISOString(),
}) {
  if (!snapshots || snapshots.length === 0) return { rows: [], diffs: [] };

  const recalcData = calcMonthlyPayroll({
    appoData,
    members: buildSnapshotMembers(members, snapshots),
    payMonth,
    orgSettings,
    memberRoleMap: buildSnapshotRoleMap(members, snapshots),
  });

  const byName = new Map(recalcData.map(p => [p.name, p]));
  const rows = snapshots.map(s => {
    const p = byName.get(s.member_name);
    byName.delete(s.member_name);
    const incentive = p ? p.incentive : 0;
    const teamBonus = p ? p.teamBonus : 0;
    const referral = s.referral_bonus || 0;
    return {
      ...s,
      monthly_sales: p ? p.sales : 0,
      incentive_amt: incentive,
      team_bonus: teamBonus,
      total_payout: incentive + teamBonus + referral,
      recalculated_at: now,
    };
  });

  // 確定後に当月へ入ってきたメンバー（面談日が当月に移動した等）は新規行として追加する
  byName.forEach(p => {
    if (!p.sales && !p.incentive && !p.teamBonus) return;
    rows.push({
      org_id: orgId,
      pay_month: payMonth,
      member_name: p.name,
      team_name: p.team,
      role: p.role,
      rank: p.rank,
      incentive_rate: p.rate || 0,
      monthly_sales: p.sales,
      incentive_amt: p.incentive,
      team_bonus: p.teamBonus,
      referral_bonus: 0,
      total_payout: p.total,
      confirmed_by: currentUser || '管理者',
      recalculated_at: now,
    });
  });

  const before = new Map(snapshots.map(s => [s.member_name, s]));
  const diffs = rows
    .map(r => {
      const b = before.get(r.member_name);
      return {
        name: r.member_name,
        beforeTotal: b ? b.total_payout : 0,
        afterTotal: r.total_payout,
        isNew: !b,
      };
    })
    .filter(d => d.beforeTotal !== d.afterTotal);

  return { rows, diffs };
}
