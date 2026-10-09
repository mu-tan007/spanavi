import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchCallStatusRates, perAppoLabel } from '../../../utils/appoOutlook';
import { CALLING_WINDOW_MIN } from '../../../utils/memberStatus';
import { useCallQueue, readLastCall } from '../smart-queue/useCallQueue';
import IndustryRulesModal from './IndustryRulesModal';
import { fetchListHome } from './listHomeData';
import './CallListHome.css';

// 架電リストのトップ（2026-10-09 むー様・見本 calllist.html をそのまま本番へ）
// 上：いま誰がどのリストを／チームの今日のアポの貯金。下：「条件で探す」「リスト」の2つのタブ（選んだタブは人ごとに覚える）
const COL = { '未架電': '#B9D7F3', 'キーマン再コール': '#032D60', '受付再コール': '#0176D3', 'キーマン不在': '#8692A0', '不通': '#C9D1DB', '受付ブロック': '#E8B4BC', 'キーマン断り': '#E2C68A', '問い合わせフォーム': '#EEF0F3', 'アポ獲得': '#C8A45A' };
const ORDER = ['キーマン再コール', '受付再コール', '未架電', 'キーマン断り', 'キーマン不在', '不通', '受付ブロック', '問い合わせフォーム'];
const CATS = ['M&A', 'IFA', 'SaaS', 'コンサル', '人材', 'Spartia AI'];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const fmt = n => Number(n || 0).toLocaleString('ja-JP');
const jstDate = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
const md = d => { if (!d) return '—'; const s = jstDate(d); const [y, m, dd] = s.split('-'); return (y !== String(new Date().getFullYear()) ? `${y}/` : '') + `${+m}/${+dd}`; };
const mdStr = s => { if (!s) return ''; const [, m, d] = String(s).slice(0, 10).split('-'); return `${+m}/${+d}`; };
const fam = n => String(n || '').trim().split(/[\s　]+/)[0];
const shortClient = c => String(c || '').replace(/株式会社|有限会社|合同会社|（株）|\(株\)|㈱/g, '').trim();
const perOf = r => (r.x > 0 ? r.n / r.x : Infinity);
const recallShare = r => ((r.st['受付再コール'] || 0) + (r.st['キーマン再コール'] || 0)) / (Object.values(r.st).reduce((a, b) => a + b, 0) || 1);
const lapsTip = (v, p) => `まだかけられる会社の9割以上に${v}回かけ終えた。${v + 1}周目は${p || 0}%の会社まで進んでいる`;

const COLS = [
  ['l', 'リスト名', r => r.l, 0, null],
  ['t', '元の社数', r => r.t || 0, 1, 84, 't3 l'],
  ['n', '架電可能', r => r.n, 1, 96, 't3'],
  ['x', '見込みアポ', r => r.x, 1, 96, 't3 rr'],
  ['per', 'アポ1件まで', perOf, 1, 180],
  ['rd', '周回', r => r.rd + (r.rp || 0) / 100, 1, 150],
  ['st', 'いまの状態', recallShare, 1, 170],
  ['a30', '直近1か月のアポ', r => r.a30 || 0, 1, 96],
  ['cr', '取り込み日', r => r.cr || '', 1, 80],
  ['lc', '最終架電', r => r.lc || '', 1, 76],
];

/* 切り替え（下地がばねで滑る） */
function Seg({ items, value, onChange, id }) {
  const ref = useRef(null);
  const [bg, setBg] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const b = ref.current?.querySelector('button.on');
    if (b) setBg({ left: b.offsetLeft, width: b.offsetWidth });
  }, [value, items]);
  return (
    <div className="seg" id={id} ref={ref}>
      <span className="pill-bg" style={{ left: bg.left, width: bg.width }} />
      {items.map(([v, label, c]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}{c != null && <span className="c">{c}</span>}</button>
      ))}
    </div>
  );
}

function Laps({ v, p }) {
  return (
    <span className="laps" title={lapsTip(v, p)}>
      <span className="dots">{[0, 1, 2, 3].map(i => <i key={i} className={i < Math.min(v, 4) ? 'f' : ''} />)}</span>
      <span className="t">{v}周<small style={{ color: 'var(--ink-3)', fontWeight: 400, marginLeft: 4 }}>{v + 1}周目 {p || 0}%</small></span>
    </span>
  );
}

