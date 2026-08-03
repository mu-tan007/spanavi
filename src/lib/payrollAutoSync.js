// ============================================================
// 確定済み報酬スナップショットの自動再計算
// ----------------------------------------------------------------
// アポのステータス・面談日・売上額が変わったら、その面談月の payroll_snapshots を
// 最新のアポデータで引き直す。確定した月の金額が「再計算」ボタンを押すまで古いまま、
// という状態を無くすため（例: 確定後に面談済→キャンセルにしても売上が減らなかった）。
//
// 設計上の要点:
//  1. 未確定の月は何もしない。未確定月の報酬ページは常にライブ計算なので書き戻す必要がない。
//  2. 計算の入力は画面が読み込み済みの appoData ではなく、その都度DBから取り直す。
//     画面側の取得には件数上限があり、読めていないアポを「売上ゼロ」と誤解して
//     確定額を潰す事故を構造的に避けるため。対象月だけに絞るので1クエリで済む。
//  3. 行の組み立ては utils/payrollRecalc.js を使う。報酬ページの「再計算」ボタンと同じ関数。
//     チーム・役職・ランク・適用率・紹介フィーは確定時のまま固定し、金額だけ動く。
//  4. 一括ステータス変更はループで何度も呼ばれるため、月単位でデバウンスして1回にまとめる。
//
// 累計売上(members.cumulative_sales)はここでは触らない。
// あちらは utils/cumulativeSales.js の差分計算で、ステータスを書き換える画面側が
// 既に増減させている。ここから二重に足し引きしてはいけない。
// ============================================================
import { supabase } from './supabase';
import { getOrgId } from './orgContext';
import { buildRecalcRows } from '../utils/payrollRecalc';

/** 一括更新のループを1回にまとめるための待ち時間(ms) */
const DEBOUNCE_MS = 1200;

/** 再計算が走った時に飛ばすイベント名（報酬ページが拾って表示を更新する） */
export const PAYROLL_SYNCED_EVENT = 'spanavi:payroll-snapshot-synced';

/**
 * タイムスタンプ（timestamptz / Date / ISO文字列）から日本時間の 'YYYY-MM' を返す。
 * 面談日の月判定は必ず日本時間で行う。UTCで切ると月初・月末の面談が隣の月にずれる。
 * @returns {string|null} 面談日が無ければ null
 */
export function jstMonthOf(timestamp) {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
}

