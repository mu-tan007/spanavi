import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// engagement_id 別のキーマン意向選択肢を取得するフック
// (DB の engagement_keyman_intents テーブルから動的に引く)
//
// 戻り値:
//   { options, loading }
//   options: [{ value, label, short_label, color, display_order }, ...] 4 件 (基本)
//
// engagement_id が無い場合 (= 旧経路で engagement 未指定アポ) は M&A 売り手 既定。
// 表示順 (display_order) でソート済み。

// engagement 不明時のフォールバック (M&A 売り手 想定の旧仕様)
const FALLBACK_OPTIONS = [
  { value: 'positive', label: '前向き',   short_label: '高',   color: 'success',  display_order: 1 },
  { value: 'wait',     label: '様子見',   short_label: '中',   color: 'info',     display_order: 2 },
  { value: 'negative', label: '消極的',   short_label: '低',   color: 'warn',     display_order: 3 },
  { value: 'unknown',  label: '不明',     short_label: '不明', color: 'neutral',  display_order: 4 },
];

// 単純なメモリキャッシュ (engagement_id → options)。アプリ起動中は1回引いたら使い回す。
const cache = new Map();

export function useKeymanIntents(engagementId) {
  const [options, setOptions] = useState(() => cache.get(engagementId) || FALLBACK_OPTIONS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!engagementId) { setOptions(FALLBACK_OPTIONS); return; }
    const cached = cache.get(engagementId);
    if (cached) { setOptions(cached); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('engagement_keyman_intents')
        .select('value, label, short_label, color, display_order')
        .eq('engagement_id', engagementId)
        .order('display_order');
      if (cancelled) return;
      setLoading(false);
      if (error || !data || data.length === 0) {
        cache.set(engagementId, FALLBACK_OPTIONS);
        setOptions(FALLBACK_OPTIONS);
        return;
      }
      cache.set(engagementId, data);
      setOptions(data);
    })();
    return () => { cancelled = true; };
  }, [engagementId]);

  return { options, loading };
}

// クライアントの主要 engagement_id を解決して意向選択肢を返すヘルパー
// (クライアントポータルなど engagement_id 直接渡しが難しい場合のショートカット)
export function useKeymanIntentsForClient(clientId) {
  const [engagementId, setEngagementId] = useState(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('clients').select('engagement_id').eq('id', clientId).maybeSingle();
      if (!cancelled) setEngagementId(data?.engagement_id || null);
    })();
    return () => { cancelled = true; };
  }, [clientId]);
  return useKeymanIntents(engagementId);
}
