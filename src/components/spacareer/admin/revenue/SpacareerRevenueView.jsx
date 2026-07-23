import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { color, space, radius, font, shadow } from '../../../../constants/design';
import { Badge, DataTable, Button, Select, Card } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import SubTabs from '../_shared/SubTabs';
import SectionTitle from '../analytics/SectionTitle';
import TrendChart from '../analytics/TrendChart';
import PieBreakdownChart from '../analytics/PieBreakdownChart';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// スパキャリ 売上管理（Stripe 請求書/サブスク ミラー / admin限定）
//   - Stripe の「お客様の概要」風ダッシュボード
//   - 指標: 総売上高 / MRR / 失敗した決済 / 新規顧客 / 支出別の上位の顧客 / 有効なサブスク登録者
//   - 期間: プリセット / 月選択 / 任意範囲、前期間比較つき
//   - 中央タブ: ダッシュボード / 受講生別 / コース別 / 消込
// ============================================================

const STATUS_META = {
  draft:         { label: '下書き',   variant: 'neutral' },
  open:          { label: '未入金',   variant: 'warn' },
  paid:          { label: '入金済',   variant: 'success' },
  uncollectible: { label: '回収不能', variant: 'danger' },
  void:          { label: '無効',     variant: 'neutral' },
};

const yen = (n) => `¥${Number(n || 0).toLocaleString()}`;

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(v) {
  if (!v) return null;
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function toDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function inRange(v, start, end) {
  if (!v) return false;
  const t = new Date(v).getTime();
  return t >= start.getTime() && t < end.getTime();
}

// ── Stripe風の小さな部品 ──────────────────────────────
function Delta({ value }) {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span style={{ color: up ? color.success : color.danger, fontSize: font.size.xs, fontWeight: font.weight.semibold }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Sparkline({ data, stroke }) {
  if (!data || data.length < 2) return <div style={{ height: 40 }} />;
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <Line dataKey="v" stroke={stroke} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MetricCard({ label, value, delta, spark, sparkColor = color.navy, accent = color.navy, hint }) {
  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      padding: space[4],
      display: 'flex',
      flexDirection: 'column',
      gap: space[1],
      minWidth: 0,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textDark, fontFamily: font.family.display }}>
          {value}
        </div>
        <Delta value={delta} />
      </div>
      {hint && <div style={{ fontSize: font.size.xs, color: color.textLight }}>{hint}</div>}
      <div style={{ marginTop: 'auto', paddingTop: space[2] }}>
        <Sparkline data={spark} stroke={sparkColor} />
      </div>
    </div>
  );
}

export default function SpacareerRevenueView() {
  const [tab, setTab] = useState('dashboard');
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [subs, setSubs] = useState([]);
  const [customers, setCustomers] = useState([]); // { id, name, member_id }
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // 期間コントロール
  const [preset, setPreset] = useState('this_month'); // this_month/last_month/last3/last6/this_year/all/month/custom
  const [pickMonth, setPickMonth] = useState(''); // 'YYYY-MM'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, it, sb, cust] = await Promise.all([
      supabase.from('spacareer_invoices').select('*').order('stripe_created_at', { ascending: false }),
      supabase.from('spacareer_invoice_items').select('invoice_id, description, amount, product_name'),
      supabase.from('spacareer_subscriptions').select('*'),
      supabase.from('spacareer_customers').select('id, nickname, member_id, member:members(name)'),
    ]);
    setInvoices(inv.data || []);
    setItems(it.data || []);
    setSubs(sb.data || []);
    setCustomers((cust.data || []).map((c) => ({
      id: c.id,
      member_id: c.member_id,
      name: c.member?.name || c.nickname || '（名称未設定）',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const custName = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const active = useMemo(() => invoices.filter((i) => !i.excluded), [invoices]);

  // データの最古月〜今月（月選択用）
  const monthOptions = useMemo(() => {
    const now = new Date();
    let earliest = new Date(now.getFullYear(), now.getMonth(), 1);
    active.forEach((i) => {
      const d = i.stripe_created_at ? new Date(i.stripe_created_at) : null;
      if (d && d < earliest) earliest = new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const opts = [];
    const cur = new Date(now.getFullYear(), now.getMonth(), 1);
    const it = new Date(cur);
    while (it >= earliest) {
      opts.push({ value: `${it.getFullYear()}-${String(it.getMonth() + 1).padStart(2, '0')}`, label: `${it.getFullYear()}年${it.getMonth() + 1}月` });
      it.setMonth(it.getMonth() - 1);
    }
    return opts;
  }, [active]);

  // 期間の解決 [start, end) と前期間
  const rangeInfo = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start, end, label;
    switch (preset) {
      case 'this_month': start = new Date(y, m, 1); end = new Date(y, m + 1, 1); label = '今月'; break;
      case 'last_month': start = new Date(y, m - 1, 1); end = new Date(y, m, 1); label = '先月'; break;
      case 'last3': start = new Date(y, m - 2, 1); end = new Date(y, m + 1, 1); label = '過去3ヶ月'; break;
      case 'last6': start = new Date(y, m - 5, 1); end = new Date(y, m + 1, 1); label = '過去6ヶ月'; break;
      case 'this_year': start = new Date(y, 0, 1); end = new Date(y + 1, 0, 1); label = '今年'; break;
      case 'all': {
        let earliest = new Date(y, m, 1);
        active.forEach((i) => { const d = i.stripe_created_at ? new Date(i.stripe_created_at) : null; if (d && d < earliest) earliest = d; });
        start = new Date(earliest.getFullYear(), earliest.getMonth(), 1); end = new Date(y, m + 1, 1); label = '全期間'; break;
      }
      case 'month': {
        if (pickMonth) { const [yy, mm] = pickMonth.split('-').map(Number); start = new Date(yy, mm - 1, 1); end = new Date(yy, mm, 1); label = `${yy}年${mm}月`; }
        else { start = new Date(y, m, 1); end = new Date(y, m + 1, 1); label = '今月'; }
        break;
      }
      case 'custom': {
        start = customStart ? new Date(customStart + 'T00:00:00') : new Date(y, m, 1);
        end = customEnd ? new Date(new Date(customEnd + 'T00:00:00').getTime() + 86400000) : new Date(y, m + 1, 1);
        label = 'カスタム'; break;
      }
      default: start = new Date(y, m, 1); end = new Date(y, m + 1, 1); label = '今月';
    }
    const span = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - span);
    const prevEnd = new Date(start.getTime());
    return { start, end, prevStart, prevEnd, label, span };
  }, [preset, pickMonth, customStart, customEnd, active]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('stripe-spacareer-sync', { body: {} });
    setSyncing(false);
    if (error) { setMsg({ type: 'error', text: `同期に失敗しました: ${error.message}` }); return; }
    await load();
    setMsg({ type: 'ok', text: `Stripe と同期しました（請求書${data?.synced ?? 0}件 / サブスク${data?.syncedSubs ?? 0}件）` });
  }, [load]);

  const linkInvoice = useCallback(async (invId, customerId) => {
    if (!customerId) return;
    const c = customers.find((x) => x.id === customerId);
    const { error } = await supabase.from('spacareer_invoices')
      .update({ spacareer_customer_id: customerId, member_id: c?.member_id ?? null })
      .eq('id', invId);
    if (error) { setMsg({ type: 'error', text: `紐付けに失敗しました: ${error.message}` }); return; }
    await load();
  }, [customers, load]);

  const toggleExclude = useCallback(async (invId, val) => {
    const { error } = await supabase.from('spacareer_invoices').update({ excluded: val }).eq('id', invId);
    if (error) { setMsg({ type: 'error', text: `更新に失敗しました: ${error.message}` }); return; }
    await load();
  }, [load]);

  // ── 期間内の集計 ─────────────────────────────────────
  const metrics = useMemo(() => {
    const { start, end, prevStart, prevEnd, span } = rangeInfo;

    const sumPaid = (s, e) => active.reduce((a, i) => a + (i.paid_at && inRange(i.paid_at, s, e) ? Number(i.amount_paid || 0) : 0), 0);
    const grossVolume = sumPaid(start, end);
    const prevGross = sumPaid(prevStart, prevEnd);
    const grossDelta = prevGross > 0 ? ((grossVolume - prevGross) / prevGross) * 100 : null;

    // 純売上高（Stripe手数料控除後）。netが未取得の請求は入金額で代用
    const sumNet = (s, e) => active.reduce((a, i) => a + (i.paid_at && inRange(i.paid_at, s, e) ? Number(i.net ?? i.amount_paid ?? 0) : 0), 0);
    const netVolume = sumNet(start, end);
    const prevNet = sumNet(prevStart, prevEnd);
    const netDelta = prevNet > 0 ? ((netVolume - prevNet) / prevNet) * 100 : null;
    const feeTotal = grossVolume - netVolume;

    // 新規顧客: 顧客ごとの初回請求日が期間内
    const firstSeen = {};
    active.forEach((i) => {
      const key = i.stripe_customer_id || i.customer_email;
      if (!key || !i.stripe_created_at) return;
      const t = new Date(i.stripe_created_at).getTime();
      if (!firstSeen[key] || t < firstSeen[key]) firstSeen[key] = t;
    });
    const countNew = (s, e) => Object.values(firstSeen).filter((t) => t >= s.getTime() && t < e.getTime()).length;
    const newCustomers = countNew(start, end);
    const prevNew = countNew(prevStart, prevEnd);
    const newDelta = prevNew > 0 ? ((newCustomers - prevNew) / prevNew) * 100 : null;

    // 失敗した決済: 支払い試行があり未入金/回収不能（発行日が期間内）
    const failedList = active.filter((i) =>
      inRange(i.stripe_created_at, start, end) &&
      (Number(i.raw?.attempt_count || 0) >= 1) &&
      !['paid', 'draft', 'void'].includes(i.status),
    );
    const failedAmount = failedList.reduce((a, i) => a + Number(i.amount_remaining || i.total || 0), 0);

    // MRR / 有効サブスク（現時点スナップショット）
    const activeSubs = subs.filter((s) => ['active', 'trialing', 'past_due'].includes(s.status));
    const mrr = activeSubs.reduce((a, s) => a + Number(s.mrr || 0), 0);

    // 支出別の上位の顧客（期間内の入金額）
    const spendMap = {};
    active.forEach((i) => {
      if (!i.paid_at || !inRange(i.paid_at, start, end)) return;
      const key = i.spacareer_customer_id ? custName[i.spacareer_customer_id] : (i.customer_name || i.customer_email || '—');
      spendMap[key] = (spendMap[key] || 0) + Number(i.amount_paid || 0);
    });
    const topCustomers = Object.entries(spendMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 6);

    // トレンド（総売上高）: 62日以下は日次、それ以上は月次
    const daily = span <= 62 * 86400000;
    const buckets = [];
    const map = {};
    if (daily) {
      const d = new Date(start);
      while (d < end) {
        const key = toDateInput(d);
        map[key] = { label: `${d.getMonth() + 1}/${d.getDate()}`, 入金額: 0, 純額: 0 };
        buckets.push(key);
        d.setDate(d.getDate() + 1);
      }
      active.forEach((i) => { if (i.paid_at && inRange(i.paid_at, start, end)) { const k = toDateInput(new Date(i.paid_at)); if (map[k]) { map[k]['入金額'] += Number(i.amount_paid || 0); map[k]['純額'] += Number(i.net ?? i.amount_paid ?? 0); } } });
    } else {
      const d = new Date(start.getFullYear(), start.getMonth(), 1);
      while (d < end) {
        const key = monthKey(d);
        map[key] = { label: `${d.getMonth() + 1}月`, 入金額: 0, 純額: 0 };
        buckets.push(key);
        d.setMonth(d.getMonth() + 1);
      }
      active.forEach((i) => { if (i.paid_at && inRange(i.paid_at, start, end)) { const k = monthKey(i.paid_at); if (map[k]) { map[k]['入金額'] += Number(i.amount_paid || 0); map[k]['純額'] += Number(i.net ?? i.amount_paid ?? 0); } } });
    }
    const trend = buckets.map((k) => map[k]);
    const spark = trend.map((t) => t['入金額']);
    const netSpark = trend.map((t) => t['純額']);

    return {
      grossVolume, grossDelta, netVolume, netDelta, feeTotal,
      newCustomers, newDelta,
      failedAmount, failedCount: failedList.length,
      mrr, activeSubscribers: activeSubs.length,
      topCustomers, trend, spark, netSpark,
    };
  }, [active, subs, custName, rangeInfo]);

  // ── 受講生別 / コース別 / 消込（全期間ベース）─────────
  const byCustomer = useMemo(() => {
    const m = {};
    active.forEach((i) => {
      if (!i.spacareer_customer_id) return;
      const id = i.spacareer_customer_id;
      if (!m[id]) m[id] = { id, name: custName[id] || '—', paid: 0, outstanding: 0, count: 0, lastPaidAt: null };
      m[id].count += 1;
      m[id].paid += Number(i.amount_paid || 0);
      if (i.status === 'open') m[id].outstanding += Number(i.amount_remaining || 0);
      if (i.paid_at && (!m[id].lastPaidAt || new Date(i.paid_at) > new Date(m[id].lastPaidAt))) m[id].lastPaidAt = i.paid_at;
    });
    return Object.values(m).sort((a, b) => b.paid - a.paid);
  }, [active, custName]);

  const byCourse = useMemo(() => {
    const paidIds = new Set(active.filter((i) => i.paid_at).map((i) => i.id));
    const m = {};
    items.forEach((it) => {
      if (!paidIds.has(it.invoice_id)) return;
      const key = it.description || it.product_name || '（項目名なし）';
      m[key] = (m[key] || 0) + Number(it.amount || 0);
    });
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [active, items]);

  const reconcileRows = useMemo(
    () => invoices.filter((i) => (showExcluded ? true : (!i.spacareer_customer_id && !i.excluded))),
    [invoices, showExcluded],
  );

  const customerOptions = useMemo(
    () => [{ value: '', label: '受講生を選択…' }, ...customers.map((c) => ({ value: c.id, label: c.name }))],
    [customers],
  );

  const unlinkedCount = useMemo(
    () => invoices.filter((i) => !i.spacareer_customer_id && !i.excluded).length,
    [invoices],
  );

  // ── テーブル定義 ─────────────────────────────────────
  const customerColumns = [
    { key: 'name', label: '受講生', width: 180, align: 'left' },
    { key: 'paid', label: '入金済', width: 130, align: 'right', render: (r) => yen(r.paid) },
    { key: 'outstanding', label: '未入金', width: 130, align: 'right',
      render: (r) => r.outstanding > 0 ? <span style={{ color: color.warn, fontWeight: font.weight.semibold }}>{yen(r.outstanding)}</span> : yen(0) },
    { key: 'count', label: '請求件数', width: 90, align: 'right', render: (r) => `${r.count}件` },
    { key: 'lastPaidAt', label: '最終入金日', width: 120, align: 'right', render: (r) => fmtDate(r.lastPaidAt) },
  ];
  const courseColumns = [
    { key: 'label', label: '項目 / コース', width: 320, align: 'left' },
    { key: 'value', label: '売上（入金済）', width: 160, align: 'right', render: (r) => yen(r.value) },
  ];
  const reconcileColumns = [
    { key: 'stripe_created_at', label: '発行日', width: 100, align: 'right', render: (r) => fmtDate(r.stripe_created_at) },
    { key: 'customer_email', label: 'Stripe顧客', width: 200, align: 'left',
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{r.customer_name || '—'}</span>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{r.customer_email || '—'}</span>
        </div>
      ) },
    { key: 'total', label: '金額', width: 100, align: 'right', render: (r) => yen(r.total) },
    { key: 'status', label: 'ステータス', width: 90, align: 'center',
      render: (r) => { const s = STATUS_META[r.status] || { label: r.status || '—', variant: 'neutral' }; return <Badge variant={s.variant} dot>{s.label}</Badge>; } },
    { key: 'assign', label: '受講生に紐付け', width: 200, align: 'left',
      render: (r) => r.excluded ? <Badge variant="neutral">対象外</Badge> : (
        <Select options={customerOptions} value={r.spacareer_customer_id || ''} onChange={(e) => linkInvoice(r.id, e.target.value)} />
      ) },
    { key: 'exclude', label: '操作', width: 110, align: 'center',
      render: (r) => r.excluded
        ? <Button variant="ghost" size="sm" onClick={() => toggleExclude(r.id, false)}>戻す</Button>
        : <Button variant="outline" size="sm" onClick={() => toggleExclude(r.id, true)}>対象外</Button> },
  ];

  const tabs = [
    { key: 'dashboard', label: 'ダッシュボード' },
    { key: 'customers', label: '受講生別' },
    { key: 'courses', label: 'コース別' },
    { key: 'reconcile', label: '消込', badge: unlinkedCount || undefined },
  ];

  const presetOptions = [
    { value: 'this_month', label: '今月' },
    { value: 'last_month', label: '先月' },
    { value: 'last3', label: '過去3ヶ月' },
    { value: 'last6', label: '過去6ヶ月' },
    { value: 'this_year', label: '今年' },
    { value: 'all', label: '全期間' },
    { value: 'month', label: '月を選択' },
    { value: 'custom', label: 'カスタム期間' },
  ];

  return (
    <div>
      <PageHeader
        title="売上管理"
        description="Stripe で発行した請求書・サブスクの入金/売上を管理します（入金日ベース）"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            {msg && <span style={{ fontSize: font.size.xs, color: msg.type === 'error' ? color.danger : color.success }}>{msg.text}</span>}
            <Button variant="secondary" size="md" loading={syncing} onClick={handleSync}>今すぐ同期</Button>
          </div>
        }
      />

      <div style={{ padding: `${space[4]}px 0` }}>
        <SubTabs tabs={tabs} activeKey={tab} onChange={setTab} />

        {/* ── ダッシュボード ── */}
        {tab === 'dashboard' && (
          <>
            {/* 期間コントロール */}
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
              <div style={{ fontSize: font.size.sm, color: color.textMid, fontWeight: font.weight.semibold }}>期間</div>
              <div style={{ width: 128 }}>
                <Select size="sm" options={presetOptions} value={preset} onChange={(e) => setPreset(e.target.value)} />
              </div>
              {preset === 'month' && (
                <div style={{ width: 132 }}>
                  <Select
                    size="sm"
                    options={monthOptions.length ? monthOptions : [{ value: '', label: '—' }]}
                    value={pickMonth || (monthOptions[0]?.value ?? '')}
                    onChange={(e) => setPickMonth(e.target.value)}
                  />
                </div>
              )}
              {preset === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    style={{ padding: '7px 10px', border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, color: color.textDark, fontFamily: font.family.sans }} />
                  <span style={{ color: color.textLight }}>〜</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    style={{ padding: '7px 10px', border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, color: color.textDark, fontFamily: font.family.sans }} />
                </div>
              )}
              <div style={{ fontSize: font.size.xs, color: color.textLight }}>
                {fmtDate(rangeInfo.start)} 〜 {fmtDate(new Date(rangeInfo.end.getTime() - 86400000))}（前期間比）
              </div>
            </div>

            {/* 指標カード */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: space[3] }}>
              <MetricCard label="総売上高" value={yen(metrics.grossVolume)} delta={metrics.grossDelta}
                spark={metrics.spark} sparkColor={color.navy} accent={color.navy} />
              <MetricCard label="純売上高（手数料控除後）" value={yen(metrics.netVolume)} delta={metrics.netDelta}
                spark={metrics.netSpark} sparkColor={color.navyDark} accent={color.navyDark}
                hint={`Stripe手数料 ${yen(metrics.feeTotal)} を控除`} />
              <MetricCard label="MRR（月次経常収益）" value={yen(metrics.mrr)} accent={color.navyLight} sparkColor={color.navyLight}
                hint="有効サブスクの月次換算・現時点" />
              <MetricCard label="新規顧客" value={`${metrics.newCustomers}名`} delta={metrics.newDelta}
                accent={color.info} sparkColor={color.info} hint="期間内に初回請求が発生した顧客" />
              <MetricCard label="失敗した決済" value={yen(metrics.failedAmount)} accent={color.danger} sparkColor={color.danger}
                hint={`${metrics.failedCount}件（支払い失敗・未回収）`} />
              <MetricCard label="有効なサブスクリプション登録者" value={`${metrics.activeSubscribers}名`} accent={color.success} sparkColor={color.success}
                hint="active / trialing / past_due" />
            </div>

            {/* 総売上高 推移 + 上位顧客 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: space[3], marginTop: space[4] }}>
              <Card padding="md" title="総売上高の推移" description={rangeInfo.label}>
                <TrendChart data={metrics.trend} series={[{ key: '入金額', label: '入金額', color: color.navy }]} height={260} />
              </Card>
              <Card padding="md" title="支出別の上位の顧客" description="期間内の入金額">
                {metrics.topCustomers.length === 0 ? (
                  <div style={{ padding: space[4], color: color.textLight, fontSize: font.size.sm, textAlign: 'center' }}>データなし</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {metrics.topCustomers.map((c, idx) => (
                      <div key={c.name} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: `${space[2] + 2}px 0`,
                        borderBottom: idx < metrics.topCustomers.length - 1 ? `1px solid ${color.borderLight}` : 'none',
                      }}>
                        <span style={{ fontSize: font.size.sm, color: color.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, fontFamily: font.family.mono }}>{yen(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {/* ── 受講生別 ── */}
        {tab === 'customers' && (
          <>
            <SectionTitle label="受講生別 入金状況" hint={`${byCustomer.length}名`} />
            <DataTable columns={customerColumns} rows={byCustomer} rowKey="id" loading={loading} fillWidth
              emptyMessage="紐付いた受講生がいません" rowAccent={(r) => (r.outstanding > 0 ? 'warn' : null)} height="calc(100vh - 320px)" />
          </>
        )}

        {/* ── コース別 ── */}
        {tab === 'courses' && (
          <>
            <SectionTitle label="項目 / コース別 売上内訳" hint="入金済請求の明細を集計" />
            <Card padding="md"><PieBreakdownChart data={byCourse} height={280} /></Card>
            <SectionTitle label="内訳一覧" hint={`${byCourse.length}項目`} />
            <DataTable columns={courseColumns} rows={byCourse} rowKey="label" loading={loading} fillWidth
              emptyMessage="入金済の明細がありません" height="calc(100vh - 500px)" />
          </>
        )}

        {/* ── 消込 ── */}
        {tab === 'reconcile' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
              <SectionTitle label="消込・突合" hint="メールで自動紐付けできなかった請求書を受講生に割当、他事業の請求は対象外に" />
              <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.textMid, cursor: 'pointer' }}>
                <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
                対象外も表示
              </label>
            </div>
            <DataTable columns={reconcileColumns} rows={reconcileRows} rowKey="id" loading={loading}
              emptyMessage="未紐付けの請求書はありません（すべて突合済み）" height="calc(100vh - 320px)" />
          </>
        )}
      </div>
    </div>
  );
}
