import { useState, useEffect, useMemo } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const NAVY = '#0D2247';
const CLIENT_COLOR = '#0D2247';    // クライアントのbusy: ネイビー
const FREE_COLOR = '#E8EDF5';      // 空き: 薄いネイビー
const APPO_COLOR = '#C9A96E';      // 登録済みアポ: ゴールド

/**
 * クライアント＋自分のGoogleカレンダーを並べて表示するパネル
 *
 * Props:
 *   clientCalendarId - クライアントのGoogleカレンダーID（メールアドレス）
 *   schedulingUrl    - TimeRex/Spir等の日程調整URL
 *   onSelectSlot     - (date, time) => void  空きスロットクリック時
 *   compact          - boolean  コンパクト表示モード
 */
export default function ClientCalendarPanel({ clientCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, onSelectSlot, existingAppointments = [], schedulingNotes = '', onUpdateNotes, compact = false, ...props }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [myBusy, setMyBusy] = useState([]);
  const [clientBusy, setClientBusy] = useState([]);
  const [clientErrors, setClientErrors] = useState([]);

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
        // クライアントのカレンダーのみ取得
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/gcal-proxy?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarIds=${encodeURIComponent(clientCalendarId)}`,
          { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'fetch failed');

        const cals = data.calendars || {};
        const calErrors = data.calendarErrors || {};
        setMyBusy([]);
        setClientBusy(cals[clientCalendarId] || []);
        setClientErrors(calErrors[clientCalendarId] || []);
      } else {
        // クライアント未連携時はデータ取得しない
        setMyBusy([]);
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

  // 日程調整URLリンク群を構築
  const getToolName = (url) => url?.includes('timerex') ? 'TimeRex' : url?.includes('spir') ? 'Spir' : '日程調整ツール';
  const schedulingLinks = [
    schedulingUrl ? { url: schedulingUrl, label: schedulingLabel || getToolName(schedulingUrl) } : null,
    schedulingUrl2 ? { url: schedulingUrl2, label: schedulingLabel2 || getToolName(schedulingUrl2) } : null,
  ].filter(Boolean);

  // 注意事項パース（JSON配列 or 改行区切りテキスト）
  const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  const stripBullet = (s) => (s || '').replace(/^[\s　]*[・･•‧\-*]+[\s　]*/, '');
  const parseNotes = (raw) => {
    if (!raw) return [];
    try { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.map(stripBullet); } catch {}
    return raw.split('\n').map(stripBullet).filter(s => s.trim());
  };
  // schedulingNotes が空で list 由来の static lines があれば、それを初期値として編集可能にする
  // （保存後は schedulingNotes に永続化される）
  const buildInitial = (notesRaw, staticRaw) => {
    const fromNotes = parseNotes(notesRaw);
    if (fromNotes.length > 0) return fromNotes;
    return (staticRaw || []).map(stripBullet).filter(s => s && s.trim());
  };
  const [localNotes, setLocalNotes] = useState(() => buildInitial(schedulingNotes, props.staticNoteLines));

  // propsが変わったらlocalNotesを同期
  useEffect(() => { setLocalNotes(buildInitial(schedulingNotes, props.staticNoteLines)); /* eslint-disable-next-line */ }, [schedulingNotes, JSON.stringify(props.staticNoteLines || [])]);

  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const updateNote = (idx, val) => { const next = [...localNotes]; next[idx] = val; setLocalNotes(next); setNotesSaved(false); };
  const removeNote = (idx) => { const next = localNotes.filter((_, i) => i !== idx); setLocalNotes(next); setNotesSaved(false); };
  const addNote = () => { setLocalNotes(prev => [...prev, '']); setNotesSaved(false); };
  const handleSaveNotes = async () => {
    if (!onUpdateNotes) return;
    setNotesSaving(true);
    await onUpdateNotes(JSON.stringify(localNotes.filter(Boolean)));
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const notesBlock = (
    <div style={{ padding: '8px 12px', background: '#F0F3F8', borderRadius: 4, border: '1px solid #D0D8E8', fontSize: 11, marginTop: 6 }}>
      <div style={{ fontWeight: 600, color: NAVY, marginBottom: 4 }}>注意事項</div>
      {localNotes.map((note, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: NAVY, width: 14, flexShrink: 0 }}>{CIRCLE_NUMS[i] || `${i+1}.`}</span>
          <input value={note} onChange={e => updateNote(i, e.target.value)}
            style={{ flex: 1, padding: '3px 6px', fontSize: 10, border: '1px solid #D0D8E8', borderRadius: 3, background: '#fff', fontFamily: "'Noto Sans JP'", outline: 'none' }}
            placeholder="注意事項を入力..." />
          <button onClick={() => removeNote(i)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
        <button onClick={addNote}
          style={{ border: '1px dashed #B0BAC8', background: 'none', cursor: 'pointer', fontSize: 9, color: '#6B7280', padding: '2px 8px', borderRadius: 3 }}>+ 追加</button>
        {onUpdateNotes && (
          <button onClick={handleSaveNotes} disabled={notesSaving}
            style={{ padding: '2px 10px', fontSize: 9, fontWeight: 600, border: 'none', borderRadius: 3, background: notesSaved ? '#10B981' : NAVY, color: '#fff', cursor: notesSaving ? 'default' : 'pointer', opacity: notesSaving ? 0.6 : 1 }}>
            {notesSaving ? '保存中...' : notesSaved ? '保存済み' : '保存'}
          </button>
        )}
      </div>
    </div>
  );

  // カレンダー未連携: 日程調整ツールリンクがあればそれを、無ければ未連携メッセージを表示。
  // どちらの場合も list.cautions 由来の注意事項 (notesBlock) は必ず描画する。
  if (!clientCalendarId) {
    return (
      <div style={{ fontFamily: "'Noto Sans JP'", padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {schedulingLinks.length > 0 ? (
          schedulingLinks.map((link, i) => (
            <div key={i} style={{ padding: '10px 12px', background: '#EFF6FF', borderRadius: 4, border: '1px solid #BFDBFE' }}>
              <div style={{ fontSize: 11, color: '#1E40AF', marginBottom: 8, fontWeight: 600 }}>{link.label}</div>
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', padding: '8px 16px', background: NAVY, color: '#fff', borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                {link.label}を開く
              </a>
            </div>
          ))
        ) : (
          <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }}>カレンダー未連携です。CRMの担当者設定からカレンダーIDまたは日程調整URLを登録してください。</div>
        )}
        {notesBlock}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP'" }}>
      {/* Googleカレンダー連携済みでも日程調整ツールがあればリンク表示 */}
      {schedulingLinks.map((link, i) => (
        <div key={i} style={{ marginBottom: 6, padding: '6px 10px', background: '#EFF6FF', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#1E40AF', fontWeight: 600 }}>{link.label}</span>
          <a href={link.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, padding: '3px 10px', background: NAVY, color: '#fff', borderRadius: 3, textDecoration: 'none', fontWeight: 600 }}>
            開く
          </a>
        </div>
      ))}

      {/* クライアントカレンダー未共有警告 */}
      {clientCalendarId && clientErrors.length > 0 && (
        <div style={{ padding: '8px 12px', marginBottom: 8, background: '#FEE2E2', borderRadius: 4, fontSize: 11, color: '#991B1B' }}>
          カレンダーが共有されていません。クライアント担当者にGoogleカレンダーの「予定の時間枠の表示（空き時間情報）」共有を依頼してください。
        </div>
      )}

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
          {clientCalendarId && <span><span style={{ display: 'inline-block', width: 8, height: 8, background: CLIENT_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle', opacity: 0.3 }}></span>予定あり</span>}
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: APPO_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle' }}></span>アポ済</span>
          {clientCalendarId && <span><span style={{ display: 'inline-block', width: 8, height: 8, background: FREE_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle', border: '1px solid #D0D8E8' }}></span>空き</span>}
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
                const cBusy = isBusyIn(clientBusy, slot.startISO, slot.endISO);
                const appo = existingAppointments.find(a => a.meetDate === d.dateStr && a.meetTime === slot.startLabel);

                let bg = '#fff';
                let cursor = 'pointer';
                if (past) { bg = '#F9FAFB'; cursor = 'default'; }
                else if (appo) { bg = APPO_COLOR + '20'; cursor = 'default'; }
                else if (cBusy) { bg = CLIENT_COLOR + '15'; cursor = 'default'; }
                else { bg = FREE_COLOR; }

                const canSelect = !past && !cBusy && !appo;

                return (
                  <div key={d.dateStr}
                    onClick={() => canSelect && onSelectSlot?.(d.dateStr, slot.startLabel)}
                    style={{
                      background: bg,
                      borderBottom: '1px solid #E8EDF5',
                      borderLeft: '1px solid #E8EDF5',
                      height: compact ? 16 : 20,
                      cursor,
                      position: 'relative',
                      transition: 'background 0.1s',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (canSelect) e.currentTarget.style.background = '#D0D8E8'; }}
                    onMouseLeave={e => { if (canSelect) e.currentTarget.style.background = FREE_COLOR; }}
                    title={appo ? `アポ: ${appo.isOnline ? 'オンライン' : appo.meetLocation || ''}` : past ? '過去' : cBusy ? '予定あり' : `${d.label} ${slot.startLabel} - 空き`}
                  >
                    {appo && (
                      <>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: APPO_COLOR, opacity: 0.25 }} />
                        <span style={{ position: 'absolute', top: 0, left: 2, fontSize: compact ? 6 : 7, color: '#8B6914', fontWeight: 700, lineHeight: compact ? '16px' : '20px', whiteSpace: 'nowrap' }}>
                          {appo.isOnline ? 'オンライン' : (appo.meetLocation || '').replace(/[都府県]$/, '')}
                        </span>
                      </>
                    )}
                    {!appo && cBusy && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: CLIENT_COLOR, opacity: 0.15 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {notesBlock}
    </div>
  );
}
