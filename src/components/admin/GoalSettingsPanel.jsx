import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { useKpiGoals, KPI_TYPES, PERIOD_TYPES } from '../../hooks/useKpiGoals';

// Sourcing の teams / members / kpi_goals を束ねた目標設定パネル
// AdminView 内の 1 タブとして使う
export default function GoalSettingsPanel({ isAdmin, onToast }) {
  const [engagementId, setEngagementId] = useState(null);
  const [scopeType, setScopeType] = useState('org');   // 'org' | 'team' | 'member'
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('2026-05-01');

  const orgId = getOrgId();

  // Sourcing engagement_id を取得
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('engagements')
        .select('id')
        .eq('org_id', orgId)
        .eq('slug', 'seller_sourcing')
        .maybeSingle();
      if (data?.id) setEngagementId(data.id);
    })();
  }, [orgId]);

  // teams / members 取得
  useEffect(() => {
    if (!engagementId) return;
    (async () => {
      const [tRes, mRes] = await Promise.all([
        supabase.from('teams')
          .select('id, name, display_order')
          .eq('org_id', orgId)
          .eq('engagement_id', engagementId)
          .eq('status', 'active')
          .order('display_order'),
        supabase.from('member_engagements')
          .select('member:members(id, name, position, rank, start_date, is_active)')
          .eq('org_id', orgId)
          .eq('engagement_id', engagementId),
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
    engagementId, scopeType, scopeId, effectiveFrom,
  });

  // goals を { kpi_type + period_type: target_value } で引きやすくする
  const goalMap = useMemo(() => {
    const map = {};
    for (const g of goals) {
      map[`${g.kpi_type}__${g.period_type}`] = g;
    }
    return map;
  }, [goals]);

  const [draft, setDraft] = useState({});
  useEffect(() => {
    // 既存値で draft を初期化
    const d = {};
    for (const k of KPI_TYPES) for (const p of PERIOD_TYPES) {
      d[`${k.id}__${p.id}`] = goalMap[`${k.id}__${p.id}`]?.target_value ?? '';
    }
    setDraft(d);
  }, [goalMap]);

  const handleSave = async () => {
    if (!isAdmin) return;
    if (scopeType !== 'org' && !scopeId) {
      onToast?.('対象を選択してください', 'error');
      return;
    }
    let saved = 0, skipped = 0, errs = [];
    for (const k of KPI_TYPES) {
      for (const p of PERIOD_TYPES) {
        // rate の daily は disabled
        if (k.isRate && p.id === 'daily') continue;

        const key = `${k.id}__${p.id}`;
        const newVal = draft[key];
        const existing = goalMap[key];
        const hasNewVal = newVal !== '' && newVal != null && !Number.isNaN(Number(newVal));

        if (hasNewVal) {
          // rate は 0-100 範囲チェック
          if (k.isRate && (Number(newVal) < 0 || Number(newVal) > 100)) {
            errs.push(`${k.label} (${p.label}): 0〜100 の範囲で入力`);
            continue;
          }
          if (Number(newVal) < 0) { errs.push(`${k.label} (${p.label}): 負値不可`); continue; }
          // 値が変わった場合のみ upsert
          if (!existing || Number(existing.target_value) !== Number(newVal)) {
            const { error } = await upsertGoal({
              kpi_type: k.id, period_type: p.id,
              target_value: newVal, effective_from: effectiveFrom,
            });
            if (error) errs.push(`${k.label} (${p.label}): ${error.message}`);
            else saved++;
          } else {
            skipped++;
          }
        } else if (existing) {
          // 空入力 = 既存目標を削除
          const { error } = await deleteGoal(existing.id);
          if (error) errs.push(`${k.label} (${p.label}): 削除失敗`);
          else saved++;
        }
      }
    }
    if (errs.length) {
      onToast?.(errs.join(' / '), 'error');
    } else {
      onToast?.(`保存しました (${saved}件更新 / ${skipped}件変更なし)`, 'success');
    }
  };

  const th = { padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: C.navy, fontSize: 11 };
  const td = { padding: '8px 12px', fontSize: 12, color: C.textDark, textAlign: 'center' };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 4 }}>
          Sourcing 事業の KPI 目標を設定します。空欄にして保存するとその目標は削除されます。閲覧は全員可、編集は admin のみ。
        </div>
      </div>

      {/* スコープ切替 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'org',    label: '組織全体' },
          { id: 'team',   label: 'チーム別' },
          { id: 'member', label: 'メンバー別' },
        ].map(s => {
          const active = scopeType === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setScopeType(s.id)}
              style={{
                padding: '6px 14px', fontSize: 12,
                background: active ? C.navy : C.white,
                color: active ? C.white : C.textMid,
                border: `1px solid ${active ? C.navy : C.border}`,
                borderRadius: 4, cursor: 'pointer', fontWeight: active ? 600 : 400,
              }}
            >{s.label}</button>
          );
        })}
      </div>

      {/* 対象選択 (team / member のみ) */}
      {scopeType === 'team' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>チーム:</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 200 }}>
            <option value="">選択してください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {scopeType === 'member' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>メンバー:</label>
          <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 240 }}>
            <option value="">選択してください</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}{m.position ? ` (${m.position})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* effective_from */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: C.textMid, marginRight: 8 }}>有効開始日:</label>
        <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 4 }} />
        <span style={{ fontSize: 10, color: C.textLight, marginLeft: 8 }}>
          (この日から有効になる目標として保存)
        </span>
      </div>

      {/* グリッド: KPI × period */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 16 }}>KPI</th>
              {PERIOD_TYPES.map(p => <th key={p.id} style={th}>{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {KPI_TYPES.map(k => (
              <tr key={k.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 16, fontWeight: 500, color: C.navy }}>
                  {k.label}
                  {k.isRate && <span style={{ fontSize: 9, marginLeft: 6, color: C.textLight }}>(日次不可)</span>}
                </td>
                {PERIOD_TYPES.map(p => {
                  const key = `${k.id}__${p.id}`;
                  const disabled = !isAdmin || (k.isRate && p.id === 'daily');
                  return (
                    <td key={p.id} style={td}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          step={k.isRate ? '0.1' : '1'}
                          min="0"
                          max={k.isRate ? 100 : undefined}
                          value={draft[key] ?? ''}
                          disabled={disabled}
                          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                          placeholder={disabled ? '—' : '未設定'}
                          style={{
                            width: 90, padding: '5px 8px', fontSize: 12,
                            border: `1px solid ${C.border}`, borderRadius: 3,
                            textAlign: 'right',
                            background: disabled ? C.cream : C.white,
                            color: disabled ? C.textLight : C.textDark,
                          }}
                        />
                        <span style={{ fontSize: 11, color: C.textMid }}>{k.unit}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 保存 */}
      {isAdmin && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
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
      {!isAdmin && (
        <div style={{ marginTop: 12, fontSize: 11, color: C.textLight, textAlign: 'right' }}>
          ※ 閲覧のみ (編集は admin)
        </div>
      )}
    </div>
  );
}
