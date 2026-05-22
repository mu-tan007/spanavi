import { useState, useEffect, useMemo } from 'react';
import { color, space, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  fmtRecallAt, fmtOverdue, STATUS_BADGE,
  KPI, FilterButton, PanelHeader, FilterBar,
  salesAgencyEngagementOptions,
} from './smartQueueHelpers';

// A: 期限超過再コール（リスト跨ぎ・全件）
export default function OverdueRecallsPanel({ setCallFlowScreen }) {
  const { engagements: allEngagements } = useEngagements();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEng,    setFilterEng]    = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortKey,      setSortKey]      = useState('overdue_desc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('smart_queue_overdue_recalls', {
      p_engagement_id: null,
      p_status: null,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[OverdueRecallsPanel] RPC failed:', error);
        setRows([]);
      } else {
        if (!Array.isArray(data) || data.length === 0) {
          console.log('[OverdueRecallsPanel] RPC empty:', data);
        }
        setRows(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterEng !== 'all') list = list.filter(r => r.engagement_id === filterEng);
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (sortKey === 'overdue_desc') list = [...list].sort((a, b) => (b.overdue_days || 0) - (a.overdue_days || 0));
    else if (sortKey === 'overdue_asc') list = [...list].sort((a, b) => (a.overdue_days || 0) - (b.overdue_days || 0));
    else if (sortKey === 'recent') list = [...list].sort((a, b) => new Date(b.called_at || 0) - new Date(a.called_at || 0));
    return list;
  }, [rows, filterEng, filterStatus, sortKey]);

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    setCallFlowScreen({ listId: row.list_id, itemId: row.item_id });
  };

  const columns = [
    { key: 'status', label: '区分', width: 100, align: 'center',
      render: (row) => {
        const conf = STATUS_BADGE[row.status] || { variant: 'default', label: row.status };
        return <Badge variant={conf.variant} dot>{conf.label}</Badge>;
      },
    },
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (row) => (
        <div>
          <div style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.company || '—'}</div>
          {row.industry && (
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 1 }}>
              {row.industry}{row.prefecture ? ` ・ ${row.prefecture}` : ''}
            </div>
          )}
        </div>
      ),
    },
    { key: 'engagement', label: 'タイプ', width: 130, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.engagement_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 220, align: 'left',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.list_name || '—'}</span> },
    { key: 'recall_at', label: '再コール予定', width: 130, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textDark }}>{fmtRecallAt(row.recall_date, row.recall_time)}</span> },
    { key: 'overdue', label: '超過', width: 80, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold, color: (row.overdue_days || 0) >= 3 ? color.danger : color.warn }}>{fmtOverdue(row.overdue_days)}</span> },
    { key: 'assignee', label: '担当', width: 80, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.assignee || row.getter_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (row) => <Button size="sm" variant="primary" onClick={() => handleCall(row)} disabled={!setCallFlowScreen || !row.list_id || !row.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="期限超過再コール（リスト跨ぎ横断）"
        description="受付再コール / キーマン再コールの予定日時を超過した案件。アクティブリストのみ。"
        leftKpi={<KPI label="表示中" value={`${filtered.length} 件`} />}
        rightKpi={<KPI label="全期限超過" value={`${rows.length} 件`} muted />}
      />
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>区分:</span>
        {[['all', '全て'], ['受付再コール', '受付'], ['キーマン再コール', 'キーマン']].map(([v, lbl]) => (
          <FilterButton key={v} active={filterStatus === v} onClick={() => setFilterStatus(v)}>{lbl}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={filterEng === 'all'} onClick={() => setFilterEng('all')}>全て</FilterButton>
        {salesAgencyEngagements.map(e => (
          <FilterButton key={e.id} active={filterEng === e.id} onClick={() => setFilterEng(e.id)}>{e.name}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>並び順:</span>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{
          padding: '5px 10px', borderRadius: 4, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer',
        }}>
          <option value="overdue_desc">超過日数が多い順</option>
          <option value="overdue_asc">超過日数が少ない順</option>
          <option value="recent">最終架電が新しい順</option>
        </select>
      </FilterBar>
      <DataTable columns={columns} rows={filtered} rowKey="record_id" loading={loading}
        emptyMessage="期限超過の再コール案件はありません。"
        height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}
