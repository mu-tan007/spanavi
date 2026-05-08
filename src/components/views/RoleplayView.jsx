import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
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
          <h2 style={{
            margin: 0, fontSize: font.size.base, fontWeight: font.weight.bold,
            color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6,
          }}>
            代表とのロープレ予約
          </h2>

          {gcalError && (
            <div style={{
              fontSize: font.size.xs, color: color.danger, background: alpha(color.danger, 0.10),
              padding: "6px 10px", borderRadius: radius.md,
            }}>
              {gcalError}
            </div>
          )}

          {/* 週ナビ + 凡例 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: font.family.sans }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Button size="sm" variant="secondary" onClick={() => setWeekOffset(w => w - 1)}>&lt;</Button>
              <span style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, minWidth: 110, textAlign: 'center' }}>
                {days[0]?.label} ~ {days[6]?.label}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setWeekOffset(w => w + 1)}>&gt;</Button>
              {weekOffset !== 0 && (
                <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}
                  style={{ textDecoration: 'underline', marginLeft: 4, color: color.textMid }}>
                  今週
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: font.size.xs - 1, alignItems: 'center', color: color.textMid }}>
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
              <Button size="sm" variant="ghost" onClick={fetchBusy} loading={loadingBusy}
                style={{ marginLeft: 6, color: color.textMid, fontSize: font.size.xs - 1 }}>
                {loadingBusy ? '読込中...' : '更新'}
              </Button>
            </div>
          </div>

          {/* 週グリッド */}
          <div style={{
            background: color.white, border: `1px solid ${color.border}`,
            borderRadius: radius.md, overflow: 'hidden', fontFamily: font.family.sans,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', fontSize: font.size.xs - 1 }}>
              {/* ヘッダ行 */}
              <div style={{ background: NAVY, padding: '6px 2px' }} />
              {days.map(d => (
                <div key={d.dateStr}
                  style={{
                    background: NAVY, color: d.isWeekend ? '#FCA5A5' : color.white,
                    padding: '6px 2px', textAlign: 'center', fontWeight: font.weight.semibold,
                    borderLeft: `1px solid ${alpha(color.white, 0.1)}`,
                  }}>
                  <div style={{ fontSize: font.size.xs }}>{d.label}</div>
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
                      color: color.textMid,
                      fontSize: font.size.xs - 1,
                      fontFamily: font.family.mono,
                      borderBottom: `1px solid ${color.gray100}`,
                      borderRight: `1px solid ${color.border}`,
                      background: color.gray50,
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
                            borderBottom: onHour ? `1px solid ${color.border}` : `1px solid ${color.gray100}`,
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
                              fontWeight: font.weight.bold,
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
            <div style={{
              background: alpha(color.success, 0.08), border: `1px solid ${color.success}`,
              borderRadius: radius.md,
              padding: "10px 14px", fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.success,
            }}>
              {bookingSuccessMsg}
            </div>
          )}
        </div>

        {/* 右 (2): 予約済み一覧 */}
        <div style={{ flex: 2, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{
            margin: 0, fontSize: font.size.base, fontWeight: font.weight.bold,
            color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6,
          }}>
            予約済み一覧 {allBookings.length > 0 && (
              <span style={{ fontWeight: font.weight.normal, color: color.textMid, fontSize: font.size.xs }}>
                ({allBookings.length}件)
              </span>
            )}
          </h2>

          <Card padding="none" variant="default" style={{ overflow: 'hidden' }}>
            {allBookings.length === 0 ? (
              <div style={{ padding: "16px 14px", textAlign: "center", color: color.textLight, fontSize: font.size.sm }}>予約はありません</div>
            ) : (
              <div style={{ maxHeight: 640, overflowY: "auto" }}>
                {allBookings.map(b => {
                  const isOwn = b.userId === userId;
                  return (
                    <div key={b.id} style={{
                      padding: "10px 14px", borderBottom: `1px solid ${color.border}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: isOwn ? alpha(color.navyLight, 0.06) : 'transparent',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: NAVY }}>{b.dayLabel}</div>
                        <div style={{ fontSize: font.size.xs - 1, color: color.textMid, fontFamily: font.family.mono, marginTop: 1 }}>
                          {b.startLabel} – {b.endLabel}
                        </div>
                        <div style={{
                          fontSize: font.size.xs - 1,
                          color: isOwn ? '#1E40AF' : color.textMid,
                          fontWeight: isOwn ? font.weight.semibold : font.weight.normal,
                          marginTop: 2,
                        }}>
                          {b.userName || '不明'}{isOwn ? '（自分）' : ''}
                        </div>
                      </div>
                      {isOwn && (
                        <Button size="sm" variant="outline" onClick={() => handleCancel(b)}
                          style={{
                            color: color.danger, borderColor: color.danger,
                            fontSize: font.size.xs - 1, flexShrink: 0,
                          }}>
                          キャンセル
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* 予約確認モーダル */}
        {confirmSlot && (
          <div onClick={() => setConfirmSlot(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                background: color.white, border: `1px solid ${color.border}`,
                borderRadius: radius.md, padding: "28px 32px", width: 340,
                boxShadow: shadow.xl,
              }}>
              <div style={{
                background: NAVY, color: color.white, padding: '12px 24px',
                fontWeight: font.weight.semibold, fontSize: font.size.lg - 1,
                borderRadius: `${radius.md}px ${radius.md}px 0 0`,
                margin: '-28px -32px 20px -32px',
              }}>ロープレを予約する</div>
              <div style={{ fontSize: font.size.base, color: color.textMid, marginBottom: 16, lineHeight: 1.7 }}>
                <strong style={{ color: NAVY }}>{confirmSlot.dayLabel}</strong>
                {'　'}
                <strong style={{ color: NAVY, fontFamily: font.family.mono }}>
                  {confirmSlot.startLabel} – {confirmSlot.endLabel}
                </strong>
              </div>
              <div style={{ marginBottom: 16 }}>
                <Input
                  size="sm"
                  type="email"
                  label="メールアドレス（通知送付先）"
                  value={modalEmail}
                  onChange={e => setModalEmail(e.target.value)}
                  placeholder="your@email.com"
                  hint="予約30分前にメール・10分前にポップアップ通知が届きます"
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Button onClick={handleBook} loading={bookingLoading} fullWidth>
                  {bookingLoading ? '予約中...' : '予約する'}
                </Button>
                <Button variant="outline" onClick={() => setConfirmSlot(null)} fullWidth>
                  キャンセル
                </Button>
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
    <Card padding="none" variant="default" style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY, textAlign: 'left',
        }}
      >
        <span>ロープレ履歴</span>
        <span style={{ fontSize: font.size.xs, color: color.gray400 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px 20px', borderTop: `1px solid ${color.gray100}` }}>
          <TrainingRoleplaySection
            currentUser={currentUser}
            userId={userId}
            members={members}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </Card>
  );
}
