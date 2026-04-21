import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export function useCareerDeals({ engagementId, teamId = null, closedStatus = null }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const orgId = getOrgId();

  const fetchDeals = useCallback(async () => {
    if (!orgId || !engagementId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from('deals')
      .select(`
        *,
        plan:product_plans(id, name, price_total),
        sourcer:members!deals_sourcer_member_id_fkey(id, name),
        closer:members!deals_closer_member_id_fkey(id, name),
        trainer:members!deals_trainer_member_id_fkey(id, name),
        team:teams(id, name)
      `)
      .eq('org_id', orgId)
      .eq('engagement_id', engagementId)
      .order('stage_changed_at', { ascending: false });
    if (teamId) query = query.eq('team_id', teamId);
    if (closedStatus) query = query.eq('closed_status', closedStatus);
    const { data, error } = await query;
    if (error) { setError(error); }
    else { setDeals(data || []); setError(null); }
    setLoading(false);
  }, [orgId, engagementId, teamId, closedStatus]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const createDeal = async (newDeal) => {
    if (!orgId || !engagementId) return { error: new Error('org/engagement missing') };
    const { data, error } = await supabase
      .from('deals')
      .insert({ org_id: orgId, engagement_id: engagementId, stage: 'application_received', ...newDeal })
      .select()
      .single();
    if (!error) await fetchDeals();
    return { data, error };
  };

  const updateDeal = async (dealId, updates) => {
    const { error } = await supabase.from('deals').update(updates).eq('id', dealId);
    if (!error) await fetchDeals();
    return { error };
  };

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

  return { deals, loading, error, createDeal, updateDeal, updateDealStage, refresh: fetchDeals };
}
