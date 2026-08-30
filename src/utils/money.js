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
//  4-2. 売上は「面談実施日(meetDate)」ベース。面談日が未設定のアポは売上も報酬も立てない。
//     アポ登録日(getDate)で代替してはいけない（過去に代替していて7月分が過大計上になった）。
//     判定は salesMonthOf() / salesAmountOf() に集約してあるので、画面側で自前計算しないこと。
//  5. 紹介フィー: 被紹介者の稼働開始から30日以内の売上が10万円以上になったら
//     紹介者に¥50,000。被紹介者単位で1回のみ（referralPaidPayMonth で月跨ぎ二重支給防止）。
//  6. リーダーボーナスは 2026-08 分から「リーダーが率いる全チームの合算売上 × 段階料率(合算用)を
//     リーダー人数で均等配分」。それ以前の月はチーム別方式のまま（確定済みの金額を動かさないため）。
// ============================================================
import { calcRankAndRate } from './calculations';

/** 給与・売上集計でカウントするアポstatus */
export const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);

/**
 * 売上の計上月(YYYY-MM)を返す。面談日が未設定なら null（＝どの月にも計上しない）。
 * 売上は面談実施日ベース。アポ登録日(getDate)で代替してはいけない。
 * @param {object} a アポ（meetDate: 'YYYY-MM-DD'）
 */
export function salesMonthOf(a) {
  return a && a.meetDate ? a.meetDate.slice(0, 7) : null;
}

/**
 * 売上として加算してよい金額を返す。加算対象外は 0。
 *  - 面談日が未設定 → 0（面談が実施されて初めて売上が立つ）
 *  - クライアント開拓リスト由来(isProspecting) → 0（インターン報酬のみ計上する）
 * 画面ごとに期間の切り方は違ってよいが、この2条件はどの画面でも共通。
 * @param {object} a アポ（meetDate / isProspecting / sales）
 */
export function salesAmountOf(a) {
  if (!a || !a.meetDate || a.isProspecting) return 0;
  return Number(a.sales || 0);
}

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
 * リスト単価上書き（call_lists.appo_unit_price 税別円）が設定されているかを返す。
 *
 * 0円を有効な設定として扱う。Spartia AI のように「アポ単価は無く、報酬は
 * 顧客からの入金の5%だけ」という商材があり、0 を「未設定」に丸めてしまうと
 * クライアントの reward_type（MASP新規開拓 定額 12,000円）にフォールバックして
 * 意図せずアポ1件12,000円が計上される。
 * 未設定は null / 空文字で入ってくるので、そちらだけを「マスタに従う」と判定する。
 *
 * @param {number|string|null|undefined} appoUnitPrice call_lists.appo_unit_price 由来の値
 */
export function hasListUnitPrice(appoUnitPrice) {
  if (appoUnitPrice == null || appoUnitPrice === '') return false;
  const n = Number(appoUnitPrice);
  return Number.isFinite(n) && n >= 0;
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

/** リーダーボーナスのデフォルト段階料率（% 表記）。チーム別方式（〜2026-07）で使う */
export const DEFAULT_LEADER_TIERS = [
  { threshold: 0, rate: 0.5 }, { threshold: 1000000, rate: 1.0 }, { threshold: 2000000, rate: 1.5 },
  { threshold: 3000000, rate: 2.0 }, { threshold: 4000000, rate: 2.5 }, { threshold: 5000000, rate: 3.0 },
  { threshold: 6000000, rate: 3.5 }, { threshold: 7000000, rate: 4.0 }, { threshold: 8000000, rate: 4.5 },
  { threshold: 9000000, rate: 5.0 }, { threshold: 10000000, rate: 5.5 },
];

/**
 * チーム合算方式（2026-08〜）の段階料率。
 * 売上を合算すると段階が上がって原資が膨らむため、チーム別方式の料率をそのまま半分にしてある。
 */
export const COMBINED_LEADER_TIERS = [
  { threshold: 0, rate: 0.25 }, { threshold: 1000000, rate: 0.5 }, { threshold: 2000000, rate: 0.75 },
  { threshold: 3000000, rate: 1.0 }, { threshold: 4000000, rate: 1.25 }, { threshold: 5000000, rate: 1.5 },
  { threshold: 6000000, rate: 1.75 }, { threshold: 7000000, rate: 2.0 }, { threshold: 8000000, rate: 2.25 },
  { threshold: 9000000, rate: 2.5 }, { threshold: 10000000, rate: 2.75 },
];

/**
 * リーダーボーナスがチーム合算・均等配分に切り替わる支払月（この月以降が新方式）。
 * これより前の月は確定済みなので、再計算しても旧方式のまま同じ金額になる必要がある。
 */
export const COMBINED_LEADER_BONUS_FROM = '2026-08';

/**
 * チーム合算・満額支給方式（2026-09〜）の段階料率。むー様指定（2026-08-22）。
 * 最低2%で、700万から段階が上がる。500万と600万は同じ2%（指定どおり）。
 */
export const LEADER_TIERS_FULL = [
  { threshold: 0, rate: 2.0 },          // 最低2%なので500万未満も2%
  { threshold: 5000000, rate: 2.0 },
  { threshold: 6000000, rate: 2.0 },
  { threshold: 7000000, rate: 2.5 },
  { threshold: 8000000, rate: 3.0 },
  { threshold: 9000000, rate: 3.5 },
  { threshold: 10000000, rate: 4.0 },
];

/**
 * リーダーボーナスが「均等割り」から「リーダー各自が満額」に変わる支払月。
 * 2026-09〜: 合算売上×料率を、リーダー人数で割らずに1人ずつ支給する。
 * 例）合算500万 → 2% = 10万円を2人ともに10万円ずつ（原資は20万円）。
 *     合算1000万 → 4% = 40万円を2人ともに40万円ずつ（原資は80万円）。
 * 2026-08 は均等割りのまま（確定済みの金額を動かさないため）。
 */
export const LEADER_BONUS_FULL_FROM = '2026-09';

/** org_settings に入っている段階料率JSONを読む。未設定・壊れている場合は fallback を返す */
export function parseTiers(rawJson, fallback) {
  if (!rawJson) return fallback;
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* use fallback */ }
  return fallback;
}

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
 * @returns {Array<{name, team, rank, rate, role, totalSales, sales, incentive, teamBonus, total, bonusBasis}>}
 *          bonusBasis は役職ボーナスの内訳（{mode:'combined'|'team', sales, rate, sharedBy, teams}）。役職なしは null
 */
