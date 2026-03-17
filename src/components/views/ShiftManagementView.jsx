import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C } from '../../constants/colors';
import { fetchShifts, insertShift, updateShift, deleteShift } from '../../lib/supabaseWrite';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// ── タイムライン定数 ──────────────────────────────────────────
const TL_START = 480;   // 8:00 (分)
const TL_END   = 1320;  // 22:00 (分)
const TL_TOTAL = 840;

const snapTo30   = (m) => Math.round(m / 30) * 30;
const clampTL    = (m) => Math.max(TL_START, Math.min(TL_END, m));
const clampSnap  = (m) => snapTo30(clampTL(m));
const minToStr   = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minToPct   = (m) => ((m - TL_START) / TL_TOTAL) * 100;
const getClientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
const tlFromRect = (cx, rect) => TL_START + ((cx - rect.left) / rect.width) * TL_TOTAL;
const strToMin   = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

const tlHasOverlap = (s, e, shifts, excludeId = null) =>
  shifts.filter(sh => sh.id !== excludeId).some(sh => {
    const ss = strToMin(sh.start_time);
    const se = strToMin(sh.end_time);
    return s < se && e > ss;
  });

const tlGetPreview = (d) => {
  if (!d) return null;
  if (d.mode === 'create') {
    const s = snapTo30(clampTL(Math.min(d.anchorMin, d.currentMin)));
    const e = snapTo30(clampTL(Math.max(d.anchorMin, d.currentMin)));
    return { s, e: Math.max(e, s + 30) };
  }
  if (d.mode === 'move') {
    const s = clampSnap(d.currentMin - d.offsetMin);
    return { s, e: Math.min(TL_END, s + d.duration) };
  }
  if (d.mode === 'resize') {
    const s = strToMin(d.shift.start_time);
    const e = clampSnap(d.currentMin);
    return { s, e: Math.max(e, s + 30) };
  }
  return null;
};
// ─────────────────────────────────────────────────────────────

