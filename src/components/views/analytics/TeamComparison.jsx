import React, { useMemo, useState, useEffect } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card } from '../../ui';
import { fetchMemberPerformance } from '../../../lib/supabaseWrite';

// チーム比較: 各チームの架電・接続率・アポ・シフト時間・実稼働時間・当社売上。
// チーム行クリックで、そのチームのメンバー別の数字を展開表示する。
// 架電/接続/アポ/シフト/稼働は business_overview_member_performance（事業俯瞰と同じRPC）、
// 当社売上は appoData（面談実施日ベース）。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

// 列定義（name列はチーム/メンバー名、それ以外は数値）
const COLS = [
  { key: 'name', label: 'チーム / メンバー', flex: 1, align: 'left' },
  { key: 'shift_hours', label: 'シフト', w: 70, align: 'right', hour: true },
  { key: 'worked_hours', label: '稼働', w: 70, align: 'right', hour: true },
  { key: 'calls', label: '架電', w: 70, align: 'right' },
  { key: 'connect', label: '接続', w: 70, align: 'right' },
  { key: 'connectRate', label: '接続率', w: 70, align: 'right', pct: true },
  { key: 'appo', label: 'アポ', w: 60, align: 'right', gold: true },
  { key: 'sales', label: '当社売上', w: 120, align: 'right', yen: true },
];

// チーム/メンバー共通のソート比較値（name列はチーム名 or メンバー名）
function sortValue(row, key, isTeam) {
  if (key === 'name') return isTeam ? row.team : row.name;
  return row[key];
}
function compareBy(key, dir, isTeam) {
  const d = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = sortValue(a, key, isTeam);
    const vb = sortValue(b, key, isTeam);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'ja') * d;
  };
}

function Cell({ col, v, bold }) {
  let disp = v;
  if (col.pct) disp = `${Number(v || 0).toFixed(1)}%`;
  else if (col.yen) disp = `¥${Number(v || 0).toLocaleString()}`;
  else if (col.hour) disp = `${Number(v || 0).toFixed(1)}h`;
  else if (typeof v === 'number') disp = v.toLocaleString();
  return (
    <span style={{
      flex: col.flex ? col.flex : undefined, width: col.w, textAlign: col.align,
      fontFamily: col.key === 'name' ? font.family.sans : font.family.mono,
      fontSize: font.size.sm, fontWeight: bold || col.gold ? font.weight.semibold : font.weight.normal,
      color: col.gold ? color.gold : (col.key === 'name' ? color.navy : color.textDark),
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{disp}</span>
  );
}

export default function TeamComparison({ appoData, range }) {
  const [perf, setPerf] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openTeam, setOpenTeam] = useState(null);
  const [sort, setSort] = useState({ key: 'sales', dir: 'desc' });

  const onSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMemberPerformance(range.from, range.to).then(({ data }) => {
      if (!cancelled) { setPerf(data || []); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  // 当社売上（面談実施日ベース）をメンバー名で集計
  const salesByMember = useMemo(() => {
    const m = {};
    (appoData || []).forEach(a => {
      if (!SALES_STATUSES.includes(a.status) || a.isProspecting) return;
      if (!a.meetDate || a.meetDate < range.from || a.meetDate > range.to) return;
      if (!a.getter) return;
      m[a.getter] = (m[a.getter] || 0) + Number(a.sales || 0);
    });
    return m;
  }, [appoData, range.from, range.to]);

  // メンバー行（RPC + 売上）
  const memberRows = useMemo(() => (perf || [])
    .filter(p => (p.call_count || 0) > 0 || (p.shift_hours || 0) > 0)
    .map(p => ({
      name: p.member_name,
      team: p.team || 'その他',
      shift_hours: Number(p.shift_hours || 0),
      worked_hours: Number(p.worked_hours || 0),
      calls: Number(p.call_count || 0),
      connect: Number(p.keyman_connect_count || 0),
      appo: Number(p.apo_count || 0),
      connectRate: p.call_count ? (Number(p.keyman_connect_count) / Number(p.call_count)) * 100 : 0,
      sales: salesByMember[p.member_name] || 0,
    })), [perf, salesByMember]);

  // チーム行（メンバー集計）
  const teamRows = useMemo(() => {
    const map = new Map();
    memberRows.forEach(m => {
      if (!map.has(m.team)) map.set(m.team, { team: m.team, shift_hours: 0, worked_hours: 0, calls: 0, connect: 0, appo: 0, sales: 0 });
      const o = map.get(m.team);
      o.shift_hours += m.shift_hours; o.worked_hours += m.worked_hours;
      o.calls += m.calls; o.connect += m.connect; o.appo += m.appo; o.sales += m.sales;
    });
    return [...map.values()]
      .map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0 }))
      .sort(compareBy(sort.key, sort.dir, true));
  }, [memberRows, sort]);

  const HeaderRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${color.border}`, background: color.gray50 }}>
      <span style={{ width: 18 }} />
      {COLS.map(c => {
        const active = sort.key === c.key;
        const indicator = active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅';
        return (
          <span key={c.key} onClick={() => onSort(c.key)}
            style={{ flex: c.flex, width: c.w, textAlign: c.align, fontSize: font.size.xs, color: active ? color.navy : color.textLight, fontWeight: font.weight.semibold, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
            {c.label}
            <span style={{ marginLeft: 3, fontSize: 9, opacity: active ? 1 : 0.45, verticalAlign: 'middle' }}>{indicator}</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        チーム比較（クリックでメンバー内訳）
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            <HeaderRow />
            {loading && <div style={{ padding: 20, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読み込み中...</div>}
            {!loading && teamRows.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>データがありません</div>
            )}
            {!loading && teamRows.map(t => {
              const open = openTeam === t.team;
              const members = memberRows
                .filter(m => m.team === t.team)
                .sort(compareBy(sort.key, sort.dir, false));
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
          </div>
        </div>
      </Card>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 6 }}>
        架電/接続/アポ/シフト/稼働=行動日ベース、当社売上=面談実施日ベース。チーム行クリックでメンバー別に展開。
      </div>
    </div>
  );
}
