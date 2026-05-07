import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, GRAY_50, GOLD, statusStyle, contactLabel, lastTouchDisplay } from './utils';

export default function CRMTableRow({
  client,
  rowIndex,
  globalIdx,
  crmCols,
  crmGrid,
  isEditable,
  lastTouchByClient,
  contactsByClient,
  getRewardSummary,
  onRowClick,
  onEditRow,
  onShowReward,
}) {
  const c = client;
  const sc = statusStyle(c.status);
  const altBg = rowIndex % 2 === 0 ? '#fff' : GRAY_50;
  const lt = lastTouchDisplay(lastTouchByClient[c._supaId]);
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

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
      <span style={{
        borderLeft: '3px solid ' + sc.color, paddingLeft: 8, color: sc.color, fontSize: 12,
        display: 'inline-block', width: 'fit-content', textAlign: crmCols[0]?.align,
      }}>{c.status}</span>

      <span style={{ fontWeight: 600, color: NAVY, textAlign: crmCols[1]?.align }}>{c.company}</span>

      <span style={{ color: C.textMid, fontSize: 10, textAlign: crmCols[2]?.align }}>{c.industry}</span>

      <span style={{
        fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700,
        color: c.target > 0 ? NAVY : C.textLight,
        textAlign: crmCols[3]?.align, fontVariantNumeric: 'tabular-nums',
      }}>{c.target > 0 ? c.target + '件' : '-'}</span>

      <span
        onClick={e => { e.stopPropagation(); onShowReward(c.rewardType); }}
        style={{
          fontSize: 10, fontWeight: 600, color: NAVY, cursor: 'pointer',
          textDecoration: 'underline', textDecorationStyle: 'dotted', textAlign: crmCols[4]?.align,
        }}
      >
        {c.rewardType ? c.rewardType + ' ' + getRewardSummary(c.rewardType).slice(0, 10) : '-'}
      </span>

      <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[5]?.align }}>{c.listSrc || '-'}</span>
      <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[6]?.align }}>{c.calendar || '-'}</span>
      <span style={{ fontSize: 10, color: C.textMid, textAlign: crmCols[7]?.align }}>{contactLabel(c.contact)}</span>

      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
        color: lt.stale ? GOLD : (lt.label === '-' ? C.textLight : C.textMid),
        fontWeight: lt.stale ? 700 : 400,
        textAlign: crmCols[8]?.align,
      }}>{lt.label}</span>

      {primary ? (
        <span style={{
          fontSize: 10, color: NAVY, textAlign: crmCols[9]?.align,
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
        <span style={{ fontSize: 10, color: C.textLight, textAlign: crmCols[9]?.align }}>-</span>
      )}

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
