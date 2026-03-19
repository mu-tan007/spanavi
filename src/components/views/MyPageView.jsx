import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { getProfileImageUrl, uploadProfileImage, updateMemberAvatarUrl, fetchMyCallRecords, updateMember, fetchMemberPayrollHistory } from '../../lib/supabaseWrite';
import TrainingRoleplaySection from './TrainingRoleplaySection';

export default function MyPageView({ currentUser, userId, callListData, members, now, appoData, onDataRefetch, isAdmin = false }) {
  const [periodTab, setPeriodTab] = useState("daily"); // daily, weekly, monthly, cumulative
  const [trainingExpanded, setTrainingExpanded] = useState(true);
  const [profileImage, setProfileImage] = useState(() => getProfileImageUrl(userId));
  const [profileUploading, setProfileUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを再選択しても onChange が発火するようリセット
    if (!file) return;
    setProfileUploading(true);
    try {
      const { url, error } = await uploadProfileImage(userId, file);
      if (error) { alert('画像のアップロードに失敗しました'); return; }
      setProfileImage(url);
      await updateMemberAvatarUrl(currentUser, url);
      if (onDataRefetch) onDataRefetch();
    } finally {
      setProfileUploading(false); // 成功・失敗・例外いずれの場合も必ず解除
    }
  };

  // Supabaseから自分の架電レコードを全件取得
  const [myRecords, setMyRecords] = useState([]);
  const [myRecordsLoading, setMyRecordsLoading] = useState(true);
  const _jstDate = (isoStr) =>
    new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  useEffect(() => {
    setMyRecordsLoading(true);
    fetchMyCallRecords(currentUser).then(({ data }) => {
      setMyRecords((data || []).map(r => ({
        status: r.status,
        date: _jstDate(r.called_at),
      })));
      setMyRecordsLoading(false);
    });
  }, [currentUser]);

  const todayStr2 = now.toISOString().slice(0, 10);

  // Sales data from appoData for this user
  const mySales = useMemo(() => {
    const countable = new Set(["面談済", "事前確認済", "アポ取得"]);
    return (appoData || []).filter(a => a.getter === currentUser && countable.has(a.status)).map(a => ({
      sales: parseFloat(a.sales) || 0,
      date: a.getDate || "",
    }));
  }, [appoData, currentUser]);

  const salesAggregate = (salesList) => salesList.reduce((s, r) => s + r.sales, 0);

  // アポ取得数：call_records ではなく appointments テーブルの getter で判定
  const APPO_COUNTABLE = new Set(["面談済", "事前確認済", "アポ取得"]);
  const myAppoRecords = useMemo(() =>
    (appoData || []).filter(a => a.getter === currentUser && APPO_COUNTABLE.has(a.status)),
    [appoData, currentUser]
  );
  const appoCount = (dateFrom, dateTo) =>
    myAppoRecords.filter(a =>
      (!dateFrom || a.getDate >= dateFrom) && (!dateTo || a.getDate <= dateTo)
    ).length;

  // Aggregate by period（架電件数・社長接続数のみ call_records を使用）
  const MY_CEO_STATUSES = new Set(['社長再コール', 'アポ獲得', '社長お断り']);
  const aggregate = (records) => {
    let total = 0, ceoConnect = 0;
    records.forEach(r => {
      total++;
      if (MY_CEO_STATUSES.has(r.status)) ceoConnect++;
    });
    return { total, ceoConnect };
  };

  // Get week start (Monday)
  const getWeekStart = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString().slice(0, 10);
  };

  const todayAgg = aggregate(myRecords.filter(r => r.date === todayStr2));
  const thisWeekStart = getWeekStart(now);
  const weekAgg = aggregate(myRecords.filter(r => r.date >= thisWeekStart));
  const monthStart = todayStr2.slice(0, 7) + "-01";
  const monthAgg = aggregate(myRecords.filter(r => r.date >= monthStart));
  const cumAgg = aggregate(myRecords);

  // Sales aggregates by period
  const todaySalesVal = salesAggregate(mySales.filter(s => s.date === todayStr2));
  const weekSalesVal = salesAggregate(mySales.filter(s => s.date >= thisWeekStart));
  const monthSalesVal = salesAggregate(mySales.filter(s => s.date >= monthStart));
  const cumSalesVal = salesAggregate(mySales);

  // Daily breakdown for chart (last 14 days)
  const dailyData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayRecords = myRecords.filter(r => r.date === dateStr);
      const agg = aggregate(dayRecords);
      days.push({ date: dateStr, label: (d.getMonth() + 1) + "/" + d.getDate(), ...agg });
    }
    return days;
  }, [myRecords, todayStr2]);

  // Weekly breakdown (last 8 weeks)
  const weeklyData = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const ws = getWeekStart(d);
      const we = new Date(new Date(ws).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const weekRecords = myRecords.filter(r => r.date >= ws && r.date <= we);
      const agg = aggregate(weekRecords);
      weeks.push({ label: ws.slice(5) + "〜", ...agg });
    }
    return weeks;
  }, [myRecords, todayStr2]);

  // Monthly breakdown (last 6 months)
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ms = d.toISOString().slice(0, 7);
      const mRecords = myRecords.filter(r => r.date.startsWith(ms));
      const agg = aggregate(mRecords);
      months.push({ label: (d.getMonth() + 1) + "月", ...agg });
    }
    return months;
  }, [myRecords, todayStr2]);

  const chartData = periodTab === "daily" ? dailyData : periodTab === "weekly" ? weeklyData : periodTab === "monthly" ? monthlyData : [{ label: "累計", ...cumAgg }];
  const maxVal = Math.max(1, ...chartData.map(d => d.total));

  // Member info
  const memberInfo = members.find(m => m.name === currentUser);
  const [zoomPhone, setZoomPhone] = useState('');
  const [zoomPhoneEditing, setZoomPhoneEditing] = useState(false);
  const [zoomPhoneSaving, setZoomPhoneSaving] = useState(false);
  const [hoveredMonthRow, setHoveredMonthRow] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  // 確定済み報酬履歴（payroll_snapshots）
  const [payrollHistory, setPayrollHistory] = useState([]);
  useEffect(() => {
    if (!currentUser) return;
    fetchMemberPayrollHistory(currentUser).then(({ data }) => setPayrollHistory(data || []));
  }, [currentUser]);

  // PayrollView と同等の月次合計報酬計算
  // 確定済み月: snapshots.total_payout、未確定月: incentive + teamBonus をリアルタイム計算
  const PAYROLL_COUNTABLE_SET = useMemo(() => new Set(['アポ取得', '事前確認済', '面談済']), []);
  const calcPayrollTotal = useCallback((yyyymm) => {
    const snap = payrollHistory.find(s => s.pay_month === yyyymm);
    if (snap) return snap.total_payout;

    // リアルタイム計算
    const monthAppos = (appoData || []).filter(a => {
      const dk = (a.meetDate || a.getDate || '').slice(0, 7);
      return dk === yyyymm && PAYROLL_COUNTABLE_SET.has(a.status);
    });
    const memberMap = {};
    (members || []).forEach(m => { if (m?.name) memberMap[m.name] = m; });
    const teamSales = {};
    const byGetter = {};
    monthAppos.forEach(a => {
      const mem = memberMap[a.getter] || {};
      const team = mem.team || '';
      if (!byGetter[a.getter]) byGetter[a.getter] = { team, role: mem.role || '', incentive: 0, teamBonus: 0 };
      byGetter[a.getter].incentive += a.reward || 0;
      teamSales[team] = (teamSales[team] || 0) + (a.sales || 0);
    });
    (members || []).forEach(m => {
      if (!m?.name || !['チームリーダー', '副リーダー'].includes(m.role)) return;
      if (!byGetter[m.name]) byGetter[m.name] = { team: m.team || '', role: m.role, incentive: 0, teamBonus: 0 };
    });
    [...new Set(Object.values(byGetter).map(p => p.team))].forEach(team => {
      const pool = Math.round((teamSales[team] || 0) * 0.03);
      const tm = Object.values(byGetter).filter(p => p.team === team);
      const leaders = tm.filter(p => p.role === 'チームリーダー');
      const subs    = tm.filter(p => p.role === '副リーダー');
      leaders.forEach(p => { p.teamBonus = leaders.length ? Math.round(pool * 0.6 / leaders.length) : 0; });
      subs.forEach(p =>    { p.teamBonus = subs.length    ? Math.round(pool * 0.4 / subs.length)    : 0; });
    });
    const me = byGetter[currentUser];
    return me ? me.incentive + me.teamBonus : 0;
  }, [payrollHistory, appoData, members, currentUser, PAYROLL_COUNTABLE_SET]);

  // 累計報酬: 確定済み全月の合計 + 当月未確定分
  const cumulativePayroll = useMemo(() => {
    const confirmedMonths = new Set(payrollHistory.map(s => s.pay_month));
    const confirmed = payrollHistory.reduce((s, r) => s + r.total_payout, 0);
    const currentMonthStr = todayStr2.slice(0, 7);
    return confirmedMonths.has(currentMonthStr) ? confirmed : confirmed + calcPayrollTotal(currentMonthStr);
  }, [payrollHistory, calcPayrollTotal, todayStr2]);
  useEffect(() => {
    if (memberInfo?.zoomPhoneNumber !== undefined) setZoomPhone(memberInfo.zoomPhoneNumber || '');
  }, [memberInfo?.zoomPhoneNumber]);
  const handleSaveZoomPhone = async () => {
    if (!memberInfo?._supaId) return;
    setZoomPhoneSaving(true);
    await updateMember(memberInfo._supaId, { ...memberInfo, zoomPhoneNumber: zoomPhone.trim() });
    setZoomPhoneEditing(false);
    setZoomPhoneSaving(false);
    if (onDataRefetch) onDataRefetch();
  };

  // Training stages
  const trainingStages = [
    { id: "orientation", label: "オリエンテーション", desc: "会社紹介・事業理解", default: true },
    { id: "script_study", label: "スクリプト学習", desc: "架電トークの暗記・理解", default: true },
    { id: "roleplay1", label: "ロープレ①", desc: "受付突破ロープレ", default: false },
    { id: "roleplay2", label: "ロープレ②", desc: "社長対応ロープレ", default: false },
    { id: "roleplay3", label: "ロープレ③", desc: "切り返しロープレ", default: false },
    { id: "live_call", label: "実架電デビュー", desc: "OJTでの初架電", default: false },
    { id: "independent", label: "独り立ち", desc: "一人での架電開始", default: false },
  ];
  const completedCount = trainingStages.filter(s => s.default).length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Profile Header */}
      <div style={{
        background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: 12, padding: "24px 28px", marginBottom: 16,
        color: C.white, display: "flex", alignItems: "center", gap: 20,
      }}>
        <div
          onClick={() => !profileUploading && fileInputRef.current?.click()}
          title={profileUploading ? "アップロード中..." : "クリックして画像を変更"}
          style={{
            width: 56, height: 56, borderRadius: "50%", background: C.gold,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: C.navyDeep, flexShrink: 0,
            cursor: profileUploading ? "default" : "pointer", overflow: "hidden",
            opacity: profileUploading ? 0.6 : 1,
          }}
        >
          {profileUploading
            ? <span style={{ fontSize: 10, color: C.navyDeep }}>...</span>
            : profileImage
              ? <img src={profileImage} alt="profile" onError={() => setProfileImage(null)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
              : (currentUser || "?").charAt(0)
          }
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{currentUser}</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.goldLight, marginBottom: 6 }}>
            {memberInfo && <span>{memberInfo.team}</span>}
            {memberInfo && <span>{memberInfo.rank}</span>}
            <span>累計架電: {cumAgg.total}件</span>
            <span>累計アポ: {myAppoRecords.length}件</span>
          </div>
          {/* Zoom Phone番号 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Zoom Phone:</span>
            {zoomPhoneEditing ? (
              <>
                <input
                  value={zoomPhone}
                  onChange={e => setZoomPhone(e.target.value)}
                  placeholder="例: 0312345678"
                  style={{
                    padding: '3px 8px', borderRadius: 5, border: '1px solid ' + C.gold,
                    background: 'rgba(255,255,255,0.1)', color: C.white,
                    fontSize: 11, fontFamily: "'JetBrains Mono'", width: 140,
                  }}
                />
                <button onClick={handleSaveZoomPhone} disabled={zoomPhoneSaving} style={{
                  padding: '3px 8px', borderRadius: 5, border: 'none',
                  background: C.gold, color: C.navyDeep,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}>{zoomPhoneSaving ? '保存中...' : '保存'}</button>
                <button onClick={() => setZoomPhoneEditing(false)} style={{
                  padding: '3px 8px', borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent', color: 'rgba(255,255,255,0.6)',
                  fontSize: 10, cursor: 'pointer',
                }}>キャンセル</button>
              </>
            ) : (
              <>
                <span style={{ color: C.white, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>
                  {zoomPhone || '未設定'}
                </span>
                {isAdmin && (
                  <button onClick={() => setZoomPhoneEditing(true)} style={{
                    padding: '2px 7px', borderRadius: 4,
                    border: '1px solid ' + C.gold + '60',
                    background: 'transparent', color: C.gold,
                    fontSize: 9, cursor: 'pointer',
                  }}>編集</button>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "本日", val: todayAgg.total, sub: "件架電" },
            { label: "今週", val: weekAgg.total, sub: "件架電" },
            { label: "今月", val: appoCount(monthStart), sub: "件アポ" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "8px 14px", borderRadius: 8, background: C.white + "12" }}>
              <div style={{ fontSize: 9, color: C.goldLight, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono'" }}>{s.val}</div>
              <div style={{ fontSize: 8, color: C.white + "80" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Training Progress */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
        borderLeft: "3px solid " + C.gold,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>研修・ロープレ進捗</span>
        </div>
        <TrainingRoleplaySection
          currentUser={currentUser}
          userId={userId}
          members={members}
          isAdmin={isAdmin}
        />
      </div>

      {/* Performance Data */}
      <div style={{
        background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
        borderLeft: "3px solid " + C.gold,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>実績データ</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {[
              { id: "daily", label: "日別" },
              { id: "weekly", label: "週別" },
              { id: "monthly", label: "月別" },
              { id: "cumulative", label: "累計" },
            ].map(t => (
              <button key={t.id} onClick={() => setPeriodTab(t.id)} style={{
                padding: "5px 14px", borderRadius: 4,
                border: periodTab === t.id ? "1px solid " + C.navy : "1px solid " + C.borderLight,
                background: periodTab === t.id ? C.navy : "transparent",
                color: periodTab === t.id ? C.white : C.navy,
                fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Noto Sans JP'",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { label: "架電件数",  val: periodTab === "cumulative" ? cumAgg.total       : periodTab === "monthly" ? monthAgg.total       : periodTab === "weekly" ? weekAgg.total       : todayAgg.total },
            { label: "社長接続数", val: periodTab === "cumulative" ? cumAgg.ceoConnect  : periodTab === "monthly" ? monthAgg.ceoConnect  : periodTab === "weekly" ? weekAgg.ceoConnect  : todayAgg.ceoConnect },
            { label: "アポ取得数", val: periodTab === "cumulative" ? myAppoRecords.length : periodTab === "monthly" ? appoCount(monthStart) : periodTab === "weekly" ? appoCount(thisWeekStart) : appoCount(todayStr2, todayStr2) },
            { label: "売上",      val: periodTab === "cumulative" ? cumSalesVal         : periodTab === "monthly" ? monthSalesVal         : periodTab === "weekly" ? weekSalesVal         : todaySalesVal, isMoney: true },
          ].map((card, i) => {
            const key = "perf-" + i;
            const isHovered = hoveredCard === key;
            return (
              <div key={i}
                onMouseEnter={() => setHoveredCard(key)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  padding: "14px 16px", borderRadius: 8, textAlign: "center",
                  background: "#F8F9FA",
                  border: "1px solid #0D224715",
                  borderLeft: isHovered ? "3px solid " + C.gold : "1px solid #0D224715",
                  transition: "border 0.12s",
                }}
              >
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</div>
                <div style={{ fontSize: card.isMoney ? 18 : 28, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>
                  {card.isMoney ? Math.round(card.val).toLocaleString('ja-JP') + "円" : card.val}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar chart */}
        {periodTab !== "cumulative" && chartData.length > 1 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 8 }}>
              {periodTab === "daily" ? "過去14日間" : periodTab === "weekly" ? "過去8週間" : "過去6ヶ月"}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, padding: "0 4px" }}>
              {chartData.map((d, i) => {
                const h = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
                const isToday = d.date === todayStr2;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{d.total > 0 ? d.total : ""}</span>
                    <div style={{ position: "relative", width: "100%", maxWidth: 28 }}>
                      <div style={{
                        height: Math.max(2, h) + "%", minHeight: 2,
                        background: isToday ? "linear-gradient(180deg, " + C.gold + ", " + C.navy + ")" : d.appo > 0 ? C.gold : C.navy + "60",
                        borderRadius: "3px 3px 0 0", transition: "height 0.3s",
                      }}></div>
                      {d.ceoConnect > 0 && (
                        <div style={{
                          position: "absolute", bottom: 0, left: 0, right: 0,
                          height: (maxVal > 0 ? (d.ceoConnect / maxVal) * 100 : 0) + "%",
                          background: C.gold + "40", borderRadius: "0 0 0 0", minHeight: 1,
                        }}></div>
                      )}
                    </div>
                    <span style={{ fontSize: 7, color: isToday ? C.navy : C.textLight, fontWeight: isToday ? 700 : 400 }}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 9, color: C.textLight }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.navy + "60", marginRight: 3, verticalAlign: "middle" }}></span>架電数</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.gold + "40", marginRight: 3, verticalAlign: "middle" }}></span>社長接続</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.gold, marginRight: 3, verticalAlign: "middle" }}></span>アポ含む</span>
            </div>
          </div>
        )}
      </div>

      {/* Sales Data */}
      {(() => {
        const countableStatuses = new Set(["面談済", "事前確認済", "アポ取得"]);
        const myAppos = (appoData || []).filter(a => a.getter === currentUser && countableStatuses.has(a.status));

        const getSalesForPeriod = (appos) => {
          let count = 0, totalSales = 0, totalReward = 0;
          appos.forEach(a => {
            count++;
            totalSales += parseFloat(a.sales) || 0;
            totalReward += parseFloat(a.reward) || 0;
          });
          return { count, totalSales, totalReward };
        };

        const todaySales     = getSalesForPeriod(myAppos.filter(a => a.getDate === todayStr2));
        const thisWeekSales  = getSalesForPeriod(myAppos.filter(a => a.getDate >= thisWeekStart));
        const thisMonthSales = getSalesForPeriod(myAppos.filter(a => a.getDate >= monthStart));
        const cumSales       = getSalesForPeriod(myAppos);

        // インターン報酬 = PayrollView 合計支給額と一致させる
        // 今月・累計: snapshot（確定済）or リアルタイム計算（incentive + teamBonus）
        // 日別・週別: incentive のみ（teamBonus は月次概念のため）
        const payrollReward =
          periodTab === "cumulative" ? cumulativePayroll :
          periodTab === "monthly"    ? calcPayrollTotal(monthStart.slice(0, 7)) :
          periodTab === "weekly"     ? thisWeekSales.totalReward :
                                       todaySales.totalReward;

        const baseSales = periodTab === "cumulative" ? cumSales : periodTab === "monthly" ? thisMonthSales : periodTab === "weekly" ? thisWeekSales : todaySales;
        const currentSales = { ...baseSales, totalReward: payrollReward };

        return (
          <div style={{
            background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 16,
            border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
            borderLeft: "3px solid " + C.gold,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>売上データ</span>
              <span style={{ fontSize: 10, color: C.textLight }}>（有効ステータスのアポのみ）</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[
                { label: "アポ件数", val: currentSales.count, isCount: true },
                { label: "当社売上", val: Math.round(currentSales.totalSales).toLocaleString('ja-JP') + "円", isCount: false },
                { label: "インターン報酬", val: Math.round(currentSales.totalReward).toLocaleString('ja-JP') + "円", isCount: false },
              ].map((card, i) => {
                const key = "sales-" + i;
                const isHovered = hoveredCard === key;
                return (
                  <div key={i}
                    onMouseEnter={() => setHoveredCard(key)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      padding: "14px 16px", borderRadius: 8, textAlign: "center",
                      background: "#F8F9FA",
                      border: "1px solid #0D224715",
                      borderLeft: isHovered ? "3px solid " + C.gold : "1px solid #0D224715",
                      transition: "border 0.12s",
                    }}
                  >
                    <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</div>
                    <div style={{ fontSize: card.isCount ? 28 : 20, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: C.navy }}>
                      {card.val}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Monthly breakdown table */}
            {myAppos.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6 }}>月別推移</div>
                <div style={{
                  display: "grid", gridTemplateColumns: "60px repeat(3, 1fr)", gap: 0,
                  background: C.navy + "08", borderRadius: 6, overflow: "hidden", fontSize: 10,
                }}>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, borderBottom: "1px solid " + C.borderLight }}>月</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>件数</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>売上</div>
                  <div style={{ padding: "6px 10px", fontWeight: 700, color: C.navy, textAlign: "right", borderBottom: "1px solid " + C.borderLight }}>報酬</div>
                  {(() => {
                    const monthMap = {};
                    myAppos.forEach(a => {
                      const m = (a.getDate || "").slice(0, 7);
                      if (!m) return;
                      if (!monthMap[m]) monthMap[m] = { count: 0, sales: 0 };
                      monthMap[m].count++;
                      monthMap[m].sales += parseFloat(a.sales) || 0;
                    });
                    // 確定済みスナップショットがある月も含める
                    payrollHistory.forEach(s => {
                      if (!monthMap[s.pay_month]) monthMap[s.pay_month] = { count: 0, sales: 0 };
                    });
                    return Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).map(([m, d]) => {
                      const d2 = { ...d, reward: calcPayrollTotal(m) };
                      const isHovered = hoveredMonthRow === m;
                      const rowBg = isHovered ? C.navy + "08" : C.white;
                      const rowBorderLeft = isHovered ? "3px solid " + C.gold : "3px solid transparent";
                      const cellBase = { padding: "5px 10px", background: rowBg, borderBottom: "1px solid " + C.borderLight + "60", borderLeft: rowBorderLeft, transition: "background 0.1s, border-color 0.1s" };
                      return (
                        <React.Fragment key={m}>
                          <div
                            onMouseEnter={() => setHoveredMonthRow(m)}
                            onMouseLeave={() => setHoveredMonthRow(null)}
                            style={{ ...cellBase, fontWeight: 600, color: C.navy }}
                          >{m.slice(5)}月</div>
                          <div
                            onMouseEnter={() => setHoveredMonthRow(m)}
                            onMouseLeave={() => setHoveredMonthRow(null)}
                            style={{ ...cellBase, borderLeft: "none", textAlign: "right", fontFamily: "'JetBrains Mono'" }}
                          >{d2.count}</div>
                          <div
                            onMouseEnter={() => setHoveredMonthRow(m)}
                            onMouseLeave={() => setHoveredMonthRow(null)}
                            style={{ ...cellBase, borderLeft: "none", textAlign: "right", fontFamily: "'JetBrains Mono'", color: C.navy, fontWeight: 600 }}
                          >{Math.round(d2.sales).toLocaleString('ja-JP')}円</div>
                          <div
                            onMouseEnter={() => setHoveredMonthRow(m)}
                            onMouseLeave={() => setHoveredMonthRow(null)}
                            style={{ ...cellBase, borderLeft: "none", textAlign: "right", fontFamily: "'JetBrains Mono'", color: C.navy, fontWeight: 600 }}
                          >{Math.round(d2.reward).toLocaleString('ja-JP')}円</div>
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
