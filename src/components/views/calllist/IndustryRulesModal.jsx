import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// 業種別ルール（2026-10-09 むー様）
// 手書きの表をやめ、全架電から毎日計算し直すキーマン接続率（industry_connect_rates）を曜日×時間帯で出す。
const WDN = ['', '月', '火', '水', '木', '金'];
const HRS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const MINN = 20; // これより少ない枠は数字を出さず「参考」の斜線にする
const col = v => (v >= 20 ? '#032D60' : v >= 15 ? '#0176D3' : v >= 10 ? '#7FB4E6' : v >= 6 ? '#C6DDF4' : '#EEF4FB');
const pct = r => Math.round(Number(r) * 1000) / 10;

async function fetchAllRates() {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('industry_connect_rates')
      .select('grp, dow, hour, calls, rate, updated_at').order('grp').order('dow').order('hour').range(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export default function IndustryRulesModal({ open, onClose }) {
  const [rows, setRows] = useState(null);
  const [sortK, setSortK] = useState('now');
  const [sel, setSel] = useState(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { if (open && !rows) fetchAllRates().then(setRows); }, [open, rows]);
  useEffect(() => { if (!open) return; setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, [open]);
  useEffect(() => {
    if (!open) return;
    const f = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [open, onClose]);

  // { grp: { all: [calls, %], c: { 'w-h': [calls, %] } } }
  const R = useMemo(() => {
    const o = {};
    for (const r of rows || []) {
      const g = (o[r.grp] ||= { all: [0, 0], c: {} });
      if (r.dow === 0 && r.hour === -1) g.all = [r.calls, pct(r.rate)];
      else if (r.dow >= 1 && r.hour >= 0) g.c[`${r.dow}-${r.hour}`] = [r.calls, pct(r.rate)];
    }
    return o;
  }, [rows]);
  const upd = useMemo(() => {
    const t = (rows || []).reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '');
    return t ? new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  }, [rows]);

  const nw = now.getDay(), nh = now.getHours();
  const inHours = nw >= 1 && nw <= 5 && nh >= 8 && nh <= 18;
  const nowRate = g => { const c = R[g]?.c[`${nw}-${nh}`]; return c && c[0] >= MINN ? c[1] : null; };
  const keys = Object.keys(R).sort((a, b) => (sortK === 'n'
    ? R[b].all[0] - R[a].all[0]
    : ((nowRate(b) ?? -1) - (nowRate(a) ?? -1)) || R[b].all[0] - R[a].all[0]));
  const cur = sel && R[sel] ? sel : keys[0];

  if (!open) return null;
  const G = cur ? R[cur] : null;
  const cells = [];
  if (G) for (let w = 1; w <= 5; w++) for (const h of HRS) { const c = G.c[`${w}-${h}`] || [0, 0]; cells.push({ w, h, n: c[0], v: c[1] }); }
  const top = cells.filter(c => c.n >= MINN).sort((a, b) => b.v - a.v).slice(0, 3);

  return (
    <div className="rl-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rl" role="dialog" aria-label="業種別ルール">
        <div className="rl-h"><div><b>業種別ルール</b><span>{upd ? `本番の全架電から計算・最終更新 ${upd}` : '読み込み中'}</span></div><button className="rl-x" onClick={onClose} aria-label="閉じる">✕</button></div>
        <div className="rl-b">
          <div className="rl-l">
            <div className="rl-sort">
              <button className={sortK === 'now' ? 'on' : ''} onClick={() => setSortK('now')}>いまつながる順</button>
              <button className={sortK === 'n' ? 'on' : ''} onClick={() => setSortK('n')}>架電数順</button>
            </div>
            <div id="rlList">
              {keys.map(g => {
                const r = nowRate(g);
                return (
                  <div key={g} className={`rl-i ${g === cur ? 'on' : ''}`} onClick={() => setSel(g)}>
                    <b>{g}</b><small>平均 {R[g].all[1]}%・{R[g].all[0].toLocaleString()}架電</small>
                    <span className="nw" style={{ color: r == null ? 'var(--ink-3)' : r >= R[g].all[1] ? '#0176D3' : 'var(--ink-2)' }}>
                      {inHours ? (r == null ? '—' : `${r}%`) : '—'}<small>{inHours ? 'いま' : '時間外'}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rl-r">
            {G && <>
              <h3>{cur}</h3>
              <div className="sub">平均 {G.all[1]}%（{G.all[0].toLocaleString()}架電）・狙い目 {top.map(c => `${WDN[c.w]}${c.h}時台（${c.v}%）`).join('・') || '—'}</div>
              <div className="hm">
                <div />
                {HRS.map(h => <span key={h} className={`hh ${h === nh ? 'nowh' : ''}`}>{h}</span>)}
                {[1, 2, 3, 4, 5].map(w => [
                  <span key={`w${w}`} className={`hw ${w === nw ? 'nowh' : ''}`}>{WDN[w]}</span>,
                  ...HRS.map(h => {
                    const c = cells.find(x => x.w === w && x.h === h), few = c.n < MINN, isNow = w === nw && h === nh;
                    return (
                      <i key={`${w}-${h}`} className={`${few ? 'few' : ''} ${top.includes(c) ? 'top' : ''} ${isNow ? 'now' : ''}`}
                        style={few ? undefined : { background: col(c.v), color: c.v >= 15 ? '#fff' : 'var(--ink)' }}
                        title={`${WDN[w]}曜 ${h}時台：接続率 ${c.n ? `${c.v}%` : '—'}（${c.n}架電）${few ? '・少ないので参考' : ''}`}>
                        {few ? '' : Math.round(c.v)}{isNow && <b className="nowt">いま</b>}
                      </i>
                    );
                  }),
                ])}
              </div>
              <div className="clh-lg"><span>キーマン接続率</span><i style={{ background: '#EEF4FB' }} />低<i style={{ background: '#7FB4E6' }} /><i style={{ background: '#0176D3' }} /><i style={{ background: '#032D60' }} />高　<i className="few" />架電20回未満（参考）　金の枠＝狙い目</div>
              <div className="note2">これまでの全架電から、毎日計算し直しています。架電ページの「つながりやすい時間」と同じ数字です。</div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
