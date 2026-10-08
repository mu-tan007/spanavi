import { useEffect, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';

/**
 * クライアントからの依頼（確認待ち）。2026-10-08 むー様
 * クライアントがアポ取得報告に返してきた連絡から、事前確認で先方に伝えてほしい依頼をAIが拾ったもの。
 * むー様が1行を確かめて「流す」と、そのアポの「クライアントからの依頼」に入り、
 * 朝の #事前確認 の通知・架電ページの事前確認・このアポの経緯に出る。インターンへの連絡は要らない。
 */
export default function ClientRelayCard({ isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});

  const load = async () => {
    const { data } = await supabase.from('client_reply_relays')
      .select('id, source, client_text, tell_text, created_at, appointment:appointments!inner(company_name, getter_name, meeting_date, meeting_time)')
      .eq('status', 'ready').order('created_at');
    setRows(data || []);
    setTexts(prev => Object.fromEntries((data || []).map(r => [r.id, prev[r.id] ?? r.tell_text ?? ''])));
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin || rows.length === 0) return null;

  const call = async (row, mode) => {
    setBusy(row.id); setErrors(e => ({ ...e, [row.id]: '' }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-reply-relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ mode, id: row.id, tell: texts[row.id] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setErrors(er => ({ ...er, [row.id]: e.message || 'うまくいきませんでした' }));
    } finally {
      setBusy(null);
    }
  };

  const meet = (a) => {
    if (!a?.meeting_date) return '';
    const d = new Date(new Date(a.meeting_date).getTime() + 9 * 3600000);
    return `面談 ${d.getUTCMonth() + 1}/${d.getUTCDate()}${a.meeting_time ? ' ' + String(a.meeting_time).slice(0, 5) : ''}`;
  };

  return (
    <Card padding="md" title="クライアントからの依頼（確認待ち）" description="クライアント様の連絡から拾いました。合っていれば「流す」と、朝の事前確認の通知と架電ページに出ます" style={{ marginBottom: space[4] }}>
      {rows.map(row => (
        <div key={row.id} style={{ padding: `${space[3]}px 0`, borderTop: `1px solid ${color.borderLight}`, display: 'grid', gap: space[1.5] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: font.weight.bold, color: color.navy }}>{row.appointment?.company_name}</span>
            <span style={{ fontSize: font.size.xs, color: color.textMid }}>{meet(row.appointment)}</span>
            <span style={{ fontSize: font.size.xs, color: color.textMid }}>アポ取得：{row.appointment?.getter_name || '—'}</span>
          </div>
          <input type="text" value={texts[row.id] || ''} onChange={e => setTexts(t => ({ ...t, [row.id]: e.target.value }))}
            aria-label="クライアントからの依頼"
            style={{ width: '100%', boxSizing: 'border-box', padding: `${space[1.5]}px ${space[2]}px`, fontSize: font.size.sm, fontFamily: font.family.sans,
              color: color.textDark, border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none' }} />
          <details>
            <summary style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer' }}>クライアント様の連絡の原文（{row.source === 'slack' ? 'Slack' : 'メール'}）</summary>
            <div style={{ marginTop: space[1], padding: space[2], borderRadius: radius.md, background: color.gray50, fontSize: font.size.xs, color: color.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{row.client_text}</div>
          </details>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            {errors[row.id] && <span style={{ fontSize: font.size.xs, color: color.danger }}>{errors[row.id]}</span>}
            <Button size="sm" variant="ghost" onClick={() => call(row, 'dismiss')} disabled={busy === row.id} style={{ marginLeft: 'auto' }}>流さない</Button>
            <Button size="sm" variant="primary" onClick={() => call(row, 'apply')} loading={busy === row.id}>流す</Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
