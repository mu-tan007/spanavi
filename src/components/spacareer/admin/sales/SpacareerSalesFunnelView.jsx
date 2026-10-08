import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { color, space, radius, font, shadow } from '../../../../constants/design';
import { Badge, DataTable, Button, Select, Input } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
import { supabase } from '../../../../lib/supabase';
import { loadZoomArchive, zoomShareIdOf, openZoomArchive } from '../../../../lib/spacareer/zoomArchive';

// ============================================================
// スパキャリ 営業ファネル（admin限定）
//
//   送信（CW自動送信ツール）→ 返信 → 面談獲得 → 初回面談 → 再アポ・クロ → 成約 を担当者ごとに見る。
//   設計: tasks/sekkei_spacareer_sales_funnel.md
//
//   送信数      cw_sent_workers_global（status='failed' を除く）をライセンスの担当者で数える
//   それ以外    spacareer_sales_events（Slack の報告を15分ごとに取り込み）
//   集計の正    ビュー spacareer_sales_funnel_weekly_v
//
//   名前で1人に決まらなかった報告は「未照合」に並ぶ。ここで人が結びつけると、
//   呼び名を覚えて次の報告から自動で結びつく。
// ============================================================

const TABS = [
  { key: 'reps', label: '担当者別' },
  { key: 'leads', label: '見込み客' },
  { key: 'unlinked', label: '未照合' },
];

const PERIODS = [
  { value: '1', label: '今週' },
  { value: 'last', label: '先週' },
  { value: '4', label: '直近4週' },
  { value: '12', label: '直近12週' },
];

const KIND_LABEL = {
  replied: '返信',
  booked: '面談獲得',
  first_meeting: '初回面談',
  re_meeting: '再アポ面談',
  closing: 'クロージング',
};

const SOURCE_OPTIONS = [
  { value: 'cw_apply', label: 'CW応募' },
  { value: 'fukugyo', label: '複業クラウド' },
  { value: 'other', label: 'その他' },
];

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// JST の週の月曜（YYYY-MM-DD）。ビューの date_trunc('week', ... at time zone 'Asia/Tokyo') と揃える
function weekStartJst(offsetWeeks = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow - offsetWeeks * 7));
  return monday.toISOString().slice(0, 10);
}

function periodRange(period) {
  if (period === 'last') return { from: weekStartJst(1), to: weekStartJst(1) };
  const n = Number(period) || 1;
  return { from: weekStartJst(n - 1), to: weekStartJst(0) };
}

function pct(num, den) {
  if (!den) return '—';
  return `${Math.round((num / den) * 1000) / 10}%`;
}

function stageOf(events) {
  const won = events.find((e) => e.kind === 'closing' && e.is_won);
  if (won) return { label: '成約', variant: 'success' };
  const last = events[events.length - 1];
  if (!last) return { label: '—', variant: 'neutral' };
  if (last.kind === 'booked') return { label: '面談予定', variant: 'primary' };
  if (last.kind === 'replied') return { label: '返信あり', variant: 'info' };
  const r = last.result || '';
  if (/飛び|キャンセル/.test(r)) return { label: r, variant: 'danger' };
  if (/失注|切り上げ/.test(r)) return { label: r, variant: 'neutral' };
  if (/リスケ|繋ぎ|直行/.test(r)) return { label: r, variant: 'warn' };
  return { label: `${KIND_LABEL[last.kind]} ${r}`.trim(), variant: 'default' };
}

