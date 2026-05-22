import { useState, useEffect, useMemo } from 'react';
import { color, space, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  STATUS_BADGE,
  KPI, FilterButton, PanelHeader, FilterBar, ScoreCell,
  salesAgencyEngagementOptions,
} from './smartQueueHelpers';

// B: 未接続フォロー（キーマン不在 / 不通 / 受付ブロック を業種×時間帯マッチで並べる）
export default function UnconnectedFollowupPanel({ setCallFlowScreen }) {
  const { engagements: allEngagements } = useEngagements();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEng,    setFilterEng]    = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortKey,      setSortKey]      = useState('score_desc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('smart_queue_unconnected_followup', {
      p_engagement_id: null,
      p_status: null,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[UnconnectedFollowupPanel] RPC failed:', error);
        setRows([]);
      } else {
        if (!Array.isArray(data) || data.length === 0) console.log('[UnconnectedFollowupPanel] RPC empty:', data);
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
    if (sortKey === 'score_desc') list = [...list].sort((a, b) => (b.time_match_score || 0) - (a.time_match_score || 0));
    else if (sortKey === 'days_desc') list = [...list].sort((a, b) => (b.days_since_call || 0) - (a.days_since_call || 0));
    else if (sortKey === 'days_asc') list = [...list].sort((a, b) => (a.days_since_call || 0) - (b.days_since_call || 0));
    return list;
  }, [rows, filterEng, filterStatus, sortKey]);

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    setCallFlowScreen({ listId: row.list_id, itemId: row.item_id });
  };

  const columns = [
    { key: 'status', label: 'ステータス', width: 120, align: 'center',
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
    { key: 'time_match_score', label: '時間帯マッチ', width: 100, align: 'right',
      render: (row) => <ScoreCell score={row.time_match_score} /> },
    { key: 'engagement', label: 'タイプ', width: 130, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.engagement_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 200, align: 'left',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.list_name || '—'}</span> },
    { key: 'days_since_call', label: '前回架電', width: 90, align: 'right',
      render: (row) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textDark }}>{row.days_since_call != null ? `${row.days_since_call}日前` : '—'}</span> },
    { key: 'getter_name', label: '前回担当', width: 90, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.getter_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (row) => <Button size="sm" variant="primary" onClick={() => handleCall(row)} disabled={!setCallFlowScreen || !row.list_id || !row.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="未接続フォロー（業種×時間帯マッチ）"
        description="キーマン不在 / 不通 / 受付ブロックを横断、「今かければ当たる」業種から優先表示（過去30日内・上位500件）。"
        leftKpi={<KPI label="表示中" value={`${filtered.length} 件`} />}
        rightKpi={<KPI label="候補総数" value={`${rows.length} 件`} muted />}
      />
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>ステータス:</span>
        {[['all', '全て'], ['キーマン不在', 'キーマン不在'], ['不通', '不通'], ['受付ブロック', '受付ブロック']].map(([v, lbl]) => (
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
          <option value="score_desc">時間帯マッチが高い順</option>
          <option value="days_desc">前回架電が古い順</option>
          <option value="days_asc">前回架電が新しい順</option>
        </select>
      </FilterBar>
      <DataTable columns={columns} rows={filtered} rowKey="record_id" loading={loading}
        emptyMessage="フォロー対象の未接続案件はありません。"
        height="calc(100vh - 380px)" fillWidth />
    </div>
  );
}
