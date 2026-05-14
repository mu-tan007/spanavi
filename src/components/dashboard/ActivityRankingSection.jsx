import { useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';

function RankRow({ item, idx, valueKey, showRate, maxVal, currentUser, cph, onSelect }) {
  const value = item[valueKey];
  const rate = showRate && item.call > 0 ? (value / item.call * 100).toFixed(1) : null;
  const pct = Math.max(value / (maxVal || 1) * 100, 2);
  const isMe = item.name === currentUser;
  const isFirst = idx === 0;
  return (
    <div style={{
      marginBottom: 9,
      background: isMe ? alpha(color.navy, 0.04) : 'transparent',
      borderRadius: radius.md,
      padding: '6px 8px',
      borderLeft: isMe ? `3px solid ${color.navyLight}` : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: idx < 3 ? 10 : 8, fontWeight: font.weight.bold, flexShrink: 0,
          background: isFirst ? color.gold : color.gray50,
          color: isFirst ? color.white : color.gray500,
          border: isFirst ? 'none' : `1px solid ${color.border}`,
        }}>
          {idx + 1}
        </span>
        <span
          onClick={onSelect ? () => onSelect(item.name) : undefined}
          style={{
            flex: 1, fontSize: font.size.xs,
            fontWeight: isMe ? font.weight.bold : font.weight.medium,
            color: isMe ? color.navy : color.textDark,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: onSelect ? 'pointer' : 'default',
            textDecoration: onSelect ? 'underline' : 'none',
            textDecorationColor: color.gray400,
          }}
        >{item.name}{isMe ? ' ★' : ''}</span>
        <span style={{
          fontFamily: font.family.mono, fontSize: font.size.base,
          fontWeight: font.weight.black, color: color.navy, fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
        {cph != null && (
          <span style={{
            fontFamily: font.family.mono, fontSize: 9,
            color: color.textLight, whiteSpace: 'nowrap',
          }}>({cph}件/h)</span>
        )}
        {rate !== null && (
          <span style={{
            fontFamily: font.family.mono, fontSize: 10,
            color: color.textLight, whiteSpace: 'nowrap',
          }}>({rate}%)</span>
        )}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: color.border, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: idx === 0
            ? `linear-gradient(90deg,${color.navy},#1a3a6b)`
            : `linear-gradient(90deg,${color.gray400},${color.gray300})`,
          width: pct + '%', transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export default function ActivityRankingSection({ byPerson: byPersonProp = [], loading, currentUser, sessionMap = {}, onSelectPerson }) {
  const byPerson = byPersonProp;

  const callRank    = useMemo(() => [...byPerson].sort((a, b) => b.call - a.call),    [byPerson]);
  const connectRank = useMemo(() => [...byPerson].sort((a, b) => b.connect - a.connect), [byPerson]);
  const appoRank    = useMemo(() => [...byPerson].sort((a, b) => b.appo - a.appo),    [byPerson]);

  const colStyle = {
    flex: 1, minWidth: 0,
    background: color.gray50,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    padding: '14px 12px',
  };
  const ColHeader = ({ text }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 12, paddingBottom: 8,
      borderBottom: `2px solid ${color.navy}`,
    }}>
      <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>{text}</span>
    </div>
  );

  if (byPerson.length === 0 && !loading) {
    return (
      <Card padding="none" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
            borderBottom: `2px solid ${color.navy}`, paddingBottom: 8, marginBottom: 12,
          }}>活動ランキング</span>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>— No records —</div>
      </Card>
    );
  }

  return (
    <Card padding="none" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
          borderBottom: `2px solid ${color.navy}`, paddingBottom: 8, marginBottom: 12,
        }}>活動ランキング</span>
        {loading && <span style={{ fontSize: 10, color: color.textLight }}>読込中…</span>}
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
          <ColHeader text='キーマン接続数' />
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
    </Card>
  );
}
