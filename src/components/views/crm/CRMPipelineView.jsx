import { useState, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { updateClient } from '../../../lib/supabaseWrite';
import { useIsMobile } from '../../../hooks/useIsMobile';
import {
  NAVY, GRAY_200, GRAY_50, GOLD,
  STATUS_LIST, statusStyle,
  priorityScore, priorityRank,
} from './utils';

// status_changed_at 以降の経過日数（ない場合は null）
function daysInStatus(client) {
  if (!client.statusChangedAt) return null;
  const t = new Date(client.statusChangedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

// ファネルに表示するメイン段階（左→右）
const FUNNEL_STAGES = ['面談予定', '準備中', '支援中'];
const SECONDARY_STAGES = ['保留', '中期フォロー', '停止中'];

function StatusChangeMenu({ client, onClose, onChange }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', zIndex: 20002,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
          width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 13 }}>
          ステータス変更
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 400, marginTop: 2 }}>
            {client.company}
          </div>
        </div>
        <div style={{ padding: 8 }}>
          {STATUS_LIST.map(st => {
            const sc = statusStyle(st);
            const isCurrent = st === client.status;
            return (
              <button
                key={st}
                onClick={() => { if (!isCurrent) onChange(st); }}
                disabled={isCurrent}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: 3,
                  border: '1px solid ' + (isCurrent ? sc.color : GRAY_200),
                  background: isCurrent ? sc.bg : '#fff',
                  color: isCurrent ? sc.color : C.textDark,
                  fontSize: 12,
                  fontWeight: isCurrent ? 700 : 500,
                  cursor: isCurrent ? 'default' : 'pointer',
                  fontFamily: "'Noto Sans JP'",
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }}></span>
                {st}
                {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 9 }}>現在</span>}
              </button>
            );
          })}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid ' + GRAY_200, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px', borderRadius: 3,
              border: '1px solid ' + NAVY, background: '#fff',
              color: NAVY, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Noto Sans JP'",
            }}
          >閉じる</button>
        </div>
      </div>
    </div>
  );
}

function PipelineCard({
  client,
  contactsByClient,
  monthAppoCountByClient,
  monthTargetByClient,
  maxMonthTarget,
  onClickCard,
  onChangeStatus,
}) {
  const days = daysInStatus(client);
  const contactList = contactsByClient[client._supaId] || [];
  const primary = contactList.find(ct => ct.isPrimary) || contactList[0];

  const score = priorityScore(client, {
    lastTouchAt: client.statusChangedAt,
    monthAppoCount: monthAppoCountByClient[client._supaId] || 0,
    monthTarget: monthTargetByClient[client._supaId] || 0,
    maxMonthTarget,
  });
  const rank = priorityRank(score);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid ' + GRAY_200,
        borderRadius: 4,
        padding: '8px 10px',
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'box-shadow 0.12s, transform 0.12s',
        position: 'relative',
      }}
      onClick={() => onClickCard(client)}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          title={`優先度 ${score}`}
          style={{
            fontSize: 8, fontWeight: 700,
            color: rank.color, border: '1px solid ' + rank.color,
            borderRadius: 2, padding: '1px 4px',
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            minWidth: 22, textAlign: 'center', flexShrink: 0,
          }}
        >{score}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: NAVY,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {client.company}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.textLight }}>
        <span>
          {primary ? primary.name : '担当未設定'}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: 'tabular-nums',
          color: days != null && days >= 30 ? GOLD : C.textLight,
          fontWeight: days != null && days >= 30 ? 700 : 400,
        }}>
          {days == null ? '—' : `${days}日`}
        </span>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onChangeStatus(client); }}
        title="ステータス変更"
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 18, height: 18, borderRadius: 2,
          border: '1px solid ' + GRAY_200, background: '#fff',
          color: C.textLight, fontSize: 10, lineHeight: 1,
          cursor: 'pointer', padding: 0,
        }}
      >⇄</button>
    </div>
  );
}

function FunnelCard({ stage, count, avgDays, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 100,
      padding: '10px 12px',
      background: '#fff',
      border: '1px solid ' + GRAY_200,
      borderRadius: 4,
      borderTop: '3px solid ' + color,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4 }}>{stage}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color,
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
        <span style={{ fontSize: 9, color: C.textLight, fontWeight: 400 }}>社</span>
      </div>
      <div style={{
        fontSize: 9, color: C.textLight, marginTop: 4,
        fontFamily: "'JetBrains Mono', monospace",
        fontVariantNumeric: 'tabular-nums',
      }}>
        平均滞留 {avgDays != null ? avgDays + '日' : '—'}
      </div>
    </div>
  );
}

