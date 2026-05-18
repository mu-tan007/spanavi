import React from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { STATUS_INDEX, HOMEWORK_STATUSES } from './mockData';

// 全顧客×第1〜8回の進捗マトリクス
// 仕様書: §7.3 全顧客マトリクス
// 色分け5段階+完了で計6種。第0回は事前課題なしのため対象外
const SESSIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function HomeworkMatrix({ customers, matrix, onCellClick, selectedCell }) {
  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      overflow: 'hidden',
    }}>
      <Legend />
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 880 }}>
          {/* ヘッダー */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `220px repeat(${SESSIONS.length}, 1fr) 110px 110px`,
            background: color.navy,
            color: color.white,
            fontSize: font.size.xs,
            fontWeight: font.weight.semibold,
            letterSpacing: font.letterSpacing.wide,
            padding: '10px 16px',
          }}>
            <span style={{ textAlign: 'left' }}>顧客</span>
            {SESSIONS.map(n => (
              <span key={n} style={{ textAlign: 'center' }}>第{n}回</span>
            ))}
            <span style={{ textAlign: 'right' }}>完了率</span>
            <span style={{ textAlign: 'right' }}>最終更新</span>
          </div>

          {/* 行 */}
          {customers.map((c, idx) => {
            const row = matrix[c.id] || {};
            const filled = SESSIONS.filter(n => row[n] === 'completed').length;
            const totalAssigned = SESSIONS.filter(n => row[n] != null).length;
            const rate = totalAssigned === 0 ? 0 : Math.round((filled / totalAssigned) * 100);

            return (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `220px repeat(${SESSIONS.length}, 1fr) 110px 110px`,
                  padding: '8px 16px',
                  fontSize: font.size.sm,
                  color: color.textDark,
                  background: idx % 2 === 1 ? color.cream : color.white,
                  borderBottom: `1px solid ${color.borderLight}`,
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                  <span style={{ marginLeft: 6, color: color.textLight, fontWeight: font.weight.normal, fontSize: font.size.xs }}>
                    {c.id}
                  </span>
                </span>
                {SESSIONS.map(n => (
                  <Cell
                    key={n}
                    customerId={c.id}
                    sessionNumber={n}
                    status={row[n]}
                    selected={selectedCell && selectedCell.customerId === c.id && selectedCell.sessionNumber === n}
                    onClick={onCellClick}
                  />
                ))}
                <span style={{ textAlign: 'right', fontFamily: font.family.mono, color: color.textMid }}>
                  {totalAssigned === 0 ? '—' : `${rate}%`}
                </span>
                <span style={{ textAlign: 'right', fontFamily: font.family.mono, color: color.textLight, fontSize: font.size.xs }}>
                  {totalAssigned === 0 ? '—' : '5/16'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell({ customerId, sessionNumber, status, selected, onClick }) {
  if (!status) {
    return (
      <div style={{
        margin: '0 4px',
        height: 28,
        borderRadius: radius.sm,
        background: color.gray50,
        border: `1px dashed ${color.borderLight}`,
      }}/>
    );
  }
  const meta = STATUS_INDEX[status];
  return (
    <button
      type="button"
      onClick={() => onClick && onClick({ customerId, sessionNumber, status })}
      title={`第${sessionNumber}回：${meta.label}`}
      style={{
        margin: '0 4px',
        height: 28,
        borderRadius: radius.sm,
        background: meta.cellColor,
        border: selected ? `2px solid ${color.navy}` : `1px solid ${alpha(color.navy, 0.12)}`,
        color: color.textDark,
        fontSize: font.size.xs - 1,
        fontWeight: font.weight.semibold,
        cursor: 'pointer',
        padding: 0,
        outline: 'none',
        transition: 'transform 0.1s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadow.sm; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      {meta.label}
    </button>
  );
}

function Legend() {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: space[3],
      padding: `${space[2]}px ${space[4]}px`,
      borderBottom: `1px solid ${color.borderLight}`,
      background: color.snow,
      alignItems: 'center',
    }}>
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, letterSpacing: font.letterSpacing.wide }}>
        凡例
      </span>
      {HOMEWORK_STATUSES.map(s => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.size.xs, color: color.textDark }}>
          <span style={{ width: 16, height: 16, background: s.cellColor, borderRadius: radius.sm, border: `1px solid ${alpha(color.navy, 0.12)}`, display: 'inline-block' }}/>
          {s.label}
        </span>
      ))}
    </div>
  );
}
