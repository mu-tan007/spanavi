import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { calcRankAndRate } from '../../utils/calculations';
import { updateMemberReward } from '../../lib/supabaseWrite';

const PAYROLL_DATA = [];

export default function PayrollView({ members, appoData, isAdmin, setMembers, onDataRefetch }) {
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

  // リファラル採用インセンティブ計算
  const referralMap = React.useMemo(() => {
    const map = {};
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    const monthStart = new Date(sel.year, sel.month - 1, 1);
    const monthEnd = new Date(sel.year, sel.month, 0);
    members.forEach(m => {
      if (typeof m !== 'object' || !m.referrerName || !m.operationStartDate || (m.totalSales || 0) < 100000) return;
      const opDate = new Date(m.operationStartDate);
      const deadline = new Date(opDate);
      deadline.setDate(deadline.getDate() + 30);
      if (opDate <= monthEnd && deadline >= monthStart) {
        map[m.referrerName] = (map[m.referrerName] || 0) + 50000;
      }
    });
    return map;
  }, [members, monthTab]);

  // 月次報酬計算（面談済のみ）
  // インセンティブは appointments.intern_reward の保存済み確定値を合算（現在レートで再計算しない）
  // ランク・率は参考表示のみ
  const data = React.useMemo(() => {
    const sel = payrollMonths.find(x => x.label === monthTab) ?? { year: 2026, month: 3 };
    const yyyymm = `${sel.year}-${String(sel.month).padStart(2, "0")}`;
    const monthAppos = (appoData || []).filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm && a.status === '面談済'
    );
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
      // intern_reward の保存済み確定値を合算（現在レートで再計算しない）
      byGetter[a.getter].incentive += a.reward || 0;
      teamSales[team] = (teamSales[team] || 0) + (a.sales || 0);
    });
    // 役職ボーナス: チーム売上合計×3%を原資。リーダー60%、副リーダー40%÷人数
    [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
      const pool = Math.round((teamSales[team] || 0) * 0.03);
      const tm = Object.values(byGetter).filter(p => p.team === team);
      const leaders = tm.filter(p => p.role === 'リーダー');
      const subs = tm.filter(p => p.role === '副リーダー');
      leaders.forEach(p => { p.teamBonus = leaders.length ? Math.round(pool * 0.6 / leaders.length) : 0; });
      subs.forEach(p => { p.teamBonus = subs.length ? Math.round(pool * 0.4 / subs.length) : 0; });
    });
    Object.values(byGetter).forEach(p => { p.total = p.incentive + p.teamBonus; });
    return Object.values(byGetter);
  }, [appoData, members, monthTab]);

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
  const grandTotal = data.reduce((s, p) => s + p.total + (referralMap[p.name] || 0), 0);
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

      {/* Filters */}
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
              padding: "4px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              background: teamFilter === t ? C.gold + "15" : C.white,
              color: teamFilter === t ? C.navy : C.textMid,
              border: "1px solid " + (teamFilter === t ? C.gold : C.borderLight),
            }}>{t === "all" ? "全チーム" : t + "チーム"}</button>
          ))}
        </div>
        {isAdmin && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {uncountedCount > 0 && (
              <span style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>未加算: {uncountedCount}件</span>
            )}
            <button onClick={handleSync} disabled={syncing} style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1,
              background: C.navy, color: C.white, border: "none", fontFamily: "'Noto Sans JP'",
            }}>{syncing ? '同期中...' : '累計同期'}</button>
          </div>
        )}
      </div>

      {syncMsg && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: syncMsg.startsWith('✅') ? "#f0faf4" : "#fff5f5",
          color: syncMsg.startsWith('✅') ? C.green : C.red,
          border: "1px solid " + (syncMsg.startsWith('✅') ? "#34a853" : C.red) }}>
          {syncMsg}
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.9fr 0.5fr 0.8fr 0.9fr 0.8fr 0.6fr 0.9fr",
          padding: "8px 14px", background: C.navyDeep, fontSize: 9, fontWeight: 600, color: C.goldLight,
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
          <div style={{ padding: "24px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>該当データがありません</div>
        ) : filtered.map((p, i) => {
          const rankStyle = RANK_COLORS[p.rank] || RANK_COLORS['トレーニー'];
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.9fr 0.5fr 0.8fr 0.9fr 0.8fr 0.6fr 0.9fr",
              padding: "7px 14px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid " + C.borderLight,
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
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: referralMap[p.name] ? C.green : C.textMid }}>{fmt(referralMap[p.name] || 0)}</span>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.navy }}>{fmt(p.total + (referralMap[p.name] || 0))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}