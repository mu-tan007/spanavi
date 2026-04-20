import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

const STORAGE_KEY = 'spanavi_current_engagement_slug';

// MASP (全社モード) を表す仮想エンゲージメント。DBには存在しない。
export const MASP_ENGAGEMENT = {
  id: 'masp_global',
  slug: 'masp',
  name: 'MASP',
  type: 'global',
  status: 'active',
  display_order: 0,
  description: '全社共通メニュー',
  isVirtual: true,
};

const EngagementContext = createContext(null);

export function EngagementProvider({ children }) {
  const [dbEngagements, setDbEngagements] = useState([]);
  const [currentSlug, setCurrentSlug] = useState(null);
  const [loading, setLoading] = useState(true);

  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      if (!orgId) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('engagements')
        .select('id,name,slug,type,status,display_order,description')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('display_order');
      if (cancelled) return;
      if (!error && data) {
        setDbEngagements(data);
        const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
        const all = [MASP_ENGAGEMENT, ...data];
        const initial = all.find(e => e.slug === saved)
          || all.find(e => e.slug === 'seller_sourcing')
          || all[0];
        setCurrentSlug(initial?.slug || null);
      }
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [orgId]);

  const engagements = useMemo(() => [MASP_ENGAGEMENT, ...dbEngagements], [dbEngagements]);
  const currentEngagement = useMemo(
    () => engagements.find(e => e.slug === currentSlug) || null,
    [engagements, currentSlug]
  );

  const switchEngagement = (slug) => {
    const eng = engagements.find(e => e.slug === slug);
    if (!eng) return;
    setCurrentSlug(slug);
    try { localStorage.setItem(STORAGE_KEY, slug); } catch { /* ignore */ }
  };

  const value = { engagements, currentEngagement, switchEngagement, loading };
  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagements() {
  const ctx = useContext(EngagementContext);
  if (!ctx) throw new Error('useEngagements must be used within <EngagementProvider>');
  return ctx;
}
