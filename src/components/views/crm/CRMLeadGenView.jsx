import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Card, Badge } from '../../ui';
import {
  fetchClientLeadLists, fetchClientLeadCompanies, fetchClientCallRecords,
  deleteClientLeadList, updateClientLeadList, fetchAllPendingRecalls,
} from '../../../lib/supabaseWrite';
import { useIsMobile } from '../../../hooks/useIsMobile';
import CRMLeadListImportModal from './CRMLeadListImportModal';
import CRMLeadListDetailView from './CRMLeadListDetailView';
import CRMLeadListEditModal from './CRMLeadListEditModal';
import CRMLeadPendingRecallsModal from './CRMLeadPendingRecallsModal';
import { ProgressPill } from '../../common/TopListCard';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function MiniIcon({ label, hint, color: btnColor, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={hint}
      style={{
        width: 22, height: 20, borderRadius: radius.sm,
        border: '1px solid ' + btnColor,
        background: color.white, color: btnColor,
        fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, padding: 0,
        cursor: 'pointer', fontFamily: font.family.sans,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{label}</button>
  );
}

function ListsCardMobile({ lists, onSelect, onEdit, onArchive, onUnarchive, onDelete }) {
  return (
    <div>
      {lists.map(l => (
        <div
          key={l.id}
          onClick={() => onSelect(l)}
          style={{
            background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
            padding: '12px 14px', marginBottom: space[2], cursor: 'pointer',
            opacity: l.is_archived ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], marginBottom: space[1.5] }}>
            {l.is_archived && (
              <Badge variant="neutral" size="sm">アーカイブ</Badge>
            )}
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY }}>{l.name}</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: space[2], fontSize: font.size.xs - 1, color: color.textMid, marginBottom: space[2],
          }}>
            <div>
              <div style={{ color: color.textLight, fontSize: 9 }}>業界</div>
              <div>{l.industry || '—'}</div>
            </div>
            <div>
              <div style={{ color: color.textLight, fontSize: 9 }}>件数</div>
              <div style={{ fontFamily: font.family.mono, fontWeight: font.weight.bold, color: NAVY }}>{l.companyCount ?? '...'}</div>
            </div>
            <div>
              <div style={{ color: color.textLight, fontSize: 9 }}>架電済</div>
              <div style={{ fontFamily: font.family.mono, color: color.textMid }}>{l.callsCount != null ? `${l.callsCount}周` : '...'}</div>
            </div>
          </div>
          <div style={{
            paddingTop: space[2], borderTop: '1px dashed ' + GRAY_200,
            display: 'flex', gap: space[1], justifyContent: 'flex-end',
          }}>
            <button onClick={e => { e.stopPropagation(); onEdit(l); }} style={miniBtn(NAVY)}>編集</button>
            {l.is_archived ? (
              <button onClick={e => { e.stopPropagation(); onUnarchive(l); }} style={miniBtn(color.success)}>戻す</button>
            ) : (
              <button onClick={e => { e.stopPropagation(); onArchive(l); }} style={miniBtn('#B8860B')}>アーカイブ</button>
            )}
            <button onClick={e => {
              e.stopPropagation();
              if (confirm(`「${l.name}」を削除しますか？`)) onDelete(l);
            }} style={miniBtn(color.danger)}>削除</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const miniBtn = (btnColor) => ({
  padding: '4px 10px', borderRadius: radius.sm,
  border: '1px solid ' + btnColor, background: color.white,
  color: btnColor, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
  cursor: 'pointer', fontFamily: font.family.sans,
});

// Lists ページ (LISTVIEW_COLS) と同じ流儀のカラム定義
const LEADGEN_COLS = [
  { key: 'name',     label: 'リスト名',   width: 320, align: 'left'   },
  { key: 'industry', label: '業種',       width: 160, align: 'left'   },
  { key: 'count',    label: '件数',       width: 80,  align: 'right'  },
  { key: 'progress', label: '架電進捗率', width: 110, align: 'center' },
  { key: 'rounds',   label: '周回数',     width: 90,  align: 'right'  },
  { key: 'imported', label: '取込日',     width: 100, align: 'right'  },
  { key: 'actions',  label: '',           width: 130, align: 'center' },
];

function ListsTable({ lists, onSelect, onEdit, onArchive, onUnarchive, onDelete, showingArchived }) {
  if (lists.length === 0) {
    return (
      <div style={{
        padding: '40px 0', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
      }}>
        {showingArchived
          ? 'アーカイブ済みのリストはありません'
          : 'まだ開拓リストがありません。「+ 新規リスト」から CSV を取り込んでください。'
        }
      </div>
    );
  }

  const gridTemplate = LEADGEN_COLS.map(c => `${c.width}px`).join(' ');
  const minWidth = LEADGEN_COLS.reduce((s, c) => s + c.width, 0);

  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`,
      borderRadius: radius.md, overflowX: 'auto', overflowY: 'hidden',
    }}>
      <div style={{ minWidth }}>
        {/* ヘッダー */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          padding: '8px 16px', background: color.navy,
          fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white,
        }}>
          {LEADGEN_COLS.map((c, i) => (
            <span key={i} style={{ textAlign: c.align, minWidth: 0, userSelect: 'none' }}>
              {c.label}
            </span>
          ))}
        </div>
        {/* 行 */}
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {lists.map((l, i) => {
            const total = l.companyCount ?? 0;
            const called = l.calledCount ?? 0;
            const pct = total > 0 ? Math.round((called / total) * 100) : 0;
            return (
              <div
                key={l.id}
                onClick={() => onSelect(l)}
                style={{
                  display: 'grid', gridTemplateColumns: gridTemplate,
                  padding: '10px 16px',
                  borderBottom: `1px solid ${color.offWhite}`,
                  fontSize: font.size.sm, alignItems: 'center',
                  transition: 'background 0.15s',
                  opacity: l.is_archived ? 0.55 : 1,
                  animation: `fadeIn 0.2s ease ${i * 0.015}s both`,
                  borderLeft: '2px solid transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; e.currentTarget.style.borderLeft = `2px solid ${color.navy}`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeft = '2px solid transparent'; }}
              >
                {/* リスト名 */}
                <span style={{
                  fontWeight: font.weight.medium, color: color.navy,
                  paddingRight: space[2], minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textAlign: LEADGEN_COLS[0].align,
                }}>
                  {l.is_archived && (
                    <span style={{ marginRight: 6, display: 'inline-block' }}>
                      <Badge variant="neutral" size="sm">アーカイブ</Badge>
                    </span>
                  )}
                  {l.name}
                </span>
                {/* 業種 */}
                <span style={{
                  color: color.textMid,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textAlign: LEADGEN_COLS[1].align,
                }}>{l.industry || '—'}</span>
                {/* 件数 */}
                <span style={{
                  fontFamily: font.family.mono, fontSize: font.size.xs,
                  color: color.textMid,
                  textAlign: LEADGEN_COLS[2].align,
                }}>{l.companyCount ?? '...'}</span>
                {/* 架電進捗率 (ProgressPill) */}
                <span style={{
                  display: 'flex',
                  justifyContent: LEADGEN_COLS[3].align === 'right' ? 'flex-end'
                    : LEADGEN_COLS[3].align === 'center' ? 'center' : 'flex-start',
                }}>
                  {total > 0 ? <ProgressPill pct={pct} /> : <span style={{ fontSize: 10, color: color.textLight }}>—</span>}
                </span>
                {/* 周回数 */}
                <span style={{
                  fontFamily: font.family.mono, fontSize: font.size.xs,
                  color: color.textMid,
                  textAlign: LEADGEN_COLS[4].align,
                }}>{l.callsCount != null ? `${l.callsCount}周` : '...'}</span>
                {/* 取込日 */}
                <span style={{
                  fontFamily: font.family.mono, fontSize: font.size.xs - 1,
                  color: color.textLight,
                  textAlign: LEADGEN_COLS[5].align,
                }}>{fmtDate(l.imported_at)}</span>
                {/* 操作 */}
                <span style={{
                  display: 'inline-flex', gap: space[1],
                  justifyContent: 'center',
                }}>
                  <MiniIcon label="編集" hint="リスト名・業界を編集" color={color.navy} onClick={() => onEdit(l)} />
                  {l.is_archived ? (
                    <MiniIcon label="戻す" hint="アーカイブから戻す" color={color.success} onClick={() => onUnarchive(l)} />
                  ) : (
                    <MiniIcon label="格納" hint="アーカイブする" color={color.warn} onClick={() => onArchive(l)} />
                  )}
                  <MiniIcon label="×" hint="完全に削除" color={color.danger} onClick={() => {
                    if (confirm(`「${l.name}」を削除しますか？\n（リスト内の企業データ・架電履歴も全て削除されます）`)) {
                      onDelete(l);
                    }
                  }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CRMLeadGenView({ currentUser, members = [], setClientData }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selectedListId, setSelectedListId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [recallsOpen, setRecallsOpen] = useState(false);

  // 全リスト横断の再コール予定件数（バッジ用）
  const { data: pendingRecalls = [] } = useQuery({
    queryKey: ['crm-lead-pending-recalls-count'],
    queryFn: async () => {
      const { data } = await fetchAllPendingRecalls();
      return data;
    },
    staleTime: 60_000,
  });
  const overdueRecallCount = pendingRecalls.filter(r => {
    if (!r.recall_at_raw) return false;
    const t = new Date(r.recall_at_raw).getTime();
    return !Number.isNaN(t) && t < Date.now();
  }).length;

  const { data: lists = [] } = useQuery({
    queryKey: ['crm-lead-lists'],
    queryFn: async () => {
      const { data } = await fetchClientLeadLists();
      const enriched = await Promise.all((data || []).map(async (l) => {
        const [{ data: companies }, { data: records }] = await Promise.all([
          fetchClientLeadCompanies(l.id),
          fetchClientCallRecords(l.id),
        ]);
        const maxRound = (records || []).reduce((m, r) => Math.max(m, r.round || 0), 0);
        const calledIds = new Set((records || []).map(r => r.lead_company_id));
        return {
          ...l,
          companyCount: companies?.length || 0,
          callsCount: maxRound || 0,
          calledCount: calledIds.size,
        };
      }));
      return enriched;
    },
    staleTime: 60_000,
  });

  // showArchived の値で表示するリストを切替
  const visibleLists = showArchived ? lists : lists.filter(l => !l.is_archived);
  const archivedCount = lists.filter(l => l.is_archived).length;

  const handleDelete = async (list) => {
    await deleteClientLeadList(list.id);
    queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] });
  };

  const handleArchive = async (list) => {
    await updateClientLeadList(list.id, { isArchived: true });
    queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] });
  };

  const handleUnarchive = async (list) => {
    await updateClientLeadList(list.id, { isArchived: false });
    queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] });
  };

  const selected = selectedListId ? lists.find(l => l.id === selectedListId) : null;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4],
        padding: '14px 18px', background: color.white, borderRadius: radius.md,
        border: '1px solid ' + GRAY_200, flexWrap: 'wrap', gap: space[2],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2.5] }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY }}>新規開拓ボード</span>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{visibleLists.length} リスト</span>
          {archivedCount > 0 && (
            <label style={{
              fontSize: font.size.xs, color: color.textMid, marginLeft: space[2],
              display: 'inline-flex', alignItems: 'center', gap: space[1], cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
              />
              アーカイブ済も表示（{archivedCount}）
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center' }}>
          {pendingRecalls.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecallsOpen(true)}
              style={{
                border: '1px solid ' + (overdueRecallCount > 0 ? color.danger : '#B8860B'),
                background: alpha(overdueRecallCount > 0 ? color.danger : '#B8860B', 0.08),
                color: overdueRecallCount > 0 ? color.danger : '#B8860B',
                whiteSpace: 'nowrap',
              }}
            >
              再コール予定 {pendingRecalls.length} 件
              {overdueRecallCount > 0 && (
                <span style={{ marginLeft: 4 }}>（超過 {overdueRecallCount}）</span>
              )}
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={() => setImportOpen(true)}
            style={{ background: NAVY }}
          >＋ 新規リスト（CSVインポート）</Button>
        </div>
      </div>

      {visibleLists.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: color.textLight, fontSize: font.size.sm,
          background: color.white, border: '1px solid ' + GRAY_200, borderRadius: radius.md,
        }}>
          {showArchived
            ? 'アーカイブ済みのリストはありません'
            : 'まだ開拓リストがありません。「+ 新規リスト」から CSV を取り込んでください。'
          }
        </div>
      ) : isMobile ? (
        <ListsCardMobile
          lists={visibleLists}
          onSelect={l => setSelectedListId(l.id)}
          onEdit={l => setEditTarget(l)}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onDelete={handleDelete}
        />
      ) : (
        <ListsTable
          lists={visibleLists}
          onSelect={l => setSelectedListId(l.id)}
          onEdit={l => setEditTarget(l)}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onDelete={handleDelete}
          showingArchived={showArchived}
        />
      )}

      {importOpen && (
        <CRMLeadListImportModal
          currentUser={currentUser}
          onClose={() => setImportOpen(false)}
          onImported={() => { queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] }); }}
        />
      )}

      {editTarget && (
        <CRMLeadListEditModal
          list={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] }); }}
        />
      )}

      {recallsOpen && (
        <CRMLeadPendingRecallsModal onClose={() => setRecallsOpen(false)} />
      )}

      {/* リスト詳細モーダル (Lists ページの DetailModal と同じパターン) */}
      {selected && (
        <div
          onClick={() => setSelectedListId(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: alpha('#0A1929', 0.6), backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, border: `1px solid ${color.border}`,
              borderRadius: isMobile ? 0 : radius.md,
              width: isMobile ? '100vw' : '92%', maxWidth: isMobile ? 'none' : 1100,
              height: isMobile ? '100vh' : undefined, maxHeight: isMobile ? '100vh' : '90vh',
              overflowY: 'auto', padding: isMobile ? space[4] : space[5],
              boxShadow: shadow.xl, position: 'relative',
            }}
          >
            <button
              onClick={() => setSelectedListId(null)}
              style={{
                position: 'absolute', top: space[3], right: space[3], zIndex: 1,
                width: 32, height: 32, borderRadius: radius.md, background: color.offWhite,
                border: `1px solid ${color.border}`, color: color.gray500, cursor: 'pointer',
                fontSize: font.size.lg, lineHeight: 1,
              }}
              title="閉じる"
            >✕</button>
            <CRMLeadListDetailView
              list={selected}
              currentUser={currentUser}
              members={members}
              setClientData={setClientData}
              onBack={() => setSelectedListId(null)}
              inModal
            />
          </div>
        </div>
      )}
    </div>
  );
}
