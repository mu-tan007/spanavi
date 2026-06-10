// ============================================================
// 金額計算の共通モジュール
// ----------------------------------------------------------------
// Spanavi の「お金の規約」をコードとして一箇所に固定する。
// ここの関数は必ず純粋関数にし、src/utils/money.test.js で挙動を固定する。
//
// 規約（変更する場合はテストも必ず更新すること）:
//  1. appointments.sales_amount は「税込額」で運用する。
//     報酬マスター(reward_tiers).price は tax='税別' なら税別額で登録されており、
//     sales に入れる時・クライアント提示額を出す時は applyTaxIfPretax で×1.1する。
//  2. 請求書: taxType='税別' は外税（消費税=小計×0.1切捨て、合計=小計+税）、
//     '税込' は内税（消費税=小計−小計÷1.1切捨て、合計=小計のまま）。
//  3. インターン報酬 = 当社売上 × メンバーincentive_rate（四捨五入）。
//     ただし calc_type='fixed_per_appo' のクライアントは 売上額=報酬額（率は無視）。
//  4. 給与集計の対象 status は PAYROLL_COUNTABLE。
//     クライアント開拓リスト由来(isProspecting)のアポは売上・チームボーナスから除外し、
//     インターン報酬のみ計上する。
//  5. 紹介フィー: 被紹介者の稼働開始から30日以内の売上が10万円以上になったら
//     紹介者に¥50,000。被紹介者単位で1回のみ（referralPaidPayMonth で月跨ぎ二重支給防止）。
// ============================================================
import { calcRankAndRate } from './calculations';

/** 給与・売上集計でカウントするアポstatus */
export const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);

/** 紹介フィーの金額と成立条件 */
export const REFERRAL_BONUS_AMOUNT = 50000;
export const REFERRAL_SALES_THRESHOLD = 100000;
export const REFERRAL_WINDOW_DAYS = 30;

/**
 * 税別マスター額を税込額に変換する（税込マスターはそのまま）。
 * @param {number} price 報酬マスターの price
 * @param {string} tax   '税別' | '税込'
 */
export function applyTaxIfPretax(price, tax) {
  const p = Number(price || 0);
  return tax === '税別' ? Math.round(p * 1.1) : p;
}

/** 税込額 → 税別額（単価の逆算に使用） */
export function toPretax(amountInclTax) {
  return Math.round(Number(amountInclTax || 0) / 1.1);
}

/**
 * 請求書の消費税・合計を計算する。
 * @param {number} subtotal 明細小計（税別運用なら税別額、税込運用なら税込額）
 * @param {string} taxType  '税別'（外税） | '税込'（内税）
 * @returns {{ subtotal: number, tax: number, total: number }}
 */
export function calcInvoiceTax(subtotal, taxType) {
  const s = Number(subtotal || 0);
  if (taxType === '税別') {
    const tax = Math.floor(s * 0.1);
    return { subtotal: s, tax, total: s + tax };
  }
  const tax = Math.floor(s - s / 1.1);
  return { subtotal: s, tax, total: s };
}

/**
 * インターン報酬を計算する。
 * @param {number} sales    当社売上（税込）
 * @param {number} rate     メンバーの incentive_rate（0.22 等）
 * @param {string} [calcType] 報酬マスターの calc_type（'fixed_per_appo' は売上=報酬）
 */
export function calcInternReward(sales, rate, calcType) {
  const s = Number(sales || 0);
  if (calcType === 'fixed_per_appo') return s;
  const r = Number(rate || 0);
  return r ? Math.round(s * r) : 0;
}

/** リーダーボーナスのデフォルト段階料率（% 表記） */
export const DEFAULT_LEADER_TIERS = [
  { threshold: 0, rate: 0.5 }, { threshold: 1000000, rate: 1.0 }, { threshold: 2000000, rate: 1.5 },
  { threshold: 3000000, rate: 2.0 }, { threshold: 4000000, rate: 2.5 }, { threshold: 5000000, rate: 3.0 },
  { threshold: 6000000, rate: 3.5 }, { threshold: 7000000, rate: 4.0 }, { threshold: 8000000, rate: 4.5 },
  { threshold: 9000000, rate: 5.0 }, { threshold: 10000000, rate: 5.5 },
];

