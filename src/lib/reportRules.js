// クライアントごとの「アポ報告に足す項目」と「アポにしない条件」（report_rules・2026-10-07 むー様決定）
// クライアント → 先方の担当者（訪問者）→ リスト の順に重ね、後の段が同じ key を上書きする。
import { supabase } from './supabase';

let cache = null;
let cachedAt = 0;

export async function fetchReportRules({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < 5 * 60 * 1000) return cache;
  let data, error;
  try {
    ({ data, error } = await supabase.from('report_rules').select('client_id, contact_id, list_id, items, conditions, note'));
  } catch (e) {
    error = e;
  }
  if (error) { console.warn('[reportRules] 読込に失敗:', error.message); return cache || []; }
  cache = data || [];
  cachedAt = Date.now();
  return cache;
}

/** list（_supaId, client_id, contact_id, contact_ids）に当てはまる項目と条件を重ねて返す */
export function resolveReportRules(rules, list) {
  if (!list) return { items: [], conditions: [] };
  const clientId = list.client_id || list.clientId || null;
  const contactIds = new Set([list.contact_id, ...(list.contact_ids || []), ...(list.contactIds || [])].filter(Boolean));
  const listId = list._supaId || list.id || null;
  const rows = (rules || []).filter(r => r.client_id === clientId);
  const tiers = [
    rows.filter(r => !r.contact_id && !r.list_id),
    rows.filter(r => r.contact_id && !r.list_id && contactIds.has(r.contact_id)),
    rows.filter(r => r.list_id && r.list_id === listId),
  ];
  const items = new Map();
  const conditions = new Map();
  for (const tier of tiers) for (const r of tier) {
    for (const it of r.items || []) items.set(it.key, it);
    for (const c of r.conditions || []) conditions.set(c.key, c);
  }
  return { items: [...items.values()], conditions: [...conditions.values()] };
}

export const ruleFieldKey = (key) => `rule_${key}`;

/** 入力値（form の rule_*）を、検査（utils/appoReportChecks の形）に足す */
export function checkRuleFields(form, rules) {
  const out = [];
  for (const it of rules.items) {
    const v = String(form[ruleFieldKey(it.key)] ?? '').trim();
    if (it.required && !v) out.push({ key: 'rule', level: 'error', msg: `「${it.label}」が空欄です（このクライアントで必ず聞くこと）` });
    if (v && (it.type === 'number_oku' || it.type === 'number_people') && isNaN(Number(v))) out.push({ key: 'rule', level: 'error', msg: `「${it.label}」は数字で入れてください` });
  }
  const valueOf = (field) => {
    const it = rules.items.find(i => (field === 'revenue_oku' && i.type === 'number_oku') || (field === 'employees' && i.type === 'number_people'));
    const v = it ? form[ruleFieldKey(it.key)] : '';
    return v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
  };
  for (const c of rules.conditions) {
    if (c.check) {
      const v = valueOf(c.check.field);
      if (v == null) continue;
      const hit = c.check.op === '<=' ? v <= c.check.value : c.check.op === '<' ? v < c.check.value : c.check.op === '>=' ? v >= c.check.value : false;
      if (hit) out.push({ key: 'rule', level: 'warn', msg: `「${c.label}」に当たります。このクライアントではアポにしない条件です` });
    } else {
      out.push({ key: 'rule', level: 'warn', msg: c.label });
    }
  }
  return out;
}

/** 報告本文に足す「【ヒアリング】」の段 */
export function ruleReportBlock(form, rules) {
  const lines = rules.items
    .map(it => {
      const v = String(form[ruleFieldKey(it.key)] ?? '').trim();
      if (!v) return null;
      const unit = it.type === 'number_oku' ? '億円' : it.type === 'number_people' ? '人' : '';
      return `${it.label}：${v}${unit}`;
    })
    .filter(Boolean);
  return lines.length ? `\n【ヒアリング】\n${lines.join('\n')}` : '';
}

/**
 * 1段（クライアント全体／担当者／リスト）を保存する。中身が空なら消す。管理者だけが書ける（RLS）。
 * rule は utils/reportRulesEdit の toStorage の形（items / conditions / note）
 */
export async function saveReportRule({ clientId, contactId = null, listId = null, rule, orgId, updatedBy = '' }) {
  let q = supabase.from('report_rules').select('id').eq('client_id', clientId);
  q = contactId ? q.eq('contact_id', contactId) : q.is('contact_id', null);
  q = listId ? q.eq('list_id', listId) : q.is('list_id', null);
  const { data: existing, error: readError } = await q.maybeSingle();
  if (readError) return { error: readError };
  const empty = (!rule.items || rule.items.length === 0) && (!rule.conditions || rule.conditions.length === 0) && !rule.note;
  let res;
  if (empty) {
    res = existing ? await supabase.from('report_rules').delete().eq('id', existing.id) : { error: null };
  } else if (existing) {
    res = await supabase.from('report_rules').update({ items: rule.items, conditions: rule.conditions, note: rule.note, updated_at: new Date().toISOString(), updated_by: updatedBy }).eq('id', existing.id).select('id');
  } else {
    res = await supabase.from('report_rules').insert({ org_id: orgId, client_id: clientId, contact_id: contactId, list_id: listId, items: rule.items, conditions: rule.conditions, note: rule.note, updated_by: updatedBy }).select('id');
  }
  if (!res.error && !empty && (!res.data || res.data.length === 0)) return { error: { message: '保存できませんでした（権限がない可能性があります）' } };
  cache = null;
  return { error: res.error || null };
}
