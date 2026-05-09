import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag, DataTable } from '../ui';
import { calcRankAndRate } from '../../utils/calculations';
import { supabase } from '../../lib/supabase';
import { updateMemberReward, updateAppoCounted, fetchPayrollSnapshots, upsertPayrollSnapshots, deletePayrollSnapshots, fetchOrgSettings, fetchPayrollAdjustment, upsertPayrollAdjustment } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
// 旧 useColumnConfig / ColumnResizeHandle は DataTable 移行で不要に
import PageHeader from '../common/PageHeader';

const PAYROLL_DATA = [];

// 報酬計算に含めるステータス（アポ取得・事前確認済・面談済）
const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);

// ── Design tokens ──────────────────────────────────────────────────────────
const TH_BG   = '#0D2247';          // テーブルヘッダー背景
const GRAY_200 = '#E5E7EB';         // ボーダー
const GRAY_50  = '#F8F9FA';         // 偶数行背景
const MONO     = "'JetBrains Mono'";

// ランクカラー（左ボーダー方式 / テキスト色）
const RANK_COLORS = {
  'スーパースパルタン': { color: '#b7791f' },
  'スパルタン':         { color: C.green },
  'プレイヤー':          { color: C.navyLight },
  'トレーニー':          { color: C.textLight },
};

const PAYROLL_COLS = [
  { key: 'name', width: 180, align: 'left' },
  { key: 'team', width: 80, align: 'left' },
  { key: 'rank', width: 120, align: 'left' },
  { key: 'rate', width: 70, align: 'right' },
  { key: 'sales', width: 110, align: 'right' },
  { key: 'incentive', width: 120, align: 'right' },
  { key: 'roleBonus', width: 110, align: 'right' },
  { key: 'referral', width: 80, align: 'right' },
  { key: 'total', width: 120, align: 'right' },
];

