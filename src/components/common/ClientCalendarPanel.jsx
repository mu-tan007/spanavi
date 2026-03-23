import { useState, useEffect, useMemo } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const NAVY = '#0D2247';
const MINE_COLOR = '#3B82F6';      // 自分のbusy: 青
const CLIENT_COLOR = '#F59E0B';    // クライアントのbusy: オレンジ
const BOTH_COLOR = '#EF4444';      // 両方busy: 赤
const FREE_COLOR = '#D1FAE5';      // 両方空き: 緑

/**
 * クライアント＋自分のGoogleカレンダーを並べて表示するパネル
 *
 * Props:
 *   clientCalendarId - クライアントのGoogleカレンダーID（メールアドレス）
 *   schedulingUrl    - TimeRex/Spir等の日程調整URL
 *   onSelectSlot     - (date, time) => void  空きスロットクリック時
 *   compact          - boolean  コンパクト表示モード
 */
export default function ClientCalendarPanel({ clientCalendarId, schedulingUrl, onSelectSlot, compact = false }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [myBusy, setMyBusy] = useState([]);
  const [clientBusy, setClientBusy] = useState([]);

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
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [weekOffset]);

  // freeBusy 取得
  const fetchBusy = async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7);
    const timeMin = base.toISOString();
    const timeMax = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      if (clientCalendarId) {
        // 複数カレンダー同時取得
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/gcal-proxy?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarIds=primary,${encodeURIComponent(clientCalendarId)}`,
          { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'fetch failed');

        // calendars オブジェクトからそれぞれ取得
        const cals = data.calendars || {};
        const calEntries = Object.entries(cals);
        // primary（自分）とクライアントを分離
        let mine = [], client = [];
        for (const [id, busy] of calEntries) {
          if (id === clientCalendarId) {
            client = busy;
          } else {
            mine = busy;
          }
        }
        setMyBusy(mine);
        setClientBusy(client);
      } else {
        // 自分のカレンダーのみ
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/gcal-proxy?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
          { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'fetch failed');
        setMyBusy(data.busy || []);
        setClientBusy([]);
      }
    } catch (e) {
      console.error('[ClientCalendarPanel] fetch error:', e);
      setError('カレンダーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBusy(); }, [weekOffset, clientCalendarId]);

  // 30分枠生成 (9:00-20:00)
  const getSlots = (dateStr) => {
    const slots = [];
    for (let h = 9; h < 20; h++) {
      for (let m = 0; m < 60; m += 30) {
        const eh = m + 30 >= 60 ? h + 1 : h;
        const em = (m + 30) % 60;
        const sl = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        slots.push({
          startISO: `${dateStr}T${sl}:00+09:00`,
          endISO: `${dateStr}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00+09:00`,
          startLabel: sl,
        });
      }
    }
    return slots;
  };

  // busy判定ヘルパー
  const isBusyIn = (busyArr, startISO, endISO) => {
    const s = new Date(startISO).getTime();
    const e = new Date(endISO).getTime();
    return busyArr.some(b => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return s < be && e > bs;
    });
  };

  const isPast = (startISO) => new Date(startISO) < new Date();

  // 日程調整URL のみの場合
  if (!clientCalendarId && schedulingUrl) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
          このクライアントは日程調整ツールを使用しています
        </div>
        <a href={schedulingUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', padding: '10px 24px', background: NAVY, color: '#fff', borderRadius: 4, fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: "'Noto Sans JP'" }}>
          日程調整ツールを開く
        </a>
      </div>
    );
  }

  // カレンダー未連携
  if (!clientCalendarId && !schedulingUrl) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
        カレンダー未連携です。CRMでGoogle Calendar IDまたは日程調整URLを設定してください。
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP'" }}>
      {/* ヘッダー: 週送りナビ + 凡例 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 3, cursor: 'pointer', padding: '2px 8px', fontSize: 11 }}>&lt;</button>
          <span style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{days[0]?.label} ~ {days[6]?.label}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 3, cursor: 'pointer', padding: '2px 8px', fontSize: 11 }}>&gt;</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6B7280', textDecoration: 'underline' }}>今週</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 9 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: MINE_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle' }}></span>自分</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: CLIENT_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle' }}></span>クライアント</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: FREE_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle' }}></span>両方空き</span>
        </div>
      </div>

      {loading && <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#6B7280' }}>読み込み中...</div>}
      {error && <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#DC2626' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(7, 1fr)`, fontSize: 10, border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
          {/* ヘッダー行 */}
          <div style={{ background: NAVY, color: '#fff', padding: '4px 2px', textAlign: 'center', fontWeight: 600 }}></div>
          {days.map(d => (
            <div key={d.dateStr} style={{ background: NAVY, color: d.isWeekend ? '#FCA5A5' : '#fff', padding: '4px 2px', textAlign: 'center', fontWeight: 600 }}>
              {d.label}<br /><span style={{ fontSize: 9, opacity: 0.8 }}>{d.dayLabel}</span>
            </div>
          ))}

          {/* 時間スロット行 */}
          {getSlots(days[0]?.dateStr || '').map((refSlot, si) => (
            <div key={si} style={{ display: 'contents' }}>
              {/* 時間ラベル */}
              <div style={{ padding: '1px 4px', textAlign: 'right', color: '#6B7280', fontSize: 9, borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {refSlot.startLabel}
              </div>
              {/* 各日のスロット */}
              {days.map(d => {
                const slots = getSlots(d.dateStr);
                const slot = slots[si];
                if (!slot) return <div key={d.dateStr} />;

                const past = isPast(slot.startISO);
                const mBusy = isBusyIn(myBusy, slot.startISO, slot.endISO);
                const cBusy = isBusyIn(clientBusy, slot.startISO, slot.endISO);

                let bg = '#fff';
                let cursor = 'pointer';
                if (past) { bg = '#F9FAFB'; cursor = 'default'; }
                else if (mBusy && cBusy) { bg = BOTH_COLOR + '20'; cursor = 'default'; }
                else if (mBusy) { bg = MINE_COLOR + '20'; cursor = 'default'; }
                else if (cBusy) { bg = CLIENT_COLOR + '20'; cursor = 'default'; }
                else { bg = FREE_COLOR; }

                const canSelect = !past && !mBusy && !cBusy;

                return (
                  <div key={d.dateStr}
                    onClick={() => canSelect && onSelectSlot?.(d.dateStr, slot.startLabel)}
                    style={{
                      background: bg,
                      borderBottom: '1px solid #F3F4F6',
                      borderLeft: '1px solid #F3F4F6',
                      height: compact ? 16 : 20,
                      cursor,
                      position: 'relative',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (canSelect) e.currentTarget.style.background = '#A7F3D0'; }}
                    onMouseLeave={e => { if (canSelect) e.currentTarget.style.background = FREE_COLOR; }}
                    title={past ? '過去' : mBusy && cBusy ? '両方予定あり' : mBusy ? '自分: 予定あり' : cBusy ? 'クライアント: 予定あり' : `${d.label} ${slot.startLabel} - 空き`}
                  >
                    {mBusy && !cBusy && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: MINE_COLOR, opacity: 0.25 }} />}
                    {cBusy && !mBusy && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: CLIENT_COLOR, opacity: 0.25 }} />}
                    {mBusy && cBusy && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: BOTH_COLOR, opacity: 0.2 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
