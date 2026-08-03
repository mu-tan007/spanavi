// ============================================================
// 確定済み報酬スナップショットの再計算ルールを固定するテスト。
// 報酬ページの「再計算」ボタンと、アポ更新時の自動再計算が共有するロジック。
// ここが落ちる変更は「確定済みの支給額の動き方が変わった」ことを意味する。
// ============================================================
import { describe, it, expect } from 'vitest';
import { buildRecalcRows, buildSnapshotMembers, buildSnapshotRoleMap } from './payrollRecalc';

const NOW = '2026-08-03T00:00:00.000Z';

// 2026-07 のリーダーボーナスは旧方式（チーム別）。
// リーダー率の段階が絡むと検証したい点がぼやけるので、役職なしの構成を基本にする。
const members = [
  { id: 'm1', name: '瀬尾 貫太', team: 'Aチーム', totalSales: 4092000 },
  { id: 'm2', name: '浅井 佑', team: 'Aチーム', totalSales: 4466000 },
];

const snapshot = (over = {}) => ({
  org_id: 'org1',
  pay_month: '2026-07',
  member_name: '瀬尾 貫太',
  team_name: 'Aチーム',
  role: 'メンバー',
  rank: 'プレイヤー',
  incentive_rate: 0.24,
  monthly_sales: 880000,
  incentive_amt: 211200,
  team_bonus: 0,
  referral_bonus: 0,
  total_payout: 211200,
  confirmed_at: '2026-07-31T10:14:35.472Z',
  confirmed_by: '篠宮 拓武',
  recalculated_at: null,
  ...over,
});

const appo = (over = {}) => ({
  getter: '瀬尾 貫太',
  meetDate: '2026-07-08',
  status: '面談済',
  sales: 110000,
  reward: 26400,
  isProspecting: false,
  ...over,
});

const base = {
  members,
  payMonth: '2026-07',
  orgSettings: {},
  orgId: 'org1',
  currentUser: '篠宮 拓武',
  now: NOW,
};

describe('buildRecalcRows（確定済みスナップショットの引き直し）', () => {
  it('未確定の月（スナップショット無し）は何も返さない', () => {
    const { rows, diffs } = buildRecalcRows({ ...base, snapshots: [], appoData: [appo()] });
    expect(rows).toEqual([]);
    expect(diffs).toEqual([]);
  });

  it('面談済をキャンセルにすると売上とインセンティブが減る', () => {
    const appoData = [
      appo({ sales: 770000, reward: 184800 }),
      appo({ meetDate: '2026-07-08', sales: 110000, reward: 26400, status: 'キャンセル' }),
    ];
    const { rows, diffs } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData });
    expect(rows).toHaveLength(1);
    expect(rows[0].monthly_sales).toBe(770000);
    expect(rows[0].incentive_amt).toBe(184800);
    expect(rows[0].total_payout).toBe(184800);
    expect(rows[0].recalculated_at).toBe(NOW);
    expect(diffs).toEqual([
      { name: '瀬尾 貫太', beforeTotal: 211200, afterTotal: 184800, isNew: false },
    ]);
  });

  it('チーム・役職・ランク・適用率・紹介フィー・確定日時は確定時のまま動かさない', () => {
    const snap = snapshot({ team_name: 'Bチーム', role: 'リーダー', rank: 'スパルタン', incentive_rate: 0.26, referral_bonus: 50000, total_payout: 261200 });
    const { rows } = buildRecalcRows({ ...base, snapshots: [snap], appoData: [appo()] });
    expect(rows[0].team_name).toBe('Bチーム');
    expect(rows[0].role).toBe('リーダー');
    expect(rows[0].rank).toBe('スパルタン');
    expect(rows[0].incentive_rate).toBe(0.26);
    expect(rows[0].referral_bonus).toBe(50000);
    expect(rows[0].confirmed_at).toBe('2026-07-31T10:14:35.472Z');
    expect(rows[0].confirmed_by).toBe('篠宮 拓武');
    // 合計支給額は 紹介フィーを据え置いたまま インセンティブ＋役職ボーナス に足し直す
    expect(rows[0].total_payout).toBe(rows[0].incentive_amt + rows[0].team_bonus + 50000);
  });

  it('当月のアポが全部消えた人は0円になるが行は残す', () => {
    const { rows, diffs } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].member_name).toBe('瀬尾 貫太');
    expect(rows[0].monthly_sales).toBe(0);
    expect(rows[0].incentive_amt).toBe(0);
    expect(rows[0].total_payout).toBe(0);
    expect(diffs[0].afterTotal).toBe(0);
  });

  it('確定後に当月へ入ってきた人は新規行として追加される', () => {
    const appoData = [
      appo({ sales: 880000, reward: 211200 }),
      appo({ getter: '浅井 佑', sales: 330000, reward: 79200 }),
    ];
    const { rows, diffs } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData });
    expect(rows).toHaveLength(2);
    const added = rows.find(r => r.member_name === '浅井 佑');
    expect(added.monthly_sales).toBe(330000);
    expect(added.incentive_amt).toBe(79200);
    expect(added.org_id).toBe('org1');
    expect(added.pay_month).toBe('2026-07');
    expect(added.confirmed_by).toBe('篠宮 拓武');
    expect(diffs.find(d => d.name === '浅井 佑').isNew).toBe(true);
  });

  it('金額が変わらなければ差分は空（＝書き込みが走らない）', () => {
    const appoData = [appo({ sales: 880000, reward: 211200 })];
    const { diffs } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData });
    expect(diffs).toEqual([]);
  });

  it('面談日が翌月に移ると当月からは消える', () => {
    const appoData = [appo({ meetDate: '2026-08-03', sales: 880000, reward: 211200 })];
    const { rows } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData });
    expect(rows[0].monthly_sales).toBe(0);
  });

  it('開拓リスト由来のアポは売上に乗らないがインターン報酬は乗る', () => {
    const appoData = [appo({ sales: 880000, reward: 211200, isProspecting: true })];
    const { rows } = buildRecalcRows({ ...base, snapshots: [snapshot()], appoData });
    expect(rows[0].monthly_sales).toBe(0);
    expect(rows[0].incentive_amt).toBe(211200);
  });
});

