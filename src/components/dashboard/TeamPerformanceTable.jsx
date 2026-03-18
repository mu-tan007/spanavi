import { useMemo } from 'react';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);
const RESCHED_STATUSES = new Set(['リスケ中', 'キャンセル', '面談済', '事前確認済', 'アポ取得']);

// チーム名 + 8指標
const GRID = '1.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.65fr 0.65fr';

export default function TeamPerformanceTable({ records, appoRecords = [], loading, teamMap, sessionMap = {}, reschedAppoData = [] }) {

  const { teamData, memberData, reschedMap } = useMemo(() => {
    const EXCLUDED_TEAMS = new Set(['営業統括', 'その他']);
    const isValidName = (n) => n && !/^user_/i.test(n);

    // アポ数マップ（appoRecordsから）
    const appoMap = {};
    appoRecords.forEach(r => {
      const name = r.getter_name;
      if (!isValidName(name)) return;
      appoMap[name] = (appoMap[name] || 0) + 1;
    });

    // リスケ・キャンセルマップ（reschedAppoDataから）
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

    // アポ数をマージ
    Object.entries(appoMap).forEach(([name, count]) => {
      const tn = teamMap[name] || 'その他';
      if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
      tm[tn].appo += count;
      tm[tn].members.add(name);
      if (!mm[tn]) mm[tn] = {};
      if (!mm[tn][name]) mm[tn][name] = { call: 0, connect: 0, appo: 0 };
      mm[tn][name].appo = count;
    });

    const teamData = Object.entries(tm)
      .filter(([tn]) => !EXCLUDED_TEAMS.has(tn))
      .sort((a, b) => b[1].call - a[1].call)
      .map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);

    return { teamData, memberData: mm, reschedMap };
  }, [records, appoRecords, teamMap, reschedAppoData]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>チーム別パフォーマンス</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
      </div>

      {teamData.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
      ) : teamData.map(([tn, d]) => {
        const cr = d.call > 0 ? (d.connect / d.call * 100).toFixed(1) : '0.0';
        const ar = d.call > 0 ? (d.appo / d.call * 100).toFixed(1) : '0.0';
        const members = memberData[tn]
          ? Object.entries(memberData[tn]).sort((a, b) => b[1].call - a[1].call)
          : [];

        // チーム全体の件/h
        const teamHours = members.reduce((sum, [name]) => sum + (sessionMap[name] || 0), 0);
        const teamCph = teamHours > 0.01 ? (d.call / teamHours).toFixed(1) : '-';

        // チーム全体のリスケ・キャンセル集計
        let teamReschedTotal = 0, teamResched = 0, teamCancel = 0;
        members.forEach(([name]) => {
          const rd = reschedMap[name];
          if (rd) { teamReschedTotal += rd.total; teamResched += rd.resched; teamCancel += rd.cancel; }
        });
        const teamReschedRate = teamReschedTotal > 0 ? (teamResched / teamReschedTotal * 100).toFixed(1) + '%' : '-';
        const teamCancelRate  = teamReschedTotal > 0 ? (teamCancel  / teamReschedTotal * 100).toFixed(1) + '%' : '-';

        return (
          <div key={tn} style={{ marginBottom: 20 }}>
            {/* チームヘッダー */}
            <div style={{ background: NAVY, borderRadius: '8px 8px 0 0', padding: '8px 16px', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                {tn}
                <span style={{ fontSize: 10, color: '#93C5FD', fontWeight: 400, marginLeft: 6 }}>{d.memberCount}人</span>
              </span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#fff', fontWeight: 700, fontSize: 12 }}>{d.call}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#fff', fontWeight: 700, fontSize: 12 }}>{d.connect}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: GOLD, fontWeight: 700, fontSize: 12 }}>{cr}%</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#fff', fontWeight: 800, fontSize: 12 }}>{d.appo}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: GOLD, fontWeight: 700, fontSize: 12 }}>{ar}%</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#93C5FD', fontSize: 12 }}>{teamCph}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#93C5FD', fontSize: 12 }}>{teamReschedRate}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", color: '#93C5FD', fontSize: 12 }}>{teamCancelRate}</span>
            </div>

            {/* メンバーテーブル */}
            <div style={{ border: '1px solid #E5E5E5', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {/* 列ヘッダー */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '6px 16px', background: '#F8F9FA', fontSize: 10, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', borderBottom: '1px solid #E5E7EB' }}>
                <span>メンバー</span>
                <span>架電数</span>
                <span>社長接続</span>
                <span>接続率</span>
                <span>アポ数</span>
                <span>アポ率</span>
                <span>件/h</span>
                <span>リスケ率</span>
                <span>キャンセル率</span>
              </div>

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
                    style={{ display: 'grid', gridTemplateColumns: GRID, fontSize: 11, padding: '6px 16px', borderBottom: i < members.length - 1 ? '1px solid #f5f5f5' : 'none', background: i % 2 === 0 ? 'transparent' : '#FAFAFA', color: C.textDark }}
                  >
                    <span style={{ fontWeight: 500 }}>{name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'" }}>{md.call}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'" }}>{md.connect}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151' }}>{mcr}%</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151', fontWeight: 700 }}>{md.appo}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: '#374151' }}>{mar}%</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: '#6B7280' }}>{mcph}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: reschedColor }}>{mReschedRate}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", color: cancelColor  }}>{mCancelRate}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
