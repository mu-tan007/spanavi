import { useCallback, useEffect, useMemo, useState } from 'react';
import { color, space, radius, font, shadow } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';

// =====================================================================
// 顧客詳細の右列「活動履歴」（Phalanx の企業情報ページの活動履歴にならう）
// ---------------------------------------------------------------------
// ⚠️ 活動は種類でタブを分けない。1本の時系列にして、絞りたいときだけ種類で絞る。
// ⚠️ 手で書けるのはメモだけ。面談・アポ・ステータス変更は、それぞれの操作から自動で並ぶ。
//    メールは打診などを取り込んだもの（client_activities.kind='email'）。
// ⚠️ 面談は面談日、アポは「取った日」で並べる。面談予定日（未来）で並べると、
//    まだ起きていないことが一番上に来る。
// =====================================================================

export const ACTIVITY_KINDS = [
  ['all', 'すべて'],
  ['deal', '面談'],
  ['appo', 'アポ'],
  ['email', 'メール'],
  ['note', 'メモ'],
];

const TONE = {
  deal: color.navy,
  appo: color.navyLight,
  email: color.gold,
  note: color.textLight,
  status: color.textLight,
};

const isYmd = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const tokyoYmd = (v) => (isYmd(v) ? v : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(v)));

// 何日前か。日本時間の暦日の差で数える。未来の日付には何も出さない。
export function daysAgo(v) {
  if (!v || Number.isNaN(new Date(v).getTime())) return null;
  const d = Math.round((Date.parse(tokyoYmd(Date.now())) - Date.parse(tokyoYmd(v))) / 86400000);
  if (d < 0) return null;
  if (d === 0) return '今日';
  if (d === 1) return '昨日';
  return `${d}日前`;
}

