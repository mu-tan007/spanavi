import { useMemo } from 'react';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);

const MEDAL = (idx) => idx === 0 ? `linear-gradient(135deg,${GOLD},#e0c97a)` : idx === 1 ? 'linear-gradient(135deg,#b0b0b0,#d8d8d8)' : idx === 2 ? 'linear-gradient(135deg,#cd7f32,#e8a060)' : null;

function RankRow({ item, idx, valueKey, showRate, maxVal, currentUser }) {
  const value = item[valueKey];
  const rate = showRate && item.call > 0 ? (value / item.call * 100).toFixed(1) : null;
  const pct = Math.max(value / (maxVal || 1) * 100, 2);
  const isMe = item.name === currentUser;
  const medal = MEDAL(idx);
  return (
    <div style={{ marginBottom: 9, background: isMe ? NAVY + '06' : 'transparent', borderRadius: 6, padding: '6px 8px', borderLeft: isMe ? '3px solid #1E40AF' : '3px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: idx < 3 ? 10 : 8, fontWeight: 700, flexShrink: 0, background: medal || C.offWhite, color: medal ? '#fff' : C.textLight, border: medal ? 'none' : '1px solid ' + C.borderLight }}>
          {idx + 1}
        </span>
        <span style={{ flex: 1, fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}{isMe ? ' ★' : ''}</span>
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 800, color: NAVY }}>{value}</span>
        {rate !== null && <span style={{ fontSize: 10, color: C.textLight, whiteSpace: 'nowrap' }}>({rate}%)</span>}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.offWhite, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: idx === 0 ? `linear-gradient(90deg,${NAVY},#1a3a6b)` : 'linear-gradient(90deg,#9CA3AF,#d1d5db)', width: pct + '%', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function ActivityRankingSection({ records, loading, currentUser }) {
  const byPerson = useMemo(() => {
    const m = {};
    records.forEach(r => {
      const k = r.getter_name || '不明';
      if (!m[k]) m[k] = { name: k, call: 0, connect: 0, appo: 0 };
      m[k].call++;
      if (CEO_CONNECT.has(r.status)) m[k].connect++;
      if (r.status === 'アポ獲得') m[k].appo++;
    });
    return Object.values(m);
  }, [records]);

  const callRank    = useMemo(() => [...byPerson].sort((a, b) => b.call - a.call),    [byPerson]);
  const connectRank = useMemo(() => [...byPerson].sort((a, b) => b.connect - a.connect), [byPerson]);
  const appoRank    = useMemo(() => [...byPerson].sort((a, b) => b.appo - a.appo),    [byPerson]);

  const colStyle = { flex: 1, minWidth: 0, background: '#F8F9FA', borderRadius: 10, padding: '14px 12px' };
  const ColHeader = ({ text }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #E5E7EB' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{text}</span>
    </div>
  );

  if (records.length === 0 && !loading) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>活動ランキング</span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>活動ランキング</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={colStyle}>
          <ColHeader text='架電件数' />
          {callRank.slice(0, 8).map((item, idx) => (
            <RankRow key={item.name} item={item} idx={idx} valueKey='call' maxVal={callRank[0]?.call} currentUser={currentUser} />
          ))}
        </div>
        <div style={colStyle}>
          <ColHeader text='社長接続数' />
          {connectRank.slice(0, 8).map((item, idx) => (
            <RankRow key={item.name} item={item} idx={idx} valueKey='connect' showRate maxVal={connectRank[0]?.connect} currentUser={currentUser} />
          ))}
        </div>
        <div style={colStyle}>
          <ColHeader text='アポ取得数' />
          {appoRank.slice(0, 8).map((item, idx) => (
            <RankRow key={item.name} item={item} idx={idx} valueKey='appo' showRate maxVal={appoRank[0]?.appo} currentUser={currentUser} />
          ))}
        </div>
      </div>
    </div>
  );
}
