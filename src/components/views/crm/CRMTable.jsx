import { C } from '../../../constants/colors';
import ColumnResizeHandle from '../../common/ColumnResizeHandle';
import { NAVY, GRAY_200, CRM_COL_LABELS } from './utils';
import CRMTableRow from './CRMTableRow';

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