/** チーム売上に応じたリーダーボーナス料率(%)を返す */
export function getLeaderRate(sales, leaderTiers = DEFAULT_LEADER_TIERS) {
  const sorted = [...leaderTiers].sort((a, b) => b.threshold - a.threshold);
  const tier = sorted.find(t => sales >= t.threshold);
  return tier ? tier.rate : 0;
}

/**
 * 月次報酬を計算する（給与画面の中核ロジック）。
 * 元実装: PayrollView.jsx の calcData useMemo（挙動同一で抽出）。
 *
 * @param {object} p
 * @param {Array}  p.appoData       アポ一覧（meetDate/getDate/status/getter/sales/reward/isProspecting）
 * @param {Array}  p.members        メンバー一覧（name/team/totalSales/id）
 * @param {string} p.payMonth       'YYYY-MM'
 * @param {object} [p.orgSettings]  org_settings の {key: value} マップ
 * @param {object} [p.memberRoleMap] { [member.id]: 'リーダー'|'副リーダー'|... }
 * @returns {Array<{name, team, rank, rate, role, totalSales, sales, incentive, teamBonus, total}>}
 */
export function calcMonthlyPayroll({ appoData, members, payMonth, orgSettings = {}, memberRoleMap = {} }) {
  const yyyymm = payMonth;
  const monthAppos = (appoData || []).filter(a => {
    const dateKey = (a.meetDate || a.getDate || '').slice(0, 7);
    return dateKey === yyyymm && PAYROLL_COUNTABLE.has(a.status);
  });
  const memberMap = {};
  (members || []).forEach(m => { if (typeof m === 'object' && m.name) memberMap[m.name] = m; });
  // 役割は member_engagements.role_id 経由で判定（members.position は使わない）
  const getRole = (mem) => (mem && mem.id) ? (memberRoleMap[mem.id] || '') : '';
  const teamSales = {};
  const byGetter = {};
  monthAppos.forEach(a => {
    const mem = memberMap[a.getter] || {};
    const { rank, rate } = calcRankAndRate(mem.totalSales || 0, orgSettings);
    const team = mem.team || '';
    if (!byGetter[a.getter]) {
      byGetter[a.getter] = {
        name: a.getter, team, rank, rate,
        role: getRole(mem),
        totalSales: mem.totalSales || 0,
        sales: 0, incentive: 0, teamBonus: 0, total: 0,
      };
    }
    // クライアント開拓リスト由来のアポは売上集計・チームボーナス計算から除外
    // インターン報酬（reward / intern_reward）はクライアント開拓でも計上する
    if (!a.isProspecting) {
      byGetter[a.getter].sales += a.sales || 0;
      teamSales[team] = (teamSales[team] || 0) + (a.sales || 0);
    }
    byGetter[a.getter].incentive += a.reward || 0;
  });
  (members || []).forEach(m => {
    if (typeof m !== 'object' || !m.name) return;
    const role = getRole(m);
    if (!['リーダー', '副リーダー'].includes(role)) return;
    if (byGetter[m.name]) return;
    const { rank, rate } = calcRankAndRate(m.totalSales || 0, orgSettings);
    byGetter[m.name] = {
      name: m.name, team: m.team || '', rank, rate,
      role, totalSales: m.totalSales || 0,
      sales: 0, incentive: 0, teamBonus: 0, total: 0,
    };
  });
  // リーダーボーナス段階料率（org_settingsから取得、なければデフォルト）
  let leaderTiers = DEFAULT_LEADER_TIERS;
  if (orgSettings.leader_bonus_tiers) {
    try {
      const parsed = JSON.parse(orgSettings.leader_bonus_tiers);
      if (Array.isArray(parsed) && parsed.length > 0) leaderTiers = parsed;
    } catch { /* use defaults */ }
  }
  const subleaderRate = parseFloat(orgSettings.subleader_bonus_rate) || 1.2;

  [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
    const sales = teamSales[team] || 0;
    const tm = Object.values(byGetter).filter(p => p.team === team);
    const leaders = tm.filter(p => p.role === 'リーダー');
    const subs = tm.filter(p => p.role === '副リーダー');
    // リーダー: チーム売上 × 段階料率（リーダーが複数の場合は均等配分）
    const leaderPool = Math.round(sales * getLeaderRate(sales, leaderTiers) / 100);
    leaders.forEach(p => { p.teamBonus = leaders.length ? Math.round(leaderPool / leaders.length) : 0; });
    // 副リーダー: チーム売上 × 副リーダー率 ÷ 副リーダー人数
    const subPool = Math.round(sales * subleaderRate / 100);
    subs.forEach(p => { p.teamBonus = subs.length ? Math.round(subPool / subs.length) : 0; });
  });
  Object.values(byGetter).forEach(p => { p.total = p.incentive + p.teamBonus; });
  return Object.values(byGetter);
}