export function calcMonthlyPayroll({ appoData, members, payMonth, orgSettings = {}, memberRoleMap = {} }) {
  const yyyymm = payMonth;
  // 面談実施日で当月を判定する。面談日が未設定のアポは売上も報酬も立てない
  // （面談日が入った時点で、その面談月に計上される）
  const monthAppos = (appoData || []).filter(a =>
    salesMonthOf(a) === yyyymm && PAYROLL_COUNTABLE.has(a.status)
  );
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
        sales: 0, incentive: 0, teamBonus: 0, total: 0, bonusBasis: null,
      };
    }
    // クライアント開拓リスト由来のアポは売上集計・チームボーナス計算から除外
    // インターン報酬（reward / intern_reward）はクライアント開拓でも計上する
    const salesAmt = salesAmountOf(a);
    byGetter[a.getter].sales += salesAmt;
    teamSales[team] = (teamSales[team] || 0) + salesAmt;
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
      sales: 0, incentive: 0, teamBonus: 0, total: 0, bonusBasis: null,
    };
  });
  if (yyyymm >= COMBINED_LEADER_BONUS_FROM) {
    // 2026-08〜: リーダーが率いる全チームの売上を合算して段階料率をかける。
    // 副リーダー枠はこの方式では計算しない（役職自体を廃止したため）。
    // 配分は支払月で変わる:
    //   2026-08      原資をリーダー全員で均等割り
    //   2026-09〜    リーダー各自が満額（割らない。指定どおり原資は人数倍になる）
    const isFull = yyyymm >= LEADER_BONUS_FULL_FROM;
    const tiers = isFull
      ? parseTiers(orgSettings.leader_bonus_tiers_full, LEADER_TIERS_FULL)
      : parseTiers(orgSettings.leader_bonus_tiers_combined, COMBINED_LEADER_TIERS);
    const leaders = Object.values(byGetter).filter(p => p.role === 'リーダー');
    // チーム未所属メンバーの売上は合算に含めない（リーダーの見ているチームの売上だけを原資にする）
    const leaderTeams = new Set(leaders.map(p => p.team).filter(Boolean));
    const combinedSales = [...leaderTeams].reduce((s, t) => s + (teamSales[t] || 0), 0);
    const rate = getLeaderRate(combinedSales, tiers);
    const gross = Math.round(combinedSales * rate / 100);
    const each = isFull ? gross : (leaders.length ? Math.round(gross / leaders.length) : 0);
    leaders.forEach(p => {
      p.teamBonus = each;
      p.bonusBasis = {
        mode: isFull ? 'combined_full' : 'combined',
        sales: combinedSales, rate,
        sharedBy: isFull ? 1 : leaders.length,
        teams: [...leaderTeams],
      };
    });
  } else {
    // 〜2026-07: チーム別に段階料率をかけ、同じ役職の人数で分ける旧方式
    const leaderTiers = parseTiers(orgSettings.leader_bonus_tiers, DEFAULT_LEADER_TIERS);
    const subleaderRate = parseFloat(orgSettings.subleader_bonus_rate) || 1.2;

    [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
      const sales = teamSales[team] || 0;
      const tm = Object.values(byGetter).filter(p => p.team === team);
      const leaders = tm.filter(p => p.role === 'リーダー');
      const subs = tm.filter(p => p.role === '副リーダー');
      // リーダー: チーム売上 × 段階料率（リーダーが複数の場合は均等配分）
      const leaderRate = getLeaderRate(sales, leaderTiers);
      const leaderPool = Math.round(sales * leaderRate / 100);
      leaders.forEach(p => {
        p.teamBonus = leaders.length ? Math.round(leaderPool / leaders.length) : 0;
        p.bonusBasis = { mode: 'team', sales, rate: leaderRate, sharedBy: leaders.length, teams: [team] };
      });
      // 副リーダー: チーム売上 × 副リーダー率 ÷ 副リーダー人数
      const subPool = Math.round(sales * subleaderRate / 100);
      subs.forEach(p => {
        p.teamBonus = subs.length ? Math.round(subPool / subs.length) : 0;
        p.bonusBasis = { mode: 'team', sales, rate: subleaderRate, sharedBy: subs.length, teams: [team] };
      });
    });
  }
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
        PAYROLL_COUNTABLE.has(a.status) &&
        a.appointmentDate && new Date(a.appointmentDate) >= opDate && new Date(a.appointmentDate) <= deadline
      )
      .reduce((sum, a) => sum + salesAmountOf(a), 0);
    if (salesWithin30Days >= REFERRAL_SALES_THRESHOLD && opDate <= monthEnd && deadline >= monthStart) {
      bonusByReferrer[m.referrerName] = (bonusByReferrer[m.referrerName] || 0) + REFERRAL_BONUS_AMOUNT;
      if (m._supaId) paidMemberIds.push(m._supaId);
    }
  });
  return { bonusByReferrer, paidMemberIds };
}
