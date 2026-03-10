import { useState, useEffect, useMemo } from "react";
import { C } from '../../constants/colors';
import { fetchAllCallSessionsWithClients, fetchCalledCountForSession } from '../../lib/supabaseWrite';

// ─── ユーティリティ ─────────────────────────────────────────────
const toJSTDateStr = (d) =>
  new Date(d).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  });

const toMDHM = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const md = d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' });
  const hm = d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  return `${md} ${hm}`;
};

const formatSectionLabel = (date) =>
  date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

const getPastBusinessDays = (baseDate, n) => {
  const days = [];
  let d = new Date(baseDate);
  while (days.length < n) {
    d = new Date(d);
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
  }
  return days;
};

// 担当者ごとの色（Spanaviブランドカラーに合わせた複数色）
const CALLER_COLORS = [
  '#c5a55a', // gold
  '#2e8b57', // green
  '#24537a', // navyLight
  '#d4760a', // orange
  '#7b52ab', // purple
  '#c0415c', // rose
  '#1a8c8c', // teal
  '#5c6bc0', // indigo
  '#b06020', // amber-dark
  '#2e7d7d', // teal-dark
];

// ─── ListCard コンポーネント ─────────────────────────────────────
function ListCard({ sessions, calledCountMap, todayStr }) {
  // セッションをfinished_at昇順でソート（完了済み→稼働中の順で描画、稼働中が上に重なる）
  const sorted = [...sessions].sort((a, b) => {
    const aFin = a.finished_at ? 1 : 0;
    const bFin = b.finished_at ? 1 : 0;
    return aFin - bFin;
  });

  const first = sorted[0];
  const listName   = first.listName      || first.list_name || '—';
  const clientName = first.clientName    || '—';
  const totalCount = first.listTotalCount ?? first.total_count ?? 0;

  // 担当者→色マッピング（このカード内でのみ使用）
  const callerColorMap = {};
  let colorIdx = 0;
  sorted.forEach(s => {
    const name = s.caller_name || '不明';
    if (!callerColorMap[name]) {
      callerColorMap[name] = CALLER_COLORS[colorIdx % CALLER_COLORS.length];
      colorIdx++;
    }
  });

  // 稼働中判定
  const hasActive = sorted.some(s => !s.finished_at && toJSTDateStr(s.started_at) === todayStr);

  // 架電済み合計
  const totalCalled = sorted.reduce((sum, s) => sum + (calledCountMap[s.id]?.count || 0), 0);

  // 最終架電日時（セッション横断で最新）
  const latestCalledAt = sorted.reduce((best, s) => {
    const d = s.last_called_at;
    return d && (!best || d > best) ? d : best;
  }, null);

  // 棒グラフに表示するセッション（start_no・end_noが両方ある）
  const barsessions = sorted.filter(s => s.start_no != null && s.end_no != null && totalCount > 0);

  // 範囲なしセッション用: 架電済み割合（%）
  const calledPct = totalCount > 0 ? Math.min((totalCalled / totalCount) * 100, 100) : 0;

  return (
    <div style={{
      background: C.white,
      borderRadius: 10,
      border: '1px solid ' + (hasActive ? '#2e8b5766' : C.borderLight),
      boxShadow: hasActive
        ? '0 2px 12px rgba(46,139,87,0.12)'
        : '0 1px 4px rgba(26,58,92,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── カードヘッダー ── */}
      <div style={{
        padding: '10px 16px',
        background: hasActive ? 'rgba(46,139,87,0.04)' : C.white,
        borderBottom: '1px solid ' + C.borderLight,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {hasActive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 700,
                background: 'rgba(46,139,87,0.12)', color: C.green,
                padding: '2px 7px', borderRadius: 10, flexShrink: 0,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: C.green,
                  display: 'inline-block', animation: 'pulse 1.5s infinite',
                }} />
                稼働中
              </span>
            )}
            <span style={{
              fontSize: 14, fontWeight: 700, color: C.navy,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {listName}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{clientName}</div>
        </div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: C.navy, flexShrink: 0,
          fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
        }}>
          {totalCount > 0 ? totalCount.toLocaleString() : '—'}
          <span style={{ fontSize: 10, fontWeight: 400, color: C.textLight, marginLeft: 2 }}>社</span>
        </div>
      </div>

      {/* ── 棒グラフ ── */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{
          position: 'relative', height: 26, borderRadius: 5,
          background: C.offWhite, border: '1px solid ' + C.borderLight,
          overflow: 'hidden',
        }}>
          {/* 範囲あり: セッションごとに位置指定バー */}
          {barsessions.length > 0 && barsessions.map(s => {
            const left  = ((s.start_no - 1) / totalCount) * 100;
            const width = ((s.end_no - s.start_no + 1) / totalCount) * 100;
            const color = callerColorMap[s.caller_name || '不明'];
            const active = !s.finished_at && toJSTDateStr(s.started_at) === todayStr;
            return (
              <div
                key={s.id}
                title={`${s.caller_name || '不明'}: No.${s.start_no}〜${s.end_no}`}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${Math.max(width, 0.4)}%`,
                  height: '100%',
                  background: color,
                  opacity: active ? 1 : 0.55,
                  borderRight: '1px solid rgba(255,255,255,0.5)',
                  transition: 'opacity 0.3s',
                }}
              />
            );
          })}
          {/* 範囲なし・totalCountあり: 架電済み件数プログレスバー */}
          {barsessions.length === 0 && totalCount > 0 && (
            <>
              <div style={{
                position: 'absolute', left: 0, width: `${calledPct}%`, height: '100%',
                background: '#c8a45a', transition: 'width 0.4s',
              }} />
              <div style={{
                position: 'absolute', left: `${calledPct}%`, right: 0, height: '100%',
                background: '#e0e0e0',
              }} />
            </>
          )}
          {/* 範囲なし・totalCountなし */}
          {barsessions.length === 0 && totalCount === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10, color: C.textLight,
            }}>
              範囲データなし
            </div>
          )}
        </div>

        {/* ── 凡例 ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', marginTop: 8 }}>
          {sorted.map(s => {
            const name   = s.caller_name || '不明';
            const color  = callerColorMap[name];
            const active = !s.finished_at && toJSTDateStr(s.started_at) === todayStr;
            const hasRange = s.start_no != null && s.end_no != null;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                  background: hasRange ? color : 'transparent',
                  border: hasRange ? 'none' : `1.5px dashed ${color}`,
                  opacity: active ? 1 : 0.6,
                }} />
                <span style={{ fontSize: 10, color: C.textMid, whiteSpace: 'nowrap' }}>
                  {name}
                  {hasRange && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: C.textLight, marginLeft: 3,
                    }}>
                      {s.start_no.toLocaleString()}〜{s.end_no.toLocaleString()}
                    </span>
                  )}
                  {!hasRange && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: C.textLight, marginLeft: 3,
                    }}>
                      1〜{(calledCountMap[s.id]?.count || 0).toLocaleString()}件架電済
                    </span>
                  )}
                  {active && (
                    <span style={{
                      display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                      background: C.green, marginLeft: 4, verticalAlign: 'middle',
                      animation: 'pulse 1.5s infinite',
                    }} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── フッター ── */}
      <div style={{
        padding: '7px 16px',
        borderTop: '1px solid ' + C.borderLight,
        background: C.offWhite,
        display: 'flex', alignItems: 'center', gap: 20,
        fontSize: 11, color: C.textLight,
      }}>
        <span>
          架電済{' '}
          <span style={{ fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono', monospace" }}>
            {totalCalled > 0 ? totalCalled.toLocaleString() : '—'}
          </span>
          {' '}件
        </span>
        <span>
          最終架電{' '}
          <span style={{ fontWeight: 700, color: C.navy }}>{toMDHM(latestCalledAt)}</span>
        </span>
      </div>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────
export default function LiveStatusView({ now }) {
  const [sessions, setSessions]             = useState([]);
  const [calledCounts, setCalledCounts]     = useState({});
  // 過去日セクションはデフォルト折りたたみ（today = key 0 はデフォルト展開）
  const [collapsed, setCollapsed]           = useState({ 1: true, 2: true });

  const todayStr = useMemo(() => toJSTDateStr(now), [now]);

  useEffect(() => {
    const pastDays    = getPastBusinessDays(now, 2);
    const validDates  = new Set([
      todayStr,
      toJSTDateStr(pastDays[0]),
      toJSTDateStr(pastDays[1]),
    ]);

    const load = async () => {
      const { data: raw } = await fetchAllCallSessionsWithClients();
      if (!raw) return;
      setSessions(raw);

      // 3営業日内のセッションのみ架電件数を取得
      const targets = raw.filter(s => validDates.has(toJSTDateStr(s.started_at)));
      if (!targets.length) return;

      const results = await Promise.all(
        targets.map(async (s) => {
          if (!s.list_supa_id) return { id: s.id, count: 0 };
          const { count } = await fetchCalledCountForSession(
            s.list_supa_id, s.started_at, s.finished_at || null,
            s.start_no ?? null, s.end_no ?? null
          );
          return { id: s.id, count: count || 0 };
        })
      );
      const map = {};
      results.forEach(r => { map[r.id] = { count: r.count }; });
      setCalledCounts(map);
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 日付セクション構築
  const dayGroups = useMemo(() => {
    const pastDays = getPastBusinessDays(now, 2);
    const sections = [
      { key: 0, label: '本日',      date: now,         dateStr: todayStr },
      { key: 1, label: '1営業日前', date: pastDays[0], dateStr: toJSTDateStr(pastDays[0]) },
      { key: 2, label: '2営業日前', date: pastDays[1], dateStr: toJSTDateStr(pastDays[1]) },
    ];

    return sections.map(({ key, label, date, dateStr }) => {
      const daySessions = sessions.filter(s => toJSTDateStr(s.started_at) === dateStr);

      // call_sessions.list_supa_id でグループ化 → 同じリストを1カードに集約
      const listMap = {};
      daySessions.forEach(s => {
        const k = s.list_supa_id || s.list_id || s.list_name || `__${s.id}`;
        if (!listMap[k]) listMap[k] = [];
        listMap[k].push(s);
      });

      // カードを「稼働中優先 → 最終架電新しい順」でソート
      const cards = Object.values(listMap).sort((a, b) => {
        const aActive = a.some(s => !s.finished_at);
        const bActive = b.some(s => !s.finished_at);
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        const latest = (arr) => arr.reduce((m, s) => {
          const d = s.last_called_at || s.started_at || '';
          return d > m ? d : m;
        }, '');
        return latest(b).localeCompare(latest(a));
      });

      return { key, label, date, dateStr, cards };
    });
  }, [sessions, now, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (key) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>
          架電状況ボード
        </h2>
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
          直近3営業日・リスト別表示
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {dayGroups.map(({ key, label, date, cards }) => {
          const isToday     = key === 0;
          const isCollapsed = !!collapsed[key];
          const activeCards = cards.filter(ss => ss.some(s => !s.finished_at));

          return (
            <div key={key}>
              {/* セクションヘッダー（折りたたみボタン） */}
              <button
                onClick={() => toggleSection(key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 0 8px', background: 'none', border: 'none',
                  borderBottom: '2px solid ' + (isToday ? C.navy + '28' : C.borderLight),
                  marginBottom: isCollapsed ? 0 : 14,
                  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: isToday ? 15 : 13,
                    fontWeight: 700,
                    color: isToday ? C.navy : C.textMid,
                  }}>
                    {label} — {formatSectionLabel(date)}
                  </span>
                  {cards.length > 0 && (
                    <span style={{
                      fontSize: 10, background: C.borderLight, color: C.textMid,
                      padding: '1px 8px', borderRadius: 10,
                    }}>
                      {cards.length}リスト
                    </span>
                  )}
                  {isToday && activeCards.length > 0 && (
                    <span style={{
                      fontSize: 10, background: 'rgba(46,139,87,0.12)', color: C.green,
                      padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%', background: C.green,
                        display: 'inline-block', animation: 'pulse 1.5s infinite',
                      }} />
                      稼働中 {activeCards.length}件
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 9, color: C.textLight, display: 'inline-block',
                  transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'transform 0.2s',
                }}>▼</span>
              </button>

              {/* カード一覧 */}
              {!isCollapsed && (
                cards.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {cards.map((cardSessions, i) => (
                      <ListCard
                        key={cardSessions[0].list_supa_id || cardSessions[0].list_id || i}
                        sessions={cardSessions}
                        calledCountMap={calledCounts}
                        todayStr={todayStr}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '24px', textAlign: 'center',
                    color: C.textLight, fontSize: 12,
                    background: C.white, borderRadius: 8,
                    border: '1px solid ' + C.borderLight,
                  }}>
                    この日の架電記録はありません
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
