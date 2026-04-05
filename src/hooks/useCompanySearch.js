import { useState, useCallback, useRef } from 'react';
import { searchCompanies } from '../lib/companyMasterApi';

const INITIAL_FILTERS = {
  keyword: '',
  daibunrui: [],    // 複数選択対応
  saibunrui: [],    // 複数選択対応
  prefecture: [],   // 複数選択対応
  city: '',
  revenueMin: '',
  revenueMax: '',
  ageMin: '',
  ageMax: '',
  employeeMin: '',
  employeeMax: '',
  phonePattern: '',
  establishedMin: '',
  establishedMax: '',
  logic: 'AND',     // AND / OR
  sortCol: 'id',
  sortDir: 'asc',
  page: 0,
  pageSize: 50,
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
