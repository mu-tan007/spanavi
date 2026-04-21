import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import * as gcal from '../lib/gcal'
import { logAudit } from '../lib/audit'

// Caesarテーマカラー（全て青系に統一）
const CAESAR_COLORS = {
  top_meeting: '#032D60',   // トップ面談 - ネイビー
  regular:     '#032D60',   // 打合せ - 濃い青
  dd_session:  '#FFFFFF',   // DDセッション - ダークネイビー
  other:       '#4a8cd4',   // その他 - 明るい青
  gcal:        '#032D60',   // Google Calendar - 中間の青
}

const MEETING_LABELS = {
  top_meeting: 'トップ面談',
  regular: '打合せ',
  dd_session: 'DDセッション',
  other: 'その他',
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0〜23

function useMeetings(viewStart, viewEnd) {
  return useQuery({
    queryKey: ['meetings-cal', viewStart.toISOString(), viewEnd.toISOString()],
    queryFn: async () => {
      const { data } = await supabase.from('deal_meetings')
        .select('*, deals(id, name)')
        .gte('held_at', viewStart.toISOString())
        .lte('held_at', viewEnd.toISOString())
        .order('held_at')
      return data || []
    },
  })
}

function useDealsSimple() {
  return useQuery({
    queryKey: ['deals-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('deals').select('id, name').order('name')
      return data || []
    },
  })
}

// 日付ヘルパー
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x }
function startOfWeek(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x }
function endOfWeek(d) { const x = startOfWeek(d); x.setDate(x.getDate() + 6); x.setHours(23,59,59,999); return x }
function startOfMonth(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x }
function endOfMonth(d) { const x = startOfMonth(d); x.setMonth(x.getMonth() + 1); x.setDate(0); x.setHours(23,59,59,999); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function sameDay(a, b) { return a.toDateString() === b.toDateString() }
function fmtDate(d) { return `${d.getMonth()+1}月${d.getDate()}日` }
function fmtTime(d) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }

