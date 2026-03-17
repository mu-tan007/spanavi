import React, { useState, useMemo } from 'react';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);
const GRID = '1.5fr 0.65fr 0.65fr 0.65fr 0.65fr 0.65fr 0.55fr';
const GRID_MBR = '1.5fr 0.65fr 0.65fr 0.65fr 0.65fr 0.65fr';

export default function TeamPerformanceTable({ records, loading, teamMap }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  const { teamData, memberData } = useMemo(() => {
    const EXCLUDED_TEAMS = new Set(['営業統括', 'その他']);
    const isValidName = (n) => n && !/^user_/i.test(n);
    const tm = {};
    const mm = {};
    records.forEach(r => {
      const name = r.getter_name;
      if (!isValidName(name)) return;
      const tn = teamMap[name] || 'その他';
      if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
      tm[tn].call++;
      if (CEO_CONNECT.has(r.status)) tm[tn].connect++;
      if (r.status === 'アポ獲得') tm[tn].appo++;
      tm[tn].members.add(name);
      if (!mm[tn]) mm[tn] = {};
      if (!mm[tn][name]) mm[tn][name] = { call: 0, connect: 0, appo: 0 };
      mm[tn][name].call++;
      if (CEO_CONNECT.has(r.status)) mm[tn][name].connect++;
      if (r.status === 'アポ獲得') mm[tn][name].appo++;
    });
    const teamData = Object.entries(tm)
      .filter(([tn]) => !EXCLUDED_TEAMS.has(tn))
      .sort((a, b) => b[1].call - a[1].call)
      .map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);
    return { teamData, memberData: mm };
  }, [records, teamMap]);

  const hdr = { padding: '8px 16px', background: '#F8F9FA', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #E5E7EB' };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>チーム別パフォーマンス</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
        <span style={{ fontSize: 10, color: C.textLight }}>（行クリックでメンバー展開）</span>
      </div>
      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, ...hdr }}>
          <span>チーム名</span><span>架電数</span><span>社長接続</span><span>接続率</span><span>アポ数</span><span>アポ率</span><span>人数</span>
        </div>
        {teamData.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
        ) : teamData.map(([tn, d]) => {
          const cr = d.call > 0 ? (d.connect / d.call * 100).toFixed(1) : '0.0';
          const ar = d.call > 0 ? (d.appo / d.call * 100).toFixed(1) : '0.0';
          const isExpanded = expandedTeam === tn;
          const members = memberData[tn] ? Object.entries(memberData[tn]).sort((a, b) => b[1].call - a[1].call) : [];
          return (
            <React.Fragment key={tn}>
              <div
                onClick={() => setExpandedTeam(isExpanded ? null : tn)}
                style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', cursor: 'pointer', background: isExpanded ? NAVY + '06' : 'transparent', transition: 'background 0.15s', borderLeft: '2px solid transparent' }}
                onMouseEnter={e => { if (!isExpanded) { e.currentTarget.style.background = '#EAF4FF'; e.currentTarget.style.borderLeft = '2px solid #0D2247'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? NAVY + '06' : 'transparent'; e.currentTarget.style.borderLeft = '2px solid transparent'; }}
              >
                <span style={{ fontWeight: 700, color: NAVY, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 8, color: C.textLight, display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
                  {tn}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.call}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.connect}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151', fontWeight: 700 }}>{cr}%</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: '#374151' }}>{d.appo}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151', fontWeight: 700 }}>{ar}%</span>
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono'" }}>{d.memberCount}人</span>
              </div>
              {isExpanded && (
                <div style={{ background: NAVY + '04', borderBottom: '1px solid #E5E5E5', padding: '6px 28px 10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: GRID_MBR, fontSize: 10, fontWeight: 600, color: '#6B7280', padding: '4px 0 6px', borderBottom: '1px solid #ebebeb' }}>
                    <span>メンバー</span><span>架電</span><span>接続</span><span>接続率</span><span>アポ</span><span>アポ率</span>
                  </div>
                  {members.map(([name, md]) => {
                    const mcr = md.call > 0 ? (md.connect / md.call * 100).toFixed(1) : '0.0';
                    const mar = md.call > 0 ? (md.appo / md.call * 100).toFixed(1) : '0.0';
                    return (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: GRID_MBR, fontSize: 11, padding: '5px 0', borderBottom: '1px solid #f5f5f5', color: C.textDark }}>
                        <span style={{ fontWeight: 500 }}>{name}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'" }}>{md.call}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'" }}>{md.connect}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151' }}>{mcr}%</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151', fontWeight: 700 }}>{md.appo}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151' }}>{mar}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
