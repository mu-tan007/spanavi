import { useMemo } from 'react';
import { C } from '../../../constants/colors';

const NAVY = '#0D2247';

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
    padding: '6px 14px', fontSize: 12, fontWeight: 600, background: active ? NAVY : '#F3F4F6',
    color: active ? '#fff' : '#6B7280', border: 'none', borderRadius: 4,
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Noto Sans JP'",
  });
  const labelStyle = { fontSize: 10, color: C.textLight, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 4, textTransform: 'uppercase' };
  const selectStyle = { padding: '6px 10px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 12, background: '#fff', minWidth: 140, fontFamily: "'Noto Sans JP'", color: C.textDark };
  const dateInputStyle = { padding: '6px 8px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 12, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, background: '#fff',
      borderBottom: '1px solid ' + C.border, padding: '12px 16px', marginBottom: 16,
      boxShadow: '0 2px 4px rgba(0,0,0,0.03)', borderRadius: 4,
    }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>

        <div>
          <div style={labelStyle}>期間</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['day', '今日'], ['week', '今週'], ['month', '今月'], ['custom', 'カスタム']].map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k)}>{l}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
              <input type='date' value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
              <span style={{ fontSize: 11, color: C.textLight }}>〜</span>
              <input type='date' value={to} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
            </div>
          )}
        </div>

        <div>
          <div style={labelStyle}>スコープ</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['org', '組織'], ['team', 'チーム'], ['member', '個人']].map(([k, l]) => (
              <button key={k} onClick={() => { setScope(k); setScopeId(null); }} style={tabBtn(scope === k)}>{l}</button>
            ))}
          </div>
        </div>

        {scope === 'team' && (
          <div>
            <div style={labelStyle}>チーム選択</div>
            <select value={scopeId || ''} onChange={e => setScopeId(e.target.value || null)} style={selectStyle}>
              <option value=''>（全チーム）</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {scope === 'member' && (
          <div>
            <div style={labelStyle}>メンバー選択</div>
            <select value={scopeId || ''} onChange={e => setScopeId(e.target.value || null)} style={selectStyle}>
              <option value=''>（全メンバー）</option>
              {members.map(m => <option key={m.name || m} value={m.name || m}>{m.name || m}</option>)}
            </select>
          </div>
        )}

        <div>
          <div style={labelStyle}>リスト絞込</div>
          <select value={listId || ''} onChange={e => setListId(e.target.value || null)} style={{ ...selectStyle, minWidth: 200 }}>
            <option value=''>（全リスト）</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

      </div>
    </div>
  );
}
