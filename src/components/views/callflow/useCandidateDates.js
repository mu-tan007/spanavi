import { useEffect, useState } from 'react';
import { resolveListClient, resolveListContacts } from '../../../utils/listContacts';

// 台本の候補日（2026-10-09 むー様・見本 call.html）
// ① 注意事項③の「いつから」（〇営業日後以降・翌週以降・翌々週以降。土日祝は数えない）
// ② 訪問担当者の Google カレンダーの予定（今のカレンダーのタブと同じ gcal-proxy）
// ③ 当社で取ったこのクライアントのアポは、前後に移動の余白（東京23区1時間・一都三県1.5時間・それより遠い3時間・オンライン15分）
// 面談60分・開始30分刻み・10時〜19時。空きのある日を順に最大6日。最初の2日を台本の二択、残りを「その他候補」に出す
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H0 = 10, H1 = 19, MEET = 1;
const WD = '日月火水木金土';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toH = t => { const [h, m] = String(t).split(':').map(Number); return h + (m || 0) / 60; };
export const toT = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const cache = {};

export function bufferOf(appo) {
  if (appo.isOnline) return 0.25;
  const loc = String(appo.meetLocation || '');
  if (/^東京都(千代田|中央|港|新宿|文京|台東|墨田|江東|品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|北|荒川|板橋|練馬|足立|葛飾|江戸川)区/.test(loc)) return 1;
  if (/^(東京都|神奈川県|埼玉県|千葉県)/.test(loc)) return 1.5;
  return loc ? 3 : 1;
}

function startRule(cautions) {
  const s = String(cautions || '');
  const m = s.match(/(\d+)\s*営業日後/);
  if (m) return { kind: 'biz', n: Number(m[1]) };
  if (/翌々週/.test(s)) return { kind: 'week', n: 2 };
  if (/翌週/.test(s)) return { kind: 'week', n: 1 };
  return { kind: 'biz', n: 3 };
}

export default function useCandidateDates({ list, clientData, contactsByClient, appoData, enabled = true }) {
  const [out, setOut] = useState({ cands: [], days: [], source: '', loading: false });
  const key = list?._supaId;
  useEffect(() => {
    if (!enabled || !list) return undefined;
    let alive = true;
    (async () => {
      setOut(o => ({ ...o, loading: true }));
      const holidayJp = (await import('@holiday-jp/holiday_jp')).default;
      const isBiz = d => d.getDay() % 6 !== 0 && !holidayJp.isHoliday(d);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const rule = startRule(list.cautions);
      const start = new Date(today);
      if (rule.kind === 'biz') { let n = rule.n; while (n > 0) { start.setDate(start.getDate() + 1); if (isBiz(start)) n--; } }
      else { start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7) + 7 * (rule.n - 1)); }
      const end = new Date(start); end.setDate(end.getDate() + 28);
      // 訪問担当者のカレンダー
      const cl = resolveListClient(list, clientData);
      const contacts = cl ? (contactsByClient?.[cl._supaId] || []) : [];
      const linked = resolveListContacts(list, contacts);
      const calIds = [...new Set([...linked.map(c => c.googleCalendarId), cl?.googleCalendarId].filter(Boolean).flatMap(x => String(x).split(',').map(s => s.trim())).filter(Boolean))].slice(0, 3);
      let busy = [];
      if (calIds.length) {
        const ck = `${calIds.join(',')}|${ymd(start)}`;
        if (!cache[ck]) {
          try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/gcal-proxy?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&calendarIds=${encodeURIComponent(calIds.join(','))}`,
              { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } });
            const j = await res.json();
            cache[ck] = res.ok ? calIds.flatMap(id => j.calendars?.[id] || []) : [];
          } catch { cache[ck] = []; }
        }
        busy = cache[ck];
      }
      // 当社のアポ（このクライアント）と前後の余白
      const appos = (appoData || []).filter(a => a.client === list.company && a.meetDate && a.meetTime && a.status !== 'キャンセル')
        .map(a => ({ d: a.meetDate, s: toH(a.meetTime), e: toH(a.meetTime) + 1, buf: bufferOf(a), name: a.company, online: !!a.isOnline, loc: a.meetLocation || '' }));
      const days = [];
      for (let d = new Date(start); d < end && days.length < 15; d.setDate(d.getDate() + 1)) {
        if (!isBiz(d)) continue;
        const k = ymd(d);
        let free = [[H0, H1]];
        const cut = (x, y) => { free = free.flatMap(([a, b]) => (b <= x || a >= y ? [[a, b]] : [...(a < x ? [[a, x]] : []), ...(b > y ? [[y, b]] : [])])); };
        for (const b of busy) {
          const bs = new Date(b.start), be = new Date(b.end);
          if (ymd(bs) !== k && ymd(be) !== k) continue;
          const x = ymd(bs) === k ? bs.getHours() + bs.getMinutes() / 60 : 0;
          const y = ymd(be) === k ? be.getHours() + be.getMinutes() / 60 : 24;
          cut(x, y);
        }
        const mine = appos.filter(a => a.d === k);
        for (const a of mine) cut(a.s - a.buf, a.e + a.buf);
        free = free.filter(([a, b]) => b - a >= MEET);
        days.push({ k, md: `${d.getMonth() + 1}/${d.getDate()}`, w: WD[d.getDay()], free, appos: mine, busy: busy.filter(b => ymd(new Date(b.start)) === k) });
      }
      const cands = days.filter(x => x.free.length).slice(0, 6).map(x => ({ ...x, tip: x.free.map(([a, b]) => `${toT(a)}〜${toT(b)}`).join('／') }));
      if (alive) setOut({ cands, days, source: calIds.length ? 'calendar' : 'rule', loading: false, startLabel: `${start.getMonth() + 1}/${start.getDate()}` });
    })();
    return () => { alive = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}
