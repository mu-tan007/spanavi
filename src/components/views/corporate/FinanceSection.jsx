import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend, ReferenceLine,
} from 'recharts';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Card, DataTable } from '../../ui';

// ============================================================
// 全社 > 業績 の「お金」の部分（全社・営業代行・スパキャリの収支）
//   数字は corporate_finance_metrics。全社は税理士の試算表、事業別の売上は自社集計、
//   事業別の外注費は税理士共有フォルダの請求書の合計（corporate_finance_monthly）。
// ============================================================

const yen = (v) => (v === null || v === undefined ? '—' : `¥${Number(v).toLocaleString()}`);
const yenAxis = (v) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 10_000).toLocaleString()}万` : String(v));
const pct = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : `${(v * 100).toFixed(0)}%`);

export const FINANCE_COLOR = {
  sales: color.navyLight,
  cost: alpha(color.gold, 0.85),
  sga: alpha(color.gold, 0.85),
  profit: color.success,
  sourcing: color.navy,
  spacareer: color.navyLight,
};

function FinanceTooltip({ active, payload, label, series, rawByLabel }) {
  if (!active || !payload?.length) return null;
  const raw = rawByLabel.get(label) || {};
  return (
    <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, boxShadow: shadow.md, padding: `${space[2]}px ${space[3]}px`, fontSize: font.size.xs }}>
      <div style={{ fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[1] }}>{label}</div>
      {series.map(s => (
        <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: space[4], color: color.textMid }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.label}</span>
          <span style={{ color: color.textDark, fontWeight: font.weight.semibold }}>{yen(raw[s.key])}</span>
        </div>
      ))}
    </div>
  );
}

// 棒（金額）と線（利益など）を1枚に重ねる。軸は円の1本。
export function FinanceChart({ data, series, height, currentKey }) {
  const rawByLabel = useMemo(() => new Map(data.map(d => [d.label, d])), [data]);
  const tick = { fontSize: 11, fill: color.textMid };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick} axisLine={{ stroke: color.border }} tickLine={false} interval={0} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={yenAxis} />
        <ReferenceLine y={0} stroke={color.border} />
        <Tooltip cursor={{ fill: alpha(color.navyLight, 0.06) }} content={<FinanceTooltip series={series} rawByLabel={rawByLabel} />} />
        <Legend wrapperStyle={{ fontSize: font.size.xs, paddingTop: space[2] }} />
        {series.filter(s => s.kind === 'bar').map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={s.stack}
            radius={s.stack ? undefined : [3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map(d => (
              <Cell key={d.month} fill={d.month === currentKey ? alpha(s.color, 0.4) : s.color} />
            ))}
          </Bar>
        ))}
        {series.filter(s => s.kind === 'line').map(s => (
          <Line key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={s.color} strokeWidth={2.5}
            dot={{ r: 3, fill: s.color }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`, borderTop: `3px solid ${accent}`,
      borderRadius: radius.lg, boxShadow: shadow.sm, padding: space[4],
      display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textDark, fontFamily: font.family.display }}>{value}</div>
      {sub && <div style={{ fontSize: font.size.xs, color: color.textMid }}>{sub}</div>}
    </div>
  );
}

const CARD_HEAD = { padding: `${space[4]}px ${space[5]}px ${space[3]}px` };
const sumOf = (rows, key) => rows.reduce((s, r) => s + (r[key] === null || r[key] === undefined ? 0 : Number(r[key])), 0);
const monthLabel = (m, currentKey) => `${m.slice(0, 4)}/${m.slice(5, 7)}${m === currentKey ? '（途中）' : ''}`;

// ---------- 全社（税理士の試算表） ----------
export function CompanyFinance({ data, isMobile, currentKey, periodLabel }) {
  const booked = data.filter(d => d.all_sales !== null && d.all_sales !== undefined);
  const last = booked[booked.length - 1];
  const chartData = data.map(d => ({
    ...d,
    all_cost: d.all_sga, // 販管費（外注費を含む）
  }));
  const series = [
    { key: 'all_sales', label: '売上（会計）', kind: 'bar', color: FINANCE_COLOR.sales },
    { key: 'all_cost', label: '販管費（外注費を含む）', kind: 'bar', color: FINANCE_COLOR.cost },
    { key: 'all_operating_profit', label: '営業利益', kind: 'line', color: FINANCE_COLOR.profit },
  ];
  const tableRows = [...data].reverse();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: space[3] }}>
        <StatCard label={`売上（会計・${periodLabel}）`} value={yen(sumOf(booked, 'all_sales'))} sub={last ? `試算表は${Number(last.month.slice(5, 7))}月分まで` : '試算表なし'} accent={FINANCE_COLOR.sales} />
        <StatCard label={`販管費（${periodLabel}）`} value={yen(sumOf(booked, 'all_sga'))} sub={`うち外注費 ${yen(sumOf(booked, 'all_outsourcing'))}`} accent={color.gold} />
        <StatCard label={`営業利益（${periodLabel}）`} value={yen(sumOf(booked, 'all_operating_profit'))}
          sub={`営業利益率 ${pct(sumOf(booked, 'all_operating_profit') / sumOf(booked, 'all_sales'))}`} accent={FINANCE_COLOR.profit} />
        <StatCard label={last ? `${Number(last.month.slice(5, 7))}月の営業利益` : '最新月の営業利益'} value={yen(last?.all_operating_profit)}
          sub={last ? `売上 ${yen(last.all_sales)}` : null} accent={FINANCE_COLOR.profit} />
      </div>
      <Card title="会社全体の収支" description="税理士の試算表（税込）。棒は売上と販管費、線は営業利益">
        <FinanceChart data={chartData} series={series} height={isMobile ? 320 : 420} currentKey={currentKey} />
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
          試算表は翌月末ごろに届く。帳簿の仕上げ前の月は、あとで数字が変わることがある。
        </div>
      </Card>
      <Card title="月別（全社）" padding="none" headerStyle={CARD_HEAD}>
        <DataTable
          fillWidth height="auto" rows={tableRows} rowKey="month" emptyMessage="まだ数字がありません"
          columns={[
            { key: 'month', label: '月', width: 120, align: 'right', render: r => monthLabel(r.month, currentKey) },
            { key: 'all_sales', label: '売上（会計）', width: 140, align: 'right', render: r => yen(r.all_sales) },
            { key: 'sourcing_sales', label: 'うち営業代行（自社集計）', width: 170, align: 'right', render: r => yen(r.sourcing_sales) },
            { key: 'spacareer_sales', label: 'うちスパキャリ（自社集計）', width: 170, align: 'right', render: r => yen(r.spacareer_sales) },
            { key: 'all_outsourcing', label: '外注費', width: 120, align: 'right', render: r => yen(r.all_outsourcing) },
            { key: 'all_sga', label: '販管費', width: 120, align: 'right', render: r => yen(r.all_sga) },
            { key: 'all_operating_profit', label: '営業利益', width: 130, align: 'right', render: r => yen(r.all_operating_profit) },
          ]}
        />
      </Card>
      <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: -space[3] }}>
        会計の売上は請求・入金で計上するため、自社集計の事業別売上（営業代行は面談日、スパキャリはStripeの入金日）と月がずれることがある。
      </div>
    </>
  );
}

