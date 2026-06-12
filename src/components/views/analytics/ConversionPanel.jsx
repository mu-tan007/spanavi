import React, { useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card, DataTable } from '../../ui';

// アポの転換率分析。
// 「取ったアポ（getDateが期間内）」が、面談まで到達したか / 流れたか を
// メンバー単位 or クライアント単位で集計する。
//   面談到達 = status が「面談済」
//   失注     = status が「キャンセル / リスケ / リスケ中」
//   進行中   = status が「アポ取得 / 事前確認済」（まだ面談前）
const REACHED = ['面談済'];
const LOST    = ['キャンセル', 'リスケ', 'リスケ中'];

function aggregate(appoData, range, keyFn) {
  const map = new Map();
  (appoData || []).forEach(a => {
    if (!a.getDate || a.getDate < range.from || a.getDate > range.to) return;
    const key = keyFn(a);
    if (!key) return;
    if (!map.has(key)) map.set(key, { key, total: 0, reached: 0, lost: 0, ongoing: 0 });
    const o = map.get(key);
    o.total += 1;
    if (REACHED.includes(a.status)) o.reached += 1;
    else if (LOST.includes(a.status)) o.lost += 1;
    else o.ongoing += 1;
  });
  return [...map.values()]
    .map(o => ({ ...o, reachRate: o.total ? (o.reached / o.total) * 100 : 0, lostRate: o.total ? (o.lost / o.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

export default function ConversionPanel({ appoData, range, by, title }) {
  // by: 'getter'（メンバー単位） | 'client'（クライアント単位）
  const rows = useMemo(
    () => aggregate(appoData, range, a => (by === 'client' ? a.client : a.getter)),
    [appoData, range, by]
  );

  const RateCell = ({ value, good }) => (
    <span style={{
      fontFamily: font.family.mono, fontWeight: font.weight.semibold,
      color: good ? color.success : color.danger,
    }}>{value.toFixed(0)}%</span>
  );

  const columns = [
    { key: 'key', label: by === 'client' ? 'クライアント' : 'メンバー', width: 200, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.key || '—'}</span> },
    { key: 'total', label: 'アポ', width: 70, align: 'right' },
    { key: 'reached', label: '面談済', width: 70, align: 'right' },
    { key: 'ongoing', label: '進行中', width: 70, align: 'right',
      render: (r) => <span style={{ color: color.textMid }}>{r.ongoing}</span> },
    { key: 'lost', label: '流出', width: 70, align: 'right',
      render: (r) => <span style={{ color: color.danger }}>{r.lost}</span> },
    { key: 'reachRate', label: '面談到達率', width: 100, align: 'right',
      render: (r) => <RateCell value={r.reachRate} good={r.reachRate >= 60} /> },
    { key: 'lostRate', label: '流出率', width: 90, align: 'right',
      render: (r) => <RateCell value={r.lostRate} good={r.lostRate < 25} /> },
  ];

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        {title}
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="key"
          emptyMessage="この期間に取得したアポがありません"
          fillWidth
        />
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        集計は「アポ取得日」基準。面談到達率=面談済/アポ、流出率=（キャンセル+リスケ）/アポ。進行中=面談前のアポ。
      </div>
    </div>
  );
}
