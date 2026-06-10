// ============================================================
// 金額計算の規約を固定するテスト。
// ここが落ちる変更は「お金の扱いが変わった」ことを意味するので、
// 仕様変更の意図がない限りマージしないこと。
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  PAYROLL_COUNTABLE,
  applyTaxIfPretax,
  toPretax,
  calcInvoiceTax,
  calcInternReward,
  getLeaderRate,
  calcMonthlyPayroll,
  calcReferralBonuses,
  REFERRAL_BONUS_AMOUNT,
} from './money';

describe('PAYROLL_COUNTABLE（給与集計対象status）', () => {
  it('アポ取得・事前確認済・面談済の3つだけが対象', () => {
    expect([...PAYROLL_COUNTABLE].sort()).toEqual(['アポ取得', '事前確認済', '面談済'].sort());
    expect(PAYROLL_COUNTABLE.has('キャンセル')).toBe(false);
    expect(PAYROLL_COUNTABLE.has('リスケ')).toBe(false);
  });
});

describe('applyTaxIfPretax（税別マスター→税込額 ×1.1）', () => {
  it('税別は×1.1して四捨五入', () => {
    expect(applyTaxIfPretax(100000, '税別')).toBe(110000);
    expect(applyTaxIfPretax(150000, '税別')).toBe(165000);
    expect(applyTaxIfPretax(333, '税別')).toBe(366); // 366.3 → 366
    expect(applyTaxIfPretax(335, '税別')).toBe(369); // 368.5 → 369 (round)
  });
  it('税込はそのまま', () => {
    expect(applyTaxIfPretax(110000, '税込')).toBe(110000);
  });
  it('null/undefined/文字列は安全に処理', () => {
    expect(applyTaxIfPretax(null, '税別')).toBe(0);
    expect(applyTaxIfPretax(undefined, '税込')).toBe(0);
    expect(applyTaxIfPretax('100000', '税別')).toBe(110000);
  });
});

describe('toPretax（税込→税別の逆算）', () => {
  it('税込110,000 → 税別100,000', () => {
    expect(toPretax(110000)).toBe(100000);
  });
});

describe('calcInvoiceTax（請求書の消費税）', () => {
  it('税別（外税）: 税=小計×0.1切捨て、合計=小計+税', () => {
    expect(calcInvoiceTax(100000, '税別')).toEqual({ subtotal: 100000, tax: 10000, total: 110000 });
    expect(calcInvoiceTax(99999, '税別')).toEqual({ subtotal: 99999, tax: 9999, total: 109998 });
  });
  it('税込（内税）: 税=小計−小計÷1.1切捨て、合計=小計のまま', () => {
    expect(calcInvoiceTax(110000, '税込')).toEqual({ subtotal: 110000, tax: 10000, total: 110000 });
    expect(calcInvoiceTax(100000, '税込')).toEqual({ subtotal: 100000, tax: 9090, total: 100000 });
  });
});

describe('calcInternReward（インターン報酬）', () => {
  it('通常: 売上×incentive_rate を四捨五入', () => {
    expect(calcInternReward(165000, 0.22)).toBe(36300);
    expect(calcInternReward(100001, 0.22)).toBe(22000); // 22000.22 → 22000
  });
  it('fixed_per_appo: 売上額=報酬額（率は無視）', () => {
    expect(calcInternReward(30000, 0.22, 'fixed_per_appo')).toBe(30000);
    expect(calcInternReward(30000, 0, 'fixed_per_appo')).toBe(30000);
  });
  it('rate未設定なら0', () => {
    expect(calcInternReward(165000, 0)).toBe(0);
    expect(calcInternReward(165000, null)).toBe(0);
  });
});

