import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { PanelHeader, KPI } from './smartQueueHelpers';

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

function useCallHandler(setCallFlowScreen, callListData) {
  return (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    const full = (callListData || []).find(l => l._supaId === row.list_id || l.id === row.list_id)
      || { _supaId: row.list_id, id: row.list_id, company: '' };
    setCallFlowScreen({
      list: full, defaultItemId: row.item_id, defaultListMode: false, singleItemMode: true,
      onResultSubmit: () => setCallFlowScreen?.(null),
    });
  };
}

function useRpc(rpcName, args) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    supabase.rpc(rpcName, args).then(({ data, error }) => {
      if (error) {
        console.warn(`[${rpcName}] failed:`, error);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    });
    // eslint-disable-next-line
  }, []);
  return { rows, loading };
}

// ③ 受付再コール超過
export function OverdueReceptionPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_overdue_reception_recalls');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const handleCall = useCallHandler(setCallFlowScreen, callListData);
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
      <PanelHeader title="③ 受付再コール超過" description="受付再コール予定日時を超過した案件（旧ダッシュボード）"
        leftKpi={<KPI label="件数" value={`${rows.length} 件`} />} />
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => `${r.record_id}-${i}`} loading={loading}
        emptyMessage="受付再コール超過はありません。" height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}

// ④ キーマン再コール超過
export function OverdueKeymanPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_overdue_recalls');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const handleCall = useCallHandler(setCallFlowScreen, callListData);
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
      <PanelHeader title="④ キーマン再コール超過" description="キーマン再コール予定日時を超過した案件（旧ダッシュボード）"
        leftKpi={<KPI label="件数" value={`${rows.length} 件`} />} />
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => `${r.record_id || r.id}-${i}`} loading={loading}
        emptyMessage="キーマン再コール超過はありません。" height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}

// ⑤ 再アプローチ候補（過去アポ取得企業が別リストで活きている）
export function ReapproachCandidatesPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const { rows: allRows, loading } = useRpc('dashboard_reapproach_candidates');
  const rows = useEngFilter(allRows, { categoryId, engIds, allEngagements, callListData });
  const handleCall = useCallHandler(setCallFlowScreen, callListData);
  const columns = [
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.company || '—'}</span> },
    { key: 'client_name', label: '新リストのクライアント', width: 180, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.client_name || '—'}</span> },
    { key: 'list_name', label: '新リスト', width: 200, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.list_name || '—'}</span> },
    { key: 'past_client', label: '前回アポ先', width: 160, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.past_client || '—'}</span> },
    { key: 'past_getter', label: '前回担当', width: 100, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.past_getter || '—'}</span> },
    { key: 'past_date', label: '前回日付', width: 110, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{r.past_date || '—'}</span> },
    { key: 'source', label: 'ソース', width: 90, align: 'center',
      render: (r) => <Badge variant={r.source === 'spanavi' ? 'info' : 'neutral'}>{r.source}</Badge> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];
  return (
    <div>
      <PanelHeader title="⑤ 再アプローチ候補" description="過去アポ取得企業（電話一致 or 旧データ）が現在のリストでまだフォロー中（旧ダッシュボード）"
        leftKpi={<KPI label="件数" value={`${rows.length} 件`} />} />
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
        emptyMessage="再アプローチ候補はありません。" height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}
