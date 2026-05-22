import { useState, useEffect } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import {
  ALL_STATUSES, TSR_INDUSTRY_MAJORS,
  PanelHeader, FilterBar, FilterButton, KPI, ScoreCell,
} from './smartQueueHelpers';
import { useCallQueue } from './useCallQueue';

// ② 業種 × ステータス組合せ
//   現在の曜日/時間帯おすすめ業種をフェッチして上位表示、ユーザー任意で
//   業種(複数)・ステータス(複数)選択可能

// 上限撤廃: ヒット件数を全件取得
const PAGE_SIZE = 100000;

const STATUS_VARIANT = {
  '未架電': 'neutral', '不通': 'neutral', 'キーマン不在': 'neutral',
  '受付ブロック': 'danger', '受付再コール': 'info', 'キーマン再コール': 'warn',
  'キーマン断り': 'danger', '問い合わせフォーム': 'info',
};

export default function IndustryStatusComboPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  // おすすめ業種 (フェッチ)
  const [recommendedIndustries, setRecommendedIndustries] = useState([]);

  useEffect(() => {
    supabase.rpc('industry_score_now', { p_min_samples: 30 }).then(({ data }) => {
      setRecommendedIndustries(Array.isArray(data) ? data.slice(0, 5) : []);
    });
  }, []);

  const [industries, setIndustries] = useState([]); // 初期は未選択
  const [statuses, setStatuses]     = useState([]);
  const [page, setPage]             = useState(0);
  const [data, setData]             = useState({ total: 0, rows: [] });
  const [loading, setLoading]       = useState(false);

  const useEngParam = engIds.length === 1 ? engIds[0] : null;

  // おすすめ業種が来たら自動でTOP3を選択
  useEffect(() => {
    if (recommendedIndustries.length > 0 && industries.length === 0) {
      setIndustries(recommendedIndustries.slice(0, 3).map(r => r.industry_major));
    }
    // eslint-disable-next-line
  }, [recommendedIndustries]);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('smart_queue_industry_status_combo', {
      p_industries: industries.length ? industries : null,
      p_statuses:   statuses.length   ? statuses   : null,
      p_engagement_id: useEngParam,
      p_offset: page * PAGE_SIZE,
      p_limit:  PAGE_SIZE,
    }).then(({ data: d, error }) => {
      if (error) {
        console.warn('[IndustryStatusComboPanel] RPC failed:', error);
        setData({ total: 0, rows: [] });
      } else {
        let rows = Array.isArray(d?.rows) ? d.rows : [];
        let total = d?.total ?? 0;
        // 商材フィルタ
        if (categoryId) {
          const matched = (allEngagements || []).filter(e => e.category_id === categoryId).map(e => e.id);
          rows = rows.filter(r => matched.includes(r.engagement_id));
          total = rows.length;
        }
        if (engIds.length > 1) {
          rows = rows.filter(r => engIds.includes(r.engagement_id));
          total = rows.length;
        }
        setData({ total, rows });
      }
      setLoading(false);
    });
  }, [industries, statuses, useEngParam, page, categoryId, engIds, allEngagements]);

  useEffect(() => { setPage(0); }, [industries, statuses, useEngParam, categoryId, engIds.length]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const toggleArray = (arr, setter, v) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const handleCall = (row) => {
    const idx = data.rows.findIndex(r => r.item_id === row.item_id);
    openQueue(data.rows, idx >= 0 ? idx : 0);
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
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="② 業種 × ステータス組合せ"
        leftKpi={<KPI label="ヒット" value={`${data.total.toLocaleString()} 件`} />}
        rightKpi={<KPI label="ページ" value={`${page + 1} / ${totalPages}`} muted />}
      />

      {/* おすすめ業種 (クイック選択): 金色アクセントの細枠で控えめに */}
      {recommendedIndustries.length > 0 && (
        <div style={{
          padding: '10px 16px', marginBottom: space[3],
          background: color.white, borderRadius: radius.md,
          border: `1px solid ${color.border}`,
          borderLeft: `3px solid ${color.gold}`,
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
      </FilterBar>

      <DataTable columns={columns} rows={data.rows} rowKey={(r, i) => `${r.item_id}-${i}`} loading={loading}
        emptyMessage="該当する企業がありません。" height="calc(100vh - 580px)" fillWidth />

      {data.total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || loading}>前へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || loading}>次へ</Button>
        </div>
      )}
    </div>
  );
}
