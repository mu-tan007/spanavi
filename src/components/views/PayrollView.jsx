import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { calcRankAndRate } from '../../utils/calculations';
import { updateMemberReward, updateAppoCounted, fetchPayrollSnapshots, upsertPayrollSnapshots, deletePayrollSnapshots, fetchOrgSettings } from '../../lib/supabaseWrite';

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
  const [hoveredRow, setHoveredRow] = useState(null);

  useEffect(() => {
    fetchOrgSettings().then(({ data }) => setOrgSettings(data || {}));
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

  // monthTab 変更時にスナップショットを取得
  useEffect(() => {
    setSnapshotLoading(true);
    fetchPayrollSnapshots(payMonth).then(({ data }) => {
      setSnapshots(data || []);
      setSnapshotLoading(false);
    });
  }, [payMonth]);

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
    const teamSales = {};
    const byGetter = {};
    monthAppos.forEach(a => {
      const mem = memberMap[a.getter] || {};
      const { rank, rate } = calcRankAndRate(mem.totalSales || 0, orgSettings);
      const team = mem.team || '';
      if (!byGetter[a.getter]) {
        byGetter[a.getter] = {
          name: a.getter, team, rank, rate,
          role: mem.role || '',
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
      if (!['チームリーダー', '副リーダー'].includes(m.role)) return;
      if (byGetter[m.name]) return;
      const { rank, rate } = calcRankAndRate(m.totalSales || 0, orgSettings);
      byGetter[m.name] = {
        name: m.name, team: m.team || '', rank, rate,
        role: m.role || '', totalSales: m.totalSales || 0,
        sales: 0, incentive: 0, teamBonus: 0, total: 0,
      };
    });
    [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
      const pool = Math.round((teamSales[team] || 0) * 0.03);
      const tm = Object.values(byGetter).filter(p => p.team === team);
      const leaders = tm.filter(p => p.role === 'チームリーダー');
      const subs = tm.filter(p => p.role === '副リーダー');
      leaders.forEach(p => { p.teamBonus = leaders.length ? Math.round(pool * 0.6 / leaders.length) : 0; });
      subs.forEach(p => { p.teamBonus = subs.length ? Math.round(pool * 0.4 / subs.length) : 0; });
    });
    Object.values(byGetter).forEach(p => { p.total = p.incentive + p.teamBonus; });
    return Object.values(byGetter);
  }, [appoData, members, payMonth, orgSettings]);

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
        org_id: 'a0000000-0000-0000-0000-000000000001',
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
  const grandTotal = data.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0), 0);
  const grandSales = data.reduce((s, p) => s + p.sales, 0);
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
  const gridCols = "1.4fr 0.6fr 0.9fr 0.5fr 0.8fr 0.9fr 0.8fr 0.6fr 0.9fr";
  const cellPad = "8px 16px";

  // ボタンスタイル
  const btnPrimary = { padding: "5px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'", background: TH_BG, color: "#fff", border: "none" };
  const btnSecondary = { padding: "5px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'", background: "#fff", color: TH_BG, border: `1px solid ${TH_BG}` };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      {/* ── ページヘッダー ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: `1px solid ${TH_BG}` }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: TH_BG, letterSpacing: '-0.3px' }}>Payroll</div>
        <div style={{ fontSize: 13, color: C.textLight, marginTop: 4 }}>月次インセンティブ・支給額の管理</div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "総支給額",   value: fmt(grandTotal), color: TH_BG },
          { label: "総売上",     value: fmt(grandSales), color: TH_BG },
          { label: "支給対象者", value: paidCount + "名", color: TH_BG },
          { label: "対象月",     value: monthTab,         color: TH_BG },
        ].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 4, padding: "14px 18px", border: `1px solid ${GRAY_200}` }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filters + 確定ボタン ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        {/* 月タブ */}
        <div style={{ display: "flex", gap: 4 }}>
          {payrollMonths.map(({ label }) => (
            <button key={label} onClick={() => setMonthTab(label)} style={{
              padding: "5px 14px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              background: monthTab === label ? TH_BG : "#fff",
              color: monthTab === label ? "#fff" : C.textMid,
              border: `1px solid ${monthTab === label ? TH_BG : GRAY_200}`,
            }}>{label}</button>
          ))}
        </div>

        {/* チームフィルター */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["all", ...teams].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              background: teamFilter === t ? TH_BG : "#fff",
              color: teamFilter === t ? "#fff" : C.textMid,
              border: `1px solid ${teamFilter === t ? TH_BG : GRAY_200}`,
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>

        {/* 管理者アクション */}
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {isConfirmed ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, borderLeft: `3px solid ${C.green}`, paddingLeft: 8 }}>
                  ✓ 確定済 {confirmedAt}
                </span>
                <button onClick={handleUnconfirm} disabled={unconfirming}
                  style={{ ...btnSecondary, opacity: unconfirming ? 0.6 : 1, cursor: unconfirming ? "default" : "pointer" }}>
                  {unconfirming ? '解除中...' : '確定解除'}
                </button>
              </>
            ) : (
              <>
                {uncountedCount > 0 && (
                  <span style={{ fontSize: 10, color: C.textMid, fontWeight: 600 }}>未加算: {uncountedCount}件</span>
                )}
                <button onClick={handleSync} disabled={syncing}
                  style={{ ...btnSecondary, opacity: syncing ? 0.6 : 1, cursor: syncing ? "default" : "pointer" }}>
                  {syncing ? '同期中...' : '累計同期'}
                </button>
                <button onClick={handleConfirm} disabled={confirming || snapshotLoading}
                  style={{ ...btnPrimary, opacity: (confirming || snapshotLoading) ? 0.6 : 1, cursor: (confirming || snapshotLoading) ? "default" : "pointer" }}>
                  {confirming ? '確定中...' : '報酬確定'}
                </button>
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
          <div style={{ marginBottom: 10, padding: "8px 16px", borderRadius: 4, fontSize: 11, fontWeight: 600,
            borderLeft: `3px solid ${isErr ? C.red : C.green}`,
            background: isErr ? "#fff5f5" : "#f0faf4",
            color: isErr ? C.red : C.green }}>
            {msg}
          </div>
        );
      })()}

      {/* 未確定注記 */}
      {!isConfirmed && !snapshotLoading && (
        <div style={{ marginBottom: 8, fontSize: 10, color: C.textLight }}>
          ※ 未確定（リアルタイム計算）。月末に「報酬確定」を押すとスナップショットとして保存されます。
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 4, border: `1px solid ${GRAY_200}`, overflow: "hidden" }}>

        {/* ヘッダー行 */}
        <div style={{
          display: "grid", gridTemplateColumns: gridCols,
          background: TH_BG, borderBottom: `2px solid ${TH_BG}`,
        }}>
          {COLS.map((col, i) => (
            <span key={i}
              onClick={() => { if (col.sk) setSortKey(col.sk); }}
              style={{
                padding: cellPad, fontSize: 11, fontWeight: 600, color: "#fff",
                textAlign: col.align,
                cursor: col.sk ? "pointer" : "default",
                userSelect: "none",
              }}>
              {col.h}{sortKey === col.sk ? " ▼" : ""}
            </span>
          ))}
        </div>

        {/* データ行 */}
        {filtered.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "left", color: C.textLight, fontSize: 12 }}>
            {snapshotLoading ? '読み込み中...' : '該当データがありません'}
          </div>
        ) : filtered.map((p, i) => {
          const rankStyle = RANK_COLORS[p.rank] || RANK_COLORS['トレーニー'];
          const refBonus = activeReferralMap[p.name] || 0;
          const isHovered = hoveredRow === i;
          const rowBg = isHovered ? "#F3F4F6" : (i % 2 === 0 ? "#fff" : GRAY_50);
          return (
            <div key={i}
              onMouseEnter={() => setHoveredRow(i)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: "grid", gridTemplateColumns: gridCols, alignItems: "center",
                borderBottom: `1px solid ${GRAY_200}`,
                background: rowBg,
                transition: "background 0.1s",
              }}>
              {/* 名前 */}
              <div style={{ padding: cellPad, textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TH_BG }}>{p.name}</div>
                {p.role && <div style={{ fontSize: 10, color: C.textLight }}>{p.role}</div>}
              </div>
              {/* チーム */}
              <div style={{ padding: cellPad, fontSize: 11, color: C.textMid, textAlign: "left" }}>{p.team}</div>
              {/* ランク */}
              <div style={{ padding: cellPad, textAlign: "left" }}>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  borderLeft: `3px solid ${rankStyle.color}`,
                  paddingLeft: 6, color: rankStyle.color,
                }}>{p.rank || "-"}</span>
              </div>
              {/* 率 */}
              <div style={{ padding: cellPad, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.textMid, textAlign: "right" }}>
                {p.rate ? (p.rate * 100).toFixed(0) + "%" : "-"}
              </div>
              {/* 今月売上 */}
              <div style={{ padding: cellPad, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: TH_BG, textAlign: "right" }}>
                {fmt(p.sales)}
              </div>
              {/* ①インセンティブ */}
              <div style={{ padding: cellPad, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.green, textAlign: "right" }}>
                {fmt(p.incentive)}
              </div>
              {/* ②役職ボーナス */}
              <div style={{ padding: cellPad, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: p.teamBonus > 0 ? TH_BG : C.textMid, textAlign: "right" }}>
                {fmt(p.teamBonus)}
              </div>
              {/* ③紹介 */}
              <div style={{ padding: cellPad, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: refBonus > 0 ? C.green : C.textMid, textAlign: "right" }}>
                {fmt(refBonus)}
              </div>
              {/* 合計支給額 */}
              <div style={{ padding: cellPad, fontSize: 12, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: TH_BG, textAlign: "right" }}>
                {fmt(p.total + refBonus)}
              </div>
            </div>
          );
        })}

        {/* 合計行 */}
        {filtered.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: gridCols, alignItems: "center",
            borderTop: `2px solid ${TH_BG}`,
            background: "#fff",
          }}>
            <div style={{ padding: cellPad, fontSize: 12, fontWeight: 700, color: TH_BG, textAlign: "left" }}>合計</div>
            <div style={{ padding: cellPad }} />
            <div style={{ padding: cellPad }} />
            <div style={{ padding: cellPad }} />
            <div style={{ padding: cellPad, fontSize: 12, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: TH_BG, textAlign: "right" }}>
              {grandSales > 0 ? "¥" + filtered.reduce((s, p) => s + p.sales, 0).toLocaleString() : "-"}
            </div>
            <div style={{ padding: cellPad, fontSize: 12, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: C.green, textAlign: "right" }}>
              {filtered.reduce((s, p) => s + p.incentive, 0) > 0 ? "¥" + filtered.reduce((s, p) => s + p.incentive, 0).toLocaleString() : "-"}
            </div>
            <div style={{ padding: cellPad, fontSize: 12, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: TH_BG, textAlign: "right" }}>
              {filtered.reduce((s, p) => s + p.teamBonus, 0) > 0 ? "¥" + filtered.reduce((s, p) => s + p.teamBonus, 0).toLocaleString() : "-"}
            </div>
            <div style={{ padding: cellPad, fontSize: 12, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: C.green, textAlign: "right" }}>
              {filtered.reduce((s, p) => s + (activeReferralMap[p.name] || 0), 0) > 0 ? "¥" + filtered.reduce((s, p) => s + (activeReferralMap[p.name] || 0), 0).toLocaleString() : "-"}
            </div>
            <div style={{ padding: cellPad, fontSize: 13, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 900, color: TH_BG, textAlign: "right" }}>
              {"¥" + filtered.reduce((s, p) => s + p.total + (activeReferralMap[p.name] || 0), 0).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
