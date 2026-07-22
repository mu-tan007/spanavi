import { useState, useCallback, useRef } from 'react';
import { searchCompanies } from '../lib/companyMasterApi';

const INITIAL_FILTERS = {
  keyword: '',
  keywords: [],     // AIチャット由来の複数キーワード
  daibunrui: [],    // 複数選択対応
  saibunrui: [],    // 複数選択対応
  prefecture: [],   // 複数選択対応
  city: '',
  cities: [],       // AIチャット由来の複数市区町村
  revenueMin: '',
  revenueMax: '',
  revenueNullMode: '',   // '' | 'include' | 'exclude'
  netIncomeMin: '',
  netIncomeMax: '',
  netIncomeNullMode: '',  // '' | 'include' | 'exclude'
  ageMin: '',
  ageMax: '',
  ageNullMode: '',       // '' | 'include' | 'exclude'
  employeeMin: '',
  employeeMax: '',
  employeeNullMode: '',  // '' | 'include' | 'exclude'
  phonePattern: '',
  phonePatterns: [],   // 複数前方一致パターン（カンマ区切り入力 → 配列）
  establishedMin: '',
  establishedMax: '',
  shareholderType: [],  // ['individual', 'corporate', 'mixed', 'empty']
  callStatus: [],   // 架電ステータス抽出（'未架電'/'未登録'/9ステータス）。いずれか該当でヒット
  callCategory: [], // 商材(business_categories id)。架電ステータスを商材スコープで評価。複数=OR
  dbLabel: [],      // 企業DBラベル（'M&Aニーズあり' 等）。company_db_labels 由来
  repShareholderMatch: false,  // 代表者名が株主欄に含まれるか
  logic: 'AND',     // AND / OR
  sortCol: 'id',
  sortDir: 'asc',
  page: 0,
  pageSize: 50,
  queryEmbedding: null,  // pgvector 意味検索用（数値配列 1536要素 or null）
};

export function useCompanySearch() {
  const [filters, setFiltersState] = useState(INITIAL_FILTERS);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const setFilter = useCallback((key, value) => {
    setFiltersState(prev => ({ ...prev, [key]: value, page: key === 'page' ? value : 0 }));
  }, []);

  const setFilters = useCallback((updater) => {
    setFiltersState(prev => ({ ...updater(prev), page: 0 }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(INITIAL_FILTERS);
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
  }, []);

  const doSearch = useCallback(async (overrideFilters) => {
    const f = overrideFilters || filters;
    setLoading(true);
    setError(null);
    try {
      const { rows, totalCount: tc } = await searchCompanies(f);
      setResults(rows);
      setTotalCount(tc);
      setHasSearched(true);
    } catch (e) {
      console.error('Search error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const setPage = useCallback((page) => {
    setFiltersState(prev => {
      const newF = { ...prev, page };
      setTimeout(() => doSearch(newF), 0);
      return newF;
    });
  }, [doSearch]);

  return {
    filters, setFilter, setFilters, resetFilters,
    results, totalCount, loading, error, hasSearched,
    doSearch, setPage,
  };
}
