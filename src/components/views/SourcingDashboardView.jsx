import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useEngagements } from '../../hooks/useEngagements';
import { useKpiGoals, KPI_TYPES, PERIOD_TYPES } from '../../hooks/useKpiGoals';
import { supabase } from '../../lib/supabase';
import PageHeader from '../common/PageHeader';
import PushNotificationBanner from '../dashboard/PushNotificationBanner';
import { useUrlState } from '../../hooks/useUrlState';

const APPO_COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);

// ============================================================
// ヘルパ
// ============================================================
const toJSTDate = (isoStr) =>
  new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const getWeekStart = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff)).toISOString().slice(0, 10);
};

const fmtYen = (v) => Math.round(v || 0).toLocaleString('ja-JP') + '円';
const fmtNum = (v) => Math.round(v || 0).toLocaleString('ja-JP');
const fmtPct = (v) => (v == null || Number.isNaN(v)) ? '—' : Math.round(v) + '%';
const progressPct = (actual, goal) => (goal > 0 ? (actual / goal) * 100 : 0);

// 土日除く稼働日数（from〜to を両端含む）。祝日は未対応（必要になれば holiday-jp 導入検討）
const businessDaysBetween = (fromYmd, toYmd) => {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return 0;
  const from = new Date(`${fromYmd}T00:00:00+09:00`);
  const to = new Date(`${toYmd}T00:00:00+09:00`);
  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

const monthEndYmd = (anyYmd) => {
  const d = new Date(`${anyYmd}T00:00:00+09:00`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
};

// scope は常に 'member' 固定（チーム/組織集計はアナリティクス画面に移管）
const getMemberNamesForScope = (scope) => (scope?.name ? [scope.name] : []);

// ============================================================
// メイン
// ============================================================
export default function SourcingDashboardView({
  currentUser, userId, members, now, appoData, isAdmin,
}) {
  const isMobile = useIsMobile();
  const { currentEngagement } = useEngagements();
  const engagementId = currentEngagement?.id;

  const myMember = useMemo(() => (members || []).find(m => m.name === currentUser) || null, [members, currentUser]);
  const myRole = myMember?.role || '';
  const isTeamLeader = myRole === 'チームリーダー';

  // ---- スコープ：常にメンバー単位（チーム/組織はアナリティクスに移管） ----
  // 一般メンバー = 自分固定、チームリーダー = 自チームから選択、篠宮 = 全員から選択
  const canSwitchMember = isAdmin || isTeamLeader;

  const selectableMembers = useMemo(() => {
    if (!members) return [];
    if (isAdmin) return members.slice().sort((a, b) => (a.no || 0) - (b.no || 0));
    if (isTeamLeader && myMember?.team) {
      return members
        .filter(m => m.team === myMember.team)
        .sort((a, b) => (a.no || 0) - (b.no || 0));
    }
    return myMember ? [myMember] : [];
  }, [members, isAdmin, isTeamLeader, myMember]);

  const [viewMember, setViewMember] = useUrlState('dashViewMember', currentUser);
  // 選択中メンバーが selectableMembers に含まれなくなった場合（権限切替等）は自分に戻す
  useEffect(() => {
    if (!selectableMembers.length) return;
    if (!selectableMembers.some(m => m.name === viewMember)) {
      setViewMember(currentUser);
    }
  }, [selectableMembers, viewMember, currentUser, setViewMember]);

  const scope = useMemo(() => {
    const target = (members || []).find(m => m.name === viewMember) || myMember;
    return {
      type: 'member',
      id: target?._supaId || null,
      name: target?.name || currentUser,
    };
  }, [members, viewMember, myMember, currentUser]);

  const isViewingSelf = scope.name === currentUser;

  // 目標を入力できる権限判定（このスコープについて）
  // 自分の目標 = 常に編集可、他人の目標 = 篠宮 or 同チームのチームリーダーのみ
  const canEditGoal = useMemo(() => {
    if (isViewingSelf) return true;
    if (isAdmin) return true;
    if (isTeamLeader) {
      const target = (members || []).find(m => m.name === scope.name);
      return target?.team === myMember?.team;
    }
    return false;
  }, [isViewingSelf, isAdmin, isTeamLeader, members, myMember, scope.name]);

  // ---- KPI 目標 ----
  const { goals, upsertGoal, refresh: refreshGoals } = useKpiGoals({
    engagementId,
    scopeType: 'member',
    scopeId: scope.id,
  });

  const goalMap = useMemo(() => {
    const map = {};
    (goals || []).forEach(g => {
      const k = `${g.kpi_type}_${g.period_type}`;
      const prev = map[k];
      if (!prev || g.effective_from > prev.effective_from) map[k] = g;
    });
    return map;
  }, [goals]);

  const getGoal = (kpi, period) => goalMap[`${kpi}_${period}`]?.target_value ?? 0;

  // ---- 実績データ取得 ----
  const todayStr = toJSTDate(now.toISOString());
  const weekStart = getWeekStart(now);
  const monthStart = todayStr.slice(0, 7) + '-01';

  const [ranking, setRanking] = useState({ today: [], week: [], month: [] });
  useEffect(() => {
    if (!engagementId) return;
    const load = async () => {
      const fetchRange = async (from, to) => {
        const { data } = await supabase.rpc('get_call_ranking', { from_iso: from, to_iso: to });
        return data || [];
      };
      const startOfDay = (d) => `${d}T00:00:00+09:00`;
      const endOfDay   = (d) => `${d}T23:59:59+09:00`;
      const [today, week, month] = await Promise.all([
        fetchRange(startOfDay(todayStr), endOfDay(todayStr)),
        fetchRange(startOfDay(weekStart), endOfDay(todayStr)),
        fetchRange(startOfDay(monthStart), endOfDay(todayStr)),
      ]);
      setRanking({ today, week, month });
    };
    load();
  }, [engagementId, todayStr, weekStart, monthStart]);

  const aggScope = useCallback((rankingRows) => {
    const filtered = (rankingRows || []).filter(r => r.getter_name === scope.name);
    const total = filtered.reduce((s, r) => s + Number(r.total || 0), 0);
    const keymanConnect = filtered.reduce((s, r) => s + Number(r.keyman_connect || 0), 0);
    const appo = filtered.reduce((s, r) => s + Number(r.appo || 0), 0);
    return { total, keymanConnect, appo };
  }, [scope.name]);

  const todayAgg = useMemo(() => aggScope(ranking.today), [ranking.today, aggScope]);
  const weekAgg = useMemo(() => aggScope(ranking.week), [ranking.week, aggScope]);
  const monthAgg = useMemo(() => aggScope(ranking.month), [ranking.month, aggScope]);

  // アポ・売上・インセンティブ
  const scopedAppos = useMemo(() => {
    return (appoData || []).filter(a => APPO_COUNTABLE.has(a.status) && a.getter === scope.name);
  }, [appoData, scope.name]);

  // クライアント開拓リスト由来のアポは売上集計から除外（件数は残す）
  const salesInPeriod = (from, to) =>
    scopedAppos.filter(a => (!from || a.getDate >= from) && (!to || a.getDate <= to))
      .reduce((s, a) => s + (a.isProspecting ? 0 : (parseFloat(a.sales) || 0)), 0);

  const weekSales = useMemo(() => salesInPeriod(weekStart, todayStr), [scopedAppos, weekStart, todayStr]);
  const monthSales = useMemo(() => salesInPeriod(monthStart, todayStr), [scopedAppos, monthStart, todayStr]);

  // インセンティブ（個人視点なので reward 合計のみ、team bonus は集計しない）
  const calcIncentive = (from, to) => {
    return scopedAppos
      .filter(a => (!from || a.getDate >= from) && (!to || a.getDate <= to))
      .reduce((s, a) => s + (parseFloat(a.reward) || 0), 0);
  };

  const weekIncentive = useMemo(() => calcIncentive(weekStart, todayStr), [scopedAppos, weekStart, todayStr]);
  const monthIncentive = useMemo(() => calcIncentive(monthStart, todayStr), [scopedAppos, monthStart, todayStr]);

  // ---- 月次着地予測 ＆ 本日中の必要追加件数 ----
  // 経過稼働日（月初〜今日 両端含む）・残営業日（今日〜月末 両端含む）
  const elapsedBizDays = useMemo(() => businessDaysBetween(monthStart, todayStr), [monthStart, todayStr]);
  const remainingBizDays = useMemo(() => businessDaysBetween(todayStr, monthEndYmd(todayStr)), [todayStr]);

  // 月末着地予測: 経過稼働日の平均ペース × 全稼働日数
  const forecast = useCallback((monthActual) => {
    if (elapsedBizDays <= 0) return null;
    const totalBizDays = elapsedBizDays + remainingBizDays - 1; // today を二重計上しないため -1
    if (totalBizDays <= 0) return monthActual;
    return Math.round((monthActual / elapsedBizDays) * totalBizDays);
  }, [elapsedBizDays, remainingBizDays]);

  // 本日中に必要な追加件数: ceil((目標 - 月実績) / 残日数) - 本日実績
  const requiredToday = useCallback((monthActual, monthGoal, todayActual) => {
    if (monthGoal <= 0) return null;            // 目標未設定
    const remaining = monthGoal - monthActual;
    if (remaining <= 0) return 0;               // 月次目標達成済み
    if (remainingBizDays <= 0) return remaining; // 月末当日は残全部
    const perDayNeeded = Math.ceil(remaining / remainingBizDays);
    return Math.max(0, perDayNeeded - todayActual);
  }, [remainingBizDays]);

  // ---- 目標入力モーダル ----
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // 週次・月次 進捗率の表示切替（'both' / 'weekly' / 'monthly'）
  const [progressPeriodFilter, setProgressPeriodFilter] = useState('both');

  const saveGoals = async (entries) => {
    for (const e of entries) {
      if (e.value == null || e.value === '') continue;
      await upsertGoal({
        kpi_type: e.kpi_type,
        period_type: e.period_type,
        target_value: Number(e.value),
        effective_from: todayStr.slice(0, 7) + '-01',
      });
    }
    await refreshGoals();
    setGoalModalOpen(false);
  };

  // ============================================================
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="ダッシュボード"
        description={isViewingSelf ? '現在地と次の一手' : `${scope.name} の現状`}
        right={canSwitchMember && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: font.size.xs, color: color.textLight, whiteSpace: 'nowrap' }}>表示中:</span>
            <Select
              size="sm"
              fullWidth={false}
              value={viewMember}
              onChange={e => setViewMember(e.target.value)}
              options={selectableMembers.map(m => ({ value: m.name, label: m.name }))}
              containerStyle={{ width: 180 }}
            />
          </div>
        )}
        style={{ marginBottom: 24 }}
      />

      <PushNotificationBanner userId={userId} />

      {/* ① 月次進捗 (Hero) — 5指標 × (実績/目標/達成率/月末着地予測) */}
      <Card padding="md" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>
              {todayStr.slice(5, 7)}月の進捗
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2, fontFamily: font.family.mono }}>
              経過 {elapsedBizDays}営業日 / 残り {Math.max(0, remainingBizDays - 1)}営業日
            </div>
          </div>
          {canEditGoal && (
            <Button size="sm" onClick={() => setGoalModalOpen(true)}>目標入力</Button>
          )}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)',
          gap: 12,
        }}>
          <MonthlyCard label="架電件数"      actual={monthAgg.total}        goal={getGoal('calls', 'monthly')}         unit="件" forecast={forecast(monthAgg.total)} />
          <MonthlyCard label="キーマン接続"  actual={monthAgg.keymanConnect} goal={getGoal('connections', 'monthly')}   unit="件" forecast={forecast(monthAgg.keymanConnect)} />
          <MonthlyCard label="アポ獲得"      actual={monthAgg.appo}         goal={getGoal('appointments', 'monthly')}   unit="件" forecast={forecast(monthAgg.appo)} />
          <MonthlyCard label="売上"          actual={monthSales}            goal={getGoal('sales', 'monthly')}          unit=""   forecast={forecast(monthSales)} money />
          <MonthlyCard label="インセンティブ" actual={monthIncentive}        goal={getGoal('incentive', 'monthly')}      unit=""   forecast={forecast(monthIncentive)} money />
        </div>
      </Card>

      {/* 本日の積み上げ ＋ 本日中に必要な追加件数 */}
      <Card padding="md" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy, marginBottom: 12 }}>
          本日の積み上げ
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12, marginBottom: 14,
        }}>
          <TodayCard label="架電件数"      actual={todayAgg.total}        goal={getGoal('calls', 'daily')}         unit="件" />
          <TodayCard label="キーマン接続数" actual={todayAgg.keymanConnect} goal={getGoal('connections', 'daily')}   unit="件" />
          <TodayCard label="アポ獲得数"    actual={todayAgg.appo}          goal={getGoal('appointments', 'daily')}  unit="件" />
        </div>
        <RequiredTodayPanel
          rows={[
            { label: '架電',         required: requiredToday(monthAgg.total,         getGoal('calls', 'monthly'),        todayAgg.total),         unit: '件' },
            { label: 'キーマン接続', required: requiredToday(monthAgg.keymanConnect, getGoal('connections', 'monthly'),  todayAgg.keymanConnect), unit: '件' },
            { label: 'アポ獲得',     required: requiredToday(monthAgg.appo,          getGoal('appointments', 'monthly'), todayAgg.appo),          unit: '件' },
          ]}
        />
      </Card>

      {/* 週次・月次 進捗 */}
      <Card padding="md" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>週次・月次 進捗率</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[{ id: 'both', label: '両方' }, { id: 'weekly', label: '週次' }, { id: 'monthly', label: '月次' }].map(opt => {
              const active = progressPeriodFilter === opt.id;
              return (
                <button key={opt.id} type="button"
                  onClick={() => setProgressPeriodFilter(opt.id)}
                  style={{
                    padding: '4px 12px', fontSize: font.size.xs,
                    background: active ? color.navy : color.white,
                    color: active ? color.white : color.textMid,
                    border: `1px solid ${active ? color.navy : color.border}`,
                    borderRadius: radius.sm, cursor: 'pointer',
                    fontWeight: active ? font.weight.semibold : font.weight.normal,
                    fontFamily: font.family.sans,
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        </div>
        <ProgressTable
          periods={(() => {
            const all = [
              { id: 'weekly', label: '週次' },
              { id: 'monthly', label: '月次' },
            ];
            if (progressPeriodFilter === 'weekly')  return all.filter(p => p.id === 'weekly');
            if (progressPeriodFilter === 'monthly') return all.filter(p => p.id === 'monthly');
            return all;
          })()}
          rows={[
            { kpi: 'calls', label: '架電件数', weekActual: weekAgg.total, monthActual: monthAgg.total, money: false },
            { kpi: 'connections', label: 'キーマン接続数', weekActual: weekAgg.keymanConnect, monthActual: monthAgg.keymanConnect, money: false },
            { kpi: 'appointments', label: 'アポ獲得数', weekActual: weekAgg.appo, monthActual: monthAgg.appo, money: false },
            { kpi: 'sales', label: '売上', weekActual: weekSales, monthActual: monthSales, money: true },
            { kpi: 'incentive', label: 'インセンティブ', weekActual: weekIncentive, monthActual: monthIncentive, money: true },
          ]}
          getGoal={getGoal}
        />
      </Card>

      {goalModalOpen && (
        <GoalInputModal
          scope={scope}
          currentGoals={goalMap}
          onClose={() => setGoalModalOpen(false)}
          onSave={saveGoals}
        />
      )}
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================
function TodayCard({ label, actual, goal, unit }) {
  const pct = progressPct(actual, goal);
  const barColor = pct >= 100 ? color.success : pct >= 60 ? color.gold : pct >= 30 ? color.navy : color.textLight;
  return (
    <Card variant="subtle" padding="none" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.textLight, marginBottom: 6, letterSpacing: font.letterSpacing.wide }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: font.weight.black, color: color.navy, fontFamily: font.family.mono }}>
          {actual}
        </span>
        <span style={{ fontSize: font.size.xs, color: color.textLight }}>/ {goal || '—'} {unit}</span>
      </div>
      <div style={{ height: 6, background: color.gray200, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: barColor, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: font.size.xs - 1, color: barColor, fontWeight: font.weight.semibold, marginTop: 4, textAlign: 'right' }}>
        {goal > 0 ? fmtPct(pct) : '目標未設定'}
      </div>
    </Card>
  );
}

// 月次5指標カード: 実績/目標 + 達成率バー + 月末着地予測（成功/警告で色分け）
function MonthlyCard({ label, actual, goal, unit, forecast, money = false }) {
  const pct = progressPct(actual, goal);
  const barColor = pct >= 100 ? color.success : pct >= 60 ? color.gold : pct >= 30 ? color.navy : color.textLight;

  const dispActual = money ? fmtYen(actual) : fmtNum(actual);
  const dispGoal = goal > 0 ? (money ? fmtYen(goal) : fmtNum(goal)) : '—';
  const dispForecast = forecast == null
    ? '—'
    : (money ? fmtYen(forecast) : fmtNum(forecast));

  // 着地予測の色判定
  let forecastColor = color.textLight;
  let forecastNote = '';
  if (forecast != null && goal > 0) {
    if (forecast >= goal) {
      forecastColor = color.success;
      forecastNote = '達成見込み';
    } else {
      forecastColor = color.danger;
      const gap = money ? fmtYen(goal - forecast) : `${fmtNum(goal - forecast)}${unit}`;
      forecastNote = `未達 -${gap}`;
    }
  }

  return (
    <Card variant="subtle" padding="none" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: 150 }}>
      <div style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: color.textLight, marginBottom: 6, letterSpacing: font.letterSpacing.wide }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: money ? 18 : 22, fontWeight: font.weight.black, color: color.navy, fontFamily: font.family.mono, lineHeight: 1.1 }}>
          {dispActual}
        </span>
        {!money && unit && (
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>{unit}</span>
        )}
      </div>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
        目標 {dispGoal}{!money && unit ? unit : ''}
      </div>
      <div style={{ height: 6, background: color.gray200, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: barColor, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: font.size.xs - 1, color: barColor, fontWeight: font.weight.semibold, marginTop: 4, textAlign: 'right' }}>
        {goal > 0 ? fmtPct(pct) : '目標未設定'}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px dashed ${color.borderLight}` }}>
        <div style={{ fontSize: font.size.xs - 2, color: color.textLight, letterSpacing: font.letterSpacing.wide, marginBottom: 2 }}>
          着地予測
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: forecastColor, fontFamily: font.family.mono }}>
            {dispForecast}{!money && forecast != null ? unit : ''}
          </span>
          <span style={{ fontSize: font.size.xs - 2, color: forecastColor, fontWeight: font.weight.semibold }}>
            {forecastNote}
          </span>
        </div>
      </div>
    </Card>
  );
}

// 本日中に必要な追加件数: 月次目標達成のために今日まだ何件必要か
function RequiredTodayPanel({ rows }) {
  const hasAny = rows.some(r => r.required != null && r.required > 0);

  if (!hasAny) {
    const allMet = rows.every(r => r.required != null && r.required === 0);
    return (
      <div style={{
        padding: '10px 14px',
        background: alpha(color.success, 0.08),
        borderRadius: radius.md,
        borderLeft: `3px solid ${color.success}`,
        fontSize: font.size.xs,
        color: color.success,
        fontWeight: font.weight.semibold,
      }}>
        {allMet ? '本日のノルマ達成（月次着地ペースをキープ）' : '本日の必要件数を計算するには月次目標を設定してください'}
      </div>
    );
  }

  return (
    <div style={{
      padding: '10px 14px',
      background: alpha(color.danger, 0.06),
      borderRadius: radius.md,
      borderLeft: `3px solid ${color.danger}`,
    }}>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide, marginBottom: 6 }}>
        本日中に必要な追加件数
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: font.size.sm }}>
        {rows.map(r => {
          if (r.required == null) return null;
          if (r.required === 0) {
            return (
              <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ color: color.textMid }}>{r.label}</span>
                <span style={{ color: color.success, fontWeight: font.weight.semibold }}>達成</span>
              </div>
            );
          }
          return (
            <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ color: color.textMid }}>{r.label}</span>
              <span style={{ fontFamily: font.family.mono, fontWeight: font.weight.black, color: color.danger, fontSize: font.size.base }}>
                あと{fmtNum(r.required)}
              </span>
              <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>{r.unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressTable({ periods, rows, getGoal }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(2, 2fr)', gap: 0, fontSize: font.size.xs }}>
      <div style={cellHeader}>指標</div>
      {periods.map(p => <div key={p.id} style={cellHeader}>{p.label}</div>)}
      {rows.map((row) => {
        const weekGoal = getGoal(row.kpi, 'weekly');
        const monthGoal = getGoal(row.kpi, 'monthly');
        const weekPct = progressPct(row.weekActual, weekGoal);
        const monthPct = progressPct(row.monthActual, monthGoal);
        return (
          <React.Fragment key={row.kpi}>
            <div style={{ ...cellBase, fontWeight: font.weight.semibold, color: color.navy }}>{row.label}</div>
            <div style={cellBase}>
              <ProgressBar actual={row.weekActual} goal={weekGoal} pct={weekPct} money={row.money} />
            </div>
            <div style={cellBase}>
              <ProgressBar actual={row.monthActual} goal={monthGoal} pct={monthPct} money={row.money} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const cellHeader = {
  padding: '8px 12px', background: color.navy, color: color.white, fontSize: font.size.xs, fontWeight: font.weight.semibold,
};
const cellBase = {
  padding: '10px 12px', borderBottom: `1px solid ${color.borderLight}`,
};

function ProgressBar({ actual, goal, pct, money }) {
  const barColor = pct >= 100 ? color.success : pct >= 60 ? color.gold : pct >= 30 ? color.navy : color.textLight;
  const disp = money ? fmtYen(actual) : Math.round(actual || 0);
  const goalDisp = money ? fmtYen(goal) : (goal || '—');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.xs, marginBottom: 3 }}>
        <span style={{ color: color.navy, fontWeight: font.weight.semibold, fontFamily: font.family.mono }}>{disp}</span>
        <span style={{ color: color.textLight, fontSize: font.size.xs - 1 }}>/ {goalDisp}</span>
      </div>
      <div style={{ height: 5, background: color.gray200, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: barColor, height: '100%' }} />
      </div>
      <div style={{ fontSize: font.size.xs - 2, color: barColor, fontWeight: font.weight.semibold, textAlign: 'right', marginTop: 2 }}>
        {goal > 0 ? fmtPct(pct) : '—'}
      </div>
    </div>
  );
}

// ============================================================
// 目標入力モーダル
// ============================================================
function GoalInputModal({ scope, currentGoals, onClose, onSave }) {
  const [values, setValues] = useState(() => {
    const v = {};
    KPI_TYPES.filter(k => !k.isRate).forEach(k => {
      PERIOD_TYPES.forEach(p => {
        v[`${k.id}_${p.id}`] = currentGoals[`${k.id}_${p.id}`]?.target_value ?? '';
      });
    });
    return v;
  });
  const setV = (kpi, period, val) => setValues(p => ({ ...p, [`${kpi}_${period}`]: val }));

  const handleSave = () => {
    const entries = [];
    KPI_TYPES.filter(k => !k.isRate).forEach(k => {
      PERIOD_TYPES.forEach(p => {
        const v = values[`${k.id}_${p.id}`];
        if (v !== '' && v != null) entries.push({ kpi_type: k.id, period_type: p.id, value: v });
      });
    });
    onSave(entries);
  };

  const scopeLabel = `個人（${scope.name}）`;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: alpha(color.navy, 0.5),
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, borderRadius: radius.xl, padding: '24px 28px',
        width: 680, maxWidth: 'calc(100% - 32px)', maxHeight: '80vh', overflowY: 'auto',
        boxShadow: shadow.xl, borderTop: `3px solid ${color.gold}`,
      }}>
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.black, color: color.navy, marginBottom: 4 }}>目標入力</div>
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 16 }}>対象: {scopeLabel}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(3, 1fr)', gap: 10, fontSize: font.size.sm }}>
          <div style={{ fontWeight: font.weight.bold, color: color.navy }}>指標</div>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, textAlign: 'center' }}>日次</div>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, textAlign: 'center' }}>週次</div>
          <div style={{ fontWeight: font.weight.bold, color: color.navy, textAlign: 'center' }}>月次</div>
          {KPI_TYPES.filter(k => !k.isRate).map(k => (
            <React.Fragment key={k.id}>
              <div style={{ alignSelf: 'center', fontWeight: font.weight.semibold, color: color.textDark }}>
                {k.label}
                <span style={{ fontSize: font.size.xs - 1, color: color.textLight, marginLeft: 4 }}>({k.unit})</span>
              </div>
              {PERIOD_TYPES.map(p => (
                <Input
                  key={p.id}
                  size="sm"
                  type="number"
                  value={values[`${k.id}_${p.id}`] ?? ''}
                  onChange={e => setV(k.id, p.id, e.target.value)}
                  placeholder="—"
                  style={{ fontFamily: font.family.mono, textAlign: 'right' }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </div>
    </div>
  );
}