// ---------- 事業別（営業代行・スパキャリ）の収支 ----------
export function SegmentFinance({ data, segment, isMobile, currentKey, periodLabel }) {
  const salesKey = `${segment}_sales`;
  const costKey = `${segment}_outsourcing`;
  const rows = data.map(d => ({
    ...d,
    _sales: d[salesKey],
    _cost: d[costKey],
    _profit: d[costKey] === null || d[costKey] === undefined ? null : Number(d[salesKey] || 0) - Number(d[costKey]),
  }));
  const settled = rows.filter(r => r._profit !== null);
  const sales = sumOf(settled, '_sales');
  const profit = sumOf(settled, '_profit');
  const salesNote = segment === 'sourcing' ? '面談日の月・税込' : 'Stripeの入金日の月・返金を引いた額';
  const series = [
    { key: '_sales', label: '売上', kind: 'bar', color: FINANCE_COLOR.sales },
    { key: '_cost', label: '外注費', kind: 'bar', color: FINANCE_COLOR.cost },
    { key: '_profit', label: '粗利（売上−外注費）', kind: 'line', color: FINANCE_COLOR.profit },
  ];
  const lastSettled = settled[settled.length - 1];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: space[3] }}>
        <StatCard label={`売上（${periodLabel}）`} value={yen(sumOf(rows, '_sales'))} sub={salesNote} accent={FINANCE_COLOR.sales} />
        <StatCard label="外注費（集計済みの月）" value={yen(sumOf(settled, '_cost'))}
          sub={lastSettled ? `${Number(settled[0].month.slice(5, 7))}〜${Number(lastSettled.month.slice(5, 7))}月分` : 'まだ集計なし'} accent={color.gold} />
        <StatCard label="粗利（集計済みの月）" value={yen(profit)} sub={`粗利率 ${pct(sales ? profit / sales : null)}`} accent={FINANCE_COLOR.profit} />
        <StatCard label={lastSettled ? `${Number(lastSettled.month.slice(5, 7))}月の粗利` : '最新月の粗利'} value={yen(lastSettled?._profit)}
          sub={lastSettled ? `粗利率 ${pct(lastSettled._sales ? lastSettled._profit / lastSettled._sales : null)}` : null} accent={FINANCE_COLOR.profit} />
      </div>
      <Card title={`${segment === 'sourcing' ? '営業代行' : 'スパキャリ'}の収支`}
        description="棒は売上と外注費、線は粗利。外注費は税理士共有フォルダの請求書の合計（税込）">
        <FinanceChart data={rows} series={series} height={isMobile ? 300 : 380} currentKey={currentKey} />
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: space[2] }}>
          外注費が未集計の月は粗利を出さない。給与・家賃などの共通の費用は全社にだけ入る。
        </div>
      </Card>
      <Card title="月別（収支）" padding="none" headerStyle={CARD_HEAD}>
        <DataTable
          fillWidth height="auto" rows={[...rows].reverse()} rowKey="month" emptyMessage="まだ数字がありません"
          columns={[
            { key: 'month', label: '月', width: 120, align: 'right', render: r => monthLabel(r.month, currentKey) },
            { key: '_sales', label: '売上', width: 150, align: 'right', render: r => yen(r._sales) },
            { key: '_cost', label: '外注費', width: 150, align: 'right', render: r => (r._cost === null || r._cost === undefined ? '未集計' : yen(r._cost)) },
            { key: '_profit', label: '粗利', width: 150, align: 'right', render: r => yen(r._profit) },
            { key: '_rate', label: '粗利率', width: 100, align: 'right', render: r => (r._profit === null ? '—' : pct(r._sales ? r._profit / r._sales : null)) },
          ]}
        />
      </Card>
    </>
  );
}
