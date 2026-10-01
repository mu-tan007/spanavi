import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { color, space, radius, font, shadow } from '../../../constants/design';
import { Card, DataTable, Select } from '../../ui';
import PageHeader from '../../common/PageHeader';
import { supabase } from '../../../lib/supabase';
import { useIsMobile } from '../../../hooks/useIsMobile';

// ============================================================
// 全社 > サイト分析（管理者のみ）
//   ma-sp.co の GA4（サイト全体）と Search Console（Google 検索）を日別で表示する。
//   数字は Edge Function sync-site-analytics が毎朝 6:10 に取り込む。
// ============================================================

const SITE = 'ma-sp.co';

const PERIODS = [
  { value: '7', label: '直近7日' },
  { value: '28', label: '直近28日' },
  { value: '90', label: '直近90日' },
  { value: '365', label: '直近365日' },
];

const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());
const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
const pos = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1));
const dur = (sec) => {
  if (sec === null || sec === undefined) return '—';
  const s = Math.round(Number(sec));
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
};

// 日本時間の日付を 'YYYY-MM-DD' で
function jstYmd(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const mdLabel = (ymd) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const dayLabel = (ymd) => `${ymd.replaceAll('-', '/')}（${WEEK[new Date(ymd + 'T00:00:00Z').getUTCDay()]}）`;

function sumOf(rows, key) {
  let s = 0, any = false;
  for (const r of rows) if (r[key] !== null && r[key] !== undefined) { s += Number(r[key]); any = true; }
  return any ? s : null;
}
// 平均掲載順位・平均滞在時間は重み付き平均
function weighted(rows, key, weightKey) {
  let s = 0, w = 0;
  for (const r of rows) {
    if (r[key] === null || r[key] === undefined || !r[weightKey]) continue;
    s += Number(r[key]) * Number(r[weightKey]); w += Number(r[weightKey]);
  }
  return w ? s / w : null;
}

function Delta({ cur, prev, lowerIsBetter = false }) {
  if (cur === null || prev === null || !prev) return null;
  const d = ((cur - prev) / prev) * 100;
  if (!isFinite(d)) return null;
  const good = lowerIsBetter ? d <= 0 : d >= 0;
  return (
    <span style={{ color: good ? color.success : color.danger, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
      {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
    </span>
  );
}

function MetricCard({ label, value, cur, prev, lowerIsBetter, spark, sparkKey, accent }) {
  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`, borderTop: `3px solid ${accent}`,
      borderRadius: radius.lg, boxShadow: shadow.sm, padding: space[4],
      display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textDark, fontFamily: font.family.display }}>
          {value}
        </div>
        <Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} />
      </div>
      <div style={{ height: 36, marginTop: 'auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spark} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <YAxis hide reversed={lowerIsBetter} domain={['auto', 'auto']} />
            <Line dataKey={sparkKey} stroke={accent} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DailyChart({ data, series, reversedRight = false }) {
  const hasRight = series.some(s => s.axis === 'right');
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: hasRight ? 0 : 16, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={false} minTickGap={16} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: color.textMid }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        {hasRight && (
          <YAxis yAxisId="right" orientation="right" reversed={reversedRight} tick={{ fontSize: 11, fill: color.textMid }} axisLine={false} tickLine={false} width={36} />
        )}
        <Tooltip
          contentStyle={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.xs }}
          labelStyle={{ color: color.textDark, fontWeight: font.weight.semibold }}
        />
        <Legend wrapperStyle={{ fontSize: font.size.xs, color: color.textMid }} />
        {series.map(s => (
          <Line
            key={s.key} yAxisId={s.axis || 'left'} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// padding="none" の Card は見出しの余白も 0 になるため、見出しだけ余白を足す
const CARD_HEAD = { padding: `${space[4]}px ${space[5]}px ${space[3]}px` };

const SITE_COLOR = color.navy;
const SITE_COLOR_2 = color.navyLight;
const SEARCH_COLOR = color.gold;
const SEARCH_COLOR_2 = color.success;

export default function SiteAnalyticsView() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState('28');
  const [rows, setRows] = useState([]);
  const [breakdown, setBreakdown] = useState({ query: [], channel: [], ga_page: [] });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const days = Number(period);
  const end = jstYmd(-1);
  const start = jstYmd(-days);
  const prevStart = jstYmd(-days * 2);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const bd = (kind) => supabase.rpc('site_breakdown_summary', { p_site: SITE, p_kind: kind, p_start: start, p_end: end, p_limit: 20 });
    const [d, q, c, p, u] = await Promise.all([
      supabase.from('site_metrics_daily').select('*').eq('site', SITE).gte('date', prevStart).lte('date', end).order('date'),
      bd('query'), bd('channel'), bd('ga_page'),
      supabase.from('site_metrics_daily').select('updated_at').eq('site', SITE).order('updated_at', { ascending: false }).limit(1),
    ]);
    const err = [d, q, c, p, u].find(r => r.error)?.error;
    if (err) setError(err.message);
    setRows(d.data || []);
    setBreakdown({ query: q.data || [], channel: c.data || [], ga_page: p.data || [] });
    setLastUpdated(u.data?.[0]?.updated_at || null);
    setLoading(false);
  }, [start, end, prevStart]);

  useEffect(() => { load(); }, [load]);

  // 期間内の全日を並べる（取り込みの無い日も空欄で出す）
  const cur = useMemo(() => {
    const byDate = new Map(rows.map(r => [r.date, r]));
    const out = [];
    for (let i = days; i >= 1; i--) {
      const ymd = jstYmd(-i);
      out.push({ date: ymd, ...(byDate.get(ymd) || {}) });
    }
    return out;
  }, [rows, days]);
  const prev = useMemo(() => rows.filter(r => r.date >= prevStart && r.date < start), [rows, prevStart, start]);

  const k = useMemo(() => ({
    users: [sumOf(cur, 'ga_users'), sumOf(prev, 'ga_users')],
    sessions: [sumOf(cur, 'ga_sessions'), sumOf(prev, 'ga_sessions')],
    pv: [sumOf(cur, 'ga_page_views'), sumOf(prev, 'ga_page_views')],
    imp: [sumOf(cur, 'gsc_impressions'), sumOf(prev, 'gsc_impressions')],
    clicks: [sumOf(cur, 'gsc_clicks'), sumOf(prev, 'gsc_clicks')],
    position: [weighted(cur, 'gsc_position', 'gsc_impressions'), weighted(prev, 'gsc_position', 'gsc_impressions')],
  }), [cur, prev]);

  const chartData = useMemo(() => cur.map(r => ({
    label: mdLabel(r.date),
    訪問者: r.ga_users ?? null,
    セッション: r.ga_sessions ?? null,
    ページビュー: r.ga_page_views ?? null,
    表示回数: r.gsc_impressions ?? null,
    クリック: r.gsc_clicks ?? null,
    平均順位: r.gsc_position != null ? Number(Number(r.gsc_position).toFixed(1)) : null,
  })), [cur]);

  const tableRows = useMemo(() => [...cur].reverse(), [cur]);

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '未取り込み';

  const right = (
    <div style={{ width: 140 }}>
      <Select size="sm" value={period} onChange={e => setPeriod(e.target.value)} options={PERIODS} />
    </div>
  );

  const gridCols = isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="サイト分析"
        description={`ma-sp.co ／ 最終取り込み ${updatedLabel} ／ Google 検索の数字は2〜3日遅れで確定`}
        right={right}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], paddingTop: space[5] }}>
        {error && (
          <Card variant="flat"><span style={{ color: color.danger, fontSize: font.size.sm }}>読み込みエラー：{error}</span></Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: space[3] }}>
          <MetricCard label="訪問者数（延べ）" value={num(k.users[0])} cur={k.users[0]} prev={k.users[1]} spark={chartData} sparkKey="訪問者" accent={SITE_COLOR} />
          <MetricCard label="セッション" value={num(k.sessions[0])} cur={k.sessions[0]} prev={k.sessions[1]} spark={chartData} sparkKey="セッション" accent={SITE_COLOR_2} />
          <MetricCard label="ページビュー" value={num(k.pv[0])} cur={k.pv[0]} prev={k.pv[1]} spark={chartData} sparkKey="ページビュー" accent={SITE_COLOR_2} />
          <MetricCard label="検索の表示回数" value={num(k.imp[0])} cur={k.imp[0]} prev={k.imp[1]} spark={chartData} sparkKey="表示回数" accent={SEARCH_COLOR} />
          <MetricCard label="検索のクリック数" value={num(k.clicks[0])} cur={k.clicks[0]} prev={k.clicks[1]} spark={chartData} sparkKey="クリック" accent={SEARCH_COLOR_2} />
          <MetricCard label="平均掲載順位" value={pos(k.position[0])} cur={k.position[0]} prev={k.position[1]} lowerIsBetter spark={chartData} sparkKey="平均順位" accent={SEARCH_COLOR} />
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: -space[3] }}>
          比較は直前の同じ日数との増減。訪問者数は日ごとの人数の合計。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: space[4] }}>
          <Card title="サイトへの訪問（GA4）">
            <DailyChart data={chartData} series={[
              { key: '訪問者', label: '訪問者', color: SITE_COLOR },
              { key: 'セッション', label: 'セッション', color: SITE_COLOR_2 },
            ]} />
          </Card>
          <Card title="Google 検索（Search Console）">
            <DailyChart data={chartData} reversedRight series={[
              { key: '表示回数', label: '表示回数', color: SEARCH_COLOR },
              { key: 'クリック', label: 'クリック', color: SEARCH_COLOR_2 },
              { key: '平均順位', label: '平均順位（右軸）', color: color.gray400, axis: 'right' },
            ]} />
          </Card>
        </div>

        <Card title="日別" padding="none" headerStyle={CARD_HEAD}>
          <DataTable
            fillWidth
            height={isMobile ? 420 : 'auto'}
            loading={loading}
            rows={tableRows}
            rowKey="date"
            emptyMessage="まだ数字がありません"
            columns={[
              { key: 'date', label: '日付', width: 150, align: 'right', render: r => dayLabel(r.date) },
              { key: 'ga_users', label: '訪問者', width: 80, align: 'right', render: r => num(r.ga_users) },
              { key: 'ga_new_users', label: '新規', width: 70, align: 'right', render: r => num(r.ga_new_users) },
              { key: 'ga_sessions', label: 'セッション', width: 90, align: 'right', render: r => num(r.ga_sessions) },
              { key: 'ga_page_views', label: 'ページビュー', width: 100, align: 'right', render: r => num(r.ga_page_views) },
              { key: 'ga_avg_session_sec', label: '平均滞在', width: 90, align: 'right', render: r => dur(r.ga_avg_session_sec) },
              { key: 'gsc_impressions', label: '検索の表示', width: 90, align: 'right', render: r => num(r.gsc_impressions) },
              { key: 'gsc_clicks', label: 'クリック', width: 80, align: 'right', render: r => num(r.gsc_clicks) },
              { key: 'gsc_ctr', label: 'クリック率', width: 90, align: 'right', render: r => pct(r.gsc_ctr) },
              { key: 'gsc_position', label: '平均順位', width: 80, align: 'right', render: r => pos(r.gsc_position) },
            ]}
          />
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: space[4] }}>
          <Card title="検索語句" description="Google 検索で表示された語句（上位20）" padding="none" headerStyle={CARD_HEAD}>
            <DataTable
              fillWidth height="auto" showCount={false} loading={loading} rows={breakdown.query} rowKey="key"
              emptyMessage="まだ数字がありません"
              columns={[
                { key: 'key', label: '語句', width: 180, align: 'left' },
                { key: 'impressions', label: '表示', width: 60, align: 'right', render: r => num(r.impressions) },
                { key: 'clicks', label: 'クリック', width: 64, align: 'right', render: r => num(r.clicks) },
                { key: 'avg_position', label: '順位', width: 56, align: 'right', render: r => pos(r.avg_position) },
              ]}
            />
          </Card>
          <Card title="流入元" description="どこから来たか（GA4）" padding="none" headerStyle={CARD_HEAD}>
            <DataTable
              fillWidth height="auto" showCount={false} loading={loading} rows={breakdown.channel} rowKey="key"
              emptyMessage="まだ数字がありません"
              columns={[
                { key: 'key', label: '流入元', width: 180, align: 'left' },
                { key: 'sessions', label: 'セッション', width: 80, align: 'right', render: r => num(r.sessions) },
                { key: 'users', label: '訪問者', width: 70, align: 'right', render: r => num(r.users) },
              ]}
            />
          </Card>
          <Card title="よく見られたページ" description="ページビュー上位20（GA4）" padding="none" headerStyle={CARD_HEAD}>
            <DataTable
              fillWidth height="auto" showCount={false} loading={loading} rows={breakdown.ga_page} rowKey="key"
              emptyMessage="まだ数字がありません"
              columns={[
                { key: 'key', label: 'ページ', width: 200, align: 'left' },
                { key: 'page_views', label: 'ページビュー', width: 90, align: 'right', render: r => num(r.page_views) },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
