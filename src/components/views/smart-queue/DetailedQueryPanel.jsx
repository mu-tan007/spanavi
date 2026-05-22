import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { useEngagements } from '../../../hooks/useEngagements';
import {
  ALL_STATUSES, PREFECTURES_JP, TSR_INDUSTRY_MAJORS,
  fmtRevenueK, okuToK, salesAgencyEngagementOptions,
  PanelHeader, FilterButton, KPI,
} from './smartQueueHelpers';
import MultiSelectDropdown from './MultiSelectDropdown';

// 詳細条件抽出
// 母数: アクティブ × 履歴に「アポ獲得/除外」なし × 直近が「受付/キーマン再コール」でない
// フィルタ並び順 (商材 → タイプ → 業種 → 都道府県 → ステータス → 売上 → 経過日数)

const PAGE_SIZE = 100;

const STATUS_VARIANT = {
  '未架電': 'neutral', '不通': 'neutral', 'キーマン不在': 'neutral',
  '受付ブロック': 'danger', '受付再コール': 'info', 'キーマン再コール': 'warn',
  'キーマン断り': 'danger', '問い合わせフォーム': 'info',
};

export default function DetailedQueryPanel({ setCallFlowScreen, callListData = [] }) {
  const { engagements: allEngagements, categories: allCategories } = useEngagements();
  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  // 商材 (business_categories) - 現状は M&A のみ、将来複数対応想定
  const categoryOptions = useMemo(
    () => (allCategories || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [allCategories]
  );

  // フィルタ state
  const [categoryId, setCategoryId]   = useState(null); // 商材 単一
  const [engIds, setEngIds]           = useState([]);   // タイプ 複数 (engagement_id[])
  const [industries, setIndustries]   = useState([]);
  const [prefectures, setPrefectures] = useState([]);
  const [statuses, setStatuses]       = useState([]);
  const [revMin, setRevMin]           = useState('');
  const [revMax, setRevMax]           = useState('');
  const [daysMin, setDaysMin]         = useState('');
  const [daysMax, setDaysMax]         = useState('');

  const [page, setPage]       = useState(0);
  const [data, setData]       = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);

  // 商材選択時に、その配下の engagement のみをタイプとして表示
  const visibleEngagements = useMemo(() => {
    if (!categoryId) return salesAgencyEngagements;
    return salesAgencyEngagements.filter(e => {
      const eng = (allEngagements || []).find(x => x.id === e.id);
      return eng?.category_id === categoryId;
    });
  }, [categoryId, salesAgencyEngagements, allEngagements]);

  // 商材変更時、タイプ選択をリセット（カテゴリ外を含まないよう）
  useEffect(() => {
    setEngIds(prev => prev.filter(id => visibleEngagements.some(e => e.id === id)));
    // eslint-disable-next-line
  }, [categoryId]);

  const runQuery = (pg = page) => {
    setLoading(true);
    setPage(pg);
    // 複数 engagement の OR は RPC が単一しかサポートしないため、JS側で結合する
    // engIds 空 → 全て、 1件 → そのまま、 複数 → 複数回呼んでマージ（コスト大）
    // 現状3つしかないので、空 or 単一の場合のみ RPC 1回。複数選択時はクライアント側 filter
    const useEngParam = engIds.length === 1 ? engIds[0] : null;
    supabase.rpc('smart_queue_detailed_query', {
      p_statuses:      statuses.length    ? statuses    : null,
      p_prefectures:   prefectures.length ? prefectures : null,
      p_industries:    industries.length  ? industries  : null,
      p_revenue_min_k: okuToK(revMin),
      p_revenue_max_k: okuToK(revMax),
      p_days_min:      daysMin === '' ? null : Number(daysMin),
      p_days_max:      daysMax === '' ? null : Number(daysMax),
      p_engagement_id: useEngParam,
      p_offset:        pg * PAGE_SIZE,
      p_limit:         PAGE_SIZE,
    }).then(({ data: d, error }) => {
      if (error) {
        console.warn('[DetailedQueryPanel] RPC failed:', error);
        setData({ total: 0, rows: [] });
      } else {
        let rows = Array.isArray(d?.rows) ? d.rows : [];
        let total = d?.total ?? 0;
        // engIds 複数選択時はクライアント側で再フィルタ (ページ数も補正)
        if (engIds.length > 1) {
          rows = rows.filter(r => engIds.includes(r.engagement_id));
          total = rows.length;
        }
        setData({ total, rows });
      }
      setLoading(false);
    });
  };

  // 選択系変更時に自動実行
  useEffect(() => { runQuery(0); /* eslint-disable-next-line */ },
    [categoryId, engIds, industries, prefectures, statuses]);

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

  const clearAll = () => {
    setCategoryId(null);
    setEngIds([]); setIndustries([]); setPrefectures([]); setStatuses([]);
    setRevMin(''); setRevMax(''); setDaysMin(''); setDaysMax('');
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

  // ===== 統一フィルタブロック =====
  // 1行ずつ ラベル + コントロール を縦に並べる（商材→タイプ→業種→都道府県→ステータス→売上→経過日数）
  return (
    <div>
      <PanelHeader
        title="詳細条件抽出"
        description="商材・タイプ・地域・業種・売上規模・架電鮮度などで自由に絞り込み（母数: 約58,000件）"
        leftKpi={<KPI label="ヒット" value={`${data.total.toLocaleString()} 件`} />}
        rightKpi={<KPI label="ページ" value={`${page + 1} / ${totalPages}`} muted />}
      />

      <div style={{
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
        padding: space[3], marginBottom: space[3],
      }}>
        <FilterRow label="商材">
          {categoryOptions.length === 0
            ? <span style={{ fontSize: font.size.xs, color: color.textLight }}>—</span>
            : (
              <>
                <FilterButton active={!categoryId} onClick={() => setCategoryId(null)}>全て</FilterButton>
                {categoryOptions.map(c => (
                  <FilterButton key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</FilterButton>
                ))}
              </>
            )
          }
        </FilterRow>

        <FilterRow label="タイプ">
          <FilterButton active={engIds.length === 0} onClick={() => setEngIds([])}>全て</FilterButton>
          {visibleEngagements.map(e => (
            <FilterButton key={e.id} active={engIds.includes(e.id)} onClick={() => toggleArray(engIds, setEngIds, e.id)}>{e.name}</FilterButton>
          ))}
        </FilterRow>

        <FilterRow label="業種">
          <MultiSelectDropdown
            placeholder="業種を選択（複数可）"
            options={TSR_INDUSTRY_MAJORS}
            values={industries}
            onChange={setIndustries}
            width={280}
          />
        </FilterRow>

        <FilterRow label="都道府県">
          <MultiSelectDropdown
            placeholder="都道府県を選択（複数可）"
            options={PREFECTURES_JP}
            values={prefectures}
            onChange={setPrefectures}
            width={280}
          />
        </FilterRow>

        <FilterRow label="ステータス">
          <FilterButton active={statuses.length === 0} onClick={() => setStatuses([])}>全て</FilterButton>
          {ALL_STATUSES.map(s => (
            <FilterButton key={s} active={statuses.includes(s)} onClick={() => toggleArray(statuses, setStatuses, s)}>{s}</FilterButton>
          ))}
        </FilterRow>

        <FilterRow label="売上(億円)">
          <NumInput value={revMin} onChange={setRevMin} placeholder="最小" />
          <span style={{ color: color.textLight }}>〜</span>
          <NumInput value={revMax} onChange={setRevMax} placeholder="最大" />
        </FilterRow>

        <FilterRow label="経過日数">
          <NumInput value={daysMin} onChange={setDaysMin} placeholder="最小" />
          <span style={{ color: color.textLight }}>〜</span>
          <NumInput value={daysMax} onChange={setDaysMax} placeholder="最大" />
          <Button size="sm" variant="primary" onClick={() => runQuery(0)} loading={loading} style={{ marginLeft: space[3] }}>
            検索
          </Button>
          <button onClick={clearAll} style={{
            marginLeft: space[2], padding: '4px 10px', background: 'transparent',
            border: `1px solid ${color.border}`, borderRadius: radius.md,
            color: color.textMid, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
            cursor: 'pointer', fontFamily: font.family.sans,
          }}>条件クリア</button>
        </FilterRow>
      </div>

      <DataTable columns={columns} rows={data.rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
        emptyMessage="該当する企業がありません。" height="calc(100vh - 540px)" fillWidth />

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

function FilterRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2], padding: '6px 0',
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold,
        minWidth: 88, textAlign: 'right', flexShrink: 0,
      }}>{label}:</span>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder }) {
  return (
    <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: 80, padding: '4px 8px', border: `1px solid ${color.border}`,
        borderRadius: radius.md, fontSize: font.size.xs, fontFamily: font.family.mono,
        color: color.textDark, background: color.white, outline: 'none',
      }} />
  );
}
