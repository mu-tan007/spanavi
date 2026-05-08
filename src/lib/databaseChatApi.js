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
 * AI が返した filters（industryHint含む）を、useCompanySearch が使うシェイプにマージ
 * - industryHint があれば fetchCategories の saibunrui に対し部分一致で saibunrui[] を埋める
 * - daibunrui が AI から指定されていればそのまま採用
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

  // industryHint → saibunrui 部分一致で展開
  const hint = (aiFilters.industryHint || '').trim();
  if (hint) {
    try {
      const cats = await fetchCategories();
      const matched = cats
        .filter(c => c.saibunrui && c.saibunrui.includes(hint))
        .map(c => c.saibunrui);
      const dedup = [...new Set([...(merged.saibunrui || []), ...matched])];
      // ただし 100 件超になる場合は AND/OR で broad すぎるので無視（誤爆防止）
      if (dedup.length > 0 && dedup.length <= 80) merged.saibunrui = dedup;
    } catch (e) {
      console.warn('[databaseChatApi] industryHint expansion failed', e);
    }
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
