import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag, DataTable } from '../ui';
import { calcMonthlyPayroll, calcReferralBonuses } from '../../utils/money';
import { calcRankAndRate } from '../../utils/calculations';
import { supabase } from '../../lib/supabase';
import { updateMemberReward, updateAppoCounted, fetchPayrollSnapshots, upsertPayrollSnapshots, deletePayrollSnapshots, fetchOrgSettings, fetchPayrollAdjustment, upsertPayrollAdjustment, markMembersReferralPaid, clearMembersReferralPaid, fetchPayrollInvoicesByMonth } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
// 旧 useColumnConfig / ColumnResizeHandle は DataTable 移行で不要に
import PageHeader from '../common/PageHeader';
import PayrollSelfDetailView from './PayrollSelfDetailView';
import { useUrlState } from '../../hooks/useUrlState';

const PAYROLL_DATA = [];

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
  { key: 'invoice', width: 90, align: 'center' },
];

export default function PayrollView({ members, appoData, isAdmin, setMembers, onDataRefetch, currentUser = '' }) {
  // ── 一般メンバー: 自分の詳細ページのみ ────────────────────────
  // 管理者は引き続き全員一覧 + ドリルダウン閲覧（下部 AdminPayrollList）。
  const myMember = (members || []).find(m => typeof m === 'object' && m.name === currentUser) || null;
  const [drillTargetId, setDrillTargetId] = useState(null);
  // 一覧でタップした時に選択していた月を詳細へ引き継ぐ（一覧=5月なのに詳細が前月を開く取り違え防止）
  const [drillMonth, setDrillMonth] = useState(null);

  if (!isAdmin) {
    return <PayrollSelfDetailView targetMember={myMember} members={members} appoData={appoData} canEdit={true} isAdmin={false} />;
  }

  // 管理者ドリルダウン中
  if (drillTargetId) {
    const target = (members || []).find(m => typeof m === 'object' && (m._supaId === drillTargetId || m.id === drillTargetId));
    if (target) {
      const isSelf = target.name === currentUser;
      return (
        <PayrollSelfDetailView
          targetMember={target}
          members={members}
          appoData={appoData}
          canEdit={isSelf}
          isAdmin={isAdmin}
          initialMonth={drillMonth}
          embedded
          onBack={() => setDrillTargetId(null)}
        />
      );
    }
  }

  return <AdminPayrollList
    members={members} appoData={appoData} isAdmin={isAdmin}
    setMembers={setMembers} onDataRefetch={onDataRefetch} currentUser={currentUser}
    onSelectMember={(id, month) => { setDrillTargetId(id); setDrillMonth(month || null); }}
  />;
}

