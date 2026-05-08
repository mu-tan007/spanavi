import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import {
  fetchClientLeadLists, fetchClientLeadCompanies, fetchClientCallRecords,
  deleteClientLeadList, updateClientLeadList, fetchAllPendingRecalls,
} from '../../../lib/supabaseWrite';
import CRMLeadListImportModal from './CRMLeadListImportModal';
import CRMLeadListDetailView from './CRMLeadListDetailView';
import CRMLeadListEditModal from './CRMLeadListEditModal';
import CRMLeadPendingRecallsModal from './CRMLeadPendingRecallsModal';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function MiniIcon({ label, hint, color, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={hint}
      style={{
        width: 22, height: 20, borderRadius: 2,
        border: '1px solid ' + color,
        background: '#fff', color,
        fontSize: 10, fontWeight: 600, padding: 0,
        cursor: 'pointer', fontFamily: "'Noto Sans JP'",
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{label}</button>
  );
}

function ListsTable({ lists, onSelect, onEdit, onArchive, onUnarchive, onDelete, showingArchived }) {
  if (lists.length === 0) {
    return (
      <div style={{
        padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 12,
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
      }}>
        {showingArchived
          ? 'アーカイブ済みのリストはありません'
          : 'まだ開拓リストがありません。「+ 新規リスト」から CSV を取り込んでください。'
        }
      </div>
    );
  }

  const cols = '1.4fr 0.6fr 0.6fr 0.6fr 0.5fr 100px';

  return (
    <div style={{ border: '1px solid ' + GRAY_200, borderRadius: 4, background: '#fff' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: cols,
        padding: '8px 16px', background: NAVY,
        fontSize: 11, fontWeight: 600, color: '#fff',
      }}>
        <span>リスト名</span>
        <span>業界</span>
        <span style={{ textAlign: 'right' }}>件数</span>
        <span style={{ textAlign: 'right' }}>架電済</span>
        <span style={{ textAlign: 'right' }}>取込日</span>
        <span style={{ textAlign: 'center' }}>操作</span>
      </div>
      {lists.map((l, i) => (
        <div
          key={l.id}
          onClick={() => onSelect(l)}
          style={{
            display: 'grid', gridTemplateColumns: cols,
            padding: '10px 16px', fontSize: 12, alignItems: 'center',
            borderBottom: '1px solid ' + GRAY_200,
            background: i % 2 === 0 ? '#fff' : GRAY_50,
            cursor: 'pointer',
            opacity: l.is_archived ? 0.55 : 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
          onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : GRAY_50; }}
        >
          <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.is_archived && (
              <span style={{ fontSize: 8, fontWeight: 700, color: C.textLight, border: '1px solid ' + C.textLight, borderRadius: 2, padding: '1px 4px', marginRight: 6 }}>
                アーカイブ
              </span>
            )}
            {l.name}
          </span>
          <span style={{ color: C.textMid, fontSize: 11 }}>{l.industry || '-'}</span>
          <span style={{
            textAlign: 'right',
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            color: NAVY, fontWeight: 600,
          }}>{l.companyCount ?? '...'}</span>
          <span style={{
            textAlign: 'right',
            fontFamily: "'JetBrains Mono', monospace",
            fontVariantNumeric: 'tabular-nums',
            color: C.textMid,
          }}>
            {l.callsCount != null ? `${l.callsCount} 周` : '...'}
          </span>
          <span style={{
            textAlign: 'right',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: C.textLight,
          }}>{fmtDate(l.imported_at)}</span>
          <span style={{ textAlign: 'center', display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
            <MiniIcon
              label="編集"
              hint="リスト名・業界を編集"
              color={NAVY}
              onClick={() => onEdit(l)}
            />
            {l.is_archived ? (
              <MiniIcon
                label="戻す"
                hint="アーカイブから戻す"
                color="#16A34A"
                onClick={() => onUnarchive(l)}
              />
            ) : (
              <MiniIcon
                label="アーカイブ"
                hint="アーカイブする"
                color="#B8860B"
                onClick={() => onArchive(l)}
              />
            )}
            <MiniIcon
              label="×"
              hint="完全に削除"
              color="#DC2626"
              onClick={() => {
                if (confirm(`「${l.name}」を削除しますか？\n（リスト内の企業データ・架電履歴も全て削除されます）`)) {
                  onDelete(l);
                }
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CRMLeadGenView({ currentUser, members = [], setClientData }) {
  const queryClient = useQueryClient();
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
        return {
          ...l,
          companyCount: companies?.length || 0,
          callsCount: maxRound || 0,
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

  if (selectedListId) {
    const selected = lists.find(l => l.id === selectedListId);
    return (
      <CRMLeadListDetailView
        list={selected}
        currentUser={currentUser}
        members={members}
        setClientData={setClientData}
        onBack={() => setSelectedListId(null)}
      />
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
        padding: '14px 18px', background: '#fff', borderRadius: 4,
        border: '1px solid ' + GRAY_200, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>新規開拓ボード</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{visibleLists.length} リスト</span>
          {archivedCount > 0 && (
            <label style={{
              fontSize: 11, color: C.textMid, marginLeft: 8,
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {pendingRecalls.length > 0 && (
            <button
              onClick={() => setRecallsOpen(true)}
              style={{
                padding: '6px 12px', borderRadius: 4,
                border: '1px solid ' + (overdueRecallCount > 0 ? '#DC2626' : '#B8860B'),
                background: (overdueRecallCount > 0 ? '#DC2626' : '#B8860B') + '15',
                color: overdueRecallCount > 0 ? '#DC2626' : '#B8860B',
                fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                whiteSpace: 'nowrap',
              }}
            >
              再コール予定 {pendingRecalls.length} 件
              {overdueRecallCount > 0 && (
                <span style={{ marginLeft: 4 }}>（超過 {overdueRecallCount}）</span>
              )}
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none',
              background: NAVY, color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}
          >＋ 新規リスト（CSVインポート）</button>
        </div>
      </div>

      <ListsTable
        lists={visibleLists}
        onSelect={l => setSelectedListId(l.id)}
        onEdit={l => setEditTarget(l)}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDelete}
        showingArchived={showArchived}
      />

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
    </div>
  );
}
