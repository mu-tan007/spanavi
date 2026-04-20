import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

const STORAGE_KEY = 'spanavi_current_engagement_slug';

export function useEngagements() {
  const [engagements, setEngagements] = useState([]);
  const [currentEngagement, setCurrentEngagement] = useState(null);
  const [loading, setLoading] = useState(true);

  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function fetchEngagements() {
      if (!orgId) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('engagements')
        .select('id,name,slug,type,status,display_order,description')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('display_order');
      if (cancelled) return;
      if (!error && data) {
        setEngagements(data);
        const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const fallback = data.find(e => e.slug === 'seller_sourcing') || data[0] || null;
        const initial = data.find(e => e.slug === saved) || fallback;
        setCurrentEngagement(initial);
      }
      setLoading(false);
    }
    fetchEngagements();
    return () => { cancelled = true; };
  }, [orgId]);

  const switchEngagement = (slug) => {
    const eng = engagements.find(e => e.slug === slug);
    if (!eng) return;
    setCurrentEngagement(eng);
    try { localStorage.setItem(STORAGE_KEY, slug); } catch { /* ignore */ }
  };

  return { engagements, currentEngagement, switchEngagement, loading };
}
