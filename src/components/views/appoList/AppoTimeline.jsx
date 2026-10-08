import { useEffect, useState } from 'react';
import { color, space, font } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';

/**
 * このアポの経緯（2026-10-08 むー様）。インターンも含めて全員が見られる。
 * 取得・報告の送信・事前確認・リスケ／キャンセルはアポと事前確認の記録から、
 * クライアントとのやり取り・クライアントからの依頼・面談後の結果は appo_timeline（返信の要約）から並べる。
 * お金や条件の話は出さない（要約の段階で落としている）。
 */
const KIND = {
  got: { label: 'アポ取得', tone: 'navy' },
  report: { label: '報告を送付', tone: 'navy' },
  client_reply: { label: 'クライアント様とのやり取り', tone: 'mid' },
  client_request: { label: 'クライアントからの依頼', tone: 'warn' },
  precheck: { label: '事前確認', tone: 'navy' },
  resched: { label: 'リスケ', tone: 'warn' },
  cancel: { label: 'キャンセル', tone: 'danger' },
  meeting: { label: '面談', tone: 'navy' },
  meeting_result: { label: '面談後の結果', tone: 'success' },
};
const toneColor = (t) => ({ navy: color.navy, mid: color.textMid, warn: color.warn, danger: color.danger, success: color.success }[t] || color.textMid);

const jst = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const dayOnly = (ymd) => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : '');

export default function AppoTimeline({ appo }) {
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!appo?._supaId) return undefined;
    (async () => {
      const [{ data: ev }, { data: tl }] = await Promise.all([
        supabase.from('precheck_events').select('id, called_at, result, memo, caller_name, cancelled_at').eq('appointment_id', appo._supaId).is('cancelled_at', null).order('called_at'),
        supabase.from('appo_timeline').select('id, at, kind, text').eq('appointment_id', appo._supaId).order('at'),
      ]);
      if (alive) { setEvents(ev || []); setNotes(tl || []); }
    })();
    return () => { alive = false; };
  }, [appo?._supaId]);

  const items = [];
  if (appo.getDate) items.push({ key: 'got', kind: 'got', when: dayOnly(appo.getDate), sort: `${appo.getDate}T00`, text: `${appo.getter || ''}が取得${appo.meetDate ? `（面談 ${dayOnly(appo.meetDate)}${appo.meetTime ? ' ' + String(appo.meetTime).slice(0, 5) : ''}）` : ''}` });
  if (appo.emailSentAt) items.push({ key: 'report', kind: 'report', when: jst(appo.emailSentAt), sort: appo.emailSentAt, text: 'クライアント様へアポ取得報告を送付' });
  for (const e of events) {
    items.push({ key: `pc-${e.id}`, kind: e.result === 'キャンセル' ? 'cancel' : e.result === 'リスケ' ? 'resched' : 'precheck', when: jst(e.called_at), sort: e.called_at,
      text: `${e.result}${e.caller_name ? `（${e.caller_name}）` : ''}${e.memo ? `：${e.memo}` : ''}` });
  }
  for (const n of notes) items.push({ key: `tl-${n.id}`, kind: n.kind, when: jst(n.at), sort: n.at, text: n.text });
  // 事前確認の記録に無いリスケ・キャンセル（アポ一覧で直接変えた分）
  const pcHas = (r) => events.some(e => e.result === r);
  if (appo.status === 'キャンセル' && !pcHas('キャンセル') && !notes.some(n => n.kind === 'cancel')) {
    items.push({ key: 'cancel', kind: 'cancel', when: '', sort: '9999', text: `${appo.cancelType === 'client' ? 'クライアント都合' : appo.cancelType === 'prospect' ? '先方都合' : appo.cancelType === 'after_meeting' ? '面談後のキャンセル' : ''}${appo.cancelReason ? `：${appo.cancelReason}` : ''}` || 'キャンセル' });
  }
  if (appo.status === 'リスケ中' && !pcHas('リスケ')) items.push({ key: 'resched', kind: 'resched', when: '', sort: '9998', text: '新しい日程を調整中' });
  if (appo.status === '面談済') items.push({ key: 'meet', kind: 'meeting', when: dayOnly(appo.meetDate), sort: `${appo.meetDate || '9'}T23`, text: '面談済' });
  items.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));

  return (
    <div className="v2-card" style={{ padding: `${space[2.5]}px ${space[3]}px`, marginBottom: space[3] }}>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[2] }}>このアポの経緯</div>
      {items.length === 0 && <div style={{ fontSize: font.size.xs, color: color.textLight }}>まだ記録がありません</div>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1.5] }}>
        {items.map(it => (
          <li key={it.key} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: space[2], fontSize: font.size.xs, lineHeight: 1.6 }}>
            <span style={{ color: color.textLight, fontVariantNumeric: 'tabular-nums' }}>{it.when}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ color: toneColor(KIND[it.kind]?.tone), fontWeight: font.weight.semibold, marginRight: space[1.5] }}>{KIND[it.kind]?.label || it.kind}</b>
              <span style={{ color: color.textDark }}>{it.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
