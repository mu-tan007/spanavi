import React, { useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card, DataTable } from '../../ui';

// チーム比較: 各チームの架電・接続率・アポ・当社売上を並べる。
// rankByPerson(=メンバー別 call/connect/appo) を teamMap でチームへ集約し、
// 売上は appoData（面談実施日ベース）から。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

export default function TeamComparison({ rankByPerson, appoData, range, teamMap }) {
  const rows = useMemo(() => {
    const map = new Map();
    const ensure = (team) => {
      if (!map.has(team)) map.set(team, { team, calls: 0, connect: 0, appo: 0, sales: 0 });
      return map.get(team);
    };
    (rankByPerson || []).forEach(p => {
      const team = teamMap[p.name] || 'その他';
      const o = ensure(team);
      o.calls += p.call || 0; o.connect += p.connect || 0; o.appo += p.appo || 0;
    });
    // 売上は面談実施日ベース（meetDateが期間内）
    (appoData || []).forEach(a => {
      if (!SALES_STATUSES.includes(a.status) || a.isProspecting) return;
      if (!a.meetDate || a.meetDate < range.from || a.meetDate > range.to) return;
      const team = teamMap[a.getter] || 'その他';
      ensure(team).sales += Number(a.sales || 0);
    });
    return [...map.values()]
      .map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0 }))
      .sort((a, b) => b.sales - a.sales || b.appo - a.appo);
  }, [rankByPerson, appoData, range, teamMap]);

  const columns = [
    { key: 'team', label: 'チーム', width: 130, align: 'left',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{r.team}</span> },
    { key: 'calls', label: '架電', width: 80, align: 'right' },
    { key: 'connect', label: 'キーマン接続', width: 110, align: 'right' },
    { key: 'connectRate', label: '接続率', width: 80, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono }}>{r.connectRate.toFixed(1)}%</span> },
    { key: 'appo', label: 'アポ', width: 70, align: 'right',
      render: (r) => <span style={{ fontWeight: font.weight.semibold, color: color.gold }}>{r.appo}</span> },
    { key: 'sales', label: '当社売上', width: 120, align: 'right',
      render: (r) => <span style={{ fontFamily: font.family.mono, color: color.navy }}>¥{Number(r.sales).toLocaleString()}</span> },
  ];

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        チーム比較
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <DataTable columns={columns} rows={rows} rowKey="team" emptyMessage="データがありません" fillWidth />
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        架電/接続/アポ=行動日ベース、当社売上=面談実施日ベース。
      </div>
    </div>
  );
}