export default function CalendarPage() {
  const today = new Date()
  const [view, setView] = useState('month') // month | week | day
  const [cursor, setCursor] = useState(new Date()) // 表示中の基準日
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalEvents, setGcalEvents] = useState([])
  const [showDayDetail, setShowDayDetail] = useState(null) // 日付クリック時のモーダル
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ deal_id: '', meeting_type: 'regular', held_at: '', summary: '', syncGoogle: true })
  // クイック作成ポップオーバー
  const [quickCreate, setQuickCreate] = useState(null) // { date, x, y } | null
  // イベント詳細ポップオーバー
  const [eventDetail, setEventDetail] = useState(null) // { event, x, y } | null
  const qc = useQueryClient()

  // 表示範囲を計算
  const viewRange = useMemo(() => {
    if (view === 'day') return { start: startOfDay(cursor), end: endOfDay(cursor) }
    if (view === 'week') return { start: startOfWeek(cursor), end: endOfWeek(cursor) }
    // month: 表示する月の月初〜月末
    return { start: startOfMonth(cursor), end: endOfMonth(cursor) }
  }, [view, cursor])

  const { data: meetings = [] } = useMeetings(viewRange.start, viewRange.end)
  const { data: deals = [] } = useDealsSimple()

  // Google Calendar 初期化
  useEffect(() => {
    if (!gcal.isConfigured()) return
    async function init() {
      try {
        await gcal.loadGapi()
        // Google からの ?code= 戻りがあれば先に exchange
        const justLinked = await gcal.captureCodeFromUrl()
        if (justLinked) {
          setGcalConnected(true)
          return
        }
        // 既存の refresh_token から access_token を取得
        const ok = await gcal.fetchAccessToken()
        if (ok) setGcalConnected(true)
      } catch (e) {
        console.error('[calendar] gcal init failed:', e)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (gcalConnected) fetchGcalEvents()
  }, [viewRange.start, viewRange.end, gcalConnected])

  async function fetchGcalEvents() {
    const events = await gcal.listEvents(viewRange.start, viewRange.end)
    setGcalEvents(events)
  }

  function connectGoogle() { gcal.signIn() }

  // ナビゲーション
  function prev() {
    if (view === 'day') setCursor(addDays(cursor, -1))
    else if (view === 'week') setCursor(addDays(cursor, -7))
    else { const x = new Date(cursor); x.setMonth(x.getMonth() - 1); setCursor(x) }
  }
  function next() {
    if (view === 'day') setCursor(addDays(cursor, 1))
    else if (view === 'week') setCursor(addDays(cursor, 7))
    else { const x = new Date(cursor); x.setMonth(x.getMonth() + 1); setCursor(x) }
  }
  function goToday() { setCursor(new Date()) }

  // 統合イベント（Caesar + Google）— 紐付け済みは重複排除
  const allEvents = useMemo(() => {
    const list = []
    const linkedGcalIds = new Set(meetings.map(m => m.cal_event_id).filter(Boolean))

    for (const m of meetings) {
      if (!m.held_at) continue
      const start = new Date(m.held_at)
      list.push({
        id: `m-${m.id}`,
        start, end: new Date(start.getTime() + 60 * 60 * 1000),
        title: m.deals?.name || MEETING_LABELS[m.meeting_type] || '打合せ',
        sub: MEETING_LABELS[m.meeting_type] || '打合せ',
        color: CAESAR_COLORS[m.meeting_type] || CAESAR_COLORS.other,
        source: 'caesar',
        raw: m,
        synced: !!m.cal_event_id, // Google同期されている
      })
    }
    for (const e of gcalEvents) {
      // Caesarに紐付け済みのGoogleイベントは重複表示しない
      if (linkedGcalIds.has(e.id)) continue
      const startStr = e.start?.dateTime || e.start?.date
      const endStr = e.end?.dateTime || e.end?.date
      if (!startStr) continue
      const start = new Date(startStr)
      const end = endStr ? new Date(endStr) : new Date(start.getTime() + 60 * 60 * 1000)
      list.push({
        id: `g-${e.id}`,
        start, end,
        title: e.summary || '(予定)',
        sub: 'Google',
        color: CAESAR_COLORS.gcal,
        source: 'google',
        raw: e,
        allDay: !e.start?.dateTime,
      })
    }
    return list.sort((a, b) => a.start - b.start)
  }, [meetings, gcalEvents])

  function getEventsForDay(date) {
    return allEvents.filter(e => sameDay(e.start, date))
  }

  // 予定の時間を更新（ドラッグ/リサイズ後）— 双方向同期
  async function updateEventTime(ev, newStart, newEnd) {
    try {
      if (ev.source === 'caesar') {
        // Caesarを更新
        await supabase.from('deal_meetings').update({
          held_at: newStart.toISOString(),
        }).eq('id', ev.raw.id)
        // Google にも同期（cal_event_id があれば）
        if (ev.raw.cal_event_id && gcalConnected && window.gapi?.client?.calendar) {
          try {
            await window.gapi.client.calendar.events.patch({
              calendarId: 'primary',
              eventId: ev.raw.cal_event_id,
              resource: {
                start: { dateTime: newStart.toISOString(), timeZone: 'Asia/Tokyo' },
                end: { dateTime: newEnd.toISOString(), timeZone: 'Asia/Tokyo' },
              },
            })
            fetchGcalEvents()
          } catch (e) { console.error('Gcal sync failed:', e) }
        }
      } else if (ev.source === 'google') {
        // Google を更新
        if (window.gapi?.client?.calendar) {
          await window.gapi.client.calendar.events.patch({
            calendarId: 'primary',
            eventId: ev.raw.id,
            resource: {
              start: { dateTime: newStart.toISOString(), timeZone: 'Asia/Tokyo' },
              end: { dateTime: newEnd.toISOString(), timeZone: 'Asia/Tokyo' },
            },
          })
        }
        // 紐付けされた Caesar 予定も更新
        const { data: linked } = await supabase.from('deal_meetings').select('id').eq('cal_event_id', ev.raw.id).maybeSingle()
        if (linked) {
          await supabase.from('deal_meetings').update({ held_at: newStart.toISOString() }).eq('id', linked.id)
        }
        fetchGcalEvents()
      }
      qc.invalidateQueries({ queryKey: ['meetings-cal'] })
    } catch (err) {
      alert('更新エラー: ' + err.message)
    }
  }

  function openEventDetail(ev, clickEvent) {
    clickEvent?.stopPropagation()
    const x = clickEvent ? Math.min(clickEvent.clientX, window.innerWidth - 380) : window.innerWidth / 2 - 190
    const y = clickEvent ? Math.min(clickEvent.clientY, window.innerHeight - 300) : window.innerHeight / 2 - 150
    setEventDetail({ event: ev, x, y })
  }

  async function deleteEvent(ev) {
    if (!confirm('この予定を削除しますか？')) return
    try {
      if (ev.source === 'caesar') {
        // Caesar側を削除
        await supabase.from('deal_meetings').delete().eq('id', ev.raw.id)
        // Google にも紐付けがあれば削除
        if (ev.raw.cal_event_id && gcalConnected && window.gapi?.client?.calendar) {
          try {
            await window.gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: ev.raw.cal_event_id })
            fetchGcalEvents()
          } catch (e) { console.error('Gcal delete failed:', e) }
        }
      } else if (ev.source === 'google') {
        // Google を削除
        if (window.gapi?.client?.calendar) {
          await window.gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: ev.raw.id })
        }
        // 紐付けされた Caesar 予定も削除
        const { data: linked } = await supabase.from('deal_meetings').select('id').eq('cal_event_id', ev.raw.id).maybeSingle()
        if (linked) {
          await supabase.from('deal_meetings').delete().eq('id', linked.id)
        }
        fetchGcalEvents()
      }
      logAudit({
        action: 'delete', resourceType: 'meeting',
        resourceId: ev.raw.id, resourceName: ev.title,
        metadata: { source: ev.source },
      })
      qc.invalidateQueries({ queryKey: ['meetings-cal'] })
      setEventDetail(null)
    } catch (err) {
      alert('削除エラー: ' + err.message)
    }
  }

  function openQuickCreate(date, clickEvent) {
    // クリック位置を取得してポップオーバー表示
    const rect = clickEvent?.currentTarget?.getBoundingClientRect()
    const x = clickEvent ? Math.min(clickEvent.clientX, window.innerWidth - 340) : window.innerWidth / 2 - 170
    const y = clickEvent ? Math.min(clickEvent.clientY, window.innerHeight - 340) : window.innerHeight / 2 - 170
    setQuickCreate({ date, x, y })
    // formをリセットして日時セット
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({ deal_id: '', meeting_type: 'regular', held_at: localDateTime, summary: '', syncGoogle: true, title: '' })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        deal_id: form.deal_id || null,
        meeting_type: form.meeting_type,
        held_at: form.held_at,
        summary: form.summary,
      }
      if (!payload.deal_id) delete payload.deal_id
      // Caesarに保存して新規IDを取得
      const { data: created } = await supabase.from('deal_meetings').insert(payload).select().single().then(r => r).catch(() => ({ data: null }))

      if (form.syncGoogle && gcalConnected && payload.held_at) {
        const deal = deals.find(d => d.id === payload.deal_id)
        const title = form.title || deal?.name || MEETING_LABELS[payload.meeting_type] || '打合せ'
        const gEvent = await gcal.createEvent({
          summary: title,
          description: payload.summary || '',
          start: new Date(payload.held_at).toISOString(),
        })
        // GoogleイベントIDをCaesar側に紐付ける
        if (created && gEvent?.id) {
          await supabase.from('deal_meetings').update({ cal_event_id: gEvent.id }).eq('id', created.id)
        }
        fetchGcalEvents()
      }
      qc.invalidateQueries({ queryKey: ['meetings-cal'] })
      setQuickCreate(null)
      setForm({ deal_id: '', meeting_type: 'regular', held_at: '', summary: '', syncGoogle: true, title: '' })
    } catch (err) {
      alert('保存エラー: ' + err.message)
    } finally { setSaving(false) }
  }

  // ビュータイトル
  const titleText = useMemo(() => {
    if (view === 'day') return `${cursor.getFullYear()}年 ${fmtDate(cursor)}（${DAYS[cursor.getDay()]}）`
    if (view === 'week') {
      const s = startOfWeek(cursor), e = endOfWeek(cursor)
      return `${s.getFullYear()}年 ${fmtDate(s)} 〜 ${fmtDate(e)}`
    }
    return `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`
  }, [view, cursor])

  return (
    <div style={{ padding: '16px 20px', height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <button onClick={goToday} style={{
          height: 32, padding: '0 14px', background: '#fff', border: '0.5px solid #E5E5E5',
          borderRadius: 6, color: '#FFFFFF', fontSize: 12, cursor: 'pointer', fontWeight: 500,
        }}>今日</button>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={prev} style={{ width: 32, height: 32, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 6, color: '#706E6B', fontSize: 14, cursor: 'pointer' }}>‹</button>
          <button onClick={next} style={{ width: 32, height: 32, background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 6, color: '#706E6B', fontSize: 14, cursor: 'pointer' }}>›</button>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF', margin: 0 }}>{titleText}</h1>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View switcher */}
          <div style={{ display: 'flex', background: '#F3F2F2', borderRadius: 6, padding: 2 }}>
            {[['day', '日'], ['week', '週'], ['month', '月']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{
                height: 28, padding: '0 14px', border: 'none',
                background: view === k ? '#032D60' : 'transparent',
                color: view === k ? '#fff' : '#706E6B',
                borderRadius: 5, fontSize: 12, cursor: 'pointer', fontWeight: 500,
              }}>{l}</button>
            ))}
          </div>

          {gcal.isConfigured() && (
            gcalConnected ? (
              <span style={{ height: 32, padding: '0 12px', background: '#E1F5EE', borderRadius: 6, color: '#2E844A', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                ✓ Google Calendar 連携中
              </span>
            ) : (
              <button onClick={connectGoogle} style={{
                height: 32, padding: '0 12px', background: '#fff', border: '0.5px solid #E5E5E5',
                borderRadius: 6, color: '#706E6B', fontSize: 11, cursor: 'pointer',
              }}>Google Calendar を接続</button>
            )
          )}

        </div>
      </div>

      {/* Calendar body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', border: '0.5px solid #E5E5E5', borderRadius: 8 }}>
        {view === 'month' && <MonthView cursor={cursor} allEvents={allEvents} onDayClick={setShowDayDetail} onQuickCreate={openQuickCreate} onEventClick={openEventDetail} onEventMove={updateEventTime} />}
        {view === 'week' && <WeekView cursor={cursor} allEvents={allEvents} getEventsForDay={getEventsForDay} onDayClick={setShowDayDetail} onSlotClick={openQuickCreate} onEventClick={openEventDetail} onEventMove={updateEventTime} />}
        {view === 'day' && <DayView cursor={cursor} events={getEventsForDay(cursor)} onSlotClick={openQuickCreate} onEventClick={openEventDetail} onEventMove={updateEventTime} />}
      </div>

      {/* 日付クリック詳細モーダル */}
      {showDayDetail && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDayDetail(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,60,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
                {showDayDetail.getFullYear()}年 {fmtDate(showDayDetail)}（{DAYS[showDayDetail.getDay()]}）
              </h2>
              <button onClick={() => setShowDayDetail(null)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#706E6B', cursor: 'pointer' }}>✕</button>
            </div>
            {(() => {
              const evs = getEventsForDay(showDayDetail)
              if (evs.length === 0) return <div style={{ fontSize: 13, color: '#706E6B', textAlign: 'center', padding: '24px 0' }}>予定なし</div>
              return evs.map(ev => (
                <div key={ev.id} style={{ padding: '10px 12px', marginBottom: 6, borderRadius: 6, background: '#FAFAFA', borderLeft: `4px solid ${ev.color}` }}>
                  <div style={{ fontSize: 11, color: '#706E6B', marginBottom: 3 }}>
                    {ev.allDay ? '終日' : `${fmtTime(ev.start)} - ${fmtTime(ev.end)}`} · {ev.sub}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#FFFFFF' }}>{ev.title}</div>
                  {ev.raw?.summary && ev.source === 'caesar' && <div style={{ fontSize: 12, color: '#706E6B', marginTop: 4 }}>{ev.raw.summary}</div>}
                  {ev.raw?.location && <div style={{ fontSize: 11, color: '#706E6B', marginTop: 2 }}>📍 {ev.raw.location}</div>}
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 予定詳細ポップオーバー */}
      {eventDetail && (() => {
        const ev = eventDetail.event
        return (
          <>
            <div onClick={() => setEventDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <div style={{
              position: 'fixed', left: eventDetail.x, top: eventDetail.y,
              background: '#fff', borderRadius: 10, padding: 20, width: 360,
              boxShadow: '0 4px 24px rgba(10,30,60,0.2)', border: '0.5px solid #E5E5E5',
              zIndex: 100,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: ev.color, flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFF', marginBottom: 2 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: '#706E6B' }}>
                    {ev.allDay ? '終日' : `${fmtTime(ev.start)} - ${fmtTime(ev.end)}`} · {fmtDate(ev.start)}
                  </div>
                </div>
                <button onClick={() => setEventDetail(null)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#706E6B', cursor: 'pointer' }}>✕</button>
              </div>

              {ev.source === 'caesar' && (
                <>
                  <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12, color: '#706E6B' }}>
                    <span style={{ display: 'inline-block', minWidth: 60, color: '#706E6B' }}>種別</span>
                    {ev.sub}
                  </div>
                  {ev.raw?.deals?.name && (
                    <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12 }}>
                      <span style={{ display: 'inline-block', minWidth: 60, color: '#706E6B' }}>案件</span>
                      <a href={`/deals/${ev.raw.deals.id}`} style={{ color: '#032D60' }}>{ev.raw.deals.name}</a>
                    </div>
                  )}
                  {ev.raw?.summary && (
                    <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12, color: '#FFFFFF', lineHeight: 1.6 }}>
                      {ev.raw.summary}
                    </div>
                  )}
                </>
              )}

              {ev.source === 'google' && (
                <>
                  <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12, color: '#706E6B' }}>
                    <span style={{ display: 'inline-block', minWidth: 60, color: '#706E6B' }}>ソース</span>
                    Google Calendar
                  </div>
                  {ev.raw?.location && (
                    <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12, color: '#FFFFFF' }}>
                      <span style={{ display: 'inline-block', minWidth: 60, color: '#706E6B' }}>場所</span>
                      {ev.raw.location}
                    </div>
                  )}
                  {ev.raw?.description && (
                    <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 12, color: '#FFFFFF', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {ev.raw.description}
                    </div>
                  )}
                  {ev.raw?.attendees?.length > 0 && (
                    <div style={{ padding: '8px 0', borderTop: '0.5px solid #F8F8F8', fontSize: 11, color: '#706E6B' }}>
                      <span style={{ display: 'inline-block', minWidth: 60, color: '#706E6B' }}>参加者</span>
                      {ev.raw.attendees.map(a => a.email).join(', ')}
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #F8F8F8' }}>
                {ev.source === 'google' && ev.raw?.htmlLink && (
                  <a href={ev.raw.htmlLink} target="_blank" rel="noreferrer" style={{
                    flex: 1, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#F3F2F2', border: '0.5px solid #E5E5E5', borderRadius: 5,
                    fontSize: 11, color: '#706E6B', textDecoration: 'none',
                  }}>Google で開く</a>
                )}
                <button onClick={() => deleteEvent(ev)} style={{
                  height: 30, padding: '0 12px', background: '#FAECE7', border: '0.5px solid #e0c0c0',
                  borderRadius: 5, color: '#EA001E', fontSize: 11, cursor: 'pointer',
                }}>削除</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* クイック作成ポップオーバー */}
      {quickCreate && (
        <>
          <div onClick={() => setQuickCreate(null)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'fixed', left: quickCreate.x, top: quickCreate.y,
            background: '#fff', borderRadius: 10, padding: 16, width: 320,
            boxShadow: '0 4px 24px rgba(10,30,60,0.2)', border: '0.5px solid #E5E5E5',
            zIndex: 100,
          }}>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                autoFocus
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="タイトルを追加"
                style={{ border: 'none', borderBottom: '1.5px solid #032D60', padding: '4px 0', fontSize: 16, outline: 'none', color: '#FFFFFF' }}
              />
              <div style={{ fontSize: 12, color: '#706E6B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🕐</span>
                <input type="datetime-local" required value={form.held_at} onChange={e => setForm(f => ({ ...f, held_at: e.target.value }))}
                  style={{ flex: 1, height: 28, padding: '0 6px', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 12, outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <select value={form.deal_id} onChange={e => setForm(f => ({ ...f, deal_id: e.target.value }))}
                  style={{ height: 28, padding: '0 6px', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 11, outline: 'none' }}>
                  <option value="">案件を選択</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value }))}
                  style={{ height: 28, padding: '0 6px', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 11, outline: 'none' }}>
                  {Object.entries(MEETING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={2}
                placeholder="メモ（任意）"
                style={{ width: '100%', padding: '6px 8px', border: '0.5px solid #E5E5E5', borderRadius: 4, fontSize: 12, outline: 'none', resize: 'vertical' }} />
              {gcalConnected && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#706E6B' }}>
                  <input type="checkbox" checked={form.syncGoogle} onChange={e => setForm(f => ({ ...f, syncGoogle: e.target.checked }))} style={{ width: 12, height: 12 }} />
                  Google Calendar にも追加
                </label>
              )}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setQuickCreate(null)} style={{ height: 30, padding: '0 12px', background: 'transparent', border: 'none', fontSize: 12, color: '#706E6B', cursor: 'pointer' }}>キャンセル</button>
                <button type="submit" disabled={saving} style={{ height: 30, padding: '0 16px', background: '#032D60', border: 'none', borderRadius: 5, fontSize: 12, color: '#fff', fontWeight: 500, cursor: 'pointer' }}>{saving ? '...' : '保存'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Draggable/Resizable Event for time grids ───
function TimeEvent({ ev, top, height, HOUR_HEIGHT, onClick, onMove, dayIndex, totalDays, containerRef }) {
  const [dragState, setDragState] = useState(null) // { mode: 'move'|'resize', startY, startX, origTop, origHeight, origStart }
  const [previewTop, setPreviewTop] = useState(null)
  const [previewHeight, setPreviewHeight] = useState(null)
  const [previewDayOffset, setPreviewDayOffset] = useState(0)

  function onMouseDown(e, mode) {
    e.stopPropagation()
    e.preventDefault()
    setDragState({
      mode, startY: e.clientY, startX: e.clientX,
      origTop: top, origHeight: height,
      origStart: new Date(ev.start), origEnd: new Date(ev.end),
    })
    setPreviewTop(top); setPreviewHeight(height); setPreviewDayOffset(0)
  }

  useEffect(() => {
    if (!dragState) return
    function onMove_(e) {
      const dy = e.clientY - dragState.startY
      const dx = e.clientX - dragState.startX
      const snap = HOUR_HEIGHT / 4 // 15分スナップ
      const snappedDy = Math.round(dy / snap) * snap
      if (dragState.mode === 'move') {
        setPreviewTop(dragState.origTop + snappedDy)
        // 横方向移動（週ビュー用）
        if (totalDays > 1 && containerRef?.current) {
          const rect = containerRef.current.getBoundingClientRect()
          const colWidth = rect.width / totalDays
          const dayOffset = Math.round(dx / colWidth)
          setPreviewDayOffset(dayOffset)
        }
      } else if (dragState.mode === 'resize') {
        setPreviewHeight(Math.max(HOUR_HEIGHT / 4, dragState.origHeight + snappedDy))
      }
    }
    function onUp_() {
      // 確定
      if (dragState.mode === 'move') {
        const deltaMin = Math.round((previewTop - dragState.origTop) / HOUR_HEIGHT * 60)
        const newStart = new Date(dragState.origStart)
        newStart.setMinutes(newStart.getMinutes() + deltaMin)
        if (previewDayOffset !== 0) newStart.setDate(newStart.getDate() + previewDayOffset)
        const newEnd = new Date(dragState.origEnd)
        newEnd.setMinutes(newEnd.getMinutes() + deltaMin)
        if (previewDayOffset !== 0) newEnd.setDate(newEnd.getDate() + previewDayOffset)
        if (deltaMin !== 0 || previewDayOffset !== 0) {
          onMove(ev, newStart, newEnd)
        }
      } else if (dragState.mode === 'resize') {
        const deltaMin = Math.round((previewHeight - dragState.origHeight) / HOUR_HEIGHT * 60)
        const newStart = new Date(dragState.origStart)
        const newEnd = new Date(dragState.origEnd)
        newEnd.setMinutes(newEnd.getMinutes() + deltaMin)
        if (deltaMin !== 0) onMove(ev, newStart, newEnd)
      }
      setDragState(null); setPreviewTop(null); setPreviewHeight(null); setPreviewDayOffset(0)
    }
    document.addEventListener('mousemove', onMove_)
    document.addEventListener('mouseup', onUp_)
    return () => {
      document.removeEventListener('mousemove', onMove_)
      document.removeEventListener('mouseup', onUp_)
    }
  }, [dragState, previewTop, previewHeight, previewDayOffset])

  const displayTop = previewTop != null ? previewTop : top
  const displayHeight = previewHeight != null ? previewHeight : height
  const colOffsetPx = previewDayOffset !== 0 && containerRef?.current
    ? (containerRef.current.getBoundingClientRect().width / totalDays) * previewDayOffset
    : 0

  return (
    <div
      onClick={(e) => { if (!dragState) onClick(ev, e) }}
      onMouseDown={(e) => onMouseDown(e, 'move')}
      style={{
        position: 'absolute', top: displayTop, left: 2, right: 2, height: displayHeight,
        background: ev.color, color: '#fff',
        borderRadius: 4, padding: '3px 6px', fontSize: 10,
        overflow: 'hidden', cursor: dragState?.mode === 'move' ? 'grabbing' : 'grab',
        boxShadow: dragState ? '0 4px 12px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.1)',
        opacity: dragState ? 0.85 : 1,
        transform: colOffsetPx ? `translateX(${colOffsetPx}px)` : undefined,
        zIndex: dragState ? 10 : 1,
        userSelect: 'none',
      }}>
      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{ev.title}</div>
      <div style={{ opacity: 0.9, fontSize: 9, pointerEvents: 'none' }}>{fmtTime(ev.start)} - {fmtTime(ev.end)}</div>
      {/* リサイズハンドル（下端） */}
      <div
        onMouseDown={(e) => onMouseDown(e, 'resize')}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize', background: 'rgba(255,255,255,0.2)' }}
      />
    </div>
  )
}

// ─── Month View ───
function MonthView({ cursor, allEvents, onDayClick, onQuickCreate, onEventClick, onEventMove }) {
  const [draggedEvent, setDraggedEvent] = useState(null)
  const today = new Date()
  const monthStart = startOfMonth(cursor)
  const gridStart = startOfWeek(monthStart) // 月表示の左上

  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i)
    cells.push(d)
  }

  function getEventsForDay(date) {
    return allEvents.filter(e => sameDay(e.start, date))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 曜日ヘッダー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '0.5px solid #E5E5E5', background: '#F3F2F2', flexShrink: 0 }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: i === 0 ? '#EA001E' : i === 6 ? '#032D60' : '#706E6B', fontWeight: 500 }}>
            {d}
          </div>
        ))}
      </div>
      {/* セル */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', flex: 1 }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth()
          const isToday = sameDay(d, today)
          const events = getEventsForDay(d)
          return (
            <div key={i}
              onClick={(e) => {
                if (e.target === e.currentTarget || e.target.dataset.cellBg === '1') {
                  const slotDate = new Date(d)
                  slotDate.setHours(10, 0, 0, 0)
                  onQuickCreate(slotDate, e)
                }
              }}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                if (!draggedEvent) return
                // 元のイベントの時刻は保持して日付だけ変更
                const orig = draggedEvent.start
                const newStart = new Date(d)
                newStart.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
                const duration = draggedEvent.end - draggedEvent.start
                const newEnd = new Date(newStart.getTime() + duration)
                if (!sameDay(orig, d)) onEventMove(draggedEvent, newStart, newEnd)
                setDraggedEvent(null)
              }}
              style={{
                borderRight: (i % 7 !== 6) ? '0.5px solid #F8F8F8' : 'none',
                borderBottom: (i < 35) ? '0.5px solid #F8F8F8' : 'none',
                padding: 4, cursor: 'pointer', overflow: 'hidden',
                background: inMonth ? '#fff' : '#FAFAFA',
                position: 'relative',
              }}>
              <div data-cell-bg="1" style={{ position: 'absolute', inset: 0 }} />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2, position: 'relative' }}>
                <span onClick={(e) => { e.stopPropagation(); onDayClick(d) }} style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: isToday ? 600 : 400,
                  background: isToday ? '#032D60' : 'transparent',
                  color: isToday ? '#fff' : inMonth ? (i % 7 === 0 ? '#EA001E' : i % 7 === 6 ? '#032D60' : '#FFFFFF') : '#E5E5E5',
                  cursor: 'pointer',
                }}>{d.getDate()}</span>
              </div>
              {events.slice(0, 3).map(ev => (
                <div key={ev.id}
                  draggable
                  onDragStart={(e) => { setDraggedEvent(ev); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => setDraggedEvent(null)}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev, e) }}
                  style={{
                    fontSize: 10, padding: '2px 5px', borderRadius: 3, marginBottom: 2,
                    background: ev.color, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    position: 'relative',
                    opacity: draggedEvent?.id === ev.id ? 0.5 : 1,
                    cursor: 'grab',
                  }}>
                  {!ev.allDay && <span style={{ opacity: 0.85 }}>{fmtTime(ev.start)} </span>}
                  {ev.title}
                </div>
              ))}
              {events.length > 3 && (
                <div onClick={(e) => { e.stopPropagation(); onDayClick(d) }}
                  style={{ fontSize: 10, color: '#706E6B', paddingLeft: 5, position: 'relative' }}>
                  他{events.length - 3}件
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ───
function WeekView({ cursor, allEvents, getEventsForDay, onDayClick, onSlotClick, onEventClick, onEventMove }) {
  const gridRef = useRef(null)
  const today = new Date()
  const weekStart = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const HOUR_HEIGHT = 48 // px per hour

  function getTimedEventsForDay(d) {
    return allEvents.filter(e => sameDay(e.start, d) && !e.allDay)
  }
  function getAllDayEventsForDay(d) {
    return allEvents.filter(e => sameDay(e.start, d) && e.allDay)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ヘッダー */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '0.5px solid #E5E5E5', background: '#F3F2F2', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#706E6B', textAlign: 'center', padding: '8px 0' }}>GMT+9</div>
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          return (
            <div key={i} onClick={() => onDayClick(d)} style={{
              padding: '6px 4px', textAlign: 'center', cursor: 'pointer',
              borderLeft: '0.5px solid #F8F8F8',
            }}>
              <div style={{ fontSize: 10, color: i === 0 ? '#EA001E' : i === 6 ? '#032D60' : '#706E6B' }}>{DAYS[i]}</div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%',
                background: isToday ? '#032D60' : 'transparent',
                color: isToday ? '#fff' : '#FFFFFF',
                fontSize: 14, fontWeight: isToday ? 600 : 400,
              }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* 終日イベント行 */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '0.5px solid #E5E5E5', minHeight: 24, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: '#706E6B', textAlign: 'right', paddingRight: 4, paddingTop: 4 }}>終日</div>
        {days.map((d, i) => {
          const allDay = getAllDayEventsForDay(d)
          return (
            <div key={i} style={{ borderLeft: '0.5px solid #F8F8F8', padding: 2, minHeight: 24 }}>
              {allDay.map(ev => (
                <div key={ev.id} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, background: ev.color, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* 時間グリッド */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', position: 'relative' }}>
          {/* 時間ラベル */}
          <div style={{ borderRight: '0.5px solid #F8F8F8' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT, fontSize: 10, color: '#706E6B', textAlign: 'right', paddingRight: 4, paddingTop: 2 }}>
                {h}:00
              </div>
            ))}
          </div>
          {/* 日ごとの列 */}
          {days.map((d, di) => {
            const events = getTimedEventsForDay(d)
            return (
              <div key={di} style={{ position: 'relative', borderLeft: '0.5px solid #F8F8F8' }}>
                {HOURS.map(h => (
                  <div key={h}
                    onClick={(e) => {
                      const slotDate = new Date(d)
                      slotDate.setHours(h, 0, 0, 0)
                      onSlotClick(slotDate, e)
                    }}
                    style={{ height: HOUR_HEIGHT, borderBottom: '0.5px solid #F3F2F2', cursor: 'pointer' }} />
                ))}
                {events.map(ev => {
                  const startM = ev.start.getHours() * 60 + ev.start.getMinutes()
                  const durationM = Math.max((ev.end - ev.start) / 60000, 30)
                  const top = (startM / 60) * HOUR_HEIGHT
                  const height = Math.max((durationM / 60) * HOUR_HEIGHT, 20)
                  return (
                    <TimeEvent key={ev.id} ev={ev} top={top} height={height} HOUR_HEIGHT={HOUR_HEIGHT}
                      onClick={onEventClick} onMove={onEventMove}
                      dayIndex={di} totalDays={7} containerRef={gridRef} />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Day View ───
function DayView({ cursor, events, onSlotClick, onEventClick, onEventMove }) {
  const HOUR_HEIGHT = 60
  const gridRef = useRef(null)
  const timed = events.filter(e => !e.allDay)
  const allDay = events.filter(e => e.allDay)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {allDay.length > 0 && (
        <div style={{ padding: '6px 48px', borderBottom: '0.5px solid #E5E5E5', background: '#F3F2F2' }}>
          <div style={{ fontSize: 10, color: '#706E6B', marginBottom: 3 }}>終日</div>
          {allDay.map(ev => (
            <div key={ev.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3, background: ev.color, color: '#fff', marginBottom: 2, display: 'inline-block', marginRight: 4 }}>
              {ev.title}
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', position: 'relative' }}>
          <div style={{ borderRight: '0.5px solid #F8F8F8' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT, fontSize: 11, color: '#706E6B', textAlign: 'right', paddingRight: 8, paddingTop: 3 }}>
                {h}:00
              </div>
            ))}
          </div>
          <div ref={gridRef} style={{ position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h}
                onClick={(e) => {
                  const slotDate = new Date(cursor)
                  slotDate.setHours(h, 0, 0, 0)
                  onSlotClick(slotDate, e)
                }}
                style={{ height: HOUR_HEIGHT, borderBottom: '0.5px solid #F3F2F2', cursor: 'pointer' }} />
            ))}
            {timed.map(ev => {
              const startM = ev.start.getHours() * 60 + ev.start.getMinutes()
              const durationM = Math.max((ev.end - ev.start) / 60000, 30)
              const top = (startM / 60) * HOUR_HEIGHT
              const height = Math.max((durationM / 60) * HOUR_HEIGHT, 30)
              return (
                <TimeEvent key={ev.id} ev={ev} top={top} height={height} HOUR_HEIGHT={HOUR_HEIGHT}
                  onClick={onEventClick} onMove={onEventMove}
                  dayIndex={0} totalDays={1} containerRef={gridRef} />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
