import { C } from '../../../constants/colors';
import ColumnResizeHandle from '../../common/ColumnResizeHandle';
import { useIsMobile } from '../../../hooks/useIsMobile';
import {
  NAVY, GRAY_200, GRAY_50, GOLD, CRM_COL_LABELS,
  statusStyle, lastTouchDisplay, nextActionFor, priorityScore, priorityRank,
} from './utils';
import CRMTableRow from './CRMTableRow';

function MobileCard({
  client, isEditable,
  lastTouchByClient, contactsByClient,
  monthAppoCountByClient, monthTargetByClient, maxMonthTarget,
  onRowClick, onEditRow, globalIdx,
}) {
  const c = client;
  const sc = statusStyle(c.status);
  const lt = lastTouchDisplay(lastTouchByClient[c._supaId]);
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

  const monthAppoCount = monthAppoCountByClient[c._supaId] || 0;
  const monthTarget = monthTargetByClient[c._supaId] || 0;
  let ratioDisplay = '—';
  let ratioColor = C.textLight;
  if (monthTarget > 0) {
    const ratio = Math.round((monthAppoCount / monthTarget) * 100);
    ratioDisplay = `${ratio}% (${monthAppoCount}/${monthTarget})`;
    if (ratio >= 100) ratioColor = '#16A34A';
    else if (ratio >= 70) ratioColor = GOLD;
    else ratioColor = '#DC2626';
  }

  const score = priorityScore(c, {
    lastTouchAt: lastTouchByClient[c._supaId],
    monthAppoCount, monthTarget, maxMonthTarget,
  });
  const rank = priorityRank(score);

  const action = nextActionFor(c, {
    lastTouchAt: lastTouchByClient[c._supaId],
    monthAppoCount,
  });

  return (
    <div
      onClick={() => onRowClick(c)}
      style={{
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
        borderLeft: '4px solid ' + sc.color,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: rank.color,
          border: '1px solid ' + rank.color, borderRadius: 2,
          padding: '1px 5px', fontFamily: "'JetBrains Mono'",
          fontVariantNumeric: 'tabular-nums', minWidth: 22, textAlign: 'center',
        }}>{score}</span>
        <span style={{ fontSize: 11, color: sc.color, fontWeight: 700 }}>{c.status}</span>
        <span style={{
          fontSize: 9, color: lt.stale ? GOLD : C.textLight,
          fontWeight: lt.stale ? 700 : 400, marginLeft: 'auto',
          fontFamily: "'JetBrains Mono'",
        }}>{lt.label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6, lineHeight: 1.3 }}>
        {c.company}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 4, fontSize: 10, color: C.textMid,
      }}>
        <div>
          <span style={{ color: C.textLight }}>主担当: </span>
          {primary ? (
            <span style={{ fontWeight: 500 }}>
              {primary.isPrimary ? '主 ' : ''}{primary.name}
            </span>
          ) : '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: C.textLight }}>達成: </span>
          <span style={{ color: ratioColor, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>
            {ratioDisplay}
          </span>
        </div>
      </div>
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + GRAY_200,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: action.color, padding: '2px 6px',
          borderRadius: 3,
          background: action.color === '#9CA3AF' ? 'transparent' : action.color + '15',
        }}>{action.label}</span>
        {isEditable && (
          <button
            onClick={e => { e.stopPropagation(); onEditRow(c, globalIdx); }}
            style={{
              padding: '4px 10px', borderRadius: 3,
              border: '1px solid ' + GRAY_200, background: '#fff',
              color: C.textMid, fontSize: 10, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}
          >編集</button>
        )}
      </div>
    </div>
  );
}

export default function CRMTable({
  filtered,
  clientData,
  isEditable,
  crmCols,
  crmGrid,
  crmMinW,
  crmCtxMenu,
  crmResize,
  lastTouchByClient,
  contactsByClient,
  monthAppoCountByClient,
  monthTargetByClient,
  maxMonthTarget,
  onRowClick,
  onEditRow,
}) {
  const isMobile = useIsMobile();

  // モバイル: カード形式
  if (isMobile) {
    if (filtered.length === 0) {
      return (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: C.textLight, fontSize: 12,
          background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        }}>
          データがありません
        </div>
      );
    }
    return (
      <div>
        {filtered.map(c => (
          <MobileCard
            key={c._supaId || c.no}
            client={c}
            globalIdx={clientData.indexOf(c)}
            isEditable={isEditable}
            lastTouchByClient={lastTouchByClient}
            contactsByClient={contactsByClient}
            monthAppoCountByClient={monthAppoCountByClient}
            monthTargetByClient={monthTargetByClient}
            maxMonthTarget={maxMonthTarget}
            onRowClick={onRowClick}
            onEditRow={onEditRow}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ minWidth: crmMinW }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: crmGrid,
          padding: '8px 16px', background: NAVY,
          fontSize: 11, fontWeight: 600, color: '#fff',
          verticalAlign: 'middle',
        }}>
          {CRM_COL_LABELS.map((label, idx) => (
            <span
              key={label}
              style={{
                position: 'relative', verticalAlign: 'middle',
                textAlign: crmCols[idx]?.align || 'left', paddingRight: 6,
              }}
              onContextMenu={e => crmCtxMenu(e, idx)}
            >
              {label}
              <ColumnResizeHandle colIndex={idx} onResizeStart={crmResize} />
            </span>
          ))}
          {isEditable && <span></span>}
        </div>

        {/* Body */}
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            データがありません
          </div>
        ) : (
          filtered.map((c, i) => (
            <CRMTableRow
              key={c._supaId || i}
              client={c}
              rowIndex={i}
              globalIdx={clientData.indexOf(c)}
              crmCols={crmCols}
              crmGrid={crmGrid}
              isEditable={isEditable}
              lastTouchByClient={lastTouchByClient}
              contactsByClient={contactsByClient}
              monthAppoCountByClient={monthAppoCountByClient}
              monthTargetByClient={monthTargetByClient}
              maxMonthTarget={maxMonthTarget}
              onRowClick={onRowClick}
              onEditRow={onEditRow}
            />
          ))
        )}
      </div>
    </div>
  );
}
