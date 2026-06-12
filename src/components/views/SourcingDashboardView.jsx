import React, { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Select, Card } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUrlState } from '../../hooks/useUrlState';
import PageHeader from '../common/PageHeader';
import { useRecordingPlayer } from '../common/RecordingPlayerProvider';
import { useCallQueue } from './smart-queue/useCallQueue';
import { fetchCallActivity, fetchAllRecallRecords, fetchMemberReapproach, fetchMemberHeatmap } from '../../lib/supabaseWrite';

// 個人ダッシュボード（個人の数字専用）。
// メンバー切替で誰でも見られる。目標/達成率/全社ランキングは置かない。
// 集計基準: 行動量=行動日ベース、売上/インセンティブ=面談実施日ベース。

const KEYMAN_CONNECT = ['キーマン再コール', 'アポ獲得', 'キーマン断り']; // _perf_keyman_connect_labels と一致
const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];           // 売上に含むステータス
const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

const jstDateStr = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
const jstTimeStr = (d) => new Date(d).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
const jstStartISO = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
const jstEndISO   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();
const getMemberName = (m) => (typeof m === 'string' ? m : (m?.name || ''));

// 直近12ヶ月の選択肢（YYYY-MM, 表示=YYYY年M月）
function buildMonthOptions(now) {
  const base = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({ value: ym, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
  }
  return opts;
}

// period: 'today' | 'week' | 'month'。month のときは monthStr(YYYY-MM) を当月として扱う
function computeRange(period, now, monthStr) {
  const todayStr = jstDateStr(now);
  if (period === 'today') {
    return { fromISO: jstStartISO(todayStr), toISO: jstEndISO(todayStr), fromDate: todayStr, toDate: todayStr };
  }
  if (period === 'week') {
    const d = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const dow = (d.getDay() + 6) % 7; // 月=0
    const monday = new Date(d); monday.setDate(d.getDate() - dow);
    const fromDate = jstDateStr(monday);
    return { fromISO: jstStartISO(fromDate), toISO: jstEndISO(todayStr), fromDate, toDate: todayStr };
  }
  // month: 当月は今日まで、過去月は月末まで
  const ym = monthStr || todayStr.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const fromDate = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const isCurrentMonth = ym === todayStr.slice(0, 7);
  const toDate = isCurrentMonth ? todayStr : `${ym}-${String(lastDay).padStart(2, '0')}`;
  return { fromISO: jstStartISO(fromDate), toISO: jstEndISO(toDate), fromDate, toDate };
}

export default function SourcingDashboardView({ currentUser, members = [], now = new Date(), appoData = [], callListData = [], setCallFlowScreen, setCurrentTab }) {
  const isMobile = useIsMobile();
  const [member, setMember] = useUrlState('dash_member', currentUser || '');
  const [period, setPeriod] = useUrlState('dash_period', 'month', { allowed: ['today', 'week', 'month'] });
  const monthOptions = useMemo(() => buildMonthOptions(now), [now]);
  const [monthStr, setMonthStr] = useUrlState('dash_month', monthOptions[0]?.value || '');
  const activeMember = member || currentUser || '';

  const memberOptions = useMemo(() => {
    const names = [...new Set((members || []).map(getMemberName).filter(Boolean))];
    if (currentUser && !names.includes(currentUser)) names.unshift(currentUser);
    return names.map(n => ({ value: n, label: n }));
  }, [members, currentUser]);

  const range = useMemo(() => computeRange(period, now, monthStr), [period, now, monthStr]);

  // ② 行動量 + ⑧ 前週比のためのデータ取得
  const [callRows, setCallRows] = useState([]);
  const [thisWeekRows, setThisWeekRows] = useState([]);
  const [prevCallRows, setPrevCallRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchCallActivity(range.fromISO, range.toISO).then(({ data }) => { if (!cancelled) setCallRows(data || []); });
    const dayMs = 86400000;
    const thisFrom = new Date(now.getTime() - 7 * dayMs).toISOString();
    const prevFrom = new Date(now.getTime() - 14 * dayMs).toISOString();
    const prevTo   = new Date(now.getTime() - 7 * dayMs).toISOString();
    fetchCallActivity(prevFrom, prevTo).then(({ data }) => { if (!cancelled) setPrevCallRows(data || []); });
    fetchCallActivity(thisFrom, now.toISOString()).then(({ data }) => { if (!cancelled) setThisWeekRows(data || []); });
    return () => { cancelled = true; };
  }, [range.fromISO, range.toISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const aggFor = (rows) => {
    const mine = (rows || []).filter(r => r.getter_name === activeMember);
    const calls = mine.length;
    const connect = mine.filter(r => KEYMAN_CONNECT.includes(r.status)).length;
    const appo = mine.filter(r => r.status === 'アポ獲得').length;
    return { calls, connect, appo, connectRate: calls ? (connect / calls) * 100 : 0 };
  };
  const stats = useMemo(() => aggFor(callRows), [callRows, activeMember]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekDelta = useMemo(() => {
    const cur = aggFor(thisWeekRows), prev = aggFor(prevCallRows);
    return { calls: cur.calls - prev.calls, connect: cur.connect - prev.connect, appo: cur.appo - prev.appo };
  }, [thisWeekRows, prevCallRows, activeMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // ③ 売上・インセンティブ（面談実施日ベース）
  const moneyStats = useMemo(() => {
    const mine = (appoData || []).filter(a =>
      a.getter === activeMember &&
      SALES_STATUSES.includes(a.status) &&
      a.meetDate && a.meetDate >= range.fromDate && a.meetDate <= range.toDate
    );
    const sales = mine.filter(a => !a.isProspecting).reduce((s, a) => s + Number(a.sales || 0), 0);
    const incentive = mine.reduce((s, a) => s + Number(a.reward || 0), 0);
    const breakdown = mine
      .filter(a => Number(a.reward || 0) > 0)
      .sort((a, b) => (b.meetDate || '').localeCompare(a.meetDate || ''))
      .map(a => ({ company: a.company, reward: Number(a.reward || 0), meetDate: a.meetDate, id: a._supaId }));
    return { sales, incentive, breakdown };
  }, [appoData, activeMember, range.fromDate, range.toDate]);

  // ⑤ 直近アポ5件
  const recentAppos = useMemo(() =>
    (appoData || [])
      .filter(a => a.getter === activeMember)
      .sort((a, b) => (b.getDate || '').localeCompare(a.getDate || ''))
      .slice(0, 5)
  , [appoData, activeMember]);

  // ④ 今日の再コール予定
  const [recalls, setRecalls] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchAllRecallRecords().then(({ data }) => {
      if (cancelled) return;
      const todayStr = jstDateStr(now);
      const mine = (data || []).filter(r =>
        (r._memoObj?.assignee || r.getter_name) === activeMember &&
        r._memoObj?.recall_date === todayStr
      ).sort((a, b) => (a._memoObj?.recall_time || '').localeCompare(b._memoObj?.recall_time || ''));
      setRecalls(mine);
    });
    return () => { cancelled = true; };
  }, [activeMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⑥ 再アプローチ候補（キーマン断り・温度感で絞り込み）
  // tempFilter: 'HIGH'(高のみ) | 'HM'(高+中) | 'ALL'(すべて=高+中+低)
  const [tempFilter, setTempFilter] = useUrlState('dash_temp', 'HM', { allowed: ['HIGH', 'HM', 'ALL'] });
  const [reapproach, setReapproach] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!activeMember) { setReapproach([]); return; }
    const temps = tempFilter === 'HIGH' ? ['HIGH'] : tempFilter === 'HM' ? ['HIGH', 'MEDIUM'] : ['HIGH', 'MEDIUM', 'LOW'];
    fetchMemberReapproach(activeMember, temps).then(({ data }) => {
      if (cancelled) return;
      // 温度の高い順 → 同温度は新しい順
      const ord = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const sorted = [...(data || [])].sort((a, b) =>
        (ord[a.temp] ?? 9) - (ord[b.temp] ?? 9) || String(b.called_at).localeCompare(String(a.called_at)));
      setReapproach(sorted);
    });
    return () => { cancelled = true; };
  }, [activeMember, tempFilter]);

  // ⑦ ヒートマップ
  const [heatmap, setHeatmap] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!activeMember) { setHeatmap([]); return; }
    fetchMemberHeatmap(activeMember, range.fromISO, range.toISO).then(({ data }) => { if (!cancelled) setHeatmap(data || []); });
    return () => { cancelled = true; };
  }, [activeMember, range.fromISO, range.toISO]);

  // 録音再生（画面下部の共通プレイヤー）+ 架電画面ジャンプ
  const { play: playRecording, isCurrent } = useRecordingPlayer();
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const jumpToCall = (row) => { openQueue([row], 0); };
  const goAppoList = () => { if (setCurrentTab) setCurrentTab('appo'); };
  const fmtYen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: 40 }}>
      <PageHeader title="ダッシュボード" description="個人の数字" style={{ marginBottom: 16 }} />

      {/* ① メンバー切替 + 期間 */}
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: space[4] }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>メンバー</div>
          <Select size="sm" value={activeMember} onChange={e => setMember(e.target.value)} options={memberOptions} />
        </div>
        <div style={{ display: 'flex', gap: space[1] }}>
          {[['today', '今日'], ['week', '今週'], ['month', '月']].map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                padding: '8px 16px', borderRadius: radius.md, cursor: 'pointer', fontFamily: font.family.sans,
                fontSize: font.size.sm, fontWeight: period === p ? font.weight.semibold : font.weight.normal,
                border: `1px solid ${period === p ? color.navy : color.border}`,
                background: period === p ? color.navy : color.white,
                color: period === p ? color.white : color.textMid,
              }}>{l}</button>
          ))}
        </div>
        {/* 月モードのときだけ対象月を選べる */}
        {period === 'month' && (
          <div style={{ minWidth: 140 }}>
            <Select size="sm" value={monthStr} onChange={e => setMonthStr(e.target.value)} options={monthOptions} />
          </div>
        )}
      </div>

      {/* ② 行動量カード */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: space[3], marginBottom: space[2] }}>
        <StatCard label="架電数" value={stats.calls} unit="件" />
        <StatCard label="キーマン接続" value={stats.connect} unit="件" />
        <StatCard label="アポ獲得" value={stats.appo} unit="件" accent />
        <StatCard label="接続率" value={stats.connectRate.toFixed(1)} unit="%" />
      </div>

      {/* ⑧ 前週比1行 */}
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[4], paddingLeft: 2 }}>
        直近7日（先週同期間比）：{' '}
        <DeltaSpan label="架電" v={weekDelta.calls} />{'　'}
        <DeltaSpan label="接続" v={weekDelta.connect} />{'　'}
        <DeltaSpan label="アポ" v={weekDelta.appo} />
      </div>

      {/* ③ 売上・インセンティブ */}
      <Card padding="md" style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>当社売上（面談実施日ベース）</div>
            <div style={{ fontSize: 26, fontWeight: font.weight.bold, color: color.navy, fontFamily: font.family.mono }}>{fmtYen(moneyStats.sales)}</div>
          </div>
          <div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>自分のインセンティブ</div>
            <div style={{ fontSize: 26, fontWeight: font.weight.bold, color: color.gold, fontFamily: font.family.mono }}>{fmtYen(moneyStats.incentive)}</div>
          </div>
        </div>
        {moneyStats.breakdown.length > 0 && (
          <div style={{ marginTop: space[3], borderTop: `1px dashed ${color.border}`, paddingTop: space[2] }}>
            {moneyStats.breakdown.map((b, i) => (
              <div key={i} onClick={goAppoList}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, padding: '3px 0', cursor: 'pointer', color: color.textDark }}>
                <span>{b.meetDate?.slice(5)} {b.company}</span>
                <span style={{ fontFamily: font.family.mono, color: color.gold }}>{fmtYen(b.reward)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: space[4], marginBottom: space[4] }}>
        {/* ④ 今日の再コール予定 */}
        <Section title={`今日の再コール予定（${recalls.length}）`}>
          {recalls.length === 0 ? <Empty>本日の再コール予定はありません</Empty> : recalls.map((r, i) => {
            const overdue = (r._memoObj?.recall_time || '99:99') < jstTimeStr(now);
            return (
              <Row key={i}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.bold, color: overdue ? color.danger : color.navy }}>
                    {(r._memoObj?.recall_time || '').slice(0, 5)}
                  </span>{' '}
                  <span style={{ fontSize: font.size.sm }}>{r._item?.company || '—'}</span>
                  <span style={{ fontSize: font.size.xs - 1, color: color.textLight, marginLeft: 6 }}>{r.status}</span>
                </div>
                <RowActions rec={r} company={r._item?.company} onCall={() => jumpToCall({ item_id: r.item_id, list_id: r.list_id })} playRecording={playRecording} isCurrent={isCurrent} />
              </Row>
            );
          })}
        </Section>

        {/* ⑤ 直近アポ5件 */}
        <Section title="直近のアポ（5件）">
          {recentAppos.length === 0 ? <Empty>アポがありません</Empty> : recentAppos.map((a, i) => (
            <Row key={i}>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={goAppoList}>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>{a.company}</span>
                <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>
                  面談 {a.meetDate || '未定'} {a.meetTime || ''}・{a.status}
                </div>
              </div>
              {a.recordingUrl && <PlayBtn onClick={() => playRecording(a.recordingUrl, a.company, `面談 ${a.meetDate || ''}`)} active={isCurrent(a.recordingUrl)} />}
            </Row>
          ))}
        </Section>
      </div>

      {/* ⑥ 再アプローチ候補 */}
      <div style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2], flexWrap: 'wrap', gap: space[2] }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
            再アプローチ候補（{reapproach.length}件）
          </div>
          <div style={{ minWidth: 130 }}>
            <Select size="sm" value={tempFilter} onChange={e => setTempFilter(e.target.value)}
              options={[
                { value: 'HIGH', label: '温度感: 高' },
                { value: 'HM', label: '温度感: 高＋中' },
                { value: 'ALL', label: '温度感: すべて' },
              ]} />
          </div>
        </div>
        <Card padding="sm">
          {reapproach.length === 0 ? <Empty>再アプローチ候補はありません</Empty> : reapproach.map((r, i) => (
            <Row key={i}>
              <TempBadge temp={r.temp} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold }}>{r.company}</span>
                <span style={{ fontSize: font.size.xs - 1, color: color.textLight, marginLeft: 6 }}>{r.list_name}</span>
                <div style={{ fontSize: font.size.xs, color: color.textMid, whiteSpace: 'pre-wrap', marginTop: 2 }}>
                  {String(r.rejection_reason || '').replace(/^(HIGH|MEDIUM|LOW)\s*\n?/i, '')}
                </div>
              </div>
              <RowActions rec={r} company={r.company} onCall={() => jumpToCall({ item_id: r.item_id, list_id: r.list_id })} playRecording={playRecording} isCurrent={isCurrent} />
            </Row>
          ))}
        </Card>
      </div>

      {/* ⑦ 曜日×時間帯 ヒートマップ */}
      <Section title="曜日 × 時間帯のキーマン接続率">
        <Heatmap data={heatmap} />
      </Section>
    </div>
  );
}

