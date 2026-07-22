import { supabase } from './supabase';
import { getOrgId } from './orgContext';

/**
 * 会社名を company_master.normalized_name と照合するための正規化。
 * DB側で「株式会社／(株)／（株）等の法人格を除去 + NFKC + 小文字化」した値で保持されている前提
 * (例: 「株式会社ＣＡＧＬＡ」→「cagla」、「リング株式会社」→「リング」)。
 */
export function normalizeCompanyNameForMaster(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFKC')
    .replace(/株式会社|有限会社|合同会社|合資会社/g, '')
    .replace(/[（(](?:株|有|合)[)）]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/** 代表者名の正規化 (会社名と同じ NFKC+空白除去+小文字化)。同姓同名は仕方ない。 */
function normalizeRepresentative(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/** 電話番号の数字以外を除去 (ハイフン揺れ吸収)。 */
function digitsOnly(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^0-9]/g, '');
}

/**
 * 住所の正規化。同一住所の表記揺れを吸収して比較できる形にする。
 * 揺れの種類:
 *   - 全角数字/英字 → 半角 (NFKC)
 *   - 各種ダッシュ・カタカナ長音 (‐ – — ― ー ｰ −) → 半角ハイフン
 *   - 郵便番号 (〒XXX-XXXX) の有無
 *   - ビル名前の区切り (空白 / 「/」) の差異
 *   - 全角/半角空白の有無
 *   - 大文字小文字 (英字)
 *
 * 例:
 *   入力: 「東京都立川市錦町3-5-22 YAZAWA DEUXビル5F」
 *   DB側: 「東京都立川市錦町３-５-２２/ＹＡＺＡＷＡ ＤＥＵＸビル５Ｆ」
 *   両方とも正規化後: 「東京都立川市錦町3-5-22yazawadeuxビル5f」 ← 一致
 */
function normalizeAddress(addr) {
  if (!addr) return '';
  return String(addr)
    .normalize('NFKC')
    .replace(/〒\s*\d{3}-?\d{4}\s*/g, '')   // 郵便番号除去
    .replace(/[‐–—―ーｰ−]/g, '-')             // ダッシュ・長音 → 半角ハイフン
    .replace(/\//g, '')                       // 「/」(ビル名区切り) 除去
    .replace(/[、，,]/g, '')                   // カンマ除去
    .replace(/\s+/g, '')                       // 空白(全角含む)除去
    .toLowerCase()
    .trim();
}

/**
 * 会社名 + 補助情報 (電話/代表者/住所) で company_master を 1 件特定する。
 *
 * 同名異会社のリスクがあるため、会社名で候補を全て取得した上で
 * 補助情報による絞り込みを試みる。一意に絞れない場合は自動入力スキップ。
 *
 * 絞り込み優先順位:
 *   (1) 会社名 + 電話番号完全一致 → 高信頼
 *   (2) 会社名 + 代表者名完全一致 → 高信頼
 *   (3) 会社名 + 住所完全一致 (正規化後) → 高信頼
 *       ※ 同名異会社のリスクを避けるため、住所末尾までの完全一致を要求。
 *         半角/全角・ダッシュ揺れは正規化で吸収する。
 *   (4) いずれも1件に絞れない → null (ambiguous)
 *
 * @param {Object} params
 * @param {string} params.company_name 必須
 * @param {string} [params.representative] 代表者名
 * @param {string} [params.phone] 電話番号
 * @param {string} [params.address] 住所 (都道府県抽出に使用)
 * @returns {Promise<{ match: object|null, confidence: 'high'|'ambiguous'|'no_match'|'no_input', candidates: number }>}
 */
export async function fetchCompanyMasterByName({ company_name, representative, phone, address } = {}) {
  const normalized = normalizeCompanyNameForMaster(company_name);
  if (!normalized) return { match: null, confidence: 'no_input', candidates: 0 };

  const { data: candidates, error } = await supabase
    .from('company_master')
    .select('id, company_name, normalized_name, revenue_k, net_income_k, phone, business_description, full_address, prefecture, representative, normalized_representative, employee_count')
    .eq('normalized_name', normalized)
    .limit(50);

  if (error) {
    console.warn('[companyMaster] lookup error:', error);
    return { match: null, confidence: 'no_match', candidates: 0 };
  }
  if (!candidates?.length) return { match: null, confidence: 'no_match', candidates: 0 };
  if (candidates.length === 1) return { match: candidates[0], confidence: 'high', candidates: 1 };

  // 複数候補：補助情報で絞り込み
  // (1) 電話番号完全一致
  const inputPhone = digitsOnly(phone);
  if (inputPhone) {
    const byPhone = candidates.filter(c => digitsOnly(c.phone) === inputPhone);
    if (byPhone.length === 1) return { match: byPhone[0], confidence: 'high', candidates: candidates.length };
  }

  // (2) 代表者名完全一致 (DB側 normalized_representative と比較)
  const inputRep = normalizeRepresentative(representative);
  if (inputRep) {
    const byRep = candidates.filter(c => normalizeRepresentative(c.normalized_representative || c.representative) === inputRep);
    if (byRep.length === 1) return { match: byRep[0], confidence: 'high', candidates: candidates.length };
  }

  // (3) 住所完全一致 (正規化後)。同名異会社誤マッチ防止のため都道府県一致では不十分。
  const inputAddr = normalizeAddress(address);
  if (inputAddr) {
    const byAddr = candidates.filter(c => normalizeAddress(c.full_address) === inputAddr);
    if (byAddr.length === 1) return { match: byAddr[0], confidence: 'high', candidates: candidates.length };
  }

  // 絞り込めず
  console.info(`[companyMaster] ambiguous: ${candidates.length} candidates for "${company_name}"`);
  return { match: null, confidence: 'ambiguous', candidates: candidates.length };
}

/** カテゴリマスタ取得（キャッシュ用） */
let _categoryCache = null;
export async function fetchCategories() {
  if (_categoryCache) return _categoryCache;
  const { data, error } = await supabase
    .from('tsr_category_master')
    .select('daibunrui, saibunrui')
    .order('daibunrui')
    .order('saibunrui');
  if (error) throw error;
  _categoryCache = data;
  return data;
}

/** AIへ渡す形（大分類でグループ化された細分類リスト） */
let _categoryGroupCache = null;
export async function fetchCategoryGroups() {
  if (_categoryGroupCache) return _categoryGroupCache;
  const cats = await fetchCategories();
  const map = new Map();
  for (const c of cats) {
    if (!c.daibunrui) continue;
    if (!map.has(c.daibunrui)) map.set(c.daibunrui, []);
    if (c.saibunrui) map.get(c.daibunrui).push(c.saibunrui);
  }
  _categoryGroupCache = [...map.entries()].map(([daibunrui, saibunruis]) => ({ daibunrui, saibunruis }));
  return _categoryGroupCache;
}

/** 都道府県一覧（地理順：北→南） */
const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県',
  '三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];
export async function fetchPrefectures() {
  return PREFECTURES;
}

/** 商材一覧（business_categories: M&A/人材/IFA/コンサル/SaaS）。架電ステータス抽出の商材軸で使用 */
let _businessCategoryCache = null;
export async function fetchBusinessCategories() {
  if (_businessCategoryCache) return _businessCategoryCache;
  const { data, error } = await supabase
    .from('business_categories')
    .select('id,name,slug,display_order')
    .eq('org_id', getOrgId())
    .eq('is_active', true)
    .order('display_order');
  if (error) { console.warn('[companyMasterApi] fetchBusinessCategories error:', error.message); return []; }
  _businessCategoryCache = data || [];
  return _businessCategoryCache;
}

/** 企業検索（RPC） - 複数選択・AND/OR対応 */
export async function searchCompanies(filters) {
  const params = {};
  if (filters.keyword) params.p_keyword = filters.keyword;
  if (filters.daibunrui?.length) params.p_daibunrui_arr = filters.daibunrui;
  if (filters.saibunrui?.length) params.p_saibunrui_arr = filters.saibunrui;
  if (filters.prefecture?.length) params.p_prefecture_arr = filters.prefecture;
  if (filters.city) params.p_city = filters.city;
  if (filters.cities?.length) params.p_city_arr = filters.cities;
  if (filters.revenueMin != null && filters.revenueMin !== '') params.p_revenue_min = Number(filters.revenueMin);
  if (filters.revenueMax != null && filters.revenueMax !== '') params.p_revenue_max = Number(filters.revenueMax);
  if (filters.revenueNullMode === 'include') params.p_revenue_include_null = true;
  if (filters.revenueNullMode === 'exclude') params.p_revenue_exclude_null = true;
  if (filters.netIncomeMin != null && filters.netIncomeMin !== '') params.p_net_income_min = Number(filters.netIncomeMin);
  if (filters.netIncomeMax != null && filters.netIncomeMax !== '') params.p_net_income_max = Number(filters.netIncomeMax);
  if (filters.netIncomeNullMode === 'include') params.p_net_income_include_null = true;
  if (filters.netIncomeNullMode === 'exclude') params.p_net_income_exclude_null = true;
  if (filters.ageMin != null && filters.ageMin !== '') params.p_age_min = Number(filters.ageMin);
  if (filters.ageMax != null && filters.ageMax !== '') params.p_age_max = Number(filters.ageMax);
  if (filters.ageNullMode === 'include') params.p_age_include_null = true;
  if (filters.ageNullMode === 'exclude') params.p_age_exclude_null = true;
  if (filters.employeeMin != null && filters.employeeMin !== '') params.p_employee_min = Number(filters.employeeMin);
  if (filters.employeeMax != null && filters.employeeMax !== '') params.p_employee_max = Number(filters.employeeMax);
  if (filters.employeeNullMode === 'include') params.p_employee_include_null = true;
  if (filters.employeeNullMode === 'exclude') params.p_employee_exclude_null = true;
  // 電話番号: 単数 phonePattern または複数 phonePatterns（カンマ/空白区切りも自動分割）
  if (filters.phonePatterns?.length) {
    params.p_phone_patterns = filters.phonePatterns;
  } else if (filters.phonePattern) {
    const split = String(filters.phonePattern).split(/[,、\s]+/).map(s => s.trim()).filter(Boolean);
    if (split.length > 1) {
      params.p_phone_patterns = split;
    } else {
      params.p_phone_pattern = filters.phonePattern;
    }
  }
  if (filters.establishedMin != null && filters.establishedMin !== '') params.p_established_min = Number(filters.establishedMin);
  if (filters.establishedMax != null && filters.establishedMax !== '') params.p_established_max = Number(filters.establishedMax);
  if (filters.shareholderType?.length) params.p_shareholder_type_arr = filters.shareholderType;
  if (filters.callStatus?.length) params.p_call_status_arr = filters.callStatus;
  if (filters.callCategory?.length) params.p_call_category_arr = filters.callCategory;
  if (filters.repShareholderMatch) params.p_rep_shareholder_match = true;
  params.p_logic = filters.logic || 'AND';
  if (filters.sortCol) params.p_sort_col = filters.sortCol;
  if (filters.sortDir) params.p_sort_dir = filters.sortDir;
  params.p_page = filters.page || 0;
  params.p_page_size = filters.pageSize || 50;
  // 拡張パラメータ（A: 複数キーワード, C: 意味検索）
  if (filters.keywords?.length) params.p_keyword_arr = filters.keywords;
  if (filters.queryEmbedding) params.p_query_embedding = filters.queryEmbedding;
  // 業種 OR キーワード モード: saibunrui[] と keywords[] を OR ブロックで結合
  if (filters.industryOrMode) params.p_industry_or_mode = true;

  // リトライ付きRPC呼び出し（一時的なネットワークエラー対策）
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
    const { data, error } = await supabase.rpc('search_company_master', params);
    if (!error) {
      const totalCount = data?.[0]?.total_count || 0;
      return { rows: data || [], totalCount: Number(totalCount) };
    }
    lastError = error;
    // サーバー側エラー（400系）はリトライしない
    if (error.code && !error.message?.includes('Failed to fetch')) break;
  }
  throw lastError;
}

/**
 * 企業DBの1社について、その企業（企業名＋電話一致）が含まれる全リスト
 * （稼働中＋アーカイブ）での架電履歴を取得する。
 * 突合・正規化はRPC(get_company_call_history)側で完結するため、生の企業名・電話を渡す。
 * @returns {Promise<{ rows: Array, error: any }>}
 *   rows: { list_id, list_name, is_archived, item_id, item_company, item_call_status,
 *           round, status, called_at, getter_name }
 */
export async function fetchCompanyCallHistory(company, phone) {
  if (!company || !phone) return { rows: [], error: null };
  const { data, error } = await supabase.rpc('get_company_call_history', {
    p_company: company,
    p_phone: phone,
  });
  if (error) {
    console.warn('[companyMasterApi] fetchCompanyCallHistory error:', error.message);
    return { rows: [], error };
  }
  return { rows: data || [], error: null };
}
