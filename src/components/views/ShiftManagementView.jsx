import { useState, useEffect, useMemo } from "react";
import { C } from '../../constants/colors';
import { fetchShifts, insertShift, updateShift, deleteShift } from '../../lib/supabaseWrite';

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function ShiftManagementView({ members, currentUser, isAdmin }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState('month');
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shiftModal, setShiftModal] = useState(null);

  // Fix3: 入社日昇順（古い順）
  const sortedMembers = React.useMemo(() => {
    return [...members]
      .filter(m => typeof m === 'object' && m.name)
      .sort((a, b) => (a.joinDate || '').localeCompare(b.joinDate || ''));
  }, [members]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 週表示: selectedDay が属する7日ブロック（1-7, 8-14, 15-21, 22-28, 29-末日）
  const weekBlockStart = Math.floor((selectedDay - 1) / 7) * 7 + 1;
  const weekBlockEnd = Math.min(weekBlockStart + 6, daysInMonth);
  const weekDays = Array.from({ length: weekBlockEnd - weekBlockStart + 1 }, (_, i) => weekBlockStart + i);

  React.useEffect(() => { loadShifts(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShifts = async () => {
    setLoading(true);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    setShifts(data || []);
    setLoading(false);
  };

  const getShift = (memberId, day) => {
    if (!memberId) return null;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.find(s => s.member_id === memberId && s.shift_date === dateStr) || null;
  };

  // Fix5: シフト時間（時間単位）
  const shiftHours = (shift) => {
    if (!shift) return 0;
    const parse = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return (parse(shift.end_time) - parse(shift.start_time)) / 60;
  };
  const getMemberHours = (memberId, displayDays) => {
    if (!memberId) return 0;
    return displayDays.reduce((sum, d) => sum + shiftHours(getShift(memberId, d)), 0);
  };

  // Fix2: 30分スロットごとの同時稼働数
  const SLOTS_30 = (() => {
    const s = [];
    for (let h = 8; h < 22; h++) { s.push(`${String(h).padStart(2,'0')}:00`); s.push(`${String(h).padStart(2,'0')}:30`); }
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

  // 管理者は全員分、一般ユーザーは自分のシフトのみ編集可能
  const canEdit = (member) => isAdmin || member.name === currentUser;

  const handleCellClick = (member, day) => {
    if (!canEdit(member)) return;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const memId = member._supaId || member.id;
    const shift = getShift(memId, day);
    setShiftModal({ member, dateStr, shift });
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

  // Fix4・Fix5: isMonthView=trueのとき⚠アラートと赤字。合計列を右端にsticky追加
  const renderGridView = (displayDays, isMonthView) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 140 + displayDays.length * 72 + 76 }}>
        <thead>
          <tr style={{ background: C.navy }}>
            <th style={{ position: 'sticky', left: 0, width: 130, minWidth: 130, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.white, borderRight: '2px solid rgba(255,255,255,0.2)', background: C.navy, zIndex: 3 }}>メンバー</th>
            {displayDays.map(d => {
              const { isSun, isSat, name } = getDayMeta(d);
              return (
                <th key={d} style={{ width: 72, minWidth: 72, padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: isSun ? '#fc8181' : isSat ? '#90cdf4' : C.white, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 12 }}>{d}</div>
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{name}</div>
                </th>
              );
            })}
            <th style={{ position: 'sticky', right: 0, width: 76, minWidth: 76, padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.navy, background: C.offWhite, borderLeft: '2px solid ' + C.gold, zIndex: 3 }}>合計</th>
          </tr>
        </thead>
        <tbody>
          {sortedMembers.map((member, mi) => {
            const memId = member._supaId || member.id;
            const isMe = member.name === currentUser;
            const isEditable = canEdit(member);
            const rowBg = isMe ? C.gold + '18' : mi % 2 === 0 ? C.white : C.cream;
            const totalH = getMemberHours(memId, displayDays);
            const monthlyH = isMonthView ? totalH : getMemberHours(memId, days);
            const isUnder80 = isMonthView && monthlyH < 80;
            return (
              <tr key={memId || mi} style={{ borderBottom: '1px solid ' + C.borderLight }}>
                <td style={{ position: 'sticky', left: 0, padding: '6px 12px', fontWeight: isMe ? 700 : 500, fontSize: 11, color: isMe ? C.navy : C.textDark, background: rowBg, borderRight: '2px solid ' + C.border, whiteSpace: 'nowrap', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{member.name}</span>
                    {/* Fix4: 80時間未達アラート */}
                    {isUnder80 && (
                      <span title={`今月の稼働時間: ${monthlyH.toFixed(1)}時間（80時間未達）`}
                        style={{ color: '#ed8936', fontSize: 13, cursor: 'help', lineHeight: 1 }}>⚠</span>
                    )}
                  </div>
                </td>
                {displayDays.map(d => {
                  const { isSun, isSat } = getDayMeta(d);
                  const shift = getShift(memId, d);
                  const cellBg = shift ? 'transparent' : isSun ? '#fff5f5' : isSat ? '#ebf8ff' : rowBg;
                  return (
                    <td key={d}
                      style={{ padding: '3px 4px', textAlign: 'center', background: cellBg, borderRight: '1px solid ' + C.borderLight, cursor: 'default', verticalAlign: 'middle' }}>
                      {shift ? (
                        <div style={{ background: isMe ? C.gold : C.navy + '18', border: '1px solid ' + (isMe ? C.gold + '80' : C.navy + '30'), borderRadius: 4, padding: '3px 4px', fontSize: 9, fontWeight: 700, color: isMe ? '#7d5c00' : C.navy, lineHeight: 1.5 }}>
                          <div>{fmtTime(shift.start_time)}</div>
                          <div>{fmtTime(shift.end_time)}</div>
                        </div>
                      ) : (
                        <div style={{ height: 36 }} />
                      )}
                    </td>
                  );
                })}
                {/* Fix5: 合計時間列（sticky right） */}
                <td style={{ position: 'sticky', right: 0, padding: '6px 8px', textAlign: 'center', background: C.offWhite, borderLeft: '2px solid ' + C.gold, whiteSpace: 'nowrap', zIndex: 1 }}>
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
  );

  const renderDayView = () => {
    const TIMELINE_START = 8 * 60;
    const TIMELINE_END = 22 * 60;
    const TIMELINE_TOTAL = TIMELINE_END - TIMELINE_START;
    const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);
    const NAME_W = 130;
    const TOTAL_W = 72;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    const { isSun, isSat } = getDayMeta(selectedDay);
    const timeToPercent = (t) => {
      const [h, m] = t.split(':').map(Number);
      return ((h * 60 + m - TIMELINE_START) / TIMELINE_TOTAL) * 100;
    };
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
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 700, padding: '12px 16px' }}>
              {/* 時間軸ヘッダー */}
              <div style={{ display: 'flex', marginBottom: 8, paddingLeft: NAME_W, paddingRight: TOTAL_W + 8 }}>
                {HOURS.map(h => (
                  <div key={h} style={{ flex: 1, fontSize: 9, color: C.textLight, borderLeft: '1px solid ' + C.borderLight, paddingLeft: 2 }}>{h}:00</div>
                ))}
              </div>
              {/* メンバー行 */}
              {sortedMembers.map((member, mi) => {
                const memId = member._supaId || member.id;
                const isMe = member.name === currentUser;
                const isEditable = canEdit(member);
                const shift = memId ? shifts.find(s => s.member_id === memId && s.shift_date === dateStr) : null;
                const dayH = shiftHours(shift);
                return (
                  <div key={memId || mi} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ width: NAME_W, flexShrink: 0, fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
                    <div style={{ flex: 1, height: 32, background: C.cream, borderRadius: 5, position: 'relative', cursor: isEditable ? 'pointer' : 'default', border: '1px solid ' + C.borderLight }}
                      onClick={() => isEditable && handleCellClick(member, selectedDay)}>
                      {HOURS.slice(1).map((h, i) => (
                        <div key={h} style={{ position: 'absolute', top: 0, bottom: 0, left: ((i + 1) / (HOURS.length - 1)) * 100 + '%', width: 1, background: C.borderLight }} />
                      ))}
                      {shift && (
                        <div style={{
                          position: 'absolute', top: 3, bottom: 3, borderRadius: 4,
                          left: timeToPercent(shift.start_time) + '%',
                          width: Math.max(timeToPercent(shift.end_time) - timeToPercent(shift.start_time), 0) + '%',
                          background: isMe ? C.gold : C.navy + '25',
                          border: '1px solid ' + (isMe ? C.gold + '80' : C.navy + '40'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: isMe ? '#7d5c00' : C.navy, overflow: 'hidden', whiteSpace: 'nowrap'
                        }}>
                          {fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}
                        </div>
                      )}
                    </div>
                    {/* Fix5: 日別合計時間 */}
                    <div style={{ width: TOTAL_W, flexShrink: 0, marginLeft: 8, textAlign: 'center', background: C.offWhite, borderLeft: '2px solid ' + C.gold, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 4px 4px 0' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.navy }}>
                        {dayH > 0 ? dayH.toFixed(1) + 'h' : '-'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fix2: 同時稼働数フッター（sticky bottom） */}
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
        {/* 月ナビ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevMonth} style={navBtn}>◀</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, minWidth: 88, textAlign: 'center' }}>{year}年{month}月</div>
          <button onClick={nextMonth} style={navBtn}>▶</button>
        </div>
        {/* 週ナビ（週表示時のみ） */}
        {viewMode === 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevWeek} style={navBtn}>← 前週</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 72, textAlign: 'center' }}>{weekBlockStart}日〜{weekBlockEnd}日</span>
            <button onClick={nextWeek} style={navBtn}>次週 →</button>
          </div>
        )}
        {/* 日ナビ（日表示時のみ） */}
        {viewMode === 'day' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={prevDay} style={navBtn}>← 前日</button>
            <span style={{ fontSize: 11, color: C.textMid, fontWeight: 600, minWidth: 36, textAlign: 'center' }}>{selectedDay}日</span>
            <button onClick={nextDay} style={navBtn}>次日 →</button>
          </div>
        )}
        {/* 表示切替 + 更新 */}
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

      {shiftModal && (
        <ShiftInputModal
          modal={shiftModal}
          onClose={() => setShiftModal(null)}
          onSaved={(newShifts) => { setShifts(newShifts); setShiftModal(null); }}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}

export function ShiftInputModal({ modal, onClose, onSaved, year, month }) {
  const { member, dateStr, shift } = modal;
  const memId = member._supaId || member.id;

  const timeOptions = [];
  for (let h = 8; h <= 22; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) timeOptions.push(`${String(h).padStart(2, '0')}:30`);
  }

  const [startTime, setStartTime] = useState(shift ? shift.start_time.slice(0, 5) : '09:00');
  const [endTime, setEndTime] = useState(shift ? shift.end_time.slice(0, 5) : '18:00');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSave = async () => {
    if (startTime >= endTime) { setErrMsg('開始時間は終了時間より前にしてください'); return; }
    setSaving(true);
    setErrMsg('');
    if (shift) {
      const err = await updateShift(shift.id, { start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) {
        const msg = err.message || JSON.stringify(err);
        console.error('[Shift] updateShift failed:', msg);
        alert('保存に失敗しました: ' + msg);
        setErrMsg('保存に失敗しました: ' + msg);
        setSaving(false); return;
      }
    } else {
      if (!memId) { console.warn('[Shift] memId missing for', member.name); }
      const { error: err } = await insertShift({ member_id: memId || null, member_name: member.name, shift_date: dateStr, start_time: startTime + ':00', end_time: endTime + ':00' });
      if (err) {
        const msg = err.message || JSON.stringify(err);
        console.error('[Shift] insertShift failed:', msg);
        alert('保存に失敗しました: ' + msg);
        setErrMsg('保存に失敗しました: ' + msg);
        setSaving(false); return;
      }
    }
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const handleDelete = async () => {
    if (!shift) return;
    setSaving(true);
    await deleteShift(shift.id);
    const { data } = await fetchShifts(`${year}-${String(month).padStart(2, '0')}`);
    onSaved(data || []);
  };

  const btnStyle = (bg, color) => ({ border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 700, borderRadius: 6, padding: '9px 18px', fontSize: 12, background: bg, color, opacity: saving ? 0.65 : 1 });
  const selStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 13, fontFamily: "'Noto Sans JP'", background: C.white, color: C.navy, outline: 'none', cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
      onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 28, width: 350, boxShadow: '0 8px 36px rgba(0,0,0,0.22)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 20 }}>シフト{shift ? '編集' : '入力'}</div>
        {/* メンバー・日付（読み取り専用） */}
        {[{ label: 'メンバー', value: member.name }, { label: '日付', value: dateStr }].map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, padding: '8px 12px', background: C.cream, borderRadius: 6, border: '1px solid ' + C.borderLight }}>{value}</div>
          </div>
        ))}
        {/* 時間選択 */}
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
        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={btnStyle(C.navy, C.white)}>
            {saving ? '保存中...' : '保存'}
          </button>
          {shift && (
            <button onClick={handleDelete} disabled={saving} style={btnStyle('#fed7d7', '#c53030')}>削除</button>
          )}
          <button onClick={onClose} style={{ ...btnStyle(C.offWhite, C.textMid), marginLeft: 'auto' }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
