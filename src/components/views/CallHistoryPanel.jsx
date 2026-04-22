import React, { useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import { fetchCallSessionsByList } from '../../lib/supabaseWrite';

const DEFAULT_VISIBLE = 5;

function formatDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yday = new Date(today.getTime() - 86400000);
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (sessionDay.getTime() === today.getTime()) return '今日';
  if (sessionDay.getTime() === yday.getTime()) return '昨日';
  const thisYear = d.getFullYear() === now.getFullYear();
  return thisYear ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatRevenue(min, max) {
  const hasMin = min != null;
  const hasMax = max != null;
  if (!hasMin && !hasMax) return '';
  const fmt = (v) => `${(Number(v) / 1000).toLocaleString()}百万`;
  if (hasMin && hasMax) return `${fmt(min)}〜${fmt(max)}`;
  if (hasMin) return `${fmt(min)}以上`;
  return `${fmt(max)}以下`;
}

// status_filter/pref_filter がどちらも NULL のセッションは、フィルタ記録導入前の
// レガシーセッション。絞込有無を区別できないので「記録なし」と表示する。
function isLegacySession(s) {
  return s.status_filter == null && s.pref_filter == null;
}

function buildFilterLabel(s) {
  if (isLegacySession(s)) return { text: '絞込条件 記録なし', dimmed: true };
  const parts = [];
  if (Array.isArray(s.status_filter) && s.status_filter.length > 0) {
    parts.push(s.status_filter.join(','));
  }
  const rev = formatRevenue(s.revenue_min, s.revenue_max);
  if (rev) parts.push(rev);
  if (Array.isArray(s.pref_filter) && s.pref_filter.length > 0) {
    parts.push(s.pref_filter.join(','));
  }
  if (parts.length === 0) return { text: '絞込: なし', dimmed: false };
  return { text: `絞込: ${parts.join(' / ')}`, dimmed: false };
}

export default function CallHistoryPanel({ listSupaId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!listSupaId) { setSessions([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchCallSessionsByList(listSupaId, 50).then(({ data }) => {
      if (cancelled) return;
      setSessions(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [listSupaId]);

  if (!listSupaId) return null;
  if (loading) return null;
  if (sessions.length === 0) return null;

  const visible = expanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE);
  const hasMore = sessions.length > DEFAULT_VISIBLE;

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 4,
      background: '#F8F9FA',
      border: '1px solid #E5E7EB',
      fontSize: 12,
      color: C.textMid,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: '#0D2247' }}>最近の架電履歴</span>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.navyLight,
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              fontFamily: "'Noto Sans JP'",
            }}
          >
            {expanded ? '閉じる' : `すべて見る (${sessions.length}件)`}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map(s => {
          const filter = buildFilterLabel(s);
          return (
            <div
              key={s.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 110px 1fr auto',
                gap: 10,
                alignItems: 'baseline',
                padding: '4px 0',
                borderBottom: '1px dashed #EEE',
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: C.textDark, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatDateLabel(s.started_at)}
              </span>
              <span style={{ color: C.textDark, fontFamily: "'JetBrains Mono'", whiteSpace: 'nowrap' }}>
                範囲 {s.start_no}〜{s.end_no}
              </span>
              <span style={{
                color: filter.dimmed ? C.textLight : C.textMid,
                fontStyle: filter.dimmed ? 'italic' : 'normal',
                wordBreak: 'break-word',
              }}>
                {filter.text}
              </span>
              <span style={{ color: C.textMid, whiteSpace: 'nowrap' }}>
                {s.caller_name || '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
