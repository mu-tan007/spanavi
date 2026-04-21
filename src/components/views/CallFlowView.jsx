import { useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import { zoomPhone } from '../../lib/zoomPhoneStore';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import { useIsMobile } from '../../hooks/useIsMobile';

import { C } from '../../constants/colors';
import { dialPhone } from '../../utils/phone';
import { extractUserNote, buildMemoWithNote } from '../../utils/memo';
import { fetchCallListItems, fetchCallRecords, fetchCallRecordsByItemIds, fetchCallListItemById, fetchCallRecordsByItem, insertCallRecord, updateCallListItem, insertCallSession, updateCallSession, updateCallRecordRecordingUrl, updateAppoReportRecordingUrl, invokeGetZoomRecording, closeOpenCallSessionsForList, deleteCallRecord, invokeGenerateCompanyInfo, fetchSetting, insertAppointment, updateClientContact, completeRecallsForItem, getScriptPdfSignedUrl } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import { formatJST } from '../../utils/dateUtils';
import RecallModal from './RecallModal';
import AppoReportModal from './AppoReportModal';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import ClientCalendarPanel from '../common/ClientCalendarPanel';
import MultiCalendarPanel from '../common/MultiCalendarPanel';
import QuickAppoModal from '../common/QuickAppoModal';
import { renderMarkedScript } from '../../utils/scriptMarker';

// ============================================================
// Call Flow View (架電フロー) — 左右分割レイアウト
// ============================================================
// モジュールレベルのセッションIDキャッシュ（React Strict Mode 二重INSERT防止）
// useRef と異なりStrict Modeのfake unmount/remountでもリセットされない
const _cfSessionCache = new Map(); // `${listId}|${startNo}|${endNo}` → sessionId
const _cfSlackNotified = new Set(); // cacheKey → Slack通知済みフラグ（重複防止）
// モジュールレベルの「リアルクローズ済みセッションID」セット
// isRealCloseRef（useRef）はStrict Modeで信頼できないため、同じパターンで管理
const _cfRealCloseSet = new Set(); // sessionId → リアルクローズ時にadd、cleanup後にdelete

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const extractPref = (address) => PREFS.find(p => address?.startsWith(p)) || '';

// 注意事項テキストを ①②③④ などのマーカーで章立てに分解する。
// マーカーが1つも見つからない場合は null を返し、呼び出し側で従来の <pre> にフォールバックする。
// 元テキストは破壊しない（全行をいずれかの section に必ず含める）。
const CAUTION_MARKER_RE = /^\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.*)$/;
function parseCautions(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let cur = { marker: null, title: '', body: [] };
  for (const line of lines) {
    const m = line.match(CAUTION_MARKER_RE);
    if (m) {
      if (cur.marker || cur.title || cur.body.length) sections.push(cur);
      cur = { marker: m[1], title: m[2].trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  if (cur.marker || cur.title || cur.body.length) sections.push(cur);
  if (!sections.some(s => s.marker)) return null;
  return sections;
}

// 注意事項を構造化カードでレンダリングするコンポーネント。
// 元テキストの内容は1文字も削らず、見出しと本文に分けて表示するだけ。
// filter: 'all' | 'calendar' | 'non-calendar'
//   'calendar'     - タイトルに「カレンダー」を含むセクションだけ表示
//   'non-calendar' - 「カレンダー」を含むセクションを除外して表示
// list.cautions から「カレンダー」セクションの本文行だけ抽出
function extractCalendarCautionLines(text) {
  const sections = parseCautions(text);
  if (!sections) return [];
  const out = [];
  for (const s of sections) {
    if (/カレンダー/.test(s.title || '')) {
      for (const line of s.body) {
        if (line && line.trim()) out.push(line.trim());
      }
    }
  }
  return out;
}

function CautionsCards({ text, fontSize = 12, filter = 'all' }) {
  const parsed = parseCautions(text);
  if (!parsed) {
    if (filter !== 'all') return null;
    return (
      <pre style={{ fontSize, color: '#C07600', whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: 0, fontFamily: "'Noto Sans JP'" }}>{text}</pre>
    );
  }
  const isCal = (s) => /カレンダー/.test(s.title || '');
  const sections = filter === 'calendar'
    ? parsed.filter(isCal)
    : filter === 'non-calendar'
      ? parsed.filter(s => !isCal(s))
      : parsed;
  if (sections.length === 0) return null;
  // フィルタで歯抜けになった番号を繰り上げる（① ② ④ → ① ② ③）
  const CIRCLE = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  const renumber = filter !== 'all';
  const NG_RE = /(NG|不可|禁止|×|✗|だめ|ダメ)/;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sections.map((s, i) => {
        // body の前後の空行をトリム（元テキストは破壊せず表示時のみ）
        let body = s.body.slice();
        while (body.length && !body[0].trim()) body.shift();
        while (body.length && !body[body.length - 1].trim()) body.pop();
        return (
          <div key={i} style={{
            border: '1px solid #F0D9A8',
            background: '#FFFBF0',
            borderRadius: 8,
            padding: '8px 10px',
          }}>
            {(s.marker || s.title) && (
              <div style={{
                fontSize, fontWeight: 700, color: '#8B5A00',
                marginBottom: body.length ? 6 : 0,
                paddingBottom: body.length ? 4 : 0,
                borderBottom: body.length ? '1px solid #F0D9A8' : 'none',
                fontFamily: "'Noto Sans JP'",
              }}>
                {(renumber && s.marker) ? `${CIRCLE[i] || s.marker} ` : (s.marker ? `${s.marker} ` : '')}{s.title}
              </div>
            )}
            {body.length > 0 && (
              <div style={{ fontSize, color: '#5A3D00', lineHeight: 1.7, fontFamily: "'Noto Sans JP'" }}>
                {body.map((line, j) => {
                  const isNG = NG_RE.test(line);
                  return (
                    <div key={j} style={{
                      whiteSpace: 'pre-wrap',
                      color: isNG ? '#C0392B' : undefined,
                      fontWeight: isNG ? 600 : undefined,
                    }}>
                      {line || '\u00A0'}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CallFlowView({ list, startNo, endNo, statusFilter = null, onClose, onMinimize, isMinimized, summaryRef, closeRef, setAppoData, members = [], currentUser = '', defaultItemId = null, defaultListMode = null, clientData = [], rewardMaster = [], initialRevenueMin = null, initialRevenueMax = null, initialPrefFilter = null, appoData = [], contactsByClient = {}, setContactsByClient, singleItemMode = false }) {
  // 動的ステータス定義（useCallStatuses フックから取得）
  const { statuses: callStatuses, shortcuts: cfvShortcuts, ceoConnectLabels, getStatusColor, excludedIds } = useCallStatuses();

  // EXCLUDED_STATUSES: DB保存値はラベル（日本語）なので、excludedなステータスのlabel Setを導出
  const EXCLUDED_STATUSES = useMemo(
    () => new Set(callStatuses.filter(s => s.excluded).map(s => s.label)),
    [callStatuses]
  );
  // RECALL_STATUSES: idに'recall'を含むステータスのlabel Set
  const RECALL_STATUSES = useMemo(
    () => new Set(callStatuses.filter(s => s.id.includes('recall')).map(s => s.label)),
    [callStatuses]
  );

  const isMobile = useIsMobile();
  const [mobileScriptOpen, setMobileScriptOpen] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [appoModal, setAppoModal] = useState(null); // holds selectedRow when アポ獲得 is clicked
  const [aiGenerating, setAiGenerating] = useState(false);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(true);
  const [scriptTab, setScriptTab] = useState('script');
  const [sortState, setSortState] = useState({ column: null, direction: null });
  const [callRecords, setCallRecords] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [filterMode, setFilterMode] = useState('callable');
  const [revenueMin, setRevenueMin] = useState(initialRevenueMin ? String(initialRevenueMin) : '');  // 千円単位（例: 100000 = 1億円）
  const [revenueMax, setRevenueMax] = useState(initialRevenueMax ? String(initialRevenueMax) : '');  // 空文字 = 上限なし
  const [prefFilters, setPrefFilters] = useState(Array.isArray(initialPrefFilter) ? initialPrefFilter : (initialPrefFilter ? [initialPrefFilter] : []));
  const [prefDropOpen, setPrefDropOpen] = useState(false);
  const [statusFilterLocal, setStatusFilterLocal] = useState(() => Array.isArray(statusFilter) ? statusFilter : []); // DetailModalの選択を引き継ぎ
  const [recallModal, setRecallModal] = useState(null); // { row, statusId, round, label }
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const cfvKbRef = useRef({});
  const [subPhone, setSubPhone] = useState('');
  const [lastDialedPhone, setLastDialedPhone] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const [quickAppoSlot, setQuickAppoSlot] = useState(null); // { date, time }
  const [qaData, setQaData] = useState(null);
  const [qaSubTab, setQaSubTab] = useState('reception');
  const [pdfPreview, setPdfPreview] = useState(null); // { name, url }
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);

  const handleOpenScriptPdf = async (pdf) => {
    if (!pdf?.path) return;
    setPdfPreviewLoading(true);
    const { url, error } = await getScriptPdfSignedUrl(pdf.path);
    setPdfPreviewLoading(false);
    if (error || !url) { alert('PDFを開けませんでした'); return; }
    setPdfPreview({ name: pdf.name, url });
  };
  const PAGE_SIZE = 30;
  const sessionIdRef = React.useRef(null);
  const [autoDial, setAutoDial] = useState(() => {
    try { return localStorage.getItem('cf_autocall') === 'true'; } catch { return false; }
  });
  const [listMode, setListMode] = useState(() => {
    if (defaultListMode !== null && defaultListMode !== undefined) return defaultListMode;
    try { return sessionStorage.getItem('callflow_list_mode') !== 'false'; } catch { return true; }
  }); // true=リスト表示, false=フォーカスモード
  useEffect(() => {
    try { sessionStorage.setItem('callflow_list_mode', String(listMode)); } catch {}
  }, [listMode]);
  const toggleAutoDial = () => {
    setAutoDial(prev => {
      const next = !prev;
      try { localStorage.setItem('cf_autocall', String(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!list._supaId) {
      console.warn('[CallFlowView] list._supaId が未設定 — データ取得をスキップ');
      setLoading(false);
      return;
    }
    let cancelled = false;

    // 全件ロード（リストモード・ソート・架電開始で必要）。
    // defaultItemId 指定時は背景で並行実行し、UI ブロックしない。
    // startNo/endNo 指定時は範囲だけ取得して大規模リストのラグを回避。
    const hasRange = (startNo != null && endNo != null);
    const loadFull = () => fetchCallListItems(list._supaId, hasRange ? { startNo, endNo } : {})
      .then(async (itemsRes) => {
        if (cancelled) return { itemsRes, recordsRes: { data: [] } };
        const fetchedItems = itemsRes.data || [];
        // 範囲指定時は item_id で絞った records だけ取得（全件取得を回避）
        const recordsRes = hasRange
          ? { data: (await fetchCallRecordsByItemIds(fetchedItems.map(i => i.id))).data || [] }
          : await fetchCallRecords(list._supaId);
        return { itemsRes, recordsRes };
      })
      .then(({ itemsRes, recordsRes }) => {
      if (cancelled) return;
      const fetchedItems = itemsRes.data || [];
      const fetchedRecords = recordsRes.data || [];
      setItems(fetchedItems);
      setCallRecords(fetchedRecords);
      if (defaultItemId) {
        // 高速パスで既に selectedRow セット済みでも、全件版に差し替えて参照同一性を保つ
        const target = fetchedItems.find(i => i.id === defaultItemId);
        if (target) setSelectedRow(target);
      } else {
        try {
          const savedId = sessionStorage.getItem('callflow_selected_id');
          if (savedId) {
            const target = fetchedItems.find(i => String(i.id) === savedId);
            if (target) setSelectedRow(target);
          }
        } catch {}
      }
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error('[CallFlowView] データ取得エラー:', err);
      setLoading(false);
    });

    if (defaultItemId) {
      // ★ 高速パス: アポ一覧等から特定企業を開く時、その1件＋関連レコードだけ即取得し
      // すぐに描画する。3万件級リストでも体感ラグなし。
      // singleItemMode の場合は1件のみで全件ロードしない。
      // ⚠ レース対策: 全件ロードが先に完了している場合は何も上書きしない。
      // また setItems / setCallRecords はマージのみ（既存配列を縮めない）。
      let fullLoaded = false;
      if (!singleItemMode) {
        const fullPromise = loadFull().then(() => { fullLoaded = true; });
        void fullPromise;
      }
      Promise.all([
        fetchCallListItemById(defaultItemId),
        fetchCallRecordsByItem(defaultItemId),
      ]).then(([itemRes, recRes]) => {
        if (cancelled || fullLoaded) return;
        if (itemRes.data) {
          setItems(prev => prev.length > 1 ? prev : [itemRes.data]);
          setSelectedRow(prev => prev || itemRes.data);
        }
        if (recRes.data && recRes.data.length > 0) {
          setCallRecords(prev => prev.length > recRes.data.length ? prev : recRes.data);
        }
        setLoading(false);
      }).catch(err => {
        console.warn('[CallFlowView] 高速パスエラー（全件ロードにフォールバック）:', err);
      });
    } else {
      loadFull();
    }

    return () => { cancelled = true; };
  }, [list._supaId, startNo, endNo]);

  useEffect(() => {
    fetchSetting('qa_data').then(({ value }) => {
      if (value) {
        try { setQaData(JSON.parse(value)); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    setLocalMemo(selectedRow?.id ? extractUserNote(selectedRow.memo) : '');
    setSubPhone(selectedRow?.sub_phone_number || '');
    setLastDialedPhone(null);
    try {
      if (selectedRow?.id != null) sessionStorage.setItem('callflow_selected_id', String(selectedRow.id));
    } catch {}
  }, [selectedRow?.id]);

  useEffect(() => {
    if (!selectedRow) { setSelectedRound(null); return; }
    const recs = callRecords.filter(r => r.item_id === selectedRow.id);
    const maxRound = recs.length > 0 ? Math.max(...recs.map(r => r.round)) : 0;
    setSelectedRound(Math.min(maxRound + 1, 10));
  }, [selectedRow?.id]);

  const [sessionStarted, setSessionStarted] = useState(false);

  // 架電開始ハンドラ: セッション作成 + Slack通知 + フォーカスモード遷移
  const handleStartCalling = () => {
    if (sessionStarted) return;
    const cacheKey = `${list.id}|${startNo ?? ''}|${endNo ?? ''}`;
    // 既にセッション作成済み（再マウント時）はセッション復元のみ
    if (_cfSessionCache.has(cacheKey)) {
      sessionIdRef.current = _cfSessionCache.get(cacheKey);
      setSessionStarted(true);
      if (sorted.length > 0) { setSelectedRow(sorted[0]); setListMode(false); }
      // セッションは既存だがSlack未通知なら通知する
      if (!_cfSlackNotified.has(cacheKey) && !defaultItemId) {
        _cfSlackNotified.add(cacheKey);
        const callerName = currentUser || '不明';
        const listLabel = [list.company, list.industry].filter(Boolean).join(' - ');
        const rangeLabel = (startNo != null && endNo != null) ? `No.${startNo}〜${endNo}` : '全件';
        const text = `📞 ${callerName} が「${listLabel}」の${rangeLabel}を架電開始しました`;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey) {
          fetch(`${supabaseUrl}/functions/v1/post-to-slack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ text, webhook_key: 'slack_webhook_keiden', org_id: getOrgId() }),
          }).catch(e => console.warn('[Slack] 架電開始通知エラー:', e));
        }
      }
      return;
    }
    const totalCount = (startNo != null && endNo != null) ? (Number(endNo) - Number(startNo) + 1) : 0;
    const newId = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionIdRef.current = newId;
    _cfSessionCache.set(cacheKey, newId);
    setSessionStarted(true);

    closeOpenCallSessionsForList(list._supaId, currentUser || '不明')
      .catch(e => console.warn('[Session] closeOpenCallSessionsForList error:', e))
      .finally(() => {
        insertCallSession({
          id: newId, list_id: list.id, list_supa_id: list._supaId || null,
          list_name: list.company || '', industry: list.industry || '',
          caller_name: currentUser || '不明',
          start_no: startNo ?? null, end_no: endNo ?? null, total_count: totalCount,
          started_at: new Date().toISOString(), finished_at: null, last_called_at: null,
        }).then(() => {
          if (defaultItemId) return;
          if (_cfSlackNotified.has(cacheKey)) return;
          _cfSlackNotified.add(cacheKey);
          const callerName = currentUser || '不明';
          const listLabel = [list.company, list.industry].filter(Boolean).join(' - ');
          const rangeLabel = (startNo != null && endNo != null) ? `No.${startNo}〜${endNo}` : '全件';
          const conditions = [];
          if (statusFilter) conditions.push(`ステータス: ${statusFilter}`);
          if (initialRevenueMin || initialRevenueMax) {
            const minLabel = initialRevenueMin ? `${(initialRevenueMin / 1000).toLocaleString()}百万` : '';
            const maxLabel = initialRevenueMax ? `${(initialRevenueMax / 1000).toLocaleString()}百万` : '';
            conditions.push(`売上高: ${minLabel}${minLabel && maxLabel ? '〜' : ''}${maxLabel}${!minLabel && maxLabel ? '以下' : ''}${minLabel && !maxLabel ? '以上' : ''}`);
          }
          if (initialPrefFilter) {
            const prefs = Array.isArray(initialPrefFilter) ? initialPrefFilter : [initialPrefFilter];
            if (prefs.length > 0) conditions.push(`都道府県: ${prefs.join(', ')}`);
          }
          const condLabel = conditions.length > 0 ? `\n絞り込み: ${conditions.join(' / ')}` : '';
          const text = `📞 ${callerName} が「${listLabel}」の${rangeLabel}を架電開始しました${condLabel}`;
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (supabaseUrl && supabaseKey) {
            fetch(`${supabaseUrl}/functions/v1/post-to-slack`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({ text, webhook_key: 'slack_webhook_keiden', org_id: getOrgId() }),
            }).catch(e => console.warn('[Slack] 架電開始通知エラー:', e));
          }
        }).catch(e => console.error('[Session] insertCallSession error:', e));
      });

    // 先頭企業を選択してフォーカスモードへ
    if (sorted.length > 0) {
      setSelectedRow(sorted[0]);
      setListMode(false);
    }
  };

  // 再コール・事前確認からの起動時はセッション作成しない
  // （defaultItemIdが設定されている場合はフォーカスモードのみ）

  // beforeunload guard
  React.useEffect(() => {
    const cacheKey = `${list.id}|${startNo ?? ''}|${endNo ?? ''}`;
    // タブ閉じ・リロード時にも finished_at を書き込む
    const handleBeforeUnload = () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey || !sessionIdRef.current) return;
      fetch(`${supabaseUrl}/rest/v1/call_sessions?id=eq.${sessionIdRef.current}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ finished_at: new Date().toISOString() }),
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      const sessionId = sessionIdRef.current;
      const isRealClose = sessionId != null && _cfRealCloseSet.has(sessionId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isRealClose) {
        _cfRealCloseSet.delete(sessionId);
        _cfSessionCache.delete(cacheKey);
        updateCallSession(sessionId, { finished_at: new Date().toISOString() })
          .catch(e => console.error('[Session] unmount updateCallSession error:', e));
        closeOpenCallSessionsForList(list._supaId, currentUser || '不明')
          .catch(e => console.error('[Session] unmount closeOpenCallSessionsForList error:', e));
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // handleClose: セッションを即座にクローズしてから画面を閉じる
  const handleClose = () => {
    try {
      sessionStorage.removeItem('callflow_list_mode');
      sessionStorage.removeItem('callflow_selected_id');
    } catch {}
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      _cfRealCloseSet.add(sessionId);
      // IDベースの更新 + 同一リスト/ユーザーの全未完了セッションをまとめてクローズ（二重対策）
      updateCallSession(sessionId, { finished_at: new Date().toISOString() })
        .catch(e => console.error('[Session] handleClose updateCallSession error:', e));
      closeOpenCallSessionsForList(list._supaId, currentUser || '不明')
        .catch(e => console.error('[Session] handleClose closeOpenCallSessionsForList error:', e));
    }
    onClose();
  };

  // PiP: closeRef/summaryRefを親に公開
  useEffect(() => {
    if (closeRef) closeRef.current = handleClose;
  });

  const getRecordsForItem = (itemId) => callRecords.filter(r => r.item_id === itemId);
  const getNextRound = (itemId) => {
    const recs = getRecordsForItem(itemId);
    return recs.length === 0 ? 1 : Math.min(Math.max(...recs.map(r => r.round)) + 1, 10);
  };
  const isExcludedItem = (itemId) => callRecords.some(r => r.item_id === itemId && EXCLUDED_STATUSES.has(r.status));
  const isHiddenFromCallable = (itemId) => {
    if (isExcludedItem(itemId)) return true;
    const recs = getRecordsForItem(itemId);
    if (recs.length === 0) return false;
    const latestRec = recs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b);
    return RECALL_STATUSES.has(latestRec.status);
  };

  // Range filter (Number() で型統一: DBからstringで返る場合も安全)
  const rangeItems = (() => {
    if (startNo != null && endNo != null) {
      const s = Number(startNo), e = Number(endNo);
      const result = items.filter(i => Number(i.no) >= s && Number(i.no) <= e);
      return result;
    }
    return items;
  })();

  // statusFilterLocal に一本化（DetailModal prop は初期値として引き継ぎ済み）
  const statusFilteredItems = rangeItems;

  // 範囲指定なし時のみ: items ロード完了後に total_count を実件数で確定
  React.useEffect(() => {
    if (!loading && items.length > 0 && (startNo == null || endNo == null)) {
      updateCallSession(sessionIdRef.current, { total_count: items.length })
        .catch(e => console.error('[Session] updateCallSession totalCount error:', e));
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 架電のたびに last_called_at + last_called_no を更新
  const _updateSessionProgress = (calledNo) => {
    if (!sessionIdRef.current) return;
    const updates = { last_called_at: new Date().toISOString() };
    if (calledNo != null) updates.last_called_no = calledNo;
    updateCallSession(sessionIdRef.current, updates)
      .catch(e => console.error('[Session] _updateSessionProgress error:', e));
  };

  const filtered = (() => {
    const result = statusFilteredItems.filter(item => {
      const matchSearch = !search || item.company?.includes(search) || item.representative?.includes(search) || item.phone?.includes(search);
      if (!matchSearch) return false;
      if (filterMode === 'callable') { if (isHiddenFromCallable(item.id)) return false; }
      else if (filterMode === 'excluded') { if (!isExcludedItem(item.id)) return false; }
      if (revenueMin !== '') {
        if (item.revenue == null || Number(item.revenue) < Number(revenueMin)) return false;
      }
      if (revenueMax !== '') {
        if (item.revenue == null || Number(item.revenue) > Number(revenueMax)) return false;
      }
      if (prefFilters.length > 0) {
        if (!prefFilters.includes(extractPref(item.address))) return false;
      }
      // ステータスフィルタ（企業一覧上のボタン・複数選択対応）
      // call_list_items.call_status を使用（callRecords未ロード時でも動作）
      if (statusFilterLocal.length > 0) {
        const currentStatus = item.call_status || '未架電';
        if (!statusFilterLocal.includes(currentStatus)) return false;
      }
      return true;
    });
    return result;
  })();

  const prefOptions = [...new Set(items.map(r => extractPref(r.address)).filter(Boolean))].sort();

  const COL_KEY_MAP = { 'No': 'no', '企業名': 'company', '事業内容': 'business', '代表者': 'representative', '電話番号': 'phone', '結果': 'call_status', '売上高': 'revenue' };
  const NUMERIC_COLS = new Set(['no', 'revenue']);
  const sorted = sortState.column && sortState.direction
    ? [...filtered].sort((a, b) => {
        const key = COL_KEY_MAP[sortState.column];
        const av = a[key] ?? '';
        const bv = b[key] ?? '';
        const cmp = NUMERIC_COLS.has(key)
          ? (Number(av) || 0) - (Number(bv) || 0)
          : String(av).localeCompare(String(bv), 'ja');
        return sortState.direction === 'desc' ? -cmp : cmp;
      })
    : filtered;

  const handleSort = (col) => {
    setSortState(prev => {
      if (prev.column !== col) return { column: col, direction: 'asc' };
      if (prev.direction === 'asc') return { column: col, direction: 'desc' };
      return { column: null, direction: null };
    });
    setPage(0);
  };

  const currentIdx = sorted.findIndex(i => i.id === selectedRow?.id);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: statusFilteredItems.length,
    called: statusFilteredItems.filter(i => getRecordsForItem(i.id).length > 0).length,
    excluded: statusFilteredItems.filter(i => isExcludedItem(i.id)).length,
    appo: statusFilteredItems.filter(i => getRecordsForItem(i.id).some(r => r.status === 'アポ獲得')).length,
  };
  const progress = stats.total > 0 ? Math.round(stats.called / stats.total * 100) : 0;

  // selectedRow 変更時は録音プレーヤーをリセット
  useEffect(() => { setActiveRecordingId(null); }, [selectedRow]);

  // PiP: isMinimizedをrefで追跡
  const isMinimizedRef = useRef(false);
  useEffect(() => { isMinimizedRef.current = !!isMinimized; }, [isMinimized]);

  // キーボードショートカット — refで最新状態を参照しeventリスナーは一度だけ登録
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isMinimizedRef.current) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const { sel, sorted, currentIdx, appoM, recallM, helpOpen, handleResult } = cfvKbRef.current;

      if (e.key === 'Escape') {
        if (appoM)    { e.preventDefault(); setAppoModal(null); return; }
        if (recallM)  { e.preventDefault(); setRecallModal(null); return; }
        if (helpOpen) { e.preventDefault(); setShowShortcutHelp(false); return; }
        return;
      }
      if (e.key === '?') { e.preventDefault(); setShowShortcutHelp(v => !v); return; }
      if (appoM || recallM || helpOpen) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (singleItemMode || currentIdx < 0) return;
        if (e.key === 'ArrowLeft' && currentIdx > 0) {
          setSelectedRow(sorted[currentIdx - 1]); setListMode(false);
        } else if (e.key === 'ArrowRight' && currentIdx < sorted.length - 1) {
          setSelectedRow(sorted[currentIdx + 1]); setListMode(false);
        }
        return;
      }

      if (!sel) return;
      const sc = cfvShortcuts.find(s => s.key === e.key);
      if (!sc) return;
      e.preventDefault();
      handleResult(sc.label);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 録音URLを同期取得して返す（insert前に呼び出す）
  // calledAt: 架電日時（insert直前に生成したISO文字列）
  // prevCalledAt: 同一企業の1つ前の架電レコードの called_at（時間窓の下限）
  const fetchRecordingUrl = async (phone, calledAt, prevCalledAt = null) => {
    try {
      const member = members.find(m => (typeof m === 'string' ? m : m.name) === currentUser);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (!zoomUserId || !phone) return null;
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      const { data } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: normalizedPhone, called_at: calledAt, prev_called_at: prevCalledAt });
      return data?.recording_url || null;
    } catch (e) {
      console.error('[fetchRecordingUrl] error:', e);
      return null;
    }
  };

  // zoom.us URLをSupabase Storageにアップロードして state を更新（非ブロッキング）
  const uploadRecordingToStorage = (recId, zoomUrl) => {
    if (!zoomUrl || !zoomUrl.includes('zoom.us')) return;
    ;(async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/upload-recording-to-drive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
          body: JSON.stringify({ call_record_id: recId, zoom_recording_url: zoomUrl }),
        });
        const data = await res.json();
        if (data.public_url) {
          setCallRecords(prev => prev.map(r => r.id === recId ? { ...r, recording_url: data.public_url } : r));
          console.log('[uploadRecordingToStorage] 完了:', recId, data.public_url);
        } else {
          console.warn('[uploadRecordingToStorage] 失敗:', data.error);
        }
      } catch (e) {
        console.error('[uploadRecordingToStorage] エラー:', e);
      }
    })();
  };

  // callStatusColor を getStatusColor で代替（isExcluded時も実際のステータス色を使用）
  const callStatusColor = (st) => getStatusColor(st || '未架電');

  const handleResult = async (result) => {
    console.log('[test] ステータスボタン押下');
    zoomPhone.hangUp();
    if (!selectedRow || selectedRound === null) { console.warn('[handleResult] 早期リターン — selectedRow:', selectedRow, '/ selectedRound:', selectedRound); return; }
    if (result === 'アポ獲得') { setAppoModal(selectedRow); return; }
    if (result === '受付再コール' || result === '社長再コール') {
      setRecallModal({
        row: selectedRow,
        statusId: result === '受付再コール' ? 'reception_recall' : 'ceo_recall',
        round: selectedRound,
        label: result,
      });
      return;
    }

    const calledAt = new Date().toISOString();
    const _prevRecResult = callRecords
      .filter(r => r.item_id === selectedRow.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const _prevCalledAtResult = _prevRecResult?.called_at || null;
    const _phone = lastDialedPhone || selectedRow.phone;

    // 録音URLなしで即DB登録
    const { result: newRec, error } = await insertCallRecord({
      item_id: selectedRow.id, list_id: list._supaId,
      round: selectedRound, status: result, memo: localMemo || null,
      called_at: calledAt, recording_url: null, getter_name: currentUser,
    });
    if (error || !newRec) {
      console.error('[handleResult] insertCallRecord 失敗');
      return;
    }

    // State更新・次企業遷移（即時）
    const newRecords = [...callRecords, newRec];
    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    // DB更新はバックグラウンドで実行（タイムアウトでUI更新がブロックされるのを防止）
    updateCallListItem(selectedRow.id, { call_status: result, is_excluded: newIsExcl })
      .catch(e => console.warn('[handleResult] updateCallListItem error:', e));
    // 再コール以外の結果 → 同企業の未完了再コールを自動完了
    completeRecallsForItem(selectedRow.id)
      .catch(e => console.warn('[handleResult] completeRecallsForItem error:', e));
    const updatedItem = { ...selectedRow, call_status: result, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === selectedRow.id ? updatedItem : i);
    setItems(newItems);
    setCallRecords(newRecords);
    _updateSessionProgress(selectedRow?.no);
    // 再コール一覧から来た場合はステータス入力後に一覧に戻る
    if (singleItemMode) {
      onClose();
    } else {
      // sorted（フィルタ済みリスト）の順序で次の架電可能な企業を探す
      const sortedIdx = sorted.findIndex(i => i.id === selectedRow.id);
      let next = null;
      for (let j = sortedIdx + 1; j < sorted.length; j++) {
        const ni = sorted[j];
        const niRecs = newRecords.filter(r => r.item_id === ni.id);
        const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
        const niLatest = niRecs.length > 0 ? niRecs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b) : null;
        const niRecall = niLatest && RECALL_STATUSES.has(niLatest.status);
        const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 10);
        if (!niExcl && !niRecall && niNext <= 10) { next = ni; break; }
      }
      setSelectedRow(next || updatedItem);
      if (autoDial && next?.phone) dialPhone(next.phone);
    }

    // 録音URLをバックグラウンドで取得してDBを後から更新
    ;(async () => {
      try {
        const url = await fetchRecordingUrl(_phone, calledAt, _prevCalledAtResult);
        if (url) {
          await updateCallRecordRecordingUrl(newRec.id, url);
          setCallRecords(prev => prev.map(r => r.id === newRec.id ? { ...r, recording_url: url } : r));
          uploadRecordingToStorage(newRec.id, url);
        } else {
          // 90秒後に再試行（Zoomの録音処理遅延対策）
          setTimeout(async () => {
            try {
              const url2 = await fetchRecordingUrl(_phone, calledAt, _prevCalledAtResult);
              if (url2) {
                await updateCallRecordRecordingUrl(newRec.id, url2);
                setCallRecords(prev => prev.map(r => r.id === newRec.id ? { ...r, recording_url: url2 } : r));
                uploadRecordingToStorage(newRec.id, url2);
              }
            } catch (e) { console.warn('[handleResult] 録音URL再試行エラー:', e); }
          }, 90_000);
        }
      } catch (e) { console.warn('[handleResult] 録音URL取得エラー:', e); }
    })();
  };

  const handleDeleteRecord = async (record) => {
    await deleteCallRecord(record.id);
    const newRecords = callRecords.filter(r => r.id !== record.id);
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const lastRec = [...itemRecs].sort((a, b) => b.round - a.round)[0];
    const newStatus = lastRec?.status || '未架電';
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    updateCallListItem(selectedRow.id, { call_status: newStatus, is_excluded: newIsExcl })
      .catch(e => console.warn('[handleDeleteRecord] updateCallListItem error:', e));
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, call_status: newStatus, is_excluded: newIsExcl } : i));
    setSelectedRow(prev => prev ? { ...prev, call_status: newStatus, is_excluded: newIsExcl } : prev);
    setSelectedRound(record.round);
  };

  const handleFetchRecording = async (rec) => {
    const item = items.find(i => i.id === rec.item_id);
    if (!item) return;
    const prevRec = callRecords
      .filter(r => r.item_id === rec.item_id && r.called_at < rec.called_at)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const url = await fetchRecordingUrl(item.phone, rec.called_at, prevRec?.called_at || null);
    if (!url) { alert('録音URLを取得できませんでした'); return; }
    const dbError = await updateCallRecordRecordingUrl(rec.id, url);
    if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
    setCallRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
  };

  // アポ報告フォーム用録音URL取得（Zoom APIからリトライ付きで今回の通話録音のみ取得）
  const handleAppoFetchRecording = async (_itemId, phone) => {
    const calledAt = new Date().toISOString();
    // 最大30秒（5秒×6回）リトライしてZoom録音を取得
    for (let i = 0; i < 6; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 5000));
      try {
        const url = await fetchRecordingUrl(phone, calledAt, null);
        if (url) return url;
      } catch (e) { console.warn('[handleAppoFetchRecording] リトライ', i + 1, e); }
    }
    return null;
  };

  const handleAppoSave = async (formData) => {
    if (!appoModal || selectedRound === null) return;

    const calledAtAppo = new Date().toISOString();
    const _prevRecAppo = callRecords
      .filter(r => r.item_id === appoModal.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const _prevCalledAtAppo = _prevRecAppo?.called_at || null;

    const recordingUrlAppo = await fetchRecordingUrl(appoModal.phone, calledAtAppo, _prevCalledAtAppo);

    const { result: newRec, error: recErr } = await insertCallRecord({
      item_id: appoModal.id, list_id: list._supaId,
      round: selectedRound, status: 'アポ獲得', memo: localMemo || null,
      called_at: calledAtAppo, recording_url: recordingUrlAppo, getter_name: currentUser,
    });
    if (recErr || !newRec) {
      console.error('[handleAppoSave] insertCallRecord 失敗 — calledCountは更新しない');
      return;
    }

    // 録音URL未取得の場合、自動リトライ（Zoomの録音処理遅延対策）
    // appoIdを保持してappo_reportも更新する
    const _appoItemId = appoModal.id;
    const _appoPhone = appoModal.phone;
    if (!recordingUrlAppo && newRec?.id) {
      const retryFetchRecording = async (delaySec) => {
        await new Promise(r => setTimeout(r, delaySec * 1000));
        try {
          const url = await fetchRecordingUrl(_appoPhone, calledAtAppo, _prevCalledAtAppo);
          if (url) {
            await updateCallRecordRecordingUrl(newRec.id, url);
            setCallRecords(prev => prev.map(r => r.id === newRec.id ? { ...r, recording_url: url } : r));
            console.log(`[handleAppoSave] 録音URL自動取得成功 (${delaySec}s後):`, newRec.id);
            uploadRecordingToStorage(newRec.id, url);
            // appo_reportの録音URLも更新
            if (formData.supaId) {
              await updateAppoReportRecordingUrl(formData.supaId, url);
              console.log('[handleAppoSave] appo_report録音URL更新完了');
            }
            return true;
          }
        } catch (e) { console.warn(`[handleAppoSave] 録音URL再試行エラー (${delaySec}s後):`, e); }
        return false;
      };
      // 120秒後に1回目、失敗なら240秒後に2回目
      retryFetchRecording(120).then(ok => { if (!ok) retryFetchRecording(240); });
    }

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);

    const itemRecs = newRecords.filter(r => r.item_id === appoModal.id);
    updateCallListItem(appoModal.id, { call_status: 'アポ獲得', is_excluded: true })
      .catch(e => console.warn('[handleAppoSave] updateCallListItem error:', e));
    // アポ獲得 → 同企業の未完了再コールを自動完了
    completeRecallsForItem(appoModal.id)
      .catch(e => console.warn('[handleAppoSave] completeRecallsForItem error:', e));
    const updatedItem = { ...appoModal, call_status: 'アポ獲得', is_excluded: true };
    const newItems = items.map(i => i.id === appoModal.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress(appoModal?.no);

    if (setAppoData) {
      const salesVal  = formData.sales  || 0;
      const rewardVal = formData.reward || 0;
      const newAppo = {
        client:     formData.client,
        company:    formData.company,
        getter:     formData.getter,
        getDate:    formData.getDate,
        meetDate:   formData.meetDate,
        status:     'アポ取得',
        note:       formData.note || '',
        appoReport: formData.appoReport || '',
        sales:      salesVal,
        reward:     rewardVal,
        month:      formData.meetDate ? (parseInt(formData.meetDate.slice(5, 7), 10) + '月') : '',
      };
      if (formData.supaId) newAppo._supaId = formData.supaId;
      setAppoData(prev => [...prev, newAppo]);
    }

    setAppoModal(null);
    if (singleItemMode) {
      onClose();
    } else {
      const idx = newItems.findIndex(i => i.id === appoModal.id);
      let next = null;
      for (let j = idx + 1; j < newItems.length; j++) {
        const ni = newItems[j];
        const niRecs = newRecords.filter(r => r.item_id === ni.id);
        const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
        const niLatest = niRecs.length > 0 ? niRecs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b) : null;
        const niRecall = niLatest && RECALL_STATUSES.has(niLatest.status);
        const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 10);
        if (!niExcl && !niRecall && niNext <= 10) { next = ni; break; }
      }
      setSelectedRow(next || updatedItem);
      if (autoDial && next?.phone) dialPhone(next.phone);
    }
    // zoom.us URLをSupabase Storageに変換（非ブロッキング）
    if (recordingUrlAppo && newRec?.id) uploadRecordingToStorage(newRec.id, recordingUrlAppo);
  };

  const handleRecallSave = async (recallData) => {
    if (!recallModal) return;
    const { row, round, label } = recallModal;
    const memoJson = JSON.stringify({
      recall_date: recallData.recallDate,
      recall_time: recallData.recallTime,
      assignee: recallData.assignee,
      note: recallData.note,
      recall_completed: false,
    });
    const calledAtRecall = new Date().toISOString();
    const _prevRecRecall = callRecords
      .filter(r => r.item_id === row.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];

    // 録音URL取得はブロッキングせず先にDBインサートを実行
    const { result: newRec, error } = await insertCallRecord({
      item_id: row.id, list_id: list._supaId,
      round, status: label, memo: memoJson,
      called_at: calledAtRecall, recording_url: null, getter_name: currentUser,
    });
    if (error || !newRec) { setRecallModal(null); return; }

    // 録音URL取得をバックグラウンドで実行
    const _prevCalledAtRecall = _prevRecRecall?.called_at || null;
    (async () => {
      try {
        const url = await fetchRecordingUrl(row.phone, calledAtRecall, _prevCalledAtRecall);
        if (url && newRec?.id) {
          await updateCallRecordRecordingUrl(newRec.id, url);
          setCallRecords(prev => prev.map(r => r.id === newRec.id ? { ...r, recording_url: url } : r));
          uploadRecordingToStorage(newRec.id, url);
        } else if (!url && newRec?.id) {
          // 未取得の場合、90秒後にリトライ
          setTimeout(async () => {
            try {
              const retryUrl = await fetchRecordingUrl(row.phone, calledAtRecall, _prevCalledAtRecall);
              if (retryUrl) {
                await updateCallRecordRecordingUrl(newRec.id, retryUrl);
                setCallRecords(prev => prev.map(r => r.id === newRec.id ? { ...r, recording_url: retryUrl } : r));
                console.log('[handleRecallSave] 録音URL自動取得成功:', newRec.id);
                uploadRecordingToStorage(newRec.id, retryUrl);
              }
            } catch (e) { console.warn('[handleRecallSave] 録音URL再試行エラー:', e); }
          }, 90_000);
        }
      } catch (e) { console.warn('[handleRecallSave] 録音URL取得エラー:', e); }
    })();

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === row.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    updateCallListItem(row.id, { call_status: label, is_excluded: newIsExcl })
      .catch(e => console.warn('[handleRecallSave] updateCallListItem error:', e));
    const updatedItem = { ...row, call_status: label, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === row.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress(row?.no);

    setRecallModal(null);
    if (singleItemMode) {
      onClose();
    } else {
      const idx = newItems.findIndex(i => i.id === row.id);
      let next = null;
      for (let j = idx + 1; j < newItems.length; j++) {
        const ni = newItems[j];
        const niRecs = newRecords.filter(r => r.item_id === ni.id);
        const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
        const niLatest = niRecs.length > 0 ? niRecs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b) : null;
        const niRecall = niLatest && RECALL_STATUSES.has(niLatest.status);
        const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 10);
        if (!niExcl && !niRecall && niNext <= 10) { next = ni; break; }
      }
      setSelectedRow(next || updatedItem);
      if (autoDial && next?.phone) dialPhone(next.phone);
    }
  };

  const handleMemoBlur = async () => {
    if (!selectedRow) return;
    const currentNote = extractUserNote(selectedRow.memo);
    if (localMemo === currentNote) return;
    setSavingMemo(true);
    const newMemo = buildMemoWithNote(selectedRow.memo, localMemo);
    const err = await updateCallListItem(selectedRow.id, { memo: newMemo });
    setSavingMemo(false);
    if (err) { console.error('[memo] DB保存失敗', err); return; }
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, memo: newMemo } : i));
    setSelectedRow(prev => prev?.id === selectedRow.id ? { ...prev, memo: newMemo } : prev);
  };

  const handleSubPhoneBlur = async () => {
    if (!selectedRow) return;
    const err = await updateCallListItem(selectedRow.id, { sub_phone_number: subPhone });
    if (err) {
      console.error('[subPhone] DB保存失敗 — call_list_items.sub_phone_numberカラムが存在しない可能性があります。SQL: ALTER TABLE call_list_items ADD COLUMN IF NOT EXISTS sub_phone_number TEXT;', err);
      return;
    }
    // DB保存後にメモリ上のitemsも更新（企業切り替え後に復元できるように）
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, sub_phone_number: subPhone } : i));
    setSelectedRow(prev => prev?.id === selectedRow.id ? { ...prev, sub_phone_number: subPhone } : prev);
  };

  const inputStyle = { width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: 'block' };

  // OLD_UI_START — 旧UIはここから（ロジックは一切変更なし）
  // eslint-disable-next-line no-constant-condition
  if (false) { return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: C.cream, zIndex: 10000, display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP'" }}>
      {/* ─── ヘッダー ─── */}
      <div style={{ padding: '10px 20px 8px', background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.company}</div>
            <div style={{ fontSize: 10, color: C.goldLight, marginTop: 1 }}>{list.industry} / 担当: {list.manager}</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { label: '総数',   value: stats.total,    color: C.white },
              { label: '架電済', value: stats.called,   color: C.goldLight },
              { label: '除外',   value: stats.excluded, color: '#fc8181' },
              { label: 'アポ',   value: stats.appo,     color: '#6fcf97' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono'", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: C.white + '80', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={toggleAutoDial} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
            border: '1px solid ' + (autoDial ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'),
            background: autoDial ? 'rgba(255,255,255,0.85)' : 'transparent',
            color: autoDial ? '#0D2247' : 'rgba(255,255,255,0.45)',
            fontSize: 10, fontWeight: 700, fontFamily: "'Noto Sans JP'",
          }}>
            <span style={{ fontSize: 12 }}>{autoDial ? '↻' : '▶'}</span>
            オートコール {autoDial ? 'ON' : 'OFF'}
          </button>
          <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 6, background: C.white + '15', border: '1px solid ' + C.white + '30', color: C.white, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ height: 4, background: C.white + '20', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: progress + '%', height: '100%', background: 'linear-gradient(90deg, #0D2247, #1E40AF)', borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ fontSize: 9, color: C.white + '60', marginTop: 3, textAlign: 'right' }}>{progress}% 架電済（{stats.called} / {stats.total}件）</div>
      </div>

      {/* ─── ボディ（左右分割 + 下部パネル） ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 左パネル：企業一覧 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid ' + C.borderLight }}>
          <div style={{ padding: '8px 12px', background: C.white, borderBottom: '1px solid ' + C.borderLight, flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="企業名・代表者・電話番号で検索..."
              style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', boxSizing: 'border-box' }} />
            {[['callable','架電可能'],['all','全件'],['excluded','除外']].map(([mode, label]) => (
              <button key={mode} onClick={() => { setFilterMode(mode); setPage(0); }}
                style={{ padding: '4px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                  background: filterMode === mode ? C.navy : 'transparent',
                  color: filterMode === mode ? C.white : C.textMid,
                  border: '1px solid ' + (filterMode === mode ? C.navy : C.border),
                }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
            ) : !list._supaId ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.textLight, fontSize: 13 }}>Supabase未登録リストです</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navyDeep, position: 'sticky', top: 0, zIndex: 1 }}>
                    {[['No', '52px'], ['企業名', null], ['事業内容', null], ['住所', '80px'], ['代表者', '90px'], ['電話番号', '112px'], ['結果', '76px']].map(([h, w]) => {
                      const dir = sortState.column === h ? sortState.direction : null;
                      return (
                        <th key={h} onClick={() => handleSort(h)}
                          style={{ padding: '7px 8px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', textTransform: 'uppercase', ...(w ? { width: w } : {}) }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {h}
                            <svg width="8" height="7" viewBox="0 0 8 7" style={{ flexShrink: 0 }}>
                              {dir === 'desc'
                                ? <polygon points="2,7 8,7 5,2" fill={C.goldLight} />
                                : dir === 'asc'
                                  ? <polygon points="2,0 8,0 5,5" fill={C.goldLight} />
                                  : <polygon points="2,2 8,2 5,7" fill="none" stroke={C.goldLight + '80'} strokeWidth="1" />
                              }
                            </svg>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, i) => {
                    const isSelected = selectedRow?.id === item.id;
                    const isCalled = item.call_status && item.call_status !== '未架電';
                    const sc = callStatusColor(item.call_status);
                    return (
                      <tr key={item.id} onClick={() => setSelectedRow(item)}
                        style={{ cursor: 'pointer', background: isSelected ? C.gold + '18' : isCalled ? '#f5f3ef' : i % 2 === 0 ? C.white : C.cream, borderLeft: isSelected ? '3px solid ' + C.gold : '3px solid transparent', transition: 'background 0.12s' }}>
                        <td style={{ padding: '6px 8px', fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight, whiteSpace: 'nowrap' }}>{item.no}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: C.navy, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 10, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.business}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 9, width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address || '—'}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 10, whiteSpace: 'nowrap' }}>{item.representative}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {item.phone
                            ? <span onClick={() => { dialPhone(item.phone); setSelectedRow(item); }} style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, fontWeight: 600, padding: '2px 5px', borderRadius: 3, background: isCalled ? 'transparent' : C.gold + '25', whiteSpace: 'nowrap', cursor: 'pointer' }}>{item.phone}</span>
                            : <span style={{ color: C.textLight, fontSize: 10 }}>-</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                            {getRecordsForItem(item.id).length > 0
                              ? (() => {
                                  const recs = getRecordsForItem(item.id);
                                  const statusVal = item.call_status || recs.reduce((a, b) => a.round >= b.round ? a : b).status;
                                  return `${recs.length}回/${statusVal}`;
                                })()
                              : (item.call_status || '未架電')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid ' + C.borderLight, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid ' + C.border, background: C.offWhite, cursor: page === 0 ? 'default' : 'pointer', fontSize: 11, color: page === 0 ? C.textLight : C.navy, fontFamily: "'Noto Sans JP'" }}>← 前</button>
              <span style={{ fontSize: 11, color: C.textMid }}>{page + 1} / {totalPages}（{sorted.length}件）</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid ' + C.border, background: C.offWhite, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: 11, color: page === totalPages - 1 ? C.textLight : C.navy, fontFamily: "'Noto Sans JP'" }}>次 →</button>
            </div>
          )}
        </div>

        {/* ── 右パネル：企業詳細 ── */}
        <div style={{ width: 380, flexShrink: 0, overflow: 'auto', background: C.white }}>
          {!selectedRow ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 13, padding: 24, textAlign: 'center' }}>
              左のリストから企業を選択してください
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              {/* 企業名 */}
              <div style={{ fontSize: 17, fontWeight: 800, color: C.navy, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid ' + C.borderLight }}>
                {selectedRow.company}
              </div>

              {/* 基本情報 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id);
                const latest = recs.length > 0 ? recs.reduce((a, b) => a.round >= b.round ? a : b) : null;
                const lastResult = latest ? latest.status : (selectedRow.call_status || '未架電');
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>基本情報</div>
                    {[
                      { label: '事業内容', value: selectedRow.business },
                      { label: '住所', value: (selectedRow.address || '').replace(/\/\s*$/, '') },
                      { label: '代表者', value: selectedRow.representative },
                      { label: '前回架電結果', value: lastResult },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                        <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value || '-'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* 詳細情報 */}
              {(() => {
                let parsedMemo = null;
                if (selectedRow.memo) { try { parsedMemo = JSON.parse(selectedRow.memo); } catch { /* plain text */ } }
                const netIncome = selectedRow.net_income ?? parsedMemo?.net_income ?? null;
                const biko = parsedMemo?.biko ?? (selectedRow.memo && !parsedMemo ? selectedRow.memo : null);
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>詳細情報</div>
                    {[
                      { label: '売上', value: selectedRow.revenue != null ? Number(selectedRow.revenue).toLocaleString() + ' 千円' : '-' },
                      { label: '当期純利益', value: netIncome != null ? Number(netIncome).toLocaleString() + ' 千円' : '-' },
                      { label: '備考', value: biko || '-' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 11, color: C.textLight, flexShrink: 0, width: 84 }}>{label}</span>
                        <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* 電話発信ボタン */}
              {selectedRow.phone && (
                <div onClick={() => { dialPhone(selectedRow.phone); setLastDialedPhone(selectedRow.phone); }} style={{ display: 'block', marginBottom: 12, padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', textAlign: 'center', boxShadow: '0 2px 8px ' + C.navy + '40', cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.white + 'cc', marginBottom: 3 }}>電話をかける</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.white, fontFamily: "'JetBrains Mono'" }}>{selectedRow.phone}</div>
                </div>
              )}

              {/* サブ電話番号入力・発信 */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <input
                  type="tel"
                  value={subPhone}
                  onChange={e => setSubPhone(e.target.value)}
                  onBlur={handleSubPhoneBlur}
                  placeholder="別の番号に架電"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }}
                />
                <button
                  onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); setLastDialedPhone(subPhone.trim()); }}
                  disabled={!subPhone.trim()}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 13, opacity: subPhone.trim() ? 1 : 0.4, lineHeight: 1 }}
                >発信</button>
              </div>

              {/* ラウンドボタン */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(r => {
                    const roundRec = getRecordsForItem(selectedRow.id).find(rec => rec.round === r);
                    const nextRound = getNextRound(selectedRow.id);
                    const isCompleted = !!roundRec;
                    const isCurrent = r === nextRound && !isCompleted;
                    const isFuture = r > nextRound;
                    const isSelected = r === selectedRound;
                    const bg = isCompleted ? C.border : isCurrent ? C.gold : 'transparent';
                    const color = isCompleted ? C.textLight : isCurrent ? C.navy : C.textLight;
                    const border = isSelected
                      ? '2px solid ' + C.navy
                      : isFuture ? '1px solid ' + C.borderLight
                      : isCompleted ? '1px solid ' + C.border
                      : '1px solid ' + C.gold;
                    return (
                      <button key={r} disabled={isFuture}
                        onClick={() => !isFuture && setSelectedRound(r)}
                        style={{ width: 34, height: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
                          background: bg, color, border, cursor: isFuture ? 'default' : 'pointer',
                          fontFamily: "'JetBrains Mono'", opacity: isFuture ? 0.3 : 1, flexShrink: 0,
                        }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ステータスエリア：ラウンド記録済み→バッジ+取消 / 未記録→8ボタン */}
              {(() => {
                const roundRec = getRecordsForItem(selectedRow.id).find(r => r.round === selectedRound);
                const sc = roundRec ? callStatusColor(roundRec.status) : null;
                return roundRec ? (
                  <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 8,
                    background: sc.bg, border: '1.5px solid ' + sc.color + '40',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>
                      {selectedRound}回目の結果：{roundRec.status}
                    </span>
                    <button onClick={() => handleDeleteRecord(roundRec)}
                      style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4,
                        border: '1px solid ' + C.border, background: C.white,
                        cursor: 'pointer', color: C.textMid, fontFamily: "'Noto Sans JP'" }}>取消</button>
                  </div>
                ) : (
                  <div>
                    {/* 大ボタン3つ: 不通・社長不在・アポ獲得 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                      {callStatuses.filter(r => ['missed', 'absent', 'appointment'].includes(r.id)).map(r => {
                        const isAppo = r.id === 'appointment';
                        return (
                          <button key={r.id} onClick={() => handleResult(r.label)}
                            style={{ height: 48, borderRadius: 7, border: isAppo ? '1.5px solid ' + C.gold : '1px solid ' + C.navy + '25', background: isAppo ? C.gold : C.navy + '08', color: isAppo ? C.white : C.navy, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Noto Sans JP'" }}>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* 小ボタン: 残りのステータス */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: 14 }}>
                      {callStatuses.filter(r => !['missed', 'absent', 'appointment'].includes(r.id)).map(r => {
                        const isExcl = r.id === 'excluded';
                        return (
                          <button key={r.id} onClick={() => handleResult(r.label)}
                            style={{ height: 34, borderRadius: 6, border: isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25', background: isExcl ? C.red + '10' : C.navy + '08', color: isExcl ? C.red : C.navy, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* AI企業分析 */}
              {(() => {
                const hasAi = selectedRow.ai_overview || selectedRow.ai_strengths;
                const genAt = selectedRow.ai_generated_at ? new Date(selectedRow.ai_generated_at) : null;
                const genLabel = genAt ? `${genAt.getMonth() + 1}/${genAt.getDate()} ${genAt.getHours()}:${String(genAt.getMinutes()).padStart(2, '0')}` : '';
                return (
                  <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid ' + (hasAi ? '#3B82F620' : C.border), background: hasAi ? '#EFF6FF' : C.offWhite }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: hasAi ? 8 : 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>AI企業分析</span>
                      {hasAi && genLabel && <span style={{ fontSize: 9, color: C.textLight, marginLeft: 6 }}>{genLabel}生成</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        {aiGenerating ? (
                          <span style={{ fontSize: 9, color: '#3B82F6', fontWeight: 600 }}>生成中...</span>
                        ) : (
                          <button onClick={async () => {
                            setAiGenerating(true);
                            try {
                              const { data } = await invokeGenerateCompanyInfo({ itemId: selectedRow.id, company: selectedRow.company, representative: selectedRow.representative });
                              if (data?.overview || data?.strengths) {
                                const updated = { ...selectedRow, ai_overview: data.overview, ai_strengths: data.strengths, ai_generated_at: new Date().toISOString() };
                                setItems(prev => prev.map(it => it.id === selectedRow.id ? updated : it));
                                setSelectedRow(updated);
                              }
                            } catch (e) { console.error('[AI企業分析] error:', e); }
                            setAiGenerating(false);
                          }}
                            style={{ fontSize: 9, fontWeight: 600, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Noto Sans JP'" }}>
                            {hasAi ? '再生成' : '生成する'}
                          </button>
                        )}
                      </span>
                    </div>
                    {!hasAi && !aiGenerating && (
                      <div style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>企業HPをもとに概要・特徴を自動生成します</div>
                    )}
                    {hasAi && (
                      <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: "'Noto Sans JP'" }}>
                        {selectedRow.ai_overview && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 10, color: C.navy, marginBottom: 2 }}>企業概要</div>
                            <div style={{ marginBottom: 8 }}>{selectedRow.ai_overview}</div>
                          </>
                        )}
                        {selectedRow.ai_strengths && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 10, color: C.navy, marginBottom: 2 }}>特徴・強み</div>
                            <div style={{ whiteSpace: 'pre-line' }}>{selectedRow.ai_strengths}</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* メモ（onBlurで自動保存） */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  メモ
                  {savingMemo && <span style={{ fontSize: 9, color: C.textLight, fontWeight: 400 }}>保存中...</span>}
                </div>
                <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleMemoBlur}
                  placeholder="架電メモを入力（フォーカスを外すと自動保存）..."
                  style={{ width: '100%', minHeight: 72, padding: '8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: C.offWhite }} />
              </div>

              {/* 架電履歴 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id).slice().sort((a, b) => a.round - b.round);
                if (recs.length === 0) return null;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dtStr = formatJST(rec.called_at);
                        return (
                          <div key={rec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 8px', borderRadius: 5, background: C.offWhite, fontSize: 11 }}>
                              <span style={{ fontWeight: 700, color: C.navy, minWidth: 36, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                              <span style={{ flex: 1, color: sc.color, fontWeight: 600 }}>{rec.status}</span>
                              <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                              {rec.recording_url
                                ? <button
                                    onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                    title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                                      padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>録音</button>
                                : <button onClick={() => handleFetchRecording(rec)}
                                    title="録音URLを手動取得"
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>更新</button>
                              }
                            </div>
                            {activeRecordingId === rec.id && rec.recording_url && (
                              <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      </div>

      {/* ── 下部スクリプトパネル ── */}
      <div style={{ flexShrink: 0, background: C.white, borderTop: '2px solid ' + C.gold }}>
        <div onClick={() => setScriptPanelOpen(p => !p)}
          style={{ cursor: 'pointer', padding: '5px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', background: C.gold + '08' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>スクリプト</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scriptPanelOpen && [
              { key: 'script',   label: 'スクリプト' },
              { key: 'rebuttal', label: 'アウト返し' },
              { key: 'info',     label: '企業概要' },
              { key: 'cautions', label: '注意事項' },
              { key: 'calendar', label: 'カレンダー' },
            ].map(tab => (
              <button key={tab.key} onClick={e => { e.stopPropagation(); setScriptTab(tab.key); }}
                style={{ fontSize: 9, padding: '2px 10px', borderRadius: 4, border: scriptTab === tab.key ? '1px solid ' + C.gold : '1px solid ' + C.borderLight, background: scriptTab === tab.key ? C.gold + '20' : C.white, color: scriptTab === tab.key ? C.navy : C.textMid, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: scriptTab === tab.key ? 700 : 400 }}>
                {tab.label}
              </button>
            ))}
            <span style={{ fontSize: 11, color: C.textMid, lineHeight: 1 }}>{scriptPanelOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        {scriptPanelOpen && (
          <div style={{ height: 120, overflowY: 'auto', padding: '8px 16px' }}>
            {scriptTab === 'script' && (() => {
              const pdfs = Array.isArray(list.scriptPdfs) ? list.scriptPdfs : [];
              return (
                <>
                  {list.scriptBody
                    ? renderMarkedScript(list.scriptBody, { fontSize: 11, color: C.textDark, lineHeight: 1.7 })
                    : <div style={{ color: C.textLight, fontSize: 11 }}>スクリプト未設定</div>}
                  {pdfs.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed ' + C.borderLight }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.navy, marginBottom: 4 }}>添付PDF</div>
                      {pdfs.map((pdf, i) => (
                        <button key={pdf.path || i}
                          onClick={() => handleOpenScriptPdf(pdf)}
                          title={pdf.name}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: '#F8F9FA', border: '1px solid ' + C.borderLight, borderLeft: '2px solid ' + C.navy, borderRadius: 3, padding: '3px 6px', fontSize: 10, color: C.navy, fontWeight: 500, cursor: 'pointer', marginBottom: 3, textDecoration: 'underline', fontFamily: "'Noto Sans JP'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pdf.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {scriptTab === 'rebuttal' && (() => {
              let rd = null;
              try { rd = list.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch {}
              const data = rd || qaData;
              if (!data) return <div style={{ color: C.textLight, fontSize: 11 }}>アウト返し未設定（Scriptsページで設定できます）</div>;
              return (
                <div>
                  {!rd && qaData && <div style={{ fontSize: 9, color: C.gold, marginBottom: 6, fontWeight: 500 }}>共通のアウト返しを表示中</div>}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {[['reception', '受付対応'], ['president', '社長対応']].map(([k, l]) => (
                      <button key={k} onClick={() => setQaSubTab(k)}
                        style={{ fontSize: 9, padding: '2px 10px', borderRadius: 4, border: qaSubTab === k ? '1px solid ' + C.gold : '1px solid ' + C.borderLight, background: qaSubTab === k ? C.gold + '20' : C.white, color: qaSubTab === k ? C.navy : C.textMid, cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: qaSubTab === k ? 700 : 400 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {(data[qaSubTab] || []).map((item, i) => (
                    <div key={i} style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 4, background: '#F8F9FA', borderLeft: '3px solid ' + C.navy }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 3 }}>Q: {item.q}</div>
                      <div style={{ fontSize: 10, color: C.navy, lineHeight: 1.6 }}>A: {item.a}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {scriptTab === 'info' && (
              list.companyInfo
                ? <pre style={{ fontSize: 11, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.companyInfo}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>企業概要未設定</div>
            )}
            {scriptTab === 'cautions' && (
              list.cautions
                ? <CautionsCards text={list.cautions} fontSize={11} filter="non-calendar" />
                : <div style={{ color: C.textLight, fontSize: 11 }}>注意事項未設定</div>
            )}
            {scriptTab === 'calendar' && (() => {
              const cl = (clientData || []).find(c => c.company === list.company);
              const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
              const linkedContacts = (list.contactIds || [])
                .map(cid => contacts.find(ct => ct.id === cid))
                .filter(Boolean);
              if (linkedContacts.length === 0 && list.manager) {
                const fallback = contacts.find(ct => ct.name?.includes(list.manager));
                if (fallback) linkedContacts.push(fallback);
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MultiCalendarPanel
                    contacts={linkedContacts}
                    fallbackClient={cl}
                    updateContactFn={(ctId, ctData) => {
                      return updateClientContact(ctId, ctData).then(() => {
                        if (setContactsByClient && cl?._supaId) {
                          setContactsByClient(prev => ({
                            ...prev,
                            [cl._supaId]: (prev[cl._supaId] || []).map(ct => ct.id === ctId ? { ...ct, ...ctData } : ct),
                          }));
                        }
                      });
                    }}
                    compact
                    onSelectSlot={(dateStr, timeLabel) => { if (selectedRow) setQuickAppoSlot({ date: dateStr, time: timeLabel }); }}
                    existingAppointments={(appoData || []).filter(a => a.client === list.company && a.meetDate && a.meetTime)}
                    staticNoteLines={extractCalendarCautionLines(list.cautions)}
                  />
                </div>
              );
            })()}
          </div>
        )}
      </div>
      </div>

      {/* ─── アポ取得報告モーダル ─── */}
      {appoModal && (
        <AppoReportModal
          row={appoModal}
          list={list}
          currentUser={currentUser}
          members={members}
          clientData={clientData}
          rewardMaster={rewardMaster}
          onClose={() => setAppoModal(null)}
          onSave={handleAppoSave}
          initialRecordingUrl={''}
          onFetchRecordingUrl={() => handleAppoFetchRecording(appoModal.id, appoModal.phone)}
        />
      )}

      {/* ─── 再コール日時設定モーダル ─── */}
      {recallModal && (
        <RecallModal
          row={recallModal.row}
          statusId={recallModal.statusId}
          onSubmit={handleRecallSave}
          onCancel={() => setRecallModal(null)}
          members={members}
          currentUser={currentUser}
        />
      )}

      {/* ─── カレンダーからの簡易アポ登録モーダル ─── */}
      {quickAppoSlot && selectedRow && (() => {
        const cl = (clientData || []).find(c => c.company === list.company);
        const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
        const lcs = (list.contactIds || []).map(cid => contacts.find(ct => ct.id === cid)).filter(Boolean);
        const primaryLc = lcs[0] || (list.manager ? contacts.find(ct => ct.name?.includes(list.manager)) : null);
        return (
          <QuickAppoModal
            date={quickAppoSlot.date}
            time={quickAppoSlot.time}
            row={selectedRow}
            list={list}
            clientInfo={cl ? { _supaId: cl._supaId, slackWebhookUrl: cl.slackWebhookUrlInternal || cl.slackWebhookUrl, googleCalendarId: primaryLc?.googleCalendarId || cl?.googleCalendarId || '' } : null}
            contacts={contacts}
            currentUser={currentUser}
            onClose={() => setQuickAppoSlot(null)}
            onSave={() => { setQuickAppoSlot(null); }}
          />
        );
      })()}
    </div>
  ); } // OLD_UI_END

  // ── NEW UI: フルスクリーン・1企業集中モード ──────────────────────────
  // ref を毎レンダーで最新化（keydownハンドラーが参照する）
  cfvKbRef.current = { sel: selectedRow, sorted, currentIdx, appoM: appoModal, recallM: recallModal, helpOpen: showShortcutHelp, handleResult };

  // PiP: summaryRefを更新
  useEffect(() => {
    if (summaryRef) {
      summaryRef.current = {
        company: selectedRow?.company || list.company || '',
        position: currentIdx >= 0 ? `${currentIdx + 1} / ${sorted.length}件` : `- / ${sorted.length}件`,
        total: sorted.length,
      };
    }
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#F8F9FA', zIndex: 10000, display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP'" }}>

      {/* ── ヘッダーバー（height:48px） ── */}
      <div style={{ height: 48, background: '#0D2247', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

        {/* 左: リストに戻る（集中モード時のみ表示） */}
        {!listMode && (
          <button onClick={() => setListMode(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              background: 'rgba(255,255,255,0.07)', color: '#fff' }}>
            {isMobile ? '◀' : '◀ リストに戻る'}
          </button>
        )}


        {/* 中央: 位置表示 + 前へ/次へ（singleItemMode時は非表示） */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {!singleItemMode && (<>
          <button
            onClick={() => { if (currentIdx > 0) { setSelectedRow(sorted[currentIdx - 1]); setListMode(false); } }}
            disabled={currentIdx <= 0}
            style={{ padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: currentIdx <= 0 ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.5)',
              background: currentIdx <= 0 ? 'transparent' : 'rgba(255,255,255,0.1)',
              color: currentIdx <= 0 ? 'rgba(255,255,255,0.3)' : '#ffffff',
              cursor: currentIdx <= 0 ? 'default' : 'pointer' }}>
            ◀ 前へ
          </button>
          <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, minWidth: 90, textAlign: 'center', fontFamily: "'JetBrains Mono'" }}>
            {currentIdx >= 0 ? `${currentIdx + 1} / ${sorted.length}` : `- / ${sorted.length}`}件
          </span>
          <button
            onClick={() => { if (currentIdx < sorted.length - 1) { setSelectedRow(sorted[currentIdx + 1]); setListMode(false); } }}
            disabled={currentIdx >= sorted.length - 1}
            style={{ padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
              border: currentIdx >= sorted.length - 1 ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.5)',
              background: currentIdx >= sorted.length - 1 ? 'transparent' : 'rgba(255,255,255,0.1)',
              color: currentIdx >= sorted.length - 1 ? 'rgba(255,255,255,0.3)' : '#ffffff',
              cursor: currentIdx >= sorted.length - 1 ? 'default' : 'pointer' }}>
            次へ ▶
          </button>
          </>)}
        </div>

        {/* 右: オートコール + 閉じる */}
        <button onClick={toggleAutoDial}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
            border: '1px solid ' + (autoDial ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'),
            background: autoDial ? 'rgba(255,255,255,0.85)' : 'transparent',
            color: autoDial ? '#0D2247' : 'rgba(255,255,255,0.45)',
            fontSize: 10, fontWeight: 700, fontFamily: "'Noto Sans JP'" }}>
          <span>{autoDial ? '↻' : '▶'}</span>
          オートコール {autoDial ? 'ON' : 'OFF'}
        </button>
        {onMinimize && (
          <button onClick={onMinimize} title="最小化"
            style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
            ⊟
          </button>
        )}
        <button onClick={handleClose}
          style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>
          ✕
        </button>
      </div>

      {/* ── メインエリア（2カラム / モバイルは縦並び） ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>

        {/* 左カラム（モバイル時は全幅） */}
        <div style={{ width: listMode ? '100%' : isMobile ? '100%' : '60%', overflow: 'auto', padding: isMobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {listMode ? (
            /* ────────────── リスト表示モード ────────────── */
            <div style={{ background: '#fff', borderRadius: 4, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              {/* 検索バー + 架電開始ボタン */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', gap: 6, alignItems: 'center', background: '#F8F9FA', flexWrap: 'wrap' }}>
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="検索..."
                  style={{ width: 180, minWidth: 120, padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', boxSizing: 'border-box' }} />
                {[['callable','架電可能'],['all','全件'],['excluded','架電不可']].map(([mode, label]) => (
                  <button key={mode} onClick={() => { setFilterMode(mode); setStatusFilterLocal([]); setPage(0); }}
                    style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                      background: filterMode === mode && statusFilterLocal.length === 0 ? '#0D2247' : 'transparent',
                      color: filterMode === mode && statusFilterLocal.length === 0 ? '#fff' : '#9CA3AF',
                      border: '1px solid ' + (filterMode === mode && statusFilterLocal.length === 0 ? '#0D2247' : '#E5E7EB') }}>
                    {label}
                  </button>
                ))}
                {/* ステータスフィルタ（複数選択対応） */}
                <span style={{ color: '#D1D5DB', fontSize: 10 }}>|</span>
                {['全ステータス', '未架電', ...callStatuses.map(s => s.label)].map(st => {
                  const isAll = st === '全ステータス';
                  const isActive = isAll ? statusFilterLocal.length === 0 : statusFilterLocal.includes(st);
                  return (
                  <button key={st} onClick={() => {
                    if (isAll) { setStatusFilterLocal([]); }
                    else {
                      setStatusFilterLocal(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]);
                      setFilterMode('all');
                    }
                    setPage(0);
                  }}
                    style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                      background: isActive ? '#0D2247' : 'transparent',
                      color: isActive ? '#fff' : '#9CA3AF',
                      border: '1px solid ' + (isActive ? '#0D2247' : '#E5E7EB') }}>
                    {st}
                  </button>
                  );
                })}
                <span style={{ color: '#D1D5DB', fontSize: 10 }}>|</span>
                {/* 売上高フィルター */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#706E6B', whiteSpace: 'nowrap' }}>
                  <span>売上高</span>
                  {[
                    { value: revenueMin, setter: (v) => { setRevenueMin(v); setPage(0); }, isMax: false },
                    { value: revenueMax, setter: (v) => { setRevenueMax(v); setPage(0); }, isMax: true },
                  ].map(({ value, setter, isMax }, idx) => (
                    <React.Fragment key={idx}>
                      {idx === 1 && <span>〜</span>}
                      <select value={value} onChange={e => setter(e.target.value)}
                        style={{ padding: '3px 4px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 10, fontFamily: "'Noto Sans JP'", background: value ? '#EFF6FF' : '#fff', color: '#0D2247', cursor: 'pointer' }}>
                        <option value="">指定なし</option>
                        {[['1億円',100000],['2億円',200000],['3億円',300000],['4億円',400000],['5億円',500000],
                          ['6億円',600000],['7億円',700000],['8億円',800000],['9億円',900000],['10億円',1000000],
                          ['20億円',2000000],['30億円',3000000],['40億円',4000000],['50億円',5000000]].map(([label, val]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                        {isMax && <option value="999999999">50億円以上</option>}
                      </select>
                    </React.Fragment>
                  ))}
                </div>
                <span style={{ color: '#D1D5DB', fontSize: 10 }}>|</span>
                {prefOptions.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    {prefDropOpen && (
                      <div onClick={() => setPrefDropOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
                    )}
                    <button onClick={() => setPrefDropOpen(v => !v)} style={{
                      padding: '3px 8px', borderRadius: 4,
                      border: '1px solid ' + (prefFilters.length > 0 ? '#0D2247' : '#E5E7EB'),
                      background: prefFilters.length > 0 ? '#EFF6FF' : '#fff',
                      fontSize: 10, fontFamily: "'Noto Sans JP'", cursor: 'pointer',
                      color: '#0D2247', whiteSpace: 'nowrap',
                    }}>
                      {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : '都道府県▼'}
                    </button>
                    {prefDropOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 101,
                        background: '#fff', border: '1px solid #E5E7EB',
                        borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        minWidth: 130, maxHeight: 220, overflowY: 'auto', padding: '4px 0',
                      }}>
                        {prefFilters.length > 0 && (
                          <div onClick={() => { setPrefFilters([]); setPage(0); }} style={{
                            padding: '4px 10px', fontSize: 10, color: '#0D2247', cursor: 'pointer',
                            borderBottom: '1px solid #E5E7EB', fontWeight: 600,
                          }}>クリア</div>
                        )}
                        {prefOptions.map(p => (
                          <label key={p} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', cursor: 'pointer', fontSize: 10,
                            fontFamily: "'Noto Sans JP'", color: '#0D2247',
                          }}>
                            <input type="checkbox" checked={prefFilters.includes(p)}
                              onChange={() => {
                                setPrefFilters(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
                                setPage(0);
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* 架電開始ボタン（右端） */}
                <div style={{ marginLeft: 'auto', paddingLeft: 24 }}>
                  <button onClick={handleStartCalling} disabled={sessionStarted || sorted.length === 0}
                    style={{ padding: '6px 20px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: sessionStarted ? 'default' : 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                      background: sessionStarted ? '#6B7280' : '#0D2247', color: '#fff', border: 'none', opacity: sessionStarted ? 0.6 : 1 }}>
                    {sessionStarted ? '架電中' : '架電開始'}
                  </button>
                </div>
              </div>
              {/* テーブル */}
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: '#706E6B', fontSize: 13 }}>読み込み中...</div>
                ) : !list._supaId ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: '#706E6B', fontSize: 13 }}>Supabase未登録リストです</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#0D2247', position: 'sticky', top: 0, zIndex: 1 }}>
                        {[['No', '52px'], ['企業名', null], ['事業内容', null], ['住所', '90px'], ['売上高', '90px'], ['代表者', '90px'], ['電話番号', '112px'], ['最終架電日', '80px'], ['担当者', '70px'], ['結果', '80px']].map(([h, w]) => {
                          const dir = sortState.column === h ? sortState.direction : null;
                          return (
                            <th key={h} onClick={() => handleSort(h)}
                              style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', ...(w ? { width: w } : {}) }}>
                              {h}{dir === 'desc' ? ' ▼' : dir === 'asc' ? ' ▲' : ''}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item, i) => {
                        const isSelected = selectedRow?.id === item.id;
                        const sc = callStatusColor(item.call_status);
                        return (
                          <tr key={item.id}
                            onClick={() => { setSelectedRow(item); setListMode(false); }}
                            style={{ cursor: 'pointer', background: isSelected ? '#EFF6FF' : i % 2 === 0 ? '#fff' : '#F8F9FA', borderBottom: '1px solid #E5E7EB', transition: 'background 0.12s', borderLeft: isSelected ? '3px solid #0D2247' : '3px solid transparent' }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#EFF6FF'; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8F9FA'; }}>
                            <td style={{ padding: '7px 8px', fontFamily: "'JetBrains Mono'", fontSize: 9, color: '#6B7280', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.no}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 600, color: '#0D2247', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</td>
                            <td style={{ padding: '7px 8px', color: '#6B7280', fontSize: 10, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.business}</td>
                            <td style={{ padding: '7px 8px', color: '#6B7280', fontSize: 9, width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address || '—'}</td>
                            <td style={{ padding: '7px 8px', fontFamily: "'JetBrains Mono'", fontSize: 9, color: '#6B7280', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {item.revenue != null ? `${Number(item.revenue).toLocaleString()}千円` : <span style={{ color: '#9CA3AF' }}>-</span>}
                            </td>
                            <td style={{ padding: '7px 8px', color: '#6B7280', fontSize: 10, whiteSpace: 'nowrap' }}>{item.representative}</td>
                            <td style={{ padding: '7px 8px' }}>
                              {item.phone
                                ? <span onClick={e => { e.stopPropagation(); dialPhone(item.phone); setSelectedRow(item); setListMode(false); setLastDialedPhone(item.phone); }}
                                    style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#0D2247', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#0D224715', border: '1px solid #0D224730', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                    {item.phone}
                                  </span>
                                : <span style={{ color: '#9CA3AF', fontSize: 10 }}>-</span>}
                            </td>
                            <td style={{ padding: '7px 8px', fontSize: 9, color: '#6B7280', whiteSpace: 'nowrap' }}>
                              {(() => { const recs = getRecordsForItem(item.id); if (!recs.length) return <span style={{ color: '#9CA3AF' }}>-</span>; const latest = recs.reduce((a, b) => new Date(a.called_at || 0) > new Date(b.called_at || 0) ? a : b); return formatJST(latest.called_at); })()}
                            </td>
                            <td style={{ padding: '7px 8px', fontSize: 9, color: '#6B7280', whiteSpace: 'nowrap' }}>
                              {(() => { const recs = getRecordsForItem(item.id); if (!recs.length) return <span style={{ color: '#9CA3AF' }}>-</span>; const latest = recs.reduce((a, b) => new Date(a.called_at || 0) > new Date(b.called_at || 0) ? a : b); return latest.getter_name || <span style={{ color: '#9CA3AF' }}>-</span>; })()}
                            </td>
                            <td style={{ padding: '7px 8px' }}>
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                                {getRecordsForItem(item.id).length > 0
                                  ? (() => {
                                      const recs = getRecordsForItem(item.id);
                                      const statusVal = item.call_status || recs.reduce((a, b) => a.round >= b.round ? a : b).status;
                                      return `${recs.length}回/${statusVal}`;
                                    })()
                                  : (item.call_status || '未架電')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {/* ページネーション */}
              {totalPages > 1 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ padding: '4px 12px', borderRadius: 4, border: page === 0 ? '1px solid #E5E7EB' : '1px solid #0D2247', background: page === 0 ? '#F8F9FA' : 'white', cursor: page === 0 ? 'default' : 'pointer', fontSize: 11, color: page === 0 ? '#9CA3AF' : '#0D2247', fontFamily: "'Noto Sans JP'" }}>← 前</button>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>{page + 1} / {totalPages}（{sorted.length}件）</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    style={{ padding: '4px 12px', borderRadius: 4, border: page === totalPages - 1 ? '1px solid #E5E7EB' : '1px solid #0D2247', background: page === totalPages - 1 ? '#F8F9FA' : 'white', cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: 11, color: page === totalPages - 1 ? '#9CA3AF' : '#0D2247', fontFamily: "'Noto Sans JP'" }}>次 →</button>
                </div>
              )}
            </div>

          ) : selectedRow ? (
            /* ────────────── フォーカスモード ────────────── */
            <>
              {/* ① 企業情報カード */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id);
                const latest = recs.length > 0 ? recs.reduce((a, b) => a.round >= b.round ? a : b) : null;
                const lastResult = latest ? latest.status : (selectedRow.call_status || '未架電');
                const prevBadgeStyle = (() => {
                  if (!latest) return { bg: '#F3F2F2', color: '#706E6B' };
                  const s = latest.status;
                  if (s === '不通' || s === '受付ブロック') return { bg: '#FEF1EE', color: '#EA001E' };
                  if (s === '社長不在' || s === '受付再コール' || s === '社長再コール') return { bg: '#FFF8ED', color: '#C07600' };
                  if (s === 'アポ獲得') return { bg: '#EEF7EE', color: '#2E844A' };
                  return { bg: '#F3F2F2', color: '#706E6B' };
                })();
                let parsedMemo = null;
                if (selectedRow.memo) { try { parsedMemo = JSON.parse(selectedRow.memo); } catch {} }
                return (
                  <div style={{ padding: 20, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#0D2247', flex: 1, lineHeight: 1.3 }}>{selectedRow.company}</div>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: prevBadgeStyle.bg, color: prevBadgeStyle.color, flexShrink: 0 }}>
                        {lastResult}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 14 }}>
                      {[
                        { label: '事業内容', value: selectedRow.business },
                        { label: '代表者', value: selectedRow.representative },
                        { label: '住所', value: (selectedRow.address || '').replace(/\/\s*$/, '') },
                        { label: '売上', value: selectedRow.revenue != null ? Number(selectedRow.revenue).toLocaleString() + ' 千円' : null },
                      ].filter(x => x.value).map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 10, color: '#a0a0a0', flexShrink: 0, paddingTop: 2, minWidth: 56 }}>{label}</span>
                          <span style={{ fontSize: 12, color: '#0D2247', fontWeight: 500, wordBreak: 'break-all' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#a0a0a0', marginBottom: 4 }}>
                        メモ{savingMemo && <span style={{ marginLeft: 6, fontSize: 9, color: '#b0b0b0' }}>保存中...</span>}
                      </div>
                      <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleMemoBlur}
                        placeholder="架電メモ（フォーカスを外すと自動保存）"
                        style={{ width: '100%', minHeight: 52, padding: '7px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#F8F9FA' }} />
                    </div>
                  </div>
                );
              })()}

              {/* ② 架電エリア */}
              <div style={{ padding: 16, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                {/* 電話番号 */}
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#0D2247', fontFamily: "'JetBrains Mono'", letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {selectedRow.phone || '電話番号なし'}
                  </div>
                </div>
                {/* 架電ラウンド選択 */}
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 14 }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(r => {
                    const roundRec = getRecordsForItem(selectedRow.id).find(rec => rec.round === r);
                    const nextRound = getNextRound(selectedRow.id);
                    const isCompleted = !!roundRec;
                    const isCurrent = r === nextRound && !isCompleted;
                    const isFuture = r > nextRound;
                    const isSelectedR = r === selectedRound;
                    return (
                      <button key={r} disabled={isFuture} onClick={() => !isFuture && setSelectedRound(r)}
                        style={{ width: 36, height: 36, borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono'",
                          background: isCompleted ? '#e8e8e8' : isCurrent ? '#C07600' : 'transparent',
                          color: isCompleted ? '#999' : isCurrent ? '#fff' : '#b0b0b0',
                          border: isSelectedR ? '2px solid #0D2247' : isCompleted ? '1px solid #d0d0d0' : isFuture ? '1px dashed #e0e0e0' : '1px solid #C07600',
                          cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.3 : 1 }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
                {/* 電話ボタン */}
                {selectedRow.phone && (
                  <button onClick={() => { dialPhone(selectedRow.phone); setLastDialedPhone(selectedRow.phone); }}
                    style={{ display: 'block', width: '100%', height: 56, borderRadius: 4, background: '#0D2247', border: 'none', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans JP'", letterSpacing: 1 }}>
                    電話をかける
                  </button>
                )}
                {/* サブ電話番号 */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  <input type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)} onBlur={handleSubPhoneBlur}
                    placeholder="別番号に架電"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: '#F8F9FA' }} />
                  <button onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); setLastDialedPhone(subPhone.trim()); }}
                    disabled={!subPhone.trim()}
                    style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 500, opacity: subPhone.trim() ? 1 : 0.4 }}>発信</button>
                </div>
              </div>

              {/* ③ 結果入力エリア */}
              {(() => {
                const roundRec = getRecordsForItem(selectedRow.id).find(r => r.round === selectedRound);
                const sc = roundRec ? callStatusColor(roundRec.status) : null;
                if (roundRec) {
                  return (
                    <div style={{ padding: 16, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: sc.color }}>{selectedRound}回目の結果：{roundRec.status}</span>
                      <button onClick={() => handleDeleteRecord(roundRec)}
                        style={{ fontSize: 11, padding: '6px 12px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', color: '#6B7280', fontFamily: "'Noto Sans JP'", fontWeight: 500 }}>取消</button>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: 16, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                    {/* 大ボタン3つ: 不通・社長不在・アポ獲得 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                      {callStatuses.filter(s => ['missed', 'absent', 'appointment'].includes(s.id)).map(st => {
                        const isAppo = st.id === 'appointment';
                        const sc = cfvShortcuts.find(s => s.id === st.id);
                        return (
                          <button key={st.id} onClick={() => handleResult(st.label)}
                            style={{ height: 56, borderRadius: 4, border: isAppo ? 'none' : '1px solid #E5E7EB', background: isAppo ? '#0D2247' : st.id === 'absent' ? '#F8F9FA' : '#fff', color: isAppo ? '#fff' : '#6B7280', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans JP'", position: 'relative' }}>
                            {st.label}
                            {sc && <span style={{ position: 'absolute', bottom: 4, right: 7, fontSize: 9, opacity: isAppo ? 0.55 : 0.5, fontFamily: "'JetBrains Mono'", color: isAppo ? '#fff' : undefined }}>{sc.key}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {/* 小ボタン: 残りのステータス */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                      {callStatuses.filter(s => !['missed', 'absent', 'appointment'].includes(s.id)).map(st => {
                        const sc = cfvShortcuts.find(s => s.id === st.id);
                        return (
                          <button key={st.id} onClick={() => handleResult(st.label)}
                            style={{ height: 40, borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'", position: 'relative' }}>
                            {st.label}
                            {sc && <span style={{ position: 'absolute', bottom: 3, right: 5, fontSize: 8, opacity: 0.45, fontFamily: "'JetBrains Mono'" }}>{sc.key}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* AI企業分析 */}
              {(() => {
                const hasAi = selectedRow.ai_overview || selectedRow.ai_strengths;
                const genAt = selectedRow.ai_generated_at ? new Date(selectedRow.ai_generated_at) : null;
                const genLabel = genAt ? `${genAt.getMonth() + 1}/${genAt.getDate()} ${genAt.getHours()}:${String(genAt.getMinutes()).padStart(2, '0')}` : '';
                return (
                  <div style={{ padding: '12px 14px', borderRadius: 4, border: '1px solid ' + (hasAi ? '#3B82F620' : '#E5E7EB'), background: hasAi ? '#EFF6FF' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: hasAi ? 8 : 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0D2247' }}>AI企業分析</span>
                      {hasAi && genLabel && <span style={{ fontSize: 9, color: '#9CA3AF', marginLeft: 6 }}>{genLabel}生成</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        {aiGenerating ? (
                          <span style={{ fontSize: 10, color: '#3B82F6', fontWeight: 600 }}>生成中...</span>
                        ) : (
                          <button onClick={async () => {
                            setAiGenerating(true);
                            try {
                              const { data } = await invokeGenerateCompanyInfo({ itemId: selectedRow.id, company: selectedRow.company, representative: selectedRow.representative });
                              if (data?.overview || data?.strengths) {
                                const updated = { ...selectedRow, ai_overview: data.overview, ai_strengths: data.strengths, ai_generated_at: new Date().toISOString() };
                                setItems(prev => prev.map(it => it.id === selectedRow.id ? updated : it));
                                setSelectedRow(updated);
                              }
                            } catch (e) { console.error('[AI企業分析] error:', e); }
                            setAiGenerating(false);
                          }}
                            style={{ fontSize: 10, fontWeight: 600, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Noto Sans JP'" }}>
                            {hasAi ? '再生成' : '生成する'}
                          </button>
                        )}
                      </span>
                    </div>
                    {!hasAi && !aiGenerating && (
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>企業HPをもとに概要・特徴を自動生成します</div>
                    )}
                    {hasAi && (
                      <div style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.7, fontFamily: "'Noto Sans JP'" }}>
                        {selectedRow.ai_overview && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 10, color: '#0D2247', marginBottom: 2 }}>企業概要</div>
                            <div style={{ marginBottom: 8 }}>{selectedRow.ai_overview}</div>
                          </>
                        )}
                        {selectedRow.ai_strengths && (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 10, color: '#0D2247', marginBottom: 2 }}>特徴・強み</div>
                            <div style={{ whiteSpace: 'pre-line' }}>{selectedRow.ai_strengths}</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 架電履歴 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id).slice().sort((a, b) => a.round - b.round);
                if (recs.length === 0) return null;
                return (
                  <div style={{ padding: 16, background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2247', marginBottom: 8 }}>架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dtStr = formatJST(rec.called_at);
                        return (
                          <div key={rec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 4, background: '#F8F9FA', fontSize: 11, border: '1px solid #E5E7EB' }}>
                              <span style={{ fontWeight: 700, color: '#0D2247', minWidth: 40, fontFamily: "'JetBrains Mono'", fontSize: 10 }}>{rec.round}回目</span>
                              <span style={{ flex: 1, color: sc.color, fontWeight: 600 }}>{rec.status}</span>
                              <span style={{ color: '#b0b0b0', fontSize: 10 }}>{dtStr}</span>
                              {rec.recording_url
                                ? <button onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? '#e53e3e' : 'inherit' }}>録音</button>
                                : <button onClick={() => handleFetchRecording(rec)}
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>更新</button>
                              }
                            </div>
                            {activeRecordingId === rec.id && rec.recording_url && (
                              <InlineAudioPlayer url={rec.recording_url} onClose={() => setActiveRecordingId(null)} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            /* フォーカスモードで企業未選択 */
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#b0b0b0', fontSize: 14, flexDirection: 'column', gap: 8 }}>
              リストから企業を選択してください
            </div>
          )}
        </div>

        {/* 右カラム 40% — スクリプト・企業概要・注意事項 */}
        {/* モバイル: 折りたたみ式ボトムシート / デスクトップ: 40%サイドパネル */}
        {!listMode && (
        <div style={isMobile ? {
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: mobileScriptOpen ? '60vh' : 44,
          background: '#fff', borderTop: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'height 0.25s ease', zIndex: 10,
          boxShadow: mobileScriptOpen ? '0 -4px 20px rgba(0,0,0,0.15)' : 'none',
        } : {
          width: '40%', background: '#fff', borderLeft: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* タブヘッダー */}
          <div onClick={() => isMobile && setMobileScriptOpen(o => !o)} style={{ display: 'flex', borderBottom: '2px solid #E5E7EB', background: '#F8F9FA', flexShrink: 0, cursor: isMobile ? 'pointer' : 'default' }}>
            {isMobile && <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 14, color: '#9CA3AF' }}>{mobileScriptOpen ? '▼' : '▲'}</span>}
            {[{ key: 'script', label: 'スクリプト' }, { key: 'rebuttal', label: 'アウト返し' }, { key: 'info', label: '企業概要' }, { key: 'cautions', label: '注意事項' }, { key: 'calendar', label: 'カレンダー' }].map(tab => (
              <button key={tab.key} onClick={(e) => { e.stopPropagation(); setScriptTab(tab.key); if (isMobile) setMobileScriptOpen(true); }}
                style={{ flex: 1, padding: isMobile ? '12px 4px' : '11px 4px', border: 'none', borderBottom: scriptTab === tab.key ? '2px solid #0D2247' : '2px solid transparent',
                  background: 'transparent', color: scriptTab === tab.key ? '#0D2247' : '#9CA3AF',
                  fontSize: isMobile ? 12 : 11, fontWeight: scriptTab === tab.key ? 600 : 400, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP'", marginBottom: -2, transition: 'color 0.15s' }}>
                {tab.label}
              </button>
            ))}
          </div>
          {/* タブコンテンツ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {scriptTab === 'script' && (() => {
              const pdfs = Array.isArray(list.scriptPdfs) ? list.scriptPdfs : [];
              return (
                <>
                  {list.scriptBody
                    ? renderMarkedScript(list.scriptBody, { fontSize: 12, color: '#0D2247', lineHeight: 1.8 })
                    : <div style={{ color: '#9CA3AF', fontSize: 12 }}>スクリプト未設定</div>}
                  {pdfs.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 6 }}>添付PDF</div>
                      {pdfs.map((pdf, i) => (
                        <button key={pdf.path || i}
                          onClick={() => handleOpenScriptPdf(pdf)}
                          title={pdf.name}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: '#F8F9FA', border: '1px solid #E5E7EB', borderLeft: '3px solid #0D2247', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: '#0D2247', fontWeight: 500, cursor: 'pointer', marginBottom: 5, textDecoration: 'underline', fontFamily: "'Noto Sans JP'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pdf.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {scriptTab === 'rebuttal' && (() => {
              let rd = null;
              try { rd = list.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch {}
              const data = rd || qaData;
              if (!data) return <div style={{ color: '#9CA3AF', fontSize: 12 }}>アウト返し未設定（Scriptsページで設定できます）</div>;
              return (
                <div>
                  {!rd && qaData && <div style={{ fontSize: 10, color: '#D4A017', marginBottom: 8, fontWeight: 500 }}>共通のアウト返しを表示中（リスト別はScriptsページで設定できます）</div>}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[['reception', '受付対応'], ['president', '社長対応']].map(([k, l]) => (
                      <button key={k} onClick={() => setQaSubTab(k)}
                        style={{ fontSize: 11, padding: '4px 14px', borderRadius: 4, border: 'none', background: qaSubTab === k ? '#0D2247' : '#F3F4F6', color: qaSubTab === k ? '#fff' : '#6B7280', cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: qaSubTab === k ? 600 : 400 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {(data[qaSubTab] || []).map((item, i) => (
                    <div key={i} style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 4, background: '#F8F9FA', borderLeft: '3px solid #0D2247' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Q: {item.q}</div>
                      <div style={{ fontSize: 12, color: '#0D2247', lineHeight: 1.7 }}>A: {item.a}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {scriptTab === 'info' && (
              list.companyInfo
                ? <pre style={{ fontSize: 12, color: '#4a4a4a', whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.companyInfo}</pre>
                : <div style={{ color: '#b0b0b0', fontSize: 12 }}>企業概要未設定</div>
            )}
            {scriptTab === 'cautions' && (
              list.cautions
                ? <CautionsCards text={list.cautions} fontSize={12} filter="non-calendar" />
                : <div style={{ color: '#b0b0b0', fontSize: 12 }}>注意事項未設定</div>
            )}
            {scriptTab === 'calendar' && (() => {
              const cl = (clientData || []).find(c => c.company === list.company);
              const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
              const linkedContacts = (list.contactIds || [])
                .map(cid => contacts.find(ct => ct.id === cid))
                .filter(Boolean);
              if (linkedContacts.length === 0 && list.manager) {
                const fallback = contacts.find(ct => ct.name?.includes(list.manager));
                if (fallback) linkedContacts.push(fallback);
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MultiCalendarPanel
                    contacts={linkedContacts}
                    fallbackClient={cl}
                    updateContactFn={(ctId, ctData) => {
                      return updateClientContact(ctId, ctData).then(() => {
                        if (setContactsByClient && cl?._supaId) {
                          setContactsByClient(prev => ({
                            ...prev,
                            [cl._supaId]: (prev[cl._supaId] || []).map(ct => ct.id === ctId ? { ...ct, ...ctData } : ct),
                          }));
                        }
                      });
                    }}
                    onSelectSlot={(dateStr, timeLabel) => { if (selectedRow) setQuickAppoSlot({ date: dateStr, time: timeLabel }); }}
                    existingAppointments={(appoData || []).filter(a => a.client === list.company && a.meetDate && a.meetTime)}
                    staticNoteLines={extractCalendarCautionLines(list.cautions)}
                  />
                </div>
              );
            })()}
          </div>
        </div>
        )}

      </div>

      {/* ─── アポ取得報告モーダル（既存） ─── */}
      {appoModal && (
        <AppoReportModal
          row={appoModal}
          list={list}
          currentUser={currentUser}
          members={members}
          clientData={clientData}
          rewardMaster={rewardMaster}
          onClose={() => setAppoModal(null)}
          onSave={handleAppoSave}
          initialRecordingUrl={''}
          onFetchRecordingUrl={() => handleAppoFetchRecording(appoModal.id, appoModal.phone)}
        />
      )}

      {/* ─── 再コール日時設定モーダル（既存） ─── */}
      {recallModal && (
        <RecallModal
          row={recallModal.row}
          statusId={recallModal.statusId}
          onSubmit={handleRecallSave}
          onCancel={() => setRecallModal(null)}
          members={members}
          currentUser={currentUser}
        />
      )}

      {/* ショートカット一覧モーダル */}
      {showShortcutHelp && (
        <div onClick={() => setShowShortcutHelp(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 10003,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 4, padding: 28, width: 380,
            border: '1px solid #E5E7EB', fontFamily: "'Noto Sans JP'",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2247', marginBottom: 16 }}>キーボードショートカット</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ...(IS_MAC
                    ? [['1', '不通'], ['2', '社長不在'], ['3', 'アポ獲得'],
                       ['4', '受付ブロック'], ['5', '受付再コール'], ['6', '社長再コール'],
                       ['7', '社長お断り'], ['8', '除外']]
                    : [['F1', '不通'], ['F2', '社長不在'], ['F3', 'アポ獲得'],
                       ['F4', '受付ブロック'], ['F5', '受付再コール'], ['F6', '社長再コール'],
                       ['F7', '社長お断り'], ['F8', '除外']]),
                  ['← →', '前後の企業に移動'], ['Esc', 'モーダルを閉じる'], ['?', 'このヘルプを表示'],
                ].map(([key, desc]) => (
                  <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 10px', width: 90 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: '#f3f4f6', border: '1px solid #d1d5db',
                        fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 700, color: '#374151',
                      }}>{key}</kbd>
                    </td>
                    <td style={{ padding: '6px 10px', color: '#374151' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setShowShortcutHelp(false)} style={{
              marginTop: 16, width: '100%', padding: '6px 12px', borderRadius: 4,
              border: 'none', background: '#0D2247', color: '#fff',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
            }}>閉じる</button>
          </div>
        </div>
      )}

      {/* ─── カレンダーからの簡易アポ登録モーダル（フォーカスモード用） ─── */}
      {quickAppoSlot && selectedRow && (() => {
        const cl = (clientData || []).find(c => c.company === list.company);
        const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
        const lcs = (list.contactIds || []).map(cid => contacts.find(ct => ct.id === cid)).filter(Boolean);
        const primaryLc = lcs[0] || (list.manager ? contacts.find(ct => ct.name?.includes(list.manager)) : null);
        return (
          <QuickAppoModal
            date={quickAppoSlot.date}
            time={quickAppoSlot.time}
            row={selectedRow}
            list={list}
            clientInfo={cl ? { _supaId: cl._supaId, slackWebhookUrl: cl.slackWebhookUrlInternal || cl.slackWebhookUrl, googleCalendarId: primaryLc?.googleCalendarId || cl?.googleCalendarId || '' } : null}
            contacts={contacts}
            currentUser={currentUser}
            onClose={() => setQuickAppoSlot(null)}
            onSave={() => { setQuickAppoSlot(null); }}
          />
        );
      })()}

      {pdfPreviewLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13 }}>
          PDFを読み込み中...
        </div>
      )}

      {pdfPreview && (
        <div onClick={() => setPdfPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '95vw', height: '92vh', maxWidth: 1200, borderRadius: 4, background: '#fff', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: '#0D2247', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontWeight: 600, fontSize: 13, color: '#fff' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfPreview.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <a href={pdfPreview.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#fff', textDecoration: 'underline' }}>新規タブで開く</a>
                <button onClick={() => setPdfPreview(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <iframe
              src={pdfPreview.url}
              title={pdfPreview.name}
              style={{ flex: 1, border: 'none', width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}