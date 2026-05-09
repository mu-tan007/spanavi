// Database 画面 自然言語チャット & 保存検索条件 用クライアントAPI
//   - chat-to-filter Edge Function を呼び出して filters JSON を取得
//   - 会話履歴 (database_chat_sessions / database_chat_messages) と保存検索を Supabase に永続化
//
// 設計メモ:
//   filters_json は INITIAL_FILTERS と同じシェイプを期待（page/pageSize/sort* は除外して保存）

import { supabase } from './supabase';
import { fetchCategories, fetchCategoryGroups } from './companyMasterApi';

// INITIAL_FILTERS の「保存対象」フィールド（UI状態は除く、queryEmbedding は揮発性なので除外）
const PERSIST_KEYS = [
  'keyword', 'keywords', 'daibunrui', 'saibunrui', 'prefecture', 'city',
  'revenueMin', 'revenueMax', 'revenueNullMode',
  'netIncomeMin', 'netIncomeMax', 'netIncomeNullMode',
  'ageMin', 'ageMax', 'ageNullMode',
  'employeeMin', 'employeeMax', 'employeeNullMode',
  'phonePattern', 'phonePatterns', 'establishedMin', 'establishedMax',
  'shareholderType', 'repShareholderMatch', 'logic',
];

export function pickPersistableFilters(filters) {
  const out = {};
  for (const k of PERSIST_KEYS) if (filters[k] !== undefined) out[k] = filters[k];
  return out;
}

// embedding バックフィル進捗をキャッシュ付きで取得
let _coverageCache = { value: null, ts: 0 };
export async function getEmbeddingCoverage() {
  const now = Date.now();
  if (_coverageCache.value !== null && now - _coverageCache.ts < 5 * 60 * 1000) {
    return _coverageCache.value;
  }
  const { count: totalCount } = await supabase
    .from('company_master').select('id', { count: 'exact', head: true });
  const { count: pendingCount } = await supabase
    .from('company_master').select('id', { count: 'exact', head: true }).is('embedding', null);
  if (!totalCount) return 0;
  const coverage = (totalCount - (pendingCount || 0)) / totalCount;
  _coverageCache = { value: coverage, ts: now };
  return coverage;
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
 * AI が返した filters を useCompanySearch が使うシェイプにマージ
 * - A: keywords[] / industryHints[] が複数化
 * - B: AIが直接 saibunrui[] を選ぶ（既に実DB値で来る前提だが正規化はする）
 * - C: semanticQuery があれば embed-query を呼んで queryEmbedding をセット
 * - daibunrui は実DB値（"E 製造業" 等）に解決
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
  const arrKeys = ['daibunrui', 'saibunrui', 'prefecture', 'shareholderType', 'keywords', 'cities', 'phonePatterns'];
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

  // city が空白区切りの複数都市文字列なら cities[] に分割（v6以前との互換）
  if (typeof merged.city === 'string' && merged.city.includes(' ') && (!merged.cities || merged.cities.length === 0)) {
    merged.cities = merged.city.split(/[\s　]+/).filter(Boolean);
    merged.city = '';
  }

  // カテゴリ解決のため一度 fetchCategories
  let cats = null;
  try { cats = await fetchCategories(); } catch (e) { console.warn('fetchCategories failed', e); }

  // daibunrui を実DB値に正規化
  if (cats && Array.isArray(merged.daibunrui) && merged.daibunrui.length > 0) {
    const actualList = [...new Set(cats.map(c => c.daibunrui))];
    merged.daibunrui = resolveDaibunrui(merged.daibunrui, actualList);
  }

  // saibunrui も実DB値検証（AIが直接選んでも一応フィルタ）
  if (cats && Array.isArray(merged.saibunrui) && merged.saibunrui.length > 0) {
    const actualSai = new Set(cats.map(c => c.saibunrui));
    merged.saibunrui = merged.saibunrui.filter(s => actualSai.has(s));
  }

  // saibunrui が指定されているときは daibunrui の AND 条件を外す
  //   （AI が大分類を跨いで細分類を選んだとき、daibunrui との AND で 0件になる事故対策。
  //    "鉛・亜鉛鉱業" が C 鉱業の細分類なのに daibunrui = E 製造業 と矛盾するケースが頻発）
  if (Array.isArray(merged.saibunrui) && merged.saibunrui.length > 0) {
    merged.daibunrui = [];
  }

  // saibunrui が十分多い（>=20）ときは keywords を捨てる
  //   - keywords ILIKE は 2文字日本語が trigram に乗らず seq scan → タイムアウト原因
  //   - saibunrui が大量にあれば既に recall は十分なので、ILIKE 拡張は不要
  const SAIBUNRUI_LARGE_THRESHOLD = 20;
  if (Array.isArray(merged.saibunrui) && merged.saibunrui.length >= SAIBUNRUI_LARGE_THRESHOLD) {
    merged.keywords = [];
    merged.keyword = '';
  }

  // 業種 OR キーワードモード: saibunrui[] が少なめ かつ keywords[] あるとき
  //   RPC で OR ブロックとして結合して recall を上げる
  //   （saibunrui が少ない → keywords で漏れを救う価値が高い）
  merged.industryOrMode = (
    Array.isArray(merged.saibunrui) && merged.saibunrui.length > 0
    && merged.saibunrui.length < SAIBUNRUI_LARGE_THRESHOLD
    && Array.isArray(merged.keywords) && merged.keywords.length > 0
  );

  // industryHints[] (複数) → saibunrui 部分一致で展開（追加）
  const hints = Array.isArray(aiFilters.industryHints) ? aiFilters.industryHints
    : (aiFilters.industryHint ? [aiFilters.industryHint] : []);
  if (hints.length && cats) {
    const matched = new Set(merged.saibunrui || []);
    for (const hint of hints) {
      const h = String(hint || '').trim();
      if (!h) continue;
      cats
        .filter(c => c.saibunrui && c.saibunrui.includes(h))
        .forEach(c => matched.add(c.saibunrui));
    }
    const arr = [...matched];
    if (arr.length > 0 && arr.length <= 100) merged.saibunrui = arr;
  }

  // C: semanticQuery → embed-query で 1536 次元 vector に変換
  //    ただし embedding カバレッジが低い間（バックフィル進行中）は意味検索を抑制
  //    （semantic 検索は cm.embedding IS NOT NULL を AND するため、未埋め込みの企業が
  //     ヒット候補から除外され、結果が極端に少なくなる）
  const semQ = (aiFilters.semanticQuery || '').trim();
  merged.queryEmbedding = null;
  if (semQ) {
    const coverage = await getEmbeddingCoverage().catch(() => 0);
    if (coverage >= 0.9) {
      try {
        const { data, error } = await supabase.functions.invoke('embed-query', {
          body: { query: semQ },
        });
        if (error) throw error;
        if (data?.embedding && Array.isArray(data.embedding)) {
          merged.queryEmbedding = data.embedding;
        }
      } catch (e) {
        console.warn('[databaseChatApi] embed-query failed', e);
      }
    } else {
      console.info(`[databaseChatApi] semanticQuery skipped (coverage ${(coverage * 100).toFixed(1)}% < 90%)`);
    }
  }

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

export async function sendChatToAi({ messages, currentFilters }) {
  const categoryGroups = await fetchCategoryGroups();
  const { data, error } = await supabase.functions.invoke('chat-to-filter', {
    body: { messages, categoryGroups, currentFilters },
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
