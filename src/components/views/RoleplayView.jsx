import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import {
  fetchRoleplayBookings,
  insertRoleplayBooking,
  deleteRoleplayBooking,
} from '../../lib/supabaseWrite';

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

  // ===== Google Calendar =====
  const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const GCAL_CAL_ID = import.meta.env.VITE_GOOGLE_CALENDAR_ID || 'primary';
  const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar email';
  const TOKEN_KEY = 'gcal_token_v1';
  const loadToken = () => {
    try {
      const d = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (!d) return null;
      if (Date.now() > d.exp) { localStorage.removeItem(TOKEN_KEY); return null; }
      return d.token;
    } catch(e) { return null; }
  };

  const [gcalToken, setGcalToken] = useState(loadToken);
  const [busySlots, setBusySlots] = useState(null);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [confirmSlot, setConfirmSlot] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');
  const [userEmail, setUserEmail] = useState(() => {
    try { return localStorage.getItem('gcal_user_email') || ''; } catch(e) { return ''; }
  });
  const [modalEmail, setModalEmail] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const tokenClientRef = React.useRef(null);
  const pendingRefreshRef = React.useRef(null); // silentRefresh の Promise コールバック

  // Google Identity Services 初期化
  useEffect(() => {
    if (!GCAL_CLIENT_ID) return;
    const init = () => {
      if (!window.google?.accounts?.oauth2) return false;
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GCAL_CLIENT_ID,
        scope: GCAL_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            setGcalError('認証エラー: ' + (resp.error_description || resp.error));
            if (pendingRefreshRef.current) {
              pendingRefreshRef.current.reject(new Error(resp.error));
              pendingRefreshRef.current = null;
            }
            return;
          }
          if (resp.access_token) {
            const data = { token: resp.access_token, exp: Date.now() + 55 * 60 * 1000 };
            try { localStorage.setItem(TOKEN_KEY, JSON.stringify(data)); } catch(e) {}
            setGcalToken(resp.access_token);
            setGcalError(null);
            if (pendingRefreshRef.current) {
              pendingRefreshRef.current.resolve(resp.access_token);
              pendingRefreshRef.current = null;
            }
          }
        },
      });
      return true;
    };
    if (!init()) {
      const timer = setInterval(() => { if (init()) clearInterval(timer); }, 300);
      return () => clearInterval(timer);
    }
  }, [GCAL_CLIENT_ID]);

  // サイレントリフレッシュ（ユーザーが Google にサインイン済みなら UI なしで取得）
  // ※ GIS の implicit flow はリフレッシュトークンを返さないため、
  //    requestAccessToken({ prompt: '' }) でサイレント再取得する
  const silentRefresh = () => new Promise((resolve, reject) => {
    if (!tokenClientRef.current) { reject(new Error('GIS not ready')); return; }
    pendingRefreshRef.current = { resolve, reject };
    tokenClientRef.current.requestAccessToken({ prompt: '' });
  });

  // 有効なアクセストークンを取得（期限 2 分以内なら自動リフレッシュ）
  const ensureValidToken = async () => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch(e) { return null; } })();
    if (stored && Date.now() < stored.exp - 2 * 60 * 1000) return stored.token;
    try {
      return await silentRefresh();
    } catch(e) {
      setGcalToken(null);
      try { localStorage.removeItem(TOKEN_KEY); } catch(e2) {}
      setGcalError('セッションが切れました。再度連携してください。');
      throw e;
    }
  };

  const handleConnect = () => {
    setGcalError(null);
    if (!tokenClientRef.current) {
      setGcalError('Google APIが読み込まれていません。ページを再読み込みしてください。');
      return;
    }
    tokenClientRef.current.requestAccessToken({ prompt: '' });
  };

  const handleDisconnect = () => {
    setGcalToken(null);
    setBusySlots(null);
    setUserEmail('');
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('gcal_user_email'); } catch(e) {}
  };

  // バックグラウンドで期限 5 分前にサイレントリフレッシュ
  useEffect(() => {
    if (!gcalToken) return;
    const stored = (() => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch(e) { return null; } })();
    if (!stored) return;
    const delay = Math.max(0, stored.exp - Date.now() - 5 * 60 * 1000);
    const timer = setTimeout(() => {
      silentRefresh().catch(() => { /* 失敗時は次回 API 呼び出し時に再取得 */ });
    }, delay);
    return () => clearTimeout(timer);
  }, [gcalToken]);

  // FreeBusy 取得（引数なし — ensureValidToken で自動取得）
  const fetchBusy = async () => {
    let token;
    try { token = await ensureValidToken(); } catch(e) { return; }
    setLoadingBusy(true);
    setGcalError(null);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const timeMin = base.toISOString();
    const timeMax = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const buildReq = (t) => fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: GCAL_CAL_ID }] }),
    });
    try {
      let res = await buildReq(token);
      if (res.status === 401) {
        // サイレントリフレッシュを 1 回試みる
        try { token = await silentRefresh(); } catch(e) {
          setGcalToken(null);
          try { localStorage.removeItem(TOKEN_KEY); } catch(e2) {}
          setGcalError('セッションが切れました。再度連携してください。');
          return;
        }
        res = await buildReq(token);
      }
      const d = await res.json();
      setBusySlots(d.calendars?.[GCAL_CAL_ID]?.busy || []);
    } catch(e) {
      setGcalError('カレンダーの取得に失敗しました');
    } finally {
      setLoadingBusy(false);
    }
  };

  useEffect(() => { if (gcalToken) fetchBusy(); }, [gcalToken]);

  // ロープレ予約をSupabaseから取得
  useEffect(() => {
    if (!userId) return;
    fetchRoleplayBookings(userId).then(({ data }) => {
      setBookings(data || []);
    });
  }, [userId]);

  // OAuth後にユーザーのメールアドレスを取得
  useEffect(() => {
    if (!gcalToken) return;
    (async () => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + gcalToken },
        });
        if (res.ok) {
          const d = await res.json();
          if (d.email) {
            setUserEmail(d.email);
            try { localStorage.setItem('gcal_user_email', d.email); } catch(e) {}
          }
        }
      } catch(e) { /* メール取得失敗は無視 */ }
    })();
  }, [gcalToken]);

  // confirmSlotが開いたとき、取得済みメールをモーダル入力欄に設定
  useEffect(() => {
    if (confirmSlot) setModalEmail(userEmail || '');
  }, [confirmSlot]);

  // 7日分の日付リスト
  const days = useMemo(() => {
    const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { dateStr: ds, label: `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, []);

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
    // マージ
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

    // ensureValidToken でトークン取得（期限切れなら自動リフレッシュ）
    let activeToken;
    try { activeToken = await ensureValidToken(); } catch(e) { setConfirmSlot(null); return; }

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

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_CAL_ID)}/events?sendUpdates=all`;
    console.log('[GCal] Creating event:', title, confirmSlot.startISO, '-', confirmSlot.endISO, 'attendees:', eventBody.attendees.map(a => a.email));

    const doPost = (t) => fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });

    try {
      let res = await doPost(activeToken);

      if (res.status === 401) {
        // サイレントリフレッシュを 1 回試みてリトライ
        try { activeToken = await silentRefresh(); } catch(e) {
          setGcalToken(null);
          try { localStorage.removeItem(TOKEN_KEY); } catch(e2) {}
          setGcalError('セッションが切れました。再度連携してください。');
          setConfirmSlot(null);
          return;
        }
        res = await doPost(activeToken);
      }

      const resText = await res.text();
      console.log('[GCal] Response status:', res.status, resText.slice(0, 300));

      if (!res.ok) {
        let errMsg = String(res.status);
        try { errMsg = JSON.parse(resText)?.error?.message || errMsg; } catch(e) {}
        console.error('[GCal] Event creation failed:', res.status, resText);
        setGcalError(`予約に失敗しました (${res.status}): ${errMsg}`);
        return;
      }

      const ev = JSON.parse(resText);
      console.log('[GCal] Event created successfully. id:', ev.id, 'link:', ev.htmlLink);

      const nb = {
        id: ev.id,
        title,
        startISO: confirmSlot.startISO,
        endISO: confirmSlot.endISO,
        dayLabel: confirmSlot.dayLabel,
        startLabel: confirmSlot.startLabel,
        endLabel: confirmSlot.endLabel,
        attendeeEmail: modalEmail,
      };
      setBookings(prev => [...prev, nb]);
      insertRoleplayBooking(userId, nb);
      await fetchBusy();
      setBookingSuccessMsg('✅ Googleカレンダーに登録しました');
      setTimeout(() => setBookingSuccessMsg(''), 4000);
      setConfirmSlot(null);
    } catch(e) {
      console.error('[GCal] handleBook unexpected error:', e);
      setGcalError('予約の作成に失敗しました: ' + e.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // イベント削除
  const handleCancel = async (booking) => {
    if (booking.id) {
      let token = null;
      try { token = await ensureValidToken(); } catch(e) { /* トークン取得失敗でもローカル削除は続行 */ }
      if (token) {
        try {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_CAL_ID)}/events/${booking.id}`,
            { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }
          );
          await fetchBusy();
        } catch(e) { /* ローカルからは削除する */ }
      }
    }
    setBookings(prev => prev.filter(b => b.id !== booking.id));
    deleteRoleplayBooking(booking.id, userId);
  };

  const currentDaySlots = getSlots(days[selectedDay]?.dateStr || '');

  return (
    <div style={{ animation: "fadeIn 0.3s ease", display: "flex", gap: 20, minHeight: 520, position: "relative" }}>

      {/* 左: AIロープレ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.navy }}>AIロープレ</h2>
        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight,
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🚧</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>工事中</div>
            <div style={{ fontSize: 12, color: C.textLight }}>近日実装予定</div>
          </div>
        </div>
      </div>

      {/* 右: 代表とのロープレ予約 */}
      <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.navy }}>代表とのロープレ予約</h2>

        {/* 未連携 */}
        {!gcalToken ? (
          <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: 20 }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
              Googleカレンダーと連携して、代表の空き時間を確認・予約できます。
            </div>
            <button onClick={handleConnect}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 8,
                border: "1.5px solid " + C.borderLight, background: C.white,
                color: C.textDark, fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Noto Sans JP'", width: "100%", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Googleカレンダーと連携
            </button>
            {gcalError && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.red, background: C.redLight,
                padding: "6px 10px", borderRadius: 6 }}>
                {gcalError}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 連携中ヘッダー */}
            <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
                <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>Googleカレンダー連携中</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => fetchBusy()} disabled={loadingBusy}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid " + C.borderLight,
                    background: "transparent", color: C.textMid, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  {loadingBusy ? '読込中...' : '更新'}
                </button>
                <button onClick={handleDisconnect}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid " + C.borderLight,
                    background: "transparent", color: C.textLight, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                  連携解除
                </button>
              </div>
            </div>

            {gcalError && (
              <div style={{ fontSize: 11, color: C.red, background: C.redLight,
                padding: "6px 10px", borderRadius: 6 }}>
                {gcalError}
              </div>
            )}

            {/* 日付タブ */}
            <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
              <div style={{ display: "flex", overflowX: "auto", background: C.offWhite, borderBottom: "1px solid " + C.borderLight }}>
                {days.map((day, i) => (
                  <button key={i} onClick={() => setSelectedDay(i)}
                    style={{ padding: "7px 10px", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                      background: "transparent",
                      color: selectedDay === i ? C.navy : (day.isWeekend ? C.red : C.textMid),
                      fontSize: 10, fontWeight: selectedDay === i ? 700 : 400,
                      borderBottom: "2px solid " + (selectedDay === i ? C.gold : "transparent"),
                      fontFamily: "'Noto Sans JP'" }}>
                    {day.label}
                  </button>
                ))}
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
                          style={{ padding: "5px 0", borderRadius: 5, fontSize: 10, fontWeight: 600, textAlign: "center",
                            cursor: disabled || booked ? "default" : "pointer",
                            border: booked ? "1.5px solid " + C.navy : (disabled ? "1px solid " + C.borderLight : "1.5px solid " + C.gold),
                            background: booked ? C.navy : (disabled ? C.offWhite : C.goldGlow),
                            color: booked ? C.white : (disabled ? C.textLight : C.navy),
                            fontFamily: "'JetBrains Mono', monospace" }}>
                          {slot.startLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 9, color: C.textLight }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.goldGlow, border: "1.5px solid " + C.gold, display: "inline-block" }} />空き
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.offWhite, border: "1px solid " + C.borderLight, display: "inline-block" }} />予定あり
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: C.navy, display: "inline-block" }} />予約済
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 予約完了メッセージ */}
        {bookingSuccessMsg && (
          <div style={{ background: "#f0faf4", border: "1px solid #34a853", borderRadius: 8,
            padding: "10px 14px", fontSize: 12, fontWeight: 600, color: C.green }}>
            {bookingSuccessMsg}
          </div>
        )}

        {/* 予約済み一覧 */}
        <div style={{ background: C.white, borderRadius: 10, border: "1px solid " + C.borderLight, overflow: "hidden" }}>
          <div style={{ background: C.navy, padding: "8px 14px", fontSize: 11, fontWeight: 700, color: C.white }}>
            予約済み一覧 {bookings.length > 0 && <span style={{ opacity: 0.7, fontSize: 10 }}>({bookings.length}件)</span>}
          </div>
          {bookings.length === 0 ? (
            <div style={{ padding: "16px 14px", textAlign: "center", color: C.textLight, fontSize: 12 }}>予約はありません</div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {bookings.map(b => (
                <div key={b.id} style={{ padding: "8px 14px", borderBottom: "1px solid " + C.borderLight,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{b.dayLabel}</div>
                    <div style={{ fontSize: 10, color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>
                      {b.startLabel} – {b.endLabel}
                    </div>
                    <div style={{ fontSize: 9, color: C.textLight, marginTop: 1 }}>{b.title}</div>
                  </div>
                  <button onClick={() => handleCancel(b)}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5,
                      border: "1px solid " + C.borderLight, background: "transparent",
                      color: C.red, cursor: "pointer", fontFamily: "'Noto Sans JP'", flexShrink: 0 }}>
                    キャンセル
                  </button>
                </div>
              ))}
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
            style={{ background: C.white, borderRadius: 14, padding: "28px 32px", width: 340,
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 6 }}>ロープレを予約する</div>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
              <strong style={{ color: C.navy }}>{confirmSlot.dayLabel}</strong>
              {'　'}
              <strong style={{ color: C.navy, fontFamily: "'JetBrains Mono', monospace" }}>
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
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6,
                  border: "1px solid " + C.borderLight, fontSize: 12, outline: "none",
                  fontFamily: "'Noto Sans JP'", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 9, color: C.textLight, marginTop: 4 }}>
                予約30分前にメール・10分前にポップアップ通知が届きます
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleBook} disabled={bookingLoading}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none",
                  background: bookingLoading ? C.borderLight : C.navy,
                  color: bookingLoading ? C.textLight : C.white,
                  fontSize: 12, fontWeight: 700, cursor: bookingLoading ? "default" : "pointer",
                  fontFamily: "'Noto Sans JP'" }}>
                {bookingLoading ? '予約中...' : '予約する'}
              </button>
              <button onClick={() => setConfirmSlot(null)}
                style={{ flex: 1, padding: "9px", borderRadius: 8,
                  border: "1px solid " + C.borderLight, background: "transparent",
                  color: C.textMid, fontSize: 12, cursor: "pointer", fontFamily: "'Noto Sans JP'" }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
