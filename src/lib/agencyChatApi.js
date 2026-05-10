// MASP Firms (cap_ma_agencies) 自然言語チャット & 保存検索 用クライアント API
//   - chat-to-filter-agency Edge Function を呼び出して filters JSON を取得
//   - 会話履歴 (masp_chat_sessions / masp_chat_messages) と保存検索を Supabase に永続化
//
// AI が返す filters のシェイプ:
//   {
//     keywords: string[], logic: 'AND' | 'OR',
//     prefectures: string[],
//     staffMin: number | null, staffMax: number | null, excludeStaffNull: boolean,
//     infoSharing: '' | 'yes' | 'no',
//     feeFaSeller: '' | 'yes' | 'no',
//     feeFaBuyer: '' | 'yes' | 'no',
//     feeBrokerSeller: '' | 'yes' | 'no',
//     feeBrokerBuyer: '' | 'yes' | 'no',
//     status: '' | 'not_contacted' | 'contacted'
//   }
//
// MaspFirmsView の state は1つのオブジェクトでは持っていないので、apply は
// 個別 setter のセットを setters 引数で渡してもらう。

import { supabase } from './supabase';

const PREFS = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];
const PREF_SET = new Set(PREFS);

const YES_NO = (v) => (v === 'yes' || v === 'no' ? v : '');
const VALID_STATUSES = new Set(['not_contacted', 'contacted', 'partner']);
const STATUSES_OK = (v) => {
  if (Array.isArray(v)) return v.filter(s => VALID_STATUSES.has(s));
  // 後方互換: AI が文字列で返してきた場合は配列化
  if (typeof v === 'string' && VALID_STATUSES.has(v)) return [v];
  return [];
};
const CONTACT_OK = (v) => (['email', 'form', 'any', 'none'].includes(v) ? v : '');

/**
 * AI が返した filters を MaspFirmsView の個別 setter に流し込む。
 * setters は { setKeywords, setKeywordLogic, setFilterPrefs, setFilterStaffMin, ... } の集合。
 * 都道府県は複数選択 (filterPrefs: string[]) で MaspFirmsView 側に保持される。
 *
 * 全置換ではなく上書きするフィールドのみ touch (AI が空指定したフィールドはクリアする)。
 */
export function applyAiFiltersToAgencyState(aiFilters, setters) {
  if (!aiFilters || typeof aiFilters !== 'object') return;
  const f = aiFilters;

  // keywords
  const keywords = Array.isArray(f.keywords) ? f.keywords.map(s => String(s || '').trim()).filter(Boolean) : [];
  setters.setKeywords?.(keywords);
  setters.setKeywordLogic?.(f.logic === 'OR' ? 'OR' : 'AND');

  // prefectures (複数選択)。47都道府県以外は自動的に除外。
  const prefList = Array.isArray(f.prefectures) ? f.prefectures.filter(p => PREF_SET.has(p)) : [];
  setters.setFilterPrefs?.(prefList);

  // staffMin/Max + null除外
  const staffMin = (typeof f.staffMin === 'number' && Number.isFinite(f.staffMin)) ? String(f.staffMin) : '';
  const staffMax = (typeof f.staffMax === 'number' && Number.isFinite(f.staffMax)) ? String(f.staffMax) : '';
  setters.setFilterStaffMin?.(staffMin);
  setters.setFilterStaffMax?.(staffMax);
  setters.setExcludeStaffNull?.(f.excludeStaffNull === true);

  // 手数料体系 (個別)
  setters.setFilterFaSeller?.(YES_NO(f.feeFaSeller));
  setters.setFilterFaBuyer?.(YES_NO(f.feeFaBuyer));
  setters.setFilterBrokerSeller?.(YES_NO(f.feeBrokerSeller));
  setters.setFilterBrokerBuyer?.(YES_NO(f.feeBrokerBuyer));

  // status (配列で複数選択可。AI は statuses or status いずれでも返せる)
  const statusList = STATUSES_OK(f.statuses ?? f.status);
  setters.setFilterStatuses?.(statusList);

  // 連絡先有無
  setters.setFilterContact?.(CONTACT_OK(f.contact));

  // ページ・選択は AI 適用時に常にリセット
  setters.setPage?.(1);
  setters.setSelectedIds?.(new Set());
  setters.setSelectAll?.(false);
}

// ========== セッション管理 ==========

export async function createChatSession(orgId, userId, title = null) {
  const { data, error } = await supabase
    .from('masp_chat_sessions')
    .insert({ org_id: orgId, user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listChatSessions(userId, limit = 20) {
  const { data, error } = await supabase
    .from('masp_chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function loadChatMessages(sessionId) {
  const { data, error } = await supabase
    .from('masp_chat_messages')
    .select('id, role, content, filters, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function appendChatMessage(sessionId, role, content, filters = null) {
  const { data, error } = await supabase
    .from('masp_chat_messages')
    .insert({ session_id: sessionId, role, content, filters })
    .select()
    .single();
  if (error) throw error;

  // updated_at と title を最新で更新
  const sessionUpdate = { updated_at: new Date().toISOString() };
  if (role === 'assistant' && content) {
    sessionUpdate.title = content.slice(0, 60);
  }
  await supabase.from('masp_chat_sessions').update(sessionUpdate).eq('id', sessionId);

  return data;
}

export async function deleteChatSession(sessionId) {
  const { error } = await supabase.from('masp_chat_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

// ========== AI 呼び出し ==========

export async function sendChatToAi({ messages, currentFilters }) {
  const { data, error } = await supabase.functions.invoke('chat-to-filter-agency', {
    body: { messages, currentFilters },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { summary, filters, needsClarification, clarifyQuestion }
}

// ========== 保存検索 ==========

export async function saveSearch(orgId, userId, name, filters) {
  const { data, error } = await supabase
    .from('saved_agency_searches')
    .insert({ org_id: orgId, user_id: userId, name, filters })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listSavedSearches(userId) {
  const { data, error } = await supabase
    .from('saved_agency_searches')
    .select('id, name, filters, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteSavedSearch(id) {
  const { error } = await supabase.from('saved_agency_searches').delete().eq('id', id);
  if (error) throw error;
}
