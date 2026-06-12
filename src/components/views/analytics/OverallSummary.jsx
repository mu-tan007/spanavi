import React, { useMemo } from 'react';
import { color, space, font } from '../../../constants/design';
import { Card } from '../../ui';

// タブ①全体の実績サマリー（目標なし・実績のみ）。
// 行動量は scopedStats（行動日ベース集計）、当社売上は appoData（面談実施日ベース）。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

export default function OverallSummary({ stats, appoData, range }) {
  const sales = useMemo(() => {
    return (appoData || [])
      .filter(a => SALES_STATUSES.includes(a.status) && !a.isProspecting && a.meetDate && a.meetDate >= range.from && a.meetDate <= range.to)
      .reduce((s, a) => s + Number(a.sales || 0), 0);
  }, [appoData, range]);

  const connectRate = stats.calls ? (stats.keymanConnect / stats.calls) * 100 : 0;
  const cards = [
    { label: '架電数', value: (stats.calls || 0).toLocaleString(), unit: '件' },
    { label: 'キーマン接続', value: (stats.keymanConnect || 0).toLocaleString(), unit: '件' },
    { label: '接続率', value: connectRate.toFixed(1), unit: '%' },
    { label: 'アポ獲得', value: (stats.appo || 0).toLocaleString(), unit: '件', accent: true },
    { label: '当社売上', value: '¥' + Number(sales).toLocaleString(), unit: '' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: space[3], marginBottom: space[4] }}>
      {cards.map((c, i) => (
        <Card key={i} padding="md">
          <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: font.weight.bold, color: c.accent ? color.gold : color.navy, fontFamily: font.family.mono }}>
            {c.value}<span style={{ fontSize: font.size.sm, color: color.textLight, marginLeft: 2 }}>{c.unit}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
