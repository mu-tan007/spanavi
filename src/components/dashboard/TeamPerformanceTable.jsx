import { useMemo } from 'react';
import { C } from '../../constants/colors';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);
const RESCHED_STATUSES = new Set(['リスケ中', 'キャンセル', '面談済', '事前確認済', 'アポ取得']);

const COLS = ['架電数', '社長接続', '接続率', 'アポ数', 'アポ率', '件/h', 'リスケ率', 'キャンセル率'];

const TEAM_PERF_COLS = [
  { key: 'name', width: 180, align: 'left' },
  { key: 'calls', width: 70, align: 'right' },
  { key: 'ceoConnect', width: 100, align: 'right' },
  { key: 'connectRate', width: 100, align: 'right' },
  { key: 'appo', width: 80, align: 'right' },
  { key: 'appoRate', width: 100, align: 'right' },
  { key: 'callsPerHour', width: 80, align: 'right' },
  { key: 'reschedRate', width: 100, align: 'right' },
  { key: 'cancelRate', width: 100, align: 'right' },
];

export default function TeamPerformanceTable({ records, appoRecords = [], loading, teamMap, sessionMap = {}, reschedAppoData = [], members = [] }) {

  const { columns: perfCols, gridTemplateColumns: perfGrid, contentMinWidth: perfMinW, onResizeStart: perfResize, onHeaderContextMenu: perfCtxMenu, contextMenu: perfCtx, setAlign: perfSetAlign, resetAll: perfReset, closeMenu: perfClose } = useColumnConfig('teamPerf', TEAM_PERF_COLS);

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
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 4, overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ minWidth: perfMinW }}>

          {/* グローバル列ヘッダー（最上部に1つだけ） */}
          <div style={{ display: 'grid', gridTemplateColumns: perfGrid, padding: '8px 16px', background: '#0D2247', fontSize: 11, fontWeight: 600, color: '#fff', borderBottom: '1px solid #E5E7EB', verticalAlign: 'middle' }}>
            <span
              style={{ padding: '0', verticalAlign: 'middle', textAlign: perfCols[0].align, position: 'relative' }}
              onContextMenu={(e) => perfCtxMenu(e, 0)}
            >
              チーム / メンバー
              <ColumnResizeHandle colIndex={0} onResizeStart={perfResize} />
            </span>
            {COLS.map((c, i) => (
              <span
                key={c}
                style={{ padding: '0', verticalAlign: 'middle', textAlign: perfCols[i + 1].align, display: 'block', position: 'relative' }}
                onContextMenu={(e) => perfCtxMenu(e, i + 1)}
              >
                {c}
                <ColumnResizeHandle colIndex={i + 1} onResizeStart={perfResize} />
              </span>
            ))}
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
                <div style={{ display: 'grid', gridTemplateColumns: perfGrid, padding: '8px 16px', background: NAVY, alignItems: 'center', borderTop: teamIdx > 0 ? '2px solid #E5E7EB' : 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', verticalAlign: 'middle', textAlign: perfCols[0].align }}>
                    {tn}
                    <span style={{ fontSize: 10, color: '#93C5FD', fontWeight: 400, marginLeft: 6 }}>{d.memberCount}人</span>
                  </span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: perfCols[1].align, display: 'block' }}>{d.call}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: perfCols[2].align, display: 'block' }}>{d.connect}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: perfCols[3].align, display: 'block' }}>{cr}%</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 800, fontSize: 12, textAlign: perfCols[4].align, display: 'block' }}>{d.appo}</span>
                  <span style={{ ...mono, color: '#fff', fontWeight: 700, fontSize: 12, textAlign: perfCols[5].align, display: 'block' }}>{ar}%</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: perfCols[6].align, display: 'block' }}>{teamCph}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: perfCols[7].align, display: 'block' }}>{teamReschedRate}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: 12, textAlign: perfCols[8].align, display: 'block' }}>{teamCancelRate}</span>
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
                      style={{ display: 'grid', gridTemplateColumns: perfGrid, fontSize: 11, padding: '8px 16px', borderBottom: '1px solid #E5E7EB', background: i % 2 === 0 ? '#fff' : '#F8F9FA', color: C.textDark, verticalAlign: 'middle', alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: 500, textAlign: perfCols[0].align, paddingLeft: 12 }}>{name}</span>
                      <span style={{ ...mono, textAlign: perfCols[1].align, display: 'block' }}>{md.call}</span>
                      <span style={{ ...mono, textAlign: perfCols[2].align, display: 'block' }}>{md.connect}</span>
                      <span style={{ ...mono, color: '#374151', textAlign: perfCols[3].align, display: 'block' }}>{mcr}%</span>
                      <span style={{ ...mono, color: '#374151', fontWeight: 700, textAlign: perfCols[4].align, display: 'block' }}>{md.appo}</span>
                      <span style={{ ...mono, color: '#374151', textAlign: perfCols[5].align, display: 'block' }}>{mar}%</span>
                      <span style={{ ...mono, color: '#6B7280', textAlign: perfCols[6].align, display: 'block' }}>{mcph}</span>
                      <span style={{ ...mono, color: reschedColor, textAlign: perfCols[7].align, display: 'block' }}>{mReschedRate}</span>
                      <span style={{ ...mono, color: cancelColor, textAlign: perfCols[8].align, display: 'block' }}>{mCancelRate}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {perfCtx.visible && (
        <AlignmentContextMenu
          x={perfCtx.x}
          y={perfCtx.y}
          currentAlign={perfCols[perfCtx.colIndex]?.align || 'left'}
          onSelect={(align) => perfSetAlign(perfCtx.colIndex, align)}
          onReset={perfReset}
          onClose={perfClose}
        />
      )}
    </div>
  );
}
