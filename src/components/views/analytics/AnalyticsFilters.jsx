import { useMemo } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';

export default function AnalyticsFilters({
  period, setPeriod,
  from, setFrom, to, setTo,
  scope, setScope,
  scopeId, setScopeId,
  listId, setListId,
  members = [],
  lists = [],
  teamMap = {},
}) {
  const teams = useMemo(() => {
    const s = new Set();
    Object.values(teamMap).forEach(t => { if (t) s.add(t); });
    return Array.from(s).sort();
  }, [teamMap]);

  const tabBtn = (active) => ({
    padding: `${space[1.5]}px 14px`,
    fontSize: font.size.sm, fontWeight: font.weight.semibold,
    background: active ? color.navy : color.gray100,
    color: active ? color.white : color.gray500,
    border: 'none', borderRadius: radius.md,
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: font.family.sans,
  });
  const labelStyle = {
    fontSize: 10, color: color.textLight,
    fontWeight: font.weight.bold, letterSpacing: font.letterSpacing.wide,
    marginBottom: space[1], textTransform: 'uppercase',
  };

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, background: color.white,
      borderBottom: `1px solid ${color.border}`,
      padding: `${space[3]}px ${space[4]}px`, marginBottom: space[4],
      boxShadow: '0 2px 4px rgba(0,0,0,0.03)', borderRadius: radius.md,
    }}>
      <div style={{ display: 'flex', gap: space[5], alignItems: 'flex-end', flexWrap: 'wrap' }}>

        <div>
          <div style={labelStyle}>期間</div>
          <div style={{ display: 'flex', gap: space[1] }}>
            {[['day', '今日'], ['week', '今週'], ['month', '今月'], ['custom', 'カスタム']].map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k)}>{l}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: space[1], alignItems: 'center', marginTop: space[1.5] }}>
              <Input type="date" size="sm" value={from} onChange={e => setFrom(e.target.value)} fullWidth={false} />
              <span style={{ fontSize: font.size.xs, color: color.textLight }}>〜</span>
              <Input type="date" size="sm" value={to} onChange={e => setTo(e.target.value)} fullWidth={false} />
            </div>
          )}
        </div>

        <div>
          <div style={labelStyle}>スコープ</div>
          <div style={{ display: 'flex', gap: space[1] }}>
            {[['org', '組織'], ['team', 'チーム'], ['member', '個人']].map(([k, l]) => (
              <button key={k} onClick={() => { setScope(k); setScopeId(null); }} style={tabBtn(scope === k)}>{l}</button>
            ))}
          </div>
        </div>

        {scope === 'team' && (
          <div>
            <div style={labelStyle}>チーム選択</div>
            <Select
              size="sm"
              value={scopeId || ''}
              onChange={e => setScopeId(e.target.value || null)}
              fullWidth={false}
              style={{ minWidth: 140 }}
              options={[
                { value: '', label: '（全チーム）' },
                ...teams.map(t => ({ value: t, label: t })),
              ]}
            />
          </div>
        )}

        {scope === 'member' && (
          <div>
            <div style={labelStyle}>メンバー選択</div>
            <Select
              size="sm"
              value={scopeId || ''}
              onChange={e => setScopeId(e.target.value || null)}
              fullWidth={false}
              style={{ minWidth: 140 }}
              options={[
                { value: '', label: '（全メンバー）' },
                ...members.map(m => {
                  const v = m.name || m;
                  return { value: v, label: v };
                }),
              ]}
            />
          </div>
        )}

        <div>
          <div style={labelStyle}>リスト絞込</div>
          <Select
            size="sm"
            value={listId || ''}
            onChange={e => setListId(e.target.value || null)}
            fullWidth={false}
            style={{ minWidth: 200 }}
            options={[
              { value: '', label: '（全リスト）' },
              ...lists.map(l => ({ value: l.id, label: l.name })),
            ]}
          />
        </div>

      </div>
    </div>
  );
}
