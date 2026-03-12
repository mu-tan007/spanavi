import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { fetchCallRecordsForRanking } from '../../lib/supabaseWrite';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';

export default function StatsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const [callTab, setCallTab] = useState("team");
  const [callPeriod, setCallPeriod] = useState(() =>
    localStorage.getItem('spanavi_stats_callPeriod') || "week"
  );
  const [callCustomFrom, setCallCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_stats_callFrom') || ""
  );
  const [callCustomTo, setCallCustomTo] = useState(() =>
    localStorage.getItem('spanavi_stats_callTo') || ""
  );
  const [callSelectedMonth, setCallSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_callMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [salesTab, setSalesTab] = useState("team");
  const [salesPeriod, setSalesPeriod] = useState(() =>
    localStorage.getItem('spanavi_stats_salesPeriod') || "month"
  );
  const [salesCustomFrom, setSalesCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_stats_salesFrom') || ""
  );
  const [salesCustomTo, setSalesCustomTo] = useState(() =>
    localStorage.getItem('spanavi_stats_salesTo') || ""
  );
  const [salesSelectedMonth, setSalesSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_salesMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [notification, setNotification] = useState(null);
  const lastNotifTime = React.useRef(0);

  useEffect(() => {
    localStorage.setItem('spanavi_stats_callPeriod', callPeriod);
    localStorage.setItem('spanavi_stats_callMonth', callSelectedMonth);
    localStorage.setItem('spanavi_stats_callFrom', callCustomFrom);
    localStorage.setItem('spanavi_stats_callTo', callCustomTo);
    localStorage.setItem('spanavi_stats_salesPeriod', salesPeriod);
    localStorage.setItem('spanavi_stats_salesMonth', salesSelectedMonth);
    localStorage.setItem('spanavi_stats_salesFrom', salesCustomFrom);
    localStorage.setItem('spanavi_stats_salesTo', salesCustomTo);
  }, [callPeriod, callSelectedMonth, callCustomFrom, callCustomTo,
      salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo]);

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  // Helper: check if date string falls in a period
  const inPeriod = (dateStr, period, customFrom, customTo, selectedMonth = monthStr) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (period === "day") return d === todayStr;
    if (period === "week") return d >= weekStartStr && d <= todayStr;
    if (period === "month") return d.startsWith(selectedMonth);
    if (period === "custom") {
      const dm = d.slice(0, 7); // "YYYY-MM"
      if (customFrom && dm < customFrom) return false;
      if (customTo && dm > customTo) return false;
      return true;
    }
    return true;
  };

  const periodLabel = (period, customFrom, customTo) => {
    if (period === "day") return todayStr;
    if (period === "week") return weekStartStr + "〜" + todayStr;
    if (period === "month") return monthStr;
    if (period === "custom" && customFrom) return customFrom + "〜" + (customTo || "");
    return "";
  };

  // === Supabase-based rankings ===
  const [supaRecords, setSupaRecords] = useState([]);
  const [supaTodayRecords, setSupaTodayRecords] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);

  // JST boundary helpers
  const _jstStart = (dateStr) => new Date(dateStr + 'T00:00:00+09:00').toISOString();
  const _jstEnd = (dateStr) => new Date(dateStr + 'T23:59:59.999+09:00').toISOString();

  // Fetch period records on filter change
  useEffect(() => {
    let from, to;
    if (callPeriod === "day") {
      from = _jstStart(todayStr); to = _jstEnd(todayStr);
    } else if (callPeriod === "week") {
      from = _jstStart(weekStartStr); to = _jstEnd(todayStr);
    } else if (callPeriod === "month") {
      const firstDay = callSelectedMonth + '-01';
      const d = new Date(firstDay); d.setMonth(d.getMonth() + 1); d.setDate(0);
      from = _jstStart(firstDay); to = _jstEnd(d.toISOString().slice(0, 10));
    } else if (callPeriod === "custom" && callCustomFrom) {
      const fromDay = callCustomFrom + '-01';
      const toYM = (callCustomTo || callCustomFrom) + '-01';
      const d = new Date(toYM); d.setMonth(d.getMonth() + 1); d.setDate(0);
      from = _jstStart(fromDay); to = _jstEnd(d.toISOString().slice(0, 10));
    } else {
      return;
    }
    setRankLoading(true);
    fetchCallRecordsForRanking(from, to).then(({ data }) => {
      setSupaRecords(data);
      setRankLoading(false);
    });
  }, [callPeriod, callSelectedMonth, callCustomFrom, callCustomTo, todayStr, weekStartStr]);

  // Fetch today records with 60s polling
  useEffect(() => {
    const load = () => {
      fetchCallRecordsForRanking(_jstStart(todayStr), _jstEnd(todayStr)).then(({ data }) => {
        setSupaTodayRecords(data);
      });
    };
    load();
    const timer = setInterval(load, 60 * 1000);
    return () => clearInterval(timer);
  }, [todayStr]);

  // Build team map
  const teamMap = {};
  members.forEach(m => { teamMap[m.name] = m.team ? (m.team + "チーム") : "営業統括"; });

  const CEO_STATUSES = new Set(['社長再コール', 'アポ獲得', '社長お断り']);
  const APPO_STATUSES = new Set(['アポ獲得']);

  // === Call Ranking (period) ===
  const callByCaller = {};
  supaRecords.forEach(r => {
    const key = r.getter_name || '不明';
    if (!callByCaller[key]) callByCaller[key] = { total: 0, ceoConnect: 0, appo: 0 };
    callByCaller[key].total += Number(r.total) || 0;
    callByCaller[key].ceoConnect += Number(r.ceo_connect) || 0;
    callByCaller[key].appo += Number(r.appo) || 0;
  });

  const callIndiv = Object.entries(callByCaller).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
  const callIndivRanked = callIndiv.map((item, idx) => ({
    ...item,
    rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
    _rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
  }));
  // team aggregation for calls
  const callByTeam = {};
  supaRecords.forEach(r => {
    const tn = teamMap[r.getter_name] || 'その他';
    if (!callByTeam[tn]) callByTeam[tn] = { total: 0, ceoConnect: 0, appo: 0 };
    callByTeam[tn].total += Number(r.total) || 0;
    callByTeam[tn].ceoConnect += Number(r.ceo_connect) || 0;
    callByTeam[tn].appo += Number(r.appo) || 0;
  });
  const callTeamRank = Object.entries(callByTeam).sort((a, b) => b[1].total - a[1].total);

  // === Sales Ranking (appoData unchanged) ===
  const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
  const salesFiltered = (appoData || []).filter(a => {
    if (!countableStatuses.has(a.status)) return false;
    const d = a.meetDate || a.appoDate || "";
    return inPeriod(d, salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth);
  });
  // team sales
  const salesByTeam = {};
  salesFiltered.forEach(a => {
    const tn = teamMap[a.getter] || "その他";
    if (!salesByTeam[tn]) salesByTeam[tn] = { total: 0, count: 0 };
    salesByTeam[tn].total += a.sales || 0;
    salesByTeam[tn].count++;
  });
  const salesTeamRank = Object.entries(salesByTeam).sort((a, b) => b[1].total - a[1].total);
  // individual sales
  const salesByIndiv = {};
  salesFiltered.forEach(a => {
    if (!salesByIndiv[a.getter]) salesByIndiv[a.getter] = { total: 0, reward: 0, count: 0 };
    salesByIndiv[a.getter].total += a.sales || 0;
    salesByIndiv[a.getter].reward += a.reward || 0;
    salesByIndiv[a.getter].count++;
  });
  const salesIndivRank = Object.entries(salesByIndiv).sort((a, b) => b[1].total - a[1].total);
  const maxIndivSales = salesIndivRank.length > 0 ? salesIndivRank[0][1].total : 1;

  // === Today realtime ranking ===
  const todayByCaller = {};
  supaTodayRecords.forEach(r => {
    const key = r.getter_name || '不明';
    todayByCaller[key] = {
      total: Number(r.total) || 0,
      ceoConnect: Number(r.ceo_connect) || 0,
      appo: 0,
      sales: todayByCaller[key]?.sales || 0,
    };
  });
  // Add today's appo count and sales from appoData (getter = アポ取得者 を正しく反映)
  const countableToday = new Set(["面談済", "事前確認済", "アポ取得"]);
  (appoData || []).forEach(a => {
    // アポ取得数：今日取得したアポ（キャンセル除く）をアポ取得者にカウント
    const gd = (a.getDate || '').slice(0, 10);
    if (gd === todayStr && a.status !== 'キャンセル') {
      const key = a.getter || "不明";
      if (!todayByCaller[key]) todayByCaller[key] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
      todayByCaller[key].appo++;
    }
    // 売上：countableStatusesかつ取得日または面談日が今日
    if (!countableToday.has(a.status)) return;
    const d = a.getDate || a.meetDate || "";
    if (d.slice(0, 10) !== todayStr) return;
    const key = a.getter || "不明";
    if (!todayByCaller[key]) todayByCaller[key] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
    todayByCaller[key].sales += (a.sales || 0);
  });
  const todayRank = Object.entries(todayByCaller).map(([name, d]) => ({ name, ...d }));
  const rankByTotal = [...todayRank].sort((a, b) => b.total - a.total);
  const rankByCeo = [...todayRank].sort((a, b) => b.ceoConnect - a.ceoConnect);
  const rankByAppo = [...todayRank].sort((a, b) => b.appo - a.appo);
  const rankBySales = [...todayRank].sort((a, b) => b.sales - a.sales);

  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();
      if (nowMs - lastNotifTime.current < 29 * 60 * 1000) return;
      lastNotifTime.current = nowMs;
      const topCall = rankByTotal[0]; const topCeo = rankByCeo[0]; const topAppo = rankByAppo[0];
      if (!topCall) return;
      setNotification({
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        callChamp: topCall ? topCall.name + "（" + topCall.total + "件）" : "-",
        ceoChamp: topCeo && topCeo.ceoConnect > 0 ? topCeo.name + "（" + topCeo.ceoConnect + "件）" : "-",
        appoChamp: topAppo && topAppo.appo > 0 ? topAppo.name + "（" + topAppo.appo + "件）" : "-",
      });
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [supaTodayRecords.length]);

  // === Shared UI components ===
  const inputStyle = {
    padding: "6px 10px", borderRadius: 5, background: C.white, border: "1px solid " + C.border,
    color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none",
  };
  const tabBtn = (active, color) => ({
    padding: "5px 12px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Noto Sans JP'", border: "1px solid " + (active ? color : C.border),
    background: active ? color : C.white, color: active ? C.white : C.textMid,
  });
  const monthSelectStyle = {
    padding: "3px 6px", borderRadius: 4, border: "1px solid " + C.border,
    fontSize: 11, color: C.textDark, outline: "none", fontFamily: "'Noto Sans JP'",
  };
  const periodSelector = (period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, selectedMonth, setSelectedMonth, accent) => (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {[["week", "週"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
        <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k, accent)}>{l}</button>
      ))}
      {period === "month" && (
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={monthSelectStyle}>
          {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
        </select>
      )}
      {period === "custom" && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={monthSelectStyle}>
            <option value="">開始月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
          <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={monthSelectStyle}>
            <option value="">終了月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
  const rankBadge = (rank) => ({
    width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: rank <= 3 ? 12 : 9, fontWeight: 700, flexShrink: 0,
    background: rank === 1 ? C.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#cd7f32" : C.offWhite,
    color: rank <= 3 ? C.white : C.textLight,
    border: rank <= 3 ? "none" : "1px solid " + C.borderLight,
  });

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* 30-min Notification Banner */}
      {notification && (
        <div style={{
          background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: 10, padding: "14px 20px", marginBottom: 16,
          color: C.white, position: "relative", animation: "slideIn 0.4s ease",
        }}>
          <button onClick={() => setNotification(null)} style={{ position: "absolute", top: 8, right: 12, background: "transparent", border: "none", color: C.white + "80", cursor: "pointer", fontSize: 14 }}>×</button>
          <div style={{ fontSize: 10, color: C.goldLight, marginBottom: 6 }}>🏆 {notification.time} 時点のランキング速報</div>
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            <span>📞 架電1位: <b style={{ color: C.goldLight }}>{notification.callChamp}</b></span>
            <span>👔 接続1位: <b style={{ color: C.goldLight }}>{notification.ceoChamp}</b></span>
            <span>🎯 アポ1位: <b style={{ color: C.goldLight }}>{notification.appoChamp}</b></span>
          </div>
        </div>
      )}

      {/* ============ REALTIME TODAY RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 20,
        border: "1px solid " + C.gold + "30", boxShadow: "0 2px 8px " + C.gold + "10",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>本日のリアルタイムランキング</span>
          <span style={{ fontSize: 10, color: C.textLight }}>{supaTodayRecords.reduce((s, r) => s + Number(r.total), 0)}件の架電</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {[
            { title: "架電件数", data: rankByTotal, key: "total", emoji: "📞" },
            { title: "社長接続", data: rankByCeo, key: "ceoConnect", emoji: "👔" },
            { title: "アポ取得", data: rankByAppo, key: "appo", emoji: "🎯" },
            { title: "売上", data: rankBySales, key: "sales", emoji: "💰", fmt: "money" },
          ].map((cat) => (
            <div key={cat.key} style={{ background: C.offWhite, borderRadius: 8, overflow: "hidden", border: "1px solid " + C.borderLight }}>
              <div style={{ padding: "8px 12px", background: C.navy + "08", fontSize: 11, fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>
                {cat.emoji} {cat.title}
              </div>
              {cat.data.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: C.textLight }}>データなし</div>
              ) : cat.data.map((p, i) => {
                const isFirst = i === 0 && p[cat.key] > 0;
                return (
                  <div key={p.name} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                    background: isFirst ? C.gold + "12" : "transparent",
                    borderBottom: "1px solid " + C.borderLight + "60",
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: isFirst ? 12 : 9, fontWeight: 700, flexShrink: 0,
                      background: isFirst ? C.gold : C.offWhite, color: isFirst ? C.white : C.textLight,
                      border: isFirst ? "none" : "1px solid " + C.borderLight,
                    }}>{isFirst ? "👑" : i + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: isFirst ? 700 : 400, color: isFirst ? C.navy : C.textDark, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: isFirst ? C.gold : C.navy }}>
                      {cat.fmt === "money" ? (p[cat.key] / 10000).toFixed(1) + "万" : p[cat.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ============ CALL RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "18px 20px", marginBottom: 20,
        border: "1px solid " + C.borderLight, boxShadow: "0 2px 8px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📞</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>架電ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>({supaRecords.reduce((s, r) => s + Number(r.total), 0)}件)</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {periodSelector(callPeriod, setCallPeriod, callCustomFrom, setCallCustomFrom, callCustomTo, setCallCustomTo, callSelectedMonth, setCallSelectedMonth, C.navy)}
            <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}></div>
            {["team", "individual", "chart"].map(t => (
              <button key={t} onClick={() => setCallTab(t)} style={tabBtn(callTab === t, C.navy)}>
                {t === "team" ? "チーム別" : t === "individual" ? "個人別" : "グラフ"}
              </button>
            ))}
          </div>
        </div>

        {/* Call - Team */}
        {callTab === "team" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5E5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.8fr 0.8fr 0.8fr", padding: "8px 16px", background: "#F3F2F2", fontSize: 11, fontWeight: 700, color: "#706E6B", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "2px solid #E5E5E5" }}>
              <span>#</span><span>チーム</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callTeamRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callTeamRank.map(([tn, d], idx) => (
              <div key={tn} style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.8fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center", borderBottom: "1px solid #F3F2F2", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "#EAF4FF"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.textDark }}>{d.total}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.textDark }}>{d.ceoConnect}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{d.appo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Call - Individual */}
        {callTab === "individual" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5E5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 0.8fr 0.8fr 0.8fr", padding: "8px 16px", background: "#F3F2F2", fontSize: 11, fontWeight: 700, color: "#706E6B", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "2px solid #E5E5E5" }}>
              <span>#</span><span>名前</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callIndivRanked.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callIndivRanked.map((p, idx) => {
              const isMe = p.name === currentUser;
              return (
                <div key={p.name} style={{
                  display: "grid", gridTemplateColumns: "36px 1.2fr 0.8fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center",
                  borderBottom: "1px solid #F3F2F2", background: isMe ? C.navy + "08" : "transparent",
                  borderLeft: isMe ? "3px solid " + C.navy : "3px solid transparent",
                }}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                  <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{p.name}{isMe ? " ★" : ""}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.total}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.ceoConnect}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{p.appo}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Call - Chart */}
        {callTab === "chart" && (
          <div style={{ borderRadius: 8, border: "1px solid " + C.borderLight, padding: "16px 14px" }}>
            {callIndivRanked.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : callIndivRanked.map((p, idx) => {
              const maxVal = callIndivRanked[0]?.total || 1;
              return (
                <div key={p.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: "right", color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ height: 18, borderRadius: 3, background: "linear-gradient(90deg, " + C.navy + ", " + C.navyLight + ")", width: Math.max(p.total / maxVal * 100, 2) + "%", transition: "width 0.4s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
                        {p.total / maxVal > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{p.total}</span>}
                      </div>
                      <span style={{ fontSize: 9, color: C.textMid, whiteSpace: "nowrap" }}>{p.total}件 / 接続{p.ceoConnect} / アポ{p.appo}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ SALES RANKING ============ */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "18px 20px", marginBottom: 20,
        border: "1px solid " + C.borderLight, boxShadow: "0 2px 8px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>💰</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>売上ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>（有効ステータスのみ / {salesFiltered.length}件）</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {periodSelector(salesPeriod, setSalesPeriod, salesCustomFrom, setSalesCustomFrom, salesCustomTo, setSalesCustomTo, salesSelectedMonth, setSalesSelectedMonth, C.gold)}
            <div style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }}></div>
            {["team", "individual", "chart"].map(t => (
              <button key={t} onClick={() => setSalesTab(t)} style={tabBtn(salesTab === t, C.gold)}>
                {t === "team" ? "チーム別" : t === "individual" ? "個人別" : "グラフ"}
              </button>
            ))}
          </div>
        </div>

        {/* Sales - Team */}
        {salesTab === "team" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5E5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.6fr 1fr", padding: "8px 16px", background: "#F3F2F2", fontSize: 11, fontWeight: 700, color: "#706E6B", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "2px solid #E5E5E5" }}>
              <span>#</span><span>チーム</span><span>件数</span><span>売上</span>
            </div>
            {salesTeamRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesTeamRank.map(([tn, d], idx) => (
              <div key={tn} style={{ display: "grid", gridTemplateColumns: "36px 1.5fr 0.6fr 1fr", padding: "10px 16px", fontSize: 12, alignItems: "center", borderBottom: "1px solid #F3F2F2", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "#EAF4FF"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万円</span></span>
              </div>
            ))}
          </div>
        )}

        {/* Sales - Individual */}
        {salesTab === "individual" && (
          <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #E5E5E5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "36px 1.2fr 0.6fr 0.8fr 0.8fr", padding: "8px 16px", background: "#F3F2F2", fontSize: 11, fontWeight: 700, color: "#706E6B", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "2px solid #E5E5E5" }}>
              <span>#</span><span>名前</span><span>件数</span><span>売上</span><span>報酬</span>
            </div>
            {salesIndivRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesIndivRank.map(([name, d], idx) => {
              const isMe = name === currentUser;
              return (
                <div key={name} style={{
                  display: "grid", gridTemplateColumns: "36px 1.2fr 0.6fr 0.8fr 0.8fr", padding: "10px 16px", fontSize: 12, alignItems: "center",
                  borderBottom: "1px solid #F3F2F2", background: isMe ? C.gold + "08" : "transparent",
                  borderLeft: isMe ? "3px solid " + C.gold : "3px solid transparent",
                }}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? "👑" : idx + 1}</span>
                  <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{name}{isMe ? " ★" : ""}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, color: C.green }}>{(d.reward / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                </div>
              );
            })}
          </div>
        )}

        {/* Sales - Chart */}
        {salesTab === "chart" && (
          <div style={{ borderRadius: 8, border: "1px solid " + C.borderLight, padding: "16px 14px" }}>
            {salesIndivRank.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textLight, fontSize: 12 }}>データなし</div>
            ) : salesIndivRank.map(([name, d], idx) => {
              const barMax = maxIndivSales > 0 ? maxIndivSales : 1;
              return (
                <div key={name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: "right", color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ height: 18, borderRadius: 3, background: "linear-gradient(90deg, " + C.gold + ", " + C.goldLight + ")", width: Math.max(d.total / barMax * 100, 2) + "%", transition: "width 0.4s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
                        {d.total / barMax > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{d.count}件</span>}
                      </div>
                      <span style={{ fontSize: 9, color: C.gold, fontWeight: 700, whiteSpace: "nowrap" }}>{(d.total / 10000).toFixed(1)}万</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
