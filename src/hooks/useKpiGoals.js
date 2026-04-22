import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOrgId } from '../lib/orgContext';

export const KPI_TYPES = [
  { id: 'calls',            label: '架電件数',   unit: '件', isRate: false },
  { id: 'connections',      label: '社長接続数', unit: '件', isRate: false },
  { id: 'appointments',     label: 'アポ獲得数', unit: '件', isRate: false },
  { id: 'connection_rate',  label: '社長接続率', unit: '%',  isRate: true },
  { id: 'appointment_rate', label: 'アポ獲得率', unit: '%',  isRate: true },
];

export const PERIOD_TYPES = [
  { id: 'daily',   label: '日次' },
  { id: 'weekly',  label: '週次' },
  { id: 'monthly', label: '月次' },
];

/**
 * KPI目標の取得・保存。
 * effective_from を省略すると「現時点で有効な最新目標」を取る。
 * scope_type: 'org' / 'team' / 'member'
 */
export function useKpiGoals({ engagementId, scopeType, scopeId, effectiveFrom = null }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = getOrgId();

  const fetchGoals = useCallback(async () => {
    if (!orgId || !engagementId || !scopeType) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('kpi_goals')
      .select('*')
      .eq('org_id', orgId)
      .eq('engagement_id', engagementId)
      .eq('scope_type', scopeType);
    if (scopeType === 'org') query = query.is('scope_id', null);
    else if (scopeId) query = query.eq('scope_id', scopeId);
    if (effectiveFrom) query = query.eq('effective_from', effectiveFrom);
    query = query.order('effective_from', { ascending: false });

    const { data, error } = await query;
    if (!error) setGoals(data || []);
    setLoading(false);
  }, [orgId, engagementId, scopeType, scopeId, effectiveFrom]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  /**
   * 1つの目標を upsert する。rate系(connection_rate / appointment_rate) の daily は禁止。
   */
  const upsertGoal = async ({ kpi_type, period_type, target_value, effective_from }) => {
    if (!orgId || !engagementId || !scopeType) return { error: new Error('missing params') };
    // rate 系は daily 禁止
    const isRate = KPI_TYPES.find(k => k.id === kpi_type)?.isRate;
    if (isRate && period_type === 'daily') {
      return { error: new Error('rate 系目標は日次には設定できません') };
    }
    const row = {
      org_id: orgId,
      engagement_id: engagementId,
      scope_type: scopeType,
      scope_id: scopeType === 'org' ? null : scopeId,
      kpi_type, period_type,
      target_value: Number(target_value),
      effective_from,
    };
    const { error } = await supabase.from('kpi_goals').upsert(row, {
      onConflict: 'engagement_id,scope_type,scope_id,kpi_type,period_type,effective_from',
    });
    if (!error) await fetchGoals();
    return { error };
  };

  const deleteGoal = async (id) => {
    const { error } = await supabase.from('kpi_goals').delete().eq('id', id);
    if (!error) await fetchGoals();
    return { error };
  };

  return { goals, loading, upsertGoal, deleteGoal, refresh: fetchGoals };
}
