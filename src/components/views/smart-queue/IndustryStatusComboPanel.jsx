import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import {
  ALL_STATUSES, TSR_INDUSTRY_MAJORS,
  PanelHeader, FilterBar, FilterButton, KPI, ScoreCell,
} from './smartQueueHelpers';
import MultiSelectDropdown from './MultiSelectDropdown';
import { useCallQueue } from './useCallQueue';

// ② 業種 × ステータス組合せ
// 表示は 200件/ページ、 架電キューは ids RPC で全件対象
const PAGE_SIZE = 200;

const STATUS_VARIANT = {
  '未架電': 'neutral', '不通': 'neutral', 'キーマン不在': 'neutral',
  '受付ブロック': 'danger', '受付再コール': 'info', 'キーマン再コール': 'warn',
  'キーマン断り': 'danger', '問い合わせフォーム': 'info',
};

export default function IndustryStatusComboPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  // おすすめ業種
  const { data: recommendedIndustries = [] } = useQuery({
    queryKey: ['industry_score_now_top5'],
    queryFn: async () => {
      const { data } = await supabase.rpc('industry_score_now', { p_min_samples: 30 });
      return Array.isArray(data) ? data.slice(0, 5) : [];
    },
  });

  const [industries, setIndustries] = useState([]);
  const [statuses, setStatuses]     = useState([]);
  const [clientFilter, setClientFilter] = useState([]);
  const [page, setPage]             = useState(0);

  // 商材選択時に配下の engagement_id 集合を計算。複数 engIds 選択時はそれ優先
  const engagementIds = useMemo(() => {
    if (engIds.length > 0) return engIds;
    if (categoryId) {
      return (allEngagements || []).filter(e => e.category_id === categoryId).map(e => e.id);
    }
    return null;
  }, [categoryId, engIds, allEngagements]);

  // おすすめ業種で初回自動選択
  useEffect(() => {
    if (recommendedIndustries.length > 0 && industries.length === 0) {
      setIndustries(recommendedIndustries.slice(0, 3).map(r => r.industry_major));
    }
    // eslint-disable-next-line
  }, [recommendedIndustries]);

  useEffect(() => { setPage(0); }, [industries, statuses, engagementIds, clientFilter]);

  const { data: pageData, isPending } = useQuery({
    queryKey: ['smart_queue_industry_status_combo', industries, statuses, engagementIds, clientFilter, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_queue_industry_status_combo', {
        p_industries:    industries.length ? industries : null,
        p_statuses:      statuses.length   ? statuses   : null,
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
        p_client_names:  clientFilter.length ? clientFilter : null,
        p_offset: page * PAGE_SIZE,
        p_limit:  PAGE_SIZE,
      });
      if (error) console.warn('[IndustryStatusComboPanel] failed:', error);
      return data || { total: 0, rows: [], clients: [] };
    },
  });
  const data = pageData || { total: 0, rows: [], clients: [] };
  const clientOptions = data.clients || [];
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const toggleArray = (arr, setter, v) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const [openingQueue, setOpeningQueue] = useState(false);
  const handleCall = async (row) => {
    setOpeningQueue(true);
    try {
      const { data: ids } = await supabase.rpc('smart_queue_industry_status_combo_ids', {
        p_industries: industries.length ? industries : null,
        p_statuses:   statuses.length   ? statuses   : null,
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
        p_client_names: clientFilter.length ? clientFilter : null,
      });
      const list = Array.isArray(ids) ? ids : [];
      const idx = list.findIndex(r => r.item_id === row.item_id);
      openQueue(list, idx >= 0 ? idx : 0);
    } catch (e) {
      console.warn('[IndustryStatusComboPanel] queue fetch failed:', e);
      const idx = data.rows.findIndex(r => r.item_id === row.item_id);
      openQueue(data.rows, idx >= 0 ? idx : 0);
    } finally {
      setOpeningQueue(false);
    }
  };

  const columns = [
    { key: 'time_match_score', label: '業種マッチ', width: 100, align: 'right',
      render: (r) => <ScoreCell score={r.time_match_score} /> },
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
    { key: 'status', label: 'ステータス', width: 130, align: 'center',
      render: (r) => <Badge variant={STATUS_VARIANT[r.status] || 'default'} dot>{r.status}</Badge> },
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
        title="② 業種 × ステータス組合せ"
        leftKpi={<KPI label="表示中" value={`${data.rows.length} 件`} />}
        rightKpi={<KPI label="総数" value={`${data.total.toLocaleString()} 件`} muted />}
      />

      {recommendedIndustries.length > 0 && (
        <div style={{
          padding: '10px 16px', marginBottom: space[3],
          background: color.white, borderRadius: radius.md,
          border: `1px solid ${color.border}`, borderLeft: `3px solid ${color.gold}`,
          display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: font.size.xs, fontWeight: font.weight.bold,
            color: color.gold, letterSpacing: font.letterSpacing.wider,
          }}>
            いまのおすすめ業種
          </span>
          {recommendedIndustries.map((r, i) => (
            <FilterButton key={r.industry_major}
              active={industries.includes(r.industry_major)}
              onClick={() => toggleArray(industries, setIndustries, r.industry_major)}>
              {i + 1}. {r.industry_major} ({Number(r.keyman_rate).toFixed(1)}%)
            </FilterButton>
          ))}
        </div>
      )}

      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>業種:</span>
        <FilterButton active={industries.length === 0} onClick={() => setIndustries([])}>全業種</FilterButton>
        {TSR_INDUSTRY_MAJORS.map(ind => (
          <FilterButton key={ind} active={industries.includes(ind)} onClick={() => toggleArray(industries, setIndustries, ind)}>
            {ind.replace(/^[A-Z]\s/, '')}
          </FilterButton>
        ))}
      </FilterBar>

      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>ステータス:</span>
        <FilterButton active={statuses.length === 0} onClick={() => setStatuses([])}>全て</FilterButton>
        {ALL_STATUSES.map(s => (
          <FilterButton key={s} active={statuses.includes(s)} onClick={() => toggleArray(statuses, setStatuses, s)}>{s}</FilterButton>
        ))}
        <span style={{ color: color.border }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>クライアント:</span>
        <MultiSelectDropdown placeholder="クライアントを選択（複数可）" options={clientOptions} values={clientFilter}
          onChange={setClientFilter} width={240} />
      </FilterBar>

      <DataTable columns={columns} rows={data.rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={isPending}
        emptyMessage="該当する企業がありません。" height="calc(100vh - 580px)" fillWidth />

      {data.total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || isPending}>前へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || isPending}>次へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
            {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, data.total)} / {data.total.toLocaleString()} 件
          </span>
        </div>
      )}
    </div>
  );
}
