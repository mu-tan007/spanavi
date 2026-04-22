import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

// 役員を最上位に固定するためのソート順。
// 代表取締役 → 取締役 → その他の順。同位では start_date 昇順 (null は末尾)。
function positionRank(position) {
  if (position === '代表取締役') return 0;
  if (position === '取締役') return 1;
  return 2;
}
function sortByPositionThenStart(a, b) {
  const r = positionRank(a.position) - positionRank(b.position);
  if (r !== 0) return r;
  const as = a.start_date || '9999-12-31';
  const bs = b.start_date || '9999-12-31';
  if (as !== bs) return as.localeCompare(bs);
  return (a.name || '').localeCompare(b.name || '');
}

/**
 * 全メンバー + 各メンバーの所属 engagement 一覧を取得する hook。
 * 返り値: members = [{ ...member, engagement_ids: [uuid, ...] }]
 */
export function useAllMembersWithEngagements() {
  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState({}); // { member_id: Set<engagement_id> }
  const [teamsByEngagement, setTeamsByEngagement] = useState({}); // { engagement_id: [{id, name, display_order}] }
  const [memberTeam, setMemberTeam] = useState({}); // { `${member_id}:${engagement_id}`: team_id }
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  const fetchAll = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    const [m, me, tRes, tmRes] = await Promise.all([
      supabase.from('members')
        .select('id, name, email, position, rank, team, start_date, is_active, avatar_url')
        .eq('org_id', orgId)
        .eq('is_active', true),
      supabase.from('member_engagements')
        .select('member_id, engagement_id')
        .eq('org_id', orgId),
      supabase.from('teams')
        .select('id, name, display_order, engagement_id')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('display_order'),
      supabase.from('team_members')
        .select('member_id, team_id, left_at, team:teams!inner(id, engagement_id)')
        .eq('org_id', orgId)
        .is('left_at', null),
    ]);
    if (!m.error) setMembers([...(m.data || [])].sort(sortByPositionThenStart));
    const map = {};
    (me.data || []).forEach(r => {
      if (!map[r.member_id]) map[r.member_id] = new Set();
      map[r.member_id].add(r.engagement_id);
    });
    setAssignments(map);

    const teamsMap = {};
    (tRes.data || []).forEach(t => {
      if (!teamsMap[t.engagement_id]) teamsMap[t.engagement_id] = [];
      teamsMap[t.engagement_id].push({ id: t.id, name: t.name, display_order: t.display_order });
    });
    setTeamsByEngagement(teamsMap);

    const mtMap = {};
    (tmRes.data || []).forEach(r => {
      const engId = r.team?.engagement_id;
      if (!engId) return;
      mtMap[`${r.member_id}:${engId}`] = r.team_id;
    });
    setMemberTeam(mtMap);

    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /** 1件の (member, engagement) の割当を追加/削除 */
  const toggleAssignment = useCallback(async (memberId, engagementId, shouldAssign) => {
    if (!orgId) return { error: new Error('no org') };
    if (shouldAssign) {
      const { error } = await supabase.from('member_engagements').insert({
        org_id: orgId, member_id: memberId, engagement_id: engagementId,
      });
      if (error && error.code !== '23505') return { error };
      setAssignments(prev => {
        const next = { ...prev };
        next[memberId] = new Set(next[memberId] || []);
        next[memberId].add(engagementId);
        return next;
      });
    } else {
      const { error } = await supabase.from('member_engagements')
        .delete()
        .eq('member_id', memberId)
        .eq('engagement_id', engagementId);
      if (error) return { error };
      setAssignments(prev => {
        const next = { ...prev };
        if (next[memberId]) {
          next[memberId] = new Set(next[memberId]);
          next[memberId].delete(engagementId);
        }
        return next;
      });
    }
    return { error: null };
  }, [orgId]);

  /** member × engagement のチーム割当を変更 (newTeamId = null で割当解除) */
  const assignMemberToTeam = useCallback(async (memberId, engagementId, newTeamId) => {
    if (!orgId) return { error: new Error('no org') };
    const engTeamIds = (teamsByEngagement[engagementId] || []).map(t => t.id);
    // この engagement 内の既存レコードを全て left_at 付きで閉じる
    if (engTeamIds.length > 0) {
      const { error: closeErr } = await supabase.from('team_members')
        .delete()
        .eq('member_id', memberId)
        .in('team_id', engTeamIds)
        .is('left_at', null);
      if (closeErr) return { error: closeErr };
    }
    // 新しいチームに insert
    if (newTeamId) {
      const { error: insErr } = await supabase.from('team_members').insert({
        org_id: orgId, member_id: memberId, team_id: newTeamId,
      });
      if (insErr && insErr.code !== '23505') return { error: insErr };
      // members.team legacy 列も名前で同期 (Sourcing の既存コード互換)
      const teamName = (teamsByEngagement[engagementId] || []).find(t => t.id === newTeamId)?.name;
      if (teamName) {
        await supabase.from('members').update({ team: teamName }).eq('id', memberId);
      }
    }
    setMemberTeam(prev => {
      const next = { ...prev };
      const key = `${memberId}:${engagementId}`;
      if (newTeamId) next[key] = newTeamId;
      else delete next[key];
      return next;
    });
    return { error: null };
  }, [orgId, teamsByEngagement]);

  return { members, assignments, teamsByEngagement, memberTeam, loading, toggleAssignment, assignMemberToTeam, refresh: fetchAll };
}

