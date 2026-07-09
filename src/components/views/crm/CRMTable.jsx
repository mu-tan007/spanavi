import {
  DndContext, PointerSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { color, space, radius, font } from '../../../constants/design';
import { Button } from '../../ui';
import ColumnResizeHandle from '../../common/ColumnResizeHandle';
import { useIsMobile } from '../../../hooks/useIsMobile';
import {
  NAVY, GRAY_200, GRAY_50, GOLD, CRM_COL_LABELS, CRM_SORTABLE_KEYS,
  statusStyle, statusCategory, statusCategoryStyle,
  lastTouchDisplay, nextActionFor, priorityScore, priorityRank,
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
  let ratioColor = color.textLight;
  if (monthTarget > 0) {
    const ratio = Math.round((monthAppoCount / monthTarget) * 100);
    ratioDisplay = `${ratio}% (${monthAppoCount}/${monthTarget})`;
    if (ratio >= 100) ratioColor = color.success;
    else if (ratio >= 70) ratioColor = GOLD;
    else ratioColor = color.danger;
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
      style={{
        background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
        padding: '12px 14px', marginBottom: space[2],
        borderLeft: '4px solid ' + sc.color,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1.5] }}>
        <span style={{
          fontSize: 9, fontWeight: font.weight.bold, color: rank.color,
          border: '1px solid ' + rank.color, borderRadius: radius.sm,
          padding: '1px 5px', fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums', minWidth: 22, textAlign: 'center',
        }}>{score}</span>
        {(() => {
          const cat = statusCategory(c.status);
          const catStyle = statusCategoryStyle(cat);
          return cat ? (
            <span style={{
              fontSize: 9, fontWeight: font.weight.bold, letterSpacing: 0.5,
              color: catStyle.color, background: catStyle.bg,
              padding: '1px 5px', borderRadius: 2,
            }}>{cat}</span>
          ) : null;
        })()}
        <span style={{ fontSize: font.size.xs, color: sc.color, fontWeight: font.weight.bold }}>{c.status}</span>
        <span style={{
          fontSize: 9, color: lt.stale ? GOLD : color.textLight,
          fontWeight: lt.stale ? font.weight.bold : font.weight.normal, marginLeft: 'auto',
          fontFamily: font.family.mono,
        }}>{lt.label}</span>
      </div>
      <div
        onClick={() => onRowClick(c)}
        style={{
          fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY,
          marginBottom: space[1.5], lineHeight: 1.3, cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {c.company}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: space[1], fontSize: font.size.xs - 1, color: color.textMid,
      }}>
        <div>
          <span style={{ color: color.textLight }}>主担当: </span>
          {primary ? (
            <span style={{ fontWeight: font.weight.medium }}>
              {primary.isPrimary ? '主 ' : ''}{primary.name}
            </span>
          ) : '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: color.textLight }}>達成: </span>
          <span style={{ color: ratioColor, fontWeight: font.weight.bold, fontFamily: font.family.mono }}>
            {ratioDisplay}
          </span>
        </div>
      </div>
      <div style={{
        marginTop: space[2], paddingTop: space[2], borderTop: '1px dashed ' + GRAY_200,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[1.5],
      }}>
        <span style={{
          fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
          color: action.color, padding: '2px 6px',
          borderRadius: radius.sm,
          background: action.color === '#9CA3AF' ? 'transparent' : action.color + '15',
        }}>{action.label}</span>
        {isEditable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={e => { e.stopPropagation(); onEditRow(c, globalIdx); }}
          >編集</Button>
        )}
      </div>
    </div>
  );
}

export default function CRMTable({
  filtered,
  clientData,
  setClientData,
  isEditable,
  crmCols,
  crmGrid,
  crmMinW,
  crmResize,
  lastTouchByClient,
  lastMeetingByClient = {},
  listCountByClient = {},
  contactsByClient,
  monthAppoCountByClient,
  monthTargetByClient,
  maxMonthTarget,
  rewardsByClient = {},
  rewardMaster = [],
  sortState = { key: null, dir: null },
  setSortState,
  onRowClick,
  onComposeEmail,
  onToggleFavorite,
  canDrag = false,
  onReorder,
}) {
  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = filtered.map(c => c._supaId);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    onReorder?.(nextIds);
  };

  // モバイル: カード形式
  if (isMobile) {
    if (filtered.length === 0) {
      return (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
          background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
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

  // 各行へ渡す共通 props (静的行 / ドラッグ行で共有)
  const rowProps = (c, i) => ({
    client: c,
    rowIndex: i,
    globalIdx: clientData.indexOf(c),
    setClientData,
    crmCols,
    crmGrid,
    isEditable,
    lastTouchByClient,
    lastMeetingAt: lastMeetingByClient[c._supaId],
    listCount: listCountByClient[c._supaId] || 0,
    contactsByClient,
    monthAppoCountByClient,
    monthTargetByClient,
    maxMonthTarget,
    rewards: rewardsByClient[c._supaId] || [],
    rewardMaster,
    onRowClick,
    onComposeEmail,
    onToggleFavorite,
  });

  return (
    <div style={{ border: '1px solid ' + GRAY_200, borderRadius: radius.md, overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ minWidth: crmMinW }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: crmGrid,
          padding: '8px 16px', background: NAVY,
          fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white,
          verticalAlign: 'middle',
        }}>
          {CRM_COL_LABELS.map((label, idx) => {
            const col = crmCols[idx];
            const sortable = col && CRM_SORTABLE_KEYS.has(col.key);
            const active = sortState.key === col?.key;
            const arrow = active ? (sortState.dir === 'desc' ? ' ▼' : ' ▲') : '';
            return (
              <span
                key={label}
                onClick={sortable && setSortState ? () => {
                  setSortState(prev => {
                    if (prev.key !== col.key) return { key: col.key, dir: 'asc' };
                    if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
                    return { key: null, dir: null };
                  });
                } : undefined}
                style={{
                  position: 'relative', verticalAlign: 'middle',
                  textAlign: col?.align || 'left', paddingRight: 6,
                  cursor: sortable ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                title={sortable ? 'クリックでソート' : ''}
              >
                {label}{arrow}
                <ColumnResizeHandle colIndex={idx} onResizeStart={crmResize} />
              </span>
            );
          })}
        </div>

        {/* Body */}
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>
            データがありません
          </div>
        ) : canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={filtered.map(c => c._supaId)} strategy={verticalListSortingStrategy}>
              {filtered.map((c, i) => (
                <SortableCRMRow key={c._supaId || i} client={c} rowProps={rowProps(c, i)} />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          filtered.map((c, i) => (
            <CRMTableRow key={c._supaId || i} {...rowProps(c, i)} />
          ))
        )}
      </div>
    </div>
  );
}

// ドラッグ並び替え可能な 1 行 (useSortable を CRMTableRow に橋渡し)
function SortableCRMRow({ client, rowProps }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: client._supaId });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <CRMTableRow
      {...rowProps}
      dragRef={setNodeRef}
      dragStyle={dragStyle}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
      showDragHandle
    />
  );
}
