import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  ALL_STATUSES, PREFECTURES_JP, TSR_INDUSTRY_MAJORS,
  fmtRevenueK, okuToK, salesAgencyEngagementOptions,
  PanelHeader, FilterBar, FilterButton, KPI,
} from './smartQueueHelpers';

// 詳細条件抽出: ステータス(複数) / 都道府県(複数) / 業種(複数) / 売上高(範囲) / 経過日数(範囲)
// 母数: アクティブ × 履歴に「アポ獲得/除外」なし × 直近が「受付/キーマン再コール」でない

const PAGE_SIZE = 100;

const STATUS_VARIANT = {
  '未架電': 'neutral', '不通': 'neutral', 'キーマン不在': 'neutral',
  '受付ブロック': 'danger', '受付再コール': 'info', 'キーマン再コール': 'warn',
  'キーマン断り': 'danger', '問い合わせフォーム': 'info',
};

export default function DetailedQueryPanel({ setCallFlowScreen, callListData = [] }) {
  const { engagements: allEngagements } = useEngagements();
  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  const [statuses, setStatuses]       = useState([]);  // 複数選択
  const [prefectures, setPrefectures] = useState([]);
  const [industries, setIndustries]   = useState([]);
  const [revMin, setRevMin]           = useState(''); // 億円
  const [revMax, setRevMax]           = useState('');
  const [daysMin, setDaysMin]         = useState('');
  const [daysMax, setDaysMax]         = useState('');
  const [engId, setEngId]             = useState(null);
  const [page, setPage]               = useState(0);
  const [data, setData]               = useState({ total: 0, rows: [] });
  const [loading, setLoading]         = useState(false);

  // 各フィルタ変更でクエリ実行（debounce: 入力範囲は手動「検索」、選択系は自動）
  const runQuery = (pg = page) => {
    setLoading(true);
    setPage(pg);
    supabase.rpc('smart_queue_detailed_query', {
      p_statuses:      statuses.length    ? statuses    : null,
      p_prefectures:   prefectures.length ? prefectures : null,
      p_industries:    industries.length  ? industries  : null,
      p_revenue_min_k: okuToK(revMin),
      p_revenue_max_k: okuToK(revMax),
      p_days_min:      daysMin === '' ? null : Number(daysMin),
      p_days_max:      daysMax === '' ? null : Number(daysMax),
      p_engagement_id: engId,
      p_offset:        pg * PAGE_SIZE,
      p_limit:         PAGE_SIZE,
    }).then(({ data: d, error }) => {
      if (error) {
        console.warn('[DetailedQueryPanel] RPC failed:', error);
        setData({ total: 0, rows: [] });
      } else {
        setData({
          total: d?.total ?? 0,
          rows: Array.isArray(d?.rows) ? d.rows : [],
        });
      }
      setLoading(false);
    });
  };

  // 初回 + 選択系（ステータス/都道府県/業種/タイプ）変更で自動再実行
  useEffect(() => { runQuery(0); /* eslint-disable-next-line */ }, [statuses, prefectures, industries, engId]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const handleCall = (row) => {
    if (!setCallFlowScreen || !row.list_id || !row.item_id) return;
    const full = (callListData || []).find(l => l._supaId === row.list_id || l.id === row.list_id)
      || { _supaId: row.list_id, id: row.list_id, company: '' };
    setCallFlowScreen({
      list: full, defaultItemId: row.item_id, defaultListMode: false, singleItemMode: true,
      onResultSubmit: () => setCallFlowScreen?.(null),
    });
  };

  const toggleArray = (arr, setter, v) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const columns = [
    { key: 'company', label: '企業名', width: 240, align: 'left',
      render: (r) => (
        <div>
          <div style={{ fontWeight: font.weight.semibold, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company || '—'}</div>
          {r.industry && (
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 1 }}>
              {r.industry}{r.prefecture ? ` ・ ${r.prefecture}` : ''}
            </div>
          )}
        </div>
      ),
    },
    { key: 'status', label: '直近ステータス', width: 130, align: 'center',
      render: (r) => <Badge variant={STATUS_VARIANT[r.status] || 'default'} dot>{r.status}</Badge> },
    { key: 'days_since_call', label: '最終架電', width: 100, align: 'right',
      render: (r) => r.days_since_call != null
        ? <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{Math.floor(r.days_since_call)}日前</span>
        : <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span> },
    { key: 'revenue_k', label: '売上高', width: 100, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{fmtRevenueK(r.revenue_k)}</span> },
    { key: 'engagement_name', label: 'タイプ', width: 120, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.engagement_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 200, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.list_name || '—'}</span> },
    { key: 'action', label: '架電', width: 90, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="詳細条件抽出"
        description="ステータス・地域・業種・売上規模・架電鮮度などで自由に絞り込み（母数: 約58,000件）"
        leftKpi={<KPI label="ヒット" value={`${data.total.toLocaleString()} 件`} />}
        rightKpi={<KPI label="ページ" value={`${page + 1} / ${totalPages}`} muted />}
      />

      {/* ステータス */}
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>ステータス:</span>
        <FilterButton active={statuses.length === 0} onClick={() => setStatuses([])}>全て</FilterButton>
        {ALL_STATUSES.map(s => (
          <FilterButton key={s} active={statuses.includes(s)} onClick={() => toggleArray(statuses, setStatuses, s)}>{s}</FilterButton>
        ))}
      </FilterBar>

      {/* タイプ + 売上 + 経過日数 */}
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>タイプ:</span>
        <FilterButton active={!engId} onClick={() => setEngId(null)}>全て</FilterButton>
        {salesAgencyEngagements.map(e => (
          <FilterButton key={e.id} active={engId === e.id} onClick={() => setEngId(e.id)}>{e.name}</FilterButton>
        ))}
        <span style={{ color: color.border }}>|</span>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>売上(億円):</span>
        <NumInput value={revMin} onChange={setRevMin} placeholder="最小" />〜
        <NumInput value={revMax} onChange={setRevMax} placeholder="最大" />
        <span style={{ color: color.border }}>|</span>

        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>経過日数:</span>
        <NumInput value={daysMin} onChange={setDaysMin} placeholder="最小" />〜
        <NumInput value={daysMax} onChange={setDaysMax} placeholder="最大" />

        <Button size="sm" variant="primary" onClick={() => runQuery(0)} loading={loading} style={{ marginLeft: 'auto' }}>
          検索
        </Button>
      </FilterBar>

      {/* 業種 (横一列、コンパクト) */}
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>業種:</span>
        <FilterButton active={industries.length === 0} onClick={() => setIndustries([])}>全て</FilterButton>
        {TSR_INDUSTRY_MAJORS.map(ind => (
          <FilterButton key={ind} active={industries.includes(ind)} onClick={() => toggleArray(industries, setIndustries, ind)}>
            {ind.replace(/^[A-Z]\s/, '')}
          </FilterButton>
        ))}
      </FilterBar>

      {/* 都道府県 */}
      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>都道府県:</span>
        <FilterButton active={prefectures.length === 0} onClick={() => setPrefectures([])}>全て</FilterButton>
        {PREFECTURES_JP.map(p => (
          <FilterButton key={p} active={prefectures.includes(p)} onClick={() => toggleArray(prefectures, setPrefectures, p)}>{p}</FilterButton>
        ))}
      </FilterBar>

      <DataTable columns={columns} rows={data.rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
        emptyMessage="該当する企業がありません。" height="calc(100vh - 580px)" fillWidth />

      {data.total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
          <Button size="sm" variant="outline" onClick={() => runQuery(Math.max(0, page - 1))} disabled={page === 0 || loading}>前へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>
            {page + 1} / {totalPages}
          </span>
          <Button size="sm" variant="outline" onClick={() => runQuery(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || loading}>次へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
            {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, data.total)} / {data.total.toLocaleString()} 件
          </span>
        </div>
      )}
    </div>
  );
}

function NumInput({ value, onChange, placeholder }) {
  return (
    <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: 70, padding: '4px 8px', border: `1px solid ${color.border}`,
        borderRadius: radius.md, fontSize: font.size.xs, fontFamily: font.family.mono,
        color: color.textDark, background: color.white, outline: 'none',
      }} />
  );
}
