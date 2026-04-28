import { useState, useEffect, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';

const NAVY = '#0D2247';
const BLUE = '#1E40AF';
const GRAY_200 = '#E5E7EB';
const GRAY_100 = '#F3F4F6';
const GRAY_50 = '#F8F9FA';
const GOLD = '#B8860B';

const FILTERS = [
  { id: 'all', label: '全て' },
  { id: 'apo', label: 'アポ' },
  { id: 'memo', label: 'メモ' },
  { id: 'call', label: '架電' },
];

const formatDateTime = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}/${m}/${day} ${hh}:${mm}`;
  } catch { return ''; }
};

const yen = (n) => '¥' + Number(n || 0).toLocaleString();

const eventColor = (kind) => {
  if (kind === 'apo') return BLUE;
  if (kind === 'memo' || kind === 'memo_voice') return GOLD;
  if (kind === 'call') return C.textMid;
  return NAVY;
};

const kindLabel = (kind) => {
  if (kind === 'apo') return 'アポ';
  if (kind === 'memo') return 'メモ';
  if (kind === 'memo_voice') return 'メモ (音声)';
  if (kind === 'call') return '架電';
  return kind;
};

/**
 * ActivityTimeline — クライアントに関する全接点を時系列表示
 *
 * Props:
 *  - clientSupaId: クライアント UUID
 *  - contactsByClient: 担当者マップ（メモ event の所属判定用）
 */
export default function ActivityTimeline({ clientSupaId, contactsByClient = {} }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandOlder, setExpandOlder] = useState(false);
  const [error, setError] = useState('');

  const contactNameById = useMemo(() => {
    const map = {};
    Object.entries(contactsByClient).forEach(([cid, list]) => {
      (list || []).forEach(ct => { if (ct?.id) map[ct.id] = { name: ct.name, clientId: cid }; });
    });
    return map;
  }, [contactsByClient]);

  // この client の contact_id 配列
  const myContactIds = useMemo(() => {
    if (!clientSupaId) return [];
    return Object.entries(contactNameById)
      .filter(([, v]) => v.clientId === clientSupaId)
      .map(([id]) => id);
  }, [contactNameById, clientSupaId]);

  useEffect(() => {
    let cancelled = false;
    if (!clientSupaId) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    (async () => {
      const orgId = getOrgId();
      if (!orgId) { setLoading(false); return; }
      const acc = [];

      // 1) appointments
      try {
        const { data: appos } = await supabase
          .from('appointments')
          .select('id, status, getter_name, company_name, appointment_date, meeting_date, sales_amount, created_at')
          .eq('org_id', orgId)
          .eq('client_id', clientSupaId)
          .order('appointment_date', { ascending: false })
          .limit(500);
        (appos || []).forEach(a => {
          const ts = a.appointment_date || a.created_at;
          acc.push({
            id: `apo-${a.id}`,
            kind: 'apo',
            ts,
            title: a.status || 'アポ',
            actor: a.getter_name || '',
            target: a.company_name || '',
            extra: a.sales_amount ? yen(a.sales_amount) : '',
          });
        });
      } catch (e) {
        console.warn('[ActivityTimeline] appointments fetch failed', e);
      }

      // 2) contact_memo_events（このクライアントの担当者宛て）
      if (myContactIds.length > 0) {
        try {
          const { data: memos } = await supabase
            .from('contact_memo_events')
            .select('id, contact_id, body_md, source, author_name, created_at')
            .eq('org_id', orgId)
            .in('contact_id', myContactIds)
            .order('created_at', { ascending: false })
            .limit(500);
          (memos || []).forEach(m => {
            const isVoice = m.source === 'voice_ai' || m.source === 'voice_raw';
            const ctMeta = contactNameById[m.contact_id];
            acc.push({
              id: `memo-${m.id}`,
              kind: isVoice ? 'memo_voice' : 'memo',
              ts: m.created_at,
              title: ctMeta ? `${ctMeta.name} のメモ` : 'メモ',
              actor: m.author_name || '',
              target: '',
              body: m.body_md || '',
            });
          });
        } catch (e) {
          console.warn('[ActivityTimeline] memos fetch failed', e);
        }
      }

      // 3) call_records は当面省略（量が多いため Phase 6 以降で集計表示）

      // ソート
      acc.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });
      if (!cancelled) {
        setEvents(acc);
        setLoading(false);
      }
    })().catch(e => {
      console.error('[ActivityTimeline] uncaught', e);
      if (!cancelled) { setError(e.message || String(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [clientSupaId, myContactIds, contactNameById]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'memo') return events.filter(e => e.kind === 'memo' || e.kind === 'memo_voice');
    return events.filter(e => e.kind === filter);
  }, [events, filter]);

  const cutoffMs = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.getTime();
  }, []);

  const recentEvents = useMemo(
    () => filteredEvents.filter(e => e.ts && new Date(e.ts).getTime() >= cutoffMs),
    [filteredEvents, cutoffMs]
  );
  const olderEvents = useMemo(
    () => filteredEvents.filter(e => !e.ts || new Date(e.ts).getTime() < cutoffMs),
    [filteredEvents, cutoffMs]
  );

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${GRAY_200}`, paddingBottom: 8, marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: 1 }}>
          Activity Timeline
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '3px 10px', borderRadius: 3, fontSize: 10,
                border: `1px solid ${filter === f.id ? NAVY : GRAY_200}`,
                background: filter === f.id ? NAVY : '#fff',
                color: filter === f.id ? '#fff' : C.textMid,
                cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
                fontWeight: filter === f.id ? 600 : 500,
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 11 }}>読み込み中...</div>
      )}

      {!loading && error && (
        <div style={{
          padding: '10px 12px',
          fontSize: 11, color: '#DC2626',
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 4,
        }}>{error}</div>
      )}

      {!loading && !error && filteredEvents.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 11 }}>
          まだイベントがありません
        </div>
      )}

      {!loading && !error && recentEvents.map(ev => <EventCard key={ev.id} ev={ev} />)}

      {!loading && !error && olderEvents.length > 0 && (
        <>
          {expandOlder && olderEvents.map(ev => <EventCard key={ev.id} ev={ev} />)}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={() => setExpandOlder(v => !v)}
              style={{
                background: 'none', border: 'none',
                fontSize: 11, color: NAVY, cursor: 'pointer',
                fontFamily: "'Noto Sans JP', sans-serif",
                padding: '4px 12px',
              }}
            >{expandOlder ? '直近 30 日のみ表示' : `過去のログを見る (${olderEvents.length}件)`}</button>
          </div>
        </>
      )}
    </div>
  );
}

