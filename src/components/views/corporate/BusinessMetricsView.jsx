import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList,
} from 'recharts';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Card, DataTable, Select } from '../../ui';
import PageHeader from '../../common/PageHeader';
import { supabase } from '../../../lib/supabase';
import { useIsMobile } from '../../../hooks/useIsMobile';

// ============================================================
// 全社 > 業績（管理者のみ）
//   月ごとの新規顧客数・支援した会社数・取得アポ数・売上を棒グラフで並べる。
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

function MetricCard({ m, total, latest, prev, latestLabel }) {
  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`, borderTop: `3px solid ${m.accent}`,
      borderRadius: radius.lg, boxShadow: shadow.sm, padding: space[4],
      display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>
        {m.label}{m.sum ? '（今期累計）' : `（${latestLabel}）`}
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

function MonthlyBars({ data, m, currentKey }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: m.money ? 4 : -16 }}>
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={false} interval={0} />
        <YAxis
          tick={{ fontSize: 11, fill: color.textMid }} axisLine={false} tickLine={false}
          width={m.money ? 48 : 40} allowDecimals={false} tickFormatter={m.money ? yenAxis : undefined}
        />
        <Tooltip
          cursor={{ fill: alpha(color.navyLight, 0.06) }}
          formatter={(v) => [m.fmt(v), m.label]}
          contentStyle={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.xs }}
          labelStyle={{ color: color.textDark, fontWeight: font.weight.semibold }}
        />
        <Bar dataKey={m.key} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
          {data.map(d => (
            <Cell key={d.month} fill={d.month === currentKey ? alpha(m.accent, 0.45) : m.accent} />
          ))}
          <LabelList
            dataKey={m.key} position="top"
            formatter={(v) => (v === null || v === undefined ? '' : m.money ? yenAxis(v) : v)}
            style={{ fontSize: 10, fill: color.textMid }}
          />
        </Bar>
      </BarChart>
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fyStart = Number(fy);
  const from = `${fyStart}-06-01`;
  const fyEnd = `${fyStart + 1}-05-01`;
  const to = fyEnd < currentMonth ? fyEnd : currentMonth;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('corporate_business_metrics', { p_from: from, p_to: to });
    if (e) setError(e.message);
    setRows((data || []).map(r => ({ ...r, sales: Number(r.sales) })));
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // 期の12か月を並べ、まだ来ていない月は空欄にする
  const chartData = useMemo(() => {
    const byMonth = new Map(rows.map(r => [r.month, r]));
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(fyStart, 5 + i, 1));
      const month = d.toISOString().slice(0, 10);
      const r = byMonth.get(month);
      return {
        month,
        label: `${d.getUTCMonth() + 1}月`,
        new_clients: r ? r.new_clients : null,
        active_clients: r ? r.active_clients : null,
        appo_count: r ? r.appo_count : null,
        sales: r ? r.sales : null,
      };
    });
  }, [rows, fyStart]);

  // カードの比較は締まった月どうし（途中の今月を前月の丸1か月と比べると必ず下がって見えるため）
  const closed = rows.filter(r => r.month < currentMonth);
  const latest = closed[closed.length - 1] || null;
  const prevRow = closed[closed.length - 2] || null;
  const latestLabel = latest ? `${Number(latest.month.slice(5, 7))}月` : '';
  const totals = useMemo(() => Object.fromEntries(
    METRICS.map(m => [m.key, rows.reduce((s, r) => s + Number(r[m.key] || 0), 0)])
  ), [rows]);

  const tableRows = useMemo(() => rows.map((r, i) => ({ ...r, _prev: rows[i - 1] || null })).reverse(), [rows]);

  const fyOptions = [];
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
        description="月ごとの新規顧客・支援した会社・取得アポ・売上 ／ 薄い棒は今月（途中）"
        right={right}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], paddingTop: space[5] }}>
        {error && (
          <Card variant="flat"><span style={{ color: color.danger, fontSize: font.size.sm }}>読み込みエラー：{error}</span></Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: space[3] }}>
          {METRICS.map(m => (
            <MetricCard
              key={m.key} m={m} total={totals[m.key]} latestLabel={latestLabel}
              latest={latest ? latest[m.key] : null} prev={prevRow ? prevRow[m.key] : null}
            />
          ))}
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: -space[3] }}>
          ▲▼は締まった月どうしの前月比。今月分はグラフと表に途中の数字で出る。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: space[4] }}>
          {METRICS.map(m => (
            <Card key={m.key} title={`${m.label}の推移`} description={m.note}>
              <MonthlyBars data={chartData} m={m} currentKey={currentMonth} />
            </Card>
          ))}
        </div>

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
      </div>
    </div>
  );
}
