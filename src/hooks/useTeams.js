import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export function useTeams(engagementId) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  const fetchTeams = useCallback(async () => {
    if (!orgId || !engagementId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('teams')
      .select(`
        id, name, display_order, status, engagement_id, leader_member_id,
        leader:members!teams_leader_member_id_fkey(id, name),
        team_members(
          id, role, left_at,
          member:members(id, name)
        )
      `)
      .eq('org_id', orgId)
      .eq('engagement_id', engagementId)
      .eq('status', 'active')
      .order('display_order');
    if (!error && data) {
      setTeams(data.map(t => ({
        ...t,
        active_members: (t.team_members || []).filter(tm => !tm.left_at),
      })));
    } else if (error) {
      setTeams([]);
    }
    setLoading(false);
  }, [orgId, engagementId]);

  useEffect(() => { setLoading(true); fetchTeams(); }, [fetchTeams]);

  return { teams, loading, refresh: fetchTeams };
}
