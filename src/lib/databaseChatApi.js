// Database 画面 自然言語チャット & 保存検索条件 用クライアントAPI
//   - chat-to-filter Edge Function を呼び出して filters JSON を取得
//   - 会話履歴 (database_chat_sessions / database_chat_messages) と保存検索を Supabase に永続化
//
// 設計メモ:
//   filters_json は INITIAL_FILTERS と同じシェイプを期待（page/pageSize/sort* は除外して保存）

import { supabase } from './supabase';
import { fetchCategories } from './companyMasterApi';

// INITIAL_FILTERS の「保存対象」フィールド（UI状態は除く）
const PERSIST_KEYS = [
  'keyword', 'daibunrui', 'saibunrui', 'prefecture', 'city',
  'revenueMin', 'revenueMax', 'revenueNullMode',
  'netIncomeMin', 'netIncomeMax', 'netIncomeNullMode',
  'ageMin', 'ageMax', 'ageNullMode',
  'employeeMin', 'employeeMax', 'employeeNullMode',
  'phonePattern', 'establishedMin', 'establishedMax',
  'shareholderType', 'repShareholderMatch', 'logic',
];

export function pickPersistableFilters(filters) {
  const out = {};
  for (const k of PERSIST_KEYS) if (filters[k] !== undefined) out[k] = filters[k];
  return out;
}

/**
 * AI が指定した daibunrui 値を、実DB上の値（例: "E 製造業"）に解決する
 *  - 完全一致 → そのまま
 *  - 1文字英字（例 "E"） → "E " で始まる項目
 *  - 名称のみ（例 "製造業"） → 各項目の末尾名称が一致 or 含む
 */
function resolveDaibunrui(aiVals, actualDaibunruiList) {
  if (!Array.isArray(aiVals) || aiVals.length === 0) return [];
  const out = new Set();
  for (const raw of aiVals) {
    const v = String(raw || '').trim();
    if (!v) continue;
    // 1) 完全一致
    if (actualDaibunruiList.includes(v)) { out.add(v); continue; }
    // 2) 1文字英字 → "X " で始まる
    if (/^[A-Z]$/i.test(v)) {
      const prefix = v.toUpperCase() + ' ';
      const m = actualDaibunruiList.find(d => d.startsWith(prefix));
      if (m) { out.add(m); continue; }
    }
    // 3) 名称が含まれる（"製造業" → "E 製造業"）
    const cand = actualDaibunruiList.filter(d => d.includes(v));
    if (cand.length === 1) { out.add(cand[0]); continue; }
    if (cand.length > 1) { cand.forEach(c => out.add(c)); continue; }
    // どれにも該当しなければ無視（誤爆を避ける）
  }
  return [...out];
}

/**
 * AI が返した filters（industryHint含む）を、useCompanySearch が使うシェイプにマージ
 * - industryHint があれば fetchCategories の saibunrui に対し部分一致で saibunrui[] を埋める
 * - daibunrui は実DB値（"E 製造業" 等）に正規化してからセット
 * - 数値フィールドは null/'' を空文字に正規化
 */
export async function applyAiFiltersToBase(baseFilters, aiFilters) {
  if (!aiFilters || typeof aiFilters !== 'object') return baseFilters;

  const merged = { ...baseFilters };
  const numKeys = [
    'revenueMin', 'revenueMax', 'netIncomeMin', 'netIncomeMax',
    'ageMin', 'ageMax', 'employeeMin', 'employeeMax',
    'establishedMin', 'establishedMax',
  ];
  const arrKeys = ['daibunrui', 'saibunrui', 'prefecture', 'shareholderType'];
  const strKeys = ['keyword', 'city', 'phonePattern', 'logic',
    'revenueNullMode', 'netIncomeNullMode', 'ageNullMode', 'employeeNullMode'];

  for (const k of numKeys) {
    const v = aiFilters[k];
    merged[k] = v == null || v === '' ? '' : String(v);
  }
  for (const k of arrKeys) {
    const v = aiFilters[k];
    merged[k] = Array.isArray(v) ? v : [];
  }
  for (const k of strKeys) {
    const v = aiFilters[k];
    merged[k] = v == null ? '' : String(v);
  }
  merged.repShareholderMatch = aiFilters.repShareholderMatch === true;
  if (!merged.logic) merged.logic = 'AND';

  // カテゴリ解決のため一度 fetchCategories
  let cats = null;
  try { cats = await fetchCategories(); } catch (e) { console.warn('fetchCategories failed', e); }

  // daibunrui を実DB値に正規化
  if (cats && Array.isArray(merged.daibunrui) && merged.daibunrui.length > 0) {
    const actualList = [...new Set(cats.map(c => c.daibunrui))];
    merged.daibunrui = resolveDaibunrui(merged.daibunrui, actualList);
  }

  // industryHint → saibunrui 部分一致で展開
  const hint = (aiFilters.industryHint || '').trim();
  if (hint && cats) {
    const matched = cats
      .filter(c => c.saibunrui && c.saibunrui.includes(hint))
      .map(c => c.saibunrui);
    const dedup = [...new Set([...(merged.saibunrui || []), ...matched])];
    // 100 件超になる場合は broad すぎるので無視（誤爆防止）
    if (dedup.length > 0 && dedup.length <= 80) merged.saibunrui = dedup;
  }

  // page リセット
  merged.page = 0;
  return merged;
}

// ========== セッション管理 ==========

export async function createChatSession(orgId, userId, title = null) {
  const { data, error } = await supabase
    .from('database_chat_sessions')
    .insert({ org_id: orgId, user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listChatSessions(userId, limit = 20) {
  const { data, error } = await supabase
    .from('database_chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function loadChatMessages(sessionId) {
  const { data, error } = await supabase
    .from('database_chat_messages')
    .select('id, role, content, filters_json, needs_clarification, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function appendChatMessage(sessionId, role, content, filtersJson = null, needsClarification = false) {
  const { data, error } = await supabase
    .from('database_chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      filters_json: filtersJson,
      needs_clarification: needsClarification,
    })
    .select()
    .single();
  if (error) throw error;

  // セッションの updated_at と title を最新の要約で更新
  const sessionUpdate = { updated_at: new Date().toISOString() };
  if (role === 'assistant' && content && !needsClarification) {
    sessionUpdate.title = content.slice(0, 60);
  }
  await supabase.from('database_chat_sessions').update(sessionUpdate).eq('id', sessionId);

  return data;
}

export async function deleteChatSession(sessionId) {
  const { error } = await supabase.from('database_chat_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

// ========== AI 呼び出し ==========

export async function sendChatToAi({ messages, daibunruiList, currentFilters }) {
  const { data, error } = await supabase.functions.invoke('chat-to-filter', {
    body: { messages, daibunruiList, currentFilters },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { summary, filters, needsClarification, clarifyQuestion }
}

// ========== 保存検索条件 ==========

export async function saveSearch(orgId, userId, name, filters) {
  const { data, error } = await supabase
    .from('saved_company_searches')
    .insert({
      org_id: orgId,
      user_id: userId,
      name,
      filters_json: pickPersistableFilters(filters),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listSavedSearches(userId) {
  const { data, error } = await supabase
    .from('saved_company_searches')
    .select('id, name, filters_json, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteSavedSearch(id) {
  const { error } = await supabase.from('saved_company_searches').delete().eq('id', id);
  if (error) throw error;
}
