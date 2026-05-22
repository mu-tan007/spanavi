import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Button, Badge, DataTable } from '../../ui';
import { supabase } from '../../../lib/supabase';
import { PanelHeader, KPI, FilterBar } from './smartQueueHelpers';
import MultiSelectDropdown from './MultiSelectDropdown';
import { useCallQueue } from './useCallQueue';

// ① キーマン断り一覧
//   表示は 200件/ページ（軽量）、 架電キューは ids RPC で全件対象
const PAGE_SIZE = 200;

const TEMP_BADGE = {
  HIGH:      { variant: 'success', label: '温度感: 高' },
  MEDIUM:    { variant: 'info',    label: '温度感: 中' },
  LOW:       { variant: 'danger',  label: '温度感: 低' },
  UNCERTAIN: { variant: 'neutral', label: '判定困難' },
};

function extractTemp(text) {
  if (!text) return null;
  const m = text.match(/^(HIGH|MEDIUM|LOW)/i);
  return m ? m[1].toUpperCase() : null;
}

export default function KeymanRejectionsPanel({ setCallFlowScreen, callListData = [], categoryId = null, engIds = [], allEngagements = [] }) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(new Set());
  const [getterFilter, setGetterFilter] = useState([]);
  const [tempFilter, setTempFilter] = useState([]); // 日本語ラベル配列 ['高','中','低','未判定']
  const [sortKey, setSortKey] = useState('reject_asc');

  const TEMP_OPTIONS = ['高', '中', '低', '未判定'];
  const TEMP_LABEL_TO_CODE = { '高': 'HIGH', '中': 'MEDIUM', '低': 'LOW', '未判定': 'UNCERTAIN' };
  const tempCodes = tempFilter.map(l => TEMP_LABEL_TO_CODE[l]).filter(Boolean);

  // 商材・タイプはサーバー側 filter （p_engagement_ids）に統一
  const engagementIds = useMemo(() => {
    if (engIds.length > 0) return engIds;
    if (categoryId) {
      return (allEngagements || []).filter(e => e.category_id === categoryId).map(e => e.id);
    }
    return null;
  }, [categoryId, engIds, allEngagements]);

  // ページ表示用データ
  const { data: pageData, isPending } = useQuery({
    queryKey: ['smart_queue_keyman_rejections', engagementIds, getterFilter, tempFilter, sortKey, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('smart_queue_keyman_rejections', {
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
        p_getter_names:  getterFilter.length ? getterFilter : null,
        p_temps:         tempCodes.length ? tempCodes : null,
        p_sort:          sortKey,
        p_offset:        page * PAGE_SIZE,
        p_limit:         PAGE_SIZE,
      });
      if (error) console.warn('[KeymanRejectionsPanel] failed:', error);
      return data || { total: 0, rows: [], getters: [] };
    },
  });

  const filteredRows = pageData?.rows || [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const getterOptions = pageData?.getters || [];

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
  };

  // 架電キュー: ids RPC で全件取得（軽量）
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const [openingQueue, setOpeningQueue] = useState(false);
  const handleCall = async (row) => {
    setOpeningQueue(true);
    try {
      const { data } = await supabase.rpc('smart_queue_keyman_rejections_ids', {
        p_engagement_id: null,
        p_engagement_ids: engagementIds,
        p_getter_names:  getterFilter.length ? getterFilter : null,
        p_temps:         tempCodes.length ? tempCodes : null,
        p_sort:          sortKey,
      });
      const ids = Array.isArray(data) ? data : [];
      const idx = ids.findIndex(r => r.item_id === row.item_id);
      openQueue(ids, idx >= 0 ? idx : 0);
    } catch (e) {
      console.warn('[KeymanRejectionsPanel] queue fetch failed:', e);
      const idx = filteredRows.findIndex(r => r.item_id === row.item_id);
      openQueue(filteredRows, idx >= 0 ? idx : 0);
    } finally {
      setOpeningQueue(false);
    }
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
    { key: 'days_since_reject', label: '断りから', width: 90, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs }}>{Math.floor(r.days_since_reject)}日</span> },
    { key: 'getter_name', label: '担当', width: 80, align: 'center',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.getter_name || '—'}</span> },
    { key: 'list_name', label: '元リスト', width: 180, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.list_name || '—'}</span> },
    { key: 'temp', label: '温度感', width: 100, align: 'center',
      render: (r) => {
        const temp = extractTemp(r.rejection_reason);
        const conf = temp ? TEMP_BADGE[temp] : TEMP_BADGE.UNCERTAIN;
        const isUnjudged = !r.rejection_reason;
        return isUnjudged ? <Badge variant="neutral">未判定</Badge> : <Badge variant={conf.variant} dot>{conf.label}</Badge>;
      },
    },
    { key: 'memo', label: '断り理由メモ', width: 320, align: 'left',
      render: (r) => {
        // 冒頭の温度感プレフィックス（HIGH\n / MEDIUM\n / LOW\n）は表示から除去
        const text = (r.rejection_reason || '').replace(/^(HIGH|MEDIUM|LOW)\s*\n?/, '').trim();
        if (!text) return <span style={{ color: color.textLight, fontSize: font.size.xs }}>—</span>;
        const isOpen = expanded.has(r.record_id);
        const PREVIEW_LEN = 80;
        const isLong = text.length > PREVIEW_LEN;
        const preview = isLong && !isOpen ? text.slice(0, PREVIEW_LEN) + '…' : text;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
            <span style={{
              fontSize: font.size.xs, color: color.textDark, lineHeight: font.lineHeight.relaxed,
              whiteSpace: isOpen ? 'pre-wrap' : 'normal',
            }}>{preview}</span>
            {isLong && (
              <button onClick={() => toggleExpand(r.record_id)} style={{
                alignSelf: 'flex-start',
                padding: '0', background: 'transparent', border: 'none',
                color: color.navy, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
                cursor: 'pointer', fontFamily: font.family.sans, textDecoration: 'underline',
              }}>{isOpen ? '閉じる' : 'もっと見る'}</button>
            )}
          </div>
        );
      },
    },
    { key: 'action', label: '架電', width: 80, align: 'center',
      render: (r) => <Button size="sm" variant="primary" onClick={() => handleCall(r)} loading={openingQueue} disabled={!r.list_id || !r.item_id}>架電</Button> },
  ];

  return (
    <div>
      <PanelHeader
        title="① キーマン断り一覧"
        leftKpi={<KPI label="表示中" value={`${filteredRows.length} 件`} />}
        rightKpi={<KPI label="総数" value={`${total.toLocaleString()} 件`} muted />}
      />

      <FilterBar>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>並び順:</span>
        <select value={sortKey} onChange={e => { setSortKey(e.target.value); setPage(0); }} style={{
          padding: '5px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
          fontSize: font.size.xs, color: color.textDark, fontFamily: font.family.sans, background: color.white, cursor: 'pointer',
        }}>
          <option value="reject_asc">断りから日数が少ない順</option>
          <option value="reject_desc">断りから日数が多い順</option>
          <option value="temp_desc">温度感: 高→低</option>
          <option value="temp_asc">温度感: 低→高</option>
        </select>
        <span style={{ color: color.border }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>温度感:</span>
        <MultiSelectDropdown placeholder="温度感を選択（複数可）" options={TEMP_OPTIONS} values={tempFilter}
          onChange={v => { setTempFilter(v); setPage(0); }} width={180} />
        <span style={{ color: color.border }}>|</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>断り担当:</span>
        <MultiSelectDropdown placeholder="担当者を選択（複数可）" options={getterOptions} values={getterFilter}
          onChange={v => { setGetterFilter(v); setPage(0); }} width={220} />
      </FilterBar>

      <DataTable columns={columns} rows={filteredRows} rowKey="record_id" loading={isPending}
        emptyMessage="該当するキーマン断り案件がありません。" height="calc(100vh - 540px)" fillWidth />

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: space[2], padding: space[3] }}>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || isPending}>前へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontFamily: font.family.mono, minWidth: 100, textAlign: 'center' }}>{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1 || isPending}>次へ</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[3] }}>
            {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} / {total.toLocaleString()} 件
          </span>
        </div>
      )}
    </div>
  );
}
