import { useState, useEffect, useMemo } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
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

      // 2) call_records は当面省略（量が多いため Phase 6 以降で集計表示）

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
    <div style={{ fontFamily: font.family.sans }}>
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 10,
      }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '3px 10px', borderRadius: radius.sm, fontSize: 10,
              border: `1px solid ${filter === f.id ? NAVY : GRAY_200}`,
              background: filter === f.id ? NAVY : color.white,
              color: filter === f.id ? color.white : C.textMid,
              cursor: 'pointer', fontFamily: font.family.sans,
              fontWeight: filter === f.id ? font.weight.semibold : font.weight.medium,
            }}
          >{f.label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: font.size.xs }}>読み込み中...</div>
      )}

      {!loading && error && (
        <div style={{
          padding: '10px 12px',
          fontSize: font.size.xs, color: color.danger,
          background: color.dangerSoft, border: `1px solid ${alpha(color.danger, 0.25)}`,
          borderRadius: radius.md,
        }}>{error}</div>
      )}

      {!loading && !error && filteredEvents.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: font.size.xs }}>
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
                fontSize: font.size.xs, color: NAVY, cursor: 'pointer',
                fontFamily: font.family.sans,
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
  const accent = eventColor(ev.kind);
  return (
    <div style={{
      position: 'relative',
      padding: '10px 12px 10px 18px',
      borderLeft: `2px solid ${accent}`,
      marginBottom: 8,
      background: color.white,
      border: `1px solid ${GRAY_100}`,
      borderRadius: radius.md,
    }}>
      <div style={{
        position: 'absolute', left: -5, top: 12,
        width: 8, height: 8, borderRadius: '50%',
        background: accent,
        border: `2px solid ${color.white}`,
      }} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 8, marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: font.weight.bold, letterSpacing: 1,
            color: accent, padding: '1px 6px',
            border: `1px solid ${accent}40`, borderRadius: radius.sm,
          }}>{kindLabel(ev.kind)}</span>
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: NAVY }}>{ev.title}</span>
          {ev.target && (
            <span style={{ fontSize: font.size.xs, color: C.textMid }}>{ev.target}</span>
          )}
          {ev.extra && (
            <span style={{ fontSize: font.size.xs, color: NAVY, fontWeight: font.weight.semibold, fontFamily: font.family.mono }}>{ev.extra}</span>
          )}
        </div>
        <span style={{
          fontSize: 10, color: C.textLight,
          fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>{formatDateTime(ev.ts)}</span>
      </div>
      {ev.actor && (
        <div style={{ fontSize: 10, color: C.textLight, marginBottom: ev.body ? 4 : 0 }}>{ev.actor}</div>
      )}
      {ev.body && (
        <div style={{
          fontSize: font.size.xs, color: C.textDark, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          background: GRAY_50, borderRadius: radius.sm,
          padding: '6px 8px', marginTop: 4,
          maxHeight: 160, overflow: 'auto',
        }}>{ev.body}</div>
      )}
    </div>
  );
}
