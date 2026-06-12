import React, { useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card, DataTable } from '../../ui';

// 個人別 当社売上ランキング（面談実施日ベース）。
// SALES_STATUSES = 面談済/事前確認済/アポ取得、クライアント開拓(isProspecting)は売上対象外。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

export default function SalesRanking({ appoData, range, teamMap = {} }) {
  const rows = useMemo(() => {
    const map = new Map();
    (appoData || []).forEach(a => {
      if (!SALES_STATUSES.includes(a.status) || a.isProspecting) return;
      if (!a.meetDate || a.meetDate < range.from || a.meetDate > range.to) return;
      const name = a.getter || '—';
      if (!map.has(name)) map.set(name, { name, sales: 0, appo: 0 });
      const o = map.get(name);
      o.sales += Number(a.sales || 0);
      o.appo += 1;
    });
    return [...map.values()]
      .filter(r => r.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .map((r, i) => ({ ...r, rank: i + 1, team: teamMap[r.name] || '—' }));
  }, [appoData, range, teamMap]);

  const columns = [
    { key: 'rank', label: '#', width: 44, align: 'center',
      render: (r) => <span style={{ fontWeight: font.weight.bold, color: r.rank <= 3 ? color.gold : color.textMid }}>{r.rank}</span> },
    { key: 'name', label: 'メンバー', width: 160, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.name}</span> },
    { key: 'team', label: 'チーム', width: 110, align: 'left',
      render: (r) => <span style={{ fontSize: font.size.xs, color: color.textMid }}>{r.team}</span> },
    { key: 'appo', label: '面談アポ', width: 80, align: 'right' },
    { key: 'sales', label: '当社売上', width: 130, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.semibold, color: color.navy }}>¥{Number(r.sales).toLocaleString()}</span> },
  ];

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        個人別 売上ランキング
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <DataTable columns={columns} rows={rows} rowKey="name" emptyMessage="この期間の売上がありません" fillWidth />
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        面談実施日ベース。面談済/事前確認済/アポ取得が対象（リスケ・キャンセル除外、クライアント開拓除外）。
      </div>
    </div>
  );
}
