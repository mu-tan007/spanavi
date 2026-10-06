import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Select, Card } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUrlState } from '../../hooks/useUrlState';
import PageTitle from '../common/PageTitle';
import { useRecordingPlayer } from '../common/RecordingPlayerProvider';
import { useCallQueue } from './smart-queue/useCallQueue';
import { fetchAllRecallRecords, fetchMemberReapproach, fetchMemberHeatmap, fetchDashboardMetrics, fetchDashboardBenchmarks } from '../../lib/supabaseWrite';
import { buildBehaviorGroups, pickNextStep, countWeekdays } from '../../utils/dashboardMetrics';
import './SourcingDashboardView.css';
import { salesAmountOf } from '../../utils/money';

// 個人ダッシュボード。メンバー切替で誰でも見られる。
// 2026-10-07 作り直し：一番上に基本の4つ（架電・キーマン接続・アポ・売上と、それぞれの率）、
// その下に上位と中位の差が分かれた行動の物差し・次の一歩・名前の出る順位表（むー様の指示）。
// 集計基準: 行動量=行動日ベース（DB の dashboard_member_metrics）、売上=面談実施日ベース。

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

  // 順位表・目安に入れる人（役員＝代表取締役・取締役は除く）とチーム
  const rankable = useMemo(() => {
    const map = new Map();
    (members || []).forEach(m => {
      if (typeof m !== 'object' || !m?.name) return;
      if (String(m.position || '').includes('取締役')) return;
      map.set(m.name, m.team || '');
    });
    return map;
  }, [members]);

  const range = useMemo(() => computeRange(period, now, monthStr), [period, now, monthStr]);
  const todayStr = jstDateStr(now);
  const effectiveTo = range.toDate > todayStr ? todayStr : range.toDate;

  // 人ごとの集計（DB側）と上位・中位の目安
  const [metrics, setMetrics] = useState([]);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setMetricsLoaded(false);
    fetchDashboardMetrics(range.fromISO, range.toISO).then(({ data }) => {
      if (cancelled) return;
      setMetrics(data || []);
      setMetricsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [range.fromISO, range.toISO]);
  const [bench, setBench] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchDashboardBenchmarks().then(({ data }) => { if (!cancelled) setBench(data); });
    return () => { cancelled = true; };
  }, []);

  const myRow = useMemo(() => metrics.find(r => r.getter_name === activeMember) || null, [metrics, activeMember]);
  const calls = myRow?.calls || 0;
  const keyman = myRow?.keyman || 0;
  const appo = myRow?.appo || 0;
  const workDays = myRow?.days || 0;

  // 売上（面談実施日ベース）。月モードは「その月の面談日すべて」でアポ一覧・アナリティクスと一致させる
  const inSalesPeriod = (meetDate) => {
    if (!meetDate) return false;
    const d = meetDate.slice(0, 10);
    if (period === 'month') return d.slice(0, 7) === (monthStr || range.fromDate.slice(0, 7));
    return d >= range.fromDate && d <= range.toDate;
  };
  const salesByName = useMemo(() => {
    const m = new Map();
    (appoData || []).forEach(a => {
      if (!a.getter || !SALES_STATUSES.includes(a.status) || !inSalesPeriod(a.meetDate)) return;
      const cur = m.get(a.getter) || { sales: 0, count: 0 };
      cur.sales += salesAmountOf(a);
      cur.count += 1;
      m.set(a.getter, cur);
    });
    return m;
  }, [appoData, period, monthStr, range.fromDate, range.toDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const mySales = salesByName.get(activeMember) || { sales: 0, count: 0 };

  // 順位表
  const rankings = useMemo(() => {
    const ok = (n) => rankable.has(n);
    const rows = metrics.filter(r => ok(r.getter_name));
    const sales = [...salesByName.entries()].filter(([n, v]) => ok(n) && v.sales > 0).map(([n, v]) => ({ name: n, v: v.sales }));
    return {
      sales: { label: '売上', unit: '¥', note: '当社売上（面談実施日ベース）', rows: sales },
      appo: { label: 'アポ数', unit: '件', note: '架電で取ったアポ', rows: rows.filter(r => r.appo > 0 || r.calls >= 100).map(r => ({ name: r.getter_name, v: r.appo })) },
      kmAppo: { label: 'キーマン→アポ率', unit: '%', note: 'キーマン接続10件以上の人だけ', rows: rows.filter(r => r.keyman >= 10).map(r => ({ name: r.getter_name, v: r.appo / r.keyman * 100 })) },
      days: { label: '稼働日数', unit: '日', note: `架電した日（平日${countWeekdays(range.fromDate, effectiveTo)}日のうち）`, rows: rows.map(r => ({ name: r.getter_name, v: r.days })) },
      recall: { label: '朝一の再コール', unit: '%', note: '1日の最初の50件に占める再コール', rows: rows.filter(r => r.recall50_pct !== null).map(r => ({ name: r.getter_name, v: Number(r.recall50_pct) })) },
      mtg: { label: 'MTG出席', unit: '%', note: '週次MTG 直近8回', rows: rows.filter(r => r.mtg_total > 0).map(r => ({ name: r.getter_name, v: r.mtg_attended / r.mtg_total * 100 })) },
    };
  }, [metrics, salesByName, rankable, range.fromDate, effectiveTo]);
  const [rankKey, setRankKey] = useUrlState('dash_rank', 'sales', { allowed: ['sales', 'appo', 'kmAppo', 'days', 'recall', 'mtg'] });
  const salesRank = useMemo(() => {
    const sorted = [...rankings.sales.rows].sort((a, b) => b.v - a.v);
    const i = sorted.findIndex(r => r.name === activeMember);
    return i < 0 ? null : sorted.filter(r => r.v > sorted[i].v).length + 1;
  }, [rankings, activeMember]);

  // 結果を出す行動と次の一歩
  const groups = useMemo(() => buildBehaviorGroups(myRow, bench, { fromDate: range.fromDate, toDate: effectiveTo }), [myRow, bench, range.fromDate, effectiveTo]);
  const nextStep = useMemo(() => pickNextStep(groups), [groups]);

  // ④ 今日の再コール予定
  const [recalls, setRecalls] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchAllRecallRecords().then(({ data }) => {
      if (cancelled) return;
      const mine = (data || []).filter(r =>
        (r._memoObj?.assignee || r.getter_name) === activeMember &&
        r._memoObj?.recall_date === todayStr
      ).sort((a, b) => (a._memoObj?.recall_time || '').localeCompare(b._memoObj?.recall_time || ''));
      setRecalls(mine);
    });
    return () => { cancelled = true; };
  }, [activeMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⑤ 直近アポ5件
  const recentAppos = useMemo(() =>
    (appoData || [])
      .filter(a => a.getter === activeMember)
      .sort((a, b) => (b.getDate || '').localeCompare(a.getDate || ''))
      .slice(0, 5)
  , [appoData, activeMember]);

  // ⑥ 再アプローチ候補（キーマン断り・温度感で絞り込み）
  const [tempFilter, setTempFilter] = useUrlState('dash_temp', 'ALL', { allowed: ['ALL', 'HIGH', 'MEDIUM'] });
  const [reapproach, setReapproach] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!activeMember) { setReapproach([]); return; }
    const temps = tempFilter === 'HIGH' ? ['HIGH'] : tempFilter === 'MEDIUM' ? ['MEDIUM'] : ['HIGH', 'MEDIUM'];
    fetchMemberReapproach(activeMember, temps).then(({ data }) => {
      if (cancelled) return;
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
  const recallsRef = useRef(null);
  const scrollToRecalls = () => {
    const el = recallsRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('db-flash'); void el.offsetWidth; el.classList.add('db-flash');
  };

  const periodLabel = period === 'today' ? '今日' : period === 'week' ? '今週' : (monthOptions.find(o => o.value === monthStr)?.label || '');
  const team = rankable.get(activeMember);
  const benchNote = bench?.window_from
    ? `直近3か月の人月（毎晩更新）`
    : '3〜9月の分析';

  return (
    <div className="db">
      <PageTitle
        title="ダッシュボード"
        sub={`${activeMember}${team ? ` ・ ${team}チーム` : ''} ・ ${periodLabel}（${range.fromDate.slice(5).replace('-', '/')}〜${effectiveTo.slice(5).replace('-', '/')}）`}
        right={(
          <>
            <select className="input" value={activeMember} onChange={e => setMember(e.target.value)} aria-label="メンバー">
              {memberOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Seg value={period} onChange={setPeriod} options={[['today', '今日'], ['week', '今週'], ['month', '月']]} />
            {period === 'month' && (
              <select className="input" value={monthStr} onChange={e => setMonthStr(e.target.value)} aria-label="月">
                {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </>
        )}
      />

      {/* 基本の4つ */}
      <section className="db-kpis">
        <div className="card db-kpi">
          <div className="lbl">架電件数</div>
          <div className="v n"><CountUp value={calls} /><small>件</small></div>
          <div className="rate"><b className="n">{workDays ? Math.round(calls / workDays) : 0}件</b><span>稼働日1日あたり</span></div>
          {!isMobile && <span className="flow" />}
        </div>
        <div className="card db-kpi">
          <div className="lbl">キーマン接続</div>
          <div className="v n"><CountUp value={keyman} /><small>件</small></div>
          <div className="rate"><b className="n">{calls ? (keyman / calls * 100).toFixed(1) : '0.0'}%</b><span>接続率（架電に対して）</span></div>
          {!isMobile && <span className="flow" />}
        </div>
        <div className="card db-kpi">
          <div className="lbl">アポ獲得</div>
          <div className="v n"><CountUp value={appo} /><small>件</small></div>
          <div className="rate"><b className="n">{keyman ? (appo / keyman * 100).toFixed(1) : '0.0'}%</b><span>キーマン接続に対して ・ 架電に対して {calls ? (appo / calls * 100).toFixed(2) : '0.00'}%</span></div>
        </div>
        <div className="card db-kpi sales">
          <div className="lbl">当社売上（面談実施日ベース）</div>
          <div className="v n">¥<CountUp value={mySales.sales} /></div>
          <div className="rate"><b className="n">{salesRank ? `${salesRank}位` : '—'}</b><span>全体で ・ 面談{mySales.count}件</span></div>
        </div>
      </section>

      <div className="db-cols">
        {/* 結果を出す行動 */}
        <section className="card box">
          <div className="card-h"><b>結果を出す行動</b><span>上位＝月ごとのアポ上位4名 ・ 中位＝それ以外で月500件以上（{benchNote}）</span></div>
          <div className="db-legend">
            <span><i style={{ background: '#032D60' }} />自分</span>
            <span><i style={{ background: '#0176D3' }} />上位の目安</span>
            <span><i style={{ background: '#8692A0' }} />中位</span>
          </div>
          {!metricsLoaded ? <div className="db-empty">集計しています</div> : groups.map(g => (
            <div className="db-grp" key={g.group}>
              <h3>{g.group}</h3>
              {g.items.map(it => <MetricRow key={it.key} it={it} />)}
            </div>
          ))}
        </section>

        <div className="db-stack">
          {/* 次の一歩 */}
          <section className="card db-next">
            <div className="lbl">次の一歩</div>
            {nextStep ? (
              <>
                <h2>{nextStep.title}</h2>
                <p>{nextStep.body}</p>
                <div className="why">
                  <div>{periodLabel}のあなた<b className="me n">{fmtMetric(nextStep.item.me, nextStep.item.unit)}</b></div>
                  <div>上位の目安<b className="n">{fmtMetric(nextStep.item.up, nextStep.item.unit)}</b></div>
                  <div>中位<b className="n">{fmtMetric(nextStep.item.mid, nextStep.item.unit)}</b></div>
                </div>
                {nextStep.action === 'recalls' && <button type="button" className="go" onClick={scrollToRecalls}>今日かけ直す企業を見る →</button>}
              </>
            ) : (
              <>
                <h2>{metricsLoaded && myRow ? '今の行動を続けましょう' : 'この期間の架電がまだありません'}</h2>
                <p>{metricsLoaded && myRow ? '物差しはすべて上位の目安に届いています。' : '架電すると、ここに一番効く次の一歩が出ます。'}</p>
              </>
            )}
          </section>

          {/* 順位表 */}
          <section className="card box">
            <div className="card-h"><b>順位表</b><span>{periodLabel}</span></div>
            <div className="db-tabs">
              {Object.entries(rankings).map(([k, r]) => (
                <button type="button" key={k} className={rankKey === k ? 'on' : ''} onClick={() => setRankKey(k)}>{r.label}</button>
              ))}
            </div>
            <RankList data={rankings[rankKey] || rankings.sales} me={activeMember} teams={rankable} key={rankKey} />
          </section>
        </div>
      </div>

      {/* これまでの欄 */}
      <div className="db-lower">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: space[4], marginBottom: space[4] }}>
          {/* ④ 今日の再コール予定 */}
          <div ref={recallsRef} style={{ borderRadius: radius.lg }}>
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
          </div>

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
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>
              再アプローチ候補（{reapproach.length}件）
            </div>
            <select className="input" value={tempFilter} onChange={e => setTempFilter(e.target.value)} aria-label="温度感">
              <option value="ALL">温度感: すべて</option>
              <option value="HIGH">温度感: 高</option>
              <option value="MEDIUM">温度感: 中</option>
            </select>
          </div>
          <div className="card" style={{ padding: space[2] }}>
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
          </div>
        </div>

        {/* ⑦ 曜日×時間帯 ヒートマップ */}
        <Section title="曜日 × 時間帯のキーマン接続率">
          <Heatmap data={heatmap} />
        </Section>
      </div>
    </div>
  );
}

// ─── 新しい小物 ───
const fmtMetric = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1);
  return s + (unit === '%' ? '%' : unit);
};

function Seg({ value, onChange, options }) {
  const ref = useRef(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('button.on');
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  return (
    <div className="seg" ref={ref}>
      <span className="pill-bg" style={{ left: pill.left, width: pill.width }} />
      {options.map(([v, l]) => (
        <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function CountUp({ value }) {
  const [v, setV] = useState(value);
  const prev = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = prev.current;
    prev.current = value;
    if (reduce || from === value) { setV(value); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 900, 1);
      setV(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Number(v || 0).toLocaleString('ja-JP')}</>;
}

const STATUS_LABEL = { up: '上位並み', near: 'あと少し', far: '差が大きい', none: 'データなし', unrecorded: '記録の準備中' };

function MetricRow({ it }) {
  const vals = [it.up, it.mid].concat(it.me === null ? [] : [it.me]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.2 || 1;
  const a = Math.max(0, lo - pad), b = hi + pad;
  const P0 = (v) => ((v - a) / (b - a)) * 100;
  const P = it.higherIsBetter ? P0 : (v) => 100 - P0(v);
  const zl = Math.min(P(it.mid), P(it.up)), zw = Math.abs(P(it.up) - P(it.mid));
  const gray = it.status === 'unrecorded' || it.status === 'none';
  const tagCls = gray ? 'gray' : it.status;
  const u = it.unit === '%' ? '%' : it.unit;
  const f = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1));
  return (
    <div className={`db-m${gray ? ' gray' : ''}`}>
      <div className="nm"><b>{it.name}</b><span>{it.sub}</span></div>
      <div className="me-v">{it.me === null ? '—' : <><span className="n">{f(it.me)}</span><small>{u}</small></>}</div>
      <div className="db-ruler">
        <span className="bg" />
        <span className="zone" style={{ left: `${zl}%`, width: `${zw}%` }} />
        <span className="tick" style={{ left: `${P(it.mid)}%` }} />
        <span className="mk" style={{ left: `${P(it.mid)}%` }}>中位 {f(it.mid)}{u}</span>
        <span className="tick up" style={{ left: `${P(it.up)}%` }} />
        <span className="mk up" style={{ left: `${P(it.up)}%` }}>上位 {f(it.up)}{u}</span>
        {it.me !== null && <span className="dot" style={{ left: `${Math.max(2, Math.min(98, P(it.me)))}%` }} />}
      </div>
      <div className="db-st"><span className={`db-tag ${tagCls}`}>{STATUS_LABEL[it.status]}</span></div>
    </div>
  );
}

function RankList({ data, me, teams }) {
  const rows = [...(data?.rows || [])].sort((x, y) => y.v - x.v);
  if (rows.length === 0) return <div className="db-empty">この期間の記録がありません</div>;
  const max = Math.max(...rows.map(r => r.v)) || 1;
  const fmt = (v) => (data.unit === '¥' ? '¥' + Math.round(v).toLocaleString('ja-JP')
    : (Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1)) + data.unit);
  let rank = 0, prev = null;
  return (
    <>
      {rows.map((r, i) => {
        if (r.v !== prev) { rank = i + 1; prev = r.v; }
        return (
          <div key={r.name} className={`db-rk${rank <= 3 ? ' t3' : ''}${r.name === me ? ' mine' : ''}`} style={{ animationDelay: `${i * 0.02}s` }}>
            <span className="no n">{rank}</span>
            <span className="nm">{r.name}{teams.get(r.name) ? <small>{teams.get(r.name)}</small> : null}</span>
            <span className="b"><i style={{ width: `${(r.v / max) * 100}%`, animationDelay: `${i * 0.03}s` }} /></span>
            <span className="v n">{fmt(r.v)}</span>
          </div>
        );
      })}
      <div className="db-rk-note">{data.note}</div>
    </>
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
    // width:100% だけだとスマホで1マス30px弱に潰れて数字が読めない。
    // 下限幅を置いて、狭い画面では横スクロールで送る。
    <div className="spa-scroll-x" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: font.size.sm, fontFamily: font.family.mono, width: '100%', minWidth: 560, tableLayout: 'fixed' }}>
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
