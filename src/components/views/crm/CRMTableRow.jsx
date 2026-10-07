import { useState, useEffect, useRef } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  statusStyle, statusCategory, statusCategoryStyle,
  priorityScore, priorityRank,
} from './utils';
import { updateClient } from '../../../lib/supabaseWrite';
import { daysSince, ageClass } from '../../../utils/crmOverview';

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
  ruleCount = 0,
  today,
  onRowHover,
  onOpenRules,
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
        padding: '10px 16px', fontSize: font.size.sm, alignItems: 'center', cursor: 'pointer',
        borderBottom: `1px solid ${color.border}`,
        background: isDragging ? color.cream : altBg,
        opacity: isDragging ? 0.5 : 1,
        transition: 'background 0.15s',
        ...dragStyle,
      }}
      data-client-id={c._supaId}
      onClick={() => onRowClick(c)}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = '#F5F8FC'; onRowHover?.(c._supaId); }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = altBg; onRowHover?.(null); }}
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

      {/* 1. 企業（左の色はステータス）・サービス・主担当 */}
      <span style={{ borderLeft: `3px solid ${sc.color}`, paddingLeft: 8, minWidth: 0, lineHeight: 1.4 }} title={`${c.status}・優先度スコア ${score}`}>
        <span style={{ display: 'block', fontWeight: font.weight.bold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company}</span>
        <span style={{ display: 'block', fontSize: 11, color: color.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[c.service, primary ? `${primary.name} 様` : '', c.status !== '支援中' ? c.status : ''].filter(Boolean).join(' ・ ') || '—'}
        </span>
      </span>

      {/* 2. 最後から（14日から黄土、30日から赤。記録なしは赤） */}
      {(() => {
        const d = daysSince(c.lastContactAt, today || new Date().toISOString().slice(0, 10));
        return (
          <span className={`co-age ${ageClass(d)}`}>
            <b>{d == null ? '記録なし' : d === 0 ? '今日' : <>{d}<small>日</small></>}</b>
            <span className="co-bar"><i style={{ width: `${d == null ? 100 : Math.min(d / 120 * 100, 100)}%` }} /></span>
          </span>
        );
      })()}

      {/* 3. 次の一手（誰が・期限・止まっている理由） */}
      <NextActionCell client={c} align={colAlign('nextAction')} />

      {/* 4. 最後のやり取り */}
      <LastContactCell client={c} align={colAlign('lastContact')} />

      {/* 5. 段階（契約済みで始まっていない先は金色） */}
      <span style={{ textAlign: 'center', overflow: 'hidden' }}>
        {c.stage ? (
          <span style={{
            display: 'inline-block', maxWidth: '100%',
            fontSize: font.size.xs, fontWeight: font.weight.semibold,
            padding: '1px 8px', borderRadius: 10,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            ...(c.stage === '契約済・未開始'
              ? { background: color.gold, color: color.white, border: `1px solid ${color.gold}` }
              : c.stage === '一時停止（先方都合）'
                ? { background: color.warnSoft, color: color.warn, border: `1px solid ${color.warnSoft}` }
                : { background: alpha(color.navyLight, 0.08), color: color.navyLight, border: `1px solid ${alpha(color.navyLight, 0.15)}` }),
          }}>{c.stage}</span>
        ) : <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>}
      </span>

      {/* 6. 聞くこと・条件（押すと詳細のそのタブを開く） */}
      <span style={{ textAlign: 'center' }}>
        <span onClick={(e) => { e.stopPropagation(); onOpenRules?.(c); }}
          style={{ fontSize: 11, cursor: 'pointer', color: ruleCount ? color.navyLight : color.textLight, fontWeight: ruleCount ? font.weight.semibold : font.weight.normal, whiteSpace: 'nowrap' }}>
          {ruleCount ? `${ruleCount}項目` : '未設定'}
        </span>
      </span>

    </div>
  );
}