/**
 * Spanavi紹介フィー（¥50,000）を計算する。
 * 元実装: PayrollView.jsx の referralMap / referralPaidMemberIds useMemo（挙動同一で統合抽出）。
 *
 * 成立条件:
 *  - 被紹介者に referrerName と operationStartDate がある
 *  - 稼働開始30日以内のアポ取得日ベース売上（isProspecting除外・PAYROLL_COUNTABLE）が10万円以上
 *  - 稼働開始が対象月末以前、かつ 30日期限が対象月初以降（=対象月にウィンドウが重なる）
 *  - referralPaidPayMonth が他月に付いている被紹介者は除外（月跨ぎ二重支給防止）
 *
 * @param {object} p
 * @param {Array}  p.members    メンバー一覧（referrerName/operationStartDate/referralPaidPayMonth/_supaId）
 * @param {Array}  p.appoData   アポ一覧（getter/isProspecting/status/appointmentDate/sales）
 * @param {string} p.payMonth   'YYYY-MM'（支払済マークとの一致判定）
 * @param {Date}   p.monthStart 対象月の月初
 * @param {Date}   p.monthEnd   対象月の月末
 * @returns {{ bonusByReferrer: Object<string, number>, paidMemberIds: string[] }}
 */
export function calcReferralBonuses({ members, appoData, payMonth, monthStart, monthEnd }) {
  const bonusByReferrer = {};
  const paidMemberIds = [];
  (members || []).forEach(m => {
    if (typeof m !== 'object' || !m.referrerName || !m.operationStartDate) return;
    // 他月で既に支払済なら除外（同じ被紹介者の二重支給防止）
    if (m.referralPaidPayMonth && m.referralPaidPayMonth !== payMonth) return;
    const opDate = new Date(m.operationStartDate);
    const deadline = new Date(opDate);
    deadline.setDate(deadline.getDate() + REFERRAL_WINDOW_DAYS);
    const salesWithin30Days = (appoData || [])
      .filter(a =>
        a.getter === m.name &&
        !a.isProspecting &&
        PAYROLL_COUNTABLE.has(a.status) &&
        a.appointmentDate && new Date(a.appointmentDate) >= opDate && new Date(a.appointmentDate) <= deadline
      )
      .reduce((sum, a) => sum + (a.sales || 0), 0);
    if (salesWithin30Days >= REFERRAL_SALES_THRESHOLD && opDate <= monthEnd && deadline >= monthStart) {
      bonusByReferrer[m.referrerName] = (bonusByReferrer[m.referrerName] || 0) + REFERRAL_BONUS_AMOUNT;
      if (m._supaId) paidMemberIds.push(m._supaId);
    }
  });
  return { bonusByReferrer, paidMemberIds };
}
