import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { fetchCallStatusRates, rateOf, segmentOf, perAppoLabel } from '../../../utils/appoOutlook';
import { loadSort, sortItems, fetchPrefRates, jstParts } from '../../../utils/callOrder';
import { useCallQueue, readLastCall } from '../smart-queue/useCallQueue';
import { fetchListHome } from './listHomeData';
import './ListDetailModal.css';

// リストの詳細モーダル（2026-10-09 むー様・見本 detail.html をそのまま本番へ）
// 上：アポ1件まで（状態を選ぶとその会社だけで計算し直す）・周回・直近1か月のアポ・除外済み・つながりやすい時間
// 中：前回の架電者で除外／いまの状態（行ごとに「この状態でかける」）→ 前回の続きから・一覧ページへ・架電ページへ
// 下：注意事項・最近かけた人
const COL = { '未架電': '#B9D7F3', 'キーマン再コール': '#032D60', '受付再コール': '#0176D3', 'キーマン不在': '#8692A0', '不通': '#C9D1DB', '受付ブロック': '#E8B4BC', 'キーマン断り': '#E2C68A', '問い合わせフォーム': '#EEF0F3' };
const ORDER = ['キーマン再コール', '受付再コール', 'キーマン断り', '未架電', '不通', 'キーマン不在', '受付ブロック', '問い合わせフォーム'];
const NOBODY = '（まだかけていない）';
const HRS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const pctLabel = r => (r > 0 ? perAppoLabel({ n: 1, perAppo: 1 / r }) : '実績0件');

// 注意事項の文を「① 見出し」と中身に分ける
function parseCautions(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^[①-⑳]/.test(t)) out.push({ dt: t, dd: [] });
    else if (out.length) out[out.length - 1].dd.push(t);
    else out.push({ dt: '', dd: [t] });
  }
  return out.filter(x => x.dd.length || x.dt);
}

