import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend,
} from 'recharts';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Card, DataTable, Select } from '../../ui';
import { CompanyFinance, SegmentFinance } from './FinanceSection';
import PageHeader from '../../common/PageHeader';
import { supabase } from '../../../lib/supabase';
import { useIsMobile } from '../../../hooks/useIsMobile';

// ============================================================
// 全社 > 業績（管理者のみ）
//   月ごとの新規顧客数・支援した会社数（棒）と取得アポ数・売上（線）を1つのグラフに重ねる。
//   数え方は DB 関数 corporate_business_metrics に集約（新規＝契約締結日と初回架電日の早いほう、
//   支援＝その月に1件以上架電、アポ＝登録日、売上＝面談日・開拓リスト由来は除く）。
// ============================================================

// 事業年度は6月1日〜翌5月31日（5月決算）。第1期は2025-06-17設立。
function fiscalYearOf(ymd) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return m >= 6 ? y : y - 1; // 期首の年
}
const termNo = (fyStart) => fyStart - 2024; // 2025年6月期首＝第1期

function jstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

const FIRST_DATA_MONTH = '2026-03-01'; // Spanavi で架電・アポの記録が始まった月

const yen = (v) => (v === null || v === undefined ? '—' : `¥${Number(v).toLocaleString()}`);
const cnt = (unit) => (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString()}${unit}`);
// グラフの軸だけは桁を詰める
const yenAxis = (v) => (v >= 10_000 ? `${Math.round(v / 10_000).toLocaleString()}万` : String(v));

const METRICS = [
  { key: 'new_clients', label: '新規顧客', unit: '社', fmt: cnt('社'), accent: color.gold, sum: true,
    note: '契約締結日か初回架電日の早いほうがその月の顧客' },
  { key: 'active_clients', label: '支援した会社', unit: '社', fmt: cnt('社'), accent: color.navyLight, sum: false,
    note: 'その月に1件以上架電した顧客' },
  { key: 'appo_count', label: '取得アポ', unit: '件', fmt: cnt('件'), accent: color.navy, sum: true,
    note: 'その月に取得したアポ（キャンセル含む）' },
  { key: 'sales', label: '売上', unit: '', fmt: yen, accent: color.success, sum: true, money: true,
    note: '面談日がその月のアポの売上（税込）' },
];

function Delta({ cur, prev }) {
  if (cur === null || prev === null || cur === undefined || prev === undefined) return null;
  const d = cur - prev;
  if (d === 0) return <span style={{ color: color.textLight, fontSize: font.size.xs }}>前月と同じ</span>;
  const up = d > 0;
  return (
    <span style={{ color: up ? color.success : color.danger, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
      {up ? '▲' : '▼'} {prev ? `${Math.abs((d / prev) * 100).toFixed(0)}%` : '—'}
    </span>
  );
}

function MetricCard({ m, total, latest, prev, latestLabel, totalLabel }) {
  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`, borderTop: `3px solid ${m.accent}`,
      borderRadius: radius.lg, boxShadow: shadow.sm, padding: space[4],
      display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>
        {m.label}{m.sum ? `（${totalLabel}）` : `（${latestLabel}）`}
      </div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textDark, fontFamily: font.family.display }}>
        {m.fmt(m.sum ? total : latest)}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap', fontSize: font.size.xs, color: color.textMid }}>
        {m.sum && <span>{latestLabel} {m.fmt(latest)}</span>}
        <Delta cur={latest} prev={prev} />
      </div>
    </div>
  );
}

// 棒＝顧客（新規・支援）、線＝成果（アポ・売上）。単位が違うので軸を3本持つ。
// 「形で比べる」は各指標を期間内の最大値=100にそろえ、増減の連動だけを見る。
const SERIES = {
  new_clients: { kind: 'bar', axis: 'co' },
  active_clients: { kind: 'bar', axis: 'co' },
  appo_count: { kind: 'line', axis: 'appo' },
  sales: { kind: 'line', axis: 'yen' },
};
const SERIES_COLOR = {
  new_clients: color.gold,
  active_clients: alpha(color.navyLight, 0.55),
  appo_count: color.navy,
  sales: color.success,
};

function CombinedTooltip({ active, payload, label, rawByLabel }) {
  if (!active || !payload?.length) return null;
  const raw = rawByLabel.get(label) || {};
  return (
    <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, boxShadow: shadow.md, padding: `${space[2]}px ${space[3]}px`, fontSize: font.size.xs }}>
      <div style={{ fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[1] }}>{label}</div>
      {METRICS.map(m => (
        <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', gap: space[4], color: color.textMid }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SERIES_COLOR[m.key], marginRight: 6 }} />{m.label}</span>
          <span style={{ color: color.textDark, fontWeight: font.weight.semibold }}>{m.fmt(raw[m.key])}</span>
        </div>
      ))}
    </div>
  );
}

