import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useCallQueue } from './useCallQueue';

// 詳細条件抽出
// フィルタ変更は draft のみ更新、「検索」ボタン押下で applied に反映 → fetch
// 並び順: 商材 → タイプ → 業種 → 都道府県 → ステータス → 売上 → 経過日数

const PAGE_SIZE = 200;

const STATUS_VARIANT = {
  '未架電': 'neutral', '不通': 'neutral', 'キーマン不在': 'neutral',
  '受付ブロック': 'danger', '受付再コール': 'info', 'キーマン再コール': 'warn',
  'キーマン断り': 'danger', '問い合わせフォーム': 'info',
};

const EMPTY_DRAFT = {
  categoryId: null,
  engIds: [],
  industries: [],
  prefectures: [],
  statuses: [],
  revMin: '', revMax: '',
  daysMin: '', daysMax: '',
};

// draft → 等価判定
function isSameDraft(a, b) {
  if (a.categoryId !== b.categoryId) return false;
  if (a.revMin !== b.revMin || a.revMax !== b.revMax) return false;
  if (a.daysMin !== b.daysMin || a.daysMax !== b.daysMax) return false;
  const arrEq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  return arrEq(a.engIds, b.engIds) && arrEq(a.industries, b.industries)
      && arrEq(a.prefectures, b.prefectures) && arrEq(a.statuses, b.statuses);
}