/**
 * 特定 engagement に所属しているメンバー + 事業内のチーム情報を取得する hook。
 * teams: [{id, name, display_order, members: [...]}] + 未所属メンバーは末尾の仮想チーム。
 */
export function useEngagementMembers(engagementId) {
  const [members, setMembers] = useState([]);
  const [teamGroups, setTeamGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !engagementId) { setLoading(false); return; }
      setLoading(true);
      const [memRes, teamRes, tmRes] = await Promise.all([
        supabase
          .from('member_engagements')
          .select(`member_id, member:members(id, name, email, position, rank, team, start_date, is_active, avatar_url, cumulative_sales, incentive_rate)`)
          .eq('org_id', orgId)
          .eq('engagement_id', engagementId),
        supabase
          .from('teams')
          .select('id, name, display_order')
          .eq('org_id', orgId)
          .eq('engagement_id', engagementId)
          .eq('status', 'active')
          .order('display_order'),
        supabase
          .from('team_members')
          .select('member_id, team_id, role, left_at, team:teams!inner(engagement_id)')
          .eq('org_id', orgId)
          .eq('team.engagement_id', engagementId)
          .is('left_at', null),
      ]);
      if (cancelled) return;
      const activeMembers = (memRes.data || [])
        .map(r => r.member).filter(Boolean).filter(m => m.is_active);
      activeMembers.sort(sortByPositionThenStart);
      setMembers(activeMembers);

      // member_id → team_id の map (1人は1チーム想定、複数あれば最初の1つ)
      const memberTeamMap = {};
      (tmRes.data || []).forEach(r => {
        if (!memberTeamMap[r.member_id]) memberTeamMap[r.member_id] = r.team_id;
      });

      // teams 毎にメンバーを束ねる + 未所属を最後に
      const teams = (teamRes.data || []).map(t => ({ ...t, members: [] }));
      const teamIndex = {};
      teams.forEach((t, i) => { teamIndex[t.id] = i; });
      const unassigned = [];
      for (const m of activeMembers) {
        const tid = memberTeamMap[m.id];
        if (tid != null && teamIndex[tid] != null) {
          teams[teamIndex[tid]].members.push(m);
        } else {
          unassigned.push(m);
        }
      }
      if (unassigned.length) teams.push({ id: '__unassigned', name: '未所属', display_order: 9999, members: unassigned });
      setTeamGroups(teams);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [orgId, engagementId]);

  return { members, teamGroups, loading };
}
