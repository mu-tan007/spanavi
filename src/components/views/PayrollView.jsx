import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { calcRankAndRate } from '../../utils/calculations';
import { updateMemberReward, updateAppoCounted, fetchPayrollSnapshots, upsertPayrollSnapshots, deletePayrollSnapshots } from '../../lib/supabaseWrite';

const PAYROLL_DATA = [];

// 報酬計算に含めるステータス（アポ取得・事前確認済・面談済）
const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);

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
  // 条件: 紹介されたインターン生の稼働開始30日以内のアポ売上合計が10万円以上に達した場合、紹介者に5万円支給
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
      // 稼働開始30日以内のアポ売上合計を計算
      const salesWithin30Days = appoData
        .filter(a =>
          a.getter === m.name &&
          PAYROLL_COUNTABLE.has(a.status) &&
          a.meetDate && new Date(a.meetDate) >= opDate && new Date(a.meetDate) <= deadline
        )
        .reduce((sum, a) => sum + (a.sales || 0), 0);
      // 10万円以上達成 かつ 30日期間が当月と重なる月に支給
      if (salesWithin30Days >= 100000 && opDate <= monthEnd && deadline >= monthStart) {
        map[m.referrerName] = (map[m.referrerName] || 0) + 50000;
      }
    });
    return map;
  }, [members, appoData, monthTab]);

  // 月次報酬計算（アポ取得・事前確認済・面談済）
  // インセンティブは appointments.intern_reward の保存済み確定値を合算（現在レートで再計算しない）
  // ランク・率は参考表示のみ
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
      const { rank, rate } = calcRankAndRate(mem.totalSales || 0);
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
    // リーダー・副リーダーは当月アポがなくてもbyGetterに追加（役職ボーナス受取のため）
    members.forEach(m => {
      if (typeof m !== 'object' || !m.name) return;
      if (!['チームリーダー', '副リーダー'].includes(m.role)) return;
      if (byGetter[m.name]) return;
      const { rank, rate } = calcRankAndRate(m.totalSales || 0);
      byGetter[m.name] = {
        name: m.name, team: m.team || '', rank, rate,
        role: m.role || '', totalSales: m.totalSales || 0,
        sales: 0, incentive: 0, teamBonus: 0, total: 0,
      };
    });
    // 役職ボーナス: チーム売上合計×3%を原資
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
  }, [appoData, members, payMonth]);

  // 確定済み月はスナップショットから表示、未確定はリアルタイム計算
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
      total: s.total_payout - s.referral_bonus, // referralは別途表示
    }));
  }, [isConfirmed, snapshots, calcData]);

  // referral: 確定済みはスナップショット値、未確定はリアルタイム計算
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
      setActionMsg(`✅ ${monthTab}の報酬を確定しました（${rows.length}名）`);
      setTimeout(() => setActionMsg(''), 6000);
    } catch (e) {
      setActionMsg('❌ 確定に失敗しました: ' + (e.message || '不明'));
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
      setActionMsg(`✅ ${monthTab}の確定を解除しました`);
      setTimeout(() => setActionMsg(''), 4000);
    } catch (e) {
      setActionMsg('❌ 解除に失敗しました: ' + (e.message || '不明'));
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
        const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
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
      setSyncMsg(`✅ ${uncounted.length}件のアポを累計に加算しました`);
      if (onDataRefetch) setTimeout(onDataRefetch, 500);
      setTimeout(() => setSyncMsg(''), 5000);
    } catch (e) {
      setSyncMsg('❌ 同期に失敗しました: ' + e.message);
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
  const RANK_COLORS = {
    'スーパースパルタン': { bg: C.gold + "22", color: '#b7791f' },
    'スパルタン':         { bg: C.green + "15", color: C.green },
    'プレイヤー':          { bg: C.gold + "15", color: C.gold },
    'トレーニー':          { bg: C.offWhite,     color: C.textLight },
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "総支給額", value: fmt(grandTotal), color: C.navy },
          { label: "総売上", value: fmt(grandSales), color: C.green },
          { label: "支給対象者", value: paidCount + "名", color: C.gold },
          { label: "対象月", value: monthTab, color: C.navyLight },
        ].map((s, i) => (
          <div key={i} style={{ background: C.white, borderRadius: 10, padding: "14px 18px", border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)" }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + 確定ボタン */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {payrollMonths.map(({ label }) => (
            <button key={label} onClick={() => setMonthTab(label)} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              background: monthTab === label ? C.navy : C.white,
              color: monthTab === label ? C.white : C.textMid,
              border: "1px solid " + (monthTab === label ? C.navy : C.borderLight),
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["all", ...teams].map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              background: teamFilter === t ? C.gold + "15" : C.white,
              color: teamFilter === t ? C.navy : C.textMid,
              border: "1px solid " + (teamFilter === t ? C.gold : C.borderLight),
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {/* 確定済みバッジ or 確定ボタン */}
            {isConfirmed ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: '#e8f8ee', padding: '4px 10px', borderRadius: 12, border: '1px solid #34a85330' }}>
                  ✓ 確定済 {confirmedAt}
                </span>
                <button onClick={handleUnconfirm} disabled={unconfirming} style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  cursor: unconfirming ? "default" : "pointer", opacity: unconfirming ? 0.6 : 1,
                  background: C.white, color: C.textMid, border: "1px solid " + C.border, fontFamily: "'Noto Sans JP'",
                }}>{unconfirming ? '解除中...' : '確定解除'}</button>
              </>
            ) : (
              <>
                {uncountedCount > 0 && (
                  <span style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>未加算: {uncountedCount}件</span>
                )}
                <button onClick={handleSync} disabled={syncing} style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1,
                  background: C.navy, color: C.white, border: "none", fontFamily: "'Noto Sans JP'",
                }}>{syncing ? '同期中...' : '累計同期'}</button>
                <button onClick={handleConfirm} disabled={confirming || snapshotLoading} style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: (confirming || snapshotLoading) ? "default" : "pointer",
                  opacity: (confirming || snapshotLoading) ? 0.6 : 1,
                  background: C.green, color: C.white, border: "none", fontFamily: "'Noto Sans JP'",
                }}>{confirming ? '確定中...' : '報酬確定'}</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* メッセージ */}
      {(syncMsg || actionMsg) && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: (syncMsg || actionMsg).startsWith('✅') ? "#f0faf4" : "#fff5f5",
          color: (syncMsg || actionMsg).startsWith('✅') ? C.green : C.red,
          border: "1px solid " + ((syncMsg || actionMsg).startsWith('✅') ? "#34a853" : C.red) }}>
          {syncMsg || actionMsg}
        </div>
      )}

      {/* 未確定の注記 */}
      {!isConfirmed && !snapshotLoading && (
        <div style={{ marginBottom: 8, fontSize: 10, color: C.textLight }}>
          ※ 未確定（リアルタイム計算）。月末に「報酬確定」を押すとスナップショットとして保存されます。
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 8, border: "1px solid #E5E5E5", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.9fr 0.5fr 0.8fr 0.9fr 0.8fr 0.6fr 0.9fr",
          padding: "8px 14px", background: "#F3F2F2", fontSize: 11, fontWeight: 700, color: "#706E6B",
          letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "2px solid #E5E5E5",
        }}>
          {["名前", "チーム", "ランク（参考）", "率（参考）", "今月売上", "①インセンティブ", "②役職ボーナス", "③紹介", "合計支給額"].map((h, i) => {
            const sortKeys = [null, null, null, null, "sales", "incentive", "teamBonus", null, "total"];
            return (
              <span key={i} style={{ cursor: sortKeys[i] ? "pointer" : "default" }}
                onClick={() => { if (sortKeys[i]) setSortKey(sortKeys[i]); }}>
                {h}{sortKey === sortKeys[i] ? " ▼" : ""}
              </span>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "24px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>
            {snapshotLoading ? '読み込み中...' : '該当データがありません'}
          </div>
        ) : filtered.map((p, i) => {
          const rankStyle = RANK_COLORS[p.rank] || RANK_COLORS['トレーニー'];
          const refBonus = activeReferralMap[p.name] || 0;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.9fr 0.5fr 0.8fr 0.9fr 0.8fr 0.6fr 0.9fr",
              padding: "7px 14px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid #F3F2F2",
              background: p.total > 100000 ? C.gold + "06" : i % 2 === 0 ? C.white : C.offWhite + "80",
            }}>
              <div>
                <div style={{ fontWeight: 600, color: C.navy }}>{p.name}</div>
                {p.role && <div style={{ fontSize: 9, color: C.textLight }}>{p.role}</div>}
              </div>
              <span style={{ fontSize: 10, color: C.textMid }}>{p.team}</span>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, background: rankStyle.bg, color: rankStyle.color }}>{p.rank || "-"}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.textLight }}>{p.rate ? (p.rate * 100).toFixed(0) + "%" : "-"}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", fontWeight: 600, color: C.navy }}>{fmt(p.sales)}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: C.green }}>{fmt(p.incentive)}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: p.teamBonus > 0 ? C.gold : C.textMid }}>{fmt(p.teamBonus)}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: refBonus > 0 ? C.green : C.textMid }}>{fmt(refBonus)}</span>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.navy }}>{fmt(p.total + refBonus)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