// ─── 小物 ───
function StatCard({ label, value, unit, accent }) {
  return (
    <Card padding="md">
      <div style={{ fontSize: font.size.xs, color: color.textLight, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: font.weight.bold, color: accent ? color.gold : color.navy, fontFamily: font.family.mono }}>
        {value}<span style={{ fontSize: font.size.sm, color: color.textLight, marginLeft: 2 }}>{unit}</span>
      </div>
    </Card>
  );
}
function DeltaSpan({ label, v }) {
  const up = v > 0, flat = v === 0;
  return (
    <span style={{ color: flat ? color.textLight : (up ? color.success : color.danger), fontWeight: font.weight.semibold }}>
      {label}{up ? '+' : ''}{v}{flat ? ' →' : (up ? ' ↑' : ' ↓')}
    </span>
  );
}
function Section({ title, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2], borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>{title}</div>
      <Card padding="sm">{children}</Card>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: '6px 4px', borderBottom: `1px solid ${alpha(color.border, 0.5)}` }}>{children}</div>;
}
function TempBadge({ temp }) {
  // 既存の再アプローチ候補タブと同じ配色（高=success/中=info/低=danger）
  const m = {
    HIGH:   { bg: alpha(color.success, 0.15), c: color.success, l: '高' },
    MEDIUM: { bg: alpha(color.info, 0.15),    c: color.info,    l: '中' },
    LOW:    { bg: alpha(color.danger, 0.15),  c: color.danger,  l: '低' },
  }[temp] || { bg: color.gray100, c: color.textMid, l: '—' };
  return (
    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: radius.sm, background: m.bg, color: m.c,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: font.size.xs, fontWeight: font.weight.bold }}>
      {m.l}
    </span>
  );
}
function Empty({ children }) {
  return <div style={{ padding: '14px 6px', fontSize: font.size.sm, color: color.textLight, textAlign: 'center' }}>{children}</div>;
}
function PlayBtn({ onClick, active }) {
  return (
    <button onClick={onClick} title="録音を再生"
      style={{ flexShrink: 0, padding: '3px 10px', borderRadius: radius.pill, cursor: 'pointer', fontFamily: font.family.sans,
        fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
        border: `1px solid ${active ? color.navy : color.border}`, background: active ? color.navy : color.white, color: active ? color.white : color.navy }}>
      {active ? '停止' : '▶ 録音'}
    </button>
  );
}
function RowActions({ rec, company, onCall, playRecording, isCurrent }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {rec.recording_url && <PlayBtn onClick={() => playRecording(rec.recording_url, company || '', rec.list_name || '')} active={isCurrent(rec.recording_url)} />}
      <button onClick={onCall} title="架電画面で開く"
        style={{ padding: '3px 12px', borderRadius: radius.pill, cursor: 'pointer', fontFamily: font.family.sans,
          fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, border: 'none', background: color.navy, color: color.white }}>
        架電 →
      </button>
    </div>
  );
}
function Heatmap({ data }) {
  const HOURS = [];
  for (let h = 9; h <= 19; h++) HOURS.push(h);
  const map = {};
  (data || []).forEach(d => {
    const calls = Number(d.calls), connects = Number(d.connects);
    map[`${d.dow}_${d.hour}`] = { rate: calls ? (connects / calls) * 100 : 0, calls, connects };
  });
  const cellColor = (rate, calls) => {
    if (!calls) return color.gray50;
    const t = Math.min(rate / 50, 1);
    return alpha(color.navy, 0.12 + t * 0.78);
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: font.size.sm, fontFamily: font.family.mono, width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ padding: 4, width: 44 }}></th>
            {HOURS.map(h => <th key={h} style={{ padding: '5px 0', color: color.textLight, fontWeight: font.weight.normal, fontSize: font.size.xs }}>{h}時</th>)}
          </tr>
        </thead>
        <tbody>
          {DOW_LABELS.map((label, dow) => (
            <tr key={dow}>
              <td style={{ padding: '4px 8px', color: color.textMid, fontWeight: font.weight.semibold, fontFamily: font.family.sans, fontSize: font.size.sm }}>{label}</td>
              {HOURS.map(h => {
                const c = map[`${dow}_${h}`];
                const rate = c?.rate || 0;
                return (
                  <td key={h}
                    title={c?.calls ? `${label}曜 ${h}時：接続率 ${rate.toFixed(0)}%（${c.connects}/${c.calls}）` : `${label}曜 ${h}時：データなし`}
                    style={{ height: 44, textAlign: 'center', background: cellColor(rate, c?.calls || 0),
                      color: rate > 30 ? color.white : color.textMid, border: `2px solid ${color.white}`,
                      fontWeight: font.weight.semibold, borderRadius: radius.sm }}>
                    {c?.calls ? rate.toFixed(0) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 8 }}>数値は接続率(%)。色が濃いほど高接続。マスにカーソルを合わせると件数を表示します。</div>
    </div>
  );
}
