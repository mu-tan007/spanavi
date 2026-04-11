import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import {
  fetchRoleplayBookings,
  fetchAllRoleplayBookings,
  insertRoleplayBooking,
  deleteRoleplayBooking,
  invokeSendEmail,
} from '../../lib/supabaseWrite';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function RoleplayView({ currentUser, userId }) {
  // ===== AI ロープレ =====
  const patterns = [
    { id: "strict_reception", label: "厳しい受付" },
    { id: "gentle_ceo", label: "優しい社長" },
    { id: "busy_ceo", label: "忙しい社長" },
    { id: "interested_ceo", label: "興味ある社長" },
    { id: "claim_ceo", label: "クレーム気質の社長" },
  ];
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const chatBottomRef = React.useRef(null);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const handleStartRoleplay = () => {
    if (!selectedPattern) return;
    const label = patterns.find(p => p.id === selectedPattern)?.label || '';
    setChatStarted(true);
    setChatMessages([{ role: 'ai', text: `【${label}】モードでロープレを開始します。話しかけてください。` }]);
  };
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: chatInput.trim() }]);
    setChatInput('');
    setTimeout(() => setChatMessages(prev => [...prev, { role: 'ai', text: '（AIロープレ機能は準備中です）' }]), 500);
  };

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
  const [selectedDay, setSelectedDay] = useState(0);
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

  // 空き時間取得
  const fetchBusy = async () => {
    setLoadingBusy(true);
    setGcalError(null);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

  // マウント時に自動取得（OAuth 不要）
  useEffect(() => { fetchBusy(); }, []);

  // 7日分の日付リスト
  const days = useMemo(() => {
    const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7 + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { dateStr: ds, label: `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
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
  const isBooked = (startISO) => bookings.some(b => b.startISO === startISO);
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
      // メール通知（非同期・失敗してもブロックしない）
      const emailBody = `${currentUser || 'インターン生'}さんがロープレを予約しました。\n\n日時: ${confirmSlot.dayLabel} ${confirmSlot.startLabel}〜${confirmSlot.endLabel}\n予約者メール: ${modalEmail || '未入力'}`;
      const recipients = ['shinomiya@ma-sp.co', ...(modalEmail ? [modalEmail] : [])];
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
        await fetchBusy();
      } catch (e) { /* ローカルからは削除する */ }
    }
    setBookings(prev => prev.filter(b => b.id !== booking.id));
    setAllBookings(prev => prev.filter(b => b.id !== booking.id));
    deleteRoleplayBooking(booking.id, userId);
    // キャンセル通知メール（非同期・失敗してもブロックしない）
    const cancelBody = `${booking.userName || 'インターン生'}さんがロープレ予約をキャンセルしました。\n\n日時: ${booking.dayLabel} ${booking.startLabel}〜${booking.endLabel}`;
    const recipients = ['shinomiya@ma-sp.co', ...(booking.attendeeEmail ? [booking.attendeeEmail] : [])];
    recipients.forEach(to => invokeSendEmail({ to, subject: `【ロープレキャンセル】${booking.dayLabel} ${booking.startLabel}〜 ${booking.userName || 'インターン生'}`, body: cancelBody }).catch(() => {}));
  };

  const currentDaySlots = getSlots(days[selectedDay]?.dateStr || '');

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 8, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Role Play</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>ロープレトレーニング管理</div>
      </div>

      <div style={{ display: "flex", gap: 20, minHeight: 520, position: "relative" }}>

        {/* 左: AIロープレ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D2247', borderBottom: '2px solid #0D2247', paddingBottom: 6 }}>AIロープレ</h2>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4,
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2247', marginBottom: 6 }}>工事中</div>
              <div style={{ fontSize: 12, color: C.textLight }}>近日実装予定</div>
            </div>
          </div>
        </div>

        {/* 右: 代表とのロープレ予約 */}
        <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D2247', borderBottom: '2px solid #0D2247', paddingBottom: 6 }}>代表とのロープレ予約</h2>

          {gcalError && (
            <div style={{ fontSize: 11, color: '#DC2626', background: '#DC26261a',
              padding: "6px 10px", borderRadius: 4 }}>
              {gcalError}
            </div>
          )}

          {/* 日付タブ */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: '#F8F9FA', borderBottom: "1px solid #E5E7EB", gap: 8 }}>
              <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(0); }}
                disabled={weekOffset === 0}
                style={{ background: '#fff', color: '#0D2247', border: '1px solid #D1D5DB', borderRadius: 3, padding: '3px 6px', fontSize: 9, fontWeight: 500, cursor: weekOffset === 0 ? 'default' : 'pointer',
                  flexShrink: 0, fontFamily: "'Noto Sans JP'",
                  opacity: weekOffset === 0 ? 0.4 : 1 }}>
                ← 前週
              </button>
              <div style={{ display: "flex", overflowX: "auto", flex: 1 }}>
                {days.map((day, i) => (
                  <button key={i} onClick={() => setSelectedDay(i)}
                    style={{ padding: "7px 10px", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                      background: "transparent",
                      color: selectedDay === i ? '#0D2247' : (day.isWeekend ? C.red : C.textMid),
                      fontSize: 10, fontWeight: selectedDay === i ? 700 : 400,
                      borderBottom: "2px solid " + (selectedDay === i ? '#0D2247' : "transparent"),
                      fontFamily: "'Noto Sans JP'" }}>
                    {day.label}
                  </button>
                ))}
              </div>
              <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(0); }}
                disabled={weekOffset >= 3}
                style={{ background: '#fff', color: '#0D2247', border: '1px solid #D1D5DB', borderRadius: 3, padding: '3px 6px', fontSize: 9, fontWeight: 500, cursor: weekOffset >= 3 ? 'default' : 'pointer',
                  flexShrink: 0, fontFamily: "'Noto Sans JP'",
                  opacity: weekOffset >= 3 ? 0.4 : 1 }}>
                次週 →
              </button>
            </div>

            {/* スロット一覧 */}
            <div style={{ padding: 12, maxHeight: 280, overflowY: "auto" }}>
              {loadingBusy ? (
                <div style={{ textAlign: "center", padding: 20, color: C.textLight, fontSize: 12 }}>読み込み中...</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                  {currentDaySlots.map((slot, si) => {
                    const busy = isBusy(slot.startISO, slot.endISO);
                    const booked = isBooked(slot.startISO);
                    const past = isPast(slot.startISO);
                    const disabled = busy || past;
                    return (
                      <button key={si}
                        onClick={() => !disabled && !booked && setConfirmSlot({ ...slot, dayLabel: days[selectedDay].label })}
                        disabled={disabled || booked}
                        style={{ padding: "5px 0", borderRadius: 4, fontSize: 10, fontWeight: 600, textAlign: "center",
                          cursor: disabled || booked ? "default" : "pointer",
                          border: booked ? "1.5px solid #0D2247" : (disabled ? "1px solid #E5E7EB" : "1.5px solid #1E40AF"),
                          background: booked ? '#0D2247' : (disabled ? '#F8F9FA' : '#1E40AF1a'),
                          color: booked ? '#fff' : (disabled ? '#9CA3AF' : '#0D2247'),
                          fontFamily: "'JetBrains Mono', monospace" }}>
                        {slot.startLabel}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 9, color: C.textLight, alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1E40AF1a', border: "1.5px solid #1E40AF", display: "inline-block" }} />空き
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#F8F9FA', border: "1px solid #E5E7EB", display: "inline-block" }} />予定あり
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0D2247', display: "inline-block" }} />予約済
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <button onClick={() => fetchBusy()} disabled={loadingBusy}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid #E5E7EB",
                      background: "transparent", color: C.textMid, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                    {loadingBusy ? '読込中...' : '更新'}
                  </button>
                </span>
              </div>
            </div>
          </div>

          {/* 予約完了メッセージ */}
          {bookingSuccessMsg && (
            <div style={{ background: "#f0faf4", border: "1px solid #34a853", borderRadius: 4,
              padding: "10px 14px", fontSize: 12, fontWeight: 600, color: C.green }}>
              {bookingSuccessMsg}
            </div>
          )}

          {/* 予約済み一覧（全メンバー・本日以降） */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: '#0D2247', padding: "8px 14px", fontSize: 11, fontWeight: 700, color: '#fff' }}>
              予約済み一覧 {allBookings.length > 0 && <span style={{ opacity: 0.7, fontSize: 10 }}>({allBookings.length}件)</span>}
            </div>
            {allBookings.length === 0 ? (
              <div style={{ padding: "16px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>予約はありません</div>
            ) : (
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {allBookings.map(b => {
                  const isOwn = b.userId === userId;
                  return (
                    <div key={b.id} style={{ padding: "8px 14px", borderBottom: "1px solid #E5E7EB",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: isOwn ? '#F0F4FF' : 'transparent' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#0D2247' }}>{b.dayLabel}</span>
                          <span style={{ fontSize: 10, color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>
                            {b.startLabel} – {b.endLabel}
                          </span>
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
              <div style={{ background: '#0D2247', color: '#fff', padding: '12px 24px', fontWeight: 600, fontSize: 15, borderRadius: '4px 4px 0 0', margin: '-28px -32px 20px -32px' }}>ロープレを予約する</div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
                <strong style={{ color: '#0D2247' }}>{confirmSlot.dayLabel}</strong>
                {'　'}
                <strong style={{ color: '#0D2247', fontFamily: "'JetBrains Mono', monospace" }}>
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
                  style={{ flex: 1, background: bookingLoading ? '#E5E7EB' : '#0D2247', color: bookingLoading ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: bookingLoading ? "default" : "pointer",
                    fontFamily: "'Noto Sans JP'" }}>
                  {bookingLoading ? '予約中...' : '予約する'}
                </button>
                <button onClick={() => setConfirmSlot(null)}
                  style={{ flex: 1, background: '#fff', color: '#0D2247', border: '1px solid #0D2247', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
