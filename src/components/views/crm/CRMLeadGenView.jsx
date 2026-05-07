import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from '../../../constants/colors';
import {
  fetchClientLeadLists, fetchClientLeadCompanies, fetchClientCallRecords,
  deleteClientLeadList,
} from '../../../lib/supabaseWrite';
import CRMLeadListImportModal from './CRMLeadListImportModal';
import CRMLeadListDetailView from './CRMLeadListDetailView';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function ListsTable({ lists, onSelect, onDelete }) {
  if (lists.length === 0) {
    return (
      <div style={{
        padding: '40px 0', textAlign: 'center', color: C.textLight, fontSize: 12,
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
      }}>
        まだ開拓リストがありません。「+ 新規リスト」から CSV を取り込んでください。
      </div>
    );
  }

  const cols = '1.4fr 0.6fr 0.6fr 0.6fr 0.5fr 36px';

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
        <span></span>
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
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
          onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : GRAY_50; }}
        >
          <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            {l.callsCount != null
              ? `${l.callsCount} 周`
              : '...'}
          </span>
          <span style={{
            textAlign: 'right',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: C.textLight,
          }}>{fmtDate(l.imported_at)}</span>
          <span style={{ textAlign: 'center' }}>
            <button
              onClick={e => {
                e.stopPropagation();
                if (confirm(`「${l.name}」を削除しますか？\n（リスト内の企業データ・架電履歴も全て削除されます）`)) {
                  onDelete(l);
                }
              }}
              style={{
                background: 'none', border: 'none',
                color: C.textLight, fontSize: 14,
                cursor: 'pointer', padding: 2,
              }}
              title="削除"
            >×</button>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CRMLeadGenView({ currentUser, members = [] }) {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState(null);

  const { data: lists = [] } = useQuery({
    queryKey: ['crm-lead-lists'],
    queryFn: async () => {
      const { data } = await fetchClientLeadLists();
      // 各リストに companyCount / callsCount を後付け（軽量版: 全件まとめて取って集計）
      // ただし大量リスト時は別途RPC化を検討
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

  const handleDelete = async (list) => {
    await deleteClientLeadList(list.id);
    queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] });
  };

  if (selectedListId) {
    const selected = lists.find(l => l.id === selectedListId);
    return (
      <CRMLeadListDetailView
        list={selected}
        currentUser={currentUser}
        members={members}
        onBack={() => setSelectedListId(null)}
      />
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
        padding: '14px 18px', background: '#fff', borderRadius: 4,
        border: '1px solid ' + GRAY_200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>新規開拓ボード</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{lists.length} リスト</span>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          style={{
            padding: '8px 16px', borderRadius: 4, border: 'none',
            background: NAVY, color: '#fff', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}
        >＋ 新規リスト（CSVインポート）</button>
      </div>

      <ListsTable
        lists={lists}
        onSelect={l => setSelectedListId(l.id)}
        onDelete={handleDelete}
      />

      {importOpen && (
        <CRMLeadListImportModal
          currentUser={currentUser}
          onClose={() => setImportOpen(false)}
          onImported={() => { queryClient.invalidateQueries({ queryKey: ['crm-lead-lists'] }); }}
        />
      )}
    </div>
  );
}
