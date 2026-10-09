import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';
import { invokeGetZoomRecording } from '../../lib/supabaseWrite';
import InlineAudioPlayer from '../common/InlineAudioPlayer';

import { telFmt } from '../../utils/telFormat';
import { dialPhone } from '../../utils/phone';
import './IncomingCalls.css';
import './calllist/CallListHome.css';
import { useUrlState } from '../../hooks/useUrlState';
import { useCallQueue } from './smart-queue/useCallQueue';

// リスト表示ラベル: call_lists.nameがclientName含む場合はlistNameのみ
const listLabel = (m) => {
  if (!m.clientName) return m.listName || '';
  if (m.listName.startsWith(m.clientName)) return m.listName;
  return m.listName ? `${m.clientName} – ${m.listName}` : m.clientName;
};

const normalizePhone = (n) => {
  if (!n) return '';
  const digits = n.replace(/\D/g, '');
  if (digits.startsWith('81')) return '0' + digits.slice(2);
  return digits;
};

export default function IncomingCallsView({ setCallFlowScreen, callListData = [] }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // URL クエリキーは画面間衝突を避けるため inc_ プレフィックス必須
  // (CRM の ?status=面談予定 を そのまま読むと着信対応が全件除外になる事故防止)
  const [statusFilter, setStatusFilter] = useUrlState('inc_status', '未対応');
  const [calleeFilter, setCalleeFilter] = useUrlState('inc_to', 'all');
  const [lastRaw, setLastRaw] = useUrlState('inc_last', '');
  const lastSel = new Set(String(lastRaw || '').split(',').filter(Boolean));
  const setLastSel = (set) => setLastRaw([...set].join(','));
  const [lastDd, setLastDd] = useState(false);
  const lastDdRef = useRef(null);
  useEffect(() => {
    if (!lastDd) return undefined;
    const f = e => { if (!lastDdRef.current?.contains(e.target)) setLastDd(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [lastDd]);
  const { openQueue } = useCallQueue({ setCallFlowScreen, callListData });
  // リスト選択モーダル: null | [{ itemId, company, listId, listName, clientName }]
  const [selectModal, setSelectModal] = useState(null);
  // 未紐づけ手動リンク: { callId, callerNumber } | null
  const [linkModal, setLinkModal] = useState(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  // 録音再生表示中の行ID
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const [loadError, setLoadError] = useState(false);
  // 録音自動取得を 1 行 1 回に制限するための refs
  const _autoFetchedRef = useRef(new Set());

  // 着信ボード（incoming_board）：着信ごとに、番号で照らした会社・前回の架電・約束・社長の温度感と、
  // 会社が分からない番号の候補（受けた人が直前7日にかけた会社）が付いて返る（2026-10-09）
  const load = async () => {
    setLoading(true);
    setLoadError(false);
    // 直接このページを開いたときは、ログインの読み込みが済む前に呼ぶと空で返るため、先にログインを確かめる。失敗したら1回だけやり直す
    await supabase.auth.getSession();
    let { data, error } = await supabase.rpc('incoming_board', { p_days: 45 });
    if (error || !Array.isArray(data) || !data.length) {
      await new Promise(r => setTimeout(r, 1200));
      ({ data, error } = await supabase.rpc('incoming_board', { p_days: 45 }));
    }
    if (error) { console.warn('[IncomingCalls] incoming_board error:', error); setLoadError(true); }
    setRecords(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  // 録音：Zoom から終わりの知らせが届かないため、通話時間を待たずに取りに行く。
  // 誰かが出た着信で、着信から2分以上たったものを、新しい順に20件まで（1件1回）
  const autoFetchRecording = async (row) => {
    if (!row?.id || row.rec || _autoFetchedRef.current.has(row.id)) return;
    if (!row.zid || !row.raw) return;
    if (Date.now() - new Date(row.at).getTime() < 2 * 60 * 1000) return;
    _autoFetchedRef.current.add(row.id);
    try {
      const { data } = await invokeGetZoomRecording({ zoom_user_id: row.zid, callee_phone: row.raw, called_at: row.at });
      const url = data?.recording_url;
      if (url) {
        await supabase.from('incoming_calls').update({ recording_url: url }).eq('id', row.id);
        setRecords(prev => prev.map(r => r.id === row.id ? { ...r, rec: url } : r));
      }
    } catch (e) {
      console.warn('[IncomingCalls] auto-fetch recording error:', e);
    }
  };

  useEffect(() => {
    if (!records.length) return;
    records.filter(r => r.zid && !r.rec).slice(0, 20).forEach(autoFetchRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);
  // 会社名から「（株）」「(株)」「株式会社」「(有)」「（有）」「有限会社」等の法人接頭辞を除去
  // 検索精度を上げるためのヘルパー。
  const stripCompanyPrefix = (s) => {
    if (!s) return '';
    return s
      .replace(/^\s*(（株）|\(株\)|㈱|株式会社|（有）|\(有\)|㈲|有限会社|（合）|\(合\)|合同会社|合資会社|合名会社|一般社団法人|公益社団法人|医療法人|学校法人|社会福祉法人|宗教法人|特定非営利活動法人|NPO法人)\s*/u, '')
      .replace(/\s*(株式会社|（株）|\(株\)|㈱)\s*$/u, '')
      .trim();
  };

  // 既存の高速検索 RPC（trigram index 利用、SECURITY DEFINER で RLS バイパス）を使う。
  // 直接 PostgREST .or().ilike() だと 500K 件の call_list_items に対し
  // RLS との複合で planner が trigram を使えず Seq Scan で 5〜10 秒かかる。
  // RPC 経由なら 30ms 程度。
  const _searchSeqRef = useRef(0);
  const searchCompanies = async (q) => {
    setLinkQuery(q);
    const trimmed = (q || '').trim();
    if (!trimmed) { setLinkResults([]); return; }
    const seq = ++_searchSeqRef.current;
    setLinkSearching(true);

    const runRpc = async (kw) => {
      const { data, error } = await supabase.rpc('search_call_list_items', {
        p_keyword: kw,
        p_search_field: 'all',
        p_status_filter: 'all',
        p_offset: 0,
        p_limit: 20,
      });
      if (error) console.warn('[IncomingCalls] search_call_list_items error:', error.message);
      return data || [];
    };

    let rows = await runRpc(trimmed);
    if (rows.length === 0) {
      const core = stripCompanyPrefix(trimmed);
      if (core && core !== trimmed) rows = await runRpc(core);
    }

    // 古い検索結果が後から到着しても上書きしない（debounce 代わり）
    if (seq !== _searchSeqRef.current) return;

    // RPC は list_id しか返さないので、ヒットした行の call_lists / clients 情報を一括取得
    const listIds = [...new Set(rows.map(r => r.list_id).filter(Boolean))];
    let listMap = {};
    if (listIds.length > 0) {
      const { data: lists } = await supabase
        .from('call_lists')
        .select('id, name, clients(name)')
        .in('id', listIds);
      (lists || []).forEach(l => { listMap[l.id] = l; });
    }
    const enriched = rows.map(r => ({
      ...r,
      call_lists: listMap[r.list_id] || null,
    }));

    if (seq !== _searchSeqRef.current) return;
    setLinkResults(enriched);
    setLinkSearching(false);
  };

  // Phase C: 手動リンク時に keyman_mobile を自動学習（同じ番号からの次回着信は自動紐づけ）
  // 会社に紐づける：着信に会社を付け、キーマン携帯が空ならその番号を覚えさせる（次からは自動で照らせる）。
  // target を渡すと候補の札から直接紐づける（検索の窓を開かない）
  const applyLink = async (item, target = linkModal) => {
    if (!target) return;
    const ids = target.callIds || [target.callId];
    await supabase.from('incoming_calls').update({ item_id: item.id, company_name: item.company || null }).in('id', ids);
    if (target.callerNumber) {
      const normalized = normalizePhone(target.callerNumber) || target.callerNumber;
      const { data: current } = await supabase.from('call_list_items').select('keyman_mobile').eq('id', item.id).single();
      if (!(current?.keyman_mobile || '').trim()) {
        await supabase.from('call_list_items').update({ keyman_mobile: normalized }).eq('id', item.id);
      }
    }
    setLinkModal(null);
    setLinkQuery('');
    setLinkResults([]);
    load();
  };

  useEffect(() => { load(); }, []);

  const markHandled = async (ids) => {
    const at = new Date().toISOString();
    await supabase.from('incoming_calls').update({ status: '対応済み', handled_at: at }).in('id', ids);
    setRecords(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: '対応済み', handled_at: at } : r));
  };

  const navigateTo = (match) => {
    if (!setCallFlowScreen) return;
    const full = callListData.find(l => l._supaId === match.listId);
    setCallFlowScreen({
      list: full || { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
      singleItemMode: true,
    });
    setSelectModal(null);
  };

  // 着信から「アポ取得」：架電ページをその会社で開き、アポ報告の窓を出す（録音と着信番号も渡す）
  const openAppoFromIncoming = (g, match) => {
    if (!setCallFlowScreen || !match) return;
    const fullL = callListData.find(l => l._supaId === match.listId);
    setCallFlowScreen({
      list: fullL || { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
      singleItemMode: true,
      initialRecordingUrl: g.rec || '',
      initialDialedPhone: g.raw || '',
      autoOpenAppoModal: true,
    });
  };

  // ── 着信対応（2026-10-09 むー様：架電リストと同じ部品・言葉づかいで、着信からアポにつなげるつくり） ──
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const md = iso => new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' });
  const hm = iso => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  const when = iso => (dayOf(iso) === today ? `今日 ${hm(iso)}` : `${md(iso)} ${hm(iso)}`);
  const first = s => String(s || '').split(/[\s　]/)[0];
  const ago = iso => {
    const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m}分前`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
    return `${Math.floor(m / 1440)}日前`;
  };

  // 同じ番号の着信は1つにまとめる（何度もかけてくる＝つながりたい合図）
  const groups = (() => {
    const by = new Map();
    for (const r of records) {
      const key = r.n && r.raw !== 'anonymous' ? `${r.n}|${r.status === '対応済み' ? 'd' : 'o'}` : r.id;
      if (!by.has(key)) by.set(key, { key, rows: [] });
      by.get(key).rows.push(r);
    }
    return [...by.values()].map(g => {
      const r0 = g.rows[0];
      const open = r0.status !== '対応済み';
      const matches = (r0.matches || []).map(m => ({ ...m, itemId: m.item_id, listId: m.list_id, listName: m.list_name || '', clientName: m.client || '' }));
      const m = matches[0];
      const l = m?.last;
      const reasons = [];
      let promise = null;
      let score = 0;
      if (m) {
        score += 30;
        if (l?.rd) {
          const due = l.rd <= today;
          const [, mo, d] = l.rd.split('-');
          promise = { t: `${Number(mo)}/${Number(d)}${l.rt ? ` ${l.rt.slice(0, 5)}` : ''}にこちらからかけ直す約束`, due };
          reasons.push({ t: '約束あり', c: due ? 'red' : 'amber' });
          score += due ? 45 : 30;
        }
        if (l?.cb) { reasons.push({ t: '折り返しの話あり', c: 'red' }); score += 35; }
        if (l?.s === 'キーマン再コール') { reasons.push({ t: '社長と話した会社', c: 'green' }); score += 25; }
        else if (l?.s === 'キーマン不在') { reasons.push({ t: '前回は社長不在', c: 'blue' }); score += 20; }
        else if (l?.s === '受付再コール') { reasons.push({ t: '受付で再コール', c: 'blue' }); score += 15; }
        else if (l?.s === 'アポ獲得') { reasons.push({ t: 'アポ済みの会社', c: 'green' }); score += 20; }
        else if (l?.s === 'キーマン断り') { reasons.push({ t: '前回お断り', c: 'gray' }); score -= 10; }
        if (m.ceo === '高') { reasons.push({ t: '温度感 高', c: 'red' }); score += 25; }
        else if (m.ceo === '中') { reasons.push({ t: '温度感 中', c: 'amber' }); score += 10; }
      } else if (r0.cands?.length) score += 10;
      if (g.rows.length > 1) { reasons.unshift({ t: `${g.rows.length}回着信`, c: 'red' }); score += 10 + g.rows.length * 5; }
      const hrs = (now - new Date(r0.at).getTime()) / 3600000;
      score += dayOf(r0.at) === today ? 20 : Math.max(-30, 14 - hrs / 12); // 日がたつほど下げる（2週間で約-14）
      const recRow = g.rows.find(x => x.rec);
      return {
        ...g, open, id: r0.id, ids: g.rows.map(x => x.id), at: r0.at, firstAt: g.rows[g.rows.length - 1].at,
        n: r0.n, raw: r0.raw, callees: [...new Set(g.rows.map(x => x.callee).filter(Boolean))],
        missed: g.rows.every(x => !x.zid), rec: recRow?.rec || null, recId: recRow?.id,
        matches, m, l, promise, cands: r0.cands || [], name: m?.company || r0.company_name || '', reasons, score,
        handledBy: r0.handled_by, handledAt: r0.handled_at,
      };
    });
  })();

  const callees = [...new Set(records.map(r => r.callee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  // 前回のステータスでの絞り込み（会社が分からない番号・まだかけていない会社も選べる）
  const lastOf = g => (!g.m ? '会社が分からない' : g.l?.s || 'まだかけていない');
  const LAST_ORDER = ['アポ獲得', 'キーマン再コール', 'キーマン不在', '受付再コール', '受付ブロック', 'キーマン断り', '不通', '除外', 'まだかけていない', '会社が分からない'];
  const lastOpts = [...new Set(groups.map(lastOf))].sort((a, b) => (LAST_ORDER.indexOf(a) + 99 * (LAST_ORDER.indexOf(a) < 0)) - (LAST_ORDER.indexOf(b) + 99 * (LAST_ORDER.indexOf(b) < 0)));
  const byWho = g => (calleeFilter === 'all' || g.callees.includes(calleeFilter)) && (!lastSel.size || lastSel.has(lastOf(g)));
  const openGroups = groups.filter(g => g.open && byWho(g)).sort((a, b) => b.score - a.score);
  const doneGroups = groups.filter(g => !g.open && byWho(g)).sort((a, b) => String(b.handledAt || b.at).localeCompare(String(a.handledAt || a.at)));
  const queueable = openGroups.filter(g => g.m);
  const nHot = openGroups.filter(g => g.reasons.some(x => x.c === 'red' || x.c === 'green')).length;
  const nUnknown = openGroups.filter(g => !g.m).length;
  const todayRecs = records.filter(r => dayOf(r.at) === today);
  const medianMin = (() => {
    const xs = groups.filter(g => !g.open && g.handledAt).map(g => (new Date(g.handledAt) - new Date(g.firstAt)) / 60000).filter(x => x >= 0).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  })();
  const fmtMin = x => (x == null ? '—' : x < 60 ? `${Math.round(x)}分` : x < 1440 ? `${(x / 60).toFixed(1)}時間` : `${(x / 1440).toFixed(1)}日`);
  const openByCallee = callees.map(c => [c, groups.filter(g => g.open && g.callees.includes(c)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);

  // 折り返す：アポに近い順のまま架電ページで順に開く。各社に着信の時刻・宛先を添え、架電ページの上に出す
  const callback = (g) => {
    const items = queueable.map(x => ({ item_id: x.m.itemId, list_id: x.m.listId, company: x.m.company, inc: { at: x.at, cnt: x.rows.length, who: x.callees.map(first).join('・') } }));
    const at = g ? Math.max(0, items.findIndex(x => x.item_id === g.m.itemId)) : 0;
    openQueue(items, at, { label: '着信の折り返し', noRecallWarn: true, noTodayWarn: true });
  };

  const PhoneIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>;
  // 前回の会話の一言：社長の発言 → メモ → 断りの理由 → 書き起こしの「折り返」の行
  const talkOf = l => {
    if (l.q) return l.q;
    if (l.nt) return l.nt;
    if (l.rr) return l.rr;
    if (l.cbs) { const line = String(l.cbs).split(/\r?\n/).find(x => x.includes('折り返')) || ''; return line.replace(/^[\d:\]\s]+/, '').trim(); }
    return '';
  };
  const tagOf = s => ({ 'キーマン不在': 'blue', '受付再コール': 'blue', 'キーマン再コール': 'amber', 'キーマン断り': 'gray', 'アポ獲得': 'green' }[s] || 'gray');
  const showOpen = statusFilter !== '対応済み';
  const showDone = statusFilter !== '未対応';

  // 1件のカード。右端の操作は「折り返す・アポ取得・対応済」をいつも同じ位置に置く（使えないときも場所は空けておく）
  const card = (g, i) => {
    const canDial = g.raw && g.raw !== 'anonymous';
    return (
      <div key={g.key} className={`icard ${g.m ? '' : 'unk'}`}>
        <span className="rk">{i + 1}</span>
        <div className="main">
          {g.m ? (
            <div className="nm"><b className="lk" onClick={() => (g.matches.length > 1 ? setSelectModal(g.matches) : navigateTo(g.m))}>{g.name}</b>
              <small>{g.m.client ? `${g.m.client} ・ ` : ''}{g.m.list_ind || ''}{g.matches.length > 1 ? ` ほか${g.matches.length - 1}件` : ''}</small></div>
          ) : (
            <div className="nm"><b className="unk-t">{g.name || '会社が分からない番号'}</b><small>{g.name ? '紐づけ済み・リストには見当たらない' : 'どのリストの番号とも一致しない'}</small></div>
          )}
          {g.reasons.length > 0 && <div className="rs">{g.reasons.map(x => <span key={x.t} className={`tag ${x.c}`}>{x.t}</span>)}</div>}
          {g.m && (
            <>
              {(g.promise || g.l?.cb) && (
                <div className={`promise ${g.promise?.due || g.l?.cb ? 'due' : ''}`}>
                  <b>約束</b>
                  <span>{g.promise ? g.promise.t : '前回の電話で折り返しの話が出ている'}</span>
                </div>
              )}
              <div className="lastl">{g.l ? <>前回<span className={`tag ${tagOf(g.l.s)}`}>{g.l.s}</span><span>{md(g.l.at)} {first(g.l.g)}</span></> : <span>まだ架電していない会社</span>}</div>
              {g.l && talkOf(g.l) && <div className="talk">「{talkOf(g.l)}」</div>}
            </>
          )}
        </div>
        <div className="inc-at">
          <b className="n">{when(g.at)}</b>
          {g.callees.length ? <span className="to">{g.callees.map(first).join('・')}あて</span> : <span className="to na">あて先不明</span>}
          <small>{ago(g.at)} ・ {g.missed ? <span className="miss">出られなかった</span> : '誰かが出た'}{g.rows.length > 1 ? ` ・ 初回 ${when(g.firstAt)}` : ''}</small>
        </div>
        <div className="tel">
          <span className="n">{telFmt(g.n) || g.raw || '—'}</span>
          {activeRecordingId === g.recId && g.rec ? <InlineAudioPlayer url={g.rec} onClose={() => setActiveRecordingId(null)} />
            : g.rec ? <button className="lnk" onClick={() => setActiveRecordingId(g.recId)}>▶ 録音を聞く</button> : <small>録音なし</small>}
        </div>
        <div className="acts">
          {g.m
            ? <button className="btn sm pri cb" onClick={() => callback(g)}><PhoneIcon />折り返す</button>
            : <button className="btn sm cb" disabled={!canDial} onClick={() => canDial && dialPhone(g.n)}><PhoneIcon />電話する</button>}
          <button className="btn sm" style={g.m ? undefined : { visibility: 'hidden' }} onClick={() => g.m && openAppoFromIncoming(g, g.m)}>アポ取得</button>
          <button className="btn sm" onClick={() => markHandled(g.ids)}>対応済</button>
        </div>
        {!g.m && (
          <div className="cands">
            <span className="ch">{g.cands.length ? `${first(g.callees[0])}さんが直前にかけた会社` : '直前にかけた会社の候補なし'}</span>
            {g.cands.map(c => (
              <button key={c.item_id} className="cand" title="この会社に紐づける" onClick={() => applyLink({ id: c.item_id, company: c.company }, { callIds: g.ids, callerNumber: g.raw })}>
                {c.company}<small>{md(c.at)} {c.s}</small>
              </button>
            ))}
            <button className="lnk" onClick={() => { setLinkModal({ callIds: g.ids, callId: g.id, callerNumber: g.raw }); setLinkQuery(''); setLinkResults([]); }}>検索して紐づける</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="clh inc2" style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="pt">
        <div><h1>着信対応</h1><p>折り返しはアポにいちばん近い電話。アポに近い順に並べています</p></div>
        <div className="r">
          <select className="input" value={calleeFilter} onChange={e => setCalleeFilter(e.target.value)} title="着信を受けた人で絞る">
            <option value="all">全員</option>
            {callees.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="dd" ref={lastDdRef}>
            <button className={`dd-b ${lastSel.size ? 'on' : ''}`} type="button" onClick={() => setLastDd(v => !v)}>
              前回のステータス：{!lastSel.size ? 'すべて' : lastSel.size === 1 ? [...lastSel][0] : `${lastSel.size}つ選択中`} ▾
            </button>
            {lastDd && (
              <div className="dd-p">
                <div className="dd-t"><button type="button" onClick={() => setLastSel(new Set(lastOpts))}>全選択</button><span>・</span><button type="button" onClick={() => setLastSel(new Set())}>全解除</button></div>
                {lastOpts.map(x => (
                  <label key={x} className="dd-i">
                    <input type="checkbox" checked={lastSel.has(x)} onChange={e => { const n = new Set(lastSel); if (e.target.checked) n.add(x); else n.delete(x); setLastSel(n); }} />
                    <span>{x}</span><span className="c">{groups.filter(g => g.open && lastOf(g) === x).length}</span>
                  </label>
                ))}
                <div className="dd-f"><span /><button type="button" onClick={() => setLastDd(false)}>閉じる</button></div>
              </div>
            )}
          </div>
          <div className="seg" style={{ position: 'relative' }}>
            {[['未対応', '折り返し待ち', openGroups.length], ['対応済み', '対応済み', doneGroups.length], ['all', 'すべて', openGroups.length + doneGroups.length]].map(([v, t, n]) => (
              <button key={v} className={statusFilter === v ? 'on' : ''} style={statusFilter === v ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => setStatusFilter(v)}>{t}<span className="c">{n}</span></button>
            ))}
          </div>
          <button className="btn" onClick={load}>↻ 更新</button>
          <button className="btn pri go" disabled={!queueable.length} onClick={() => callback(null)}><PhoneIcon />順に折り返す<span className="c n">{queueable.length}社</span></button>
        </div>
      </div>

      <div className="card kpis">
        <div className="k"><span className="t-label">折り返し待ち</span><b className="n">{openGroups.length}<small>件</small></b><small>同じ番号はまとめて1件</small></div>
        <div className="k hot"><span className="t-label">うちアポに近い</span><b className="n">{nHot}<small>件</small></b><small>約束・社長と話した・何度も着信</small></div>
        <div className="k"><span className="t-label">今日の着信</span><b className="n">{todayRecs.length}<small>本</small></b><small>出られなかった {todayRecs.filter(r => !r.zid).length}本</small></div>
        <div className="k"><span className="t-label">会社が分からない番号</span><b className="n">{nUnknown}<small>件</small></b><small>候補の会社を押すと紐づく</small></div>
        <div className="k"><span className="t-label">折り返しまでの時間</span><b className="n">{fmtMin(medianMin)}</b><small>着信から対応済みまで（中央値）</small></div>
      </div>

      <div className="inc-grid">
        <div className="inc-l">
          {loading && <div className="card hint">読み込み中…</div>}
          {!loading && showOpen && (
            <div className="card sec">
              <div className="card-h"><b>折り返す順番</b><span>約束の日が来た会社・社長と話した会社・何度もかけてきた番号を上に</span></div>
              {openGroups.length ? openGroups.map(card) : <div className="hint">{loadError ? '読み込めませんでした。「更新」を押してください' : '折り返し待ちの着信はありません'}</div>}
            </div>
          )}
          {!loading && showDone && (
            <div className="card sec">
              <div className="card-h"><b>対応済み</b><span>折り返して結果を記録すると、その番号の着信は自動でここに移ります</span></div>
              {doneGroups.slice(0, 80).map(g => (
                <div key={g.key} className="drow">
                  <span className="n">{when(g.at)}</span>
                  <span className="nm2">{g.m ? <b className="lk" onClick={() => navigateTo(g.m)}>{g.name}</b> : <b>{g.name || telFmt(g.n) || g.raw || '—'}</b>}</span>
                  <span>{g.callees.length ? `${g.callees.map(first).join('・')}あて` : ''}</span>
                  <span>{g.l ? <span className={`tag ${tagOf(g.l.s)}`}>{g.l.s}</span> : null}</span>
                  <span className="by n">{g.handledAt ? `${md(g.handledAt)} ${hm(g.handledAt)}` : ''} {g.handledBy ? first(g.handledBy) : ''}</span>
                </div>
              ))}
              {!doneGroups.length && <div className="hint">まだありません</div>}
            </div>
          )}
        </div>

        <aside className="inc-r">
          {openByCallee.length > 0 && (
            <div className="card side">
              <div className="card-h"><b>あて先ごとの折り返し待ち</b></div>
              {openByCallee.map(([c, n]) => (
                <button key={c} className={`who-row ${calleeFilter === c ? 'on' : ''}`} onClick={() => setCalleeFilter(calleeFilter === c ? 'all' : c)}>
                  <span className="nm">{c}</span><span className="bar"><i style={{ width: `${(n / openByCallee[0][1]) * 100}%` }} /></span><b className="n">{n}</b>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
      {/* リスト選択モーダル */}
      {selectModal && (
        <div
          onClick={() => setSelectModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: alpha(color.navyDeep, 0.5), backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md,
              minWidth: 320, maxWidth: 420,
              boxShadow: shadow.xl,
              border: `1px solid ${color.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{
              background: color.navy, color: color.white,
              padding: '12px 24px',
              fontWeight: font.weight.semibold, fontSize: font.size.md,
            }}>
              どのリストから架電しますか？
            </div>
            <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginBottom: space[5] }}>
              {selectModal.map(m => (
                <button
                  key={m.itemId}
                  onClick={() => navigateTo(m)}
                  style={{
                    padding: '10px 14px', borderRadius: radius.md,
                    border: `1px solid ${color.border}`,
                    background: color.cream, cursor: 'pointer', textAlign: 'left',
                    fontFamily: font.family.sans, fontSize: font.size.sm, color: color.navy,
                    fontWeight: font.weight.medium, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.cream; }}
                >
                  {listLabel(m)}
                  {m.company && (
                    <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.normal, marginLeft: 8 }}>
                      {m.company}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <Button size="sm" variant="outline" onClick={() => setSelectModal(null)}>
                キャンセル
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 未紐づけ着信の手動リンクモーダル */}
      {linkModal && (
        <div
          onClick={() => setLinkModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: alpha(color.navyDeep, 0.5), backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 320,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: color.white, borderRadius: radius.md,
              width: 480, maxWidth: '90vw', maxHeight: '80vh',
              boxShadow: shadow.xl, border: `1px solid ${color.border}`,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              background: color.navy, color: color.white,
              padding: '12px 24px',
              fontWeight: font.weight.semibold, fontSize: font.size.md,
            }}>
              企業に紐づける
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.normal, opacity: 0.85, marginTop: 2 }}>
                着信番号: {linkModal.callerNumber || '-'}（紐づけ時にキーマン携帯として自動保存）
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${color.border}` }}>
              <input
                type="text"
                autoFocus
                value={linkQuery}
                onChange={e => searchCompanies(e.target.value)}
                placeholder="企業名で検索"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: radius.md,
                  border: `1px solid ${color.border}`, fontSize: font.size.sm,
                  fontFamily: font.family.sans, outline: 'none', background: color.offWhite,
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
              {linkSearching && <div style={{ padding: 12, fontSize: font.size.xs, color: color.textLight }}>検索中…</div>}
              {!linkSearching && linkQuery.trim() && linkResults.length === 0 && (
                <div style={{ padding: 12, fontSize: font.size.xs, color: color.textLight }}>該当する企業はありません</div>
              )}
              {linkResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => applyLink(item)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px', marginBottom: 6,
                    borderRadius: radius.md, border: `1px solid ${color.border}`,
                    background: color.cream, cursor: 'pointer',
                    fontFamily: font.family.sans,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = color.cream; }}
                >
                  <div style={{ fontSize: font.size.sm, color: color.navy, fontWeight: font.weight.semibold }}>
                    {item.company || '(企業名なし)'}
                  </div>
                  <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 2 }}>
                    {item.call_lists?.name || ''} {item.call_lists?.clients?.name ? `（${item.call_lists.clients.name}）` : ''}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 20px', borderTop: `1px solid ${color.border}`, textAlign: 'right' }}>
              <Button size="sm" variant="outline" onClick={() => setLinkModal(null)}>キャンセル</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
