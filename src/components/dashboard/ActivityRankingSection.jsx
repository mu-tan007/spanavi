import { useMemo } from 'react';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);

const MEDAL = (idx) => idx === 0 ? GOLD : null;

function RankRow({ item, idx, valueKey, showRate, maxVal, currentUser, cph, onSelect }) {
  const value = item[valueKey];
  const rate = showRate && item.call > 0 ? (value / item.call * 100).toFixed(1) : null;
  const pct = Math.max(value / (maxVal || 1) * 100, 2);
  const isMe = item.name === currentUser;
  const isFirst = idx === 0;
  return (
    <div style={{ marginBottom: 9, background: isMe ? NAVY + '06' : 'transparent', borderRadius: 4, padding: '6px 8px', borderLeft: isMe ? '3px solid #1E40AF' : '3px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: idx < 3 ? 10 : 8, fontWeight: 700, flexShrink: 0,
          background: isFirst ? GOLD : '#F8F9FA',
          color: isFirst ? '#fff' : '#6B7280',
          border: isFirst ? 'none' : '1px solid #E5E7EB',
        }}>
          {idx + 1}
        </span>
        <span
          onClick={onSelect ? () => onSelect(item.name) : undefined}
          style={{ flex: 1, fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onSelect ? 'pointer' : 'default', textDecoration: onSelect ? 'underline' : 'none', textDecorationColor: '#9CA3AF' }}
        >{item.name}{isMe ? ' ★' : ''}</span>
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 800, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {cph != null && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight, whiteSpace: 'nowrap' }}>({cph}件/h)</span>}
        {rate !== null && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, whiteSpace: 'nowrap' }}>({rate}%)</span>}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: '#E5E7EB', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: idx === 0 ? `linear-gradient(90deg,${NAVY},#1a3a6b)` : 'linear-gradient(90deg,#9CA3AF,#d1d5db)', width: pct + '%', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function ActivityRankingSection({ records, appoRecords = [], loading, currentUser, sessionMap = {}, onSelectPerson }) {
  const appoMap = useMemo(() => {
    const m = {};
    appoRecords.forEach(r => {
      const k = r.getter_name || '不明';
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [appoRecords]);

  const byPerson = useMemo(() => {
    const m = {};
    records.forEach(r => {
      const k = r.getter_name || '不明';
      if (!m[k]) m[k] = { name: k, call: 0, connect: 0 };
      m[k].call++;
      if (CEO_CONNECT.has(r.status)) m[k].connect++;
    });
    // Merge in appo counts from appointments table; include appo-only people too
    const allNames = new Set([...Object.keys(m), ...Object.keys(appoMap)]);
    return Array.from(allNames).map(k => ({
      name: k,
      call: m[k]?.call || 0,
      connect: m[k]?.connect || 0,
      appo: appoMap[k] || 0,
    }));
  }, [records, appoMap]);

  const callRank    = useMemo(() => [...byPerson].sort((a, b) => b.call - a.call),    [byPerson]);
  const connectRank = useMemo(() => [...byPerson].sort((a, b) => b.connect - a.connect), [byPerson]);
  const appoRank    = useMemo(() => [...byPerson].sort((a, b) => b.appo - a.appo),    [byPerson]);

  const colStyle = { flex: 1, minWidth: 0, background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 12px' };
  const ColHeader = ({ text }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #0D2247' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{text}</span>
    </div>
  );

  if (records.length === 0 && !loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 8, marginBottom: 12 }}>活動ランキング</span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 8, marginBottom: 12 }}>活動ランキング</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={colStyle}>
          <ColHeader text='架電件数' />
          {callRank.slice(0, 8).map((item, idx) => {
            const hours = sessionMap[item.name] || 0;
            const cph = hours > 0.01 ? (item.call / hours).toFixed(1) : null;
            return (
              <RankRow key={item.name} item={item} idx={idx} valueKey='call' maxVal={callRank[0]?.call} currentUser={currentUser} cph={cph} onSelect={onSelectPerson} />
            );
          })}
        </div>
        <div style={colStyle}>
          <ColHeader text='社長接続数' />
          {connectRank.slice(0, 8).map((item, idx) => (
            <RankRow key={item.name} item={item} idx={idx} valueKey='connect' showRate maxVal={connectRank[0]?.connect} currentUser={currentUser} onSelect={onSelectPerson} />
          ))}
        </div>
        <div style={colStyle}>
          <ColHeader text='アポ取得数' />
          {appoRank.slice(0, 8).map((item, idx) => (
            <RankRow key={item.name} item={item} idx={idx} valueKey='appo' showRate maxVal={appoRank[0]?.appo} currentUser={currentUser} onSelect={onSelectPerson} />
          ))}
        </div>
      </div>
    </div>
  );
}
