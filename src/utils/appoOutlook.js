// 「あと何件かけたらアポ1件」（2026-10-08 むー様）
// 会社ごとに「直前の結果」のアポ率（call_status_rates・毎日20時更新）を当てて足し、会社の数をその合計で割る。
// 区分はリストの業務。5区分以外は「all」。区分にその状態の行が無いときも「all」を使う。
import { supabase } from '../lib/supabase';

export const OUTLOOK_SEGMENTS = ['seller_sourcing', 'matching', 'lead_generation_ifa', 'client_acquisition', 'client_acquisition_ifa'];
const SKIP = new Set(['アポ獲得', '除外']);

export const segmentOf = (slug) => (OUTLOOK_SEGMENTS.includes(slug) ? slug : 'all');

export function rateOf(rates, segment, status) {
  const st = status || '未架電';
  const seg = rates?.[segment]?.[st];
  if (seg != null) return seg;
  return rates?.all?.[st] ?? 0;
}

// items: [{ call_status }]（除外済みは呼ぶ側で落とす）
export function outlookOf(items, segment, rates) {
  let n = 0; let expected = 0;
  for (const it of items || []) {
    if (SKIP.has(it.call_status)) continue;
    n += 1;
    expected += rateOf(rates, segment, it.call_status);
  }
  return { n, expected, perAppo: expected > 0 ? n / expected : null };
}

// 表示用：「約440件」／実績0件／—（対象なし）
export function perAppoLabel({ n, perAppo }) {
  if (!n) return '—';
  if (perAppo == null) return '実績0件';
  const v = perAppo >= 1000 ? Math.round(perAppo / 10) * 10 : Math.round(perAppo);
  return `約${v.toLocaleString()}件`;
}

let ratesPromise = null;
export function fetchCallStatusRates() {
  if (!ratesPromise) {
    ratesPromise = supabase.from('call_status_rates').select('segment, prev_status, rate').then(({ data, error }) => {
      if (error) { ratesPromise = null; return {}; }
      const out = {};
      for (const r of data || []) (out[r.segment] ||= {})[r.prev_status] = Number(r.rate);
      return out;
    });
  }
  return ratesPromise;
}

export async function fetchListAppoOutlook() {
  const { data, error } = await supabase.rpc('list_appo_outlook');
  if (error) return {};
  const out = {};
  for (const r of data || []) {
    const expected = Number(r.expected) || 0;
    out[r.list_id] = { n: r.callable, expected, perAppo: expected > 0 ? r.callable / expected : null };
  }
  return out;
}