function Num({ children, muted }) {
  return (
    <span style={{ fontFamily: font.family.display, color: muted ? color.textLight : color.textDark }}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, accent = color.navy }) {
  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      padding: space[4],
      minWidth: 0,
      flex: '1 1 130px',
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textDark, fontFamily: font.family.display, marginTop: space[1] }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------
// 未照合の1行：CWの送信記録から候補を探して結びつける
// ------------------------------------------------------------
function UnlinkedRow({ item, onLinked }) {
  const [query, setQuery] = useState(item.raw || '');
  const [candidates, setCandidates] = useState(null);
  const [source, setSource] = useState('cw_apply');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const search = async () => {
    setErr(null);
    const q = query.trim();
    if (!q) return;
    const { data, error } = await supabase
      .from('cw_sent_workers_global')
      .select('worker_id, worker_name, sent_at, license_key')
      .ilike('worker_name', `%${q}%`)
      .order('sent_at', { ascending: false })
      .limit(10);
    if (error) { setErr(error.message); return; }
    setCandidates(data || []);
  };

  const link = async (params) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('spacareer_sales_link_name', { p_name_norm: item.name_norm, ...params });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onLinked();
  };

  return (
    <div style={{ padding: space[3], background: color.offWhite }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <Input size="sm" label="CWの表示名で探す" value={query} onChange={(e) => setQuery(e.target.value)} fullWidth />
        </div>
        <Button size="sm" variant="secondary" onClick={search}>検索</Button>
        <div style={{ width: 150 }}>
          <Select size="sm" label="スカウト以外" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCE_OPTIONS} fullWidth />
        </div>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => link({ p_new_display_name: item.raw, p_source: source })}>
          この経路で登録
        </Button>
      </div>
      {err && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[2] }}>{err}</div>}
      {candidates && (
        <div style={{ marginTop: space[2] }}>
          {candidates.length === 0 && (
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>送信記録に候補なし</div>
          )}
          {candidates.map((c) => (
            <div key={c.worker_id} style={{ display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[1]}px 0`, fontSize: font.size.sm }}>
              <span style={{ fontWeight: font.weight.semibold, minWidth: 160 }}>{c.worker_name}</span>
              <span style={{ color: color.textLight, fontSize: font.size.xs }}>ID {c.worker_id}</span>
              <span style={{ color: color.textLight, fontSize: font.size.xs }}>送信 {fmtDateTime(c.sent_at)}</span>
              <a href={`https://crowdworks.jp/public/employees/${c.worker_id}`} target="_blank" rel="noreferrer"
                style={{ fontSize: font.size.xs, color: color.navyLight }}>
                CWで確認
              </a>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => link({ p_cw_worker_id: c.worker_id })}>
                この人に結びつける
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpacareerSalesFunnelView({ isAdmin }) {
  const [tab, setTab] = useState('reps');
  const [period, setPeriod] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const [weekly, setWeekly] = useState([]);
  const [reps, setReps] = useState([]);
  const [leads, setLeads] = useState([]);
  const [events, setEvents] = useState([]);
  const [senders, setSenders] = useState(new Map());
  const [lastFetched, setLastFetched] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [zoomArchive, setZoomArchive] = useState({ meetings: [], meetingByShare: new Map() });
  const [zoomErr, setZoomErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since12 = weekStartJst(11);

    const [wk, rp, ld, ev, lic, raw] = await Promise.all([
      supabase.from('spacareer_sales_funnel_weekly_v').select('*').gte('week', since12),
      supabase.from('spacareer_sales_reps').select('*').order('display_name'),
      supabase.from('spacareer_sales_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('spacareer_sales_events').select('*').order('occurred_at', { ascending: true }),
      supabase.from('cw_licenses').select('license_key, user_name, rep_id'),
      supabase.from('spacareer_sales_slack_raw').select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
    ]);
    const firstError = [wk, rp, ld, ev, lic, raw].find((r) => r.error);
    if (firstError) { setError(firstError.error.message); setLoading(false); return; }

    // 見込み客の送信者（CWのライセンス）を引く
    const workerIds = (ld.data || []).map((l) => l.cw_worker_id).filter(Boolean);
    const senderMap = new Map();
    if (workerIds.length) {
      const { data: sw } = await supabase
        .from('cw_sent_workers_global')
        .select('worker_id, license_key, sent_at')
        .in('worker_id', workerIds);
      const repById = new Map((rp.data || []).map((r) => [r.id, r.display_name]));
      const licByKey = new Map((lic.data || []).map((l) => [l.license_key, l]));
      for (const s of sw || []) {
        const l = licByKey.get(s.license_key);
        senderMap.set(s.worker_id, { name: repById.get(l?.rep_id) || l?.user_name || '—', sent_at: s.sent_at });
      }
    }

    setWeekly(wk.data || []);
    setReps(rp.data || []);
    setLeads(ld.data || []);
    setEvents(ev.data || []);
    setSenders(senderMap);
    setLastFetched(raw.data?.[0]?.fetched_at ?? null);
    setLoading(false);

    // Zoomから移した録画。読めなくてもファネル本体は出す。
    try { setZoomArchive(await loadZoomArchive()); setZoomErr(null); }
    catch (e) { setZoomErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error: e } = await supabase.functions.invoke('spacareer-sales-slack-sync', { body: {} });
    setSyncing(false);
    if (e || !data?.ok) { setSyncMsg(`取り込み失敗：${data?.error || e?.message || '不明'}`); return; }
    setSyncMsg('取り込み完了');
    load();
  };

  const repName = useMemo(() => new Map(reps.map((r) => [r.id, r.display_name])), [reps]);

  // ---- 担当者別 ----
  const repRows = useMemo(() => {
    const { from, to } = periodRange(period);
    const m = new Map();
    for (const w of weekly) {
      if (w.week < from || w.week > to) continue;
      const cur = m.get(w.rep_name) || { rep_name: w.rep_name, sent: 0, replied: 0, booked: 0, first_meetings: 0, no_shows: 0, later_meetings: 0, won: 0 };
      for (const k of ['sent', 'replied', 'booked', 'first_meetings', 'no_shows', 'later_meetings', 'won']) cur[k] += Number(w[k]) || 0;
      m.set(w.rep_name, cur);
    }
    return [...m.values()]
      .filter((r) => r.booked || r.first_meetings || r.later_meetings || r.won || r.replied || r.sent >= 50)
      .sort((a, b) => b.booked - a.booked || b.sent - a.sent);
  }, [weekly, period]);

  const totals = useMemo(() => repRows.reduce((t, r) => {
    for (const k of Object.keys(t)) t[k] += r[k];
    return t;
  }, { sent: 0, replied: 0, booked: 0, first_meetings: 0, no_shows: 0, later_meetings: 0, won: 0 }), [repRows]);

  // ---- 見込み客 ----
  const eventsByLead = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (!e.lead_id) continue;
      if (!m.has(e.lead_id)) m.set(e.lead_id, []);
      m.get(e.lead_id).push(e);
    }
    return m;
  }, [events]);

  const leadRows = useMemo(() => leads.map((l) => {
    const evs = eventsByLead.get(l.id) || [];
    const booked = evs.filter((e) => e.kind === 'booked');
    const nextBooked = booked.map((e) => e.scheduled_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const lastAt = evs.length ? evs[evs.length - 1].occurred_at : l.created_at;
    return {
      ...l,
      _events: evs,
      _stage: stageOf(evs),
      _sender: l.cw_worker_id ? senders.get(l.cw_worker_id) : null,
      _getter: booked.length ? repName.get(booked[booked.length - 1].rep_id) : null,
      _meetingAt: nextBooked,
      _lastAt: lastAt,
    };
  }).sort((a, b) => new Date(b._lastAt) - new Date(a._lastAt)), [leads, eventsByLead, senders, repName]);

  // ---- 未照合 ----
  const unlinked = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.lead_id || !e.worker_name_norm) continue;
      const cur = m.get(e.worker_name_norm) || { name_norm: e.worker_name_norm, raw: e.worker_name_raw, count: 0, kinds: new Set(), last: null, rep: null };
      cur.count += 1;
      cur.kinds.add(KIND_LABEL[e.kind]);
      cur.last = e.occurred_at;
      cur.rep = repName.get(e.rep_id) || cur.rep;
      m.set(e.worker_name_norm, cur);
    }
    return [...m.values()].sort((a, b) => new Date(b.last) - new Date(a.last));
  }, [events, repName]);

  const toggle = (key) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  if (!isAdmin) {
    return (
      <div style={{ padding: space[6], color: color.textMid, fontSize: font.size.sm }}>
        このページは管理者のみ閲覧できます。
      </div>
    );
  }

  const repColumns = [
    { key: 'rep_name', label: '担当者', width: 120, mobilePrimary: true,
      render: (r) => <span style={{ fontWeight: font.weight.semibold }}>{r.rep_name}</span> },
    { key: 'sent', label: '送信', width: 80, align: 'right', sortable: true, sortValue: (r) => r.sent,
      render: (r) => <Num muted={!r.sent}>{r.sent.toLocaleString()}</Num> },
    { key: 'replied', label: '返信', width: 70, align: 'right', sortable: true, sortValue: (r) => r.replied,
      render: (r) => <Num muted={!r.replied}>{r.replied}</Num> },
    { key: 'booked', label: '面談獲得', width: 90, align: 'right', sortable: true, sortValue: (r) => r.booked,
      render: (r) => <Num>{r.booked}</Num> },
    { key: 'book_rate', label: '獲得率', width: 80, align: 'right',
      render: (r) => <Num muted>{pct(r.booked, r.sent)}</Num> },
    { key: 'first_meetings', label: '初回面談', width: 90, align: 'right', sortable: true, sortValue: (r) => r.first_meetings,
      render: (r) => <Num>{r.first_meetings}</Num> },
    { key: 'no_shows', label: '飛び・キャンセル', width: 120, align: 'right',
      render: (r) => <Num muted={!r.no_shows}>{r.no_shows}</Num> },
    { key: 'later_meetings', label: '再アポ・クロ', width: 100, align: 'right',
      render: (r) => <Num muted={!r.later_meetings}>{r.later_meetings}</Num> },
    { key: 'won', label: '成約', width: 70, align: 'right', sortable: true, sortValue: (r) => r.won,
      render: (r) => <Num>{r.won}</Num> },
  ];

  const leadColumns = [
    { key: 'display_name', label: '見込み客', width: 170, mobilePrimary: true,
      render: (r) => (
        <span style={{ fontWeight: font.weight.semibold }}>
          {r.cw_worker_id
            ? <a href={`https://crowdworks.jp/public/employees/${r.cw_worker_id}`} target="_blank" rel="noreferrer" style={{ color: color.textDark }}>{r.display_name}</a>
            : r.display_name}
        </span>
      ) },
    { key: '_stage', label: '状況', width: 150, render: (r) => <Badge variant={r._stage.variant} size="sm">{r._stage.label}</Badge> },
    { key: '_meetingAt', label: '初回面談', width: 100, sortable: true, sortValue: (r) => (r._meetingAt ? new Date(r._meetingAt).getTime() : 0),
      render: (r) => <span style={{ color: color.textMid }}>{fmtDateTime(r._meetingAt)}</span> },
    { key: '_sender', label: '送信者', width: 90, render: (r) => <span style={{ color: color.textMid }}>{r._sender?.name || '—'}</span> },
    { key: '_getter', label: '獲得者', width: 90, render: (r) => <span style={{ color: color.textMid }}>{r._getter || '—'}</span> },
    { key: 'source', label: '経路', width: 100, mobileHidden: true,
      render: (r) => <span style={{ color: color.textLight, fontSize: font.size.xs }}>
        {{ cw_scout: 'CWスカウト', cw_apply: 'CW応募', fukugyo: '複業クラウド', other: 'その他', unknown: '不明' }[r.source]}
      </span> },
    { key: '_lastAt', label: '最終更新', width: 100, sortable: true, sortValue: (r) => new Date(r._lastAt).getTime(),
      render: (r) => <span style={{ color: color.textLight }}>{fmtDateTime(r._lastAt)}</span> },
  ];

  const meetingByUuid = useMemo(
    () => new Map(zoomArchive.meetings.map((m) => [m.uuid, m])),
    [zoomArchive],
  );

  const playArchive = async (key) => {
    try { await openZoomArchive(key); } catch (e) { setZoomErr(e.message); }
  };

  // Zoomの共有リンクは、移した録画があればスパナビの中で再生する（Zoomから外したあとも見られる）。
  const renderRecordingLink = (url) => {
    const shareId = zoomShareIdOf(url);
    const meeting = shareId ? meetingByUuid.get(zoomArchive.meetingByShare.get(shareId)) : null;
    if (meeting?.play) {
      return (
        <a href="#" onClick={(ev) => { ev.preventDefault(); playArchive(meeting.play.r2_key); }} style={{ color: color.navyLight }}>
          録画
        </a>
      );
    }
    return <a href={url} target="_blank" rel="noreferrer" style={{ color: color.navyLight }}>録画</a>;
  };

  const renderTimeline = (r) => (
    <div style={{ padding: `${space[2]}px ${space[4]}px` }}>
      {r._sender && (
        <div style={{ fontSize: font.size.xs, color: color.textMid, padding: '2px 0' }}>
          {fmtDateTime(r._sender.sent_at)}　送信（{r._sender.name}）
        </div>
      )}
      {r._events.map((e) => (
        <div key={e.id} style={{ fontSize: font.size.xs, color: color.textMid, padding: '2px 0', display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <span>{fmtDateTime(e.occurred_at)}</span>
          <span style={{ fontWeight: font.weight.semibold, color: color.textDark }}>{KIND_LABEL[e.kind]}</span>
          {e.result && <span>{e.result}</span>}
          {e.scheduled_at && <span>面談 {fmtDateTime(e.scheduled_at)}</span>}
          {e.rep_id && <span>（{repName.get(e.rep_id)}）</span>}
          {e.recording_url && renderRecordingLink(e.recording_url)}
        </div>
      ))}
    </div>
  );

  const unlinkedColumns = [
    { key: 'raw', label: '報告の名前', width: 180, mobilePrimary: true,
      render: (r) => <span style={{ fontWeight: font.weight.semibold }}>{r.raw}</span> },
    { key: 'kinds', label: '報告', width: 170, render: (r) => <span style={{ color: color.textMid }}>{[...r.kinds].join('・')}（{r.count}件）</span> },
    { key: 'rep', label: '担当', width: 90, render: (r) => <span style={{ color: color.textMid }}>{r.rep || '—'}</span> },
    { key: 'last', label: '最終報告', width: 100, render: (r) => <span style={{ color: color.textLight }}>{fmtDateTime(r.last)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="営業ファネル"
        description="CW送信からSlackの面談報告・成約までを担当者ごとに集計。Slackは15分ごとに取り込み。"
        compact
        right={
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              {syncMsg || (lastFetched ? `最終取り込み ${fmtDateTime(lastFetched)}` : '')}
            </span>
            <Button size="sm" variant="secondary" onClick={syncNow} disabled={syncing}>
              {syncing ? '取り込み中' : 'Slackから取り込み'}
            </Button>
          </div>
        }
      />

      <div style={{ paddingTop: space[4] }}>
        <SubTabs
          tabs={TABS.map((t) => (t.key === 'unlinked' && unlinked.length ? { ...t, label: `${t.label}（${unlinked.length}）` } : t))}
          activeKey={tab}
          onChange={setTab}
        />

        {tab === 'reps' && (
          <>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', marginBottom: space[4], flexWrap: 'wrap' }}>
              <div style={{ width: 140 }}>
                <Select size="sm" label="期間" value={period} onChange={(e) => setPeriod(e.target.value)} options={PERIODS} fullWidth />
              </div>
            </div>
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
              <StatCard label="送信" value={totals.sent.toLocaleString()} accent={color.navyLight} />
              <StatCard label="返信" value={totals.replied} accent={color.navyLight} />
              <StatCard label="面談獲得" value={totals.booked} sub={`送信の ${pct(totals.booked, totals.sent)}`} />
              <StatCard label="初回面談" value={totals.first_meetings} sub={`飛び・キャンセル ${totals.no_shows}`} />
              <StatCard label="成約" value={totals.won} accent={color.gold} />
            </div>
            <DataTable
              columns={repColumns}
              rows={repRows}
              rowKey="rep_name"
              loading={loading}
              error={error}
              emptyMessage="この期間の記録なし"
              height="calc(100vh - 460px)"
            />
          </>
        )}

        {tab === 'leads' && (
          <DataTable
            columns={leadColumns}
            rows={leadRows}
            rowKey="id"
            loading={loading}
            error={error}
            emptyMessage="見込み客なし"
            height="calc(100vh - 300px)"
            expandable={() => true}
            renderExpanded={renderTimeline}
            expandedKeys={expanded}
            onToggleExpand={toggle}
          />
        )}

        {tab === 'unlinked' && (
          <DataTable
            columns={unlinkedColumns}
            rows={unlinked}
            rowKey="name_norm"
            loading={loading}
            error={error}
            emptyMessage="未照合の報告なし"
            height="calc(100vh - 300px)"
            expandable={() => true}
            renderExpanded={(r) => <UnlinkedRow item={r} onLinked={load} />}
            expandedKeys={expanded}
            onToggleExpand={toggle}
          />
        )}
      </div>
    </div>
  );
}