export default function CRMPipelineView({
  clientData = [],
  setClientData,
  contactsByClient = {},
  monthAppoCountByClient = {},
  monthTargetByClient = {},
  maxMonthTarget = 0,
  onCardClick,
}) {
  const [statusMenuFor, setStatusMenuFor] = useState(null);
  const isMobile = useIsMobile();
  const [mobileFocusStatus, setMobileFocusStatus] = useState('面談予定');

  // ステータスごとにグループ化
  const groupByStatus = useMemo(() => {
    const map = {};
    STATUS_LIST.forEach(st => { map[st] = []; });
    clientData.forEach(c => {
      if (map[c.status]) map[c.status].push(c);
    });
    // 各グループ内で優先度スコア降順
    Object.keys(map).forEach(st => {
      map[st].sort((a, b) => {
        const sa = priorityScore(a, {
          lastTouchAt: a.statusChangedAt,
          monthAppoCount: monthAppoCountByClient[a._supaId] || 0,
          monthTarget: monthTargetByClient[a._supaId] || 0,
          maxMonthTarget,
        });
        const sb = priorityScore(b, {
          lastTouchAt: b.statusChangedAt,
          monthAppoCount: monthAppoCountByClient[b._supaId] || 0,
          monthTarget: monthTargetByClient[b._supaId] || 0,
          maxMonthTarget,
        });
        return sb - sa;
      });
    });
    return map;
  }, [clientData, monthAppoCountByClient, monthTargetByClient, maxMonthTarget]);

  // 各ステータスの平均滞留日数
  const avgDaysByStatus = useMemo(() => {
    const result = {};
    STATUS_LIST.forEach(st => {
      const list = groupByStatus[st] || [];
      const dayValues = list.map(daysInStatus).filter(v => v != null);
      result[st] = dayValues.length > 0
        ? Math.round(dayValues.reduce((a, b) => a + b, 0) / dayValues.length)
        : null;
    });
    return result;
  }, [groupByStatus]);

  const handleStatusChange = async (client, newStatus) => {
    if (!client._supaId) return;
    const updated = {
      ...client,
      status: newStatus,
      statusChangedAt: new Date().toISOString(),
    };
    const error = await updateClient(client._supaId, updated);
    if (error) {
      alert('ステータス変更に失敗しました: ' + (error.message || ''));
      return;
    }
    if (setClientData) {
      setClientData(prev => prev.map(x =>
        x._supaId === client._supaId
          ? { ...x, status: newStatus, statusChangedAt: updated.statusChangedAt }
          : x
      ));
    }
    setStatusMenuFor(null);
  };

  return (
    <div>
      {/* ファネル: メイン3段階（モバイルは縦積み） */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        {FUNNEL_STAGES.map(st => {
          const sc = statusStyle(st);
          return (
            <FunnelCard
              key={st}
              stage={st}
              count={groupByStatus[st]?.length || 0}
              avgDays={avgDaysByStatus[st]}
              color={sc.color}
            />
          );
        })}
      </div>

      {/* 副次集計: 保留/中期フォロー/停止中（モバイルも横並び維持、小さく） */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SECONDARY_STAGES.map(st => {
          const sc = statusStyle(st);
          const list = groupByStatus[st] || [];
          return (
            <div key={st} style={{
              flex: 1, padding: '8px 12px',
              background: '#FAFAFA', border: '1px solid ' + GRAY_200, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: sc.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }}></span>
                {st}
              </span>
              <span style={{
                fontSize: 14, fontWeight: 700, color: sc.color,
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
              }}>{list.length}</span>
            </div>
          );
        })}
      </div>

      {/* モバイル時のステータス選択タブ */}
      {isMobile && (
        <div style={{
          display: 'flex', gap: 4, marginBottom: 12,
          overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4,
        }}>
          {STATUS_LIST.map(st => {
            const sc = statusStyle(st);
            const active = mobileFocusStatus === st;
            const count = (groupByStatus[st] || []).length;
            return (
              <button
                key={st}
                onClick={() => setMobileFocusStatus(st)}
                style={{
                  flexShrink: 0,
                  padding: '6px 10px', borderRadius: 4,
                  border: '1px solid ' + (active ? sc.color : GRAY_200),
                  background: active ? sc.bg : '#fff',
                  color: active ? sc.color : C.textMid,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }}></span>
                {st} <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* カンバン: PCは全ステータス横並び、モバイルは選択ステータスのみ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `repeat(${STATUS_LIST.length}, 1fr)`,
        gap: 8,
        overflowX: 'auto',
      }}>
        {(isMobile ? [mobileFocusStatus] : STATUS_LIST).map(st => {
          const sc = statusStyle(st);
          const list = groupByStatus[st] || [];
          return (
            <div key={st} style={{
              minWidth: 200,
              background: GRAY_50,
              border: '1px solid ' + GRAY_200,
              borderRadius: 4,
              padding: 8,
              maxHeight: 'calc(100vh - 350px)',
              overflowY: 'auto',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8, paddingBottom: 6,
                borderBottom: '2px solid ' + sc.color,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: sc.color,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }}></span>
                  {st}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: sc.color,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: 'tabular-nums',
                }}>{list.length}</span>
              </div>

              {list.length === 0 ? (
                <div style={{ fontSize: 10, color: C.textLight, padding: '12px 0', textAlign: 'center' }}>
                  該当なし
                </div>
              ) : (
                list.map(c => (
                  <PipelineCard
                    key={c._supaId || c.no}
                    client={c}
                    contactsByClient={contactsByClient}
                    monthAppoCountByClient={monthAppoCountByClient}
                    monthTargetByClient={monthTargetByClient}
                    maxMonthTarget={maxMonthTarget}
                    onClickCard={onCardClick}
                    onChangeStatus={cl => setStatusMenuFor(cl)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* ステータス変更メニュー */}
      {statusMenuFor && (
        <StatusChangeMenu
          client={statusMenuFor}
          onClose={() => setStatusMenuFor(null)}
          onChange={newStatus => handleStatusChange(statusMenuFor, newStatus)}
        />
      )}
    </div>
  );
}
