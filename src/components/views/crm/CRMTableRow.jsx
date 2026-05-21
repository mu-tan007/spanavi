import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  statusStyle, statusCategory, statusCategoryStyle,
  lastTouchDisplay, nextActionFor,
  priorityScore, priorityRank, composeEmailDraft,
} from './utils';

function MiniIconBtn({ label, color: btnColor = color.navy, disabled, onClick, hint }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }}
      title={hint}
      disabled={disabled}
      style={{
        width: 24, height: 22, borderRadius: radius.sm,
        border: `1px solid ${disabled ? color.border : btnColor}`,
        background: disabled ? color.gray50 : color.white,
        color: disabled ? color.textLight : btnColor,
        fontSize: font.size.xs, fontWeight: font.weight.bold, padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: font.family.sans,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

// 'YYYY-MM-DD' or ISO → 'M/D' / 過去なら赤
function formatNextContact(ts) {
  if (!ts) return { label: '—', color: color.textLight, bold: false };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { label: '—', color: color.textLight, bold: false };
  const now = new Date();
  const isPast = d.getTime() < now.setHours(0, 0, 0, 0);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return {
    label: `${m}/${day}`,
    color: isPast ? color.danger : color.navy,
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
  const altBg = rowIndex % 2 === 0 ? color.white : color.gray50;
  const lt = lastTouchDisplay(lastTouchByClient[c._supaId]);
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

  const nextContact = formatNextContact(c.nextContactAt);

  // 当月の実績/目標から目標対比%を計算
  const monthAppoCount = monthAppoCountByClient[c._supaId] || 0;
  const monthTarget = monthTargetByClient[c._supaId] || 0;
  let ratioDisplay;
  if (monthTarget === 0) {
    ratioDisplay = { label: '—', color: color.textLight };
  } else {
    const ratio = Math.round((monthAppoCount / monthTarget) * 100);
    let ratioColor = color.danger;
    if (ratio >= 100) ratioColor = color.success;
    else if (ratio >= 70) ratioColor = color.gold;
    ratioDisplay = { label: `${ratio}%`, color: ratioColor, sub: `${monthAppoCount}/${monthTarget}` };
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
        padding: '8px 16px', fontSize: font.size.sm, alignItems: 'center',
        borderBottom: `1px solid ${color.border}`,
        background: altBg,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onClick={() => onRowClick(c)}
      onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
      onMouseLeave={e => { e.currentTarget.style.background = altBg; }}
    >
      {/* 1. ステータス (上に カテゴリ ラベル / 下に ステータス) */}
      {(() => {
        const cat = statusCategory(c.status);
        const catStyle = statusCategoryStyle(cat);
        return (
          <span style={{
            borderLeft: `3px solid ${sc.color}`, paddingLeft: 8,
            display: 'inline-flex', flexDirection: 'column', width: 'fit-content',
            alignItems: 'flex-start', textAlign: crmCols[0]?.align, lineHeight: 1.15,
          }}>
            {cat && (
              <span style={{
                fontSize: 9, fontWeight: font.weight.bold, letterSpacing: 0.5,
                color: catStyle.color, background: catStyle.bg,
                padding: '1px 5px', borderRadius: 2,
                marginBottom: 2,
              }}>{cat}</span>
            )}
            <span style={{ color: sc.color, fontSize: font.size.sm, fontWeight: font.weight.medium }}>
              {c.status}
            </span>
          </span>
        );
      })()}

      {/* 2. 企業名（優先度バッジ付き） */}
      <span style={{
        textAlign: crmCols[1]?.align,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        <span
          title={`優先度スコア ${score}（高80+ / 中50+ / 低<50）`}
          style={{
            fontSize: 8, fontWeight: font.weight.bold,
            color: rank.color,
            border: `1px solid ${rank.color}`,
            borderRadius: 2, padding: '1px 4px',
            flexShrink: 0,
            fontFamily: font.family.mono,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 22, textAlign: 'center',
          }}
        >
          {score}
        </span>
        <span style={{
          fontWeight: font.weight.semibold, color: color.navy,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.company}</span>
      </span>

      {/* 3. 商材（旧: 業界） */}
      <span style={{
        textAlign: crmCols[2]?.align,
        fontSize: font.size.xs, color: color.textMid,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{c.industry || '-'}</span>

      {/* 4. 最終接点 */}
      <span style={{
        fontFamily: font.family.mono,
        fontSize: font.size.xs,
        fontVariantNumeric: 'tabular-nums',
        color: lt.stale ? color.gold : (lt.label === '-' ? color.textLight : color.textMid),
        fontWeight: lt.stale ? font.weight.bold : font.weight.normal,
        textAlign: crmCols[3]?.align,
      }}>{lt.label}</span>

      {/* 5. 主担当 */}
      {primary ? (
        <span style={{
          fontSize: font.size.xs, color: color.navy, textAlign: crmCols[4]?.align,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {primary.isPrimary && (
            <span style={{
              fontSize: 8, fontWeight: font.weight.bold, letterSpacing: 1,
              color: color.navy, border: `1px solid ${color.navy}`,
              borderRadius: 2, padding: '1px 3px', flexShrink: 0,
            }}>主</span>
          )}
          <span style={{ fontWeight: font.weight.medium }}>{primary.name}</span>
        </span>
      ) : (
        <span style={{ fontSize: font.size.xs, color: color.textLight, textAlign: crmCols[4]?.align }}>-</span>
      )}

      {/* 6. 次回接点予定 */}
      <span style={{
        fontFamily: font.family.mono,
        fontSize: font.size.xs,
        fontVariantNumeric: 'tabular-nums',
        color: nextContact.color,
        fontWeight: nextContact.bold ? font.weight.bold : font.weight.normal,
        textAlign: crmCols[5]?.align,
      }}>{nextContact.label}</span>

      {/* 7. 目標対比 */}
      <span style={{ textAlign: crmCols[6]?.align }}>
        <span style={{
          display: 'inline-block',
          fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums',
          fontSize: font.size.sm, fontWeight: font.weight.bold,
          color: ratioDisplay.color,
        }}>
          {ratioDisplay.label}
        </span>
        {ratioDisplay.sub && (
          <div style={{
            fontSize: 8, color: color.textLight,
            fontFamily: font.family.mono,
            fontVariantNumeric: 'tabular-nums',
            marginTop: 1,
          }}>{ratioDisplay.sub}</div>
        )}
      </span>

      {/* 8. 次のアクション */}
      <span style={{ textAlign: crmCols[7]?.align }}>
        <span style={{
          fontSize: font.size.xs, fontWeight: font.weight.semibold,
          color: action.color,
          padding: '2px 6px',
          borderRadius: radius.sm,
          background: action.color === '#9CA3AF' ? 'transparent' : action.color + '15',
        }}>
          {action.label}
        </span>
      </span>

      {/* メール・電話・編集の3アイコン */}
      {isEditable && (() => {
        const draft = composeEmailDraft(c, primary);
        const phone = c.contactPhone || '';
        return (
          <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
            <MiniIconBtn
              label="@"
              color={color.navy}
              disabled={!draft.to}
              hint={draft.to ? `メール: ${draft.to}` : 'メールアドレス未登録'}
              onClick={() => window.open(draft.mailto, '_blank')}
            />
            <MiniIconBtn
              label="TEL"
              color={color.navy}
              disabled={!phone}
              hint={phone ? `電話: ${phone}` : '電話番号未登録'}
              onClick={() => { window.location.href = 'tel:' + phone; }}
            />
            <button
              onClick={e => { e.stopPropagation(); onEditRow(c, globalIdx); }}
              title="編集"
              style={{
                width: 24, height: 22, borderRadius: radius.sm,
                border: `1px solid ${color.border}`, background: color.white,
                cursor: 'pointer', fontSize: font.size.sm, padding: 0,
                color: color.textMid,
              }}
            >
              &#9998;
            </button>
          </span>
        );
      })()}
    </div>
  );
}
