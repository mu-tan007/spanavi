import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge } from '../ui';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const NAVY = color.navy;
const CLIENT_COLOR = color.navy;     // クライアントのbusy: ネイビー
const FREE_COLOR = '#E8EDF5';        // 空き: 薄いネイビー
const APPO_COLOR = color.gold;       // 登録済みアポ: ゴールド

/**
 * クライアント＋自分のGoogleカレンダーを並べて表示するパネル
 *
 * Props:
 *   clientCalendarId - クライアントのGoogleカレンダーID（メールアドレス）
 *   schedulingUrl    - TimeRex/Spir等の日程調整URL
 *   onSelectSlot     - (date, time) => void  空きスロットクリック時
 *   compact          - boolean  コンパクト表示モード
 */
export default function ClientCalendarPanel({ clientCalendarId, schedulingUrl, schedulingUrl2, schedulingLabel, schedulingLabel2, onSelectSlot, existingAppointments = [], onUpdateCalendarLines = null, compact = false, ...props }) {
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
      // clientCalendarId はカンマ区切りで複数カレンダーを許容（担当者が複数カレンダーを登録した場合）
      const calIds = String(clientCalendarId || '').split(',').map(s => s.trim()).filter(Boolean);
      if (calIds.length > 0) {
        // クライアントの（複数）カレンダーを取得し、busy 区間を合算して1枚に重ねる
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/gcal-proxy?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarIds=${encodeURIComponent(calIds.join(','))}`,
          { headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'fetch failed');

        const cals = data.calendars || {};
        const calErrors = data.calendarErrors || {};
        setMyBusy([]);
        setClientBusy(calIds.flatMap(id => cals[id] || []));
        setClientErrors(calIds.flatMap(id => calErrors[id] || []));
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

  // 注意事項: list.cautions の「カレンダー」セクション (staticNoteLines) を編集対象とする
  // 保存時は onUpdateCalendarLines(newLines) で list.cautions に直接書き戻す（list 固有）
  const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  const stripBullet = (s) => (s || '').replace(/^[\s　]*[・･•‧\-*]+[\s　]*/, '');
  const buildInitial = (staticRaw) => (staticRaw || []).map(stripBullet).filter(s => s && s.trim());
  const [localNotes, setLocalNotes] = useState(() => buildInitial(props.staticNoteLines));

  // propsが変わったらlocalNotesを同期
  useEffect(() => { setLocalNotes(buildInitial(props.staticNoteLines)); /* eslint-disable-next-line */ }, [JSON.stringify(props.staticNoteLines || [])]);

  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const updateNote = (idx, val) => { const next = [...localNotes]; next[idx] = val; setLocalNotes(next); setNotesSaved(false); };
  const removeNote = (idx) => { const next = localNotes.filter((_, i) => i !== idx); setLocalNotes(next); setNotesSaved(false); };
  const addNote = () => { setLocalNotes(prev => [...prev, '']); setNotesSaved(false); };
  const handleSaveNotes = async () => {
    if (!onUpdateCalendarLines) return;
    setNotesSaving(true);
    await onUpdateCalendarLines(localNotes.filter(Boolean));
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const notesBlock = (
    <div style={{ padding: '8px 12px', background: '#F0F3F8', borderRadius: radius.md, border: '1px solid #D0D8E8', fontSize: font.size.xs, marginTop: 6 }}>
      <div style={{ fontWeight: font.weight.semibold, color: NAVY, marginBottom: 4 }}>注意事項</div>
      {localNotes.map((note, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: NAVY, width: 14, flexShrink: 0 }}>{CIRCLE_NUMS[i] || `${i+1}.`}</span>
          <Input size="sm" value={note} onChange={e => updateNote(i, e.target.value)}
            placeholder="注意事項を入力..."
            style={{ padding: '3px 6px', fontSize: 10, minHeight: 0 }}
            containerStyle={{ flex: 1 }} />
          <button onClick={() => removeNote(i)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: color.danger, fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
        <button onClick={addNote}
          style={{ border: '1px dashed #B0BAC8', background: 'none', cursor: 'pointer', fontSize: 9, color: '#6B7280', padding: '2px 8px', borderRadius: radius.sm }}>+ 追加</button>
        {onUpdateCalendarLines && (
          <button onClick={handleSaveNotes} disabled={notesSaving}
            style={{ padding: '2px 10px', fontSize: 9, fontWeight: font.weight.semibold, border: 'none', borderRadius: radius.sm, background: notesSaved ? color.success : NAVY, color: color.white, cursor: notesSaving ? 'default' : 'pointer', opacity: notesSaving ? 0.6 : 1 }}>
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
      <div style={{ fontFamily: font.family.sans, padding: 16, display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {schedulingLinks.length > 0 ? (
          schedulingLinks.map((link, i) => (
            <div key={i} style={{ padding: '10px 12px', background: '#EFF6FF', borderRadius: radius.md, border: '1px solid #BFDBFE' }}>
              <div style={{ fontSize: font.size.xs, color: '#1E40AF', marginBottom: 8, fontWeight: font.weight.semibold }}>{link.label}</div>
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', padding: '8px 16px', background: NAVY, color: color.white, borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold, textDecoration: 'none', textAlign: 'center' }}>
                {link.label}を開く
              </a>
            </div>
          ))
        ) : (
          <div style={{ color: '#9CA3AF', fontSize: font.size.sm, textAlign: 'center' }}>カレンダー未連携です。CRMの担当者設定からカレンダーIDまたは日程調整URLを登録してください。</div>
        )}
        {notesBlock}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: font.family.sans }}>
      {/* Googleカレンダー連携済みでも日程調整ツールがあればリンク表示 */}
      {schedulingLinks.map((link, i) => (
        <div key={i} style={{ marginBottom: 6, padding: '6px 10px', background: '#EFF6FF', borderRadius: radius.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#1E40AF', fontWeight: font.weight.semibold }}>{link.label}</span>
          <a href={link.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, padding: '3px 10px', background: NAVY, color: color.white, borderRadius: radius.sm, textDecoration: 'none', fontWeight: font.weight.semibold }}>
            開く
          </a>
        </div>
      ))}

      {/* クライアントカレンダー未共有警告 */}
      {clientCalendarId && clientErrors.length > 0 && (
        <div style={{ padding: '8px 12px', marginBottom: space[2], background: '#FEE2E2', borderRadius: radius.md, fontSize: font.size.xs, color: '#991B1B' }}>
          カレンダーが共有されていません。クライアント担当者にGoogleカレンダーの「予定の時間枠の表示（空き時間情報）」共有を依頼してください。
        </div>
      )}

      {/* ヘッダー: 週送りナビ + 凡例 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: `1px solid ${color.gray200}`, borderRadius: radius.sm, cursor: 'pointer', padding: '2px 8px', fontSize: font.size.xs }}>&lt;</button>
          <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: NAVY }}>{days[0]?.label} ~ {days[6]?.label}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'none', border: `1px solid ${color.gray200}`, borderRadius: radius.sm, cursor: 'pointer', padding: '2px 8px', fontSize: font.size.xs }}>&gt;</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6B7280', textDecoration: 'underline' }}>今週</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: space[2], fontSize: 9 }}>
          {clientCalendarId && <span><span style={{ display: 'inline-block', width: 8, height: 8, background: CLIENT_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle', opacity: 0.3 }}></span>予定あり</span>}
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: APPO_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle' }}></span>アポ済</span>
          {clientCalendarId && <span><span style={{ display: 'inline-block', width: 8, height: 8, background: FREE_COLOR, borderRadius: 2, marginRight: 2, verticalAlign: 'middle', border: '1px solid #D0D8E8' }}></span>空き</span>}
        </div>
      </div>

      {loading && <div style={{ padding: space[3], textAlign: 'center', fontSize: font.size.xs, color: '#6B7280' }}>読み込み中...</div>}
      {error && <div style={{ padding: space[3], textAlign: 'center', fontSize: font.size.xs, color: color.danger }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(7, 1fr)`, fontSize: 10, border: `1px solid ${color.gray200}`, borderRadius: radius.md, overflow: 'hidden' }}>
          {/* ヘッダー行 */}
          <div style={{ background: NAVY, color: color.white, padding: '4px 2px', textAlign: 'center', fontWeight: font.weight.semibold }}></div>
          {days.map(d => (
            <div key={d.dateStr} style={{ background: NAVY, color: d.isWeekend ? '#FCA5A5' : color.white, padding: '4px 2px', textAlign: 'center', fontWeight: font.weight.semibold }}>
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

                let bg = color.white;
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
                        <span style={{ position: 'absolute', top: 0, left: 2, fontSize: compact ? 6 : 7, color: '#8B6914', fontWeight: font.weight.bold, lineHeight: compact ? '16px' : '20px', whiteSpace: 'nowrap' }}>
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
