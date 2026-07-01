import React, { useMemo, useState, useEffect } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import { Card } from '../../ui';
import { fetchMemberPerformance } from '../../../lib/supabaseWrite';

// チーム比較: 各チームの架電・接続率・アポ・シフト時間・実稼働時間・当社売上。
// 各チームのメンバー別の数字を常時展開表示する（アコーディオン廃止・常に全開）。
// 架電/接続/アポ/シフト/稼働は business_overview_member_performance（事業俯瞰と同じRPC）、
// 当社売上は appoData（面談実施日ベース）。
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

// 列定義（name列はチーム/メンバー名、それ以外は数値）
const COLS = [
  { key: 'name', label: 'チーム / メンバー', flex: 1, align: 'left' },
  { key: 'shift_hours', label: 'シフト', w: 84, align: 'right', hour: true },
  { key: 'worked_hours', label: '稼働', w: 84, align: 'right', hour: true },
  { key: 'calls', label: '架電', w: 84, align: 'right' },
  { key: 'connect', label: '接続', w: 84, align: 'right' },
  { key: 'connectRate', label: '接続率', w: 84, align: 'right', pct: true },
  { key: 'appo', label: 'アポ', w: 72, align: 'right', gold: true },
  { key: 'sales', label: '当社売上', w: 140, align: 'right', yen: true },
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

function Cell({ col, v, bold, suffix }) {
  let disp = v;
  if (col.pct) disp = `${Number(v || 0).toFixed(1)}%`;
  else if (col.yen) disp = `¥${Number(v || 0).toLocaleString()}`;
  else if (col.hour) disp = `${Number(v || 0).toFixed(1)}h`;
  else if (typeof v === 'number') disp = v.toLocaleString();
  // 売上は強調（チーム行は太字＋navy、メンバー行も視認しやすく）
  const isSales = col.key === 'sales';
  return (
    <span style={{
      flex: col.flex ? col.flex : undefined, width: col.w, textAlign: col.align,
      fontFamily: col.key === 'name' ? font.family.sans : font.family.mono,
      fontSize: col.key === 'name' ? font.size.md : font.size.md,
      fontWeight: bold || col.gold || isSales ? font.weight.semibold : font.weight.normal,
      color: col.gold ? color.gold : (col.key === 'name' ? color.navy : color.textDark),
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      letterSpacing: col.key === 'name' ? 0 : 0.2,
    }}>{disp}{suffix}</span>
  );
}

// 退職者（在籍外）メンバー行に付ける控えめなタグ
const RetiredTag = () => (
  <span style={{
    marginLeft: 6, fontSize: 10, fontWeight: font.weight.semibold, color: color.textLight,
    border: `1px solid ${color.border}`, borderRadius: radius.sm, padding: '0 5px',
    lineHeight: '15px', display: 'inline-block', verticalAlign: 'middle',
  }}>退職</span>
);

export default function TeamComparison({ appoData, range, memberDir = {} }) {
  const [perf, setPerf] = useState([]);
  const [loading, setLoading] = useState(false);
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

  // perf（在籍者のみ返すRPC）に出てこない担当者の売上を補完する。
  // 退職者は perf に行が無いため、そのままだと計上した売上がチーム合計にも「その他」にも
  // 入らず消えてしまう。memberDir（退職者含む名簿）で旧チームに紐付け、0稼働の行として補完する。
  const orphanRows = useMemo(() => {
    const present = new Set(memberRows.map(m => m.name));
    return Object.entries(salesByMember)
      .filter(([name, sales]) => name && !present.has(name) && Number(sales) > 0)
      .map(([name, sales]) => {
        const dir = memberDir[name];
        return {
          name,
          team: (dir && dir.team) || 'その他',
          shift_hours: 0, worked_hours: 0, calls: 0, connect: 0, appo: 0, connectRate: 0,
          sales: Number(sales) || 0,
          // 名簿にあり在籍=false→退職。名簿外の名前も在籍稼働に出ないので退職扱いでタグ表示。
          retired: dir ? !dir.active : true,
        };
      });
  }, [salesByMember, memberRows, memberDir]);

  const allRows = useMemo(() => [...memberRows, ...orphanRows], [memberRows, orphanRows]);

  // チーム行（メンバー集計）
  const teamRows = useMemo(() => {
    const map = new Map();
    allRows.forEach(m => {
      if (!map.has(m.team)) map.set(m.team, { team: m.team, shift_hours: 0, worked_hours: 0, calls: 0, connect: 0, appo: 0, sales: 0 });
      const o = map.get(m.team);
      o.shift_hours += m.shift_hours; o.worked_hours += m.worked_hours;
      o.calls += m.calls; o.connect += m.connect; o.appo += m.appo; o.sales += m.sales;
    });
    return [...map.values()]
      .map(o => ({ ...o, connectRate: o.calls ? (o.connect / o.calls) * 100 : 0 }))
      .sort(compareBy(sort.key, sort.dir, true));
  }, [allRows, sort]);

  const HeaderRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `2px solid ${color.navy}`, background: color.navy }}>
      <span style={{ width: 14 }} />
      {COLS.map(c => {
        const active = sort.key === c.key;
        const indicator = active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅';
        return (
          <span key={c.key} onClick={() => onSort(c.key)}
            style={{ flex: c.flex, width: c.w, textAlign: c.align, fontSize: font.size.sm, color: active ? color.white : alpha(color.white, 0.78), fontWeight: font.weight.bold, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
            {c.label}
            <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.5, verticalAlign: 'middle' }}>{indicator}</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
        チーム比較
      </div>
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 820 }}>
            <HeaderRow />
            {loading && <div style={{ padding: 24, textAlign: 'center', color: color.textLight, fontSize: font.size.md }}>読み込み中...</div>}
            {!loading && teamRows.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: color.textLight, fontSize: font.size.md }}>データがありません</div>
            )}
            {!loading && teamRows.map((t, ti) => {
              const members = allRows
                .filter(m => m.team === t.team)
                .sort(compareBy(sort.key, sort.dir, false));
              return (
                <React.Fragment key={t.team}>
                  {/* チーム合計行（常時表示・濃色帯で強調） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                    borderTop: ti === 0 ? 'none' : `2px solid ${color.border}`,
                    borderBottom: `1px solid ${alpha(color.navy, 0.18)}`, background: alpha(color.navyLight, 0.09) }}>
                    <span style={{ width: 14, height: 14, borderRadius: radius.sm, background: color.navy, flexShrink: 0 }} />
                    {COLS.map(c => <Cell key={c.key} col={c} v={t[c.key === 'name' ? 'team' : c.key]} bold />)}
                  </div>
                  {/* メンバー行（常時展開） */}
                  {members.map((m, mi) => (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px 9px 16px',
                      borderBottom: `1px solid ${alpha(color.border, 0.5)}`,
                      background: mi % 2 === 0 ? color.white : color.cream }}>
                      <span style={{ width: 14, flexShrink: 0 }} />
                      {COLS.map(c => (
                        <Cell key={c.key} col={c}
                          v={c.key === 'name' ? `　${m.name}` : m[c.key]}
                          suffix={c.key === 'name' && m.retired ? <RetiredTag /> : null} />
                      ))}
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 16px 9px 44px', borderBottom: `1px solid ${alpha(color.border, 0.5)}`, background: color.white, fontSize: font.size.sm, color: color.textLight }}>
                      メンバーの実績がありません
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </Card>
      <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 8 }}>
        架電/接続/アポ/シフト/稼働=行動日ベース、当社売上=面談実施日ベース。各チームのメンバー別内訳は常時表示。
      </div>
    </div>
  );
}
