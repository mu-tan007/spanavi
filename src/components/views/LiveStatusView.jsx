import React, { useState, useEffect, useMemo } from "react";
import { useIsMobile } from '../../hooks/useIsMobile';
import { C } from '../../constants/colors';
import { fetchAllCallSessionsWithClients, fetchCalledCountForSession, updateSessionRange, deleteSession } from '../../lib/supabaseWrite';
import PageHeader from '../common/PageHeader';

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

// caller_nameが "user_{uuid}" 形式の場合、membersから名前を解決する
const resolveName = (callerName, members) => {
  if (!callerName?.startsWith('user_')) return callerName;
  const memberId = callerName.replace('user_', '');
  const member = members?.find(m => m.id === memberId);
  return member?.name || callerName;
};

// 担当者ごとの色（Spanaviブランドカラーに合わせた複数色）
// 担当者ごとの色ペア [薄い色(選択範囲), 濃い色(架電済み範囲)]
const CALLER_COLOR_PAIRS = [
  { light: '#BFDBFE', dark: '#2563EB' }, // blue
  { light: '#BBF7D0', dark: '#16A34A' }, // green
  { light: '#C7D2FE', dark: '#4F46E5' }, // indigo
  { light: '#FDE68A', dark: '#D97706' }, // amber
  { light: '#DDD6FE', dark: '#7C3AED' }, // violet
  { light: '#FECACA', dark: '#DC2626' }, // red
  { light: '#99F6E4', dark: '#0D9488' }, // teal
  { light: '#E0E7FF', dark: '#4338CA' }, // indigo-deep
  { light: '#FED7AA', dark: '#EA580C' }, // orange
  { light: '#A5F3FC', dark: '#0891B2' }, // cyan
];

// ─── ListCard コンポーネント ─────────────────────────────────────
// セッションが「稼働中」かどうか判定するヘルパー（8時間タイムアウト込み）
function isActiveSession(s, todayStr) {
  if (s.finished_at) return false;
  if (toJSTDateStr(s.started_at) !== todayStr) return false;
  const lastActivity = s.last_called_at || s.started_at;
  const diffHours = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
  return diffHours < 3;
}

