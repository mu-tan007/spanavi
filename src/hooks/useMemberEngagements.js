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
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  const fetchAll = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    const [m, me] = await Promise.all([
      supabase.from('members')
        .select('id, name, email, position, rank, team, start_date, is_active, avatar_url')
        .eq('org_id', orgId)
        .eq('is_active', true),
      supabase.from('member_engagements')
        .select('member_id, engagement_id')
        .eq('org_id', orgId),
    ]);
    if (!m.error) setMembers([...(m.data || [])].sort(sortByPositionThenStart));
    const map = {};
    (me.data || []).forEach(r => {
      if (!map[r.member_id]) map[r.member_id] = new Set();
      map[r.member_id].add(r.engagement_id);
    });
    setAssignments(map);
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

  return { members, assignments, loading, toggleAssignment, refresh: fetchAll };
}

/**
 * 特定 engagement に所属しているメンバー一覧を取得する hook (読み取り専用ビュー用)。
 */
export function useEngagementMembers(engagementId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId || !engagementId) { setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('member_engagements')
        .select(`member_id, member:members(id, name, email, position, rank, team, start_date, is_active, avatar_url, cumulative_sales, incentive_rate)`)
        .eq('org_id', orgId)
        .eq('engagement_id', engagementId);
      if (cancelled) return;
      if (!error && data) {
        const rows = data.map(r => r.member).filter(Boolean).filter(m => m.is_active);
        rows.sort(sortByPositionThenStart);
        setMembers(rows);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [orgId, engagementId]);

  return { members, loading };
}
