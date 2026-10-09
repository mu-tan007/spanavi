import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// つながりやすい時間（2026-10-09 むー様・見本 call.html）
// その会社の業種の、曜日×時間帯のキーマン接続率（全架電・毎日20時に出し直す industry_connect_rates）。いまの枠をオレンジで目立たせる
const WDN = ['', '月', '火', '水', '木', '金'];
const HRS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const MINN = 20;
const heatCol = v => (v >= 20 ? '#032D60' : v >= 15 ? '#0176D3' : v >= 10 ? '#7FB4E6' : v >= 6 ? '#C6DDF4' : '#EEF4FB');
const cache = {};

export default function HeatRule({ grp }) {
  const [rows, setRows] = useState(grp ? cache[grp] || null : null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!grp) { setRows(null); return undefined; }
    if (cache[grp]) { setRows(cache[grp]); return undefined; }
    let alive = true;
    supabase.from('industry_connect_rates').select('dow, hour, calls, rate').eq('grp', grp).then(({ data }) => {
      cache[grp] = data || [];
      if (alive) setRows(cache[grp]);
    });
    return () => { alive = false; };
  }, [grp]);
  if (!grp) return null;
  const at = (w, h) => { const r = (rows || []).find(x => x.dow === w && x.hour === h); return r ? { n: r.calls, v: Math.round(Number(r.rate) * 1000) / 10 } : { n: 0, v: 0 }; };
  const all = (rows || []).find(x => x.dow === 0 && x.hour === -1);
  const cells = []; for (let w = 1; w <= 5; w++) for (const h of HRS) cells.push({ w, h, ...at(w, h) });
  const top = cells.filter(c => c.n >= MINN).sort((a, b) => b.v - a.v).slice(0, 3);
  const nw = now.getDay(), nh = now.getHours();
  const nowc = cells.find(c => c.w === nw && c.h === nh);
  return (
    <div className="rule">
      <div className="rule-h"><b>つながりやすい時間 ・ {grp}</b>
        <span>狙い目 {top.map(c => `${WDN[c.w]}${c.h}時`).join('・') || '—'} ／ <b className="nowlab">いま {'日月火水木金土'[nw]}曜{nh}時台{nowc ? `（${nowc.n < MINN ? '参考 ' : ''}${nowc.v}%）` : '（架電の時間外）'}</b></span></div>
      <div className="hm">
        <div />
        {HRS.map(h => <span key={h} className={`hh ${h === nh ? 'nowh' : ''}`}>{h}</span>)}
        {[1, 2, 3, 4, 5].map(w => [
          <span key={`w${w}`} className={`hw ${w === nw ? 'nowh' : ''}`}>{WDN[w]}</span>,
          ...HRS.map(h => {
            const c = cells.find(x => x.w === w && x.h === h), few = c.n < MINN, isNow = w === nw && h === nh;
            return (
              <i key={`${w}-${h}`} className={`${few ? 'few' : ''} ${top.includes(c) ? 'top' : ''} ${isNow ? 'now' : ''}`}
                style={few ? undefined : { background: heatCol(c.v), color: c.v >= 15 ? '#fff' : 'var(--ink)' }}
                title={`${WDN[w]}曜 ${h}時台：接続率 ${c.n ? `${c.v}%` : '—'}（${c.n}架電）${few ? '・少ないので参考' : ''}`}>
                {few ? '' : Math.round(c.v)}{isNow && <b className="nowt">いま</b>}
              </i>
            );
          }),
        ])}
      </div>
      <div className="hm-lg"><span>キーマン接続率</span><i style={{ background: '#EEF4FB' }} />低<i style={{ background: '#7FB4E6' }} /><i style={{ background: '#0176D3' }} /><i style={{ background: '#032D60' }} />高<span className="sp2" /><i className="few" />架電20回未満（参考）</div>
      <div className="hb-n">キーマン接続率・これまでの全架電（{grp}{all ? ` ${Number(all.calls).toLocaleString()}架電・平均${(Number(all.rate) * 100).toFixed(1)}%` : ''}）</div>
    </div>
  );
}
