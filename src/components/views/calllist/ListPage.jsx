import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchCallStatusRates, rateOf, segmentOf, perAppoLabel } from '../../../utils/appoOutlook';
import { loadSort, saveSort, groupSorted, fetchPrefRates, jstParts } from '../../../utils/callOrder';
import { telFmt } from '../../../utils/telFormat';
import { useCallQueue, readLastCall } from '../smart-queue/useCallQueue';
import './ListPage.css';

// 一覧ページ（2026-10-09 むー様・見本 list.html をそのまま本番へ）
// 1つのリストの、まだかけられる会社。見え方（すべて・受付再コール・キーマン再コール・キーマン断り（高・中）・未架電）、
// 並び（業種・売上高・エリア＋昇順降順。人ごとに覚える）、他の人の今日分を後ろへ、不通の時間帯を後ろへ、前回の架電者で除外。
// 行を押すと、いま見えている並びのまま架電ページを順に開く
const DOT = { '不通': 'f', '受付ブロック': 'f', '受付再コール': 'r', 'キーマン再コール': 'r', 'キーマン不在': 'k', 'キーマン断り': 'x', 'アポ獲得': 'g' };
const TAG = { 'キーマン不在': 'blue', '受付ブロック': 'gray', '不通': 'gray', '受付再コール': 'amber', 'キーマン再コール': 'amber', 'キーマン断り': 'red' };
const CM = { 'キーマン不在': '#0176D3', '受付ブロック': '#8692A0', '不通': '#B9C3CF', 'キーマン断り': '#C8102E', '受付再コール': '#B7791F', 'キーマン再コール': '#C8A45A', '未架電': '#E6EAF0' };
const VIEWS = [
  ['all', 'すべて', '', () => true],
  ['rcp', '受付再コール', 'warn', r => r.st === '受付再コール'],
  ['kmr', 'キーマン再コール', 'warn', r => r.st === 'キーマン再コール'],
  ['hot', 'キーマン断り（高・中）', '', r => r.st === 'キーマン断り' && ['高', '中'].includes(r.ceo)],
  ['new', '未架電', '', r => r.st === '未架電'],
];
const EMPTY = { rcp: '受付再コールの会社はありません', kmr: 'キーマン再コールの会社はありません', hot: '社長の温度感が高・中のキーマン断りはまだありません', new: '未架電の会社はありません' };
const HINT = { ind: '業種別・売上高', rev: '売上高', area: 'アポ率の高い県' };
const NOBODY = '（まだかけていない）';
const oku = v => (Number(v || 0) / 100000).toFixed(1);
const mdShort = s => s.replace(/^0/, '').replace('/0', '/');