describe('getLeaderRate（リーダーボーナス段階料率）', () => {
  it('デフォルト段階: 0円=0.5%, 100万=1.0%, 1000万以上=5.5%', () => {
    expect(getLeaderRate(0)).toBe(0.5);
    expect(getLeaderRate(999999)).toBe(0.5);
    expect(getLeaderRate(1000000)).toBe(1.0);
    expect(getLeaderRate(10000000)).toBe(5.5);
    expect(getLeaderRate(99999999)).toBe(5.5);
  });
});

// ── 月次報酬計算 ─────────────────────────────────────────────
const baseMembers = [
  { id: 'm1', _supaId: 'm1', name: '鍛冶', team: 'A', totalSales: 0 },
  { id: 'm2', _supaId: 'm2', name: '吉川', team: 'A', totalSales: 0 },
  { id: 'm3', _supaId: 'm3', name: '佐藤', team: 'A', totalSales: 0 },
];

describe('calcMonthlyPayroll（月次報酬計算）', () => {
  it('対象月(meetDate優先)・対象statusのアポだけ集計する', () => {
    const rows = calcMonthlyPayroll({
      appoData: [
        { getter: '鍛冶', status: 'アポ取得', getDate: '2026-06-01', sales: 110000, reward: 24200 },
        // meetDate が対象月外なら getDate が対象月でも集計されない（meetDate優先）
        { getter: '鍛冶', status: 'アポ取得', getDate: '2026-06-15', meetDate: '2026-07-02', sales: 110000, reward: 24200 },
        // 対象外status
        { getter: '鍛冶', status: 'キャンセル', getDate: '2026-06-20', sales: 110000, reward: 24200 },
      ],
      members: baseMembers,
      payMonth: '2026-06',
    });
    const kaji = rows.find(r => r.name === '鍛冶');
    expect(kaji.sales).toBe(110000);
    expect(kaji.incentive).toBe(24200);
  });

  it('クライアント開拓(isProspecting)は売上から除外、インターン報酬のみ計上', () => {
    const rows = calcMonthlyPayroll({
      appoData: [
        { getter: '鍛冶', status: 'アポ取得', getDate: '2026-06-01', sales: 110000, reward: 24200 },
        { getter: '鍛冶', status: 'アポ取得', getDate: '2026-06-02', sales: 50000, reward: 11000, isProspecting: true },
      ],
      members: baseMembers,
      payMonth: '2026-06',
    });
    const kaji = rows.find(r => r.name === '鍛冶');
    expect(kaji.sales).toBe(110000);      // prospecting分は入らない
    expect(kaji.incentive).toBe(35200);   // 報酬は両方計上 (24200+11000)
  });

  it('リーダーボーナス: チーム売上×段階料率、複数リーダーは均等配分。アポ無しリーダーも行が立つ', () => {
    const rows = calcMonthlyPayroll({
      appoData: [
        { getter: '吉川', status: 'アポ取得', getDate: '2026-06-01', sales: 1500000, reward: 330000 },
      ],
      members: baseMembers,
      payMonth: '2026-06',
      memberRoleMap: { m1: 'リーダー', m3: '副リーダー' },
    });
    // チーム売上150万 → リーダー率1.0% → 15,000
    const kaji = rows.find(r => r.name === '鍛冶');
    expect(kaji.role).toBe('リーダー');
    expect(kaji.teamBonus).toBe(15000);
    expect(kaji.total).toBe(15000); // incentive 0 + teamBonus
    // 副リーダー: 150万 × 1.2% = 18,000
    const sato = rows.find(r => r.name === '佐藤');
    expect(sato.teamBonus).toBe(18000);
    // プレイヤーにはボーナスなし
    const yoshikawa = rows.find(r => r.name === '吉川');
    expect(yoshikawa.teamBonus).toBe(0);
    expect(yoshikawa.total).toBe(330000);
  });

  it('org_settings の leader_bonus_tiers / subleader_bonus_rate を反映する', () => {
    const rows = calcMonthlyPayroll({
      appoData: [
        { getter: '吉川', status: 'アポ取得', getDate: '2026-06-01', sales: 1000000, reward: 0 },
      ],
      members: baseMembers,
      payMonth: '2026-06',
      orgSettings: {
        leader_bonus_tiers: JSON.stringify([{ threshold: 0, rate: 2.0 }]),
        subleader_bonus_rate: '0.5',
      },
      memberRoleMap: { m1: 'リーダー', m3: '副リーダー' },
    });
    expect(rows.find(r => r.name === '鍛冶').teamBonus).toBe(20000); // 100万×2.0%
    expect(rows.find(r => r.name === '佐藤').teamBonus).toBe(5000);  // 100万×0.5%
  });
});

