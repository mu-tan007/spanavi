import { useState, useEffect, useRef } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  statusStyle, statusCategory, statusCategoryStyle,
  priorityScore, priorityRank,
} from './utils';
import { updateClient } from '../../../lib/supabaseWrite';

function formatLastMeeting(ts) {
  if (!ts) return { label: '—', color: color.textLight };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { label: '—', color: color.textLight };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const label = `${m}/${day}`;
  if (days >= 30) return { label, color: color.danger };
  if (days >= 14) return { label, color: color.gold };
  return { label, color: color.textMid };
}


// 支払いサイトのインライン編集 (clients.payment_site)
// 経過日数の表示（30日以上は黄、60日以上は赤、記録なしも赤）
function daysAgo(day) {
  if (!day) return null;
  const t = new Date(day + 'T00:00:00').getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function AgeTag({ days }) {
  if (days == null) {
    return <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.danger, background: color.dangerSoft, padding: '0 5px', borderRadius: 3, marginLeft: 4 }}>記録なし</span>;
  }
  const warn = days >= 60 ? { c: color.danger, bg: color.dangerSoft } : days >= 30 ? { c: color.goldDim, bg: color.goldGlow } : null;
  if (!warn) return <span style={{ fontSize: 10, color: color.textLight, marginLeft: 4 }}>{days === 0 ? '本日' : `${days}日前`}</span>;
  return <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: warn.c, background: warn.bg, padding: '0 5px', borderRadius: 3, marginLeft: 4 }}>{days}日前</span>;
}

// 最後のやり取り：日付・経過日数／手段・どちらから・中身
function LastContactCell({ client: c, align }) {
  const days = daysAgo(c.lastContactAt);
  const sub = [c.lastContactChannel, c.lastContactFrom ? `${c.lastContactFrom}から` : ''].filter(Boolean).join('・');
  return (
    <span style={{ textAlign: align, fontSize: font.size.xs, lineHeight: 1.45, overflow: 'hidden', minWidth: 0 }}
      title={[c.lastContactAt, sub, c.lastContactSummary].filter(Boolean).join(' / ')}>
      <span style={{ display: 'block', color: color.textDark, whiteSpace: 'nowrap' }}>
        {c.lastContactAt ? c.lastContactAt.replaceAll('-', '/') : '—'}<AgeTag days={days} />
      </span>
      {(sub || c.lastContactSummary) && (
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          color: color.textMid,
        }}>{sub}{sub && c.lastContactSummary ? '　' : ''}{c.lastContactSummary}</span>
      )}
    </span>
  );
}

// 次の一手：誰が・中身／期限・止まっている理由
function NextActionCell({ client: c, align }) {
  const due = c.nextActionDue;
  const overdue = due && due < new Date().toISOString().slice(0, 10);
  const ownerBg = c.nextActionOwner === '当方' ? color.navy : c.nextActionOwner === '先方' ? color.textLight : color.navyLight;
  return (
    <span style={{ textAlign: align, fontSize: font.size.xs, lineHeight: 1.45, overflow: 'hidden', minWidth: 0 }}
      title={[c.nextActionOwner, c.nextAction, due ? `期限 ${due}` : '', c.blocker ? `止まり：${c.blocker}` : ''].filter(Boolean).join(' / ')}>
      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: color.textDark }}>
        {c.nextActionOwner && (
          <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.white, background: ownerBg, borderRadius: 3, padding: '0 5px', marginRight: 4 }}>{c.nextActionOwner}</span>
        )}
        {c.nextAction || '—'}
      </span>
      {(due || c.blocker) && (
        <span style={{ display: 'block', color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {due && <span style={{ color: overdue ? color.danger : color.textMid, fontWeight: overdue ? font.weight.bold : undefined }}>期限 {due.replaceAll('-', '/')}　</span>}
          {c.blocker && `止まり：${c.blocker}`}
        </span>
      )}
    </span>
  );
}

