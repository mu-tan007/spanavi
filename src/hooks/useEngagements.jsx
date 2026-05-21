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
  const [dbProducts, setDbProducts] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [currentSlug, setCurrentSlug] = useState(null);
  const [loading, setLoading] = useState(true);

  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      if (!orgId) { setLoading(false); return; }
      // engagements / products / categories を並列取得
      const [engRes, prodRes, catRes] = await Promise.all([
        supabase
          .from('engagements')
          .select('id,name,slug,type,status,display_order,description,product_id,category_id')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('display_order'),
        supabase
          .from('products')
          .select('id,name,slug,display_order,is_active,description')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('business_categories')
          .select('id,name,slug,display_order,is_active,product_id,description')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('display_order'),
      ]);
      if (cancelled) return;
      if (!engRes.error && engRes.data) {
        setDbEngagements(engRes.data);
        const saved = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
        const all = [MASP_ENGAGEMENT, ...engRes.data];
        const initial = all.find(e => e.slug === saved)
          || all.find(e => e.slug === 'seller_sourcing')
          || all[0];
        setCurrentSlug(initial?.slug || null);
      }
      if (!prodRes.error && prodRes.data) {
        setDbProducts(prodRes.data);
      }
      if (!catRes.error && catRes.data) {
        setDbCategories(catRes.data);
      }
      setLoading(false);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [orgId]);

  const engagements = useMemo(() => [MASP_ENGAGEMENT, ...dbEngagements], [dbEngagements]);
  const products = useMemo(() => dbProducts, [dbProducts]);
  const categories = useMemo(() => dbCategories, [dbCategories]);
  const currentEngagement = useMemo(
    () => engagements.find(e => e.slug === currentSlug) || null,
    [engagements, currentSlug]
  );
  // 現在の engagement が属する product
  const currentProduct = useMemo(
    () => products.find(p => p.id === currentEngagement?.product_id) || null,
    [products, currentEngagement]
  );
  // 現在の engagement が属する category
  const currentCategory = useMemo(
    () => categories.find(c => c.id === currentEngagement?.category_id) || null,
    [categories, currentEngagement]
  );

  const switchEngagement = (slug) => {
    const eng = engagements.find(e => e.slug === slug);
    if (!eng) return;
    setCurrentSlug(slug);
    try { localStorage.setItem(STORAGE_KEY, slug); } catch { /* ignore */ }
  };

  // 指定 product の代表 engagement に切り替え（display_order が最小のもの）
  const switchProduct = (productId) => {
    if (productId === 'masp_global') {
      setCurrentSlug('masp');
      try { localStorage.setItem(STORAGE_KEY, 'masp'); } catch { /* ignore */ }
      return;
    }
    const candidates = dbEngagements
      .filter(e => e.product_id === productId)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const primary = candidates[0];
    if (primary) {
      setCurrentSlug(primary.slug);
      try { localStorage.setItem(STORAGE_KEY, primary.slug); } catch { /* ignore */ }
    }
  };

  const value = { engagements, products, categories, currentEngagement, currentProduct, currentCategory, switchEngagement, switchProduct, loading };
  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagements() {
  const ctx = useContext(EngagementContext);
  if (!ctx) throw new Error('useEngagements must be used within <EngagementProvider>');
  return ctx;
}
