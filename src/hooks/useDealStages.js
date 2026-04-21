import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export function useDealStages(engagementSlug) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function fetchStages() {
      if (!orgId || !engagementSlug) { setLoading(false); return; }
      const key = `deal_stages_${engagementSlug}`;
      const { data, error } = await supabase
        .from('org_settings')
        .select('setting_value')
        .eq('org_id', orgId)
        .eq('setting_key', key)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.setting_value?.stages) {
        setStages(data.setting_value.stages);
      } else {
        setStages([]);
      }
      setLoading(false);
    }
    fetchStages();
    return () => { cancelled = true; };
  }, [orgId, engagementSlug]);

  const activeStages = stages.filter(s => !s.is_terminal);
  const wonStage = stages.find(s => s.id === 'closed_won') || null;
  const lostStage = stages.find(s => s.id === 'closed_lost') || null;

  return { stages, activeStages, wonStage, lostStage, loading };
}
