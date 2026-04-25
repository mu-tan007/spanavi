import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { C } from '../../constants/colors';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useEngagements } from '../../hooks/useEngagements';
import { useKpiGoals, KPI_TYPES, PERIOD_TYPES } from '../../hooks/useKpiGoals';
import { supabase } from '../../lib/supabase';
import { fetchAllRecallRecords, fetchMemberPayrollHistory } from '../../lib/supabaseWrite';
import PageHeader from '../common/PageHeader';
import TopListCard from '../common/TopListCard';
import { Phone } from 'lucide-react';

const TEAMS = ['成尾', '高橋'];
const APPO_COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);
const PAYROLL_COUNTABLE = new Set(['アポ取得', '事前確認済', '面談済']);

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
const fmtPct = (v) => (v == null || Number.isNaN(v)) ? '—' : Math.round(v) + '%';
const progressPct = (actual, goal) => (goal > 0 ? (actual / goal) * 100 : 0);

const getMemberNamesForScope = (scope, members) => {
  if (!members) return [];
  if (scope.type === 'member') return scope.name ? [scope.name] : [];
  if (scope.type === 'team') return members.filter(m => m.team === scope.name).map(m => m.name);
  return members.map(m => m.name);
};

// ============================================================
// メイン
// ============================================================
export default function SourcingDashboardView({
  currentUser, userId, callListData, members, now, appoData, onDataRefetch, isAdmin,
  setCurrentTab, setSelectedList, setCallFlowScreen,
}) {
  const isMobile = useIsMobile();
  const { currentEngagement } = useEngagements();
  const engagementId = currentEngagement?.id;

  const myMember = useMemo(() => (members || []).find(m => m.name === currentUser) || null, [members, currentUser]);
  const myRole = myMember?.role || '';
  const isTeamLeader = myRole === 'チームリーダー';

  // チーム UUID 取得
  const [teamRows, setTeamRows] = useState([]);
  useEffect(() => {
    supabase.from('teams').select('id, name, display_order').then(({ data }) => setTeamRows(data || []));
  }, []);

  // ---- スコープ ----
  const scopeOptions = useMemo(() => {
    const opts = [{ type: 'member', id: myMember?._supaId || null, label: '自分', name: currentUser }];
    TEAMS.forEach(t => {
      const row = teamRows.find(r => r.name === t);
      opts.push({ type: 'team', id: row?.id || null, label: `${t}チーム`, name: t });
    });
    opts.push({ type: 'org', id: null, label: '組織全体', name: null });
    return opts;
  }, [myMember, currentUser, teamRows]);

  const [scopeIdx, setScopeIdx] = useState(0);
  const scope = scopeOptions[scopeIdx];

  // 目標を入力できる権限判定（このスコープについて）
  const canEditGoal = useMemo(() => {
    if (isAdmin) return true;
    if (scope.type === 'org') return false; // 管理者のみ
    if (scope.type === 'team') return isTeamLeader && myMember?.team === scope.name;
    // member: 自分のみ
    return scope.name === currentUser;
  }, [isAdmin, isTeamLeader, myMember, scope, currentUser]);

  // ---- KPI 目標 ----
  const { goals, upsertGoal, refresh: refreshGoals } = useKpiGoals({
    engagementId,
    scopeType: scope.type,
    scopeId: scope.type === 'org' ? null : scope.id,
  });

  const goalMap = useMemo(() => {
    // kpi_type+period_type をキーに最新の effective_from のみ
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
    // 組織全体は退職者含む全件（members フィルタなし）
    let filtered;
    if (scope.type === 'org') {
      filtered = (rankingRows || []);
    } else {
      const set = new Set(getMemberNamesForScope(scope, members));
      filtered = (rankingRows || []).filter(r => set.has(r.getter_name));
    }
    const total = filtered.reduce((s, r) => s + Number(r.total || 0), 0);
    const ceoConnect = filtered.reduce((s, r) => s + Number(r.ceo_connect || 0), 0);
    const appo = filtered.reduce((s, r) => s + Number(r.appo || 0), 0);
    return { total, ceoConnect, appo };
  }, [scope, members]);

  const todayAgg = useMemo(() => aggScope(ranking.today), [ranking.today, aggScope]);
  const weekAgg = useMemo(() => aggScope(ranking.week), [ranking.week, aggScope]);
  const monthAgg = useMemo(() => aggScope(ranking.month), [ranking.month, aggScope]);

  // アポ・売上・インセンティブ（appoData + payroll）
  const scopedAppos = useMemo(() => {
    const base = (appoData || []).filter(a => APPO_COUNTABLE.has(a.status));
    if (scope.type === 'org') return base; // 組織全体は全件
    const set = new Set(getMemberNamesForScope(scope, members));
    return base.filter(a => set.has(a.getter));
  }, [appoData, scope, members]);

  const salesInPeriod = (from, to) =>
    scopedAppos.filter(a => (!from || a.getDate >= from) && (!to || a.getDate <= to))
      .reduce((s, a) => s + (parseFloat(a.sales) || 0), 0);

  const appoInPeriod = (from, to) =>
    scopedAppos.filter(a => (!from || a.getDate >= from) && (!to || a.getDate <= to)).length;

  const weekSales = useMemo(() => salesInPeriod(weekStart, todayStr), [scopedAppos, weekStart, todayStr]);
  const monthSales = useMemo(() => salesInPeriod(monthStart, todayStr), [scopedAppos, monthStart, todayStr]);

  // インセンティブ: 簡易計算（scoped appointments の reward 合計 + team bonus）
  const calcIncentive = (from, to) => {
    const periodAppos = scopedAppos.filter(a =>
      (!from || a.getDate >= from) && (!to || a.getDate <= to)
    );
    const incentive = periodAppos.reduce((s, a) => s + (parseFloat(a.reward) || 0), 0);
    // team bonus は team scope 以上で計上
    if (scope.type === 'member') return incentive;
    const teamSales = periodAppos.reduce((s, a) => s + (parseFloat(a.sales) || 0), 0);
    const pool = Math.round(teamSales * 0.03);
    return incentive + pool; // 簡易: pool をそのままプラス
  };

  const weekIncentive = useMemo(() => calcIncentive(weekStart, todayStr), [scopedAppos, weekStart, todayStr, scope]);
  const monthIncentive = useMemo(() => calcIncentive(monthStart, todayStr), [scopedAppos, monthStart, todayStr, scope]);

  // 本日の実績
  const todayAppo = useMemo(() => appoInPeriod(todayStr, todayStr), [scopedAppos, todayStr]);

  // ---- 目標入力モーダル ----
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // ---- 架電キュー（📞ボタン→次企業へ自動遷移／ヘッダー前後矢印で遷移） ----
  const queueRef = useRef({ items: [], idx: 0 });
  // 元リストの完全なオブジェクトを解決して渡す（スクリプト・アウト返し・企業概要・注意事項・カレンダーを保持）
  const resolveFullList = useCallback((listId) => {
    const found = (callListData || []).find(l => l._supaId === listId || l.id === listId);
    return found || { _supaId: listId, id: listId, company: '' };
  }, [callListData]);

  const openQueueItemAtIdx = useCallback(() => {
    const q = queueRef.current;
    const cur = q.items[q.idx];
    if (!cur || !setCallFlowScreen) { setCallFlowScreen?.(null); return; }
    const goPrev = q.idx > 0 ? () => {
      queueRef.current = { items: q.items, idx: q.idx - 1 };
      openQueueItemAtIdx();
    } : null;
    const goNext = q.idx < q.items.length - 1 ? () => {
      queueRef.current = { items: q.items, idx: q.idx + 1 };
      openQueueItemAtIdx();
    } : null;
    setCallFlowScreen({
      list: resolveFullList(cur.list_id),
      defaultItemId: cur.item_id,
      defaultListMode: false,
      singleItemMode: true,
      onQueuePrev: goPrev,
      onQueueNext: goNext,
      queuePos: `${q.idx + 1} / ${q.items.length}件`,
      onResultSubmit: () => {
        queueRef.current = { items: q.items, idx: q.idx + 1 };
        if (queueRef.current.idx < queueRef.current.items.length) {
          openQueueItemAtIdx();
        } else {
          setCallFlowScreen?.(null);
        }
      },
    });
  }, [setCallFlowScreen, resolveFullList]);

  const openQueue = useCallback((items, startIdx) => {
    // 全件をキューに保持し、選択された位置を初期 idx に。
    // 前後矢印で 1〜N 全件を自由に行き来できる。
    const full = (items || []).filter(it => it.item_id && it.list_id);
    if (!full.length) return;
    // 元配列の startIdx が valid でない場合に備え、対応する item で再検索
    const targetId = items[startIdx]?.item_id;
    const initialIdx = Math.max(0, full.findIndex(it => it.item_id === targetId));
    queueRef.current = { items: full, idx: initialIdx };
    openQueueItemAtIdx();
  }, [openQueueItemAtIdx]);

  // ---- 社長再コール超過 / 社長お断り14日経過 / 再アプローチ候補 ----
  // サーバー側 RPC で join 済の必要行だけ取得
  const [overdueRecalls, setOverdueRecalls] = useState([]);
  const [oldRejections, setOldRejections] = useState([]);
  const [reapproachCandidates, setReapproachCandidates] = useState([]);
  const [recallLoading, setRecallLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRecallLoading(true);
    Promise.all([
      supabase.rpc('dashboard_overdue_recalls'),
      supabase.rpc('dashboard_old_rejections', { p_days: 14 }),
      supabase.rpc('dashboard_reapproach_candidates'),
    ]).then(([recRes, rejRes, reaRes]) => {
      if (cancelled) return;
      setOverdueRecalls((recRes.data || []).map(r => ({
        id: r.record_id,
        item_id: r.item_id,
        list_id: r.list_id,
        company: r.company || '—',
        list_name: r.list_name || '',
        recall_date: r.recall_date,
        recall_time: r.recall_time,
        assignee: r.assignee,
        getter_name: r.getter_name,
      })));
      setOldRejections((rejRes.data || []).map(r => ({
        id: r.record_id,
        item_id: r.item_id,
        list_id: r.list_id,
        company: r.company || '—',
        list_name: r.list_name || '',
        getter_name: r.getter_name,
        called_at: r.called_at,
      })));
      setReapproachCandidates((reaRes.data || []).map(r => ({
        id: `${r.item_id}_${r.list_id}`,
        item_id: r.item_id,
        list_id: r.list_id,
        company: r.company || '—',
        list_name: r.list_name || '',
        client_name: r.client_name || '',
        past_getter: r.past_getter || '',
        past_client: r.past_client || '',
        past_date: r.past_date || null,
        source: r.source || 'spanavi',
      })));
      setRecallLoading(false);
    }).catch(err => {
      console.error('[Dashboard] recall/rejection/reapproach RPC error:', err);
      if (!cancelled) setRecallLoading(false);
    });
    return () => { cancelled = true; };
  }, [todayStr]);

  // ---- おすすめリスト TOP4 ----
  const topLists = useMemo(() => {
    return (callListData || [])
      .filter(l => l.status === '架電可能' && !l.is_archived && l.recommendation)
      .sort((a, b) => (b.recommendation?.score || 0) - (a.recommendation?.score || 0))
      .slice(0, 4);
  }, [callListData]);

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
  const scopeDesc = scope.type === 'member' ? '自分の現在地と、次の一手'
    : scope.type === 'team' ? `${scope.name}チームの現在地と、次の一手` : '組織全体の現在地と、次の一手';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="Dashboard"
        description={scopeDesc}
        right={(
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {scopeOptions.map((s, i) => (
              <button key={i} onClick={() => setScopeIdx(i)}
                style={{
                  padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Noto Sans JP',sans-serif",
                  border: `1px solid ${scopeIdx === i ? C.navy : C.border}`,
                  background: scopeIdx === i ? C.navy : C.white,
                  color: scopeIdx === i ? C.white : C.navy,
                }}>{s.label}</button>
            ))}
          </div>
        )}
        style={{ marginBottom: 24 }}
      />

      {/* 本日の目標 vs 実績 */}
      <div style={{
        background: C.white, border: '1px solid #E5E7EB', borderRadius: 4,
        padding: '16px 20px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>本日の実績 / 目標</div>
          {canEditGoal && (
            <button onClick={() => setGoalModalOpen(true)}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 600,
                background: C.navy, color: C.white, border: 'none', borderRadius: 4,
                cursor: 'pointer',
              }}>目標入力はこちら</button>
          )}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12,
        }}>
          <TodayCard label="架電件数" actual={todayAgg.total} goal={getGoal('calls', 'daily')} unit="件" />
          <TodayCard label="社長接続数" actual={todayAgg.ceoConnect} goal={getGoal('connections', 'daily')} unit="件" />
          <TodayCard label="アポ獲得数" actual={todayAgg.appo} goal={getGoal('appointments', 'daily')} unit="件" />
        </div>
      </div>

      {/* 週次・月次 進捗 */}
      <div style={{
        background: C.white, border: '1px solid #E5E7EB', borderRadius: 4,
        padding: '16px 20px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 12 }}>週次・月次 進捗率</div>
        <ProgressTable
          periods={[
            { id: 'weekly', label: '週次' },
            { id: 'monthly', label: '月次' },
          ]}
          rows={[
            { kpi: 'calls', label: '架電件数', weekActual: weekAgg.total, monthActual: monthAgg.total, money: false },
            { kpi: 'connections', label: '社長接続数', weekActual: weekAgg.ceoConnect, monthActual: monthAgg.ceoConnect, money: false },
            { kpi: 'appointments', label: 'アポ獲得数', weekActual: weekAgg.appo, monthActual: monthAgg.appo, money: false },
            { kpi: 'sales', label: '売上', weekActual: weekSales, monthActual: monthSales, money: true },
            { kpi: 'incentive', label: 'インセンティブ', weekActual: weekIncentive, monthActual: monthIncentive, money: true },
          ]}
          getGoal={getGoal}
        />
      </div>

      {/* おすすめリスト TOP4 */}
      <div style={{
        background: C.white, border: '1px solid #E5E7EB', borderRadius: 4,
        padding: '16px 20px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
          現在のおすすめリスト TOP4
        </div>
        {topLists.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
            架電可能なリストがありません。
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: 10,
          }}>
            {topLists.map(list => (
              <TopListCard key={list.id} list={list} onClick={() => {
                if (setSelectedList) setSelectedList(list.id);
              }} />
            ))}
          </div>
        )}
      </div>

      {/* 社長再コール超過 */}
      <CollapsibleList
        title="社長再コール超過"
        items={overdueRecalls}
        loading={recallLoading}
        emptyText="再コール超過はありません。"
        render={(r, i) => (
          <div key={r.id || i} style={rowStyle}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.company || '—'}
              </div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                {r.list_name || ''}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.red, minWidth: 120 }}>
              再コール予定: {r.recall_date} {r.recall_time || ''}
            </div>
            <div style={{ fontSize: 10, color: C.textMid, minWidth: 80 }}>
              担当: {r.assignee || r.getter_name || '—'}
            </div>
            <CallButton
              disabled={!setCallFlowScreen || !r.item_id || !r.list_id}
              onClick={() => openQueue(overdueRecalls, i)}
            />
          </div>
        )}
      />

      {/* 社長お断り 14日経過 */}
      <CollapsibleList
        title="社長お断り 14日経過"
        items={oldRejections}
        loading={recallLoading}
        emptyText="該当なし。"
        render={(r, i) => (
          <div key={r.id || i} style={rowStyle}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.company}
              </div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>
                {r.list_name || ''}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.textMid, minWidth: 110 }}>
              最終架電: {r.called_at?.slice(0, 10)}
            </div>
            <div style={{ fontSize: 10, color: C.textMid, minWidth: 80 }}>
              担当: {r.getter_name || '—'}
            </div>
            <CallButton
              disabled={!setCallFlowScreen || !r.item_id || !r.list_id}
              onClick={() => openQueue(oldRejections, i)}
            />
          </div>
        )}
      />

      {/* 再アプローチ候補（過去アポあり・自分以外が取得・アクティブリスト在籍） */}
      <CollapsibleList
        title="再アプローチ候補"
        items={reapproachCandidates}
        loading={recallLoading}
        emptyText="該当なし。"
        render={(r, i) => (
          <div key={r.id || i} style={rowStyle}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.company}
              </div>
              <div style={{ fontSize: 10, color: C.textLight, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.list_name || ''}{r.client_name ? ` / ${r.client_name}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.textMid, width: 110, flexShrink: 0, whiteSpace: 'nowrap' }}>
              過去アポ: {r.past_date || '—'}
            </div>
            <div style={{ fontSize: 10, color: C.textMid, width: 110, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              取得者: {r.past_getter || '—'}
            </div>
            <div style={{ fontSize: 10, color: C.textMid, width: 200, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              名義: {r.past_client || '—'}
            </div>
            <CallButton
              disabled={!setCallFlowScreen || !r.item_id || !r.list_id}
              onClick={() => openQueue(reapproachCandidates, i)}
            />
          </div>
        )}
      />

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
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
  borderBottom: '1px solid #F3F4F6', fontSize: 12,
};

function TodayCard({ label, actual, goal, unit }) {
  const pct = progressPct(actual, goal);
  const color = pct >= 100 ? C.green : pct >= 60 ? C.gold : pct >= 30 ? C.navy : C.textLight;
  return (
    <div style={{
      background: '#F8F9FA', border: '1px solid #E5E7EB',
      borderRadius: 6, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.navy, fontFamily: "'JetBrains Mono'" }}>
          {actual}
        </span>
        <span style={{ fontSize: 11, color: C.textLight }}>/ {goal || '—'} {unit}</span>
      </div>
      <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 4, textAlign: 'right' }}>
        {goal > 0 ? fmtPct(pct) : '目標未設定'}
      </div>
    </div>
  );
}

function ProgressTable({ periods, rows, getGoal }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(2, 2fr)', gap: 0, fontSize: 11 }}>
      <div style={cellHeader}>指標</div>
      {periods.map(p => <div key={p.id} style={cellHeader}>{p.label}</div>)}
      {rows.map((row, i) => {
        const weekGoal = getGoal(row.kpi, 'weekly');
        const monthGoal = getGoal(row.kpi, 'monthly');
        const weekPct = progressPct(row.weekActual, weekGoal);
        const monthPct = progressPct(row.monthActual, monthGoal);
        return (
          <React.Fragment key={row.kpi}>
            <div style={{ ...cellBase, fontWeight: 600, color: C.navy }}>{row.label}</div>
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
  padding: '8px 12px', background: '#0D2247', color: '#fff', fontSize: 11, fontWeight: 600,
};
const cellBase = {
  padding: '10px 12px', borderBottom: '1px solid #F3F4F6',
};

function ProgressBar({ actual, goal, pct, money }) {
  const color = pct >= 100 ? C.green : pct >= 60 ? C.gold : pct >= 30 ? C.navy : C.textLight;
  const disp = money ? fmtYen(actual) : Math.round(actual || 0);
  const goalDisp = money ? fmtYen(goal) : (goal || '—');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: C.navy, fontWeight: 600, fontFamily: "'JetBrains Mono'" }}>{disp}</span>
        <span style={{ color: C.textLight, fontSize: 10 }}>/ {goalDisp}</span>
      </div>
      <div style={{ height: 5, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: color, height: '100%' }} />
      </div>
      <div style={{ fontSize: 9, color, fontWeight: 600, textAlign: 'right', marginTop: 2 }}>
        {goal > 0 ? fmtPct(pct) : '—'}
      </div>
    </div>
  );
}

function CallButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="架電集中画面を開く"
      style={{
        padding: '5px 10px', fontSize: 11, fontWeight: 600,
        background: disabled ? '#E5E7EB' : C.navy,
        color: disabled ? C.textLight : C.white,
        border: 'none', borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    ><Phone size={12} strokeWidth={2} /> 架電</button>
  );
}

function CollapsibleList({ title, items, emptyText, render, loading }) {
  const [open, setOpen] = useState(false);
  const initial = 15;
  const shown = open ? items : items.slice(0, initial);
  return (
    <div style={{ background: C.white, border: '1px solid #E5E7EB', borderRadius: 4, marginBottom: 12, padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
          {title}{' '}
          <span style={{ fontSize: 11, fontWeight: 400, color: C.textLight, marginLeft: 6 }}>
            {loading ? '読み込み中…' : `${items.length}件`}
          </span>
        </div>
        {!loading && items.length > initial && (
          <button onClick={() => setOpen(v => !v)}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.navy, borderRadius: 3, cursor: 'pointer',
            }}>{open ? '閉じる' : `さらに${items.length - initial}件表示`}</button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: 12, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
          読み込み中…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 12, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
          {emptyText}
        </div>
      ) : (
        shown.map(render)
      )}
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

  const scopeLabel = scope.type === 'member' ? `個人（${scope.name}）`
    : scope.type === 'team' ? `${scope.name}チーム` : '組織全体';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(3,45,96,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 8, padding: '24px 28px',
        width: 680, maxWidth: 'calc(100% - 32px)', maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(3,45,96,0.25)', borderTop: `3px solid ${C.gold}`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.navy, marginBottom: 4 }}>目標入力</div>
        <div style={{ fontSize: 11, color: C.textLight, marginBottom: 16 }}>対象: {scopeLabel}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: C.navy }}>指標</div>
          <div style={{ fontWeight: 700, color: C.navy, textAlign: 'center' }}>日次</div>
          <div style={{ fontWeight: 700, color: C.navy, textAlign: 'center' }}>週次</div>
          <div style={{ fontWeight: 700, color: C.navy, textAlign: 'center' }}>月次</div>
          {KPI_TYPES.filter(k => !k.isRate).map(k => (
            <React.Fragment key={k.id}>
              <div style={{ alignSelf: 'center', fontWeight: 600, color: C.textDark }}>
                {k.label}
                <span style={{ fontSize: 10, color: C.textLight, marginLeft: 4 }}>({k.unit})</span>
              </div>
              {PERIOD_TYPES.map(p => (
                <input
                  key={p.id}
                  type="number"
                  value={values[`${k.id}_${p.id}`] ?? ''}
                  onChange={e => setV(k.id, p.id, e.target.value)}
                  placeholder="—"
                  style={{
                    padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 3,
                    fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: 'right',
                  }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', background: C.white, color: C.navy,
            border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>キャンセル</button>
          <button onClick={handleSave} style={{
            padding: '8px 20px', background: C.navy, color: C.white,
            border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}
