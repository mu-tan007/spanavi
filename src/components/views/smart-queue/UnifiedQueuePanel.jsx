import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  KPI, FilterButton, PanelHeader, FilterBar, ScoreCell,
  salesAgencyEngagementOptions,
} from './smartQueueHelpers';

// 単一キュー: 期限超過再コール / 未接続フォロー / 未架電 を混在表示
//   業種シグナルとプリセットで絞り込み、業種マッチ順で並べる
//   現状は最大1000件取得、UI側で page size 50 で分割

const CATEGORY_BADGE = {
  overdue_recall:       { variant: 'danger',  label: '期限超過' },
  unconnected_followup: { variant: 'warn',    label: '未接続' },
  untouched:            { variant: 'neutral', label: '未架電' },
};

const STATUS_LABEL = {
  '受付再コール': '受付再コール',
  'キーマン再コール': 'キーマン再コール',
  'キーマン不在': 'キーマン不在',
  '不通': '不通',
  '受付ブロック': '受付ブロック',
  '未架電': '未架電',
};

const PAGE_SIZE = 50;

function fmtDays(d) {
  if (d == null) return '—';
  if (d < 1) return `${Math.round(d * 24)}時間`;
  return `${Math.floor(d)}日`;
}

export default function UnifiedQueuePanel({ setCallFlowScreen, callListData = [] }) {
  const { engagements: allEngagements } = useEngagements();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [categoryFilter, setCategoryFilter] = useState('all'); // all / overdue_recall / unconnected_followup / untouched
  const [engFilter,      setEngFilter]      = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [sortKey,        setSortKey]        = useState('score_desc');
  const [page,           setPage]           = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc('smart_queue_unified', {
      p_engagement_id: null,
      p_max: 1000,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[UnifiedQueuePanel] RPC failed:', error);
        setRows([]);
      } else {
        if (!Array.isArray(data) || data.length === 0) {
          console.log('[UnifiedQueuePanel] RPC empty:', data);
        }
        setRows(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  // 業種選択肢（表示中のデータから抽出）
  const industryOptions = useMemo(() => {
    const set = new Set();
    rows.forEach(r => { if (r.industry) set.add(r.industry); });
    return Array.from(set).sort();
  }, [rows]);

  // カテゴリ別件数（プリセットボタンに表示）
  const categoryCounts = useMemo(() => {
    const c = { all: rows.length, overdue_recall: 0, unconnected_followup: 0, untouched: 0 };
    rows.forEach(r => { if (c[r.category] != null) c[r.category]++; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (categoryFilter !== 'all') list = list.filter(r => r.category === categoryFilter);
    if (engFilter !== 'all')      list = list.filter(r => r.engagement_id === engFilter);
    if (industryFilter !== 'all') list = list.filter(r => r.industry === industryFilter);

    if (sortKey === 'score_desc') {
      list = [...list].sort((a, b) => (b.time_match_score || 0) - (a.time_match_score || 0));
    } else if (sortKey === 'days_desc') {
      list = [...list].sort((a, b) => (b.days_metric || 0) - (a.days_metric || 0));
    } else if (sortKey === 'days_asc') {
      list = [...list].sort((a, b) => (a.days_metric || 0) - (b.days_metric || 0));
    } else if (sortKey === 'category') {
      const order = { overdue_recall: 0, unconnected_followup: 1, untouched: 2 };
      list = [...list].sort((a, b) =>
        (order[a.category] || 9) - (order[b.category] || 9) ||
        (b.time_match_score || 0) - (a.time_match_score || 0)
      );
    }
    return list;
  }, [rows, categoryFilter, engFilter, industryFilter, sortKey]);

  // ページ化
  useEffect(() => { setPage(0); }, [categoryFilter, engFilter, industryFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 架電フロー起動（ダッシュボードと同じシグネチャで呼ぶ）
  const resolveFullList = (listId) => {
    return (callListData || []).find(l => l._supaId === listId || l.id === listId)
      || { _supaId: listId, id: listId, company: '' };
  };

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    setCallFlowScreen({
      list: resolveFullList(row.list_id),
      defaultItemId: row.item_id,
      defaultListMode: false,
      singleItemMode: true,
      onResultSubmit: () => setCallFlowScreen?.(null),
    });
  };

  const columns = [
    { key: 'category', label: '状況', width: 110, align: 'center',
      render: (row) => {
        const conf = CATEGORY_BADGE[row.category] || { variant: 'default', label: row.category };
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
    { key: 'time_match_score', label: '業種マッチ', width: 90, align: 'right',
      render: (row) => <ScoreCell score={row.time_match_score} /> },
    { key: 'status', label: '直近ステータス', width: 130, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{STATUS_LABEL[row.status] || row.status || '—'}</span> },
    { key: 'days_metric', label: '経過/超過', width: 90, align: 'right',
      render: (row) => {
        if (row.category === 'untouched') return <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>;
        const isOverdue = row.category === 'overdue_recall';
        return (
          <span style={{
            fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold,
            color: isOverdue ? color.danger : color.textDark,
          }}>{fmtDays(row.days_metric)}{isOverdue ? '超過' : '前'}</span>
        );
      },
    },
    { key: 'engagement', label: 'タイプ', width: 120, align: 'center',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{row.engagement_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 200, align: 'left',
      render: (row) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.list_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (row) => <Button size="sm" variant="primary" onClick={() => handleCall(row)} disabled={!setCallFlowScreen || !row.list_id || !row.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="リスト跨ぎ・横断ピックアップキュー"
        description="期限超過再コール / 未接続フォロー / 未架電 を混在表示。業種シグナルを元に「今かければ当たる」順に並びます（最大1,000件取得）。"
        leftKpi={<KPI label="表示中" value={`${filtered.length} 件`} />}
        rightKpi={<KPI label="取得総数" value={`${rows.length} 件`} muted />}
      />

      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>状況:</span>
        {[
          ['all',                  `全て (${categoryCounts.all})`],
          ['overdue_recall',       `期限超過 (${categoryCounts.overdue_recall})`],
          ['unconnected_followup', `未接続 (${categoryCounts.unconnected_followup})`],
          ['untouched',            `未架電 (${categoryCounts.untouched})`],
        ].map(([v, lbl]) => (
          <FilterButton key={v} active={categoryFilter === v} onClick={() => setCategoryFilter(v)}>{lbl}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={engFilter === 'all'} onClick={() => setEngFilter('all')}>全て</FilterButton>
        {salesAgencyEngagements.map(e => (
          <FilterButton key={e.id} active={engFilter === e.id} onClick={() => setEngFilter(e.id)}>{e.name}</FilterButton>
        ))}
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>業種:</span>
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={{
          padding: '5px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer', minWidth: 160,
        }}>
          <option value="all">全業種</option>
          {industryOptions.map(ind => <option key={ind} value={ind}>{ind}</option>)}
        </select>
        <span style={{ color: color.border, fontSize: font.size.md }}>|</span>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>並び順:</span>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{
          padding: '5px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer',
        }}>
          <option value="score_desc">業種マッチ高い順</option>
          <option value="category">期限超過 → 未接続 → 未架電</option>
          <option value="days_desc">経過/超過 多い順</option>
          <option value="days_asc">経過/超過 少ない順</option>
        </select>
      </FilterBar>

      <DataTable columns={columns} rows={paged} rowKey={(r, i) => `${r.item_id || ''}-${r.record_id || i}`} loading={loading}
        emptyMessage="該当する案件がありません。"
        height="calc(100vh - 500px)" fillWidth />

      {/* ページネーション */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
          <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>前へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 80, textAlign: 'center' }}>
            {page + 1} / {totalPages} ページ
          </span>
          <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>次へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
            {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length} 件
          </span>
        </div>
      )}
    </div>
  );
}
