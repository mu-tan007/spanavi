import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { color, space, radius, font } from '../../../constants/design';
import { Button, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { PanelHeader, KPI } from './smartQueueHelpers';
import { useCallQueue } from './useCallQueue';

const PAGE_SIZE = 200;

// クライアント側ページネーション（200件/ページ）
function usePagedRows(rows) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows]);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return { page, setPage, total, totalPages, pageRows };
}

function Pagination({ page, totalPages, total, loading, onChange }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
      <Button size="sm" variant="outline" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0 || loading}>前へ</Button>
      <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>{page + 1} / {totalPages}</span>
      <Button size="sm" variant="outline" onClick={() => onChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || loading}>次へ</Button>
      <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
        {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} / {total.toLocaleString()} 件
      </span>
    </div>
  );
}

// クライアント側で商材・タイプによる post-filter
//   ダッシュボード移管RPCはこれらの引数を持たないため、結果をJSで絞る。
//   各 RPC 結果に list_id を含むため、callListData から engagement_id を引いて判定する。
function useEngFilter(rows, { categoryId, engIds, allEngagements, callListData }) {
  return useMemo(() => {
    if (!categoryId && (!engIds || engIds.length === 0)) return rows;
    // list_id → engagement_id マップ
    const listEngMap = new Map();
    (callListData || []).forEach(l => {
      const id = l._supaId || l.id;
      if (id) listEngMap.set(id, l.engagement_id || l.engagementId);
    });
    // 商材で絞る場合: 対象 engagement の集合
    const matchedEngIds = categoryId
      ? new Set((allEngagements || []).filter(e => e.category_id === categoryId).map(e => e.id))
      : null;
    return rows.filter(r => {
      const eid = listEngMap.get(r.list_id);
      if (!eid) return false;
      if (matchedEngIds && !matchedEngIds.has(eid)) return false;
      if (engIds && engIds.length > 0 && !engIds.includes(eid)) return false;
      return true;
    });
  }, [rows, categoryId, engIds, allEngagements, callListData]);
}

// ダッシュボードから移管した3パネル: 受付再コール超過 / キーマン再コール超過 / 再アプローチ候補
// 既存 RPC をそのまま流用

// rows をキューとして渡し、index から開始 → 前後矢印 / 自動進行で連続架電
function useQueueOpener(setCallFlowScreen, callListData, rows) {
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  return (row) => {
    const idx = (rows || []).findIndex(r => r.item_id === row.item_id);
    openQueue(rows, idx >= 0 ? idx : 0);
  };
}

function useRpc(rpcName, args) {
  const { data, isPending } = useQuery({
    queryKey: [rpcName, args],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpcName, args);
      if (error) {
        console.warn(`[${rpcName}] failed:`, error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    },
  });
  return { rows: data || [], loading: isPending };
}

// ③ 受付再コール超過
export function OverdueReceptionPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_overdue_reception_recalls');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const { page, setPage, total, totalPages, pageRows } = usePagedRows(rows);
  const handleCall = useQueueOpener(setCallFlowScreen, callListData, rows);
  const columns = [
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.company || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 220, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.list_name || '—'}</span> },
    { key: 'recall_at', label: '再コール予定', width: 130, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{r.recall_date} {(r.recall_time || '').slice(0, 5)}</span> },
    { key: 'assignee', label: '担当', width: 90, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.assignee || r.getter_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];
  return (
    <div>
      <PanelHeader title="③ 受付再コール超過"
        leftKpi={<KPI label="表示中" value={`${pageRows.length} 件`} />}
        rightKpi={<KPI label="総数" value={`${total.toLocaleString()} 件`} muted />} />
      <DataTable columns={columns} rows={pageRows} rowKey={(r, i) => `${r.record_id}-${i}`} loading={loading}
        emptyMessage="受付再コール超過はありません。" height="calc(100vh - 380px)" fillWidth />
      <Pagination page={page} totalPages={totalPages} total={total} loading={loading} onChange={setPage} />
    </div>
  );
}

// ④ キーマン再コール超過
export function OverdueKeymanPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_overdue_recalls');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const { page, setPage, total, totalPages, pageRows } = usePagedRows(rows);
  const handleCall = useQueueOpener(setCallFlowScreen, callListData, rows);
  const columns = [
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.company || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 220, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.list_name || '—'}</span> },
    { key: 'recall_at', label: '再コール予定', width: 130, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{r.recall_date} {(r.recall_time || '').slice(0, 5)}</span> },
    { key: 'assignee', label: '担当', width: 90, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.assignee || r.getter_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];
  return (
    <div>
      <PanelHeader title="④ キーマン再コール超過"
        leftKpi={<KPI label="表示中" value={`${pageRows.length} 件`} />}
        rightKpi={<KPI label="総数" value={`${total.toLocaleString()} 件`} muted />} />
      <DataTable columns={columns} rows={pageRows} rowKey={(r, i) => `${r.record_id || r.id}-${i}`} loading={loading}
        emptyMessage="キーマン再コール超過はありません。" height="calc(100vh - 380px)" fillWidth />
      <Pagination page={page} totalPages={totalPages} total={total} loading={loading} onChange={setPage} />
    </div>
  );
}

// ⑤ 再アプローチ候補（過去アポ取得企業が別リストで活きている）
export function ReapproachCandidatesPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_reapproach_candidates');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const { page, setPage, total, totalPages, pageRows } = usePagedRows(rows);
  const handleCall = useQueueOpener(setCallFlowScreen, callListData, rows);
  const columns = [
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.company || '—'}</span> },
    { key: 'list_name', label: '新リスト', width: 220, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.list_name || '—'}</span> },
    { key: 'past_client', label: '前回アポ先', width: 180, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.past_client || '—'}</span> },
    { key: 'past_getter', label: '前回担当', width: 110, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.past_getter || '—'}</span> },
    { key: 'past_date', label: '前回日付', width: 110, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{r.past_date || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];
  return (
    <div>
      <PanelHeader title="⑤ 再アプローチ候補"
        leftKpi={<KPI label="表示中" value={`${pageRows.length} 件`} />}
        rightKpi={<KPI label="総数" value={`${total.toLocaleString()} 件`} muted />} />
      <DataTable columns={columns} rows={pageRows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
        emptyMessage="再アプローチ候補はありません。" height="calc(100vh - 380px)" fillWidth />
      <Pagination page={page} totalPages={totalPages} total={total} loading={loading} onChange={setPage} />
    </div>
  );
}
