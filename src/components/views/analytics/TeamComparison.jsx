import React, { useMemo, useState } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card } from '../../ui';

// チーム比較: 各チームの架電・接続率・アポ・当社売上。
// チーム行をクリックすると、そのチームのメンバー別の数字を展開表示する。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

function buildMemberRows(rankByPerson, appoData, range, teamMap) {
  const map = new Map();
  const ensure = (name) => {
    if (!map.has(name)) map.set(name, { name, team: teamMap[name] || 'その他', calls: 0, connect: 0, appo: 0, sales: 0 });
    return map.get(name);
  };
  (rankByPerson || []).forEach(p => {
    const o = ensure(p.name);
    o.calls += p.call || 0; o.connect += p.connect || 0; o.appo += p.appo || 0;
  });
  (appoData || []).forEach(a => {
    if (!SALES_STATUSES.includes(a.status) || a.isProspecting) return;
    if (!a.meetDate || a.meetDate < range.from || a.meetDate > range.to) return;
    if (!a.getter) return;
    ensure(a.getter).sales += Number(a.sales || 0);
  });
  return [...map.values()].map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0 }));
}

const COLS = [
  { key: 'name', label: '', flex: 1, align: 'left' },
  { key: 'calls', label: '架電', w: 70, align: 'right' },
  { key: 'connect', label: '接続', w: 70, align: 'right' },
  { key: 'connectRate', label: '接続率', w: 70, align: 'right', pct: true },
  { key: 'appo', label: 'アポ', w: 60, align: 'right', gold: true },
  { key: 'sales', label: '当社売上', w: 120, align: 'right', yen: true },
];

function Cell({ col, v, bold }) {
  let disp = v;
  if (col.pct) disp = `${Number(v).toFixed(1)}%`;
  else if (col.yen) disp = `¥${Number(v).toLocaleString()}`;
  else if (typeof v === 'number') disp = v.toLocaleString();
  return (
    <span style={{
      flex: col.flex ? col.flex : undefined, width: col.w, textAlign: col.align,
      fontFamily: (col.pct || col.yen || col.key !== 'name') ? font.family.mono : font.family.sans,
      fontSize: font.size.sm, fontWeight: bold || col.gold ? font.weight.semibold : font.weight.normal,
      color: col.gold ? color.gold : (col.key === 'name' ? color.navy : color.textDark),
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{disp}</span>
  );
}

export default function TeamComparison({ rankByPerson, appoData, range, teamMap }) {
  const [openTeam, setOpenTeam] = useState(null);

  const memberRows = useMemo(
    () => buildMemberRows(rankByPerson, appoData, range, teamMap),
    [rankByPerson, appoData, range, teamMap]
  );

  const teamRows = useMemo(() => {
    const map = new Map();
    memberRows.forEach(m => {
      if (!map.has(m.team)) map.set(m.team, { team: m.team, calls: 0, connect: 0, appo: 0, sales: 0 });
      const o = map.get(m.team);
      o.calls += m.calls; o.connect += m.connect; o.appo += m.appo; o.sales += m.sales;
    });
    return [...map.values()]
      .map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0 }))
      .sort((a, b) => b.sales - a.sales || b.appo - a.appo);
  }, [memberRows]);

  const HeaderRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${color.border}`, background: color.gray50 }}>
      <span style={{ width: 18 }} />
      {COLS.map(c => (
        <span key={c.key} style={{ flex: c.flex, width: c.w, textAlign: c.align, fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>
          {c.key === 'name' ? 'チーム / メンバー' : c.label}
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        チーム比較（クリックでメンバー内訳）
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <HeaderRow />
        {teamRows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>データがありません</div>
        )}
        {teamRows.map(t => {
          const open = openTeam === t.team;
          const members = memberRows
            .filter(m => m.team === t.team)
            .sort((a, b) => b.sales - a.sales || b.appo - a.appo);
          return (
            <React.Fragment key={t.team}>
              <div onClick={() => setOpenTeam(open ? null : t.team)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
                  borderBottom: `1px solid ${alpha(color.border, 0.6)}`, background: open ? alpha(color.navyLight, 0.05) : color.white }}>
                <span style={{ width: 18, color: color.textLight, fontSize: font.size.xs }}>{open ? '▾' : '▸'}</span>
                {COLS.map(c => <Cell key={c.key} col={c} v={t[c.key === 'name' ? 'team' : c.key]} bold />)}
              </div>
              {open && members.map(m => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 30px',
                  borderBottom: `1px solid ${alpha(color.border, 0.4)}`, background: alpha(color.navyLight, 0.02) }}>
                  {COLS.map(c => <Cell key={c.key} col={c} v={m[c.key]} />)}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        架電/接続/アポ=行動日ベース、当社売上=面談実施日ベース。チーム行クリックでメンバー別に展開。
      </div>
    </div>
  );
}
