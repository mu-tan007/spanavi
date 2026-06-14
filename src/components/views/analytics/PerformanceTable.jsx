import React, { useMemo, useState, useEffect } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card, DataTable } from '../../ui';
import { fetchCallRecordsByRange, fetchCallListsMeta } from '../../../lib/supabaseWrite';
import { useCallStatuses } from '../../../hooks/useCallStatuses';

const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

// 架電パフォーマンス表（架電/接続/接続率/アポ/アポ率/最終架電日）。
// groupBy='list'（リスト単位） | 'client'（クライアント単位）で集約軸を切替。
// データ: call_records を期間取得し list_id → list/client メタで解決して集計。
export default function PerformanceTable({ range, groupBy, title }) {
  const { keymanConnectLabels } = useCallStatuses();
  const [records, setRecords] = useState([]);
  const [listMeta, setListMeta] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCallListsMeta().then(({ data }) => setListMeta(data || []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCallRecordsByRange(_jstStart(range.from), _jstEnd(range.to)).then(({ data }) => {
      if (!cancelled) { setRecords(data || []); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  // list_id → { listName, clientName }
  const listMap = useMemo(() => {
    const m = new Map();
    (listMeta || []).forEach(l => {
      m.set(l.id, {
        listName: l.name || '—',
        clientName: l.clients?.name || (l.name || '').split(' - ')[0] || '—',
        archived: l.is_archived,
      });
    });
    return m;
  }, [listMeta]);

  const connectSet = useMemo(() => new Set(keymanConnectLabels || []), [keymanConnectLabels]);

  const rows = useMemo(() => {
    const map = new Map();
    (records || []).forEach(r => {
      const meta = listMap.get(r.list_id);
      if (!meta) return;
      const key = groupBy === 'client' ? meta.clientName : r.list_id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          clientName: meta.clientName,
          listName: meta.listName,
          calls: 0, connect: 0, appo: 0, lastDate: '',
        });
      }
      const o = map.get(key);
      o.calls += 1;
      if (connectSet.has(r.status)) o.connect += 1;
      if (r.status === 'アポ獲得') o.appo += 1;
      const d = (r.called_at || '').slice(0, 10);
      if (d > o.lastDate) o.lastDate = d;
    });
    return [...map.values()]
      .map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0, appoRate: o.calls ? (o.appo / o.calls) * 100 : 0 }))
      .sort((a, b) => b.calls - a.calls);
  }, [records, listMap, connectSet, groupBy]);

  const RateBar = ({ value, good }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', width: '100%' }}>
      <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textDark }}>{value.toFixed(1)}%</span>
      <span style={{ width: 34, height: 5, borderRadius: 3, background: color.gray100, overflow: 'hidden', flexShrink: 0 }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(value, 100)}%`, background: good }} />
      </span>
    </span>
  );

  const columns = groupBy === 'client'
    ? [
        { key: 'clientName', label: 'クライアント', width: 220, align: 'left',
          render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.clientName}</span> },
        { key: 'calls', label: '架電', width: 80, align: 'right' },
        { key: 'connect', label: '接続', width: 70, align: 'right' },
        { key: 'connectRate', label: '接続率', width: 110, align: 'right', render: (r) => <RateBar value={r.connectRate} good={color.navyLight} /> },
        { key: 'appo', label: 'アポ', width: 60, align: 'right', render: (r) => <span style={{ color: color.gold, fontWeight: font.weight.semibold }}>{r.appo}</span> },
        { key: 'appoRate', label: 'アポ率', width: 110, align: 'right', render: (r) => <RateBar value={r.appoRate} good={color.gold} /> },
        { key: 'lastDate', label: '最終架電', width: 100, align: 'right',
          render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid }}>{r.lastDate || '—'}</span> },
      ]
    : [
        { key: 'clientName', label: 'クライアント', width: 180, align: 'left',
          render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.clientName}</span> },
        { key: 'listName', label: 'リスト', width: 200, align: 'left',
          render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.listName}</span> },
        { key: 'calls', label: '架電', width: 70, align: 'right' },
        { key: 'connect', label: '接続', width: 60, align: 'right' },
        { key: 'connectRate', label: '接続率', width: 105, align: 'right', render: (r) => <RateBar value={r.connectRate} good={color.navyLight} /> },
        { key: 'appo', label: 'アポ', width: 55, align: 'right', render: (r) => <span style={{ color: color.gold, fontWeight: font.weight.semibold }}>{r.appo}</span> },
        { key: 'appoRate', label: 'アポ率', width: 105, align: 'right', render: (r) => <RateBar value={r.appoRate} good={color.gold} /> },
        { key: 'lastDate', label: '最終架電', width: 95, align: 'right',
          render: (r) => <span style={{ fontFamily: font.family.mono, fontSize: font.size.xs, color: color.textMid }}>{r.lastDate || '—'}</span> },
      ];

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        {title}
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <DataTable columns={columns} rows={rows} rowKey="key" loading={loading}
          emptyMessage="この期間の架電がありません" fillWidth />
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        架電日ベース。接続率=キーマン接続/架電、アポ率=アポ獲得/架電。
      </div>
    </div>
  );
}
