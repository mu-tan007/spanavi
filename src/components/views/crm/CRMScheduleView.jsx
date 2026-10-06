import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Badge, Select } from '../../ui';
import { statusStyle, MEETING_KINDS, MEETING_SHORT } from './utils';

// ============================================================
// 顧客管理 > スケジュール（2026-10-06）
// どの日に、どの会社と、何をするかを月のカレンダーで見る。予定（client_actions）は2種類：
//   ・面談：先方と会う（初回面談・検討面談・キックオフ・再キックオフ・定例・追加提案）。
//           むー様のGoogleカレンダーから1時間ごとに取り込む。1件ずつ「17:30 初回 社名」で出す
//   ・連絡：弊社から送る・頼む（次のリスト依頼・催促・再開の打診・再営業など）。
//           同じ日に3社以上なら「連絡 12社」にまとめ、押すと右に内訳を出す
// カレンダーから会社が1社に決まらなかった面談は「取り込めなかった予定」から会社を選んで取り込む。
// ============================================================

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const CAT = {
  面談: { color: color.success, soft: color.successSoft },
  連絡: { color: color.navy, soft: alpha(color.navyLight, 0.1) },
};
const GROUP_FROM = 3;   // 連絡が1日にこの社数以上ならまとめる

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortName = (name) => (name || '').replace(/株式会社|有限会社|合同会社|一般社団法人|\s/g, '') || name;
const jstLabel = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export default function CRMScheduleView({ clientData = [], onOpenClient }) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [panel, setPanel] = useState(null);       // { title, items } または { unmatched: true }
  const [actions, setActions] = useState([]);
  const [unmatched, setUnmatched] = useState([]);

  const load = useCallback(async () => {
    const [{ data: a }, { data: u }] = await Promise.all([
      supabase.from('client_actions').select('id,client_id,category,kind,note,owner,due,at_time').is('done_at', null).not('due', 'is', null),
      supabase.from('calendar_import_unmatched').select('event_id,title,starts_at,reason').eq('dismissed', false)
        .gte('starts_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at'),
    ]);
    setActions(a || []);
    setUnmatched(u || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => {
    const m = {};
    for (const c of clientData) if (c?._supaId && c.company !== 'M&Aソーシングパートナーズ株式会社') m[c._supaId] = c;
    return m;
  }, [clientData]);

  // 日付ごとの予定
  const { byDay, overdue } = useMemo(() => {
    const map = {};
    const late = [];
    for (const a of actions) {
      const c = byId[a.client_id];
      if (!c || (c.status === '失注' && a.category === '連絡')) continue;
      const it = { day: a.due, client: c, action: a };
      (map[a.due] = map[a.due] || []).push(it);
      if (a.category === '連絡' && a.due < today) late.push(it);
    }
    for (const k of Object.keys(map)) map[k].sort((x, y) => (x.action.at_time || '99').localeCompare(y.action.at_time || '99'));
    return { byDay: map, overdue: late.sort((a, b) => a.day.localeCompare(b.day)) };
  }, [actions, byId, today]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay()));
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [month]);

  const shift = (n) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const monthCount = cells.filter(d => d.getMonth() === month.getMonth()).reduce((s, d) => s + (byDay[ymd(d)]?.length || 0), 0);
  const openDay = (day, cat) => {
    const items = (byDay[day] || []).filter(i => !cat || i.action.category === cat);
    const d = new Date(day + 'T00:00:00');
    setPanel({ title: `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）${cat ? '・' + cat : ''}`, items });
  };

  return (
    <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: space[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>←</Button>
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, minWidth: 120, textAlign: 'center' }}>{month.getFullYear()}年{month.getMonth() + 1}月</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)}>→</Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>今月</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[2] }}>この月 {monthCount}件</span>
          <span style={{ flex: 1 }} />
          {Object.entries(CAT).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: v.color }} />{k}
            </span>
          ))}
          {unmatched.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPanel({ unmatched: true })}>取り込めなかった予定 {unmatched.length}件</Button>
          )}
          {overdue.length > 0 && (
            <Button variant="danger" size="sm" onClick={() => setPanel({ title: '期限切れの連絡', items: overdue, showDay: true })}>期限切れ {overdue.length}社</Button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: `1px solid ${color.border}`, borderLeft: `1px solid ${color.border}` }}>
          {WEEK.map(w => (
            <div key={w} style={{ padding: '6px 8px', fontSize: font.size.xs, fontWeight: font.weight.semibold, textAlign: 'center', background: color.navy, color: color.white, borderRight: `1px solid ${color.border}` }}>{w}</div>
          ))}
          {cells.map(d => {
            const day = ymd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const items = byDay[day] || [];
            const isToday = day === today;
            const meetings = items.filter(i => i.action.category === '面談');
            const contacts = items.filter(i => i.action.category === '連絡');
            const late = day < today;
            return (
              <div key={day} style={{
                minHeight: 112, padding: 6, borderRight: `1px solid ${color.border}`, borderBottom: `1px solid ${color.border}`,
                background: isToday ? alpha(color.gold, 0.1) : inMonth ? color.white : color.gray50,
                display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
              }}>
                <div style={{
                  fontSize: font.size.xs, fontWeight: isToday ? font.weight.bold : font.weight.medium,
                  color: !inMonth ? color.textLight : d.getDay() === 0 ? color.danger : d.getDay() === 6 ? color.info : color.textDark,
                }}>{d.getDate()}{isToday && <span style={{ marginLeft: 4, color: color.goldDim }}>今日</span>}</div>
                {/* 面談は1件ずつ（時刻・種類・社名） */}
                {meetings.map(it => (
                  <button key={it.action.id} type="button" onClick={() => setPanel({ title: '面談', items: [it], showDay: true })}
                    title={`${it.client.company}：${it.action.kind}${it.action.note ? '（' + it.action.note + '）' : ''}`}
                    style={chipStyle(CAT.面談, false)}>
                    {it.action.at_time ? `${it.action.at_time} ` : ''}<b>{MEETING_SHORT[it.action.kind] || it.action.kind}</b> {shortName(it.client.company)}
                  </button>
                ))}
                {/* 連絡は少なければ社名、多ければまとめる */}
                {contacts.length >= GROUP_FROM ? (
                  <button type="button" onClick={() => openDay(day, '連絡')} style={{ ...chipStyle(CAT.連絡, late), fontWeight: font.weight.bold }}>連絡 {contacts.length}社</button>
                ) : contacts.map(it => (
                  <button key={it.action.id} type="button" onClick={() => openDay(day, '連絡')}
                    title={`${it.client.company}：${it.action.kind}${it.action.note ? ' ' + it.action.note : ''}`}
                    style={chipStyle(CAT.連絡, late)}>{shortName(it.client.company)}</button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {panel && (
        <div style={{
          width: 400, flexShrink: 0, background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.lg, boxShadow: shadow.md, position: 'sticky', top: space[4],
          maxHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', background: color.navy, color: color.white, borderRadius: `${radius.lg}px ${radius.lg}px 0 0`, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: font.weight.bold, fontSize: font.size.sm }}>{panel.unmatched ? '取り込めなかった予定' : panel.title}</span>
            <span style={{ marginLeft: 8, fontSize: font.size.xs, opacity: 0.8 }}>{panel.unmatched ? unmatched.length : panel.items.length}件</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)} style={{ color: color.white }}>閉じる</Button>
          </div>
          <div style={{ overflowY: 'auto', padding: space[2] }}>
            {panel.unmatched
              ? <UnmatchedList items={unmatched} clients={Object.values(byId)} onDone={load} />
              : panel.items.map(it => <ActionRow key={it.action.id} it={it} showDay={panel.showDay} onOpenClient={onOpenClient} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionRow({ it, showDay, onOpenClient }) {
  const c = it.client;
  const a = it.action;
  const cat = CAT[a.category] || CAT.連絡;
  const sc = statusStyle(c.status);
  return (
    <div style={{ padding: '10px 10px', borderBottom: `1px solid ${color.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: cat.color, background: cat.soft, padding: '1px 6px', borderRadius: radius.sm }}>
          {a.category}・{a.kind}{showDay ? ` ${a.due.slice(5).replace('-', '/')}` : ''}{a.at_time ? ` ${a.at_time}` : ''}
        </span>
        <span style={{ fontSize: 10, color: sc.color }}>{c.status}</span>
        {c.stage && <Badge variant="neutral">{c.stage}</Badge>}
      </div>
      <button type="button" onClick={() => onOpenClient?.(c)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, textDecoration: 'underline', textDecorationStyle: 'dotted',
      }}>{c.company}</button>
      {a.note && (
        <div style={{ fontSize: font.size.xs, color: color.textDark, marginTop: 4, lineHeight: 1.5 }}>
          <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.white, background: a.owner === '先方' ? color.textLight : color.navy, borderRadius: radius.sm, padding: '0 5px', marginRight: 4 }}>{a.owner}</span>
          {a.note}
        </div>
      )}
      {(c.lastContactAt || c.blocker) && (
        <div style={{ fontSize: 11, color: color.textMid, marginTop: 2, lineHeight: 1.5 }}>
          {c.lastContactAt && `最後のやり取り ${c.lastContactAt.replaceAll('-', '/')}${c.lastContactSummary ? '：' + c.lastContactSummary : ''}`}
          {c.blocker && <div>止まり：{c.blocker}</div>}
        </div>
      )}
    </div>
  );
}

// カレンダーから会社が1社に決まらなかった面談。会社と種類を選んで取り込むか、無視する
function UnmatchedList({ items, clients, onDone }) {
  const [pick, setPick] = useState({});   // event_id -> { client_id, kind }
  const options = useMemo(() => [{ value: '', label: '会社を選ぶ' }, ...clients
    .slice().sort((a, b) => a.company.localeCompare(b.company, 'ja'))
    .map(c => ({ value: c._supaId, label: c.company }))], [clients]);
  const take = async (u) => {
    const p = pick[u.event_id] || {};
    if (!p.client_id) { alert('会社を選んでください'); return; }
    const { data: cl } = await supabase.from('clients').select('org_id').eq('id', p.client_id).maybeSingle();
    const d = new Date(new Date(u.starts_at).getTime() + 9 * 3600 * 1000).toISOString();
    const { error } = await supabase.from('client_actions').insert({
      org_id: cl?.org_id, client_id: p.client_id, category: '面談', kind: p.kind || '初回面談',
      note: u.title, owner: '当方', due: d.slice(0, 10), at_time: d.slice(11, 16), gcal_event_id: u.event_id,
    });
    if (error) { alert('取り込みに失敗しました: ' + error.message); return; }
    await supabase.from('calendar_import_unmatched').delete().eq('event_id', u.event_id);
    onDone?.();
  };
  const ignore = async (u) => {
    await supabase.from('calendar_import_unmatched').update({ dismissed: true }).eq('event_id', u.event_id);
    onDone?.();
  };
  if (items.length === 0) return <div style={{ padding: space[4], color: color.textLight, fontSize: font.size.sm }}>ありません</div>;
  return items.map(u => (
    <div key={u.event_id} style={{ padding: '10px 10px', borderBottom: `1px solid ${color.border}`, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>{u.title}</div>
      <div style={{ fontSize: 11, color: color.textMid }}>{jstLabel(u.starts_at)}　{u.reason}</div>
      <Select size="sm" value={pick[u.event_id]?.client_id || ''} options={options}
        onChange={e => setPick(p => ({ ...p, [u.event_id]: { ...p[u.event_id], client_id: e.target.value } }))} />
      <div style={{ display: 'flex', gap: 6 }}>
        <Select size="sm" value={pick[u.event_id]?.kind || '初回面談'} options={MEETING_KINDS.map(k => ({ value: k, label: k }))}
          onChange={e => setPick(p => ({ ...p, [u.event_id]: { ...p[u.event_id], kind: e.target.value } }))} />
        <Button size="sm" variant="primary" onClick={() => take(u)}>取り込む</Button>
        <Button size="sm" variant="ghost" onClick={() => ignore(u)}>無視</Button>
      </div>
    </div>
  ));
}

function chipStyle(cat, late) {
  return {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    fontSize: 11, lineHeight: 1.4, padding: '2px 6px', borderRadius: radius.sm,
    border: `1px solid ${late ? color.danger : cat.color}`,
    background: late ? color.dangerSoft : cat.soft, color: late ? color.danger : cat.color,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: font.family.sans,
  };
}