/* ── 上段：いま誰がどのリストを ── */
function Floor({ floor, at }) {
  const prev = useRef({});
  const [pops, setPops] = useState({});
  const nowMs = Date.now();
  const people = floor?.people || [];
  // 前回より件数が増えた人に、最後の結果を一瞬だけ浮かべる
  useEffect(() => {
    const p = {};
    for (const x of people) { const was = prev.current[x.name]; if (was != null && x.calls > was) p[x.name] = x.last_status; }
    prev.current = Object.fromEntries(people.map(x => [x.name, x.calls]));
    if (Object.keys(p).length) { setPops(p); const t = setTimeout(() => setPops({}), 1700); return () => clearTimeout(t); }
    return undefined;
  }, [floor]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowMin = (() => { const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour12: false }).split(':').map(Number); return h * 60 + m; })();
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const hm = t => String(t || '').slice(0, 5).replace(/^0/, '');
  const shiftsOf = n => (floor?.shifts || []).filter(s => s.name === n);
  const desks = people.map(x => {
    const on = nowMs - new Date(x.last_at).getTime() <= CALLING_WINDOW_MIN * 60000;
    const sh = shiftsOf(x.name);
    const inShift = sh.some(s => toMin(s.start) <= nowMin && toMin(s.end) > nowMin);
    const later = sh.filter(s => toMin(s.start) > nowMin).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
    return { n: x.name, w: `${shortClient(x.client)}・${x.list || ''}`, c: x.calls, ap: x.appos, on,
      s: on ? '架電中' : inShift ? '休憩中' : later ? `シフト ${hm(later.start)}〜` : '本日終了', list_id: x.list_id, last: x.last_status };
  });
  const seen = new Set(people.map(x => x.name));
  for (const s of floor?.shifts || []) {
    if (seen.has(s.name) || toMin(s.end) <= nowMin) continue;
    seen.add(s.name);
    desks.push({ n: s.name, w: '—', c: 0, ap: 0, on: false, s: toMin(s.start) <= nowMin ? 'シフト中' : `シフト ${hm(s.start)}〜` });
  }
  desks.sort((a, b) => (b.on - a.on));
  const calling = desks.filter(d => d.on).length;
  const N = floor?.now || {};
  const r1 = v => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
  const bank = Number(floor?.bank || 0);
  const [bankShown, setBankShown] = useState(0);
  useEffect(() => {
    const t0 = performance.now(); let raf;
    const f = t => { const k = Math.min(1, (t - t0) / 1200); setBankShown(bank * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [bank]);
  const bankMax = Math.max(4, Math.ceil(bank));
  return (
    <div className="card floor">
      <div className="floor-l">
        <div>
          <div className="lbl">{DOW[N.dow ?? new Date().getDay()]}曜 {N.hour ?? new Date().getHours()}時台・いま</div>
          <div className="big n">{calling}<small>名が架電中</small></div>
          <div className="s">この時間帯の接続率 <b className="n">{r1(N.rate)}</b>（{DOW[N.dow ?? 0]}曜平均 {r1(N.avg)}）<br />つながりやすいのは <b>{N.best_hour != null ? `${N.best_hour}時台（${r1(N.best_rate)}）` : '—'}</b></div>
        </div>
        <div className="tb">
          <div className="row"><span>チームの今日のアポの貯金</span><span><b className="n">{bankShown.toFixed(2)}</b> 件分</span></div>
          <div className="mt"><i style={{ width: `${Math.min(100, (bank / bankMax) * 100)}%` }} /></div>
          <div className="row"><span>実際のアポ</span><b className="g n">{floor?.appos_today ?? 0}</b></div>
          <small>1回かけるごとに、その会社の「次の1回でアポになる割合」を貯める。再コールなど濃い先ほど早く貯まる</small>
        </div>
      </div>
      <div className="floor-r">
        <div className="desk-h"><span className="lbl">いま誰がどのリストを</span><span className="live"><i /><span>{at}</span> 更新</span></div>
        <div className="desks">
          {desks.map(d => {
            const pop = pops[d.n];
            return (
              <div key={d.n} className={`desk ${d.on ? 'on' : ''} ${pop === 'アポ獲得' ? 'apo' : ''} ${pop ? 'flip' : ''}`}>
                <div className="who"><span className="av">{fam(d.n).slice(0, 1)}</span>{d.n}{d.on && <span className="wave"><b /><b /><b /><b /></span>}</div>
                <span className="st">{d.on ? <span className="live"><i />架電中</span> : d.s}</span>
                <div className="what" title={d.w}>{d.w}</div>
                <div className="ft"><span>今日 <b className="cn">{d.c}</b>架電{d.ap ? <> ・ <b style={{ color: 'var(--gold)' }}>アポ{d.ap}</b></> : null}</span></div>
                {pop && (pop === 'アポ獲得'
                  ? <span className="apo-pop">アポ獲得 ＋1</span>
                  : <span className="res-pop"><i style={{ background: COL[pop] || '#C9D1DB' }} />{pop}</span>)}
              </div>
            );
          })}
          {!desks.length && <div className="what" style={{ gridColumn: '1/-1', color: 'var(--ink-3)' }}>今日はまだ誰も架電していません</div>}
        </div>
      </div>
    </div>
  );
}

/* ── 条件で探す：6つの欄 ── */
const SECS = [
  { t: '受付再コール', sub: '今日の約束・期限切れ・自分の約束', why: '今日かけ直す約束が最優先（時刻順）。そのあと期限切れ。他の人の約束は期限が過ぎたら誰でもかけられる', col: COL['受付再コール'], st: '受付再コール' },
  { t: 'キーマン再コール', sub: '今日の約束・期限切れ・自分の約束', why: '今日かけ直す約束が最優先（時刻順）。そのあと期限切れ。キーマンと話して次の約束をした会社で、一番アポに近い', col: COL['キーマン再コール'], st: 'キーマン再コール' },
  { t: 'キーマン断り', sub: '温度感 高・中', why: '断られたが社長の温度感が高・中の会社（最新の断りで判定）', col: COL['キーマン断り'] },
  { t: '再アプローチ', sub: '他クライアントでアポ', why: '別のクライアントでアポになった会社。新しい順', col: '#C8A45A' },
  { t: '再アプローチ', sub: 'リスケから30日超', why: '一度アポになり、リスケのまま30日を超えた会社。新しい順', col: '#B7791F' },
  { t: '再アプローチ', sub: 'キャンセルから30日超', why: '一度アポになり、先方都合のキャンセルから30日を超えた会社（理由から先方都合と分かるものだけ）', col: '#C8102E' },
];

function rowView(si, r, today, listsById) {
  const L = listsById[r.list_id];
  const li = L ? `${shortClient(L.company)}・${L.industry}` : String(r.lname || '').replace(' - ', '・');
  if (si <= 1) {
    const isToday = r.rd === today;
    const who = fam(r.assignee || r.g);
    const days = Math.round((Date.parse(today) - Date.parse(r.rd)) / 86400000);
    return {
      tm: isToday ? `今日${r.rt ? ` ${r.rt.slice(0, 5)}` : ''}` : '期限切れ', cl: isToday ? 'today' : 'late',
      sub: isToday ? `今日の約束${who ? `（${who}さん）` : ''}` : `${mdStr(r.rd)}${r.rt ? ` ${r.rt.slice(0, 5)}` : ''}の約束${who ? `（${who}さん）` : ''}・${days}日過ぎ`, li,
    };
  }
  if (si === 2) {
    const q = r.q ? `「${r.q}」` : '（発言の記録なし）';
    return { tm: `温度感 ${r.ceo_temp}`, cl: r.ceo_temp === '高' ? 'hi' : 'mid', sub: `${md(r.called_at)} ${fam(r.g)}・${q}`, li };
  }
  if (si === 3) return { tm: md(r.apd), cl: '', sub: `${shortClient(r.apc) || '別のクライアント'}様でアポ（${r.aps}）`, li };
  const tail = si === 4 ? 'リスケのまま30日超' : 'キャンセルから30日超';
  return { tm: md(r.apd), cl: '', sub: `${md(r.apd)} ${r.apg || ''}さんがアポ → 面談${r.md ? mdStr(r.md) : '—'} → ${tail}`, li };
}

function FindSection({ si, sec, data, today, listsById, rates, onCall }) {
  const n = data?.n?.[si + 1] ?? 0;
  const rows = data?.[`s${si + 1}`] || [];
  const [open, setOpen] = useState(false);
  const [dd, setDd] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const ddRef = useRef(null);
  useEffect(() => {
    if (!dd) return undefined;
    const f = e => { if (!ddRef.current?.contains(e.target)) setDd(false); };
    document.addEventListener('click', f); return () => document.removeEventListener('click', f);
  }, [dd]);
  const reasons = si === 2 ? (data?.reasons || []) : null;
  const hit = r => !sel.size || (r.rs || []).some(x => sel.has(x));
  const shown = rows.filter(hit);
  // 理由で絞ったときの件数：取ってきた行で数え、まだ取っていない分は理由ごとの件数の合計で見積もる
  const cnt = !sel.size ? n : (rows.length >= n ? shown.length : Math.min(n, (reasons || []).filter(x => sel.has(x.reason)).reduce((a, x) => a + x.n, 0)));
  const rate = sec.st ? (rates?.all?.[sec.st] || 0) : 0;
  const per = rate > 0 ? `約${Math.round(1 / rate).toLocaleString()}件` : '';
  const L = [...sel];
  const selSum = !sel.size || sel.size === (reasons || []).length ? '' : L.length <= 3 ? L.join('・') : `${L.slice(0, 2).join('・')} ほか${L.length - 2}つ`;
  const visible = open ? shown : shown.slice(0, 7);
  return (
    <div className="card sec fsec" style={{ animationDelay: `${si * 50}ms`, zIndex: dd ? 20 : undefined }}>
      <div className="sec-h">
        <span className="no6">{si + 1}</span>
        <span className="ttl">{sec.t}<small>{sec.sub}</small></span>
        <span className="cnt n">{fmt(cnt)}</span>
        {si <= 1 && data?.today?.[si + 1] > 0 && <span className="td">今日 <b>{data.today[si + 1]}</b>件</span>}
        <span className="why">{sec.why}</span>
        {per && <span className="per"><span>アポ1件まで</span><b>{per}</b></span>}
        <button className="btn sm pri" disabled={!cnt} onClick={() => onCall(si, 0, sel)}>この{fmt(cnt)}件を続けてかける</button>
      </div>
      {reasons && (
        <div className="rf">
          <span className="lb">断りの理由</span>
          <div className="dd" ref={ddRef}>
            <button className={`dd-b ${sel.size ? 'on' : ''}`} type="button" onClick={() => setDd(v => !v)}>
              {sel.size === reasons.length && reasons.length ? 'すべて選択中' : sel.size ? `${sel.size}つ選択中` : 'すべて'} ▾
            </button>
            {dd && (
              <div className="dd-p">
                <div className="dd-t"><button type="button" onClick={() => setSel(new Set(reasons.map(x => x.reason)))}>全選択</button><span>・</span><button type="button" onClick={() => setSel(new Set())}>全解除</button></div>
                {['高', '中'].map(lv => (
                  <div key={lv}>
                    <div className="dd-g">{lv}</div>
                    {reasons.filter(x => x.lv === lv).map(x => (
                      <label key={x.reason} className="dd-i">
                        <input type="checkbox" checked={sel.has(x.reason)} onChange={e => setSel(prev => { const s = new Set(prev); if (e.target.checked) s.add(x.reason); else s.delete(x.reason); return s; })} />
                        <span>{x.reason}</span><span className="c">{x.n}</span>
                      </label>
                    ))}
                  </div>
                ))}
                <div className="dd-f"><span /><button type="button" onClick={() => setDd(false)}>閉じる</button></div>
              </div>
            )}
          </div>
          <span className="sel-sum">{selSum}</span>
        </div>
      )}
      <div className="rws">
        {visible.map((r, ri) => {
          const v = rowView(si, r, today, listsById);
          return (
            <div key={`${r.id}-${ri}`} className={`rw ${v.cl === 'today' ? 'today' : ''}`} onClick={() => onCall(si, rows.indexOf(r), sel)}>
              <span className={`tm ${v.cl === 'late' ? 'late' : v.cl === 'today' ? 'today' : ''}`}
                style={v.cl === 'hi' ? { color: 'var(--red)', fontSize: 11.5, fontFamily: 'var(--font)' } : v.cl === 'mid' ? { color: 'var(--amber)', fontSize: 11.5, fontFamily: 'var(--font)' } : undefined}>{v.tm}</span>
              <span className="cname">{r.company}<small>{v.sub}</small></span>
              <span className="li">{v.li}</span>
              <span className="st-tag"><i style={{ background: sec.col }} />{sec.t === '再アプローチ' ? sec.sub : sec.t}</span>
              <span className="r" />
              <span className="go">→</span>
            </div>
          );
        })}
      </div>
      {!cnt && <div className="more" style={{ color: 'var(--ink-3)' }}>いま該当する会社はありません</div>}
      {!open && shown.length > 7 && <div className="more" style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>残り{fmt(cnt - 7)}件を表示</div>}
    </div>
  );
}

/* ── リスト：クライアントの塊 ── */
function ListsPane({ L, live, grouped, search, onOpenList, onEditList }) {
  const [sortKey, setSortKey] = useState('x');
  const [sortDir, setSortDir] = useState(-1);
  const [fCat, setFCat] = useState('');
  const [fEng, setFEng] = useState('');
  const [closed, setClosed] = useState({});
  const [more, setMore] = useState({});
  const today = jstDate(new Date());
  const q = search.trim().toLowerCase();
  const base = L.filter(r => !q || [r.c, r.l, r.mg].some(s => String(s || '').toLowerCase().includes(q)));
  const cur = base.filter(r => (!fCat || r.cat === fCat) && (!fEng || r.e === fEng));
  const cc = {}; base.forEach(r => { cc[r.cat] = (cc[r.cat] || 0) + 1; });
  const cats = [...CATS.filter(c => cc[c]), ...Object.keys(cc).filter(c => c && !CATS.includes(c))];
  const ec = {}; base.filter(r => !fCat || r.cat === fCat).forEach(r => { ec[r.e] = (ec[r.e] || 0) + 1; });
  const engItems = [['', 'すべて', Object.values(ec).reduce((a, b) => a + b, 0)], ...Object.entries(ec).filter(([e]) => e).sort((a, b) => b[1] - a[1]).map(([e, n]) => [e, e, n])];
  const f = COLS.find(c => c[0] === sortKey)[2];
  const cmp = (a, b) => { const va = f(a), vb = f(b); if (va === vb) return 0; if (va === Infinity) return 1; if (vb === Infinity) return -1; return (typeof va === 'string' ? va.localeCompare(vb, 'ja') : va - vb) * sortDir; };
  const onHead = k => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(['l', 'per'].includes(k) ? 1 : -1); } };
  const head = (first) => (
    <thead><tr>
      {COLS.map(([k, h, , num, , cl]) => (
        <th key={k} className={`sortable ${num ? 'r' : ''} ${cl || ''} ${sortKey === k ? 'on' : ''}`} onClick={e => { e.stopPropagation(); onHead(k); }}>
          {k === 'l' ? first : h}<span className="ar">{sortKey === k ? (sortDir > 0 ? '▲' : '▼') : '↕'}</span>
        </th>
      ))}
      <th />
    </tr></thead>
  );
  const cols = <colgroup>{COLS.map(c => <col key={c[0]} style={c[4] ? { width: c[4] } : undefined} />)}<col style={{ width: 110 }} /></colgroup>;
  const row = (r, ri) => {
    const tot = Object.values(r.st).reduce((a, b) => a + b, 0) || 1, per = r.x > 0 ? r.n / r.x : null, isLive = live.has(r.id);
    return (
      <tr key={r.id} onClick={() => onOpenList(r.listId)}>
        <td><span className="ln">{grouped ? r.l : `${r.c}・${r.l}`}</span>{r.crd === today && <> <span className="newb">本日取り込み</span></>}{isLive && <> <span className="live" style={{ marginLeft: 6 }}><i /></span></>}</td>
        <td className="r n t3 l" style={{ color: 'var(--ink-2)' }}>{fmt(r.t)}</td>
        <td className="r t3" title={`元の${fmt(r.t)}社から 除外${fmt(r.ex)}社・アポ獲得済み${fmt(r.ap)}社などを除いた数`}>
          <span className="cnum"><b>{fmt(r.n)}</b><span className="rb"><i style={{ width: `${r.t ? (r.n / r.t) * 100 : 0}%` }} /></span><small>残り{r.t ? Math.round((r.n / r.t) * 100) : 0}%</small></span>
        </td>
        <td className="r t3 rr"><span className="xnum">{r.x.toFixed(1)}</span><small style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 2 }}>件</small></td>
        <td className="r"><span className={`exp ${per ? '' : 'dim'}`}><span className="bar"><i style={{ width: `${per ? Math.min(100, Math.max(3, (300 / per) * 100)) : 0}%`, animationDelay: `${ri * 30}ms` }} /></span><b>{perAppoLabel({ n: r.n, perAppo: per })}</b><span className="hot">{per && per <= 400 ? '濃い' : ''}</span></span></td>
        <td><Laps v={r.rd} p={r.rp} /></td>
        <td><div className="stk">{ORDER.filter(s => r.st[s]).map((s, k) => <i key={s} style={{ width: `${(r.st[s] / tot) * 100}%`, background: COL[s], animationDelay: `${ri * 30 + k * 20}ms` }} title={`${s} ${fmt(r.st[s])}社`} />)}</div></td>
        <td className="r n" style={r.a30 ? { color: 'var(--gold)', fontWeight: 700 } : { color: 'var(--ink-3)' }}>{r.a30 || 0}</td>
        <td className="r n" style={{ color: 'var(--ink-2)' }}>{md(r.cr)}</td>
        <td className="r n" style={{ color: 'var(--ink-2)' }}>{md(r.lc)}</td>
        <td className="r">
          {onEditList && <span className="rowact" style={{ marginRight: 8 }} onClick={e => { e.stopPropagation(); onEditList(r.listId); }}>編集</span>}
          <span className="rowact">詳細へ</span>
        </td>
      </tr>
    );
  };
  let body;
  if (!grouped) {
    const S = [...cur].sort(cmp);
    body = <div className="card grp"><div style={{ overflowX: 'auto' }}><table className="tbl lt">{cols}{head('クライアント・リスト名')}<tbody>{S.map(row)}</tbody></table></div></div>;
  } else {
    const G = {}; cur.forEach(r => { (G[r.c] ||= []).push(r); });
    const gs = Object.entries(G).map(([c, rs]) => {
      const g = { c, rs: [...rs].sort(cmp), e: rs[0].e, live: rs.filter(r => live.has(r.id)).length,
        t: rs.reduce((a, r) => a + r.t, 0), n: rs.reduce((a, r) => a + r.n, 0), x: rs.reduce((a, r) => a + r.x, 0), a30: rs.reduce((a, r) => a + (r.a30 || 0), 0) };
      // 塊どうしの並び：数は合計、率は塊全体、周回・日付は一番大きい行
      g.key = sortKey === 'l' ? c : ['t', 'n', 'x', 'a30'].includes(sortKey) ? g[sortKey] : sortKey === 'per' ? (g.x > 0 ? g.n / g.x : Infinity) : sortKey === 'st' ? Math.max(...rs.map(recallShare)) : rs.map(f).sort().slice(-1)[0];
      return g;
    });
    gs.sort((a, b) => { const va = a.key, vb = b.key; if (va === vb) return 0; if (va === Infinity) return 1; if (vb === Infinity) return -1; return (typeof va === 'string' ? va.localeCompare(vb, 'ja') : va - vb) * sortDir; });
    body = gs.map((g, gi) => {
      const isClosed = closed[g.c] ?? gi >= 3;
      // 今日取り込んだリストは、並べ替えに関係なくクライアントの一番上に出す
      const ordered = [...g.rs.filter(r => r.crd === today), ...g.rs.filter(r => r.crd !== today)];
      const showAll = more[g.c];
      return (
        <div key={g.c} className={`card grp ${isClosed ? 'closed' : ''}`}>
          <div className="grp-h" onClick={() => setClosed(s => ({ ...s, [g.c]: !isClosed }))}>
            <span className="ch">▼</span>
            <div className="nm">{g.c}<small>{g.e}</small>{g.live > 0 && <> <span className="live" style={{ marginLeft: 10 }}><i />架電中</span></>}</div>
            <div className="kv"><span className="lbl">リスト</span><b>{g.rs.length}</b></div>
            <div className="kv"><span className="lbl">元の社数</span><b style={{ color: 'var(--ink-2)' }}>{fmt(g.t)}</b></div>
            <div className="kv"><span className="lbl">架電可能</span><b>{fmt(g.n)}</b></div>
            <div className="kv x"><span className="lbl">見込みアポ</span><b>{g.x.toFixed(1)}</b></div>
            <div className="kv"><span className="lbl">アポ1件まで</span><b>{perAppoLabel({ n: g.n, perAppo: g.x > 0 ? g.n / g.x : null })}</b></div>
            <div className="kv"><span className="lbl">直近1か月のアポ</span><b className="g">{g.a30}</b></div>
          </div>
          <div className="grp-b"><div style={{ overflowX: 'auto' }}>
            <table className="tbl lt">{cols}{head('リスト名')}<tbody>
              {(showAll ? ordered : ordered.slice(0, 7)).map(row)}
              {!showAll && ordered.length > 7 && <tr className="more-row" onClick={() => setMore(s => ({ ...s, [g.c]: true }))}><td colSpan={11}>残り{ordered.length - 7}リストを表示</td></tr>}
            </tbody></table>
          </div></div>
        </div>
      );
    });
  }
  return (
    <>
      <div className="fl2">
        <div className="fl2-r"><span className="fl2-l">商材</span>
          <Seg id="cat" value={fCat} onChange={v => { setFCat(v); setFEng(''); }} items={[['', 'すべて', base.length], ...cats.map(c => [c, c, cc[c]])]} />
        </div>
        <div className="fl2-r"><span className="fl2-l">タイプ</span>
          <div className="chips">{engItems.map(([v, t, n]) => <button key={v || 'all'} className={`chip2 ${fEng === v ? 'on' : ''}`} onClick={() => setFEng(v)}>{t}<span className="c">{n}</span></button>)}</div>
          <span className="fsum"><b>{cur.length}</b>リスト・架電可能 <b>{fmt(cur.reduce((a, r) => a + r.n, 0))}</b>社・見込みアポ <b>{cur.reduce((a, r) => a + r.x, 0).toFixed(1)}</b>件</span>
        </div>
      </div>
      <div className="clh-lg"><span style={{ color: 'var(--ink-3)' }}>いまの状態：</span>{ORDER.slice(0, 7).map(s => <span key={s}><i style={{ background: COL[s] }} />{s}</span>)}</div>
      <div id="groups">{body}</div>
    </>
  );
}

