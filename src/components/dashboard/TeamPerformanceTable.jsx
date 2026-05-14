import { useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';

const fmtHours = (h) => h > 0.01 ? `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}m` : '-';
const RESCHED_STATUSES = new Set(['リスケ中', 'キャンセル', '面談済', '事前確認済', 'アポ取得']);

const COLS = ['架電数', 'キーマン接続', '接続率', 'アポ数', 'アポ率', '件/h', '稼働時間', 'リスケ率', 'キャンセル率'];

const TEAM_PERF_COLS = [
  { key: 'name', width: 180, align: 'left' },
  { key: 'calls', width: 70, align: 'right' },
  { key: 'keymanConnect', width: 100, align: 'right' },
  { key: 'connectRate', width: 100, align: 'right' },
  { key: 'appo', width: 80, align: 'right' },
  { key: 'appoRate', width: 100, align: 'right' },
  { key: 'callsPerHour', width: 80, align: 'right' },
  { key: 'workHours', width: 90, align: 'right' },
  { key: 'reschedRate', width: 100, align: 'right' },
  { key: 'cancelRate', width: 100, align: 'right' },
];

export default function TeamPerformanceTable({ byPerson: byPersonProp = [], loading, teamMap, sessionMap = {}, reschedAppoData = [], members = [] }) {
  const { columns: perfCols, gridTemplateColumns: perfGrid, contentMinWidth: perfMinW, onResizeStart: perfResize } = useColumnConfig('teamPerf', TEAM_PERF_COLS);

  const { teamData, memberData, reschedMap } = useMemo(() => {
    const EXCLUDED_TEAMS = new Set(['営業統括', 'その他']);
    const isValidName = (n) => n && !/^user_/i.test(n);

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

    // byPerson (RPC集計済み) からチーム別・メンバー別に振り分け
    byPersonProp.forEach(p => {
      const name = p.name;
      if (!isValidName(name)) return;
      const tn = teamMap[name] || 'その他';
      if (!tm[tn]) tm[tn] = { call: 0, connect: 0, appo: 0, members: new Set() };
      tm[tn].call += p.call;
      tm[tn].connect += p.connect;
      tm[tn].appo += p.appo;
      tm[tn].members.add(name);
      if (!mm[tn]) mm[tn] = {};
      mm[tn][name] = { call: p.call, connect: p.connect, appo: p.appo };
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
        if (!mm[tn][mb.name]) mm[tn][mb.name] = mm[tn][mb.name] || { call: 0, connect: 0, appo: 0 };
      });

    const teamData = Object.entries(tm)
      .filter(([tn]) => !EXCLUDED_TEAMS.has(tn))
      .sort((a, b) => b[1].call - a[1].call)
      .map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);

    return { teamData, memberData: mm, reschedMap };
  }, [byPersonProp, teamMap, reschedAppoData, members]);

  const mono = { fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums' };

  return (
    <Card padding="none" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
          borderBottom: `2px solid ${color.navy}`, paddingBottom: 8, marginBottom: 12,
        }}>チーム別パフォーマンス</span>
        {loading && <span style={{ fontSize: 10, color: color.textLight }}>読込中…</span>}
      </div>

      {teamData.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>— No records —</div>
      ) : (
        <div style={{
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          overflowX: 'auto', overflowY: 'hidden',
        }}>
          <div style={{ minWidth: perfMinW }}>

          {/* グローバル列ヘッダー（最上部に1つだけ） */}
          <div style={{
            display: 'grid', gridTemplateColumns: perfGrid,
            padding: '8px 16px', background: color.navy,
            fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white,
            borderBottom: `1px solid ${color.border}`, verticalAlign: 'middle',
          }}>
            <span
              style={{ padding: '0', verticalAlign: 'middle', textAlign: perfCols[0].align, position: 'relative' }}
            >
              チーム / メンバー
              <ColumnResizeHandle colIndex={0} onResizeStart={perfResize} />
            </span>
            {COLS.map((c, i) => (
              <span
                key={c}
                style={{ padding: '0', verticalAlign: 'middle', textAlign: perfCols[i + 1].align, display: 'block', position: 'relative' }}
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
                <div style={{
                  display: 'grid', gridTemplateColumns: perfGrid,
                  padding: '8px 16px', background: color.navy, alignItems: 'center',
                  borderTop: teamIdx > 0 ? `2px solid ${color.border}` : 'none',
                }}>
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.white, verticalAlign: 'middle', textAlign: perfCols[0].align }}>
                    {tn}
                    <span style={{ fontSize: 10, color: '#93C5FD', fontWeight: font.weight.normal, marginLeft: 6 }}>{d.memberCount}人</span>
                  </span>
                  <span style={{ ...mono, color: color.white, fontWeight: font.weight.bold, fontSize: font.size.sm, textAlign: perfCols[1].align, display: 'block' }}>{d.call}</span>
                  <span style={{ ...mono, color: color.white, fontWeight: font.weight.bold, fontSize: font.size.sm, textAlign: perfCols[2].align, display: 'block' }}>{d.connect}</span>
                  <span style={{ ...mono, color: color.white, fontWeight: font.weight.bold, fontSize: font.size.sm, textAlign: perfCols[3].align, display: 'block' }}>{cr}%</span>
                  <span style={{ ...mono, color: color.white, fontWeight: font.weight.black, fontSize: font.size.sm, textAlign: perfCols[4].align, display: 'block' }}>{d.appo}</span>
                  <span style={{ ...mono, color: color.white, fontWeight: font.weight.bold, fontSize: font.size.sm, textAlign: perfCols[5].align, display: 'block' }}>{ar}%</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: font.size.sm, textAlign: perfCols[6].align, display: 'block' }}>{teamCph}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: font.size.sm, textAlign: perfCols[7].align, display: 'block' }}>{fmtHours(teamHours)}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: font.size.sm, textAlign: perfCols[8].align, display: 'block' }}>{teamReschedRate}</span>
                  <span style={{ ...mono, color: '#93C5FD', fontSize: font.size.sm, textAlign: perfCols[9].align, display: 'block' }}>{teamCancelRate}</span>
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
                  const reschedColor = rd.total > 0 ? (rd.resched / rd.total >= 0.2 ? color.danger : rd.resched / rd.total >= 0.1 ? color.warn : color.gray700) : color.gray400;
                  const cancelColor  = rd.total > 0 ? (rd.cancel  / rd.total >= 0.2 ? color.danger : rd.cancel  / rd.total >= 0.1 ? color.warn : color.gray700) : color.gray400;

                  return (
                    <div
                      key={name}
                      style={{
                        display: 'grid', gridTemplateColumns: perfGrid,
                        fontSize: font.size.xs, padding: '8px 16px',
                        borderBottom: `1px solid ${color.border}`,
                        background: i % 2 === 0 ? color.white : '#F8F9FA',
                        color: color.textDark, verticalAlign: 'middle', alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: font.weight.medium, textAlign: perfCols[0].align, paddingLeft: 12 }}>{name}</span>
                      <span style={{ ...mono, textAlign: perfCols[1].align, display: 'block' }}>{md.call}</span>
                      <span style={{ ...mono, textAlign: perfCols[2].align, display: 'block' }}>{md.connect}</span>
                      <span style={{ ...mono, color: color.gray700, textAlign: perfCols[3].align, display: 'block' }}>{mcr}%</span>
                      <span style={{ ...mono, color: color.gray700, fontWeight: font.weight.bold, textAlign: perfCols[4].align, display: 'block' }}>{md.appo}</span>
                      <span style={{ ...mono, color: color.gray700, textAlign: perfCols[5].align, display: 'block' }}>{mar}%</span>
                      <span style={{ ...mono, color: color.gray500, textAlign: perfCols[6].align, display: 'block' }}>{mcph}</span>
                      <span style={{ ...mono, color: color.gray500, textAlign: perfCols[7].align, display: 'block' }}>{fmtHours(mHours)}</span>
                      <span style={{ ...mono, color: reschedColor, textAlign: perfCols[8].align, display: 'block' }}>{mReschedRate}</span>
                      <span style={{ ...mono, color: cancelColor, textAlign: perfCols[9].align, display: 'block' }}>{mCancelRate}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>
      )}

    </Card>
  );
}
