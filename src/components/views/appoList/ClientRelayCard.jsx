import { useEffect, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';

/**
 * インターンへの伝言（送信待ち）。2026-10-08 むー様
 * クライアントがアポ取得報告に返してきた「事前確認で先方に伝えてほしいこと」から作った下書き。
 * 送ると、社内の #アポ取得報告 の該当のスレッドへ篠宮の名前でアポ取得者にメンションして届き、
 * そのアポの「事前確認で先方に伝えること」にも入る（架電ページの事前確認・朝の通知に出る）。
 */
export default function ClientRelayCard({ isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});

  const load = async () => {
    const { data } = await supabase.from('client_reply_relays')
      .select('id, source, client_text, tell_text, draft_text, slack_thread_ts, created_at, appointment:appointments!inner(company_name, getter_name, meeting_date)')
      .eq('status', 'ready').order('created_at');
    setRows(data || []);
    setTexts(prev => Object.fromEntries((data || []).map(r => [r.id, prev[r.id] ?? r.draft_text ?? ''])));
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
        body: JSON.stringify({ mode, id: row.id, text: texts[row.id] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setErrors(er => ({ ...er, [row.id]: e.message || '送れませんでした' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card padding="md" title="インターンへの伝言（送信待ち）" description="クライアント様の返信から、事前確認で先方に伝えることを拾いました。確かめて送信してください" style={{ marginBottom: space[4] }}>
      {rows.map(row => (
        <div key={row.id} style={{ padding: `${space[3]}px 0`, borderTop: `1px solid ${color.borderLight}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1.5], fontSize: font.size.sm }}>
            <span style={{ fontWeight: font.weight.bold, color: color.navy }}>{row.appointment?.company_name}</span>
            <span style={{ fontSize: font.size.xs, color: color.textMid }}>アポ取得：{row.appointment?.getter_name || '—'}</span>
            <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textMid }}>
              送信先：#アポ取得報告{row.slack_thread_ts ? 'のスレッド' : '（報告の投稿が見つからずチャンネルに直接）'}
            </span>
          </div>
          <details style={{ marginBottom: space[1.5] }}>
            <summary style={{ fontSize: font.size.xs, color: color.textMid, cursor: 'pointer' }}>クライアント様の返信（{row.source === 'slack' ? 'Slack' : 'メール'}）</summary>
            <div style={{ marginTop: space[1], padding: space[2], borderRadius: radius.md, background: color.gray50, fontSize: font.size.xs, color: color.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{row.client_text}</div>
          </details>
          <textarea value={texts[row.id] || ''} onChange={e => setTexts(t => ({ ...t, [row.id]: e.target.value }))} rows={5}
            style={{ width: '100%', boxSizing: 'border-box', padding: space[2], resize: 'vertical', fontSize: font.size.sm, fontFamily: font.family.sans,
              color: color.textDark, border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[1.5] }}>
            {errors[row.id] && <span style={{ fontSize: font.size.xs, color: color.danger }}>{errors[row.id]}</span>}
            <Button size="sm" variant="ghost" onClick={() => call(row, 'dismiss')} disabled={busy === row.id} style={{ marginLeft: 'auto' }}>送らない</Button>
            <Button size="sm" variant="primary" onClick={() => call(row, 'send')} loading={busy === row.id}>送信</Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
