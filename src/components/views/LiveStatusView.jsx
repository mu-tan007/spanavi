import { useState, useEffect, useMemo } from "react";
import { C } from '../../constants/colors';
import { fetchAllCallSessionsWithClients } from '../../lib/supabaseWrite';

// JST の "YYYY/MM/DD" 文字列に変換（日付比較用）
const toJSTDateStr = (d) =>
  new Date(d).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  });

// M/D 形式
const toMD = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' });
};

// 稼働中判定: finished_at が NULL かつ started_at が今日（JST）
const isActiveSession = (s, todayStr) =>
  !s.finished_at && toJSTDateStr(s.started_at) === todayStr;

export default function LiveStatusView({ now }) {
  const [sessions, setSessions] = useState([]);
  const [collapsed, setCollapsed] = useState({});

  const todayStr = useMemo(() => toJSTDateStr(now), [now]);

  useEffect(() => {
    const load = async () => {
      const { data } = await fetchAllCallSessionsWithClients();
      if (data) setSessions(data);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // クライアントごとにグループ化（稼働中クライアントを先頭に）
  const clientGroups = useMemo(() => {
    const groups = {};
    sessions.forEach(s => {
      const key = s.clientId || '__unknown__';
      if (!groups[key]) {
        groups[key] = { clientId: key, clientName: s.clientName || '未設定', sessions: [] };
      }
      groups[key].sessions.push(s);
    });

    return Object.values(groups).sort((a, b) => {
      const aActive = a.sessions.some(s => isActiveSession(s, todayStr));
      const bActive = b.sessions.some(s => isActiveSession(s, todayStr));
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.clientName.localeCompare(b.clientName, 'ja');
    });
  }, [sessions, todayStr]);

  const toggleCollapse = (key) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy, fontFamily: "'Noto Serif JP', serif" }}>
          架電状況ボード
        </h2>
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
          クライアント別・全履歴表示
        </div>
      </div>

      {clientGroups.length === 0 ? (
        <div style={{
          background: C.white, borderRadius: 10, padding: '32px 40px',
          border: '1px solid ' + C.borderLight, textAlign: 'center',
          boxShadow: '0 1px 4px rgba(26,58,92,0.04)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📞</div>
          <div style={{ fontSize: 13, color: C.textMid }}>架電記録がありません</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clientGroups.map(group => {
            const activeSessions = group.sessions.filter(s => isActiveSession(s, todayStr));
            const hasActive = activeSessions.length > 0;
            const isOpen = !collapsed[group.clientId];

            // 最終架電日（最も新しい last_called_at or started_at）
            const latestDate = group.sessions.reduce((best, s) => {
              const d = s.last_called_at || s.started_at;
              return !best || d > best ? d : best;
            }, null);

            return (
              <div key={group.clientId} style={{
                borderRadius: 8,
                border: '1px solid ' + (hasActive ? C.green + '66' : C.borderLight),
                overflow: 'hidden',
                boxShadow: hasActive
                  ? '0 0 0 2px ' + C.green + '22'
                  : '0 1px 4px rgba(26,58,92,0.04)',
              }}>
                {/* 第1層: クライアントヘッダー */}
                <button
                  onClick={() => toggleCollapse(group.clientId)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: hasActive ? C.green + '10' : C.offWhite,
                    border: 'none', cursor: 'pointer',
                    fontFamily: "'Noto Sans JP'",
                    borderBottom: isOpen ? '1px solid ' + (hasActive ? C.green + '33' : C.borderLight) : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>
                      {group.clientName}
                    </span>
                    {hasActive ? (
                      <span style={{
                        fontSize: 10, background: C.green + '22', color: C.green,
                        padding: '2px 9px', borderRadius: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: C.green,
                          display: 'inline-block', animation: 'pulse 1.5s infinite',
                        }} />
                        稼働中 {activeSessions.length}名
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textLight }}>
                        最終架電 {toMD(latestDate)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.textLight }}>
                      {group.sessions.length}件
                    </span>
                    <span style={{
                      fontSize: 9, color: C.textLight,
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>▼</span>
                  </div>
                </button>

                {/* 第2層: セッションテーブル */}
                {isOpen && (
                  <div style={{ background: C.white, overflowX: 'auto' }}>
                    <table style={{
                      width: '100%', borderCollapse: 'collapse',
                      fontSize: 12, fontFamily: "'Noto Sans JP'",
                    }}>
                      <thead>
                        <tr style={{ background: C.offWhite }}>
                          {['リスト名', '件数', '担当者', '範囲', '最終架電日', '状態'].map(col => (
                            <th key={col} style={{
                              padding: '7px 12px', textAlign: 'left',
                              fontSize: 10, fontWeight: 700,
                              color: C.textMid, whiteSpace: 'nowrap',
                              borderBottom: '1px solid ' + C.borderLight,
                            }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.sessions.map(s => {
                          const active = isActiveSession(s, todayStr);
                          return (
                            <tr key={s.id} style={{
                              background: active ? C.green + '0d' : 'transparent',
                              borderBottom: '1px solid ' + C.borderLight,
                            }}>
                              {/* リスト名 */}
                              <td style={{ padding: '8px 12px', color: C.navy, fontWeight: 600 }}>
                                {s.list_name || '—'}
                              </td>
                              {/* 件数 */}
                              <td style={{
                                padding: '8px 12px', color: C.textDark,
                                fontFamily: "'JetBrains Mono', monospace",
                              }}>
                                {s.total_count != null
                                  ? Number(s.total_count).toLocaleString()
                                  : '—'}
                              </td>
                              {/* 担当者 */}
                              <td style={{ padding: '8px 12px', color: C.textDark }}>
                                {s.caller_name || '—'}
                              </td>
                              {/* 範囲 */}
                              <td style={{
                                padding: '8px 12px', color: C.textDark,
                                fontFamily: "'JetBrains Mono', monospace",
                                whiteSpace: 'nowrap',
                              }}>
                                {s.start_no != null && s.end_no != null
                                  ? `${s.start_no}〜${s.end_no}`
                                  : '—'}
                              </td>
                              {/* 最終架電日 */}
                              <td style={{
                                padding: '8px 12px', color: C.textDark,
                                whiteSpace: 'nowrap',
                              }}>
                                {toMD(s.last_called_at)}
                              </td>
                              {/* 状態 */}
                              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                {active ? (
                                  <span style={{
                                    fontSize: 10, background: C.green + '22', color: C.green,
                                    padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                  }}>
                                    <span style={{
                                      width: 5, height: 5, borderRadius: '50%',
                                      background: C.green, display: 'inline-block',
                                      animation: 'pulse 1.5s infinite',
                                    }} />
                                    稼働中
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: 10, background: C.offWhite, color: C.textLight,
                                    padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                  }}>
                                    完了
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