export default function CallListHome({ lists, callListData, setCallFlowScreen, setSelectedList, onAddList, onEditList, userKey }) {
  const tabKey = `spanavi_calllist_tab:${userKey || ''}`;
  // 通知の「再コール一覧を開く」から来たときは、覚えているタブに関係なく「条件で探す」を開く
  const [tab, setTabState] = useState(() => {
    try {
      if (sessionStorage.getItem('spanavi_calllist_open_find')) { sessionStorage.removeItem('spanavi_calllist_open_find'); return 'find'; }
      return localStorage.getItem(tabKey) === 'lists' ? 'lists' : 'find';
    } catch { return 'find'; }
  });
  const setTab = v => { setTabState(v); try { localStorage.setItem(tabKey, v); } catch { /* 保存できなくても表示は続ける */ } };
  const [grouped, setGrouped] = useState(true);
  const [search, setSearch] = useState('');
  const [home, setHome] = useState(null);
  const [floor, setFloor] = useState(null);
  const [floorAt, setFloorAt] = useState('');
  const [finds, setFinds] = useState(null);
  const [rates, setRates] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [last, setLast] = useState(() => readLastCall());
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });

  useEffect(() => {
    fetchListHome({ fresh: true }).then(setHome);
    // 開いた直後は他の読み込みと重なって時間切れになることがあるので、失敗したら少し置いて取り直す
    let tries = 0;
    const loadFinds = () => supabase.rpc('call_find_sections', { p_limit: 200 }).then(({ data, error }) => {
      if (data && !error) {
        setFinds(data);
        // 押したらすぐ開けるよう、欄の全件を裏で取っておく（表示は上位だけ）
        supabase.rpc('call_find_sections', { p_limit: 5000 }).then(({ data: all, error: e2 }) => { if (all && !e2) setFinds(all); });
      }
      else if (++tries < 4) setTimeout(loadFinds, 1500 * tries);
      else setFinds({ n: {}, error: true });
    });
    loadFinds();
    fetchCallStatusRates().then(setRates);
  }, []);
  // 上段は1分ごとに取り直す
  useEffect(() => {
    let alive = true;
    const load = () => supabase.rpc('call_floor_today').then(({ data }) => {
      if (!alive) return;
      setFloor(data || null);
      setFloorAt(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }));
    });
    load(); const t = setInterval(load, 60000);
    const onFocus = () => setLast(readLastCall());
    addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(t); removeEventListener('focus', onFocus); };
  }, []);

  const listsById = useMemo(() => Object.fromEntries((lists || []).map(l => [l._supaId, l])), [lists]);
  const L = useMemo(() => {
    const H = Object.fromEntries((home || []).map(h => [h.list_id, h]));
    return (lists || []).filter(l => !l.is_archived && H[l._supaId]).map(l => {
      const h = H[l._supaId];
      return { id: l._supaId, listId: l.id, c: l.company, l: l.industry || '', e: l.engagementName || '', cat: l.productCategoryName || '', mg: l.manager,
        t: h.total, ex: h.excluded, ap: h.appo_done, n: h.callable, x: Number(h.expected) || 0, st: h.statuses || {}, a30: h.appo30,
        rd: h.lap, rp: h.next_pct, cr: h.created_at, crd: h.created_at ? jstDate(h.created_at) : '', lc: h.last_called };
    });
  }, [lists, home]);
  const live = useMemo(() => new Set((floor?.people || []).filter(p => Date.now() - new Date(p.last_at).getTime() <= CALLING_WINDOW_MIN * 60000).map(p => p.list_id)), [floor]);
  const totN = L.reduce((a, r) => a + r.n, 0), totX = L.reduce((a, r) => a + r.x, 0);
  const findTotal = finds ? Object.values(finds.n || {}).reduce((a, b) => a + Number(b || 0), 0) : null;
  const today = jstDate(new Date());

  // 欄の会社を架電ページで順に開く。上位200社より先が要るときは全件を取り直す
  const callSection = useCallback(async (si, idx, sel) => {
    let rows = finds?.[`s${si + 1}`] || [];
    const n = finds?.n?.[si + 1] ?? 0;
    if (rows.length < n) {
      const { data } = await supabase.rpc('call_find_sections', { p_limit: 5000 });
      if (data) { rows = data[`s${si + 1}`] || rows; }
    }
    const start = rows[idx];
    if (sel && sel.size) rows = rows.filter(r => (r.rs || []).some(x => sel.has(x)));
    const items = rows.map(r => ({ item_id: r.id, list_id: r.list_id, no: r.no, company: r.company }));
    const at = Math.max(0, start ? items.findIndex(x => x.item_id === start.id) : 0);
    const s = SECS[si];
    openQueue(items, at, { label: `条件で探す・${s.t === '再アプローチ' ? `再アプローチ（${s.sub}）` : s.t}`, noRecallWarn: si <= 1, noTodayWarn: true });
    // 確認の窓で架電を止めない（今日ほかの人がかけた印は架電ページ側に出る）（2026-10-09）
  }, [finds, openQueue]);

  const resume = () => { const l = readLastCall(); if (l) openQueue(l.items, l.idx, l.opts); };
  const lastCur = last ? last.items[last.idx] : null;

  return (
    <div className="clh">
      <div className="pt">
        <div><h1>架電リスト</h1><p>{L.length ? `${L.length}リスト・${new Set(L.map(r => r.c)).size}クライアント・かけられる ${fmt(totN)}社・見込みアポ ${totX.toFixed(0)}件` : '読み込み中'}</p></div>
        <div className="r">
          <button id="resume" className="btn sm resume" disabled={!last} onClick={resume}
            title={last ? `${last.opts?.label || ''} ${lastCur?.company || ''} の架電ページから再開`.trim() : 'まだ架電ページを開いていません'}>
            {last && lastCur?.no != null ? `前回の続きから（No.${lastCur.no}）` : '前回の続きから'}
          </button>
          <button className="btn sm" onClick={() => setRulesOpen(true)}>業種別ルール</button>
          {onAddList && <button className="btn sm pri" onClick={onAddList}>＋ リスト追加</button>}
        </div>
      </div>

      <Floor floor={floor} at={floorAt} />

      <div className="filters">
        <Seg id="tab" value={tab} onChange={setTab} items={[['find', '条件で探す', findTotal == null ? '…' : fmt(findTotal)], ['lists', 'リスト', L.length]]} />
        <span className="sp" />
        <input className="input search" placeholder="企業名・リスト名・担当者" value={search} onChange={e => setSearch(e.target.value)} style={{ visibility: tab === 'lists' ? 'visible' : 'hidden' }} />
        <div style={{ visibility: tab === 'lists' ? 'visible' : 'hidden' }}>
          <Seg id="sort" value={grouped ? 'client' : 'all'} onChange={v => setGrouped(v === 'client')} items={[['client', 'クライアント別'], ['all', 'すべてのリスト']]} />
        </div>
      </div>

      {tab === 'lists' && (
        <section className="pane on" id="p-lists">
          {home ? <ListsPane L={L} live={live} grouped={grouped} search={search} onOpenList={id => setSelectedList(id)} onEditList={onEditList} />
            : <div className="hint">読み込み中…</div>}
        </section>
      )}
      {tab === 'find' && (
        <section className="pane on" id="p-find">
          {finds?.error && <div className="hint" style={{ color: 'var(--red)' }}>読み込めませんでした。ページを開き直してください</div>}
          <div className="hint">リストをまたいで、条件に合う会社を集めています。上から順にかけると、アポになりやすい会社から当たれます。動いているリストに入っている会社だけ。各欄の「続けてかける」で、その欄の会社を架電ページで順に開きます。</div>
          <div id="finds">
            {finds ? SECS.map((s, si) => <FindSection key={si} si={si} sec={s} data={finds} today={today} listsById={listsById} rates={rates} onCall={callSection} />)
              : <div className="hint">読み込み中…</div>}
          </div>
        </section>
      )}
      <IndustryRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
