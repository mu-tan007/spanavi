import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export function useEngagementClients(engagementId) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function fetchClients() {
      if (!orgId || !engagementId) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('engagement_id', engagementId)
        .order('name', { nullsFirst: false });
      if (cancelled) return;
      if (!error && data) {
        setClients(data.map(c => ({ id: c.id, name: c.name || '（名称未設定）' })));
      } else {
        setClients([]);
      }
      setLoading(false);
    }
    fetchClients();
    return () => { cancelled = true; };
  }, [orgId, engagementId]);

  return { clients, loading };
}