export default function PayrollView({ members, appoData, isAdmin, setMembers, onDataRefetch, currentUser = '' }) {
  const payrollMonths = (() => {
    const now = new Date();
    const result = [];
    let y = 2026, m = 3;
    const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    while (new Date(y, m - 1, 1) <= endD) {
      result.push({ label: m + "月", year: y, month: m });
      if (++m > 12) { m = 1; y++; }
    }
    return result;
  })();
  const [monthTab, setMonthTab] = useState(() => {
    const s = localStorage.getItem('spanavi_payroll_month');
    return (s && payrollMonths.some(x => x.label === s)) ? s : (payrollMonths[payrollMonths.length - 1]?.label || "3月");
  });
  useEffect(() => { localStorage.setItem('spanavi_payroll_month', monthTab); }, [monthTab]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [sortKey, setSortKey] = useState("total");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [orgSettings, setOrgSettings] = useState({});

  useEffect(() => {
    fetchOrgSettings().then(({ data }) => setOrgSettings(data || {}));
  }, []);

  // ── Phase 5: 各メンバーの Sourcing 事業内役割を fetch ────────────
  // member_engagements.role_id → engagement_roles.name の map を作る
  // Key: member_id (uuid), Value: 'リーダー' / '副リーダー' / 'メンバー'
  const [memberRoleMap, setMemberRoleMap] = useState({});
  useEffect(() => {
    (async () => {
      const orgId = getOrgId();
      if (!orgId) return;
      const { data: eng } = await supabase
        .from('engagements')
        .select('id')
        .eq('org_id', orgId)
        .eq('slug', 'seller_sourcing')
        .maybeSingle();
      if (!eng) return;
      const { data: meRows } = await supabase
        .from('member_engagements')
        .select('member_id, role:engagement_roles(name)')
        .eq('engagement_id', eng.id)
        .eq('org_id', orgId)
        .not('role_id', 'is', null);
      const map = {};
      (meRows || []).forEach(r => {
        if (r.role?.name) map[r.member_id] = r.role.name;
      });
      setMemberRoleMap(map);
    })();
  }, []);

  // ── スナップショット（報酬確定）────────────────────────────────────
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unconfirming, setUnconfirming] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // 選択月の YYYY-MM 文字列
  const payMonth = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    return `${sel.year}-${String(sel.month).padStart(2, '0')}`;
  }, [monthTab]);

  // 調整（ディスカウント）
  const [adjustment, setAdjustment] = useState({ sales_discount: 0, incentive_discount: 0, note: '' });
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjForm, setAdjForm] = useState({ sales: '', incentive: '', note: '' });
  const [adjSaving, setAdjSaving] = useState(false);

  // monthTab 変更時にスナップショット＆調整を取得
  useEffect(() => {
    setSnapshotLoading(true);
    Promise.all([
      fetchPayrollSnapshots(payMonth),
      fetchPayrollAdjustment(payMonth),
    ]).then(([snapRes, adjRes]) => {
      setSnapshots(snapRes.data || []);
      const adj = adjRes.data || { sales_discount: 0, incentive_discount: 0, note: '' };
      setAdjustment(adj);
      setAdjForm({ sales: adj.sales_discount || '', incentive: adj.incentive_discount || '', note: adj.note || '' });
      setSnapshotLoading(false);
    });
  }, [payMonth]);

  const handleSaveAdjustment = async () => {
    setAdjSaving(true);
    const { error } = await upsertPayrollAdjustment({
      payMonth,
      salesDiscount: parseInt(adjForm.sales) || 0,
      incentiveDiscount: parseInt(adjForm.incentive) || 0,
      note: adjForm.note,
    });
    if (!error) {
      setAdjustment({ sales_discount: parseInt(adjForm.sales) || 0, incentive_discount: parseInt(adjForm.incentive) || 0, note: adjForm.note });
      setShowAdjustForm(false);
    }
    setAdjSaving(false);
  };

  const isConfirmed = snapshots.length > 0;
  const confirmedAt = isConfirmed
    ? new Date(snapshots[0].confirmed_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  // リファラル採用インセンティブ計算
  const referralMap = React.useMemo(() => {
    const map = {};
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    const monthStart = new Date(sel.year, sel.month - 1, 1);
    const monthEnd = new Date(sel.year, sel.month, 0);
    members.forEach(m => {
      if (typeof m !== 'object' || !m.referrerName || !m.operationStartDate) return;
      const opDate = new Date(m.operationStartDate);
      const deadline = new Date(opDate);
      deadline.setDate(deadline.getDate() + 30);
      const salesWithin30Days = appoData
        .filter(a =>
          a.getter === m.name &&
          PAYROLL_COUNTABLE.has(a.status) &&
          a.meetDate && new Date(a.meetDate) >= opDate && new Date(a.meetDate) <= deadline
        )
        .reduce((sum, a) => sum + (a.sales || 0), 0);
      if (salesWithin30Days >= 100000 && opDate <= monthEnd && deadline >= monthStart) {
        map[m.referrerName] = (map[m.referrerName] || 0) + 50000;
      }
    });
    return map;
  }, [members, appoData, monthTab]);

  // 月次報酬計算
  const calcData = React.useMemo(() => {
    const yyyymm = payMonth;
    const monthAppos = (appoData || []).filter(a => {
      const dateKey = (a.meetDate || a.getDate || '').slice(0, 7);
      return dateKey === yyyymm && PAYROLL_COUNTABLE.has(a.status);
    });
    const memberMap = {};
    members.forEach(m => { if (typeof m === 'object' && m.name) memberMap[m.name] = m; });
    // Phase 5: 役割は member_engagements.role_id 経由で判定（members.position は使わない）
    const getRole = (mem) => (mem && mem.id) ? (memberRoleMap[mem.id] || '') : '';
    const teamSales = {};
    const byGetter = {};
    monthAppos.forEach(a => {
      const mem = memberMap[a.getter] || {};
      const { rank, rate } = calcRankAndRate(mem.totalSales || 0, orgSettings);
      const team = mem.team || '';
      if (!byGetter[a.getter]) {
        byGetter[a.getter] = {
          name: a.getter, team, rank, rate,
          role: getRole(mem),
          totalSales: mem.totalSales || 0,
          sales: 0, incentive: 0, teamBonus: 0, total: 0,
        };
      }
      byGetter[a.getter].sales += a.sales || 0;
      byGetter[a.getter].incentive += a.reward || 0;
      teamSales[team] = (teamSales[team] || 0) + (a.sales || 0);
    });
    members.forEach(m => {
      if (typeof m !== 'object' || !m.name) return;
      const role = getRole(m);
      if (!['リーダー', '副リーダー'].includes(role)) return;
      if (byGetter[m.name]) return;
      const { rank, rate } = calcRankAndRate(m.totalSales || 0, orgSettings);
      byGetter[m.name] = {
        name: m.name, team: m.team || '', rank, rate,
        role, totalSales: m.totalSales || 0,
        sales: 0, incentive: 0, teamBonus: 0, total: 0,
      };
    });
    // リーダーボーナス段階料率（org_settingsから取得、なければデフォルト）
    let leaderTiers = [
      { threshold: 0, rate: 0.5 }, { threshold: 1000000, rate: 1.0 }, { threshold: 2000000, rate: 1.5 },
      { threshold: 3000000, rate: 2.0 }, { threshold: 4000000, rate: 2.5 }, { threshold: 5000000, rate: 3.0 },
      { threshold: 6000000, rate: 3.5 }, { threshold: 7000000, rate: 4.0 }, { threshold: 8000000, rate: 4.5 },
      { threshold: 9000000, rate: 5.0 }, { threshold: 10000000, rate: 5.5 },
    ];
    if (orgSettings.leader_bonus_tiers) {
      try {
        const parsed = JSON.parse(orgSettings.leader_bonus_tiers);
        if (Array.isArray(parsed) && parsed.length > 0) leaderTiers = parsed;
      } catch { /* use defaults */ }
    }
    const subleaderRate = parseFloat(orgSettings.subleader_bonus_rate) || 1.2;
    const getLeaderRate = (sales) => {
      const sorted = [...leaderTiers].sort((a, b) => b.threshold - a.threshold);
      const tier = sorted.find(t => sales >= t.threshold);
      return tier ? tier.rate : 0;
    };

    [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
      const sales = teamSales[team] || 0;
      const tm = Object.values(byGetter).filter(p => p.team === team);
      const leaders = tm.filter(p => p.role === 'リーダー');
      const subs = tm.filter(p => p.role === '副リーダー');
      // リーダー: チーム売上 × 段階料率（リーダーが複数の場合は均等配分）
      const leaderPool = Math.round(sales * getLeaderRate(sales) / 100);
      leaders.forEach(p => { p.teamBonus = leaders.length ? Math.round(leaderPool / leaders.length) : 0; });
      // 副リーダー: チーム売上 × 副リーダー率 ÷ 副リーダー人数
      const subPool = Math.round(sales * subleaderRate / 100);
      subs.forEach(p => { p.teamBonus = subs.length ? Math.round(subPool / subs.length) : 0; });
    });
    Object.values(byGetter).forEach(p => { p.total = p.incentive + p.teamBonus; });
    return Object.values(byGetter);
  }, [appoData, members, payMonth, orgSettings, memberRoleMap]);

  const data = React.useMemo(() => {
    if (!isConfirmed) return calcData;
    return snapshots.map(s => ({
      name: s.member_name,
      team: s.team_name,
      role: s.role,
      rank: s.rank,
      rate: s.incentive_rate,
      totalSales: 0,
      sales: s.monthly_sales,
      incentive: s.incentive_amt,
      teamBonus: s.team_bonus,
      total: s.total_payout - s.referral_bonus,
    }));
  }, [isConfirmed, snapshots, calcData]);

  const activeReferralMap = React.useMemo(() => {
    if (!isConfirmed) return referralMap;
    const map = {};
    snapshots.forEach(s => { map[s.member_name] = s.referral_bonus; });
    return map;
  }, [isConfirmed, snapshots, referralMap]);

  // 報酬確定
  const handleConfirm = async () => {
    if (!isAdmin || confirming) return;
    if (!window.confirm(`${monthTab}の報酬を確定しますか？\n確定後は自動計算が停止し、スナップショットが表示されます。`)) return;
    setConfirming(true);
    setActionMsg('');
    try {
      const rows = calcData.map(p => ({
        org_id: getOrgId(),
        pay_month: payMonth,
        member_name: p.name,
        team_name: p.team,
        role: p.role,
        rank: p.rank,
        incentive_rate: p.rate || 0,
        monthly_sales: p.sales,
        incentive_amt: p.incentive,
        team_bonus: p.teamBonus,
        referral_bonus: referralMap[p.name] || 0,
        total_payout: p.total + (referralMap[p.name] || 0),
        confirmed_by: currentUser || '管理者',
      }));
      const { error } = await upsertPayrollSnapshots(rows);
      if (error) throw error;
      const { data: fresh } = await fetchPayrollSnapshots(payMonth);
      setSnapshots(fresh || []);
      setActionMsg(`${monthTab}の報酬を確定しました（${rows.length}名）`);
      setTimeout(() => setActionMsg(''), 6000);
    } catch (e) {
      setActionMsg('確定に失敗しました: ' + (e.message || '不明'));
    } finally {
      setConfirming(false);
    }
  };

  // 確定解除
  const handleUnconfirm = async () => {
    if (!isAdmin || unconfirming) return;
    if (!window.confirm(`${monthTab}の報酬確定を解除しますか？\nリアルタイム計算に戻ります。`)) return;
    setUnconfirming(true);
    setActionMsg('');
    try {
      const { error } = await deletePayrollSnapshots(payMonth);
      if (error) throw error;
      setSnapshots([]);
      setActionMsg(`${monthTab}の確定を解除しました`);
      setTimeout(() => setActionMsg(''), 4000);
    } catch (e) {
      setActionMsg('解除に失敗しました: ' + (e.message || '不明'));
    } finally {
      setUnconfirming(false);
    }
  };

  // 累計同期処理（管理者のみ）
  const uncountedCount = React.useMemo(() =>
    (appoData || []).filter(a => a.status === '面談済' && !a.isCounted).length,
    [appoData]
  );
  const handleSync = async () => {
    if (!isAdmin || syncing) return;
    const uncounted = (appoData || []).filter(a => a.status === '面談済' && !a.isCounted);
    if (!uncounted.length) {
      setSyncMsg('未加算のアポはありません');
      setTimeout(() => setSyncMsg(''), 3000);
      return;
    }
    setSyncing(true);
    setSyncMsg('');
    try {
      const memberMap = {};
      members.forEach(m => { if (typeof m === 'object' && m.name) memberMap[m.name] = m; });
      const deltas = {};
      uncounted.forEach(a => { deltas[a.getter] = (deltas[a.getter] || 0) + (a.sales || 0); });
      for (const [getterName, delta] of Object.entries(deltas)) {
        const member = memberMap[getterName];
        if (!member?._supaId || delta === 0) continue;
        const newTotal = Math.max(0, (member.totalSales || 0) + delta);
        const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal, orgSettings);
        await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
        if (setMembers) {
          setMembers(prev => prev.map(m =>
            (typeof m !== 'string' && m._supaId === member._supaId)
              ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
              : m
          ));
        }
      }
      for (const a of uncounted) {
        if (a._supaId) await updateAppoCounted(a._supaId, true);
      }
      setSyncMsg(`${uncounted.length}件のアポを累計に加算しました`);
      if (onDataRefetch) setTimeout(onDataRefetch, 500);
      setTimeout(() => setSyncMsg(''), 5000);
    } catch (e) {
      setSyncMsg('同期に失敗しました: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = data
    .filter(p => teamFilter === "all" || p.team === teamFilter)
    .sort((a, b) => b[sortKey] - a[sortKey]);
  const teams = [...new Set(data.map(p => p.team))];
  const rawGrandTotal = data.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0), 0);
  const rawGrandSales = data.reduce((s, p) => s + p.sales, 0);
  const salesDisc = adjustment.sales_discount || 0;
  const incDisc = adjustment.incentive_discount || 0;
  const grandTotal = rawGrandTotal - incDisc;
  const grandSales = rawGrandSales - salesDisc;
  const paidCount = data.filter(p => p.total > 0).length;
  const fmt = (v) => v > 0 ? "¥" + v.toLocaleString() : "-";

  // テーブルカラム定義: [header, sortKey, align]
  const COLS = [
    { h: "名前",           sk: null,         align: "left"  },
    { h: "チーム",         sk: null,         align: "left"  },
    { h: "ランク",         sk: null,         align: "left"  },
    { h: "率",             sk: null,         align: "right" },
    { h: "今月売上",       sk: "sales",      align: "right" },
    { h: "①インセンティブ",sk: "incentive",  align: "right" },
    { h: "②役職ボーナス", sk: "teamBonus",  align: "right" },
    { h: "③紹介",         sk: null,         align: "right" },
    { h: "合計支給額",     sk: "total",      align: "right" },
  ];
  const cellPad = "8px 16px";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      <PageHeader
        eyebrow="Admin · 報酬"
        title="Payroll"
        description="月次インセンティブ・支給額の管理"
        style={{ marginBottom: space[6] }}
      />

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: space[5] }}>
        {[
          { label: "総支給額",   value: fmt(grandTotal), color: TH_BG },
          { label: "総売上",     value: fmt(grandSales), color: TH_BG },
          { label: "支給対象者", value: paidCount + "名", color: TH_BG },
          { label: "対象月",     value: monthTab,         color: TH_BG },
        ].map((s, i) => (
          <Card key={i} variant="default" padding="none" style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: font.weight.black, color: s.color, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* ── 調整（ディスカウント）──────────────────────────────────── */}
      {(salesDisc > 0 || incDisc > 0) && !showAdjustForm && (
        <div style={{ marginBottom: space[3], padding: '8px 16px', borderRadius: radius.md, background: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: '#92400E' }}>調整適用中:</span>
          {salesDisc > 0 && <span style={{ fontSize: font.size.xs, color: '#92400E' }}>売上 -¥{salesDisc.toLocaleString()}</span>}
          {incDisc > 0 && <span style={{ fontSize: font.size.xs, color: '#92400E' }}>インセンティブ -¥{incDisc.toLocaleString()}</span>}
          {adjustment.note && <span style={{ fontSize: font.size.xs - 1, color: '#B45309' }}>({adjustment.note})</span>}
          {isAdmin && <button onClick={() => setShowAdjustForm(true)} style={{ fontSize: font.size.xs - 1, background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', textDecoration: 'underline', padding: 0 }}>編集</button>}
        </div>
      )}
      {isAdmin && showAdjustForm && (
        <div style={{ marginBottom: space[3], padding: '12px 16px', borderRadius: radius.md, background: '#FEF3C7', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: '#92400E', marginBottom: 8 }}>Payroll調整（ディスカウント）</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: font.size.xs - 1, color: '#92400E' }}>
              売上ディスカウント
              <input type="number" value={adjForm.sales} onChange={e => setAdjForm(p => ({ ...p, sales: e.target.value }))}
                style={{ marginLeft: 6, width: 110, padding: '4px 8px', borderRadius: radius.md, border: '1px solid #FDE68A', fontSize: font.size.xs, fontFamily: MONO }} />
            </label>
            <label style={{ fontSize: font.size.xs - 1, color: '#92400E' }}>
              インセンティブディスカウント
              <input type="number" value={adjForm.incentive} onChange={e => setAdjForm(p => ({ ...p, incentive: e.target.value }))}
                style={{ marginLeft: 6, width: 110, padding: '4px 8px', borderRadius: radius.md, border: '1px solid #FDE68A', fontSize: font.size.xs, fontFamily: MONO }} />
            </label>
            <label style={{ fontSize: font.size.xs - 1, color: '#92400E' }}>
              備考
              <input value={adjForm.note} onChange={e => setAdjForm(p => ({ ...p, note: e.target.value }))}
                style={{ marginLeft: 6, width: 160, padding: '4px 8px', borderRadius: radius.md, border: '1px solid #FDE68A', fontSize: font.size.xs }} />
            </label>
            <Button variant="primary" size="sm" loading={adjSaving} onClick={handleSaveAdjustment} style={{ background: TH_BG }}>
              {adjSaving ? '保存中...' : '保存'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowAdjustForm(false)} style={{ borderColor: TH_BG, color: TH_BG }}>
              キャンセル
            </Button>
          </div>
        </div>
      )}
      {isAdmin && !showAdjustForm && salesDisc === 0 && incDisc === 0 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowAdjustForm(true)}
            style={{ fontSize: font.size.xs - 1, background: 'none', border: 'none', cursor: 'pointer', color: color.textLight, textDecoration: 'underline', padding: 0 }}>
            + 調整（ディスカウント）を追加
          </button>
        </div>
      )}

      {/* ── Filters + 確定ボタン ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: space[3], alignItems: "center", flexWrap: "wrap" }}>
        {/* 月タブ */}
        <div style={{ display: "flex", gap: 4 }}>
          {payrollMonths.map(({ label }) => (
            <button key={label} onClick={() => setMonthTab(label)} style={{
              padding: "5px 14px", borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold, cursor: "pointer", fontFamily: font.family.sans,
              background: monthTab === label ? TH_BG : color.white,
              color: monthTab === label ? color.white : color.textMid,
              border: `1px solid ${monthTab === label ? TH_BG : GRAY_200}`,
            }}>{label}</button>
          ))}
        </div>

        {/* チームフィルター */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["all", ...teams].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: "4px 10px", borderRadius: radius.md, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: "pointer", fontFamily: font.family.sans,
              background: teamFilter === t ? TH_BG : color.white,
              color: teamFilter === t ? color.white : color.textMid,
              border: `1px solid ${teamFilter === t ? TH_BG : GRAY_200}`,
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>

        {/* 管理者アクション */}
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {isConfirmed ? (
              <>
                <span style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: color.success, borderLeft: `3px solid ${color.success}`, paddingLeft: 8 }}>
                  ✓ 確定済 {confirmedAt}
                </span>
                <Button variant="secondary" size="sm" loading={unconfirming} onClick={handleUnconfirm} style={{ borderColor: TH_BG, color: TH_BG }}>
                  {unconfirming ? '解除中...' : '確定解除'}
                </Button>
              </>
            ) : (
              <>
                {uncountedCount > 0 && (
                  <span style={{ fontSize: font.size.xs - 1, color: color.textMid, fontWeight: font.weight.semibold }}>未加算: {uncountedCount}件</span>
                )}
                <Button variant="secondary" size="sm" loading={syncing} onClick={handleSync} style={{ borderColor: TH_BG, color: TH_BG }}>
                  {syncing ? '同期中...' : '累計同期'}
                </Button>
                <Button variant="primary" size="sm" loading={confirming || snapshotLoading} onClick={handleConfirm} style={{ background: TH_BG }}>
                  {confirming ? '確定中...' : '報酬確定'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* メッセージ */}
      {(syncMsg || actionMsg) && (() => {
        const msg = syncMsg || actionMsg;
        const isErr = msg.includes('失敗') || msg.includes('エラー');
        return (
          <div style={{ marginBottom: 10, padding: "8px 16px", borderRadius: radius.md, fontSize: font.size.xs, fontWeight: font.weight.semibold,
            borderLeft: `3px solid ${isErr ? color.danger : color.success}`,
            background: isErr ? "#fff5f5" : "#f0faf4",
            color: isErr ? color.danger : color.success }}>
            {msg}
          </div>
        );
      })()}

      {/* 未確定注記 */}
      {!isConfirmed && !snapshotLoading && (
        <div style={{ marginBottom: 8, fontSize: font.size.xs - 1, color: color.textLight }}>
          ※ 未確定（リアルタイム計算）。月末に「報酬確定」を押すとスナップショットとして保存されます。
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      {/* ヘッダー文字列をクリックで sortKey を切替できるラベル */}
      {(() => {
        const labelOf = (col) => col.sk ? (
          <span
            onClick={(e) => { e.stopPropagation(); setSortKey(col.sk); }}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >{col.h}{sortKey === col.sk ? ' ▼' : ''}</span>
        ) : col.h;

        const dataColumns = [
          {
            key: 'name', label: labelOf(COLS[0]), width: PAYROLL_COLS[0].width, align: PAYROLL_COLS[0].align,
            cellStyle: { padding: cellPad },
            render: (p) => (
              <div>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: TH_BG }}>{p.name}</div>
                {p.role && <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>{p.role}</div>}
              </div>
            ),
          },
          {
            key: 'team', label: labelOf(COLS[1]), width: PAYROLL_COLS[1].width, align: PAYROLL_COLS[1].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, color: color.textMid },
            render: (p) => p.team,
          },
          {
            key: 'rank', label: labelOf(COLS[2]), width: PAYROLL_COLS[2].width, align: PAYROLL_COLS[2].align,
            cellStyle: { padding: cellPad, whiteSpace: 'normal', overflow: 'visible' },
            render: (p) => {
              const rs = RANK_COLORS[p.rank] || RANK_COLORS['トレーニー'];
              return (
                <span style={{
                  fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
                  borderLeft: `3px solid ${rs.color}`, paddingLeft: 6, color: rs.color,
                }}>{p.rank || '-'}</span>
              );
            },
          },
          {
            key: 'rate', label: labelOf(COLS[3]), width: PAYROLL_COLS[3].width, align: PAYROLL_COLS[3].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color.textMid },
            render: (p) => p.rate ? (p.rate * 100).toFixed(0) + '%' : '-',
          },
          {
            key: 'sales', label: labelOf(COLS[4]), width: PAYROLL_COLS[4].width, align: PAYROLL_COLS[4].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.semibold, color: TH_BG },
            render: (p) => fmt(p.sales),
          },
          {
            key: 'incentive', label: labelOf(COLS[5]), width: PAYROLL_COLS[5].width, align: PAYROLL_COLS[5].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color.success },
            render: (p) => fmt(p.incentive),
          },
          {
            key: 'teamBonus', label: labelOf(COLS[6]), width: PAYROLL_COLS[6].width, align: PAYROLL_COLS[6].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' },
            render: (p) => (
              <span style={{ color: p.teamBonus > 0 ? TH_BG : color.textMid }}>{fmt(p.teamBonus)}</span>
            ),
          },
          {
            key: 'referral', label: labelOf(COLS[7]), width: PAYROLL_COLS[7].width, align: PAYROLL_COLS[7].align,
            cellStyle: { padding: cellPad, fontSize: font.size.xs, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' },
            render: (p) => {
              const refBonus = activeReferralMap[p.name] || 0;
              return <span style={{ color: refBonus > 0 ? color.success : color.textMid }}>{fmt(refBonus)}</span>;
            },
          },
          {
            key: 'total', label: labelOf(COLS[8]), width: PAYROLL_COLS[8].width, align: PAYROLL_COLS[8].align,
            cellStyle: { padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.black, color: TH_BG },
            render: (p) => {
              const refBonus = activeReferralMap[p.name] || 0;
              return fmt(p.total + refBonus);
            },
          },
        ];

        // 合計値の事前計算
        const sumSales = filtered.reduce((s, p) => s + p.sales, 0) - salesDisc;
        const sumIncentive = filtered.reduce((s, p) => s + p.incentive, 0) - incDisc;
        const sumTeamBonus = filtered.reduce((s, p) => s + p.teamBonus, 0);
        const sumReferral = filtered.reduce((s, p) => s + (activeReferralMap[p.name] || 0), 0);
        const sumTotal = filtered.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0), 0) - incDisc;

        // 合計行の grid template (DataTable の fillWidth と同じ動きにする)
        const totalGrid = PAYROLL_COLS.map(c => `minmax(${c.width}px, ${c.width}fr)`).join(' ');
        const totalMinWidth = PAYROLL_COLS.reduce((s, c) => s + c.width, 0);

        return (
          <div>
            <DataTable
              ariaLabel="給与支給テーブル"
              height="auto"
              showCount={false}
              fillWidth
              loading={snapshotLoading}
              rows={filtered}
              rowKey={(_, i) => i}
              emptyMessage="該当データがありません"
              zebra={false}
              rowBackground={(_, i) => i % 2 === 0 ? color.white : GRAY_50}
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
              columns={dataColumns}
            />

            {/* 合計行: DataTable の真下に同じ列幅で表示 */}
            {filtered.length > 0 && (
              <div style={{
                background: color.white,
                border: `1px solid ${GRAY_200}`,
                borderTop: `2px solid ${TH_BG}`,
                borderTopLeftRadius: 0, borderTopRightRadius: 0,
                borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg,
                overflowX: 'auto',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: totalGrid, alignItems: 'center',
                  minWidth: totalMinWidth,
                }}>
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontWeight: font.weight.bold, color: TH_BG, textAlign: PAYROLL_COLS[0].align }}>合計</div>
                  <div style={{ padding: cellPad }} />
                  <div style={{ padding: cellPad }} />
                  <div style={{ padding: cellPad }} />
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.bold, color: TH_BG, textAlign: PAYROLL_COLS[4].align }}>
                    {sumSales > 0 ? '¥' + sumSales.toLocaleString() : '-'}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.bold, color: color.success, textAlign: PAYROLL_COLS[5].align }}>
                    {sumIncentive > 0 ? '¥' + sumIncentive.toLocaleString() : '-'}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.bold, color: TH_BG, textAlign: PAYROLL_COLS[6].align }}>
                    {sumTeamBonus > 0 ? '¥' + sumTeamBonus.toLocaleString() : '-'}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.sm, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.bold, color: color.success, textAlign: PAYROLL_COLS[7].align }}>
                    {sumReferral > 0 ? '¥' + sumReferral.toLocaleString() : '-'}
                  </div>
                  <div style={{ padding: cellPad, fontSize: font.size.base, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.black, color: TH_BG, textAlign: PAYROLL_COLS[8].align }}>
                    {'¥' + sumTotal.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