// ── 紹介フィー ───────────────────────────────────────────────
describe('calcReferralBonuses（紹介フィー¥50k）', () => {
  const monthStart = new Date(2026, 5, 1);  // 2026-06-01
  const monthEnd = new Date(2026, 5, 30);   // 2026-06-30
  const referee = {
    _supaId: 'ref1', name: '吉川', referrerName: '鍛冶',
    operationStartDate: '2026-06-05',
  };
  const qualifyingAppo = {
    getter: '吉川', status: 'アポ取得',
    appointmentDate: '2026-06-20', sales: 110000,
  };

  it('30日以内売上10万以上で紹介者に¥50,000', () => {
    const { bonusByReferrer, paidMemberIds } = calcReferralBonuses({
      members: [referee], appoData: [qualifyingAppo],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBe(REFERRAL_BONUS_AMOUNT);
    expect(paidMemberIds).toEqual(['ref1']);
  });

  it('売上10万未満は不成立', () => {
    const { bonusByReferrer } = calcReferralBonuses({
      members: [referee],
      appoData: [{ ...qualifyingAppo, sales: 99999 }],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBeUndefined();
  });

  it('稼働開始から30日を超えたアポは集計しない', () => {
    const { bonusByReferrer } = calcReferralBonuses({
      members: [referee],
      appoData: [{ ...qualifyingAppo, appointmentDate: '2026-07-10' }], // 開始6/5+30日=7/5を超過
      payMonth: '2026-07',
      monthStart: new Date(2026, 6, 1), monthEnd: new Date(2026, 6, 31),
    });
    expect(bonusByReferrer['鍛冶']).toBeUndefined();
  });

  it('他月で支払済(referralPaidPayMonth)の被紹介者は除外（二重支給防止）', () => {
    const { bonusByReferrer } = calcReferralBonuses({
      members: [{ ...referee, referralPaidPayMonth: '2026-05' }],
      appoData: [qualifyingAppo],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBeUndefined();
  });

  it('当月支払済マークは再計算で消えない（同月は成立扱い）', () => {
    const { bonusByReferrer } = calcReferralBonuses({
      members: [{ ...referee, referralPaidPayMonth: '2026-06' }],
      appoData: [qualifyingAppo],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBe(REFERRAL_BONUS_AMOUNT);
  });

  it('クライアント開拓(isProspecting)のアポは紹介フィー判定の売上に入らない', () => {
    const { bonusByReferrer } = calcReferralBonuses({
      members: [referee],
      appoData: [{ ...qualifyingAppo, isProspecting: true }],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBeUndefined();
  });

  it('同一紹介者に複数の被紹介者が成立したら加算される', () => {
    const referee2 = { ...referee, _supaId: 'ref2', name: '佐藤' };
    const { bonusByReferrer, paidMemberIds } = calcReferralBonuses({
      members: [referee, referee2],
      appoData: [
        qualifyingAppo,
        { ...qualifyingAppo, getter: '佐藤' },
      ],
      payMonth: '2026-06', monthStart, monthEnd,
    });
    expect(bonusByReferrer['鍛冶']).toBe(REFERRAL_BONUS_AMOUNT * 2);
    expect(paidMemberIds.sort()).toEqual(['ref1', 'ref2']);
  });
});
