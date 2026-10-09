// 一覧ページ・詳細モーダル・架電ページで共通の「会社の並び」（2026-10-09 むー様・見本 list.html）
// 並び：業種（多い業種から・業種の中は売上高）／売上高／エリア（売り手ソーシングのアポ率が高い県から）。昇順・降順。人ごとに覚える
import { supabase } from '../lib/supabase';

const SORT_KEY = 'spanavi_listSort';
export const DEFAULT_SORT = { s: 'ind', d: true };

export function loadSort(userKey = '') {
  try {
    const m = JSON.parse(localStorage.getItem(`${SORT_KEY}:${userKey}`) || 'null');
    if (m && ['ind', 'rev', 'area'].includes(m.s)) return { s: m.s, d: m.d !== false };
  } catch { /* 読めなければ既定の並び */ }
  return DEFAULT_SORT;
}
export function saveSort(userKey, sort) {
  try { localStorage.setItem(`${SORT_KEY}:${userKey || ''}`, JSON.stringify(sort)); } catch { /* 保存できなくても並びは変える */ }
}

let prefPromise = null;
/** { 東京都: 0.0012, ... }（率は0〜1）。毎日20時過ぎに出し直す表 */
export function fetchPrefRates() {
  if (!prefPromise) {
    prefPromise = supabase.from('pref_appo_rates').select('pref, rate').then(({ data, error }) => {
      if (error) { prefPromise = null; return {}; }
      return Object.fromEntries((data || []).map(r => [r.pref, Number(r.rate)]));
    });
  }
  return prefPromise;
}

const rev = x => Number(x.rv) || 0;

/** 並べた結果を、業種のまとまりごとに返す（業種の並びのときだけ複数のまとまり） */
export function groupSorted(items, sort, prefRates = {}) {
  const sg = sort.d ? -1 : 1;
  const byRev = (a, b) => sg * (rev(a) - rev(b));
  if (sort.s === 'ind') {
    const g = {};
    items.forEach(x => { (g[x.ind] ||= []).push(x); });
    return Object.entries(g)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ja'))
      .map(([k, rs]) => ({ key: k, rows: [...rs].sort(byRev) }));
  }
  const pr = x => prefRates[x.pf] ?? 0;
  const rows = [...items].sort(sort.s === 'rev' ? byRev : (a, b) => sg * (pr(a) - pr(b)) || rev(b) - rev(a));
  return [{ key: null, rows }];
}

export const sortItems = (items, sort, prefRates) => groupSorted(items, sort, prefRates).flatMap(g => g.rows);

/** JST の 'MM/DD' と時 */
export const jstParts = (iso) => {
  const d = new Date(iso);
  const md = d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit' });
  const h = Number(d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit' }));
  return { md, h, date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) };
};
