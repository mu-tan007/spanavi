import { supabase } from './supabase';

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