export default function ListPage({ list, onClose, setCallFlowScreen, callListData, userKey, me, myPhone }) {
  const listId = list?._supaId;
  const [items, setItems] = useState(null);
  const [rates, setRates] = useState(null);
  const [prefRates, setPrefRates] = useState({});
  const [bank, setBank] = useState(null);
  const [view, setView] = useState('all');
  const [sort, setSortState] = useState(() => loadSort(userKey));
  const [takenOn, setTakenOn] = useState(true);
  const [ngOn, setNgOn] = useState(true);
  const [exc, setExc] = useState(() => new Set());
  const [exOpen, setExOpen] = useState(false);
  const [curH, setCurH] = useState(() => new Date().getHours());
  const [toast, setToast] = useState('');
  const [bump, setBump] = useState(0);
  const [last, setLast] = useState(() => readLastCall());
  const exRef = useRef(null);
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const seg = segmentOf(list?.engagementSlug);

  useEffect(() => {
    if (!listId) return;
    setItems(null);
    supabase.rpc('list_page_items', { p_list_id: listId }).then(({ data }) => setItems(data || []));
    fetchCallStatusRates().then(setRates);
    fetchPrefRates().then(setPrefRates);
    supabase.rpc('call_floor_today').then(({ data }) => {
      const p = (data?.people || []).find(x => x.name === me);
      setBank(p ? Number(p.bank) : 0);
    });
  }, [listId, me]);
  // 時間帯が変わったら「不通の時間帯」を見直す
  useEffect(() => {
    const t = setInterval(() => {
      const h = new Date().getHours();
      setCurH(prev => {
        if (prev !== h && ngOn) { setToast(`${h}時台になったので、不通の時間帯の並びを見直しました`); setTimeout(() => setToast(''), 2600); }
        return h;
      });
    }, 60000);
    return () => clearInterval(t);
  }, [ngOn]);
  useEffect(() => {
    if (!exOpen) return undefined;
    const f = e => { if (!exRef.current?.contains(e.target)) setExOpen(false); };
    document.addEventListener('click', f); return () => document.removeEventListener('click', f);
  }, [exOpen]);
  useEffect(() => {
    const f = () => setLast(readLastCall());
    addEventListener('focus', f); const t = setInterval(f, 3000);
    return () => { removeEventListener('focus', f); clearInterval(t); };
  }, []);

  const today = jstParts(new Date().toISOString()).date;
  const R = useMemo(() => (items || []).map(x => {
    const h = x.h || [];
    const l = h[h.length - 1];
    const lp = l ? jstParts(l.at) : null;
    const late = x.rd && x.rd < today;
    const rcLabel = x.rd ? `${mdShort(x.rd.slice(5).replace('-', '/'))}${x.rt ? ` ${x.rt.slice(0, 5)}` : ''}` : '';
    const prm = x.rd ? [late ? 'late' : 'back', `${x.st === 'キーマン再コール' ? 'キーマン再コール' : '受付再コール'} ${rcLabel}`, late ? '期限切れ・かけ直していない' : (x.rd === today ? '今日' : '')] : null;
    return { ...x, dots: h.map(e => DOT[e.s] || 'f').join(''), d: lp ? mdShort(lp.md) : '—', g: l ? l.g : '', prm,
      lastH: lp ? lp.h : null, taken: l && lp.date === today && l.g !== me ? `${l.g} ${new Date(l.at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}` : '' };
  }), [items, today, me]);
  const ST = useMemo(() => { const o = {}; R.forEach(r => { o[r.st] = (o[r.st] || 0) + 1; }); return o; }, [R]);
  const CALLERS = useMemo(() => { const o = {}; R.forEach(r => { const k = r.g || NOBODY; o[k] = (o[k] || 0) + 1; }); return o; }, [R]);
  const names = useMemo(() => [me, ...Object.keys(CALLERS).filter(k => k !== me).sort((a, b) => CALLERS[b] - CALLERS[a])].filter(Boolean), [CALLERS, me]);
  const keep = r => !exc.has(r.g || NOBODY);
  const rateR = r => rateOf(rates, seg, r.st);
  const calc = f => { const rs = R.filter(r => f(r) && keep(r)); return [rs.length, rs.reduce((a, r) => a + rateR(r), 0)]; };
  const due = r => r.prm && (r.prm[0] === 'late' || r.prm[2] === '今日');
  const ngNow = r => r.st === '不通' && r.lastH != null && Math.abs(curH - r.lastH) <= 1;
  // 今日ほかの人がかけた会社・不通の時間帯の会社を、それぞれのまとまりの後ろへ
  const back = rs => {
    if (view !== 'all') rs = [...rs.filter(due), ...rs.filter(r => !due(r))];
    if (ngOn) rs = [...rs.filter(r => !ngNow(r)), ...rs.filter(ngNow)];
    return takenOn ? [...rs.filter(r => !r.taken), ...rs.filter(r => r.taken)] : rs;
  };
  const vf = VIEWS.find(v => v[0] === view)[3];
  const groups = useMemo(() => groupSorted(R.filter(r => vf(r) && keep(r)), sort, prefRates).map(g => ({ ...g, rows: back(g.rows) })),
    [R, view, exc, sort, prefRates, takenOn, ngOn, curH]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordered = groups.flatMap(g => g.rows);
  const [n, x] = calc(vf);
  useEffect(() => { setBump(b => b + 1); }, [view, exc]);

  const setSort = s => { setSortState(s); saveSort(userKey, s); };
  const label = `${list?.company || ''}・${list?.industry || ''}`;
  const openAt = (id) => {
    const rows = ordered.map(r => ({ item_id: r.id, list_id: listId, no: r.no, company: r.c }));
    const at = Math.max(0, rows.findIndex(r => r.item_id === id));
    openQueue(rows, at, { label, listPage: listId, noTodayWarn: true });
  };
  const lastCur = last ? last.items[last.idx] : null;
  const ds = r => [...r.dots].map((c, i) => <i key={i} className={{ f: '', k: 'k', x: 'x', r: 'r', g: 'g' }[c]} />);

  const row = (r, i) => {
    const rt = rateR(r);
    return (
      <tr key={r.id} className={`${r.prm ? (r.prm[0] === 'late' ? 'late' : 'soon') : ''} ${r.taken && takenOn ? 'taken' : ''} ${ngOn && ngNow(r) ? 'ngnow' : ''}`}
        style={{ animationDelay: `${Math.min(i, 30) * 0.015}s` }} onClick={() => openAt(r.id)}>
        <td className="r n" style={{ color: 'var(--ink-3)' }}>{r.no}</td>
        <td className="cname"><b>{r.c}</b><small>{r.b || '（事業内容の記載なし）'}</small></td>
        <td title={r.a}>{r.a}{sort.s === 'area' && <small className="pfr">アポ率 {((prefRates[r.pf] || 0) * 100).toFixed(2)}%</small>}</td>
        <td className="r"><span className="n">{oku(r.rv)}</span><small style={{ color: 'var(--ink-3)' }}>億</small></td>
        <td className="rep"><ruby>{r.rep}<rt>{r.k || ''}</rt></ruby></td>
        <td className="tel">{telFmt(r.tel)}</td>
        <td><span className="dots">{ds(r)}<span>{r.dots.length ? `${r.dots.length}回` : 'まだ'}</span></span></td>
        <td><span className="last"><span className={`tag ${TAG[r.st] || 'gray'}`}>{r.st}</span><small>{r.d} {r.g}{r.g && r.g === me ? '（自分）' : ''}{r.taken && takenOn ? <> ・ <span style={{ color: 'var(--red)' }}>今日 {r.taken}</span></> : null}</small></span></td>
        <td>{r.prm ? <span className={`prm ${r.prm[0] === 'late' ? 'late' : 'soon'}`}>{r.prm[1]}<small>{r.prm[2]}</small></span> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
        <td className="r"><span className={`nx1 ${rt < 0.0015 ? 'lo' : ''}`}><span className="b"><i style={{ width: `${Math.min(100, (rt / 0.008) * 100)}%` }} /></span><b>{(rt * 100).toFixed(2)}%</b></span></td>
      </tr>
    );
  };

  let ri = 0;
  return (
    <div className="lpg" data-listpage-open>
      <div className="bar">
        <button className="nav-b" onClick={onClose}>← 架電リストへ</button>
        <div className="where"><b>{list?.company} ・ {list?.industry}</b><span>{list?.productCategoryName} ・ {list?.engagementName} ・ かけられる {R.length.toLocaleString()}社</span></div>
        <div className="mini"><span className="st">{Object.entries(CM).map(([k, c], i) => <i key={k} style={{ flex: `${ST[k] || 0} 1 0`, minWidth: ST[k] ? 2 : 0, background: c, animationDelay: `${i * 0.04}s` }} />)}</span></div>
        <span className="sp" />
        <span className="bank">今日の貯金<span className="mt"><i style={{ width: `${Math.min(100, ((bank || 0) / 1) * 100)}%` }} /></span><b>{bank == null ? '—' : bank.toFixed(2)}</b>件分</span>
        {myPhone && <span className="mine">あなたの番号<b>{telFmt(myPhone)}</b></span>}
        <button className="startb ghost2" id="resume" disabled={!last} onClick={() => { const l = readLastCall(); if (l) openQueue(l.items, l.idx, l.opts); }}
          title={last ? `${last.opts?.label || ''} ${lastCur?.company || ''} の架電ページから再開`.trim() : 'まだ架電ページを開いていません'}>
          {lastCur?.no != null ? `前回の続きから（No.${lastCur.no}）` : '前回の続きから'}
        </button>
        <button className="startb" disabled={!ordered.length} onClick={() => ordered[0] && openAt(ordered[0].id)}>架電ページへ</button>
      </div>

      <main className="page">
        <div className="ctl">
          <div className="views">
            {VIEWS.map(([k, t, cl, f]) => {
              const [cn, cx] = calc(f);
              return (
                <button key={k} className={`v ${cl} ${view === k ? 'on' : ''}`} onClick={() => setView(view === k && k !== 'all' ? 'all' : k)}>
                  {t}<span className="c">{cn}</span><span className="pr">{perAppoLabel({ n: cn, perAppo: cx > 0 ? cn / cx : null }).replace('約', '')}</span>
                </button>
              );
            })}
          </div>
          <label className={`tg ${takenOn ? 'on' : ''}`} title="今日ほかの人がかけた会社を、並びの後ろに回す" onClick={e => { e.preventDefault(); setTakenOn(v => !v); }}><span className="sw"><i /></span>他の人の今日分を後ろへ</label>
          <label className={`tg ${ngOn ? 'on' : ''}`} title="前回「不通」だった会社のうち、前回と同じ時間帯か前後1時間の会社を後ろに回す。時間帯が変わると自動で並びを見直す" onClick={e => { e.preventDefault(); setNgOn(v => !v); }}><span className="sw"><i /></span>不通の時間帯を後ろへ</label>
          <div className="sorts">
            <span className="sl">並び</span>
            {[['ind', '業種'], ['rev', '売上高'], ['area', 'エリア']].map(([k, t]) => <button key={k} className={sort.s === k ? 'on' : ''} onClick={() => setSort({ ...sort, s: k })}>{t}</button>)}
            <button className="dir" title="昇順・降順を切り替え" onClick={() => setSort({ ...sort, d: !sort.d })}>{sort.d ? '降順 ▼' : '昇順 ▲'}</button>
          </div>
          <div className="exw" ref={exRef}>
            <button className={`exb ${exc.size ? 'on' : ''}`} onClick={() => setExOpen(v => !v)}>前回の架電者で除外<span>{exc.size ? `${exc.size}人` : ''}</span> ▾</button>
            <div className={`exm ${exOpen ? 'on' : ''}`}>
              <div className="exh"><span>前回かけた人</span><span><button onClick={() => setExc(new Set(names))}>全選択</button> ・ <button onClick={() => setExc(new Set())}>全解除</button></span></div>
              {names.map(k => (
                <label key={k}><input type="checkbox" checked={exc.has(k)} onChange={e => setExc(prev => { const s = new Set(prev); if (e.target.checked) s.add(k); else s.delete(k); return s; })} />{k}{k === me ? '（自分）' : ''}<small>{CALLERS[k] || 0}社</small></label>
              ))}
            </div>
          </div>
          <div className="out"><div className="l">いまの絞り込みで<br />アポ1件まで</div>
            <div key={bump} className="ov bump">{(() => { const l = perAppoLabel({ n, perAppo: x > 0 ? n / x : null }); return l.endsWith('件') ? <>{l.slice(0, -1)}<small>件</small></> : l; })()}</div>
            <div className="s">{n.toLocaleString()}社<br />見込み{x.toFixed(2)}件</div></div>
        </div>

        <div className="hint"><b>並び</b><span>{sort.s === 'area' ? (sort.d ? 'アポ率の高い県から' : 'アポ率の低い県から') : `${HINT[sort.s]}${sort.d ? 'の大きい順' : 'の小さい順'}`}</span>
          {exc.size > 0 && <span style={{ color: '#C8102E' }}>除外：{[...exc].map(k => (k === me ? `${k}（自分）` : k)).join('・')}</span>}</div>

        <div className="sheet">
          <table className="tbl click" id="tbl">
            <colgroup><col style={{ width: 56 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 80 }} /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /><col style={{ width: 130 }} /><col style={{ width: 190 }} /><col style={{ width: 110 }} /></colgroup>
            <thead><tr><th className="r">No.</th><th>会社</th><th>地域</th><th className="r">売上</th><th>代表者</th><th>電話番号</th><th>これまで</th><th>前回</th><th>次の約束</th><th className="r">次の1回</th></tr></thead>
            <tbody>
              {items == null && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>読み込み中…</td></tr>}
              {items != null && !ordered.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>{EMPTY[view] || '該当する会社はありません'}</td></tr>}
              {groups.map(g => [
                g.key != null && <tr key={`g-${g.key}`} className="group"><td colSpan={10}>{g.key}<span className="n">{g.rows.length}社</span></td></tr>,
                ...g.rows.map(r => row(r, ri++)),
              ])}
            </tbody>
          </table>
          <div className="foot">
            <div className="legend"><span><i style={{ background: '#C9D1DB' }} />不通・受付</span><span><i style={{ background: 'var(--royal)' }} />キーマン不在</span><span><i style={{ background: 'var(--amber)' }} />再コール</span><span><i style={{ background: 'var(--red)' }} />断り</span><span><i style={{ background: 'var(--gold)' }} />アポ</span></div>
            <span>{ordered.length.toLocaleString()} / {R.length.toLocaleString()}社（除外・アポ獲得済みを除く）</span>
          </div>
        </div>
      </main>
      <div className={`toast ${toast ? 'on' : ''}`}>{toast}</div>
    </div>
  );
}
