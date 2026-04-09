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

/** 都道府県一覧取得 */
let _prefectureCache = null;
export async function fetchPrefectures() {
  if (_prefectureCache) return _prefectureCache;
  const { data, error } = await supabase
    .from('company_master')
    .select('prefecture')
    .not('prefecture', 'is', null)
    .order('prefecture');
  if (error) throw error;
  const unique = [...new Set(data.map(d => d.prefecture))];
  _prefectureCache = unique;
  return unique;
}

/** 企業検索（RPC） - 複数選択・AND/OR対応 */
export async function searchCompanies(filters) {
  const params = {};
  if (filters.keyword) params.p_keyword = filters.keyword;
  if (filters.daibunrui?.length) params.p_daibunrui_arr = filters.daibunrui;
  if (filters.saibunrui?.length) params.p_saibunrui_arr = filters.saibunrui;
  if (filters.prefecture?.length) params.p_prefecture_arr = filters.prefecture;
  if (filters.city) params.p_city = filters.city;
  if (filters.revenueMin != null && filters.revenueMin !== '') params.p_revenue_min = Number(filters.revenueMin);
  if (filters.revenueMax != null && filters.revenueMax !== '') params.p_revenue_max = Number(filters.revenueMax);
  if (filters.ageMin != null && filters.ageMin !== '') params.p_age_min = Number(filters.ageMin);
  if (filters.ageMax != null && filters.ageMax !== '') params.p_age_max = Number(filters.ageMax);
  if (filters.employeeMin != null && filters.employeeMin !== '') params.p_employee_min = Number(filters.employeeMin);
  if (filters.employeeMax != null && filters.employeeMax !== '') params.p_employee_max = Number(filters.employeeMax);
  if (filters.phonePattern) params.p_phone_pattern = filters.phonePattern;
  if (filters.establishedMin != null && filters.establishedMin !== '') params.p_established_min = Number(filters.establishedMin);
  if (filters.establishedMax != null && filters.establishedMax !== '') params.p_established_max = Number(filters.establishedMax);
  if (filters.shareholderType) params.p_shareholder_type = filters.shareholderType;
  params.p_logic = filters.logic || 'AND';
  if (filters.sortCol) params.p_sort_col = filters.sortCol;
  if (filters.sortDir) params.p_sort_dir = filters.sortDir;
  params.p_page = filters.page || 0;
  params.p_page_size = filters.pageSize || 50;

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