// 「10月5日（日）」。今年以外は年を付ける。
export const fmtLong = (v) => new Date(v).toLocaleDateString('ja-JP', {
  ...(tokyoYmd(v).slice(0, 4) !== tokyoYmd(Date.now()).slice(0, 4) ? { year: 'numeric' } : {}),
  month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
});
const fmtTime = (v) => new Date(v).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
const fmtMd = (v) => { const s = tokyoYmd(v); return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`; };

function buildTimeline(d) {
  const out = [];

  // 面談（保存されているものだけ。中身の無い空の枠は出さない）
  for (const m of d.meetings) {
    if (!m.meeting_at && !m.summary && !m.next_action) continue;
    out.push({
      at: m.meeting_at || m.created_at, dateOnly: !!m.meeting_at,
      key: 'm' + m.id, tone: 'deal', kind: 'deal',
      lead: '', text: m.title || '面談', meetingId: m.id,
    });
  }

  // アポ。取った日で並べる。面談日と状態は下に小さく添える。
  for (const a of d.appointments) {
    out.push({
      at: a.created_at, key: 'a' + a.id, tone: 'appo', kind: 'appo',
      lead: a.getter_name ? `${a.getter_name}が` : '',
      text: `${a.company_name || '企業'}のアポを取得しました`,
      sub: [a.meeting_date ? `面談 ${fmtMd(a.meeting_date)}` : null, a.status].filter(Boolean).join('・'),
    });
  }

  // メモとメール
  for (const n of d.activities) {
    out.push({
      at: n.occurred_at, key: 'n' + n.id, tone: n.kind, kind: n.kind,
      lead: n.created_by_name ? `${n.created_by_name}が` : '',
      text: n.kind === 'email' ? (n.title || 'メールを送りました') : 'メモ',
      memo: n.body, noteId: n.kind === 'note' ? n.id : null,
    });
  }

  // 担当者メモ（担当者ごとに書いたもの）
  for (const e of d.contactMemos) {
    out.push({
      at: e.created_at, key: 'cm' + e.id, tone: 'note', kind: 'note',
      lead: e.author_name ? `${e.author_name}が` : '',
      text: `担当者メモ（${e.contact_name || '担当者'}）`,
      memo: e.body_md,
    });
  }

  // ステータスを変えた記録。出来事ではなく操作なので、小さく薄く出す。
  for (const l of d.statusLog) {
    out.push({
      at: l.changed_at, key: 's' + l.id, tone: 'status', kind: 'status', quiet: true,
      lead: l.changed_by_name ? `${l.changed_by_name}が` : '',
      text: `ステータスを${l.to_status || '—'}に変えました`,
    });
  }

  return out
    .filter((x) => x.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// 最終接点の日（ステータス変更のような操作は数えない）
export function lastContactOf(items) {
  const hit = items.find((x) => !x.quiet);
  return hit ? hit.at : null;
}

export function useClientActivity(clientId, contacts) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const contactKey = (contacts || []).map((c) => c.id).join(',');

  const load = useCallback(async () => {
    if (!clientId) return;
    setError('');
    const contactIds = (contacts || []).map((c) => c.id).filter(Boolean);
    const [m, a, n, s, cm] = await Promise.all([
      supabase.from('client_meetings').select('id, title, meeting_at, summary, next_action, created_at').eq('client_id', clientId),
      supabase.from('appointments').select('id, company_name, getter_name, created_at, meeting_date, status')
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(300),
      supabase.from('client_activities').select('*').eq('client_id', clientId).order('occurred_at', { ascending: false }),
      supabase.from('client_status_log').select('*').eq('client_id', clientId).order('changed_at', { ascending: false }),
      contactIds.length
        ? supabase.from('contact_memo_events').select('id, contact_id, body_md, author_name, created_at').in('contact_id', contactIds)
        : Promise.resolve({ data: [] }),
    ]);
    const err = [m, a, n, s, cm].find((r) => r.error)?.error;
    if (err) setError(err.message);
    const nameById = new Map((contacts || []).map((c) => [c.id, c.name]));
    setData({
      meetings: m.data || [],
      appointments: a.data || [],
      activities: n.data || [],
      statusLog: s.data || [],
      contactMemos: (cm.data || []).map((e) => ({ ...e, contact_name: nameById.get(e.contact_id) })),
      appoCount: (a.data || []).length,
    });
  }, [clientId, contactKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setData(null); load(); }, [load]);

  const items = useMemo(() => (data ? buildTimeline(data) : []), [data]);
  return { data, items, error, reload: load };
}

/* ---------------- メモを書く場所（活動履歴の一番上） ---------------- */

function NoteComposer({ clientId, currentUser, onSaved }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = body.trim() !== '';

  const save = async () => {
    if (!open || busy) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('client_activities').insert({
      org_id: getOrgId(), client_id: clientId, kind: 'note', body: body.trim(),
      created_by_name: currentUser || null,
    });
    setBusy(false);
    if (error) { setErr('保存に失敗しました：' + error.message); return; }
    setBody('');
    onSaved?.();
  };

  return (
    <div style={{ padding: '12px 14px', marginBottom: space[4], background: color.gray100, borderRadius: radius.lg }}>
      {/* 横一列（入力欄・保存）。縦に積むと履歴が見えなくなる。 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <textarea
          aria-label="社内メモ"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="メモ"
          rows={open ? 3 : 1}
          disabled={busy}
          style={{
            flex: 1, minWidth: 0, resize: 'vertical', lineHeight: 1.7,
            padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${color.border}`,
            background: color.white, color: color.textDark, outline: 'none',
            fontFamily: font.family.sans, fontSize: 12.5, boxSizing: 'border-box',
          }}
        />
        <button onClick={save} disabled={!open || busy} style={{
          padding: '7px 16px', borderRadius: radius.lg, border: 'none', whiteSpace: 'nowrap',
          background: open && !busy ? color.navy : color.border,
          color: open && !busy ? color.white : color.textLight,
          cursor: open && !busy ? 'pointer' : 'default',
          fontFamily: font.family.sans, fontSize: 12, fontWeight: 700,
        }}>{busy ? '保存中' : '保存'}</button>
      </div>
      {err && <div role="alert" style={{ marginTop: 8, fontSize: 11.5, color: color.danger }}>{err}</div>}
    </div>
  );
}

/* ---------------- 活動履歴（絞り込み＋時系列） ---------------- */

