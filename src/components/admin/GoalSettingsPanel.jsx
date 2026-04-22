import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { useKpiGoals, KPI_TYPES } from '../../hooks/useKpiGoals';

// 月次・週次のプリセット options を生成。日次は別途 date input で選ぶ。
function buildMonthlyOptions(baseMonths = 6) {
  const opts = [];
  const now = new Date();
  const yearBase = now.getFullYear();
  const monthBase = now.getMonth();
  for (let i = 0; i < baseMonths; i++) {
    const y = yearBase + Math.floor((monthBase + i) / 12);
    const mi = (monthBase + i) % 12;
    const mName = `${y}年${mi + 1}月`;
    const mIso = `${y}-${String(mi + 1).padStart(2, '0')}-01`;
    opts.push({ key: mIso, label: mName, effective_from: mIso });
  }
  return opts;
}
function buildWeeklyOptions(baseMonths = 6) {
  const opts = [];
  const now = new Date();
  const yearBase = now.getFullYear();
  const monthBase = now.getMonth();
  for (let i = 0; i < baseMonths; i++) {
    const y = yearBase + Math.floor((monthBase + i) / 12);
    const mi = (monthBase + i) % 12;
    const mName = `${y}年${mi + 1}月`;
    const lastDay = new Date(y, mi + 1, 0).getDate();
    for (let w = 0; w < 5; w++) {
      const start = 1 + w * 7;
      if (start > lastDay) break;
      const end = Math.min(start + 6, lastDay);
      const iso = `${y}-${String(mi + 1).padStart(2, '0')}-${String(start).padStart(2, '0')}`;
      opts.push({
        key: iso,
        label: `${mName} 第${w + 1}週 (${start}日〜${end}日)`,
        effective_from: iso,
      });
    }
  }
  return opts;
}
// 今日の YYYY-MM-DD
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function GoalSettingsPanel({ isAdmin, onToast, readOnly = false, defaultScopeType = 'org' }) {
  const [engagementId, setEngagementId] = useState(null);
  const [currentMemberId, setCurrentMemberId] = useState(null);
  const [leaderTeamIds, setLeaderTeamIds] = useState(new Set());
  const [scopeType, setScopeType] = useState(defaultScopeType);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedMember, setSelectedMember] = useState('');

  // 期間モード: 'monthly' | 'weekly' | 'daily'
  const [periodMode, setPeriodMode] = useState('monthly');
  const monthlyOptions = useMemo(() => buildMonthlyOptions(6), []);
  const weeklyOptions = useMemo(() => buildWeeklyOptions(6), []);
  const [monthlyKey, setMonthlyKey] = useState(monthlyOptions[0]?.key || '');
  const [weeklyKey, setWeeklyKey] = useState(weeklyOptions[0]?.key || '');
  const [dailyDate, setDailyDate] = useState(todayIso());

  // 現在選択中の (period_type, effective_from)
  const selectedPeriod = useMemo(() => {
    if (periodMode === 'monthly') {
      const o = monthlyOptions.find(x => x.key === monthlyKey) || monthlyOptions[0];
      return o ? { period_type: 'monthly', effective_from: o.effective_from, label: o.label } : null;
    }
    if (periodMode === 'weekly') {
      const o = weeklyOptions.find(x => x.key === weeklyKey) || weeklyOptions[0];
      return o ? { period_type: 'weekly', effective_from: o.effective_from, label: o.label } : null;
    }
    return { period_type: 'daily', effective_from: dailyDate, label: dailyDate };
  }, [periodMode, monthlyKey, weeklyKey, dailyDate, monthlyOptions, weeklyOptions]);

  const orgId = getOrgId();

  useEffect(() => {
    (async () => {
      const { data: eng } = await supabase.from('engagements')
        .select('id').eq('org_id', orgId).eq('slug', 'seller_sourcing').maybeSingle();
      if (eng?.id) setEngagementId(eng.id);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: me } = await supabase.from('members')
          .select('id').eq('user_id', user.id).eq('org_id', orgId).maybeSingle();
        if (me?.id) {
          setCurrentMemberId(me.id);
          const { data: leadTeams } = await supabase.from('teams')
            .select('id').eq('org_id', orgId).eq('leader_member_id', me.id);
          setLeaderTeamIds(new Set((leadTeams || []).map(t => t.id)));
          if (!isAdmin && !readOnly) {
            setScopeType('member');
            setSelectedMember(me.id);
          }
        }
      }
    })();
  }, [orgId, isAdmin, readOnly]);

  useEffect(() => {
    if (!engagementId) return;
    (async () => {
      const [tRes, mRes] = await Promise.all([
        supabase.from('teams').select('id, name, display_order')
          .eq('org_id', orgId).eq('engagement_id', engagementId).eq('status', 'active')
          .order('display_order'),
        supabase.from('member_engagements')
          .select('member:members(id, name, position, rank, start_date, is_active)')
          .eq('org_id', orgId).eq('engagement_id', engagementId),
      ]);
      if (tRes.data) setTeams(tRes.data);
      if (mRes.data) {
        const ms = mRes.data.map(r => r.member).filter(Boolean).filter(m => m.is_active);
        ms.sort((a, b) => {
          const ra = a.position === '代表取締役' ? 0 : a.position === '取締役' ? 1 : 2;
          const rb = b.position === '代表取締役' ? 0 : b.position === '取締役' ? 1 : 2;
          if (ra !== rb) return ra - rb;
          return (a.start_date || '9999-12-31').localeCompare(b.start_date || '9999-12-31');
        });
        setMembers(ms);
      }
    })();
  }, [orgId, engagementId]);

  const scopeId = useMemo(() => {
    if (scopeType === 'org') return null;
    if (scopeType === 'team') return selectedTeam || null;
    if (scopeType === 'member') return selectedMember || null;
    return null;
  }, [scopeType, selectedTeam, selectedMember]);

  const { goals, upsertGoal, deleteGoal } = useKpiGoals({
    engagementId, scopeType, scopeId, effectiveFrom: selectedPeriod?.effective_from,
  });

  const canEditThisScope = useMemo(() => {
    if (readOnly) return false;
    if (isAdmin) return true;
    if (scopeType === 'member' && selectedMember && selectedMember === currentMemberId) return true;
    if (scopeType === 'team' && selectedTeam && leaderTeamIds.has(selectedTeam)) return true;
    return false;
  }, [readOnly, isAdmin, scopeType, selectedMember, selectedTeam, currentMemberId, leaderTeamIds]);

  // 選択期間の既存 goal を KPI 種別でインデックス化
  const goalByType = useMemo(() => {
    const m = {};
    for (const g of goals) {
      if (g.period_type === selectedPeriod?.period_type) m[g.kpi_type] = g;
    }
    return m;
  }, [goals, selectedPeriod]);

  const [draft, setDraft] = useState({});
  useEffect(() => {
    const d = {};
    for (const k of KPI_TYPES) d[k.id] = goalByType[k.id]?.target_value ?? '';
    setDraft(d);
  }, [goalByType]);

  const handleSave = async () => {
    if (!canEditThisScope) { onToast?.('このスコープは編集権限がありません', 'error'); return; }
    if (scopeType !== 'org' && !scopeId) { onToast?.('対象を選択してください', 'error'); return; }
    if (!selectedPeriod) { onToast?.('対象期間を選択してください', 'error'); return; }

    let saved = 0, skipped = 0, errs = [];
    for (const k of KPI_TYPES) {
      // rate 系は日次禁止
      if (k.isRate && selectedPeriod.period_type === 'daily') continue;
      const newVal = draft[k.id];
      const existing = goalByType[k.id];
      const hasVal = newVal !== '' && newVal != null && !Number.isNaN(Number(newVal));
      if (hasVal) {
        if (k.isRate && (Number(newVal) < 0 || Number(newVal) > 100)) {
          errs.push(`${k.label}: 0〜100 の範囲で入力`); continue;
        }
        if (Number(newVal) < 0) { errs.push(`${k.label}: 負値不可`); continue; }
        if (!existing || Number(existing.target_value) !== Number(newVal)) {
          const { error } = await upsertGoal({
            kpi_type: k.id, period_type: selectedPeriod.period_type,
            target_value: newVal, effective_from: selectedPeriod.effective_from,
          });
          if (error) errs.push(`${k.label}: ${error.message}`);
          else saved++;
        } else {
          skipped++;
        }
      } else if (existing) {
        const { error } = await deleteGoal(existing.id);
        if (error) errs.push(`${k.label}: 削除失敗`);
        else saved++;
      }
    }
    if (errs.length) onToast?.(errs.join(' / '), 'error');
    else onToast?.(`保存しました (${saved}件更新 / ${skipped}件変更なし)`, 'success');
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 4 }}>
          {readOnly
            ? 'Sourcing 事業の KPI 目標 (閲覧のみ)。編集はマイページから。'
            : '対象期間を選んで 5 つの KPI 目標を入力します。組織全体は admin のみ / チームはリーダー / メンバーは本人が編集可。'}
        </div>
      </div>

      {/* スコープ切替 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[
          { id: 'org', label: '組織全体' },
          { id: 'team', label: 'チーム別' },
          { id: 'member', label: 'メンバー別' },
        ].map(s => {
          const active = scopeType === s.id;
          return (
            <button key={s.id} onClick={() => setScopeType(s.id)}
              style={{
                padding: '6px 14px', fontSize: 12,
                background: active ? C.navy : C.white, color: active ? C.white : C.textMid,
                border: `1px solid ${active ? C.navy : C.border}`,
                borderRadius: 4, cursor: 'pointer', fontWeight: active ? 600 : 400,
              }}
            >{s.label}</button>
          );
        })}
      </div>

      {scopeType === 'team' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>チーム:</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
            style={selectStyle}>
            <option value="">選択してください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {scopeType === 'member' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>メンバー:</label>
          <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
            style={{ ...selectStyle, minWidth: 240 }}>
            <option value="">選択してください</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}{m.position ? ` (${m.position})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 期間モード: 月次 / 週次 / 日次 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>期間:</label>
        {[
          { id: 'monthly', label: '月次' },
          { id: 'weekly',  label: '週次' },
          { id: 'daily',   label: '日次' },
        ].map(p => {
          const active = periodMode === p.id;
          return (
            <button key={p.id} onClick={() => setPeriodMode(p.id)}
              style={{
                padding: '5px 12px', fontSize: 11, marginRight: 4,
                background: active ? C.navy : C.white, color: active ? C.white : C.textMid,
                border: `1px solid ${active ? C.navy : C.border}`,
                borderRadius: 4, cursor: 'pointer', fontWeight: active ? 600 : 400,
              }}
            >{p.label}</button>
          );
        })}
      </div>

      {/* モード別の期間選択 */}
      <div style={{ marginBottom: 16 }}>
        {periodMode === 'monthly' && (
          <>
            <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>月:</label>
            <select value={monthlyKey} onChange={e => setMonthlyKey(e.target.value)}
              style={{ ...selectStyle, minWidth: 180 }}>
              {monthlyOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </>
        )}
        {periodMode === 'weekly' && (
          <>
            <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>週:</label>
            <select value={weeklyKey} onChange={e => setWeeklyKey(e.target.value)}
              style={{ ...selectStyle, minWidth: 280 }}>
              {weeklyOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </>
        )}
        {periodMode === 'daily' && (
          <>
            <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>日付:</label>
            <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
              style={{ ...selectStyle, minWidth: 160 }} />
            <span style={{ fontSize: 10, color: C.textLight, marginLeft: 8 }}>
              (その日ごとに目標を設定できます)
            </span>
          </>
        )}
      </div>

      {/* 5 KPI 入力 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>KPI</th>
              <th style={th}>目標値</th>
            </tr>
          </thead>
          <tbody>
            {KPI_TYPES.map(k => {
              const rateOnDaily = k.isRate && selectedPeriod?.period_type === 'daily';
              const disabled = !canEditThisScope || rateOnDaily;
              return (
                <tr key={k.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 16, fontWeight: 500, color: C.navy }}>
                    {k.label}
                    {rateOnDaily && (
                      <span style={{ fontSize: 9, marginLeft: 6, color: C.textLight }}>(日次不可)</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        step={k.isRate ? '0.1' : '1'}
                        min="0"
                        max={k.isRate ? 100 : undefined}
                        value={draft[k.id] ?? ''}
                        disabled={disabled}
                        onChange={e => setDraft(d => ({ ...d, [k.id]: e.target.value }))}
                        placeholder={disabled ? '—' : '未設定'}
                        style={{
                          width: 120, padding: '5px 8px', fontSize: 12,
                          border: `1px solid ${C.border}`, borderRadius: 3, textAlign: 'right',
                          background: disabled ? C.cream : C.white,
                          color: disabled ? C.textLight : C.textDark,
                        }}
                      />
                      <span style={{ fontSize: 11, color: C.textMid }}>{k.unit}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEditThisScope && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave}
            disabled={scopeType !== 'org' && !scopeId}
            style={{
              padding: '8px 24px', fontSize: 13, fontWeight: 600,
              background: C.navy, color: C.white, border: 'none', borderRadius: 4,
              cursor: (scopeType !== 'org' && !scopeId) ? 'not-allowed' : 'pointer',
              opacity: (scopeType !== 'org' && !scopeId) ? 0.5 : 1,
            }}
          >保存</button>
        </div>
      )}
      {!canEditThisScope && (
        <div style={{ marginTop: 12, fontSize: 11, color: C.textLight, textAlign: 'right' }}>
          ※ 閲覧のみ {isAdmin ? '' : '(自分の目標のみ編集可)'}
        </div>
      )}
    </div>
  );
}

const selectStyle = {
  padding: '6px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 4,
  minWidth: 200,
};
const th = { padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: C.navy, fontSize: 11 };
const td = { padding: '8px 12px', fontSize: 12, color: C.textDark, textAlign: 'center' };