function ListCard({ sessions, calledCountMap, todayStr, members, onUpdateRange, onDeleteSession }) {
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);
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

  // 担当者→色ペアマッピング（このカード内でのみ使用）
  const callerColorMap = {};
  let colorIdx = 0;
  sorted.forEach(s => {
    const name = resolveName(s.caller_name, members) || '不明';
    if (!callerColorMap[name]) {
      callerColorMap[name] = CALLER_COLOR_PAIRS[colorIdx % CALLER_COLOR_PAIRS.length];
      colorIdx++;
    }
  });

  // 稼働中判定（8時間タイムアウト込み）
  const hasActive = sorted.some(s => isActiveSession(s, todayStr));;

  // 架電済み合計
  const totalCalled = sorted.reduce((sum, s) => sum + (calledCountMap[s.id]?.count || 0), 0);

  // 最終架電日時（セッション横断で最新）
  const latestCalledAt = sorted.reduce((best, s) => {
    const d = s.last_called_at;
    return d && (!best || d > best) ? d : best;
  }, null);

  // 棒グラフに表示するセッション（start_no/end_noがNULLの場合は全体 1〜totalCount として扱う）
  const barsessions = totalCount > 0 ? sorted.map(s => ({
    ...s,
    start_no: s.start_no ?? 1,
    end_no: s.end_no ?? totalCount,
  })) : [];

  return (
    <div style={{
      background: C.white,
      borderRadius: 4,
      border: '1px solid ' + (hasActive ? '#2e8b5766' : C.borderLight),
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
          {/* 範囲あり: セッションごとに選択範囲(薄)+架電済み範囲(濃)の2レイヤー */}
          {barsessions.length > 0 && barsessions.map(s => {
            const left  = ((s.start_no - 1) / totalCount) * 100;
            const width = ((s.end_no - s.start_no + 1) / totalCount) * 100;
            const colors = callerColorMap[resolveName(s.caller_name, members) || '不明'];
            const active = isActiveSession(s, todayStr);
            // 架電済み範囲: start_no 〜 last_called_no
            const hasProgress = s.last_called_no != null && s.last_called_no >= s.start_no;
            const progressWidth = hasProgress
              ? ((Math.min(s.last_called_no, s.end_no) - s.start_no + 1) / totalCount) * 100
              : 0;
            return (
              <React.Fragment key={s.id}>
                {/* 選択範囲（薄い色） */}
                <div
                  title={`${resolveName(s.caller_name, members) || '不明'}: No.${s.start_no}〜${s.end_no}`}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    width: `${Math.max(width, 0.4)}%`,
                    height: '100%',
                    background: colors.light,
                    opacity: active ? 1 : 0.6,
                    borderRight: '1px solid rgba(255,255,255,0.5)',
                    transition: 'opacity 0.3s',
                  }}
                />
                {/* 架電済み範囲（濃い色） */}
                {progressWidth > 0 && (
                  <div
                    title={`${resolveName(s.caller_name, members) || '不明'}: No.${s.start_no}〜${s.last_called_no} 架電済`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${Math.max(progressWidth, 0.4)}%`,
                      height: '100%',
                      background: colors.dark,
                      opacity: active ? 1 : 0.7,
                      transition: 'opacity 0.3s',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
          {/* totalCountなし */}
          {barsessions.length === 0 && (
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
          {sorted.map(s => ({
            ...s,
            resolvedName: resolveName(s.caller_name, members) || '不明',
          })).filter((s, idx, arr) =>
            arr.findIndex(x => x.id === s.id) === idx
          ).map(s => {
            const name      = s.resolvedName;
            const color     = callerColorMap[name];
            const active    = isActiveSession(s, todayStr);
            const dispStart = s.start_no ?? 1;
            const dispEnd   = s.end_no ?? totalCount;
            const isEditing = editingId === s.id;

            const handleEdit = () => {
              setEditingId(s.id);
              setEditStart(String(s.start_no ?? ''));
              setEditEnd(String(s.end_no ?? ''));
            };
            const handleCancel = () => { setEditingId(null); setEditStart(''); setEditEnd(''); };
            const handleSave = async () => {
              const sn = parseInt(editStart, 10);
              const en = parseInt(editEnd, 10);
              if (isNaN(sn) || sn < 1 || isNaN(en) || en < sn) {
                alert('正しい番号を入力してください（開始 ≤ 終了）');
                return;
              }
              setSaving(true);
              try {
                await updateSessionRange(s.id, sn, en);
                onUpdateRange(s.id, sn, en);
                handleCancel();
              } catch (e) {
                alert('保存に失敗しました: ' + e.message);
              } finally {
                setSaving(false);
              }
            };
            const handleDelete = async () => {
              if (!window.confirm('このセッション履歴を削除しますか？')) return;
              try {
                await deleteSession(s.id);
                onDeleteSession(s.id);
              } catch (e) {
                alert('削除に失敗しました: ' + e.message);
              }
            };

            const colors = callerColorMap[name];

            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                  background: `linear-gradient(to right, ${colors.dark} 50%, ${colors.light} 50%)`,
                  opacity: active ? 1 : 0.6,
                }} />
                <span style={{ fontSize: 10, color: C.textMid, whiteSpace: 'nowrap' }}>
                  {name}
                  {!isEditing && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.textLight, marginLeft: 3 }}>
                      {dispStart.toLocaleString()}〜{dispEnd.toLocaleString()}
                      {s.last_called_no != null && (
                        <span style={{ color: C.navy, fontWeight: 600, marginLeft: 3 }}>
                          → {s.last_called_no}番まで架電済
                        </span>
                      )}
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
                {/* 編集 / 削除 ボタン */}
                {!isEditing && (
                  <>
                    <button onClick={handleEdit} title="範囲を編集" style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 10, padding: '0 2px', lineHeight: 1,
                    }}>編集</button>
                    <button onClick={handleDelete} title="セッションを削除" style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 10, padding: '0 2px', lineHeight: 1,
                    }}>削除</button>
                  </>
                )}
                {/* インライン編集UI */}
                {isEditing && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: C.textLight }}>開始:</span>
                    <input
                      type="number" value={editStart} onChange={e => setEditStart(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
                      autoFocus
                      style={{ width: 56, padding: '2px 4px', borderRadius: 4, border: '1px solid ' + C.navy, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: 'center', outline: 'none' }}
                    />
                    <span style={{ fontSize: 9, color: C.textLight }}>〜 終了:</span>
                    <input
                      type="number" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
                      style={{ width: 56, padding: '2px 4px', borderRadius: 4, border: '1px solid ' + C.navy, fontSize: 10, fontFamily: "'JetBrains Mono'", textAlign: 'center', outline: 'none' }}
                    />
                    <button onClick={handleSave} disabled={saving} style={{
                      padding: '2px 7px', borderRadius: 4, border: 'none', cursor: saving ? 'default' : 'pointer',
                      background: C.navy, color: C.white, fontSize: 9, fontWeight: 700,
                    }}>{saving ? '...' : '保存'}</button>
                    <button onClick={handleCancel} disabled={saving} style={{
                      padding: '2px 6px', borderRadius: 4, border: '1px solid ' + C.border,
                      background: C.white, color: C.textMid, fontSize: 9, cursor: 'pointer',
                    }}>✕</button>
                  </span>
                )}
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
export default function LiveStatusView({ now, members, isAdmin = false, isTeamLeader = false, orgId }) {
  const isMobile = useIsMobile();
  const [sessions, setSessions]             = useState([]);
  const [calledCounts, setCalledCounts]     = useState({});
  // 過去日セクションはデフォルト折りたたみ（today = key 0 はデフォルト展開）
  const [collapsed, setCollapsed]           = useState({ 1: true, 2: true });
  // 削除済みセッションIDを記録（ポーリングでの復活防止）
  const deletedIdsRef = React.useRef(new Set());

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
      // ローカルで削除済みのセッションを除外（DB反映ラグ対策）
      const filtered = raw.filter(s => !deletedIdsRef.current.has(s.id));
      setSessions(filtered);

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

    if (!orgId) return;
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [orgId]); // orgId確定後にフェッチ開始

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
        const aActive = a.some(s => isActiveSession(s, dateStr));
        const bActive = b.some(s => isActiveSession(s, dateStr));
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
      <PageHeader
        eyebrow="Sourcing · ライブ"
        title="Live Status"
        description="リアルタイム架電状況"
        style={{ marginBottom: isMobile ? 16 : 24 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {dayGroups.map(({ key, label, date, cards }) => {
          const isToday     = key === 0;
          const isCollapsed = !!collapsed[key];
          const activeCards = cards.filter(ss => ss.some(s => isActiveSession(s, todayStr)));

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
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    {cards.map((cardSessions, i) => (
                      <ListCard
                        key={cardSessions[0].list_supa_id || cardSessions[0].list_id || i}
                        sessions={cardSessions}
                        calledCountMap={calledCounts}
                        todayStr={todayStr}
                        members={members}
                        onUpdateRange={(sessionId, startNo, endNo) => {
                          setSessions(prev => prev.map(s =>
                            s.id === sessionId ? { ...s, start_no: startNo, end_no: endNo } : s
                          ));
                        }}
                        onDeleteSession={(sessionId) => {
                          deletedIdsRef.current.add(sessionId);
                          setSessions(prev => prev.filter(s => s.id !== sessionId));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '24px', textAlign: 'center',
                    color: C.textLight, fontSize: 12,
                    background: C.white, borderRadius: 4,
                    border: '1px solid #E5E7EB',
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
