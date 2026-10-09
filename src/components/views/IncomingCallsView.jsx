import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Badge } from '../ui';
import { invokeGetZoomRecording } from '../../lib/supabaseWrite';
import InlineAudioPlayer from '../common/InlineAudioPlayer';

import { getOrgId } from '../../lib/orgContext';
import { telFmt } from '../../utils/telFormat';
import { dialPhone } from '../../utils/phone';
import './IncomingCalls.css';
import './calllist/CallListHome.css';
import { useUrlState } from '../../hooks/useUrlState';

const formatJST = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatDuration = (sec) => {
  if (sec == null || sec < 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}秒`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

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
  const isMobile = useIsMobile();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // URL クエリキーは画面間衝突を避けるため inc_ プレフィックス必須
  // (CRM の ?status=面談予定 を そのまま読むと着信対応が全件除外になる事故防止)
  const [statusFilter, setStatusFilter] = useUrlState('inc_status', 'all');
  // phone(正規化済み) → [{ itemId, company, listId, listName, clientName }]
  const [phoneItemMap, setPhoneItemMap] = useState({});
  // リスト選択モーダル: null | [{ itemId, company, listId, listName, clientName }]
  const [selectModal, setSelectModal] = useState(null);
  // 未紐づけ手動リンク: { callId, callerNumber } | null
  const [linkModal, setLinkModal] = useState(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  // 録音再生表示中の行ID
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  // 前回の架電（会社ごとの最新）と、着信に出た人の名前（Zoom のユーザーID → メンバー名）
  const [lastCalls, setLastCalls] = useState({});
  const [memberByZoom, setMemberByZoom] = useState({});
  // 録音自動取得を 1 行 1 回に制限するための refs
  const _autoFetchedRef = useRef(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('incoming_calls')
      .select('*')
      .eq('org_id', getOrgId())
      .order('received_at', { ascending: false })
      .limit(200);
    const rows = data || [];
    setRecords(rows);

    // 全電話番号を一括でcall_list_itemsに問い合わせ
    // phone（会社番号）/ sub_phone_number（別事業所）/ keyman_mobile（キーマン携帯）の
    // いずれかで一致した項目を集計する。
    // DB 側には normalized (09xx...) / 国際表記 (+8190xx...) / raw (+819xxxxxxxxx) など
    // 表記揺れで保存されている可能性があるため、全パターンを in 句に展開する。
    const phonesSet = new Set();
    rows.forEach(r => {
      if (!r.caller_number) return;
      const raw = String(r.caller_number);
      phonesSet.add(raw);
      const norm = normalizePhone(raw);
      if (norm) {
        phonesSet.add(norm);
        phonesSet.add(`+81${norm.replace(/^0/, '')}`);
      }
    });
    const phones = [...phonesSet];
    const phonesNormalized = new Set(rows.map(r => normalizePhone(r.caller_number)).filter(Boolean));
    if (phones.length > 0) {
      const phonesCsv = phones.join(',');
      const orClause = [
        `phone.in.(${phonesCsv})`,
        `sub_phone_number.in.(${phonesCsv})`,
        `keyman_mobile.in.(${phonesCsv})`,
      ].join(',');
      const { data: items } = await supabase
        .from('call_list_items')
        .select('id, company, phone, sub_phone_number, keyman_mobile, list_id, call_lists(id, name, clients(name))')
        .or(orClause)
        .limit(500);
      const map = {};
      (items || []).forEach(item => {
        // 各 phone/sub/mobile を normalize して、着信側の normalized key と突合
        const numbers = [item.phone, item.sub_phone_number, item.keyman_mobile]
          .map(normalizePhone)
          .filter(Boolean);
        numbers.forEach(p => {
          if (!phonesNormalized.has(p)) return;
          if (!map[p]) map[p] = [];
          if (map[p].some(x => x.itemId === item.id)) return;
          map[p].push({
            itemId: item.id,
            company: item.company || '',
            listId: item.list_id,
            listName: item.call_lists?.name || '',
            clientName: item.call_lists?.clients?.name || '',
          });
        });
      });
      setPhoneItemMap(map);
      const ids = [...new Set(Object.values(map).flat().map(x => x.itemId))];
      if (ids.length) {
        const { data: recs } = await supabase.from('call_records').select('item_id, status, called_at, getter_name')
          .in('item_id', ids).order('called_at', { ascending: false }).limit(3000);
        const lc = {};
        (recs || []).forEach(x => { if (!lc[x.item_id]) lc[x.item_id] = x; });
        setLastCalls(lc);
      }
    }
    const { data: ms } = await supabase.from('members').select('name, zoom_user_id').eq('org_id', getOrgId()).not('zoom_user_id', 'is', null);
    setMemberByZoom(Object.fromEntries((ms || []).map(x => [x.zoom_user_id, String(x.name || '').split(/[\s　]/)[0]])));

    setLoading(false);
  };

  // Phase A: 録音 URL が未取得の応答済み着信について Zoom Cloud Recording から
  // 自動的に URL を引いて incoming_calls.recording_url に保存する。
  // 行ロード後、duration_sec が記録済 (= 通話終了) かつ recording_url 未設定の行が対象。
  // get-zoom-recording は callee_number/caller_number 両方をフィルタ対象にしているため
  // inbound の場合でも caller_number で hit する。
  const autoFetchRecording = async (row) => {
    if (!row?.id || row.recording_url || _autoFetchedRef.current.has(row.id)) return;
    if (!row.answered_by_zoom_user_id || !row.caller_number) return;
    if (row.duration_sec == null || row.duration_sec < 5) return; // 5秒未満は録音されない想定
    _autoFetchedRef.current.add(row.id);
    try {
      const { data } = await invokeGetZoomRecording({
        zoom_user_id: row.answered_by_zoom_user_id,
        callee_phone: row.caller_number, // get-zoom-recording は caller/callee 両方検索
        called_at: row.received_at,
      });
      const url = data?.recording_url;
      if (url) {
        await supabase.from('incoming_calls').update({ recording_url: url }).eq('id', row.id);
        setRecords(prev => prev.map(r => r.id === row.id ? { ...r, recording_url: url } : r));
      }
    } catch (e) {
      console.warn('[IncomingCalls] auto-fetch recording error:', e);
    }
  };

  useEffect(() => {
    if (!records.length) return;
    // 終了済み・録音未取得の行を上位 20 件だけ走査（過去分は手動再取得に任せる）
    records.slice(0, 20).forEach(r => {
      if (r.ended_at && !r.recording_url) autoFetchRecording(r);
    });
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
  const applyLink = async (item) => {
    if (!linkModal) return;
    await supabase
      .from('incoming_calls')
      .update({ item_id: item.id, company_name: item.company || null })
      .eq('id', linkModal.callId);

    // keyman_mobile が未設定(null or 空文字)の場合のみ学習保存（既存値は尊重）
    // 保存する番号は normalize 後の形式（09xxxxxxxxx）に統一して
    // phoneItemMap 側の正規化マッチングで確実にヒットさせる。
    if (linkModal.callerNumber) {
      const normalized = normalizePhone(linkModal.callerNumber) || linkModal.callerNumber;
      const { data: current } = await supabase
        .from('call_list_items')
        .select('keyman_mobile')
        .eq('id', item.id)
        .single();
      const existing = (current?.keyman_mobile || '').trim();
      if (!existing) {
        await supabase
          .from('call_list_items')
          .update({ keyman_mobile: normalized })
          .eq('id', item.id);
      }
    }

    // 紐づけ後も自動紐づけ行と同じリッチ表示（企業名リンク＋リスト/クライアント名）
    // にするため、phoneItemMap にも match 情報を追加する。
    const normPhone = normalizePhone(linkModal.callerNumber);
    if (normPhone) {
      const matchInfo = {
        itemId: item.id,
        company: item.company || '',
        listId: item.list_id,
        listName: item.call_lists?.name || '',
        clientName: item.call_lists?.clients?.name || '',
      };
      setPhoneItemMap(prev => ({
        ...prev,
        [normPhone]: [
          ...((prev[normPhone] || []).filter(x => x.itemId !== item.id)),
          matchInfo,
        ],
      }));
    }

    setRecords(prev => prev.map(r => r.id === linkModal.callId
      ? { ...r, item_id: item.id, company_name: item.company || null }
      : r));
    setLinkModal(null);
    setLinkQuery('');
    setLinkResults([]);
  };

  useEffect(() => { load(); }, []);

  const markHandled = async (id) => {
    await supabase
      .from('incoming_calls')
      .update({ status: '対応済み', handled_at: new Date().toISOString() })
      .eq('id', id);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: '対応済み' } : r));
  };

  const handleCompanyClick = (matches) => {
    if (matches.length === 1) {
      navigateTo(matches[0]);
    } else {
      setSelectModal(matches);
    }
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

  // Phase C: 着信行から「アポ取得」→ CallFlowView を該当企業フォーカス＋AppoReportModal自動展開、
  // 録音URLも初期値として渡す
  const openAppoFromIncoming = (row, match) => {
    if (!setCallFlowScreen || !match) return;
    const fullL = callListData.find(l => l._supaId === match.listId);
    setCallFlowScreen({
      list: fullL || { _supaId: match.listId, id: match.listId, company: match.company },
      defaultItemId: match.itemId,
      defaultListMode: false,
      singleItemMode: true,
      initialRecordingUrl: row.recording_url || '',
      // 着信元の caller_number を渡すことで、appo-ai-report が Zoom 録音を
      // caller_number でも引けるようになる（inbound 録音の自動レポート生成）
      initialDialedPhone: row.caller_number || '',
      autoOpenAppoModal: true,
    });
  };

  const filtered = records.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  );

  // ステータス → Badge variant
  const statusVariant = (s) => s === '対応済み' ? 'success' : 'danger';

  // ── 着信対応（2026-10-09 むー様：架電リストと同じつくりに） ──────────────────
  // 上：未対応の数と今日の着信。下：日ごとのカード。1行に、時刻・会社（リスト）・前回の架電・出た人・番号・状態・操作
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const hm = iso => new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  const nOpen = records.filter(r => r.status !== '対応済み').length;
  const todayRows = records.filter(r => r.received_at && dayOf(r.received_at) === today);
  const nToday = todayRows.length;
  const nTodayOpen = todayRows.filter(r => r.status !== '対応済み').length;
  const answeredRate = records.length ? Math.round((records.filter(r => r.answered_by_zoom_user_id).length / records.length) * 100) : 0;
  const matchesOf = r => { const m = phoneItemMap[normalizePhone(r.caller_number)] || []; return m.filter((x, i, a) => a.findIndex(y => y.itemId === x.itemId) === i); };
  const linkedRate = records.length ? Math.round((records.filter(r => matchesOf(r).length || r.company_name).length / records.length) * 100) : 0;
  const oldestOpen = records.filter(r => r.status !== '対応済み').map(r => r.received_at).sort()[0];
  const oldestDays = oldestOpen ? Math.floor((Date.now() - new Date(oldestOpen).getTime()) / 86400000) : 0;
  const groups = [];
  for (const r of filtered) {
    const d = r.received_at ? dayOf(r.received_at) : '';
    let g = groups[groups.length - 1];
    if (!g || g.d !== d) { g = { d, rows: [] }; groups.push(g); }
    g.rows.push(r);
  }
  const dayLabel = d => {
    if (!d) return '日付なし';
    const dt = new Date(`${d}T00:00:00+09:00`);
    const w = '日月火水木金土'[dt.getDay()];
    const y = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    return `${d === today ? '今日 ' : d === y ? '昨日 ' : ''}${dt.getMonth() + 1}/${dt.getDate()}（${w}）`;
  };
  const tagOf = s => ({ 'キーマン不在': 'blue', '受付再コール': 'amber', 'キーマン再コール': 'amber', 'キーマン断り': 'red', 'アポ獲得': 'green' }[s] || 'gray');
  const PhoneIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>;

  return (
    <div className="clh inc" style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="pt">
        <div><h1>着信対応</h1><p>折り返しの着信。会社名を押すと、その会社の架電ページを開きます</p></div>
        <div className="r">
          <div className="seg" style={{ position: 'relative' }}>
            {[['all', 'すべて', records.length], ['未対応', '未対応', nOpen], ['対応済み', '対応済み', records.length - nOpen]].map(([v, t, n]) => (
              <button key={v} className={statusFilter === v ? 'on' : ''} style={statusFilter === v ? { background: 'var(--navy)', color: '#fff' } : undefined} onClick={() => setStatusFilter(v)}>{t}<span className="c">{n}</span></button>
            ))}
          </div>
          <button className="btn sm" onClick={load}>↻ 更新</button>
        </div>
      </div>

      <div className="card floor">
        <div className="floor-l">
          <div>
            <div className="lbl">未対応の着信</div>
            <div className="big n">{nOpen.toLocaleString()}<small>件</small></div>
            <div className="s">今日の未対応 <b className="n">{nTodayOpen}</b>件{oldestOpen ? <><br />いちばん古い未対応は <b>{oldestDays}日前</b></> : null}</div>
          </div>
          <div className="tb"><small>着信を折り返したら「対応済」。会社に紐づけると、次からその番号の着信は自動で会社名が出ます</small></div>
        </div>
        <div className="floor-r">
          <div className="desk-h"><span className="lbl">直近{records.length}件の着信</span><span className="live"><i />{loading ? '読み込み中' : '最新'}</span></div>
          <div className="desks">
            <div className="desk"><div className="who">今日の着信</div><div className="ft" style={{ marginTop: 8 }}><span><b className="n" style={{ fontSize: 22, color: 'var(--navy)' }}>{nToday}</b> 件</span></div></div>
            <div className="desk"><div className="who">出られた着信</div><div className="ft" style={{ marginTop: 8 }}><span><b className="n" style={{ fontSize: 22, color: 'var(--navy)' }}>{answeredRate}</b> %</span></div><div className="what">誰かが電話に出た割合</div></div>
            <div className="desk"><div className="who">会社が分かった着信</div><div className="ft" style={{ marginTop: 8 }}><span><b className="n" style={{ fontSize: 22, color: 'var(--navy)' }}>{linkedRate}</b> %</span></div><div className="what">番号でリストの会社と照らせた割合</div></div>
            <div className="desk"><div className="who">未対応（全体）</div><div className="ft" style={{ marginTop: 8 }}><span><b className="n" style={{ fontSize: 22, color: nOpen ? 'var(--red)' : 'var(--navy)' }}>{nOpen}</b> 件</span></div></div>
          </div>
        </div>
      </div>

      {loading && <div className="hint">読み込み中…</div>}
      {!loading && !filtered.length && <div className="hint">該当する着信はありません</div>}
      {groups.map(g => (
        <div key={g.d} className="card sec fsec">
          <div className="sec-h"><span className="ttl">{dayLabel(g.d)}</span><span className="cnt n">{g.rows.length}</span><span className="why">件の着信・未対応 {g.rows.filter(r => r.status !== '対応済み').length}件</span></div>
          {g.rows.map(r => {
            const ms = matchesOf(r);
            const m = ms[0];
            const name = m?.company || r.company_name || '';
            const lc = m ? lastCalls[m.itemId] : null;
            const ans = r.answered_by_zoom_user_id ? (memberByZoom[r.answered_by_zoom_user_id] || '出た') : null;
            const open = r.status !== '対応済み';
            return (
              <div key={r.id} className={`incr ${open ? 'open' : 'done'}`}>
                <span className="tm n">{r.received_at ? hm(r.received_at) : '—'}</span>
                <span className="cname">
                  {name ? (
                    <><b className={m && setCallFlowScreen ? 'lk' : ''} onClick={() => m && handleCompanyClick(ms)}>{name}</b>
                      <small>{ms.length ? ms.map(x => listLabel(x)).join(' ／ ') : 'リストの会社と照らせていない'}</small></>
                  ) : (
                    <><b style={{ color: 'var(--ink-3)', fontWeight: 500 }}>会社が分からない番号</b>
                      <small><button className="lnk" onClick={() => { setLinkModal({ callId: r.id, callerNumber: r.caller_number }); setLinkQuery(''); setLinkResults([]); }}>企業に紐づける</button></small></>
                  )}
                </span>
                <span className="last">{lc ? <><span className={`tag ${tagOf(lc.status)}`}>{lc.status}</span><small>{new Date(lc.called_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })} {(lc.getter_name || '').split(/\s/)[0]}</small></> : <small style={{ color: 'var(--ink-3)' }}>{m ? 'まだかけていない' : '—'}</small>}</span>
                <span className="ans">{ans ? <span className="tag green">{ans}が出た</span> : <span className="tag red">不在着信</span>}</span>
                <span className="tel n">{telFmt(normalizePhone(r.caller_number)) || r.caller_number || '—'}</span>
                <span className="rec">{activeRecordingId === r.id && r.recording_url ? <InlineAudioPlayer url={r.recording_url} onClose={() => setActiveRecordingId(null)} />
                  : r.recording_url ? <button className="lnk" onClick={() => setActiveRecordingId(r.id)}>▶ 録音</button> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</span>
                <span className="st"><span className={`tag ${open ? 'red' : 'green'}`}>{open ? '未対応' : '対応済み'}</span></span>
                <span className="acts">
                  {r.caller_number && r.caller_number !== 'anonymous' && <button className="dialb" title="この番号に折り返す" onClick={() => dialPhone(normalizePhone(r.caller_number))}><PhoneIcon /></button>}
                  {m && <button className="btn sm pri" onClick={() => openAppoFromIncoming(r, m)}>アポ取得</button>}
                  {open && <button className="btn sm" onClick={() => markHandled(r.id)}>対応済</button>}
                </span>
              </div>
            );
          })}
        </div>
      ))}

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