describe('確定時の編成の復元', () => {
  it('buildSnapshotMembers は確定時のチームで上書きする', () => {
    const restored = buildSnapshotMembers(members, [snapshot({ team_name: 'Bチーム' })]);
    expect(restored.find(m => m.name === '瀬尾 貫太').team).toBe('Bチーム');
    // スナップショットに居ない人は現在のチームのまま
    expect(restored.find(m => m.name === '浅井 佑').team).toBe('Aチーム');
  });

  it('buildSnapshotRoleMap は member.id をキーに確定時の役職を返す', () => {
    const map = buildSnapshotRoleMap(members, [snapshot({ role: 'リーダー' })]);
    expect(map).toEqual({ m1: 'リーダー' });
  });

  it('確定後にチームを移った人の役職ボーナスが別チームへ移らない', () => {
    // 確定時: 瀬尾がAチームのリーダー。確定後にBチームへ異動した状態を作る
    const movedMembers = [
      { id: 'm1', name: '瀬尾 貫太', team: 'Bチーム', totalSales: 4092000 },
      { id: 'm2', name: '浅井 佑', team: 'Aチーム', totalSales: 4466000 },
    ];
    const snapshots = [
      snapshot({ role: 'リーダー', team_name: 'Aチーム' }),
      snapshot({ member_name: '浅井 佑', role: 'メンバー', team_name: 'Aチーム', monthly_sales: 0, incentive_amt: 0, total_payout: 0 }),
    ];
    const appoData = [
      appo({ sales: 500000, reward: 120000 }),
      appo({ getter: '浅井 佑', sales: 500000, reward: 120000 }),
    ];
    const { rows } = buildRecalcRows({ ...base, members: movedMembers, snapshots, appoData });
    const seo = rows.find(r => r.member_name === '瀬尾 貫太');
    // 確定時のAチーム（2人合計100万）を原資に役職ボーナスが付く。異動先のBチーム扱いにならない
    expect(seo.team_bonus).toBeGreaterThan(0);
    expect(rows.find(r => r.member_name === '浅井 佑').team_bonus).toBe(0);
  });
});