export default function ClientActivity({ clientId, currentUser, items, error, onSaved, onOpenMeeting }) {
  const [kind, setKind] = useState('all');
  const shown = kind === 'all' ? items : items.filter((x) => x.kind === kind);

  return (
    <div>
      <NoteComposer clientId={clientId} currentUser={currentUser} onSaved={onSaved} />
      {error && <div role="alert" style={{ marginBottom: 8, fontSize: 11.5, color: color.danger }}>読み込みエラー：{error}</div>}

      {/* 種類での絞り込み。分けて置くのではなく、1本の流れを絞る。 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: space[3], flexWrap: 'wrap' }}>
        {ACTIVITY_KINDS.map(([k, label]) => {
          const n = k === 'all' ? items.length : items.filter((x) => x.kind === k).length;
          const on = kind === k;
          return (
            <button key={k} onClick={() => setKind(k)} style={{
              padding: '4px 12px', borderRadius: radius.pill, cursor: 'pointer', border: 'none',
              background: on ? color.navy : color.gray100,
              color: on ? color.white : color.textMid,
              fontSize: 11.5, fontWeight: on ? 700 : 500, fontFamily: font.family.sans,
            }}>
              {label}
              {n > 0 && <span style={{ marginLeft: 5, opacity: 0.7, fontSize: 10 }}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto', paddingRight: 4 }}>
        {shown.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12.5, color: color.textLight, lineHeight: 1.9 }}>
            記録なし<br />
            {kind === 'all' && <>面談・アポ・ステータスの変更は、<br />それぞれの操作に紐づいて自動でここに並びます</>}
          </div>
        ) : (
          <Timeline items={shown} onOpenMeeting={onOpenMeeting} />
        )}
      </div>
    </div>
  );
}

function Timeline({ items, onOpenMeeting }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 18 }}>
      {/* 縦の線。上から下へ1本で読ませる */}
      <div style={{ position: 'absolute', left: 4, top: 10, bottom: 10, width: 1, background: color.border }} />
      {items.map((it) => {
        const clickable = it.meetingId && onOpenMeeting;
        return (
          <div key={it.key} onClick={clickable ? () => onOpenMeeting(it.meetingId) : undefined}
            style={{ position: 'relative', padding: '10px 0', cursor: clickable ? 'pointer' : 'default' }}>
            <span style={{
              position: 'absolute', left: -18, top: 15, width: 9, height: 9, borderRadius: '50%',
              background: TONE[it.tone] || color.textLight, border: `2px solid ${color.white}`,
            }} />
            <div style={{ fontSize: it.quiet ? 10.5 : 11.5, color: color.textLight }}>
              {fmtLong(it.at)}
              {!it.dateOnly && <span style={{ marginLeft: 6 }}>{fmtTime(it.at)}</span>}
              <span style={{ marginLeft: 8 }}>{daysAgo(it.at)}</span>
            </div>
            {/* 操作の記録（quiet）は小さく薄く。出来事と同じ強さで並べない。 */}
            <div style={{
              marginTop: 3, lineHeight: 1.7, fontSize: it.quiet ? 12 : 13.5,
              color: it.quiet ? color.textLight : color.textDark,
            }}>
              {it.lead}
              <b style={{
                fontWeight: it.quiet ? 500 : 700,
                color: it.quiet ? color.textLight : clickable ? color.navyLight : color.textDark,
                textDecoration: clickable ? 'underline' : 'none', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
              }}>{it.text}</b>
              {clickable && <span style={{ marginLeft: 6, fontSize: 10.5, color: color.textLight }}>面談記録を開く</span>}
            </div>
            {it.sub && <div style={{ marginTop: 4, fontSize: 11.5, color: color.textLight }}>{it.sub}</div>}
            {it.memo && (
              <div style={{
                marginTop: 6, padding: '8px 11px', borderRadius: radius.md, background: color.gray100,
                fontSize: 12.5, color: color.textMid, lineHeight: 1.8, whiteSpace: 'pre-wrap',
              }}>{it.memo}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const activityCardStyle = {
  background: color.white, border: `1px solid ${color.border}`,
  borderRadius: radius.lg, boxShadow: shadow.sm, padding: '16px 20px',
};