function EventCard({ ev }) {
  const color = eventColor(ev.kind);
  return (
    <div style={{
      position: 'relative',
      padding: '10px 12px 10px 18px',
      borderLeft: `2px solid ${color}`,
      marginBottom: 8,
      background: '#fff',
      border: `1px solid ${GRAY_100}`,
      borderRadius: 4,
    }}>
      <div style={{
        position: 'absolute', left: -5, top: 12,
        width: 8, height: 8, borderRadius: '50%',
        background: color,
        border: '2px solid #fff',
      }} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 8, marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1,
            color: color, padding: '1px 6px',
            border: `1px solid ${color}40`, borderRadius: 3,
          }}>{kindLabel(ev.kind)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{ev.title}</span>
          {ev.target && (
            <span style={{ fontSize: 11, color: C.textMid }}>{ev.target}</span>
          )}
          {ev.extra && (
            <span style={{ fontSize: 11, color: NAVY, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{ev.extra}</span>
          )}
        </div>
        <span style={{
          fontSize: 10, color: C.textLight,
          fontFamily: "'JetBrains Mono', monospace",
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>{formatDateTime(ev.ts)}</span>
      </div>
      {ev.actor && (
        <div style={{ fontSize: 10, color: C.textLight, marginBottom: ev.body ? 4 : 0 }}>{ev.actor}</div>
      )}
      {ev.body && (
        <div style={{
          fontSize: 11, color: C.textDark, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          background: GRAY_50, borderRadius: 3,
          padding: '6px 8px', marginTop: 4,
          maxHeight: 160, overflow: 'auto',
        }}>{ev.body}</div>
      )}
    </div>
  );
}
