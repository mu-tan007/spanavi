import { useMemo } from 'react';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);
const RESCHED_STATUSES = new Set(['リスケ中', 'キャンセル', '面談済', '事前確認済', 'アポ取得']);

// チーム/メンバー名 + 8指標
const GRID = '0.4fr 0.05fr 0.05fr 0.05fr 0.05fr 0.05fr 0.05fr 0.05fr 0.05fr';

const COLS = ['架電数', '社長接続', '接続率', 'アポ数', 'アポ率', '件/h', 'リスケ率', 'キャンセル率'];

export default function TeamPerformanceTable({ records, appoRecords = [], loading, teamMap, sessionMap = {}, reschedAppoData = [], members = [] }) {

  const { teamData, memberData, reschedMap } = useMemo(() => {
    const EXCLUDED_TEAMS = new Set(['営業統括', 'その他']);
    const isValidName = (n) => n && !/^user_/i.test(n);

    // アポ数マップ
    const appoMap = {};
    appoRecords.forEach(r => {
      const name = r.getter_name;
      if (!isValidName(name)) return;
      appoMap[name] = (appoMap[name] || 0) + 1;
    });

    // リスケ・キャンセルマップ
    const reschedMap = {};
    reschedAppoData.forEach(a => {
      if (!RESCHED_STATUSES.has(a.status)) return;
      const name = a.getter;
      if (!isValidName(name)) return;
      if (!reschedMap[name]) reschedMap[name] = { resched: 0, cancel: 0, total: 0 };
      reschedMap[name].total++;
      if (a.status === 'リスケ中') reschedMap[name].resched++;
      if (a.status === 'キャンセル') reschedMap[name].cancel++;
    });

    const tm = {};
    const mm = {};
    records.forEach(r => {
      const name = r.getter_name;
      if (!isValidName(name)) return;
      const tn = teamMap[name] || 'その他';
      if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
      tm[tn].call++;
      if (CEO_CONNECT.has(r.status)) tm[tn].connect++;
      tm[tn].members.add(name);
      if (!mm[tn]) mm[tn] = {};
      if (!mm[tn][name]) mm[tn][name] = { call: 0, connect: 0, appo: 0 };
      mm[tn][name].call++;
      if (CEO_CONNECT.has(r.status)) mm[tn][name].connect++;
    });

    Object.entries(appoMap).forEach(([name, count]) => {
      const tn = teamMap[name] || 'その他';
      if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
      tm[tn].appo += count;
      tm[tn].members.add(name);
      if (!mm[tn]) mm[tn] = {};
      if (!mm[tn][name]) mm[tn][name] = { call: 0, connect: 0, appo: 0 };
      mm[tn][name].appo = count;
    });

    // 名簿の全アクティブメンバーをゼロデータで補完
    (members || [])
      .filter(mb => mb.is_active !== false && isValidName(mb.name))
      .forEach(mb => {
        const tn = teamMap[mb.name] || 'その他';
        if (EXCLUDED_TEAMS.has(tn)) return;
        if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
        tm[tn].members.add(mb.name);
        if (!mm[tn]) mm[tn] = {};
        if (!mm[tn][mb.name]) mm[tn][mb.name] = { call: 0, connect: 0, appo: 0 };
      });

    const teamData = Object.entries(tm)
      .filter(([tn]) => !EXCLUDED_TEAMS.has(tn))
      .sort((a, b) => b[1].call - a[1].call)
      .map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);

    return { teamData, memberData: mm, reschedMap };
  }, [records, appoRecords, teamMap, reschedAppoData, members]);

  const mono = { fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 8, marginBottom: 12 }}>チーム別パフォーマンス</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
      </div>

      {teamData.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden' }}>

          {/* グローバル列ヘッダー（最上部に1つだけ） */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '8px 16px', background: '#0D2247', fontSize: 11, fontWeight: 600, color: '#fff', borderBottom: '1px solid #E5E7EB', verticalAlign: 'middle' }}>
            <span style={{ padding: '0', verticalAlign: 'middle' }}>チーム / メンバー</span>
            {COLS.map(c => <span key={c} style={{ padding: '0', verticalAlign: 'middle', textAlign: 'right', display: 'block' }}>{c}</span>)}
          </div>

          {teamData.map(([tn, d], teamIdx) => {
            const cr = d.call > 0 ? (d.connect / d.call * 100).toFixed(1) : '0.0';
            const ar = d.call > 0 ? (d.appo / d.call * 100).toFixed(1) : '0.0';
            const members = memberData[tn]
              ? Object.entries(memberData[tn]).sort((a, b) => b[1].call - a[1].call)
              : [];

            const teamHours = members.reduce((sum, [name]) => sum + (sessionMap[name] || 0), 0);
            const teamCph = teamHours > 0.01 ? (d.call / teamHours).toFixed(1) : '-';

            let teamReschedTotal = 0, teamResched = 0, teamCancel = 0;
            members.forEach(([name]) => {
              const rd = reschedMap[name];
              if (rd) { teamReschedTotal += rd.total; teamResched += rd.resched; teamCancel += rd.cancel; }
            });
            const teamReschedRate = teamReschedTotal > 0 ? (teamResched / teamReschedTotal * 100).toFixed(1) + '%' : '-';
            const teamCancelRate  = teamReschedTotal > 0 ? (teamCancel  / teamReschedTotal * 100).toFixed(1) + '%' : '-';

            return (
              <div key={tn}>
                {/* チーム集計行 */}
                <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '8px 16px', background: NAVY, alignItems: 'center', borderTop: teamIdx > 0 ? '2px solid #E5E7EB' : 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', verticalAlign: 'middle' }}>
                    {tn}
                    <span style={{ fontSize: 10, color: '#93C5FD', fontWeight: 400, marginLeft: 6 }}>{d.memberCount}人</span>
                  </span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'right', display: 'block' }}>{d.call}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'right', display: 'block' }}>{d.connect}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'right', display: 'block' }}>{cr}%</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 800, fontSize: 12, textAlign: 'right', display: 'block' }}>{d.appo}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'right', display: 'block' }}>{ar}%</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: 'right', display: 'block' }}>{teamCph}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: 'right', display: 'block' }}>{teamReschedRate}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: 'right', display: 'block' }}>{teamCancelRate}</span>
                </div>

                {/* メンバー行 */}
                {members.map(([name, md], i) => {
                  const mcr = md.call > 0 ? (md.connect / md.call * 100).toFixed(1) : '0.0';
                  const mar = md.call > 0 ? (md.appo / md.call * 100).toFixed(1) : '0.0';
                  const mHours = sessionMap[name] || 0;
                  const mcph = mHours > 0.01 ? (md.call / mHours).toFixed(1) : '-';
                  const rd = reschedMap[name] || { resched: 0, cancel: 0, total: 0 };
                  const mReschedRate = rd.total > 0 ? (rd.resched / rd.total * 100).toFixed(1) + '%' : '-';
                  const mCancelRate  = rd.total > 0 ? (rd.cancel  / rd.total * 100).toFixed(1) + '%' : '-';
                  const reschedColor = rd.total > 0 ? (rd.resched / rd.total >= 0.2 ? '#DC2626' : rd.resched / rd.total >= 0.1 ? '#F59E0B' : '#374151') : '#9CA3AF';
                  const cancelColor  = rd.total > 0 ? (rd.cancel  / rd.total >= 0.2 ? '#DC2626' : rd.cancel  / rd.total >= 0.1 ? '#F59E0B' : '#374151') : '#9CA3AF';

                  return (
                    <div
                      key={name}
                      style={{ display: 'grid', gridTemplateColumns: GRID, fontSize: 11, padding: '8px 16px', borderBottom: '1px solid #E5E7EB', background: i % 2 === 0 ? '#fff' : '#F8F9FA', color: C.textDark, verticalAlign: 'middle', alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: 500, textAlign: 'left', paddingLeft: 12 }}>{name}</span>
                      <span style={{ ...mono, textAlign: 'right', display: 'block' }}>{md.call}</span>
                      <span style={{ ...mono, textAlign: 'right', display: 'block' }}>{md.connect}</span>
                      <span style={{ ...mono, color: '#374151', textAlign: 'right', display: 'block' }}>{mcr}%</span>
                      <span style={{ ...mono, color: '#374151', fontWeight: 700, textAlign: 'right', display: 'block' }}>{md.appo}</span>
                      <span style={{ ...mono, color: '#374151', textAlign: 'right', display: 'block' }}>{mar}%</span>
                      <span style={{ ...mono, color: '#6B7280', textAlign: 'right', display: 'block' }}>{mcph}</span>
                      <span style={{ ...mono, color: reschedColor, textAlign: 'right', display: 'block' }}>{mReschedRate}</span>
                      <span style={{ ...mono, color: cancelColor, textAlign: 'right', display: 'block' }}>{mCancelRate}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
