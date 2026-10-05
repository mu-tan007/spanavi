import { useEffect, useMemo, useState } from 'react';
import { fetchCategories, fetchPrefectures } from '../lib/companyMasterApi';
import { fetchDirectoryLists, fetchDirectoryCallOptions } from '../lib/companyDirectoryApi';
import { COMPANY_REGISTRY_STATUSES } from '../utils/companyProfileIdentity';

// 企業DBの検索条件の選択肢（業種・都道府県・架電の商材とタイプ・架電リスト）。
// 条件の欄と、チップの名前（ID → 名前）の両方で使うので、親で1回だけ取る。
export function useDirectoryFilterOptions() {
  const [options, setOptions] = useState({ categories: [], prefectures: [], categoriesCall: [], engagements: [], lists: [] });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.allSettled([
      fetchCategories(), fetchPrefectures(),
      fetchDirectoryCallOptions('categories', controller.signal),
      fetchDirectoryCallOptions('engagements', controller.signal),
      fetchDirectoryLists(controller.signal),
    ]).then((results) => {
      if (!active) return;
      const keys = ['categories', 'prefectures', 'categoriesCall', 'engagements', 'lists'];
      setOptions((prev) => ({ ...prev, ...Object.fromEntries(results.flatMap((r, i) => (r.status === 'fulfilled' ? [[keys[i], r.value]] : []))) }));
      setError(results.some((r) => r.status === 'rejected') ? '一部の検索候補を取得できませんでした。再読み込みしてください。' : '');
    });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  // チップに名前を出すための表
  const names = useMemo(() => ({
    lists: new Map((options.lists || []).map((l) => [l.id, l.name])),
    categoriesCall: new Map((options.categoriesCall || []).map((c) => [c.id, c.name])),
    engagements: new Map((options.engagements || []).map((e) => [e.id, e.name])),
    registry: new Map((COMPANY_REGISTRY_STATUSES || []).map((s) => [s.value, s.label])),
  }), [options]);

  return { options, names, error, retry: () => setAttempt((n) => n + 1) };
}
