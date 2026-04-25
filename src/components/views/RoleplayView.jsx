import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import PageHeader from '../common/PageHeader';
import TrainingRoleplaySection from './TrainingRoleplaySection';
import {
  fetchRoleplayBookings,
  fetchAllRoleplayBookings,
  insertRoleplayBooking,
  deleteRoleplayBooking,
  invokeSendEmail,
} from '../../lib/supabaseWrite';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const NAVY = '#0D2247';
const GOLD = '#C9A96E';
const FREE_BG = '#E8EDF5';
const HOVER_BG = '#D0D8E8';
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function RoleplayView({ currentUser, userId, members = [], isAdmin = false }) {
  // ===== Google Calendar (Edge Function 経由) =====
  const [busySlots, setBusySlots] = useState(null);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [confirmSlot, setConfirmSlot] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  // Supabase Auth からメールアドレス自動取得
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // confirmSlot が開いたとき取得済みメールをモーダルに設定
  useEffect(() => {
    if (confirmSlot) setModalEmail(userEmail || '');
  }, [confirmSlot]);

  // ロープレ予約を Supabase から取得
  useEffect(() => {
    if (userId) {
      fetchRoleplayBookings(userId).then(({ data }) => {
        setBookings(data || []);
      }).catch(() => {});
    }
    fetchAllRoleplayBookings().then(({ data }) => {
      setAllBookings(data || []);
    }).catch(() => {});
  }, [userId]);

  // gcal-proxy Edge Function 呼び出しヘルパー
  const gcalFetch = (path, options = {}) =>
    fetch(`${SUPABASE_URL}/functions/v1/gcal-proxy${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

  // 空き時間取得（表示中の週にあわせて範囲を動かす）
  const fetchBusy = async () => {
    setLoadingBusy(true);
    setGcalError(null);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7);
    const timeMin = base.toISOString();
    const timeMax = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const res = await gcalFetch(`?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'fetch failed');
      setBusySlots(data.busy || []);
    } catch (e) {
      setGcalError('カレンダーの取得に失敗しました');
    } finally {
      setLoadingBusy(false);
    }
  };

  // 週が変わったら busy 再取得
  useEffect(() => { fetchBusy(); /* eslint-disable-next-line */ }, [weekOffset]);

  // 7日分の日付リスト
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7 + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        dateStr: ds,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        dayLabel: DAY_LABELS[d.getDay()],
        longLabel: `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [weekOffset]);

  // 30分枠生成 (9:00-21:00)
  const getSlots = (dateStr) => {
    const slots = [];
    for (let h = 9; h < 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        const eh = m + 30 >= 60 ? h + 1 : h;
        const em = (m + 30) % 60;
        const sl = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const el = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        slots.push({
          startISO: `${dateStr}T${sl}:00+09:00`,
          endISO: `${dateStr}T${el}:00+09:00`,
          startLabel: sl,
          endLabel: el,
        });
      }
    }
    return slots;
  };

  // 各予定の前後90分バッファを加えたブロックを計算（重複はマージ）
  const bufferedBusyBlocks = useMemo(() => {
    if (!busySlots || busySlots.length === 0) return [];
    const BUFFER = 90 * 60 * 1000;
    const blocks = busySlots.map(b => ({
      s: new Date(b.start).getTime() - BUFFER,
      e: new Date(b.end).getTime() + BUFFER,
    })).sort((a, b) => a.s - b.s);
    const merged = [blocks[0]];
    for (let i = 1; i < blocks.length; i++) {
      const last = merged[merged.length - 1];
      if (blocks[i].s <= last.e) {
        last.e = Math.max(last.e, blocks[i].e);
      } else {
        merged.push({ ...blocks[i] });
      }
    }
    return merged;
  }, [busySlots]);

  const isBusy = (startISO, endISO) => {
    if (!busySlots) return false;
    const s = new Date(startISO).getTime(), e = new Date(endISO).getTime();
    return bufferedBusyBlocks.some(b => s < b.e && e > b.s);
  };
  const isPast = (startISO) => new Date(startISO) < new Date();

  // イベント作成
  const handleBook = async () => {
    if (!confirmSlot) return;
    setBookingLoading(true);
    setGcalError(null);
    const title = `ロープレ - ${currentUser || 'インターン生'}`;
    const eventBody = {
      summary: title,
      start: { dateTime: confirmSlot.startISO, timeZone: 'Asia/Tokyo' },
      end: { dateTime: confirmSlot.endISO, timeZone: 'Asia/Tokyo' },
      description: 'Spanavi ロープレ予約',
      attendees: [
        ...(modalEmail ? [{ email: modalEmail }] : []),
        { email: 'shinomiya@ma-sp.co' },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };
    try {
      const res = await gcalFetch('', { method: 'POST', body: JSON.stringify(eventBody) });
      const data = await res.json();
      if (!res.ok) {
        setGcalError(`予約に失敗しました: ${data.error || res.status}`);
        return;
      }
      const nb = {
        id: data.eventId,
        userId,
        userName: currentUser || 'インターン生',
        title,
        startISO: confirmSlot.startISO,
        endISO: confirmSlot.endISO,
        dayLabel: confirmSlot.dayLabel,
        startLabel: confirmSlot.startLabel,
        endLabel: confirmSlot.endLabel,
        attendeeEmail: modalEmail,
      };
      setBookings(prev => [...prev, nb]);
      setAllBookings(prev => [...prev, nb].sort((a, b) => a.startISO.localeCompare(b.startISO)));
      insertRoleplayBooking(userId, nb);
      await fetchBusy();
      const emailBody = `${currentUser || 'インターン生'}さんがロープレを予約しました。\n\n日時: ${confirmSlot.dayLabel} ${confirmSlot.startLabel}〜${confirmSlot.endLabel}\n予約者メール: ${modalEmail || '未入力'}`;
      const recipients = [...new Set(['shinomiya@ma-sp.co', ...(modalEmail ? [modalEmail] : [])])];
      recipients.forEach(to => invokeSendEmail({ to, subject: `【ロープレ予約】${confirmSlot.dayLabel} ${confirmSlot.startLabel}〜 ${currentUser || 'インターン生'}`, body: emailBody }).catch(() => {}));
      setBookingSuccessMsg('Googleカレンダーに登録しました');
      setTimeout(() => setBookingSuccessMsg(''), 4000);
      setConfirmSlot(null);
    } catch (e) {
      setGcalError('予約の作成に失敗しました: ' + e.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // イベント削除
  const handleCancel = async (booking) => {
    if (booking.id) {
      try {
        await gcalFetch(`?eventId=${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
      } catch (e) { /* GCal削除失敗してもDB削除は続行 */ }
    }
    const err = await deleteRoleplayBooking(booking.id);
    if (err) {
      console.error('[RoleplayView] DB削除失敗:', err);
    }
    if (userId) {
      fetchRoleplayBookings(userId).then(({ data }) => setBookings(data || []));
    }
    fetchAllRoleplayBookings().then(({ data }) => setAllBookings(data || []));
    await fetchBusy();
    const cancelBody = `${booking.userName || 'インターン生'}さんがロープレ予約をキャンセルしました。\n\n日時: ${booking.dayLabel} ${booking.startLabel}〜${booking.endLabel}`;
    const recipients = [...new Set(['shinomiya@ma-sp.co', ...(booking.attendeeEmail ? [booking.attendeeEmail] : [])])];
    recipients.forEach(to => invokeSendEmail({ to, subject: `【ロープレキャンセル】${booking.dayLabel} ${booking.startLabel}〜 ${booking.userName || 'インターン生'}`, body: cancelBody }).catch(() => {}));
  };

  // 予約済みチェック（全メンバー分）
  const findBookingAt = (startISO) => allBookings.find(b => b.startISO === startISO);

  // 参照用スロット（時間ラベル列で使う）
  const refSlots = useMemo(() => getSlots(days[0]?.dateStr || ''), [days]);

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        eyebrow="研修 · ロープレ"
        title="Role Play"
        description="ロープレ予約・履歴"
      />

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", position: "relative" }}>

        {/* 左 (8): 週グリッドカレンダー */}
        <div style={{ flex: 8, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6 }}>
            代表とのロープレ予約
          </h2>

          {gcalError && (
            <div style={{ fontSize: 11, color: '#DC2626', background: '#DC26261a', padding: "6px 10px", borderRadius: 4 }}>
              {gcalError}
            </div>
          )}

          {/* 週ナビ + 凡例 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'Noto Sans JP'" }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setWeekOffset(w => w - 1)}
                style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 3, cursor: 'pointer', padding: '3px 10px', fontSize: 12, color: NAVY, fontWeight: 600 }}>
                &lt;
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, minWidth: 110, textAlign: 'center' }}>
                {days[0]?.label} ~ {days[6]?.label}
              </span>
              <button onClick={() => setWeekOffset(w => w + 1)}
                style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 3, cursor: 'pointer', padding: '3px 10px', fontSize: 12, color: NAVY, fontWeight: 600 }}>
                &gt;
              </button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6B7280', textDecoration: 'underline', marginLeft: 4 }}>
                  今週
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, alignItems: 'center', color: C.textMid }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: FREE_BG, border: '1px solid #D0D8E8', borderRadius: 2 }} />空き
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: NAVY, borderRadius: 2 }} />予約済（自分）
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: GOLD, borderRadius: 2 }} />予約済（他）
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: NAVY, opacity: 0.15, borderRadius: 2 }} />予定あり
              </span>
              <button onClick={fetchBusy} disabled={loadingBusy}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #E5E7EB', background: 'transparent', color: C.textMid, cursor: 'pointer', fontFamily: "'Noto Sans JP'", marginLeft: 6 }}>
                {loadingBusy ? '読込中...' : '更新'}
              </button>
            </div>
          </div>

          {/* 週グリッド */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden', fontFamily: "'Noto Sans JP'" }}>
            <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', fontSize: 10 }}>
              {/* ヘッダ行 */}
              <div style={{ background: NAVY, padding: '6px 2px' }} />
              {days.map(d => (
                <div key={d.dateStr}
                  style={{ background: NAVY, color: d.isWeekend ? '#FCA5A5' : '#fff', padding: '6px 2px', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 11 }}>{d.label}</div>
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{d.dayLabel}</div>
                </div>
              ))}

              {/* 時間行 */}
              {refSlots.map((refSlot, si) => {
                const onHour = refSlot.startLabel.endsWith(':00');
                return (
                  <div key={si} style={{ display: 'contents' }}>
                    {/* 時間ラベル */}
                    <div style={{
                      padding: '0 6px',
                      textAlign: 'right',
                      color: '#6B7280',
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      borderBottom: '1px solid #F3F4F6',
                      borderRight: '1px solid #E5E7EB',
                      background: '#FAFBFC',
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}>
                      {onHour ? refSlot.startLabel : ''}
                    </div>

                    {/* 各日のセル */}
                    {days.map(d => {
                      const slots = getSlots(d.dateStr);
                      const slot = slots[si];
                      if (!slot) return <div key={d.dateStr} />;

                      const past = isPast(slot.startISO);
                      const booking = findBookingAt(slot.startISO);
                      const ownBooked = booking && booking.userId === userId;
                      const otherBooked = booking && booking.userId !== userId;
                      const busy = !booking && isBusy(slot.startISO, slot.endISO);

                      let bg = FREE_BG;
                      let label = '';
                      let labelColor = '';
                      let cursor = 'pointer';

                      if (past && !booking) {
                        bg = '#F9FAFB';
                        cursor = 'default';
                      } else if (ownBooked) {
                        bg = NAVY;
                        label = '自分';
                        labelColor = '#fff';
                        cursor = 'default';
                      } else if (otherBooked) {
                        bg = GOLD + '33';
                        label = booking.userName || '他';
                        labelColor = '#8B6914';
                        cursor = 'default';
                      } else if (busy) {
                        bg = NAVY + '26';
                        cursor = 'default';
                      }

                      const canSelect = !past && !booking && !busy;

                      return (
                        <div key={d.dateStr}
                          onClick={() => canSelect && setConfirmSlot({ ...slot, dayLabel: d.longLabel })}
                          onMouseEnter={e => { if (canSelect) e.currentTarget.style.background = HOVER_BG; }}
                          onMouseLeave={e => { if (canSelect) e.currentTarget.style.background = FREE_BG; }}
                          title={
                            booking ? `${booking.userName || ''} ${slot.startLabel}-${slot.endLabel}`
                            : past ? '過去'
                            : busy ? '予定あり'
                            : `${d.longLabel} ${slot.startLabel}`
                          }
                          style={{
                            background: bg,
                            height: 22,
                            cursor,
                            borderBottom: onHour ? '1px solid #E5E7EB' : '1px solid #F3F4F6',
                            borderLeft: '1px solid #E8EDF5',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'background 0.1s',
                          }}>
                          {label && (
                            <span style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              fontWeight: 700,
                              color: labelColor,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              padding: '0 2px',
                            }}>
                              {label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {bookingSuccessMsg && (
            <div style={{ background: "#f0faf4", border: "1px solid #34a853", borderRadius: 4,
              padding: "10px 14px", fontSize: 12, fontWeight: 600, color: C.green }}>
              {bookingSuccessMsg}
            </div>
          )}
        </div>

        {/* 右 (2): 予約済み一覧 */}
        <div style={{ flex: 2, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6 }}>
            予約済み一覧 {allBookings.length > 0 && <span style={{ fontWeight: 400, color: C.textMid, fontSize: 11 }}>({allBookings.length}件)</span>}
          </h2>

          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, overflow: "hidden" }}>
            {allBookings.length === 0 ? (
              <div style={{ padding: "16px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>予約はありません</div>
            ) : (
              <div style={{ maxHeight: 640, overflowY: "auto" }}>
                {allBookings.map(b => {
                  const isOwn = b.userId === userId;
                  return (
                    <div key={b.id} style={{ padding: "10px 14px", borderBottom: "1px solid #E5E7EB",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: isOwn ? '#F0F4FF' : 'transparent' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{b.dayLabel}</div>
                        <div style={{ fontSize: 10, color: C.textMid, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
                          {b.startLabel} – {b.endLabel}
                        </div>
                        <div style={{ fontSize: 10, color: isOwn ? '#1E40AF' : '#6B7280', fontWeight: isOwn ? 600 : 400, marginTop: 2 }}>
                          {b.userName || '不明'}{isOwn ? '（自分）' : ''}
                        </div>
                      </div>
                      {isOwn && (
                        <button onClick={() => handleCancel(b)}
                          style={{ background: '#fff', color: '#DC2626', border: '1px solid #DC2626', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>
                          キャンセル
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 予約確認モーダル */}
        {confirmSlot && (
          <div onClick={() => setConfirmSlot(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: "28px 32px", width: 340 }}>
              <div style={{ background: NAVY, color: '#fff', padding: '12px 24px', fontWeight: 600, fontSize: 15, borderRadius: '4px 4px 0 0', margin: '-28px -32px 20px -32px' }}>ロープレを予約する</div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
                <strong style={{ color: NAVY }}>{confirmSlot.dayLabel}</strong>
                {'　'}
                <strong style={{ color: NAVY, fontFamily: "'JetBrains Mono', monospace" }}>
                  {confirmSlot.startLabel} – {confirmSlot.endLabel}
                </strong>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 5 }}>
                  メールアドレス（通知送付先）
                </label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={e => setModalEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 4,
                    border: "1px solid #E5E7EB", fontSize: 12, outline: "none",
                    fontFamily: "'Noto Sans JP'", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 9, color: C.textLight, marginTop: 4 }}>
                  予約30分前にメール・10分前にポップアップ通知が届きます
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleBook} disabled={bookingLoading}
                  style={{ flex: 1, background: bookingLoading ? '#E5E7EB' : NAVY, color: bookingLoading ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: bookingLoading ? "default" : "pointer",
                    fontFamily: "'Noto Sans JP'" }}>
                  {bookingLoading ? '予約中...' : '予約する'}
                </button>
                <button onClick={() => setConfirmSlot(null)}
                  style={{ flex: 1, background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ロープレ履歴（録音アップロード・AI分析） */}
      <RoleplayHistorySection currentUser={currentUser} userId={userId} members={members} isAdmin={isAdmin} />
    </div>
  );
}

// ロープレ履歴の折り畳みラッパー
function RoleplayHistorySection({ currentUser, userId, members, isAdmin }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: C.white, border: '1px solid #E5E7EB', borderRadius: 4, marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700, color: NAVY, textAlign: 'left',
        }}
      >
        <span>ロープレ履歴</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px 20px', borderTop: '1px solid #F3F4F6' }}>
          <TrainingRoleplaySection
            currentUser={currentUser}
            userId={userId}
            members={members}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
