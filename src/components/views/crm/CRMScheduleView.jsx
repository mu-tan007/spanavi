import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Badge } from '../../ui';
import { statusStyle } from './utils';

// ============================================================
// 顧客管理 > スケジュール（2026-10-06）
// どの日に、どの会社へ、何をするかを月のカレンダーで見る。
//   ・アプローチ：会社ごとの予定（client_actions。まだ済んでいないもの）の期限
//   ・面談・接点：次回接点（clients.next_contact_at。面談予定の面談日時など）
// 同じ日に何社もあるときは「アプローチ 5社」のようにまとめ、押すと右に内訳を出す。
// ============================================================

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const KIND = {
  action:  { label: 'アプローチ', color: color.navy, soft: alpha(color.navyLight, 0.1) },
  contact: { label: '面談・接点', color: color.success, soft: color.successSoft },
};
// 1日に名前をそのまま並べるのは、その種類が2社まで。3社以上はまとめる
const SHOW_NAMES_UP_TO = 2;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// next_contact_at は timestamptz。日本時間の日付と時刻にする
const jst = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return { day: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
};

export default function CRMScheduleView({ clientData = [], onOpenClient }) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // 右の内訳：{ title, items }
  const [panel, setPanel] = useState(null);
  // 会社ごとの予定（1社に複数ある）
  const [actions, setActions] = useState([]);
  useEffect(() => {
    supabase.from('client_actions').select('id,client_id,kind,note,owner,due').is('done_at', null).not('due', 'is', null)
      .then(({ data }) => setActions(data || []));
  }, []);

  // 日付ごとの予定
  const { byDay, overdue } = useMemo(() => {
    const map = {};
    const late = [];
    const add = (day, item) => { (map[day] = map[day] || []).push(item); };
    const byId = {};
    for (const c of clientData) {
      if (!c?._supaId || c.company === 'M&Aソーシングパートナーズ株式会社' || c.status === '失注') continue;
      byId[c._supaId] = c;
    }
    for (const a of actions) {
      const c = byId[a.client_id];
      if (!c) continue;
      const it = { kind: 'action', day: a.due, client: c, action: a };
      add(a.due, it);
      if (a.due < today) late.push(it);
    }
    for (const c of Object.values(byId)) {
      if (c.nextContactAt) {
        const { day, time } = jst(c.nextContactAt);
        add(day, { kind: 'contact', day, time: time === '00:00' ? '' : time, client: c });
      }
    }
    return { byDay: map, overdue: late.sort((a, b) => a.day.localeCompare(b.day)) };
  }, [clientData, actions, today]);

  // 月のマス（前後の月の日も埋めて、日曜始まりの週で並べる）
  const cells = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay()));
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [month]);

  const monthLabel = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  const shift = (n) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const monthCount = useMemo(() => cells
    .filter(d => d.getMonth() === month.getMonth())
    .reduce((s, d) => s + (byDay[ymd(d)]?.length || 0), 0), [cells, byDay, month]);

  const openDay = (day, kind) => {
    const items = (byDay[day] || []).filter(i => !kind || i.kind === kind);
    const d = new Date(day + 'T00:00:00');
    setPanel({ title: `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）${kind ? '・' + KIND[kind].label : ''}`, items });
  };

  return (
    <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, padding: space[4] }}>
        {/* 見出し：月の移動・凡例・期限切れ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>←</Button>
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, minWidth: 120, textAlign: 'center' }}>{monthLabel}</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)}>→</Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>今月</Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: space[2] }}>この月 {monthCount}件</span>
          <span style={{ flex: 1 }} />
          {Object.entries(KIND).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: font.size.xs, color: color.textMid }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: v.color }} />{v.label}
            </span>
          ))}
          {overdue.length > 0 && (
            <Button variant="danger" size="sm" onClick={() => setPanel({ title: '期限切れの次の一手', items: overdue })}>
              期限切れ {overdue.length}社
            </Button>
          )}
        </div>

        {/* 曜日 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: `1px solid ${color.border}`, borderLeft: `1px solid ${color.border}` }}>
          {WEEK.map((w, i) => (
            <div key={w} style={{
              padding: '6px 8px', fontSize: font.size.xs, fontWeight: font.weight.semibold, textAlign: 'center',
              background: color.navy, color: color.white, borderRight: `1px solid ${color.border}`,
              opacity: i === 0 || i === 6 ? 0.85 : 1,
            }}>{w}</div>
          ))}
          {/* 日のマス */}
          {cells.map(d => {
            const day = ymd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const items = byDay[day] || [];
            const isToday = day === today;
            const groups = ['contact', 'action'].map(k => ({ k, list: items.filter(i => i.kind === k) })).filter(g => g.list.length);
            return (
              <div key={day} style={{
                minHeight: 112, padding: 6, borderRight: `1px solid ${color.border}`, borderBottom: `1px solid ${color.border}`,
                background: isToday ? alpha(color.gold, 0.12) : inMonth ? color.white : color.gray50,
                display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
              }}>
                <div style={{
                  fontSize: font.size.xs, fontWeight: isToday ? font.weight.bold : font.weight.medium,
                  color: !inMonth ? color.textLight : d.getDay() === 0 ? color.danger : d.getDay() === 6 ? color.info : color.textDark,
                }}>{d.getDate()}{isToday && <span style={{ marginLeft: 4, color: color.goldDim }}>今日</span>}</div>
                {groups.map(({ k, list }) => {
                  const kd = KIND[k];
                  const late = k === 'action' && day < today;
                  if (list.length <= SHOW_NAMES_UP_TO) {
                    return list.map(it => (
                      <button key={k + it.client._supaId + (it.action?.id || '')} type="button" onClick={() => openDay(day, k)}
                        title={`${it.client.company}${it.action ? '：' + it.action.kind + (it.action.note ? ' ' + it.action.note : '') : ''}`}
                        style={chipStyle(kd, late)}>
                        {it.time ? `${it.time} ` : ''}{shortName(it.client.company)}
                      </button>
                    ));
                  }
                  return (
                    <button key={k} type="button" onClick={() => openDay(day, k)} style={{ ...chipStyle(kd, late), fontWeight: font.weight.bold }}>
                      {kd.label} {list.length}社
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 右：その日の内訳 */}
      {panel && (
        <div style={{
          width: 400, flexShrink: 0, background: color.white, border: `1px solid ${color.border}`,
          borderRadius: radius.lg, boxShadow: shadow.md, position: 'sticky', top: space[4],
          maxHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', background: color.navy, color: color.white, borderRadius: `${radius.lg}px ${radius.lg}px 0 0`, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: font.weight.bold, fontSize: font.size.sm }}>{panel.title}</span>
            <span style={{ marginLeft: 8, fontSize: font.size.xs, opacity: 0.8 }}>{panel.items.length}社</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)} style={{ color: color.white }}>閉じる</Button>
          </div>
          <div style={{ overflowY: 'auto', padding: space[2] }}>
            {panel.items.length === 0 && <div style={{ padding: space[4], color: color.textLight, fontSize: font.size.sm }}>予定はありません</div>}
            {panel.items.map(it => {
              const c = it.client;
              const sc = statusStyle(c.status);
              const kd = KIND[it.kind];
              return (
                <div key={it.kind + c._supaId + (it.action?.id || '')} style={{ padding: '10px 10px', borderBottom: `1px solid ${color.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: kd.color, background: kd.soft, padding: '1px 6px', borderRadius: radius.sm }}>
                      {kd.label}{it.time ? ` ${it.time}` : ''}{panel.title.startsWith('期限切れ') ? ` ${it.day.slice(5).replace('-', '/')}` : ''}
                    </span>
                    <span style={{ fontSize: 10, color: sc.color }}>{c.status}</span>
                    {c.stage && <Badge variant="neutral">{c.stage}</Badge>}
                  </div>
                  <button type="button" onClick={() => onOpenClient?.(c)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                    fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, textDecoration: 'underline', textDecorationStyle: 'dotted',
                  }}>{c.company}</button>
                  {it.action ? (
                    <div style={{ fontSize: font.size.xs, color: color.textDark, marginTop: 4, lineHeight: 1.5 }}>
                      <span style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.white, background: it.action.owner === '先方' ? color.textLight : color.navy, borderRadius: radius.sm, padding: '0 5px', marginRight: 4 }}>{it.action.owner}</span>
                      <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{it.action.kind}</span>
                      {it.action.note ? `：${it.action.note}` : ''}
                    </div>
                  ) : c.nextAction && (
                    <div style={{ fontSize: font.size.xs, color: color.textDark, marginTop: 4, lineHeight: 1.5 }}>次の一手：{c.nextAction}</div>
                  )}
                  {(c.lastContactAt || c.blocker) && (
                    <div style={{ fontSize: 11, color: color.textMid, marginTop: 2, lineHeight: 1.5 }}>
                      {c.lastContactAt && `最後のやり取り ${c.lastContactAt.replaceAll('-', '/')}${c.lastContactSummary ? '：' + c.lastContactSummary : ''}`}
                      {c.blocker && <div>止まり：{c.blocker}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function chipStyle(kd, late) {
  return {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    fontSize: 11, lineHeight: 1.4, padding: '2px 6px', borderRadius: radius.sm,
    border: `1px solid ${late ? color.danger : kd.color}`,
    background: late ? color.dangerSoft : kd.soft, color: late ? color.danger : kd.color,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: font.family.sans,
  };
}

// マスに収まるよう、法人格を外して短くする
function shortName(name) {
  return (name || '').replace(/株式会社|有限会社|合同会社|一般社団法人|\s/g, '') || name;
}
