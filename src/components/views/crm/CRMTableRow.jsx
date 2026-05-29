import { useState, useMemo, useEffect, useRef } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, alpha } from '../../../constants/design';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  statusStyle, statusCategory, statusCategoryStyle,
  priorityScore, priorityRank,
} from './utils';
import { updateClient } from '../../../lib/supabaseWrite';

// 報酬体系 1件分のチップ (ホバーで段階別 tier 詳細をツールチップ表示)
function RewardChip({ rw, rewardMaster }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const tiers = useMemo(() => {
    return (rewardMaster || [])
      .filter(r => r.id === rw.rewardType)
      .sort((a, b) => (a._tierSort || 0) - (b._tierSort || 0));
  }, [rewardMaster, rw.rewardType]);
  const head = tiers[0];
  const isFixed = head?.calc_type === 'fixed_per_appo' || head?.basis === '-';

  const fmtPrice = (price) => {
    const p = head?.tax === '税別' ? Math.round(price * 1.1) : price;
    return '¥' + Number(p || 0).toLocaleString();
  };

  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: rect.left, y: rect.bottom + 4 });
    setHover(true);
  };

  return (
    <span style={{ whiteSpace: 'nowrap' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHover(false)}>
      <span style={{ color: color.textLight, fontSize: 10 }}>{rw.categoryName}/{rw.engName}: </span>
      <span style={{ color: color.navy, fontWeight: font.weight.semibold, borderBottom: `1px dotted ${color.textLight}` }}>
        {rw.rewardName}
      </span>
      {hover && tiers.length > 0 && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed', top: pos.y, left: pos.x, zIndex: 99999,
          padding: '8px 10px',
          background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.md, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          minWidth: 260, fontSize: font.size.xs, color: color.textDark,
          fontFamily: font.family.sans, fontWeight: font.weight.normal,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${color.border}` }}>
            {rw.rewardName}
            <span style={{ marginLeft: 6, fontSize: 10, color: color.textMid, fontWeight: font.weight.normal }}>
              ({head?.basis || '—'}{head?.tax ? ` / ${head.tax}` : ''})
            </span>
          </div>
          {isFixed ? (
            <div style={{ fontFamily: font.family.mono }}>
              アポ1件あたり {fmtPrice(head.price)}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? `1px dashed ${color.borderLight}` : 'none' }}>
                    <td style={{ padding: '3px 4px', color: color.textMid }}>
                      {t.memo || `${(t.lo || 0).toLocaleString()}〜${t.hi >= 999999999999 ? '上限なし' : (t.hi || 0).toLocaleString()}`}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: font.family.mono, color: color.textDark, fontWeight: font.weight.semibold }}>
                      {fmtPrice(t.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </span>
  );
}

// 最終接点 (client_meetings.meeting_at) を「M/D」or「N日前」で表示
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

// メモのインライン編集 (clients.notes)
function MemoCell({ client, setClientData, align }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(client.memo || '');
  const taRef = useRef(null);
  useEffect(() => { setVal(client.memo || ''); }, [client.memo]);
  useEffect(() => {
    if (editing && taRef.current) { taRef.current.focus(); taRef.current.select(); }
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    if ((val || '') === (client.memo || '')) return;
    if (!client._supaId) return;
    const updated = { ...client, memo: val };
    const error = await updateClient(client._supaId, updated);
    if (error) { alert('保存失敗: ' + (error.message || '')); return; }
    if (setClientData) {
      setClientData(prev => prev.map(x => x._supaId === client._supaId ? updated : x));
    }
  };

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onClick={e => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { setVal(client.memo || ''); setEditing(false); }
        }}
        rows={2}
        style={{
          width: '100%', padding: '4px 6px',
          border: `1px solid ${color.navy}`, borderRadius: radius.sm,
          fontSize: font.size.xs, fontFamily: font.family.sans, color: color.textDark,
          resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.4,
          background: color.white,
        }}
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title="クリックして編集"
      style={{
        textAlign: align, fontSize: font.size.xs, color: color.textMid,
        display: 'inline-block', width: '100%', maxHeight: 36, overflow: 'hidden',
        whiteSpace: 'pre-wrap', lineHeight: 1.35, cursor: 'pointer',
        padding: '2px 4px', borderRadius: radius.sm,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = GRAY_50; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {client.memo ? client.memo : <span style={{ color: color.textLight }}>—</span>}
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
  listCount = 0,
  contactsByClient,
  monthAppoCountByClient = {},
  monthTargetByClient = {},
  maxMonthTarget = 0,
  rewards = [],
  rewardMaster = [],
  onRowClick,
}) {
  const c = client;
  const sc = statusStyle(c.status);
  const altBg = rowIndex % 2 === 0 ? color.white : color.gray50;
  const contactList = contactsByClient[c._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

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

  // 優先度スコア
  const score = priorityScore(c, {
    lastTouchAt: lastTouchByClient[c._supaId],
    monthAppoCount,
    monthTarget,
    maxMonthTarget,
  });
  const rank = priorityRank(score);

  const lastMeeting = formatLastMeeting(lastMeetingAt);

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
      {/* 1. ステータス */}
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

      {/* 3. 商材 */}
      <span style={{
        textAlign: crmCols[2]?.align,
        fontSize: font.size.xs, color: color.textMid,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{c.industry || '-'}</span>

      {/* 4. 主担当 */}
      {primary ? (
        <span style={{
          fontSize: font.size.xs, color: color.navy, textAlign: crmCols[3]?.align,
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
        <span style={{ fontSize: font.size.xs, color: color.textLight, textAlign: crmCols[3]?.align }}>-</span>
      )}

      {/* 5. 報酬体系 */}
      <span style={{
        textAlign: crmCols[4]?.align,
        fontSize: font.size.xs, color: color.textMid,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {rewards.length === 0 ? (
          <span style={{ color: color.textLight }}>—</span>
        ) : (
          rewards.map((rw, i) => (
            <RewardChip key={i} rw={rw} rewardMaster={rewardMaster} />
          ))
        )}
      </span>

      {/* 6. リスト数 (アクティブのみ) */}
      <span style={{
        textAlign: crmCols[5]?.align,
        fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
        fontSize: font.size.xs,
        color: listCount > 0 ? color.textDark : color.textLight,
        fontWeight: listCount > 0 ? font.weight.semibold : font.weight.normal,
      }}>{listCount > 0 ? listCount : '—'}</span>

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

      {/* 8. 最終接点 (client_meetings 由来) */}
      <span style={{
        textAlign: crmCols[7]?.align,
        fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
        fontSize: font.size.xs, color: lastMeeting.color,
      }}>{lastMeeting.label}</span>

      {/* 9. メモ (インライン編集可) */}
      <MemoCell client={c} setClientData={setClientData} align={crmCols[8]?.align} />
    </div>
  );
}
