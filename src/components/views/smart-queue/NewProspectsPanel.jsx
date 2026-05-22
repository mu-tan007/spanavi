import { useState, useEffect, useMemo } from 'react';
import { color, space, font } from '../../../constants/design';
import { Button, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  KPI, FilterButton, PanelHeader, FilterBar, ScoreCell,
  salesAgencyEngagementOptions,
} from './smartQueueHelpers';

// C: 新規開拓（未架電を業種×時間帯マッチで並べる）
export default function NewProspectsPanel({ setCallFlowScreen }) {
  const { engagements: allEngagements } = useEngagements();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEng, setFilterEng] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('smart_queue_new_prospects', {
      p_engagement_id: null,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[NewProspectsPanel] RPC failed:', error);
        setRows([]);
      } else {
        if (!Array.isArray(data) || data.length === 0) console.log('[NewProspectsPanel] RPC empty:', data);
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
    return list;
  }, [rows, filterEng]);

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    setCallFlowScreen({ listId: row.list_id, itemId: row.item_id });
  };

  const columns = [
    { key: 'company', label: '企業名', width: 260, align: 'left',
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
    { key: 'time_match_score', label: '時間帯マッチ', width: 100, align: 'right',
      render: (row) => <ScoreCell score={row.time_match_score} /> },
    { key: 'engagement', label: 'タイプ', width: 130, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.engagement_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 240, align: 'left',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.list_name || '—'}</span> },
    { key: 'phone', label: '電話', width: 130, align: 'left',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textDark }}>{row.phone || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (row) => <Button size="sm" variant="primary" onClick={() => handleCall(row)} disabled={!setCallFlowScreen || !row.list_id || !row.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="新規開拓（業種×時間帯マッチ）"
        description="未架電企業を「今かければ当たる業種」優先で並べる横断キュー（アクティブリスト・上位500件）。"
        leftKpi={<KPI label="表示中" value={`${filtered.length} 件`} />}
        rightKpi={<KPI label="上位候補" value={`${rows.length} 件`} muted />}
      />
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={filterEng === 'all'} onClick={() => setFilterEng('all')}>全て</FilterButton>
        {salesAgencyEngagements.map(e => (
          <FilterButton key={e.id} active={filterEng === e.id} onClick={() => setFilterEng(e.id)}>{e.name}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>
        <span style={{ fontSize: font.size.xs - 1, color: color.textLight, fontStyle: 'italic' }}>
          並びは固定（時間帯マッチが高い順 → 企業名）
        </span>
      </FilterBar>
      <DataTable columns={columns} rows={filtered} rowKey="item_id" loading={loading}
        emptyMessage="新規開拓候補がありません。"
        height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}
