import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export function useDeals({ engagementId, clientId = null, closedStatus = null }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const orgId = getOrgId();

  const fetchDeals = useCallback(async () => {
    if (!orgId || !engagementId) { setLoading(false); return; }
    let query = supabase
      .from('deals')
      .select(`
        *,
        client:clients(id, name),
        appointment:appointments(id, appointment_date, meeting_date, meeting_time),
        sourcer:members!deals_sourcer_member_id_fkey(id, name),
        closer:members!deals_closer_member_id_fkey(id, name)
      `)
      .eq('org_id', orgId)
      .eq('engagement_id', engagementId)
      .order('stage_changed_at', { ascending: false });
    if (clientId) query = query.eq('client_id', clientId);
    if (closedStatus) query = query.eq('closed_status', closedStatus);
    const { data, error } = await query;
    if (error) setError(error); else { setDeals(data || []); setError(null); }
    setLoading(false);
  }, [orgId, engagementId, clientId, closedStatus]);

  useEffect(() => { setLoading(true); fetchDeals(); }, [fetchDeals]);

  const updateDealStage = async (dealId, newStage) => {
    const payload = {
      stage: newStage,
      closed_status: newStage === 'closed_won' ? 'won' : newStage === 'closed_lost' ? 'lost' : 'open',
      closed_at: (newStage === 'closed_won' || newStage === 'closed_lost') ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from('deals').update(payload).eq('id', dealId);
    if (!error) await fetchDeals();
    return { error };
  };

  const updateDeal = async (dealId, updates) => {
    const { error } = await supabase.from('deals').update(updates).eq('id', dealId);
    if (!error) await fetchDeals();
    return { error };
  };

  const createDeal = async (newDeal) => {
    if (!orgId || !engagementId) return { error: new Error('org/engagement missing') };
    const { data, error } = await supabase
      .from('deals')
      .insert({ org_id: orgId, engagement_id: engagementId, ...newDeal })
      .select()
      .single();
    if (!error) await fetchDeals();
    return { data, error };
  };

  return { deals, loading, error, updateDealStage, updateDeal, createDeal, refresh: fetchDeals };
}