/** 'YYYY-MM' → 日本時間の月初/翌月初の ISO 文字列 */
function jstMonthRange(payMonth) {
  const [y, m] = payMonth.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01T00:00:00+09:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+09:00`,
  };
}

/**
 * 対象月のスナップショットを最新のアポデータで引き直す。
 * 未確定の月・差分が無い月は書き込まない。
 * @param {string} payMonth 'YYYY-MM'
 * @returns {Promise<{status: 'unconfirmed'|'unchanged'|'updated'|'error', diffs?: Array, error?: any}>}
 */
export async function syncPayrollSnapshotsForMonth(payMonth) {
  if (!payMonth) return { status: 'unchanged' };
  const orgId = getOrgId();

  const { data: snapshots, error: snapErr } = await supabase
    .from('payroll_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .eq('pay_month', payMonth);
  if (snapErr) return { status: 'error', error: snapErr };
  // 未確定の月はライブ計算で表示されるので触らない
  if (!snapshots || snapshots.length === 0) return { status: 'unconfirmed' };

  const { start, end } = jstMonthRange(payMonth);
  const [apposRes, membersRes, listsRes, settingsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('getter_name, meeting_date, status, sales_amount, intern_reward, list_id')
      .eq('org_id', orgId)
      .gte('meeting_date', start)
      .lt('meeting_date', end),
    supabase.from('members').select('id, name, team, cumulative_sales, is_active, rank').eq('org_id', orgId),
    supabase.from('call_lists').select('id, is_prospecting').eq('org_id', orgId),
    supabase.from('org_settings').select('setting_key, setting_value').eq('org_id', orgId),
  ]);

  const failed = [apposRes, membersRes, listsRes, settingsRes].find(r => r?.error);
  if (failed) return { status: 'error', error: failed.error };

  // 開拓リスト由来のアポは売上に含めない（インターン報酬のみ計上）
  const prospecting = new Map();
  (listsRes.data || []).forEach(l => { if (l.id) prospecting.set(l.id, l.is_prospecting === true); });

  const appoData = (apposRes.data || []).map(a => ({
    getter: a.getter_name || '',
    meetDate: a.meeting_date
      ? new Date(a.meeting_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
      : '',
    status: a.status || '',
    sales: a.sales_amount || 0,
    reward: a.intern_reward || 0,
    isProspecting: !!(a.list_id && prospecting.get(a.list_id)),
  }));

  // 除外条件は useSpanaviData と揃える。PostgREST の .neq() は対象列が NULL の行も
  // 巻き添えで消すので、絞り込みは取得後に JS 側で行う。
  const members = (membersRes.data || [])
    .filter(m => m.is_active !== false && m.rank !== 'student')
    .map(m => ({
      id: m.id,
      _supaId: m.id,
      name: m.name || '',
      team: m.team || '',
      totalSales: parseInt(m.cumulative_sales) || 0,
    }));

  const orgSettings = {};
  (settingsRes.data || []).forEach(r => { orgSettings[r.setting_key] = r.setting_value; });

  const { rows, diffs } = buildRecalcRows({
    snapshots, appoData, members, payMonth, orgSettings, orgId,
    currentUser: snapshots[0]?.confirmed_by || '',
  });
  if (diffs.length === 0) return { status: 'unchanged' };

  const { error: upsertErr } = await supabase
    .from('payroll_snapshots')
    .upsert(rows, { onConflict: 'org_id,pay_month,member_name' });
  if (upsertErr) return { status: 'error', error: upsertErr };

  return { status: 'updated', diffs };
}

// ── 月単位のデバウンス ──────────────────────────────────────────────
const pendingMonths = new Set();
let debounceTimer = null;
let flushing = false;

async function flush() {
  if (flushing) {
    // 実行中に追加されたぶんは、終わってからまとめて処理する
    scheduleFlush();
    return;
  }
  const months = [...pendingMonths];
  pendingMonths.clear();
  if (months.length === 0) return;
  flushing = true;
  try {
    for (const month of months) {
      try {
        const result = await syncPayrollSnapshotsForMonth(month);
        if (result.status === 'updated') {
          console.info(
            `[報酬] ${month}の確定済み報酬を再計算しました（${result.diffs.length}名の金額を更新）`,
            result.diffs,
          );
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(PAYROLL_SYNCED_EVENT, {
              detail: { payMonth: month, diffs: result.diffs },
            }));
          }
        } else if (result.status === 'error') {
          console.error(`[報酬] ${month}の自動再計算に失敗しました:`, result.error);
        }
      } catch (e) {
        // 自動再計算の失敗でアポ側の保存処理を巻き込まない
        console.error(`[報酬] ${month}の自動再計算で例外:`, e);
      }
    }
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { debounceTimer = null; flush(); }, DEBOUNCE_MS);
}

/**
 * 対象月の再計算を予約する。同じ月への連続呼び出しは1回にまとめられる。
 * 呼び出し側は await しない（保存処理を待たせないため）。
 * @param {Array<string|null>|string|null} months 'YYYY-MM' の配列または単体
 */
export function enqueuePayrollSync(months) {
  const list = (Array.isArray(months) ? months : [months]).filter(Boolean);
  if (list.length === 0) return;
  list.forEach(m => pendingMonths.add(m));
  scheduleFlush();
}

/**
 * アポの面談日が変わった可能性がある更新のあと、旧月と新月の両方を予約する。
 * 面談日を7月から8月へ動かした場合、7月は減り8月は増えるので両方の引き直しが要る。
 */
export function enqueuePayrollSyncForMeetingDates(...timestamps) {
  enqueuePayrollSync(timestamps.map(jstMonthOf));
}