export default function ShiftManagementView({ members, currentUser, isAdmin }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState('month');
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);

  const sortedMembers = useMemo(() => {
    return [...members]
      .filter(m => typeof m === 'object' && m.name)
      .sort((a, b) => (a.joinDate || '').localeCompare(b.joinDate || ''));
  }, [members]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const weekBlockStart = Math.floor((selectedDay - 1) / 7) * 7 + 1;
  const weekBlockEnd = Math.min(weekBlockStart + 6, daysInMonth);
  const weekDays = Array.from({ length: weekBlockEnd - weekBlockStart + 1 }, (_, i) => weekBlockStart + i);

  useEffect(() => { loadShifts(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShifts = async () => {
    setLoading(true);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    setShifts(data || []);
    setLoading(false);
  };

  // 1日に複数シフト対応: 配列を返す
  const getShifts = (memberId, day) => {
    if (!memberId) return [];
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts
      .filter(s => s.member_id === memberId && s.shift_date === dateStr)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // 複数シフトの合計時間
  const totalShiftHours = (shiftsArr) => {
    return shiftsArr.reduce((sum, s) => {
      return sum + (toMin(s.end_time) - toMin(s.start_time)) / 60;
    }, 0);
  };

  const getMemberHours = (memberId, displayDays) => {
    if (!memberId) return 0;
    return displayDays.reduce((sum, d) => sum + totalShiftHours(getShifts(memberId, d)), 0);
  };

  // 30分スロットごとの同時稼働数
  const SLOTS_30 = (() => {
    const s = [];
    for (let h = 8; h < 22; h++) { s.push(`${String(h).padStart(2, '0')}:00`); s.push(`${String(h).padStart(2, '0')}:30`); }
    return s;
  })();
  const getConcurrentCount = (slotStr, dateStr) => {
    const [sh, sm] = slotStr.split(':').map(Number);
    const slotStart = sh * 60 + sm;
    const slotEnd = slotStart + 30;
    return shifts.filter(s => {
      if (s.shift_date !== dateStr) return false;
      const [startH, startM] = s.start_time.split(':').map(Number);
      const [endH, endM] = s.end_time.split(':').map(Number);
      return (startH * 60 + startM) < slotEnd && (endH * 60 + endM) > slotStart;
    }).length;
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };
  const prevWeek = () => setSelectedDay(d => Math.max(1, d - 7));
  const nextWeek = () => setSelectedDay(d => Math.min(daysInMonth, d + 7));
  const prevDay = () => setSelectedDay(d => Math.max(1, d - 1));
  const nextDay = () => setSelectedDay(d => Math.min(daysInMonth, d + 1));

  const DAY_JP = '日月火水木金土';
  const getDayMeta = (day) => {
    const dow = new Date(year, month - 1, day).getDay();
    return { dow, isSun: dow === 0, isSat: dow === 6, name: DAY_JP[dow] };
  };

  const fmtTime = (t) => t ? t.slice(0, 5) : '';
  const navBtn = { border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 600, borderRadius: 5, padding: '5px 10px', background: C.offWhite, color: C.navy, fontSize: 12 };
  const modeBtn = (active) => ({ border: '1px solid ' + C.border, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 600, borderRadius: 5, padding: '5px 12px', background: active ? C.navy : C.white, color: active ? C.white : C.navy, fontSize: 11 });

  // ── 月間・週間表示（閲覧専用） ─────────────────────────────
  const renderGridView = (displayDays, isMonthView) => (
    <div>
      {/* 案内バナー */}
      <div style={{ padding: '8px 16px', background: '#fffbeb', borderBottom: '1px solid #fbd38d', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#744210', fontWeight: 600 }}>
          シフトの登録・編集は「日別表示」から行ってください
        </span>
        <button
          onClick={() => setViewMode('day')}
          style={{ marginLeft: 8, border: 'none', background: '#c8a84b', color: '#fff', fontWeight: 700, fontSize: 11, borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}
        >
          日別表示へ →
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 140 + displayDays.length * 72 + 76 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              <th style={{ position: 'sticky', left: 0, width: 130, minWidth: 130, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.white, borderRight: '2px solid rgba(255,255,255,0.2)', background: C.navy, zIndex: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>メンバー</th>
              {displayDays.map(d => {
                const { isSun, isSat, name } = getDayMeta(d);
                return (
                  <th key={d} style={{ width: 72, minWidth: 72, padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: isSun ? '#fc8181' : isSat ? '#90cdf4' : C.white, borderRight: '1px solid rgba(255,255,255,0.1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div style={{ fontSize: 12 }}>{d}</div>
                    <div style={{ fontSize: 9, opacity: 0.8 }}>{name}</div>
                  </th>
                );
              })}
              <th style={{ position: 'sticky', right: 0, width: 76, minWidth: 76, padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.navy, background: C.offWhite, borderLeft: '2px solid ' + C.gold, zIndex: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>合計</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member, mi) => {
              const memId = member._supaId || member.id;
              const isMe = member.name === currentUser;
              const rowBg = isMe ? C.gold + '18' : mi % 2 === 0 ? C.white : C.cream;
              const totalH = getMemberHours(memId, displayDays);
              const monthlyH = isMonthView ? totalH : getMemberHours(memId, days);
              const isUnder80 = isMonthView && monthlyH < 80;
              return (
                <tr key={memId || mi} style={{ borderBottom: '1px solid ' + C.borderLight }}>
                  <td style={{ position: 'sticky', left: 0, padding: '6px 12px', fontWeight: isMe ? 700 : 500, fontSize: 11, color: isMe ? C.navy : C.textDark, background: rowBg, borderRight: '2px solid ' + C.border, whiteSpace: 'nowrap', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{member.name}</span>
                      {isUnder80 && (
                        <span title={`今月の稼働時間: ${monthlyH.toFixed(1)}時間（80時間未達）`}
                          style={{ color: '#ed8936', fontSize: 13, cursor: 'help', lineHeight: 1 }}>!</span>
                      )}
                    </div>
                  </td>
                  {displayDays.map(d => {
                    const { isSun, isSat } = getDayMeta(d);
                    const dayShifts = getShifts(memId, d);
                    const cellBg = dayShifts.length > 0 ? 'transparent' : isSun ? '#fff5f5' : isSat ? '#ebf8ff' : rowBg;
                    return (
                      <td key={d} style={{ padding: '3px 4px', textAlign: 'center', background: cellBg, borderRight: '1px solid ' + C.borderLight, verticalAlign: 'top' }}>
                        {/* 登録済みシフト（閲覧のみ） */}
                        {dayShifts.map(shift => (
                          <div key={shift.id} style={{ marginBottom: 2 }}>
                            <div style={{
                              background: isMe ? C.gold : C.navy + '18',
                              border: '1px solid ' + (isMe ? C.gold + '80' : C.navy + '30'),
                              borderRadius: 4, padding: '2px 4px',
                              fontSize: 9, fontWeight: 700,
                              color: isMe ? '#7d5c00' : C.navy,
                              lineHeight: 1.4, textAlign: 'left',
                            }}>
                              <div>{fmtTime(shift.start_time)}</div>
                              <div>{fmtTime(shift.end_time)}</div>
                            </div>
                          </div>
                        ))}
                        {dayShifts.length === 0 && <div style={{ height: 36 }} />}
                      </td>
                    );
                  })}
                  {/* 合計時間列 */}
                  <td style={{ position: 'sticky', right: 0, padding: '6px 8px', textAlign: 'center', background: C.offWhite, borderLeft: '2px solid ' + C.gold, whiteSpace: 'nowrap', zIndex: 1, verticalAlign: 'middle' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isUnder80 ? '#e53e3e' : C.navy }}>
                      {totalH > 0 ? totalH.toFixed(1) + 'h' : '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── 日別表示（シフト入力専用） ────────────────────────────
  const renderDayView = () => {
    const HOURS  = Array.from({ length: 15 }, (_, i) => i + 8);
    const NAME_W = 130;
    const TOTAL_W = 72;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    const { isSun, isSat } = getDayMeta(selectedDay);

    return (
      <div>
        {/* 日付ピッカー */}
        <div style={{ padding: '12px 16px', background: C.white, borderBottom: '1px solid ' + C.borderLight, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {days.map(d => {
            const { isSun: s, isSat: sat } = getDayMeta(d);
            return (
              <button key={d} onClick={() => setSelectedDay(d)}
                style={{ width: 30, height: 30, borderRadius: 5, border: '1px solid ' + C.border, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                  background: selectedDay === d ? C.navy : s ? '#fff5f5' : sat ? '#ebf8ff' : C.offWhite,
                  color: selectedDay === d ? C.white : s ? '#c53030' : sat ? '#2b6cb0' : C.navy }}>
                {d}
              </button>
            );
          })}
        </div>

        {/* タイムラインカード */}
        <div style={{ margin: '16px 20px 0', background: C.white, borderRadius: 10, border: '1px solid ' + C.borderLight, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: isSun ? '#c53030' : isSat ? '#2b6cb0' : C.navy, color: C.white, fontSize: 13, fontWeight: 700 }}>
            {year}年{month}月{selectedDay}日（{getDayMeta(selectedDay).name}）のシフト
            <span style={{ marginLeft: 12, fontSize: 10, fontWeight: 400, opacity: 0.75 }}>
              クリック→30分登録 ／ ドラッグ→任意登録 ／ ブロックドラッグ→移動・右端→リサイズ
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 700, padding: '12px 16px' }}>
              {/* 時間軸ヘッダー */}
              <div style={{ display: 'flex', marginBottom: 8, paddingLeft: NAME_W, paddingRight: TOTAL_W + 8 }}>
                {HOURS.map(h => (
                  <div key={h} style={{ flex: 1, fontSize: 9, color: C.textLight, borderLeft: '1px solid ' + C.borderLight, paddingLeft: 2 }}>{h}:00</div>
                ))}
              </div>
              {/* メンバー行（ドラッグ対応） */}
              {sortedMembers.map((member, mi) => {
                const memId = member._supaId || member.id;
                const isMe = member.name === currentUser;
                const isEditable = isAdmin || member.name === currentUser;
                const dayShifts = memId
                  ? shifts.filter(s => s.member_id === memId && s.shift_date === dateStr)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  : [];
                const dayH = totalShiftHours(dayShifts);
                return (
                  <DraggableTimeline
                    key={memId || mi}
                    member={member}
                    memId={memId}
                    isMe={isMe}
                    isEditable={isEditable}
                    dayShifts={dayShifts}
                    dayH={dayH}
                    dateStr={dateStr}
                    year={year}
                    month={month}
                    onReload={loadShifts}
                    NAME_W={NAME_W}
                    TOTAL_W={TOTAL_W}
                    HOURS={HOURS}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* 同時稼働数フッター */}
        <div style={{ position: 'sticky', bottom: 0, background: C.navy, borderTop: '2px solid ' + C.gold, zIndex: 5, marginTop: 4 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 700, display: 'flex', alignItems: 'center', padding: '6px 16px' }}>
              <div style={{ width: NAME_W, flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.white, paddingRight: 8 }}>同時稼働数</div>
              <div style={{ flex: 1, display: 'flex' }}>
                {SLOTS_30.map(slot => {
                  const count = getConcurrentCount(slot, dateStr);
                  return (
                    <div key={slot} style={{ flex: 1, textAlign: 'center', fontSize: count > 0 ? 10 : 9, fontWeight: 700, color: count > 0 ? C.gold : 'rgba(255,255,255,0.25)', minWidth: 0, paddingTop: 2, paddingBottom: 2 }}>
                      {count > 0 ? count : '·'}
                    </div>
                  );
                })}
              </div>
              <div style={{ width: TOTAL_W + 8, flexShrink: 0 }} />
            </div>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ヘッダー */}
      <div style={{ padding: '14px 24px', background: C.white, borderBottom: '1px solid ' + C.borderLight, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>シフト管理</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevMonth} style={navBtn}>◀</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, minWidth: 88, textAlign: 'center' }}>{year}年{month}月</div>
          <button onClick={nextMonth} style={navBtn}>▶</button>
        </div>
        {viewMode === 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevWeek} style={navBtn}>← 前週</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 72, textAlign: 'center' }}>{weekBlockStart}日〜{weekBlockEnd}日</span>
            <button onClick={nextWeek} style={navBtn}>次週 →</button>
          </div>
        )}
        {viewMode === 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevDay} style={navBtn}>← 前日</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 36, textAlign: 'center' }}>{selectedDay}日</span>
            <button onClick={nextDay} style={navBtn}>次日 →</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['month', '月間表示'], ['week', '週間表示'], ['day', '日別表示']].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={modeBtn(viewMode === mode)}>{label}</button>
          ))}
          <button onClick={loadShifts} style={{ ...navBtn, marginLeft: 4 }}>↻ 更新</button>
        </div>
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.textLight, fontSize: 13 }}>読み込み中...</div>
        ) : viewMode === 'month' ? renderGridView(days, true)
          : viewMode === 'week' ? renderGridView(weekDays, false)
          : renderDayView()}
      </div>
    </div>
  );
}

// ── ドラッグ対応タイムライン行 ────────────────────────────────
function DraggableTimeline({ member, memId, isMe, isEditable, dayShifts, dayH, dateStr, year, month, onReload, NAME_W, TOTAL_W, HOURS }) {
  const [drag, setDrag]   = useState(null);
  const dragRef           = useRef(null);
  const commitRef         = useRef(null);
  const trackRef          = useRef(null);

  const NAVY = '#0D2247';
  const GOLD = '#C8A84B';
  const ROW_H = 52;

  // commitRef は毎レンダーで最新の dayShifts を参照する
  commitRef.current = async () => {
    const d = dragRef.current;
    if (!d) { dragRef.current = null; setDrag(null); return; }

    // ── クリック（移動距離 ≤ 5px）→ 30分即登録 ──────────────
    if (d.mode === 'create' && !d.hasMoved) {
      const s = Math.min(snapTo30(clampTL(d.anchorMin)), TL_END - 30);
      const e = s + 30;
      if (!tlHasOverlap(s, e, dayShifts)) {
        await insertShift({
          member_id: memId || null,
          member_name: member.name,
          shift_date: dateStr,
          start_time: minToStr(s) + ':00',
          end_time:   minToStr(e) + ':00',
        });
        await onReload();
      }
      dragRef.current = null; setDrag(null); return;
    }

    // ── ドラッグ未移動（move/resize で動かなかった）→ キャンセル
    if (!d.hasMoved) { dragRef.current = null; setDrag(null); return; }

    // ── ドラッグ確定 ────────────────────────────────────────
    const preview = tlGetPreview(d);
    if (!preview || preview.e <= preview.s) { dragRef.current = null; setDrag(null); return; }
    const excludeId = (d.mode === 'move' || d.mode === 'resize') ? d.shift.id : null;
    if (tlHasOverlap(preview.s, preview.e, dayShifts, excludeId)) {
      dragRef.current = null; setDrag(null); return;
    }
    const startStr = minToStr(preview.s) + ':00';
    const endStr   = minToStr(preview.e) + ':00';
    if (d.mode === 'create') {
      await insertShift({ member_id: memId || null, member_name: member.name, shift_date: dateStr, start_time: startStr, end_time: endStr });
    } else {
      await updateShift(d.shift.id, { start_time: startStr, end_time: endStr });
    }
    dragRef.current = null;
    setDrag(null);
    await onReload();
  };

  const onWindowMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    if (e.cancelable) e.preventDefault();
    const cx = getClientX(e);
    const currentMin = clampTL(tlFromRect(cx, d.trackRect));
    // ピクセル距離で hasMoved を判定（5px超えたらドラッグ）
    const hasMoved = d.hasMoved || Math.abs(cx - d.startX) > 5;
    const next = { ...d, currentMin, hasMoved };
    dragRef.current = next;
    setDrag({ ...next });
  }, []);

  const onWindowUp = useCallback(() => {
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', onWindowUp);
    window.removeEventListener('touchmove', onWindowMove);
    window.removeEventListener('touchend', onWindowUp);
    commitRef.current?.();
  }, [onWindowMove]);

  const startDrag = useCallback((state) => {
    dragRef.current = state;
    setDrag({ ...state });
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchmove', onWindowMove, { passive: false });
    window.addEventListener('touchend', onWindowUp);
  }, [onWindowMove, onWindowUp]);

  useEffect(() => () => {
    window.removeEventListener('mousemove', onWindowMove);
    window.removeEventListener('mouseup', onWindowUp);
    window.removeEventListener('touchmove', onWindowMove);
    window.removeEventListener('touchend', onWindowUp);
  }, [onWindowMove, onWindowUp]);

  const handleTrackDown = (e) => {
    if (!isEditable) return;
    if (e.target.closest('[data-shift-block]')) return;
    const rect = trackRef.current.getBoundingClientRect();
    const cx = getClientX(e);
    const anchorMin = clampTL(tlFromRect(cx, rect));
    startDrag({ mode: 'create', trackRect: rect, anchorMin, currentMin: anchorMin, startX: cx, hasMoved: false });
  };

  const handleBlockDown = (e, shift) => {
    if (!isEditable) return;
    e.stopPropagation();
    const rect = trackRef.current.getBoundingClientRect();
    const cx = getClientX(e);
    const clickMin   = tlFromRect(cx, rect);
    const shiftStart = strToMin(shift.start_time);
    const shiftEnd   = strToMin(shift.end_time);
    const duration   = shiftEnd - shiftStart;
    const pixelsFromEnd = ((shiftEnd - clickMin) / TL_TOTAL) * rect.width;
    if (pixelsFromEnd < 14) {
      startDrag({ mode: 'resize', shift, trackRect: rect, currentMin: shiftEnd, startX: cx, hasMoved: false });
    } else {
      const offsetMin = Math.max(0, Math.min(duration, clickMin - shiftStart));
      startDrag({ mode: 'move', shift, trackRect: rect, offsetMin, currentMin: clampTL(clickMin), duration, startX: cx, hasMoved: false });
    }
  };

  const handleDelete = async (e, shift) => {
    e.stopPropagation();
    if (!window.confirm(`${shift.start_time.slice(0, 5)}〜${shift.end_time.slice(0, 5)} を削除しますか？`)) return;
    await deleteShift(shift.id);
    await onReload();
  };

  const preview         = drag ? tlGetPreview(drag) : null;
  const hiddenId        = (drag?.mode === 'move' || drag?.mode === 'resize') && drag?.hasMoved ? drag?.shift?.id : null;
  const previewExclude  = (drag?.mode === 'move' || drag?.mode === 'resize') ? drag?.shift?.id : null;
  const previewConflict = preview ? tlHasOverlap(preview.s, preview.e, dayShifts, previewExclude) : false;

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      {/* メンバー名 */}
      <div style={{
        width: NAME_W, flexShrink: 0, fontSize: 11, fontWeight: isMe ? 700 : 500,
        color: isMe ? NAVY : C.textDark, paddingRight: 8,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {member.name}
      </div>

      {/* タイムライントラック */}
      <div
        ref={trackRef}
        onMouseDown={handleTrackDown}
        onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); handleTrackDown(e); }}
        style={{
          flex: 1, height: ROW_H, background: C.cream, borderRadius: 5, position: 'relative',
          border: '1px solid ' + C.borderLight,
          cursor: isEditable ? 'crosshair' : 'default',
          userSelect: 'none',
        }}
      >
        {/* 時間グリッド線 */}
        {HOURS.slice(1).map((h, i) => (
          <div key={h} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: ((i + 1) / (HOURS.length - 1)) * 100 + '%',
            width: 1, background: C.borderLight, pointerEvents: 'none',
          }} />
        ))}

        {/* 既存シフトブロック */}
        {dayShifts.map(shift => {
          if (shift.id === hiddenId) return null;
          const s = strToMin(shift.start_time);
          const e = strToMin(shift.end_time);
          const w = Math.max(minToPct(e) - minToPct(s), 0.5);
          return (
            <div
              key={shift.id}
              data-shift-block="1"
              onMouseDown={(ev) => isEditable && handleBlockDown(ev, shift)}
              onTouchStart={(ev) => { if (ev.cancelable) ev.preventDefault(); isEditable && handleBlockDown(ev, shift); }}
              style={{
                position: 'absolute', top: 4, bottom: 4,
                left: minToPct(s) + '%', width: w + '%',
                background: isMe ? GOLD : NAVY + '25',
                border: '1px solid ' + (isMe ? GOLD + '80' : NAVY + '40'),
                borderRadius: 4,
                display: 'flex', alignItems: 'center',
                paddingLeft: 5, paddingRight: 18,
                fontSize: 9, fontWeight: 700, color: isMe ? '#7d5c00' : NAVY,
                overflow: 'hidden', whiteSpace: 'nowrap',
                cursor: isEditable ? 'grab' : 'default',
                zIndex: 1,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, pointerEvents: 'none' }}>
                {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
              </span>
              {/* リサイズハンドル（右端） */}
              {isEditable && (
                <div
                  data-shift-block="1"
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    const rect = trackRef.current.getBoundingClientRect();
                    const cx = getClientX(ev);
                    startDrag({ mode: 'resize', shift, trackRect: rect, currentMin: strToMin(shift.end_time), startX: cx, hasMoved: false });
                  }}
                  onTouchStart={(ev) => {
                    ev.stopPropagation();
                    if (ev.cancelable) ev.preventDefault();
                    const rect = trackRef.current.getBoundingClientRect();
                    const cx = getClientX(ev);
                    startDrag({ mode: 'resize', shift, trackRect: rect, currentMin: strToMin(shift.end_time), startX: cx, hasMoved: false });
                  }}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 14,
                    cursor: 'ew-resize',
                    background: 'rgba(0,0,0,0.07)',
                    borderRadius: '0 4px 4px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{ width: 2, height: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 1, pointerEvents: 'none' }} />
                </div>
              )}
              {/* 削除ボタン */}
              {isEditable && (
                <button
                  onClick={(ev) => handleDelete(ev, shift)}
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onTouchStart={(ev) => ev.stopPropagation()}
                  style={{
                    position: 'absolute', top: 2, right: 16,
                    width: 13, height: 13, borderRadius: 2,
                    border: 'none', background: 'rgba(150,0,0,0.2)',
                    color: '#c53030', fontSize: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0, fontWeight: 700, zIndex: 2,
                  }}
                >×</button>
              )}
            </div>
          );
        })}

        {/* プレビューブロック（ドラッグ中のみ表示） */}
        {preview && preview.e > preview.s && drag?.hasMoved && (
          <div style={{
            position: 'absolute', top: 2, bottom: 2,
            left: minToPct(preview.s) + '%',
            width: Math.max(minToPct(preview.e) - minToPct(preview.s), 0.1) + '%',
            background: previewConflict ? 'rgba(229,62,62,0.8)' : GOLD + 'CC',
            border: '2px solid ' + (previewConflict ? '#c53030' : GOLD),
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700,
            color: previewConflict ? '#fff' : '#7d5c00',
            pointerEvents: 'none', zIndex: 3,
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            {minToStr(preview.s)}–{minToStr(preview.e)}
          </div>
        )}
      </div>

      {/* 日別合計 */}
      <div style={{
        width: TOTAL_W, flexShrink: 0, marginLeft: 8, textAlign: 'center',
        background: C.offWhite, borderLeft: '2px solid ' + GOLD,
        height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '0 4px 4px 0',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: NAVY }}>
          {dayH > 0 ? dayH.toFixed(1) + 'h' : '-'}
        </span>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────

export function ShiftInputModal({ modal, onClose, onSaved, year, month }) {
  const { member, dateStr, existingShifts = [], editingShift } = modal;
  const memId = member._supaId || member.id;

  const timeOptions = [];
  for (let h = 8; h <= 22; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) timeOptions.push(`${String(h).padStart(2, '00')}:30`);
  }

  const [startTime, setStartTime] = useState(editingShift ? editingShift.start_time.slice(0, 5) : '09:00');
  const [endTime, setEndTime]     = useState(editingShift ? editingShift.end_time.slice(0, 5)   : '18:00');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const checkOverlap = (newStart, newEnd) => {
    const ns = toMin(newStart);
    const ne = toMin(newEnd);
    return existingShifts
      .filter(s => !editingShift || s.id !== editingShift.id)
      .some(s => {
        const ss = toMin(s.start_time.slice(0, 5));
        const se = toMin(s.end_time.slice(0, 5));
        return ns < se && ne > ss;
      });
  };

  const handleSave = async () => {
    if (startTime >= endTime) { setErrMsg('開始時間は終了時間より前にしてください'); return; }
    if (checkOverlap(startTime, endTime)) { setErrMsg('この時間帯は既存のシフトと重複しています'); return; }
    setSaving(true); setErrMsg('');
    if (editingShift) {
      const err = await updateShift(editingShift.id, { start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) { setErrMsg('保存に失敗しました: ' + (err.message || JSON.stringify(err))); setSaving(false); return; }
    } else {
      if (!memId) { console.warn('[Shift] memId missing for', member.name); }
      const { error: err } = await insertShift({ member_id: memId || null, member_name: member.name, shift_date: dateStr, start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) { setErrMsg('保存に失敗しました: ' + (err.message || JSON.stringify(err))); setSaving(false); return; }
    }
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const handleDelete = async () => {
    if (!editingShift) return;
    setSaving(true);
    await deleteShift(editingShift.id);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const btnStyle = (bg, color) => ({ border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 700, borderRadius: 6, padding: '9px 18px', fontSize: 12, background: bg, color, opacity: saving ? 0.65 : 1 });
  const selStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 13, fontFamily: "'Noto Sans JP'", background: C.white, color: C.navy, outline: 'none', cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 28, width: 360, boxShadow: '0 8px 36px rgba(0,0,0,0.22)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 20 }}>シフト{editingShift ? '編集' : '追加'}</div>
        {[{ label: 'メンバー', value: member.name }, { label: '日付', value: dateStr }].map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, padding: '8px 12px', background: C.cream, borderRadius: 6, border: '1px solid ' + C.borderLight }}>{value}</div>
          </div>
        ))}
        {existingShifts.filter(s => !editingShift || s.id !== editingShift.id).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>登録済みシフト</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {existingShifts.filter(s => !editingShift || s.id !== editingShift.id).map(s => (
                <span key={s.id} style={{ fontSize: 11, padding: '3px 8px', background: C.navy + '12', border: '1px solid ' + C.navy + '25', borderRadius: 10, color: C.navy, fontWeight: 600 }}>
                  {s.start_time.slice(0, 5)}〜{s.end_time.slice(0, 5)}
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>開始時間</div>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={selStyle}>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>終了時間</div>
            <select value={endTime} onChange={e => setEndTime(e.target.value)} style={selStyle}>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {errMsg && (
          <div style={{ fontSize: 11, color: '#c53030', marginBottom: 12, padding: '6px 10px', background: '#fff5f5', borderRadius: 5, border: '1px solid #fed7d7' }}>{errMsg}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={btnStyle(C.navy, C.white)}>{saving ? '保存中...' : '保存'}</button>
          {editingShift && <button onClick={handleDelete} disabled={saving} style={btnStyle('#fed7d7', '#c53030')}>削除</button>}
          <button onClick={onClose} style={{ ...btnStyle(C.offWhite, C.textMid), marginLeft: 'auto' }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