export default function CRMTableRow({
  client,
  rowIndex,
  globalIdx,
  setClientData,
  crmCols,
  crmGrid,
  isEditable,
  lastTouchByClient,
  lastMeetingAt,
  contactsByClient,
  monthAppoCountByClient = {},
  monthTargetByClient = {},
  maxMonthTarget = 0,
  rewards = [],
  rewardMaster = [],
  onRowClick,
  onComposeEmail,
  onToggleFavorite,
  // ドラッグ並び替え用 (CRMTable から useSortable 経由で渡す)
  dragRef,
  dragStyle,
  dragAttributes,
  dragListeners,
  isDragging = false,
  showDragHandle = false,
}) {
  const c = client;
  const colAlign = (key) => crmCols.find(x => x.key === key)?.align;
  const sc = statusStyle(c.status);
  // 契約済みで始まっていない先は金色の地で目立たせる（いちばん早く売上になる層）
  const altBg = c.stage === '契約済・未開始' ? color.goldGlow : (rowIndex % 2 === 0 ? color.white : color.gray50);
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

  // 当月の実績/目標（優先度スコア算出に使用）
  const monthAppoCount = monthAppoCountByClient[c._supaId] || 0;
  const monthTarget = monthTargetByClient[c._supaId] || 0;

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
      ref={dragRef}
      {...(showDragHandle ? dragAttributes : {})}
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: crmGrid,
        padding: '8px 16px', fontSize: font.size.sm, alignItems: 'center',
        borderBottom: `1px solid ${color.border}`,
        background: isDragging ? color.cream : altBg,
        opacity: isDragging ? 0.5 : 1,
        transition: 'background 0.15s',
        ...dragStyle,
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = '#F5F8FC'; }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = altBg; }}
    >
      {/* ドラッグつまみ (左パディング内に配置、並び替え可能時のみ) */}
      {showDragHandle && (
        <span
          {...dragListeners}
          onClick={e => e.stopPropagation()}
          title="ドラッグで並び替え"
          style={{
            position: 'absolute', left: 1, top: 0, bottom: 0, width: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', color: color.textLight, fontSize: 11, lineHeight: 1,
            userSelect: 'none', touchAction: 'none',
          }}
        >⋮⋮</span>
      )}

      {/* 1. ステータス */}
      {(() => {
        const cat = statusCategory(c.status);
        const catStyle = statusCategoryStyle(cat);
        return (
          <span style={{
            borderLeft: `3px solid ${sc.color}`, paddingLeft: 8,
            display: 'inline-flex', flexDirection: 'column', width: 'fit-content',
            alignItems: 'flex-start', textAlign: colAlign('status'), lineHeight: 1.15,
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

      {/* 2. 企業名（優先度バッジ付き / クリックで詳細ページに移動） */}
      <span style={{
        textAlign: colAlign('company'),
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
        <span
          onClick={(e) => { e.stopPropagation(); onRowClick(c); }}
          title="クリックで詳細ページを開く"
          style={{
            fontWeight: font.weight.semibold, color: color.navy,
            overflow: 'hidden', textOverflow: 'ellipsis',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >{c.company}</span>
      </span>

      {/* 3. サービス */}
      <span style={{
        textAlign: colAlign('service'),
        fontSize: font.size.xs, color: color.textMid,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{c.service || '—'}</span>

      {/* 4. 段階（契約済みで始まっていない先は金色） */}
      <span style={{ textAlign: colAlign('stage'), overflow: 'hidden' }}>
        {c.stage ? (
          <span style={{
            display: 'inline-block', maxWidth: '100%',
            fontSize: font.size.xs, fontWeight: font.weight.semibold,
            padding: '1px 8px', borderRadius: 10,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            ...(c.stage === '契約済・未開始'
              ? { background: color.gold, color: color.white, border: `1px solid ${color.gold}` }
              : { background: color.white, color: color.textMid, border: `1px solid ${color.border}` }),
          }}>{c.stage}</span>
        ) : <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>}
      </span>

      {/* 5. 主担当 */}
      {primary ? (
        <span style={{
          fontSize: font.size.xs, color: color.navy, textAlign: colAlign('primaryContact'),
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
        <span style={{ fontSize: font.size.xs, color: color.textLight, textAlign: colAlign('primaryContact') }}>-</span>
      )}

      {/* 6. 最後のやり取り（30日以上は黄、60日以上は赤） */}
      <LastContactCell client={c} align={colAlign('lastContact')} />

      {/* 7. 次の一手（誰が・期限・止まっている理由） */}
      <NextActionCell client={c} align={colAlign('nextAction')} />

    </div>
  );
}