function CombinedChart({ data, currentKey, mode, hidden, onToggle, height }) {
  const shape = mode === 'shape';
  const maxOf = useMemo(() => Object.fromEntries(
    METRICS.map(m => [m.key, Math.max(0, ...data.map(d => Number(d[m.key] || 0)))])
  ), [data]);
  // 線は締まった月までを実線、締まった最後の月→今月（途中）だけを点線で別に引く
  const curIdx = data.findIndex(d => d.month === currentKey);
  const plotted = useMemo(() => data.map((d, i) => {
    const o = { ...d };
    if (shape) {
      for (const m of METRICS) {
        o[m.key] = d[m.key] === null ? null : (maxOf[m.key] ? Math.round((Number(d[m.key]) / maxOf[m.key]) * 100) : 0);
      }
    }
    for (const m of METRICS.filter(x => SERIES[x.key].kind === 'line')) {
      o[`${m.key}_cur`] = (curIdx > 0 && (i === curIdx || i === curIdx - 1)) ? o[m.key] : null;
      if (i === curIdx) o[m.key] = null;
    }
    return o;
  }), [data, shape, maxOf, curIdx]);
  const rawByLabel = useMemo(() => new Map(data.map(d => [d.label, d])), [data]);
  const axisOf = (key) => (shape ? 'shape' : SERIES[key].axis);
  const tick = { fontSize: 11, fill: color.textMid };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={plotted} margin={{ top: 24, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick} axisLine={{ stroke: color.border }} tickLine={false} interval={0} />
        {shape ? (
          <YAxis yAxisId="shape" domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} width={36} />
        ) : (
          <>
            <YAxis yAxisId="co" tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false}
              label={{ value: '社', position: 'top', offset: 10, fontSize: 11, fill: color.textMid }} />
            <YAxis yAxisId="appo" tick={tick} axisLine={false} tickLine={false} width={40} allowDecimals={false}
              label={{ value: '件', position: 'top', offset: 10, fontSize: 11, fill: color.textMid }} />
            <YAxis yAxisId="yen" orientation="right" tick={tick} axisLine={false} tickLine={false} width={52} tickFormatter={yenAxis}
              label={{ value: '売上', position: 'top', offset: 10, fontSize: 11, fill: color.textMid }} />
          </>
        )}
        <Tooltip cursor={{ fill: alpha(color.navyLight, 0.06) }} content={<CombinedTooltip rawByLabel={rawByLabel} />} />
        <Legend
          wrapperStyle={{ fontSize: font.size.xs, cursor: 'pointer', paddingTop: space[2] }}
          onClick={(e) => onToggle(e.dataKey)}
          formatter={(value, entry) => (
            <span style={{ color: hidden.has(entry.dataKey) ? color.textLight : color.textMid, textDecoration: hidden.has(entry.dataKey) ? 'line-through' : 'none' }}>{value}</span>
          )}
        />
        {METRICS.filter(m => SERIES[m.key].kind === 'bar').map(m => (
          <Bar key={m.key} yAxisId={axisOf(m.key)} dataKey={m.key} name={m.label} fill={SERIES_COLOR[m.key]}
            hide={hidden.has(m.key)} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {plotted.map(d => (
              <Cell key={d.month} fill={d.month === currentKey ? alpha(SERIES_COLOR[m.key], 0.4) : SERIES_COLOR[m.key]} />
            ))}
          </Bar>
        ))}
        {METRICS.filter(m => SERIES[m.key].kind === 'line').map(m => (
          <Line key={m.key} yAxisId={axisOf(m.key)} dataKey={m.key} name={m.label} type="monotone"
            stroke={SERIES_COLOR[m.key]} strokeWidth={2.5} dot={{ r: 3, fill: SERIES_COLOR[m.key] }} activeDot={{ r: 5 }}
            hide={hidden.has(m.key)} isAnimationActive={false} />
        ))}
        {METRICS.filter(m => SERIES[m.key].kind === 'line').map(m => (
          <Line key={`${m.key}_cur`} yAxisId={axisOf(m.key)} dataKey={`${m.key}_cur`} name={`${m.label}（今月途中）`} type="linear"
            stroke={SERIES_COLOR[m.key]} strokeWidth={2} strokeDasharray="5 4" legendType="none"
            // 白抜きの点は今月だけ（締まった月の点は実線側の点と重なるので描かない）
            dot={(p) => (p.index === curIdx && p.cy != null
              ? <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill={color.white} stroke={SERIES_COLOR[m.key]} strokeWidth={2} />
              : <g key={p.key} />)}
            activeDot={false}
            hide={hidden.has(m.key)} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const CARD_HEAD = { padding: `${space[4]}px ${space[5]}px ${space[3]}px` };

export default function BusinessMetricsView() {
  const isMobile = useIsMobile();
  const today = jstToday();
  const currentFy = fiscalYearOf(today);
  const currentMonth = `${today.slice(0, 7)}-01`;

  const [fy, setFy] = useState(String(currentFy));
  const [segment, setSegment] = useState('company');
  const [rows, setRows] = useState([]);
  const [finRows, setFinRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mode, setMode] = useState('value');
  const [hidden, setHidden] = useState(() => new Set());
  const toggle = (key) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const isAll = fy === 'all';
  const fyStart = isAll ? null : Number(fy);
  const from = isAll ? FIRST_DATA_MONTH : `${fyStart}-06-01`;
  const fyEnd = isAll ? currentMonth : `${fyStart + 1}-05-01`;
  const to = fyEnd < currentMonth ? fyEnd : currentMonth;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [biz, fin] = await Promise.all([
      supabase.rpc('corporate_business_metrics', { p_from: from, p_to: to }),
      supabase.rpc('corporate_finance_metrics', { p_from: from, p_to: to }),
    ]);
    const e = biz.error || fin.error;
    if (e) setError(e.message);
    setRows((biz.data || []).map(r => ({ ...r, sales: Number(r.sales) })));
    // bigint は文字列で返るので数値にそろえる（null は null のまま）
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    setFinRows((fin.data || []).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'month' ? v : num(v)]))));
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // 期の12か月を並べ、まだ来ていない月は空欄にする（全期間は記録のある月だけ）
  const chartData = useMemo(() => {
    const byMonth = new Map(rows.map(r => [r.month, r]));
    const startY = Number(from.slice(0, 4));
    const startM = Number(from.slice(5, 7)) - 1;
    const n = isAll ? rows.length : 12;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(startY, startM + i, 1));
      const month = d.toISOString().slice(0, 10);
      const r = byMonth.get(month);
      return {
        month,
        label: (isAll && (i === 0 || d.getUTCMonth() === 0)) ? `${d.getUTCFullYear() % 100}年${d.getUTCMonth() + 1}月` : `${d.getUTCMonth() + 1}月`,
        new_clients: r ? r.new_clients : null,
        active_clients: r ? r.active_clients : null,
        appo_count: r ? r.appo_count : null,
        sales: r ? r.sales : null,
      };
    });
  }, [rows, from, isAll]);

  // お金の表とグラフも、行動のグラフと同じ月の並びにそろえる
  const finChartData = useMemo(() => {
    const byMonth = new Map(finRows.map(r => [r.month, r]));
    return chartData.map(c => ({ ...(byMonth.get(c.month) || {}), month: c.month, label: c.label }))
      .filter(c => c.month <= currentMonth);
  }, [finRows, chartData, currentMonth]);
  const periodLabel = isAll ? '累計' : fyStart === currentFy ? '今期' : `第${termNo(fyStart)}期`;

  // カードの比較は締まった月どうし（途中の今月を前月の丸1か月と比べると必ず下がって見えるため）
  const closed = rows.filter(r => r.month < currentMonth);
  const latest = closed[closed.length - 1] || null;
  const prevRow = closed[closed.length - 2] || null;
  const latestLabel = latest ? `${Number(latest.month.slice(5, 7))}月` : '';
  const totals = useMemo(() => Object.fromEntries(
    METRICS.map(m => [m.key, rows.reduce((s, r) => s + Number(r[m.key] || 0), 0)])
  ), [rows]);

  const tableRows = useMemo(() => rows.map((r, i) => ({ ...r, _prev: rows[i - 1] || null })).reverse(), [rows]);

  const fyOptions = [{ value: 'all', label: '全期間（2026年3月〜）' }];
  for (let y = currentFy; y >= 2025; y--) {
    fyOptions.push({ value: String(y), label: `第${termNo(y)}期（${y}年6月〜${y + 1}年5月）` });
  }

  const right = (
    <div style={{ width: 240 }}>
      <Select size="sm" value={fy} onChange={e => setFy(e.target.value)} options={fyOptions} />
    </div>
  );

  const deltaCell = (r, key, fmt) => {
    const p = r._prev;
    if (!p || r.month === currentMonth) return fmt(r[key]);
    return (
      <span style={{ display: 'inline-flex', gap: space[2], alignItems: 'baseline' }}>
        {fmt(r[key])}<Delta cur={r[key]} prev={p[key]} />
      </span>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="業績"
        description={segment === 'company'
          ? '会社全体の収支（税理士の試算表）'
          : segment === 'sourcing' ? '営業代行の顧客・アポ・売上と収支' : 'スパキャリの売上と収支'}
        right={right}
      />

      <div style={{ display: 'flex', gap: space[2], paddingTop: space[4], flexWrap: 'wrap' }}>
        {[
          { value: 'company', label: '全社' },
          { value: 'sourcing', label: '営業代行' },
          { value: 'spacareer', label: 'スパキャリ' },
        ].map(t => (
          <Button key={t.value} size="sm" variant={segment === t.value ? 'primary' : 'outline'} onClick={() => setSegment(t.value)}>
            {t.label}
          </Button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], paddingTop: space[5] }}>
        {error && (
          <Card variant="flat"><span style={{ color: color.danger, fontSize: font.size.sm }}>読み込みエラー：{error}</span></Card>
        )}

        {segment === 'company' && (
          <CompanyFinance data={finChartData} isMobile={isMobile} currentKey={currentMonth} periodLabel={periodLabel} />
        )}
        {segment === 'spacareer' && (
          <SegmentFinance data={finChartData} segment="spacareer" isMobile={isMobile} currentKey={currentMonth} periodLabel={periodLabel} />
        )}
        {segment === 'sourcing' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: space[3] }}>
          {METRICS.map(m => (
            <MetricCard
              key={m.key} m={m} total={totals[m.key]} latestLabel={latestLabel}
              totalLabel={isAll ? '累計' : fyStart === currentFy ? '今期累計' : '期の合計'}
              latest={latest ? latest[m.key] : null} prev={prevRow ? prevRow[m.key] : null}
            />
          ))}
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: -space[3] }}>
          ▲▼は締まった月どうしの前月比。今月分はグラフと表に途中の数字で出る。
        </div>

        <Card
          title="顧客・アポ・売上の推移"
          description="棒は顧客（新規・支援した会社）、線は成果（取得アポ・売上）。凡例を押すとその指標を隠せる"
          action={(
            <div style={{ width: 210 }}>
              <Select size="sm" value={mode} onChange={e => setMode(e.target.value)} options={[
                { value: 'value', label: '実数で見る' },
                { value: 'shape', label: '形で比べる（最大=100）' },
              ]} />
            </div>
          )}
        >
          <CombinedChart
            data={chartData} currentKey={currentMonth} mode={mode}
            hidden={hidden} onToggle={toggle} height={isMobile ? 340 : 460}
          />
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
            {mode === 'shape'
              ? '各指標をその期間で最も大きい月=100にそろえた形。棒と線が同じ向きに動いていれば連動している。マウスを当てると実数が出る。'
              : '左の軸は社数と件数、右の軸は売上。薄い棒と点線は今月（途中）。'}
          </div>
        </Card>

        <Card title="月別" padding="none" headerStyle={CARD_HEAD}>
          <DataTable
            fillWidth
            height="auto"
            loading={loading}
            rows={tableRows}
            rowKey="month"
            emptyMessage="まだ数字がありません"
            columns={[
              { key: 'month', label: '月', width: 140, align: 'right', render: r => `${r.month.slice(0, 4)}/${r.month.slice(5, 7)}${r.month === currentMonth ? '（途中）' : ''}` },
              { key: 'new_clients', label: '新規顧客', width: 130, align: 'right', render: r => deltaCell(r, 'new_clients', cnt('社')) },
              { key: 'active_clients', label: '支援した会社', width: 130, align: 'right', render: r => deltaCell(r, 'active_clients', cnt('社')) },
              { key: 'appo_count', label: '取得アポ', width: 130, align: 'right', render: r => deltaCell(r, 'appo_count', cnt('件')) },
              { key: 'sales', label: '売上（税込）', width: 180, align: 'right', render: r => deltaCell(r, 'sales', yen) },
            ]}
          />
        </Card>

        <SegmentFinance data={finChartData} segment="sourcing" isMobile={isMobile} currentKey={currentMonth} periodLabel={periodLabel} />
        </>)}
      </div>
    </div>
  );
}
