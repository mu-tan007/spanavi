import { useState, useEffect, useMemo } from "react";
import { C } from '../../constants/colors';
import { fetchCallSessions, fetchCalledCountForSession } from '../../lib/supabaseWrite';

export default function LiveStatusView({ now }) {
  // ── Supabaseからセッション情報と架電済み件数を取得 ────────────────
  const [sessions, setSessions] = useState([]);
  // ── Supabaseから取得した架電済み件数 { sessionId: count } ────────
  const [calledCounts, setCalledCounts] = useState({});
  // ── 過去日セクションの折りたたみ状態（デフォルト折りたたみ） ────
  const [collapsedDays, setCollapsedDays] = useState({ 1: true, 2: true });

  // ── 営業日（月〜金）をn日分遡る ──────────────────────────────────
  const getPastBusinessDays = (baseDate, n) => {
    const days = [];
    let d = new Date(baseDate);
    while (days.length < n) {
      d = new Date(d);
      d.setDate(d.getDate() - 1);
      const dow = d.getDay(); // 0=日, 6=土
      if (dow !== 0 && dow !== 6) days.push(new Date(d));
    }
    return days;
  };

  // UTC → JST (Asia/Tokyo) の日付文字列に変換（比較用）
  const toJSTDateStr = (d) =>
    new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

  // 5秒ごとにSupabaseからセッション一覧と架電件数を取得（3営業日分）
  useEffect(() => {
    const sinceISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const load = async () => {
      const { data: rawSessions } = await fetchCallSessions(sinceISO);
      if (!rawSessions) return;
      const mappedSessions = rawSessions.map(s => ({
        id: s.id,
        listId: s.list_id,
        listSupaId: s.list_supa_id,
        listName: s.list_name,
        industry: s.industry,
        callerName: s.caller_name,
        startNo: s.start_no,
        endNo: s.end_no,
        totalCount: s.total_count,
        calledCount: 0,
        startedAt: s.started_at,
        finishedAt: s.finished_at,
        lastCalledAt: s.last_called_at,
      }));
      setSessions(mappedSessions);
      const today = new Date();
      const pastDays = getPastBusinessDays(today, 2);
      const validDates = new Set([
        toJSTDateStr(today),
        ...pastDays.map(d => toJSTDateStr(d)),
      ]);
      const targetSessions = mappedSessions.filter(s => validDates.has(toJSTDateStr(s.startedAt)));
      if (!targetSessions.length) return;
      const results = await Promise.all(
        targetSessions.map(async (s) => {
          if (!s.listSupaId) return { id: s.id, count: 0, total: 0 };
          const { count, total } = await fetchCalledCountForSession(
            s.listSupaId, s.startedAt, s.finishedAt || null,
            s.startNo ?? null, s.endNo ?? null
          );
          return { id: s.id, count, total };
        })
      );
      const map = {};
      results.forEach(r => { map[r.id] = { count: r.count, total: r.total }; });
      setCalledCounts(map);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3営業日分のday groupsを構築（セッションID単位、1セッション1カード） ─────
  const dayGroups = useMemo(() => {
    const pastDays = getPastBusinessDays(now, 2);
    const days = [
      { date: now,         label: '本日',      key: 0 },
      { date: pastDays[0], label: '1営業日前', key: 1 },
      { date: pastDays[1], label: '2営業日前', key: 2 },
    ];
    return days.map(({ date, label, key }) => {
      const dateStr = toJSTDateStr(date);
      const groups = sessions.filter(s => toJSTDateStr(s.startedAt) === dateStr);
      return {
        key, label, date,
        groups,
        activeLists: groups.filter(s => !s.finishedAt),
        finishedLists: groups.filter(s => s.finishedAt).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)),
      };
    });
  }, [sessions, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const getDuration = (startedAt, finishedAt = null) => {
    const end = finishedAt ? new Date(finishedAt) : now;
    const diff = Math.floor((end - new Date(startedAt)) / 60000);
    if (diff < 0) return '0分';
    if (diff < 60) return diff + '分';
    return Math.floor(diff / 60) + 'h' + (diff % 60) + 'm';
  };

  const formatDateLabel = (date) =>
    date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

  const renderSessionCard = (s) => {
    const dbEntry     = calledCounts[s.id];
    const calledCount = dbEntry?.count ?? 0;
    const totalCount  = dbEntry?.total || s.totalCount || 0;
    const progress    = totalCount > 0 ? Math.round((calledCount / totalCount) * 100) : 0;
    const isActive    = !s.finishedAt;
    const callerStr   = (s.callerName && !s.callerName.includes('@')) ? s.callerName : (s.callerName || '—');
    const startTime   = new Date(s.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const endTime     = s.finishedAt
      ? new Date(s.finishedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : null;
    const duration    = getDuration(s.startedAt, s.finishedAt);
    const lastActivity = s.lastCalledAt
      ? new Date(s.lastCalledAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div key={s.id} style={{
        background: C.white, borderRadius: 8, padding: '12px 16px',
        border: '1px solid ' + C.borderLight, boxShadow: '0 1px 4px rgba(26,58,92,0.04)',
        borderLeft: '3px solid ' + (isActive ? C.green : C.textLight),
        opacity: isActive ? 1 : 0.75,
      }}>
        {/* 1行目: 架電者 + バッジ + 時刻 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isActive
              ? <span style={{ fontSize: 9, background: '#e8f8ee', color: C.green, padding: '2px 7px', borderRadius: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                  架電中
                </span>
              : <span style={{ fontSize: 9, background: C.offWhite, color: C.textLight, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>架電終了</span>
            }
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{callerStr}</span>
          </div>
          <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'", whiteSpace: 'nowrap' }}>
            {isActive
              ? `${startTime}〜（${duration}経過）`
              : `${startTime}〜${endTime}（${duration}）`
            }
          </span>
        </div>
        {/* 2行目: リスト名 */}
        <div style={{ fontSize: 10, color: C.textMid, marginBottom: 6 }}>
          {s.listName}
          {s.industry ? <span style={{ marginLeft: 4, color: C.textLight }}>› {s.industry}</span> : ''}
          {s.startNo != null && s.endNo != null && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: C.navy, fontFamily: "'JetBrains Mono'" }}>
              No.{s.startNo}〜{s.endNo}
            </span>
          )}
        </div>
        {/* 3行目: プログレスバー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 6, background: C.offWhite, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: progress + '%', transition: 'width 0.3s',
              background: isActive
                ? 'linear-gradient(90deg, ' + C.gold + ', ' + C.green + ')'
                : C.textLight,
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'", minWidth: 32 }}>
            {progress}%
          </span>
        </div>
        {/* 4行目: 架電済件数・最終架電 */}
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.textLight }}>
          <span>架電済 <span style={{ fontWeight: 700, color: C.navy }}>{calledCount}</span> / {totalCount}</span>
          {lastActivity && (
            <span>最終架電 <span style={{ fontWeight: 700, color: C.navy }}>{lastActivity}</span></span>
          )}
        </div>
      </div>
    );
  };

  const todayGroup = dayGroups[0];
  const pastGroups = dayGroups.slice(1);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>架電状況ボード</h2>
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>架電開始時に自動登録されます。直近3営業日分を表示中</div>
      </div>

      {/* 本日セクション */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid ' + C.navy + '20' }}>
          本日 — {formatDateLabel(todayGroup.date)}
        </div>
        {todayGroup.groups.length > 0 ? (
          <>
            {todayGroup.activeLists.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                  現在架電中（{todayGroup.activeLists.length}件）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {todayGroup.activeLists.map(s => renderSessionCard(s))}
                </div>
              </div>
            )}
            {todayGroup.finishedLists.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 8 }}>
                  完了（{todayGroup.finishedLists.length}件）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {todayGroup.finishedLists.map(s => renderSessionCard(s))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: C.white, borderRadius: 10, padding: '32px 40px',
            border: '1px solid ' + C.borderLight, textAlign: 'center',
            boxShadow: '0 1px 4px rgba(26,58,92,0.04)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📞</div>
            <div style={{ fontSize: 13, color: C.textMid }}>本日の架電記録がありません</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>架電リストから「架電開始」を押すと表示されます</div>
          </div>
        )}
      </div>

      {/* 過去日セクション（折りたたみ） */}
      {pastGroups.map((dg) => {
        const isCollapsed = collapsedDays[dg.key];
        return (
          <div key={dg.key} style={{ marginBottom: 12 }}>
            <button
              onClick={() => setCollapsedDays(prev => ({ ...prev, [dg.key]: !prev[dg.key] }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: isCollapsed ? 6 : '6px 6px 0 0',
                border: '1px solid ' + C.borderLight,
                borderBottom: isCollapsed ? '1px solid ' + C.borderLight : '1px solid ' + C.borderLight,
                background: C.offWhite, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMid }}>
                  {dg.label} — {formatDateLabel(dg.date)}
                </span>
                {dg.groups.length > 0 ? (
                  <span style={{ fontSize: 10, color: C.textLight, background: C.borderLight, padding: '1px 7px', borderRadius: 10 }}>
                    {dg.groups.length}件
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: C.textLight }}>記録なし</span>
                )}
              </div>
              <span style={{
                fontSize: 9, color: C.textLight,
                display: 'inline-block',
                transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.2s',
              }}>▼</span>
            </button>
            {!isCollapsed && (
              <div style={{ padding: '10px', border: '1px solid ' + C.borderLight, borderTop: 'none', borderRadius: '0 0 6px 6px', background: C.white }}>
                {dg.groups.length > 0 ? (
                  <>
                    {dg.activeLists.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.green, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                          架電中（{dg.activeLists.length}件）
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                          {dg.activeLists.map(s => renderSessionCard(s))}
                        </div>
                      </div>
                    )}
                    {dg.finishedLists.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>
                          完了（{dg.finishedLists.length}件）
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                          {dg.finishedLists.map(s => renderSessionCard(s))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', color: C.textLight, fontSize: 12 }}>
                    この日の架電記録はありません
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
