import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { color, space, font } from '../../../../constants/design';
import { Badge, DataTable, Button, Select, Card } from '../../../ui';
import PageHeader from '../../../common/PageHeader';
import KpiCard from '../_shared/KpiCard';
import SubTabs from '../_shared/SubTabs';
import SectionTitle from '../analytics/SectionTitle';
import TrendChart from '../analytics/TrendChart';
import PieBreakdownChart from '../analytics/PieBreakdownChart';
import { supabase } from '../../../../lib/supabase';

// ============================================================
// スパキャリ 売上管理（Stripe 請求書ミラー / admin限定）
//   - Stripe で「手動発行」した請求書を stripe-spacareer-webhook / sync で
//     spacareer_invoices に取り込み、ここで可視化する。
//   - 売上は「入金日(paid_at)」ベースで月次集計。
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

export default function SpacareerRevenueView() {
  const [tab, setTab] = useState('dashboard');
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]); // { id, name, member_id }
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, it, cust] = await Promise.all([
      supabase.from('spacareer_invoices').select('*').order('stripe_created_at', { ascending: false }),
      supabase.from('spacareer_invoice_items').select('invoice_id, description, amount, product_name'),
      supabase.from('spacareer_customers').select('id, nickname, member_id, member:members(name)'),
    ]);
    setInvoices(inv.data || []);
    setItems(it.data || []);
    setCustomers((cust.data || []).map((c) => ({
      id: c.id,
      member_id: c.member_id,
      name: c.member?.name || c.nickname || '（名称未設定）',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const custName = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c.name])),
    [customers],
  );

  // 集計対象（対象外は除外）
  const active = useMemo(() => invoices.filter((i) => !i.excluded), [invoices]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('stripe-spacareer-sync', { body: {} });
    setSyncing(false);
    if (error) { setMsg({ type: 'error', text: `同期に失敗しました: ${error.message}` }); return; }
    await load();
    setMsg({ type: 'ok', text: `Stripe と同期しました（${data?.synced ?? 0}件）` });
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

  // ── KPI ─────────────────────────────────────────────
  const kpi = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let paidThisMonth = 0, paidTotal = 0, outstanding = 0;
    const linkedCustomers = new Set();
    let unlinked = 0;
    active.forEach((i) => {
      const paid = Number(i.amount_paid || 0);
      if (i.paid_at) {
        paidTotal += paid;
        if (monthKey(i.paid_at) === thisMonth) paidThisMonth += paid;
      }
      if (i.status === 'open') outstanding += Number(i.amount_remaining || 0);
      if (i.spacareer_customer_id) linkedCustomers.add(i.spacareer_customer_id);
      else unlinked += 1;
    });
    return { paidThisMonth, paidTotal, outstanding, students: linkedCustomers.size, unlinked };
  }, [active]);

  // ── 月次推移（直近12ヶ月・入金ベース）─────────────────
  const monthlySeries = useMemo(() => {
    const now = new Date();
    const buckets = [];
    const map = {};
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getMonth() + 1}月`;
      map[key] = { label, 入金額: 0 };
      buckets.push(key);
    }
    active.forEach((i) => {
      if (!i.paid_at) return;
      const key = monthKey(i.paid_at);
      if (map[key]) map[key]['入金額'] += Number(i.amount_paid || 0);
    });
    return buckets.map((k) => map[k]);
  }, [active]);

  // ── 受講生別 ─────────────────────────────────────────
  const byCustomer = useMemo(() => {
    const m = {};
    active.forEach((i) => {
      if (!i.spacareer_customer_id) return;
      const id = i.spacareer_customer_id;
      if (!m[id]) m[id] = { id, name: custName[id] || '—', paid: 0, outstanding: 0, count: 0, lastPaidAt: null };
      m[id].count += 1;
      m[id].paid += Number(i.amount_paid || 0);
      if (i.status === 'open') m[id].outstanding += Number(i.amount_remaining || 0);
      if (i.paid_at && (!m[id].lastPaidAt || new Date(i.paid_at) > new Date(m[id].lastPaidAt))) {
        m[id].lastPaidAt = i.paid_at;
      }
    });
    return Object.values(m).sort((a, b) => b.paid - a.paid);
  }, [active, custName]);

  // ── コース別（明細 description 集計・入金済請求のみ）──────
  const byCourse = useMemo(() => {
    const paidIds = new Set(active.filter((i) => i.paid_at).map((i) => i.id));
    const m = {};
    items.forEach((it) => {
      if (!paidIds.has(it.invoice_id)) return;
      const key = it.description || it.product_name || '（項目名なし）';
      m[key] = (m[key] || 0) + Number(it.amount || 0);
    });
    return Object.entries(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [active, items]);

  // ── 消込（未紐付け）─────────────────────────────────
  const reconcileRows = useMemo(() => {
    return invoices.filter((i) => showExcluded ? true : (!i.spacareer_customer_id && !i.excluded));
  }, [invoices, showExcluded]);

  const customerOptions = useMemo(
    () => [{ value: '', label: '受講生を選択…' }, ...customers.map((c) => ({ value: c.id, label: c.name }))],
    [customers],
  );

  // ── テーブル定義 ─────────────────────────────────────
  const invoiceListColumns = [
    { key: 'stripe_created_at', label: '発行日', width: 110, align: 'right',
      render: (r) => fmtDate(r.stripe_created_at) },
    { key: 'customer', label: '受講生', width: 150, align: 'left',
      render: (r) => r.spacareer_customer_id ? custName[r.spacareer_customer_id] : (r.customer_name || r.customer_email || '—') },
    { key: 'number', label: '請求書番号', width: 130, align: 'left',
      cellStyle: { fontFamily: font.family.mono } },
    { key: 'total', label: '金額', width: 110, align: 'right', render: (r) => yen(r.total) },
    { key: 'status', label: 'ステータス', width: 100, align: 'center',
      render: (r) => {
        const s = STATUS_META[r.status] || { label: r.status || '—', variant: 'neutral' };
        return <Badge variant={s.variant} dot>{s.label}</Badge>;
      } },
    { key: 'paid_at', label: '入金日', width: 110, align: 'right', render: (r) => fmtDate(r.paid_at) },
    { key: 'link', label: '請求書', width: 80, align: 'center',
      render: (r) => r.hosted_invoice_url
        ? <a href={r.hosted_invoice_url} target="_blank" rel="noreferrer" style={{ color: color.navyLight, fontSize: font.size.xs }}>開く</a>
        : '—' },
  ];

  const customerColumns = [
    { key: 'name', label: '受講生', width: 180, align: 'left' },
    { key: 'paid', label: '入金済', width: 130, align: 'right', render: (r) => yen(r.paid) },
    { key: 'outstanding', label: '未入金', width: 130, align: 'right',
      render: (r) => r.outstanding > 0
        ? <span style={{ color: color.warn, fontWeight: font.weight.semibold }}>{yen(r.outstanding)}</span>
        : yen(0) },
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
      render: (r) => {
        const s = STATUS_META[r.status] || { label: r.status || '—', variant: 'neutral' };
        return <Badge variant={s.variant} dot>{s.label}</Badge>;
      } },
    { key: 'assign', label: '受講生に紐付け', width: 200, align: 'left',
      render: (r) => r.excluded
        ? <Badge variant="neutral">対象外</Badge>
        : (
          <Select
            options={customerOptions}
            value={r.spacareer_customer_id || ''}
            onChange={(e) => linkInvoice(r.id, e.target.value)}
          />
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
    { key: 'reconcile', label: '消込', badge: kpi.unlinked || undefined },
  ];

  return (
    <div>
      <PageHeader
        title="売上管理"
        description="Stripe で発行した請求書の入金・売上を管理します（入金日ベース）"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
            {msg && (
              <span style={{
                fontSize: font.size.xs,
                color: msg.type === 'error' ? color.danger : color.success,
              }}>{msg.text}</span>
            )}
            <Button variant="secondary" size="md" loading={syncing} onClick={handleSync}>
              今すぐ同期
            </Button>
          </div>
        }
      />

      <div style={{ padding: `${space[4]}px 0` }}>
        <SubTabs tabs={tabs} activeKey={tab} onChange={setTab} />

        {/* ── ダッシュボード ── */}
        {tab === 'dashboard' && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: space[3],
            }}>
              <KpiCard label="今月の入金額" value={kpi.paidThisMonth} unit="円" tone="navy" accentTop loading={loading} />
              <KpiCard label="累計入金額" value={kpi.paidTotal} unit="円" tone="success" loading={loading} />
              <KpiCard label="未入金額" value={kpi.outstanding} unit="円" tone="warn" loading={loading} />
              <KpiCard label="請求対象の受講生" value={kpi.students} unit="名" tone="info" loading={loading} />
              <KpiCard label="未紐付けの請求書" value={kpi.unlinked} unit="件" tone={kpi.unlinked ? 'danger' : 'navy'} loading={loading} />
            </div>

            <SectionTitle label="月次入金推移" hint="直近12ヶ月・入金日ベース" />
            <Card padding="md">
              <TrendChart
                data={monthlySeries}
                series={[{ key: '入金額', label: '入金額', color: color.navy }]}
                height={240}
              />
            </Card>

            <SectionTitle label="請求書一覧" hint={`${active.length}件`} />
            <DataTable
              columns={invoiceListColumns}
              rows={active}
              rowKey="id"
              loading={loading}
              emptyMessage="請求書がありません。右上の「今すぐ同期」で Stripe から取り込めます。"
              height="calc(100vh - 460px)"
            />
          </>
        )}

        {/* ── 受講生別 ── */}
        {tab === 'customers' && (
          <>
            <SectionTitle label="受講生別 入金状況" hint={`${byCustomer.length}名`} />
            <DataTable
              columns={customerColumns}
              rows={byCustomer}
              rowKey="id"
              loading={loading}
              fillWidth
              emptyMessage="紐付いた受講生がいません"
              rowAccent={(r) => (r.outstanding > 0 ? 'warn' : null)}
              height="calc(100vh - 320px)"
            />
          </>
        )}

        {/* ── コース別 ── */}
        {tab === 'courses' && (
          <>
            <SectionTitle label="項目 / コース別 売上内訳" hint="入金済請求の明細を集計" />
            <Card padding="md">
              <PieBreakdownChart data={byCourse} height={280} />
            </Card>
            <SectionTitle label="内訳一覧" hint={`${byCourse.length}項目`} />
            <DataTable
              columns={courseColumns}
              rows={byCourse}
              rowKey="label"
              loading={loading}
              fillWidth
              emptyMessage="入金済の明細がありません"
              height="calc(100vh - 500px)"
            />
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
            <DataTable
              columns={reconcileColumns}
              rows={reconcileRows}
              rowKey="id"
              loading={loading}
              emptyMessage="未紐付けの請求書はありません（すべて突合済み）"
              height="calc(100vh - 320px)"
            />
          </>
        )}
      </div>
    </div>
  );
}
