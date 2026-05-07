import { C } from '../../../constants/colors';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  statusStyle, lastTouchDisplay, nextActionFor,
  priorityScore, priorityRank,
} from './utils';

// 'YYYY-MM-DD' or ISO → 'M/D' / 過去なら赤
function formatNextContact(ts) {
  if (!ts) return { label: '—', color: C.textLight, bold: false };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { label: '—', color: C.textLight, bold: false };
  const now = new Date();
  const isPast = d.getTime() < now.setHours(0, 0, 0, 0);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return {
    label: `${m}/${day}`,
    color: isPast ? '#DC2626' : NAVY,
    bold: isPast,
  };
}

export default function CRMTableRow({
  client,
  rowIndex,
  globalIdx,
  crmCols,
  crmGrid,
  isEditable,
  lastTouchByClient,
  contactsByClient,
  monthAppoCountByClient = {},
  monthTargetByClient = {},
  maxMonthTarget = 0,
  onRowClick,
  onEditRow,
}) {
  const c = client;
  const sc = statusStyle(c.status);
  const altBg = rowIndex % 2 === 0 ? '#fff' : GRAY_50;
  const lt = lastTouchDisplay(lastTouchByClient[c._supaId]);
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

  const nextContact = formatNextContact(c.nextContactAt);

  // 当月の実績/目標から目標対比%を計算
  const monthAppoCount = monthAppoCountByClient[c._supaId] || 0;
  const monthTarget = monthTargetByClient[c._supaId] || 0;
  let ratioDisplay;
  if (monthTarget === 0) {
    ratioDisplay = { label: '—', color: C.textLight };
  } else {
    const ratio = Math.round((monthAppoCount / monthTarget) * 100);
    let color = '#DC2626';
    if (ratio >= 100) color = '#16A34A';
    else if (ratio >= 70) color = GOLD;
    ratioDisplay = { label: `${ratio}%`, color, sub: `${monthAppoCount}/${monthTarget}` };
  }

  // 次のアクション（自動判定）
  const action = nextActionFor(c, {
    lastTouchAt: lastTouchByClient[c._supaId],
    monthAppoCount,
  });

  // 優先度スコア
  const score = priorityScore(c, {
    lastTouchAt: lastTouchByClient[c._supaId],
    monthAppoCount,
    monthTarget,
    maxMonthTarget,
  });
  const rank = priorityRank(score);

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: crmGrid,
        padding: '8px 16px', fontSize: 11, alignItems: 'center',
        borderBottom: '1px solid ' + GRAY_200,
        background: altBg,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onClick={() => onRowClick(c)}
      onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
      onMouseLeave={e => { e.currentTarget.style.background = altBg; }}
    >
      {/* 1. ステータス */}
      <span style={{
        borderLeft: '3px solid ' + sc.color, paddingLeft: 8, color: sc.color, fontSize: 12,
        display: 'inline-block', width: 'fit-content', textAlign: crmCols[0]?.align,
      }}>{c.status}</span>

      {/* 2. 企業名（優先度バッジ付き） */}
      <span style={{
        textAlign: crmCols[1]?.align,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        <span
          title={`優先度スコア ${score}（高80+ / 中50+ / 低<50）`}
          style={{
            fontSize: 8, fontWeight: 700,
            color: rank.color,
            border: '1px solid ' + rank.color,
            borderRadius: 2, padding: '1px 4px',
            flexShrink: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            minWidth: 22, textAlign: 'center',
          }}
        >
          {score}
        </span>
        <span style={{
          fontWeight: 600, color: NAVY,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.company}</span>
      </span>

      {/* 3. 最終接点 */}
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
        color: lt.stale ? GOLD : (lt.label === '-' ? C.textLight : C.textMid),
        fontWeight: lt.stale ? 700 : 400,
        textAlign: crmCols[2]?.align,
      }}>{lt.label}</span>

      {/* 4. 主担当 */}
      {primary ? (
        <span style={{
          fontSize: 10, color: NAVY, textAlign: crmCols[3]?.align,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {primary.isPrimary && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1,
              color: NAVY, border: '1px solid ' + NAVY,
              borderRadius: 2, padding: '1px 3px', flexShrink: 0,
            }}>主</span>
          )}
          <span style={{ fontWeight: 500 }}>{primary.name}</span>
        </span>
      ) : (
        <span style={{ fontSize: 10, color: C.textLight, textAlign: crmCols[3]?.align }}>-</span>
      )}

      {/* 5. 次回接点予定 */}
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
        color: nextContact.color,
        fontWeight: nextContact.bold ? 700 : 400,
        textAlign: crmCols[4]?.align,
      }}>{nextContact.label}</span>

      {/* 6. 目標対比 */}
      <span style={{ textAlign: crmCols[5]?.align }}>
        <span style={{
          display: 'inline-block',
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: 'tabular-nums',
          fontSize: 11, fontWeight: 700,
          color: ratioDisplay.color,
        }}>
          {ratioDisplay.label}
        </span>
        {ratioDisplay.sub && (
          <div style={{
            fontSize: 8, color: C.textLight,
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            marginTop: 1,
          }}>{ratioDisplay.sub}</div>
        )}
      </span>

      {/* 7. 次のアクション */}
      <span style={{ textAlign: crmCols[6]?.align }}>
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: action.color,
          padding: '2px 6px',
          borderRadius: 3,
          background: action.color === '#9CA3AF' ? 'transparent' : action.color + '15',
        }}>
          {action.label}
        </span>
      </span>

      {/* 編集アイコン（編集権限あれば） */}
      {isEditable && (
        <span style={{ textAlign: 'center' }}>
          <button
            onClick={e => { e.stopPropagation(); onEditRow(c, globalIdx); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 2 }}
          >
            &#9998;
          </button>
        </span>
      )}
    </div>
  );
}