export default function ListDetailModal({ list, onClose, setCallFlowScreen, callListData, userKey, me, onOpenListPage }) {
  const listId = list?._supaId;
  const [items, setItems] = useState(null);
  const [home, setHome] = useState(null);
  const [rates, setRates] = useState(null);
  const [prefRates, setPrefRates] = useState({});
  const [hours, setHours] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [exc, setExc] = useState(() => new Set());
  const [exOpen, setExOpen] = useState(false);
  const [allCallers, setAllCallers] = useState(false);
  const [bump, setBump] = useState(0);
  const exRef = useRef(null);
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  const seg = segmentOf(list?.engagementSlug);
  const last = readLastCall();
  const lastCur = last ? last.items[last.idx] : null;

  useEffect(() => {
    if (!listId) return;
    supabase.rpc('list_page_items', { p_list_id: listId }).then(({ data }) => setItems(data || []));
    fetchListHome().then(rows => setHome((rows || []).find(r => r.list_id === listId) || null));
    fetchCallStatusRates().then(setRates);
    fetchPrefRates().then(setPrefRates);
  }, [listId]);
  useEffect(() => {
    const f = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [onClose]);
  useEffect(() => {
    if (!exOpen) return undefined;
    const f = e => { if (!exRef.current?.contains(e.target)) setExOpen(false); };
    document.addEventListener('click', f); return () => document.removeEventListener('click', f);
  }, [exOpen]);

  const LIVE = useMemo(() => (items || []).map(x => { const h = x.h || []; return { ...x, g: h.length ? h[h.length - 1].g : NOBODY }; }), [items]);
  const topInd = useMemo(() => {
    const c = {}; LIVE.forEach(x => { c[x.ind] = (c[x.ind] || 0) + 1; });
    return Object.entries(c).filter(([k]) => k && k !== 'その他').sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }, [LIVE]);
  useEffect(() => {
    if (!topInd) return;
    supabase.from('industry_connect_rates').select('hour, calls, rate').eq('dow', 0).eq('grp', topInd)
      .then(({ data }) => setHours(Object.fromEntries((data || []).map(r => [r.hour, { calls: r.calls, v: Number(r.rate) * 100 }]))));
  }, [topInd]);

  const kept = LIVE.filter(x => !exc.has(x.g));
  const st = {}; kept.forEach(x => { st[x.st] = (st[x.st] || 0) + 1; });
  const mx = Math.max(1, ...Object.values(st));
  const ks = sel.size ? [...sel].filter(s => st[s]) : Object.keys(st);
  let n = 0, xv = 0; ks.forEach(s => { n += st[s]; xv += st[s] * rateOf(rates, seg, s); });
  useEffect(() => { setBump(b => b + 1); }, [sel, exc]);

  const CALLERS = {}; LIVE.forEach(x => { CALLERS[x.g] = (CALLERS[x.g] || 0) + 1; });
  const names = [me, ...Object.keys(CALLERS).filter(k => k !== me).sort((a, b) => CALLERS[b] - CALLERS[a])].filter(Boolean);

  // 最近かけた人（日付×人ごとに、かけたNo.の範囲）
  const recent = useMemo(() => {
    const m = {};
    (items || []).forEach(x => (x.h || []).forEach(e => {
      const d = jstParts(e.at).date; const k = `${d}|${e.g}`;
      (m[k] ||= { d, g: e.g, nos: [] }).nos.push(x.no);
    }));
    return Object.values(m).sort((a, b) => b.d.localeCompare(a.d) || b.nos.length - a.nos.length)
      .map(r => ({ ...r, lo: Math.min(...r.nos), hi: Math.max(...r.nos) }));
  }, [items]);

  const label = `${list?.company || ''}・${list?.industry || ''}`;
  const goCall = only => {
    const keys = only || (sel.size ? [...sel] : null);
    const it = kept.filter(x => !keys || keys.includes(x.st));
    const rows = sortItems(it, loadSort(userKey), prefRates).map(x => ({ item_id: x.id, list_id: listId, no: x.no, company: x.c }));
    if (!rows.length) return;
    onClose();
    openQueue(rows, 0, { label, listPage: listId, noTodayWarn: true });
  };

  const hrs = HRS.map(h => ({ h, ...(hours?.[h] || { calls: 0, v: 0 }) })).filter(x => x.calls >= 150);
  const best = [...hrs].sort((a, b) => b.v - a.v);
  const hmax = Math.max(1, ...hrs.map(x => x.v));
  const cr = list?.created_at || home?.created_at;
  const crd = cr ? jstParts(cr) : null;
  const isToday = crd && crd.date === jstParts(new Date().toISOString()).date;
  const cautions = parseCautions(list?.cautions);
  const big = perAppoLabel({ n, perAppo: xv > 0 ? n / xv : null });

  if (!list) return null;
  return createPortal(
    <div className="lpm">
      <div className="md-veil" onClick={onClose} />
      <div className="md" role="dialog">
        <div className="md-h">
          <div>
            <h2>{list.company}<small>{list.industry}</small></h2>
            <div className="tags">
              <span className="tag blue">{list.productCategoryName}・{list.engagementName}</span>
              {home && <span className="tag">{home.lap}周・{home.lap + 1}周目 {home.next_pct}%</span>}
              {isToday && <span className="tag">本日取り込み</span>}
              {home && <span className="tag">直近1か月のアポ {home.appo30}件</span>}
              <span className="tag">かけられる人：{list.callerNames?.length ? list.callerNames.join('・') : '全員'}</span>
            </div>
          </div>
          <button className="x" aria-label="閉じる" onClick={onClose}>✕</button>
        </div>
        <div className="md-b">
          <div className="hero">
            <div className="big">
              <div className="l">アポ1件まで</div>
              <div key={bump} className="v bump">{big.endsWith('件') ? <>{big.slice(0, -1)}<small>件</small></> : big}</div>
              <div className="s">{sel.size ? '選んだ状態の' : 'かけられる'} <b>{n.toLocaleString()}</b>社に1回ずつかけて、見込みアポ <b>{xv.toFixed(1)}</b>件</div>
              <div className="who">下の状態を選ぶと、その会社だけで計算し直します</div>
            </div>
            <div className="mini">
              <div className="box"><div className="v n">{home?.lap ?? '—'}<small>周</small></div><div className="s">いまの周回（9割の会社にかけ終えた回数）・{(home?.lap ?? 0) + 1}周目は{home?.next_pct ?? 0}%</div></div>
              <div className="box"><div className="v n">{home?.appo30 ?? '—'}<small>件</small></div><div className="s">直近1か月のアポ（{list.industry}）</div></div>
              <div className="box"><div className="v n">{home?.excluded ?? '—'}<small>社</small></div><div className="s">除外済み</div></div>
              <div className="box" style={{ gridColumn: 'span 3', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="t-label">つながりやすい時間（{topInd || '業種'}・これまでの全架電のキーマン接続率）</div>
                  <div className="hours">
                    {HRS.map((h, i) => { const v = hours?.[h]; const ok = v && v.calls >= 150; return (
                      <div key={h}><i className={best[0]?.h === h ? 'top' : ''} style={{ height: ok ? (v.v / hmax) * 56 : 2, animationDelay: `${i * 30}ms`, opacity: ok ? 1 : 0.4 }} title={ok ? `${h}時台 ${v.v.toFixed(1)}%` : `${h}時台 架電が少ないため出していません`} />{h}</div>
                    ); })}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', width: 180, lineHeight: 1.7 }}>
                  {best.length ? <>{best[0].h}時台が一番つながる（{best[0].v.toFixed(1)}%）。{best.length > 2 ? `次は${best[1].h}時台・${best[2].h}時台` : ''}</> : '実績がまだ少ないため出していません'}
                </div>
              </div>
            </div>
          </div>

          <div className="stt">
            <div className="exrow" style={{ padding: '10px 14px 0' }}>
              <span className="exl">前回の架電者で除外</span>
              <div className="exw" ref={exRef}>
                <button className={`exb ${exc.size ? 'on' : ''}`} onClick={() => setExOpen(v => !v)}>選ぶ{exc.size ? `（${exc.size}人）` : ''} ▾</button>
                <div className={`exm ${exOpen ? 'on' : ''}`}>
                  <div className="exh"><span>前回かけた人</span><span><button onClick={() => setExc(new Set(names))}>全選択</button> ・ <button onClick={() => setExc(new Set())}>全解除</button></span></div>
                  {names.map(k => <label key={k}><input type="checkbox" checked={exc.has(k)} onChange={e => setExc(p => { const s = new Set(p); if (e.target.checked) s.add(k); else s.delete(k); return s; })} />{k}{k === me ? '（自分）' : ''}<small>{CALLERS[k] || 0}社</small></label>)}
                </div>
              </div>
              <span className="exs">{exc.size ? <b style={{ color: '#C8102E' }}>{[...exc].map(k => (k === me ? `${k}（自分）` : k)).join('・')} が前回かけた会社を外しています</b> : '自分を含め、前回かけた人で会社を外せます。外した会社は数字にも「続けてかける」にも入りません'}</span>
            </div>
            <div className="stt-h"><b>いまの状態</b><span>行を押して選ぶ（いくつでも）・行の右の「この状態でかける」でその状態だけ・率はこれまでの全記録</span></div>
            <div id="sr">
              {items == null && <div className="sr" style={{ cursor: 'default', color: 'var(--ink-3)' }}><span /><span>読み込み中…</span></div>}
              {ORDER.filter(s => st[s]).map(s => {
                const r = rateOf(rates, seg, s);
                return (
                  <div key={s} className={`sr ${r ? '' : 'dead'} ${sel.has(s) ? 'on' : ''}`} onClick={() => setSel(p => { const x = new Set(p); if (x.has(s)) x.delete(s); else x.add(s); return x; })}>
                    <span className="ck" /><span className="nm"><i style={{ background: COL[s] }} />{s}</span>
                    <span className="bar"><i style={{ width: `${(st[s] / mx) * 100}%`, background: COL[s] }} /></span>
                    <span className="r x2">{st[s].toLocaleString()}社</span><span className="r">{(r * 100).toFixed(2)}%</span><span className="pp">{pctLabel(r)}</span>
                    <button className="go1" onClick={e => { e.stopPropagation(); goCall([s]); }}>この状態でかける</button>
                  </div>
                );
              })}
            </div>
            <div className="go-row">
              <span className="sel">{sel.size ? [...sel].join('・') : 'すべての状態'}・<b>{n.toLocaleString()}</b>社</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sm" id="resume" disabled={!last} onClick={() => { const l = readLastCall(); if (l) { onClose(); openQueue(l.items, l.idx, l.opts); } }}
                  title={last ? `${last.opts?.label || ''} ${lastCur?.company || ''} の架電ページから再開`.trim() : 'まだ架電ページを開いていません'}>
                  {lastCur?.no != null ? `前回の続きから（No.${lastCur.no}）` : '前回の続きから'}
                </button>
                <button className="btn sm" onClick={() => { onClose(); onOpenListPage?.(list); }}>一覧ページへ</button>
                <button className="btn sm pri" disabled={!n} onClick={() => goCall()}>架電ページへ</button>
              </div>
            </div>
          </div>

          <div className="two">
            <div className="box"><h4>注意事項<span>{crd ? `${crd.md.replace(/^0/, '').replace('/0', '/')} 取り込み` : ''}</span></h4>
              {cautions.length ? <dl className="ct">{cautions.map((c, i) => [c.dt && <dt key={`t${i}`}>{c.dt}</dt>, <dd key={`d${i}`}>{c.dd.join(' ／ ')}</dd>])}</dl>
                : <div className="ct" style={{ color: 'var(--ink-3)' }}>注意事項はまだありません</div>}
            </div>
            <div className="box"><h4>最近かけた人{recent.length > 3 && <span style={{ cursor: 'pointer' }} onClick={() => setAllCallers(v => !v)}>{allCallers ? '閉じる' : `すべて見る（${recent.length}件）`}</span>}</h4>
              {(allCallers ? recent : recent.slice(0, 3)).map(r => (
                <div key={`${r.d}|${r.g}`} className="hr"><span className="d">{r.d.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/')}</span><span>{r.g}</span><span style={{ color: 'var(--ink-2)' }}>No.{r.lo}〜{r.hi}・{r.nos.length}社</span></div>
              ))}
              {!recent.length && <div className="ct" style={{ color: 'var(--ink-3)' }}>{items == null ? '読み込み中…' : 'まだ誰もかけていません'}</div>}
            </div>
          </div>
        </div>
        <div className="md-f"><span className="sp" /><button className="btn sm" onClick={onClose}>閉じる</button></div>
      </div>
    </div>,
    document.body,
  );
}