function AdminPayrollList({ members, appoData, isAdmin, setMembers, onDataRefetch, currentUser, onSelectMember }) {
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
  // URL クエリ同期（ハードリロード/共有URL対応）。既存 localStorage は移行のため初期値だけ参照。
  const defaultMonthTab = (() => {
    const s = typeof window !== 'undefined' ? localStorage.getItem('spanavi_payroll_month') : null;
    return (s && payrollMonths.some(x => x.label === s)) ? s : (payrollMonths[payrollMonths.length - 1]?.label || "3月");
  })();
  const [monthTab, setMonthTab] = useUrlState('month', defaultMonthTab);
  useEffect(() => { try { localStorage.setItem('spanavi_payroll_month', monthTab); } catch (_) { /* noop */ } }, [monthTab]);
  const [teamFilter, setTeamFilter] = useUrlState('team', 'all');
  const [sortKey, setSortKey] = useUrlState('sort', 'total');
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

  // 請求書格納済みの member_id セット（月単位）
  const [invoiceMemberIdSet, setInvoiceMemberIdSet] = useState(new Set());

  // monthTab 変更時にスナップショット＆調整＆請求書一覧を取得
  useEffect(() => {
    setSnapshotLoading(true);
    Promise.all([
      fetchPayrollSnapshots(payMonth),
      fetchPayrollAdjustment(payMonth),
      fetchPayrollInvoicesByMonth(payMonth),
    ]).then(([snapRes, adjRes, invRes]) => {
      setSnapshots(snapRes.data || []);
      const adj = adjRes.data || { sales_discount: 0, incentive_discount: 0, note: '' };
      setAdjustment(adj);
      setAdjForm({ sales: adj.sales_discount || '', incentive: adj.incentive_discount || '', note: adj.note || '' });
      setInvoiceMemberIdSet(new Set((invRes.data || []).map(r => r.member_id)));
      setSnapshotLoading(false);
    });
  }, [payMonth]);

  // name → member_id（_supaId）の引き当てマップ。一覧の各行は p.name のみ持つため必要
  const memberIdByName = React.useMemo(() => {
    const m = {};
    (members || []).forEach(mem => {
      if (typeof mem === 'object' && mem.name && mem._supaId) m[mem.name] = mem._supaId;
    });
    return m;
  }, [members]);

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

  // リファラル採用インセンティブ計算（ロジック本体は utils/money.js でテスト固定）
  const referralCalc = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    return calcReferralBonuses({
      members,
      appoData,
      payMonth,
      monthStart: new Date(sel.year, sel.month - 1, 1),
      monthEnd: new Date(sel.year, sel.month, 0),
    });
  }, [members, appoData, monthTab, payMonth]);
  const referralMap = referralCalc.bonusByReferrer;
  // 当月支払対象の被紹介者IDリスト（確定/解除時にマーキング更新するため）
  const referralPaidMemberIds = referralCalc.paidMemberIds;

  // 月次報酬計算（ロジック本体は utils/money.js でテスト固定）
  const calcData = React.useMemo(
    () => calcMonthlyPayroll({ appoData, members, payMonth, orgSettings, memberRoleMap }),
    [appoData, members, payMonth, orgSettings, memberRoleMap],
  );

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
      // 当月支払対象の被紹介者を「支払済」としてマーキング（次月以降の重複支給防止）
      if (referralPaidMemberIds.length > 0) {
        await markMembersReferralPaid(referralPaidMemberIds, payMonth);
        if (onDataRefetch) setTimeout(onDataRefetch, 500);
      }
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
      // 当月分の紹介フィー支払マークを解除（再計算でやり直し可能にする）
      await clearMembersReferralPaid(payMonth);
      if (onDataRefetch) setTimeout(onDataRefetch, 500);
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
      // クライアント開拓リスト由来のアポは累計売上に加算しない（後で再加算しないようis_counted_in_cumulativeフラグだけ立てる）
      uncounted.forEach(a => {
        if (a.isProspecting) return;
        deltas[a.getter] = (deltas[a.getter] || 0) + (a.sales || 0);
      });
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
    { h: "名前",           sk: null,         align: "left"   },
    { h: "チーム",         sk: null,         align: "left"   },
    { h: "ランク",         sk: null,         align: "left"   },
    { h: "率",             sk: null,         align: "right"  },
    { h: "今月売上",       sk: "sales",      align: "right"  },
    { h: "①インセンティブ",sk: "incentive",  align: "right"  },
    { h: "②役職ボーナス", sk: "teamBonus",  align: "right"  },
    { h: "③紹介",         sk: null,         align: "right"  },
    { h: "合計支給額",     sk: "total",      align: "right"  },
    { h: "請求書",         sk: null,         align: "center" },
  ];
  const cellPad = "8px 16px";

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      <PageHeader
        title="報酬"
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
          {
            key: 'invoice', label: labelOf(COLS[9]), width: PAYROLL_COLS[9].width, align: PAYROLL_COLS[9].align,
            cellStyle: { padding: cellPad },
            render: (p) => {
              const mid = memberIdByName[p.name];
              return mid && invoiceMemberIdSet.has(mid)
                ? <Badge variant="success" dot>格納済</Badge>
                : <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>未提出</span>;
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
              onRowClick={(row) => {
                const m = (members || []).find(mm => typeof mm === 'object' && mm.name === row.name);
                if (m && onSelectMember) onSelectMember(m._supaId || m.id, monthTab);
              }}
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
                  <div style={{ padding: cellPad }} />
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