export default function DetailedQueryPanel({ setCallFlowScreen, callListData = [] }) {
  const { engagements: allEngagements, categories: allCategories } = useEngagements();
  const salesAgencyEngagements = useMemo(() => salesAgencyEngagementOptions(allEngagements), [allEngagements]);

  const categoryOptions = useMemo(
    () => (allCategories || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [allCategories]
  );

  // フィルタ: draft (入力中) と applied (確定済)
  const [draft, setDraft]     = useState(EMPTY_DRAFT);
  const [applied, setApplied] = useState(EMPTY_DRAFT);
  const dirty = !isSameDraft(draft, applied);

  const [page, setPage]       = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // useQuery キャッシュ化（同じ条件・ページなら即時描画）
  // 商材・タイプはサーバー側 filter （p_engagement_ids）に統一
  const engagementIds = applied.engIds.length > 0 ? applied.engIds : null;
  const { data: pageData, isPending } = useQuery({
    queryKey: ['smart_queue_detailed_query', applied, page],
    enabled: hasSearched,
    queryFn: async () => {
      const { data: d, error } = await supabase.rpc('smart_queue_detailed_query', {
        p_statuses:      applied.statuses.length    ? applied.statuses    : null,
        p_prefectures:   applied.prefectures.length ? applied.prefectures : null,
        p_industries:    applied.industries.length  ? applied.industries  : null,
        p_revenue_min_k: okuToK(applied.revMin),
        p_revenue_max_k: okuToK(applied.revMax),
        p_days_min:      applied.daysMin === '' ? null : Number(applied.daysMin),
        p_days_max:      applied.daysMax === '' ? null : Number(applied.daysMax),
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
        p_offset:        page * PAGE_SIZE,
        p_limit:         PAGE_SIZE,
      });
      if (error) {
        console.warn('[DetailedQueryPanel] RPC failed:', error);
        return { total: 0, rows: [] };
      }
      return { total: d?.total ?? 0, rows: Array.isArray(d?.rows) ? d.rows : [] };
    },
  });
  const data = pageData || { total: 0, rows: [] };
  const loading = isPending && hasSearched;

  // 商材選択時に、その配下の engagement のみをタイプ選択肢として表示
  const visibleEngagements = useMemo(() => {
    if (!draft.categoryId) return salesAgencyEngagements;
    return salesAgencyEngagements.filter(e => {
      const eng = (allEngagements || []).find(x => x.id === e.id);
      return eng?.category_id === draft.categoryId;
    });
  }, [draft.categoryId, salesAgencyEngagements, allEngagements]);

  // 商材変更でタイプ選択を不可視のものから除外
  useEffect(() => {
    setDraft(d => ({
      ...d, engIds: d.engIds.filter(id => visibleEngagements.some(e => e.id === id)),
    }));
    // eslint-disable-next-line
  }, [draft.categoryId]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  // 架電ボタン押下: 軽量 ids RPC で全件取得 → 全件キュー
  const [openingQueue, setOpeningQueue] = useState(false);
  const handleCall = async (row) => {
    setOpeningQueue(true);
    try {
      const { data: ids } = await supabase.rpc('smart_queue_detailed_query_ids', {
        p_statuses:      applied.statuses.length    ? applied.statuses    : null,
        p_prefectures:   applied.prefectures.length ? applied.prefectures : null,
        p_industries:    applied.industries.length  ? applied.industries  : null,
        p_revenue_min_k: okuToK(applied.revMin),
        p_revenue_max_k: okuToK(applied.revMax),
        p_days_min:      applied.daysMin === '' ? null : Number(applied.daysMin),
        p_days_max:      applied.daysMax === '' ? null : Number(applied.daysMax),
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
      });
      const list = Array.isArray(ids) ? ids : [];
      const idx = list.findIndex(r => r.item_id === row.item_id);
      openQueue(list, idx >= 0 ? idx : 0);
    } catch (e) {
      console.warn('[DetailedQueryPanel] queue fetch failed:', e);
      const idx = data.rows.findIndex(r => r.item_id === row.item_id);
      openQueue(data.rows, idx >= 0 ? idx : 0);
    } finally {
      setOpeningQueue(false);
    }
  };

  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleArrayInDraft = (k, v) => setDraft(d => ({
    ...d, [k]: d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v],
  }));

  const apply = () => {
    setApplied(draft);
    setPage(0);
    setHasSearched(true);
  };

  const clearAll = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(EMPTY_DRAFT);
    setPage(0);
    setHasSearched(true); // 全件表示
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
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} loading={openingQueue} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="詳細条件抽出"
        leftKpi={<KPI label="ヒット" value={hasSearched ? `${data.total.toLocaleString()} 件` : '—'} />}
        rightKpi={<KPI label="ページ" value={hasSearched ? `${page + 1} / ${totalPages}` : '—'} muted />}
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
                <FilterButton active={!draft.categoryId} onClick={() => setDraftField('categoryId', null)}>全て</FilterButton>
                {categoryOptions.map(c => (
                  <FilterButton key={c.id} active={draft.categoryId === c.id} onClick={() => setDraftField('categoryId', c.id)}>{c.name}</FilterButton>
                ))}
              </>
            )
          }
        </FilterRow>

        <FilterRow label="タイプ">
          <FilterButton active={draft.engIds.length === 0} onClick={() => setDraftField('engIds', [])}>全て</FilterButton>
          {visibleEngagements.map(e => (
            <FilterButton key={e.id} active={draft.engIds.includes(e.id)} onClick={() => toggleArrayInDraft('engIds', e.id)}>{e.name}</FilterButton>
          ))}
        </FilterRow>

        <FilterRow label="業種">
          <MultiSelectDropdown
            placeholder="業種を選択（複数可）"
            options={TSR_INDUSTRY_MAJORS}
            values={draft.industries}
            onChange={v => setDraftField('industries', v)}
            width={280}
          />
        </FilterRow>

        <FilterRow label="都道府県">
          <MultiSelectDropdown
            placeholder="都道府県を選択（複数可）"
            options={PREFECTURES_JP}
            values={draft.prefectures}
            onChange={v => setDraftField('prefectures', v)}
            width={280}
          />
        </FilterRow>

        <FilterRow label="ステータス">
          <FilterButton active={draft.statuses.length === 0} onClick={() => setDraftField('statuses', [])}>全て</FilterButton>
          {ALL_STATUSES.map(s => (
            <FilterButton key={s} active={draft.statuses.includes(s)} onClick={() => toggleArrayInDraft('statuses', s)}>{s}</FilterButton>
          ))}
        </FilterRow>

        <FilterRow label="売上(億円)">
          <NumInput value={draft.revMin} onChange={v => setDraftField('revMin', v)} placeholder="最小" />
          <span style={{ color: color.textLight }}>〜</span>
          <NumInput value={draft.revMax} onChange={v => setDraftField('revMax', v)} placeholder="最大" />
        </FilterRow>

        <FilterRow label="経過日数">
          <NumInput value={draft.daysMin} onChange={v => setDraftField('daysMin', v)} placeholder="最小" />
          <span style={{ color: color.textLight }}>〜</span>
          <NumInput value={draft.daysMax} onChange={v => setDraftField('daysMax', v)} placeholder="最大" />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space[2] }}>
            {hasSearched && dirty && (
              <span style={{ fontSize: font.size.xs - 1, color: color.warn, fontWeight: font.weight.semibold }}>
                ＊条件変更あり（未適用）
              </span>
            )}
            <Button size="sm" variant="primary" onClick={apply} loading={loading}
              disabled={!hasSearched ? false : !dirty}>
              {hasSearched ? '再検索' : '検索'}
            </Button>
            <button onClick={clearAll} style={{
              padding: '4px 10px', background: 'transparent',
              border: `1px solid ${color.border}`, borderRadius: radius.md,
              color: color.textMid, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
              cursor: 'pointer', fontFamily: font.family.sans,
            }}>条件クリア</button>
          </div>
        </FilterRow>
      </div>

      {!hasSearched ? (
        <div style={{
          padding: 60, textAlign: 'center', background: color.white,
          border: `1px dashed ${color.border}`, borderRadius: radius.md, color: color.textLight,
          fontSize: font.size.sm,
        }}>
          条件を設定して「検索」ボタンを押してください
        </div>
      ) : (
        <>
          <DataTable columns={columns} rows={data.rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
            emptyMessage="該当する企業がありません。" height="calc(100vh - 540px)" fillWidth />

          {data.total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
              <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || loading}>前へ</Button>
              <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>
                {page + 1} / {totalPages}
              </span>
              <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || loading}>次へ</Button>
              <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
                {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, data.total)} / {data.total.toLocaleString()} 件
              </span>
            </div>
          )}
        </>
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
