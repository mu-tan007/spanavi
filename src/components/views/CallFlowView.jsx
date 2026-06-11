import { useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import { zoomPhone } from '../../lib/zoomPhoneStore';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import { useIsMobile } from '../../hooks/useIsMobile';

import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { dialPhone } from '../../utils/phone';
import { extractUserNote, buildMemoWithNote } from '../../utils/memo';
import { fetchCallListItems, fetchCallRecords, fetchCallRecordsByItemIds, fetchCallListItemById, fetchCallRecordsByItem, insertCallRecord, findRecentApoCallRecord, updateCallRecordFields, updateCallListItem, unlinkIncomingCallsByCallerNumber, insertCallSession, updateCallSession, updateCallRecordRecordingUrl, updateAppoReportRecordingUrl, invokeGetZoomRecording, closeOpenCallSessionsForList, deleteCallRecord, invokeGenerateCompanyInfo, fetchSetting, insertAppointment, updateClientContact, completeRecallsForItem, getCompanyOverviewPdfSignedUrl, updateCallListCautions, insertBuyerNeedsHearing } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import { formatJST } from '../../utils/dateUtils';
import RecallModal from './RecallModal';
import AppoReportModal from './AppoReportModal';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import { useUrlState } from '../../hooks/useUrlState';
import { useSearchParams } from 'react-router-dom';
import ClientCalendarPanel from '../common/ClientCalendarPanel';
import MultiCalendarPanel from '../common/MultiCalendarPanel';
import QuickAppoModal from '../common/QuickAppoModal';
import ScriptBody from '../common/ScriptBody';
import ScriptTreeGuide from '../common/ScriptTreeGuide';
import { resolveListContacts } from '../../utils/listContacts';

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

// extractCalendarCautionLines の逆操作: list.cautions の「カレンダー」セクション本文を newLines で差し替えて全文を再構築。
// セクションが存在しない場合は末尾に新規セクションを追加（次の空き丸数字を使用）。
// newLines は箇条書き「・」プレフィックス無しの素のテキスト配列。書き出し時に「　・」を付加する。
function replaceCalendarSection(cautionsText, newLines) {
  const cleanLines = (newLines || []).map(s => (s || '').trim()).filter(Boolean);
  const newBody = cleanLines.map(s => `　・${s}`);
  if (!cautionsText || !cautionsText.trim()) {
    if (cleanLines.length === 0) return '';
    return ['①カレンダー', ...newBody].join('\n');
  }
  const sections = parseCautions(cautionsText);
  if (!sections) {
    if (cleanLines.length === 0) return cautionsText;
    return cautionsText.trimEnd() + '\n①カレンダー\n' + newBody.join('\n');
  }
  const calIdx = sections.findIndex(s => /カレンダー/.test(s.title || ''));
  if (calIdx >= 0) {
    sections[calIdx] = { ...sections[calIdx], body: newBody };
  } else if (cleanLines.length > 0) {
    const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    const used = new Set(sections.map(s => s.marker).filter(Boolean));
    const nextMarker = CIRCLE_NUMS.find(m => !used.has(m)) || '⑪';
    sections.push({ marker: nextMarker, title: 'カレンダー', body: newBody });
  }
  const lines = [];
  for (const s of sections) {
    if (s.marker || s.title) lines.push(`${s.marker || ''}${s.title || ''}`);
    for (const b of s.body) lines.push(b);
  }
  return lines.join('\n');
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

export default function CallFlowView({ list, startNo, endNo, statusFilter = null, onClose, onMinimize, isMinimized, summaryRef, closeRef, setAppoData, members = [], currentUser = '', defaultItemId = null, defaultListMode = null, clientData = [], rewardMaster = [], initialRevenueMin = null, initialRevenueMax = null, initialPrefFilter = null, appoData = [], contactsByClient = {}, setContactsByClient, setCallListData = null, singleItemMode = false, onResultSubmit = null, onQueuePrev = null, onQueueNext = null, queuePos = null, initialRecordingUrl = '', autoOpenAppoModal = false, initialDialedPhone = '' }) {
  // 動的ステータス定義（useCallStatuses フックから取得）
  const { statuses: callStatuses, shortcuts: cfvShortcuts, keymanConnectLabels, getStatusColor, excludedIds } = useCallStatuses();

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
  const [search, setSearch] = useUrlState('flow_q', '');
  const [pageStr, setPageStr] = useUrlState('flow_page', '0');
  const page = parseInt(pageStr, 10) || 0;
  const setPage = (v) => setPageStr(String(typeof v === 'function' ? v(page) : v));
  // useUrlState は連続呼び出しが race するため (feedback_use_url_state_race)、
  // 検索/モード変更時の「ページ0リセット」は単一 setSearchParams にまとめる
  const [, setSearchParamsRaw] = useSearchParams();
  // ⚠ URLキーは useUrlState 側の 'flow_q' / 'flow_page' と完全一致させること。
  // 旧キー('q'/'page')に書いていたせいで「検索窓に入力できない」「ページ残留で0件表示」が発生した。
  const setSearchAndResetPage = (newSearch) => {
    setSearchParamsRaw(prev => {
      const np = new URLSearchParams(prev);
      if (newSearch) np.set('flow_q', newSearch); else np.delete('flow_q');
      np.delete('flow_page');
      return np;
    }, { replace: true });
  };
  const setFilterModeAndResetPage = (mode) => {
    setSearchParamsRaw(prev => {
      const np = new URLSearchParams(prev);
      if (mode && mode !== 'callable') np.set('mode', mode); else np.delete('mode');
      np.delete('flow_page');
      return np;
    }, { replace: true });
  };
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [appoModal, setAppoModal] = useState(null); // holds selectedRow when アポ獲得 is clicked
  const [needsModal, setNeedsModal] = useState(null); // 買い手マッチング ニーズヒアリング: holds selectedRow when 開く
  const [aiGenerating, setAiGenerating] = useState({}); // { [itemId]: true }
  const [aiError, setAiError] = useState({}); // { [itemId]: 'parse_failed'|'not_found'|'error' }
  const [scriptPanelOpen, setScriptPanelOpen] = useState(true);
  const [scriptTab, setScriptTab] = useState('script');
  // ツリー型スクリプトのあるリストでの表示モード: 'guide'(ガイド) | 'text'(全文)
  const [scriptViewMode, setScriptViewMode] = useState('guide');
  const [sortState, setSortState] = useState({ column: null, direction: null });
  const [callRecords, setCallRecords] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [filterMode, setFilterMode] = useUrlState('mode', 'callable');
  const [revenueMin, setRevenueMin] = useState(initialRevenueMin ? String(initialRevenueMin) : '');  // 千円単位（例: 100000 = 1億円）
  const [revenueMax, setRevenueMax] = useState(initialRevenueMax ? String(initialRevenueMax) : '');  // 空文字 = 上限なし
  const [prefFilters, setPrefFilters] = useState(Array.isArray(initialPrefFilter) ? initialPrefFilter : (initialPrefFilter ? [initialPrefFilter] : []));
  const [prefDropOpen, setPrefDropOpen] = useState(false);
  const [statusFilterLocal, setStatusFilterLocal] = useState(() => Array.isArray(statusFilter) ? statusFilter : []); // DetailModalの選択を引き継ぎ
  const [recallModal, setRecallModal] = useState(null); // { row, statusId, round, label }
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const cfvKbRef = useRef({});
  const [subPhone, setSubPhone] = useState('');
  const [keymanMobile, setKeymanMobile] = useState('');
  const [lastDialedPhone, setLastDialedPhone] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const [quickAppoSlot, setQuickAppoSlot] = useState(null); // { date, time }
  const [qaData, setQaData] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null); // { name, url }
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  // 企業概要PDF: タブ切替＋インラインiframe（focusモード用）
  const [overviewPdfUrls, setOverviewPdfUrls] = useState({}); // { [path]: signedUrl }
  const [selectedOverviewPdfPath, setSelectedOverviewPdfPath] = useState(null);

  // 企業概要PDFの署名URLをキャッシュ（再レンダリングで毎回作り直さない）
  const ensureOverviewPdfUrl = async (pdf) => {
    if (!pdf?.path || overviewPdfUrls[pdf.path]) return;
    const { url } = await getCompanyOverviewPdfSignedUrl(pdf.path);
    if (url) setOverviewPdfUrls(prev => ({ ...prev, [pdf.path]: url }));
  };

  // list mode の下部スクリプトパネルは120pxしかないので、モーダルで開く
  const handleOpenOverviewPdfModal = async (pdf) => {
    if (!pdf?.path) return;
    setPdfPreviewLoading(true);
    const { url, error } = await getCompanyOverviewPdfSignedUrl(pdf.path);
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

  // 企業概要タブを開いた時、先頭PDFを自動選択＋署名URL取得
  useEffect(() => {
    if (scriptTab !== 'info') return;
    const pdfs = Array.isArray(list?.companyOverviewPdfs) ? list.companyOverviewPdfs : [];
    if (pdfs.length === 0) return;
    const stillValid = selectedOverviewPdfPath && pdfs.some(p => p.path === selectedOverviewPdfPath);
    const target = stillValid ? pdfs.find(p => p.path === selectedOverviewPdfPath) : pdfs[0];
    if (!stillValid) setSelectedOverviewPdfPath(target.path);
    ensureOverviewPdfUrl(target);
  }, [scriptTab, list?._supaId, list?.companyOverviewPdfs]);

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
    setKeymanMobile(selectedRow?.keyman_mobile || '');
    setLastDialedPhone(null);
    try {
      if (selectedRow?.id != null) sessionStorage.setItem('callflow_selected_id', String(selectedRow.id));
    } catch {}
  }, [selectedRow?.id]);

  useEffect(() => {
    if (!selectedRow) { setSelectedRound(null); return; }
    const recs = callRecords.filter(r => r.item_id === selectedRow.id);
    const maxRound = recs.length > 0 ? Math.max(...recs.map(r => r.round)) : 0;
    setSelectedRound(maxRound + 1);
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
          status_filter: Array.isArray(statusFilter) ? statusFilter : (statusFilter ? [statusFilter] : []),
          revenue_min: initialRevenueMin != null && initialRevenueMin !== '' ? Number(initialRevenueMin) : null,
          revenue_max: initialRevenueMax != null && initialRevenueMax !== '' ? Number(initialRevenueMax) : null,
          pref_filter: Array.isArray(initialPrefFilter) ? initialPrefFilter : (initialPrefFilter ? [initialPrefFilter] : []),
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
    return recs.length === 0 ? 1 : Math.max(...recs.map(r => r.round)) + 1;
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

  const COL_KEY_MAP = { 'No': 'no', '企業名': 'company', '事業内容': 'business', '代表者': 'representative', '電話番号': 'phone', '結果': 'call_status', '売上高': 'revenue', '当期純利益': 'net_income' };
  const NUMERIC_COLS = new Set(['no', 'revenue', 'net_income']);
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

  // 残留ページ番号ガード: 別リスト閲覧時の flow_page がURLに残っていると
  // 件数の少ないリストで「0件表示」になるため、範囲外なら先頭ページへ戻す
  React.useEffect(() => {
    if (!loading && totalPages > 0 && page >= totalPages) setPage(0);
  }, [loading, totalPages, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = {
    total: statusFilteredItems.length,
    called: statusFilteredItems.filter(i => getRecordsForItem(i.id).length > 0).length,
    excluded: statusFilteredItems.filter(i => isExcludedItem(i.id)).length,
    appo: statusFilteredItems.filter(i => getRecordsForItem(i.id).some(r => r.status === 'アポ獲得')).length,
  };
  const progress = stats.total > 0 ? Math.round(stats.called / stats.total * 100) : 0;

  // selectedRow 変更時は録音プレーヤーをリセット
  useEffect(() => { setActiveRecordingId(null); }, [selectedRow]);

  // autoOpenAppoModal: 着信からの「アポ取得」遷移時、selectedRow ロード完了後に
  // 自動で AppoReportModal を開く（一度だけ）
  const _autoOpenAppoFiredRef = useRef(false);
  useEffect(() => {
    if (!autoOpenAppoModal || _autoOpenAppoFiredRef.current) return;
    if (selectedRow && selectedRow.id) {
      _autoOpenAppoFiredRef.current = true;
      setSelectedRound(prev => prev ?? 1);
      setAppoModal(selectedRow);
    }
  }, [autoOpenAppoModal, selectedRow]);

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
  // getterName: 録音を引くZoomアカウントの持ち主（過去レコードの手動取得時は架電した本人を指定）
  const fetchRecordingUrl = async (phone, calledAt, prevCalledAt = null, getterName = currentUser) => {
    try {
      // 名前照合はスペース除去で正規化（ログイン名「篠宮拓武」vs名簿「篠宮 拓武」の
      // 表記ゆれで zoomUserId が引けず録音未取得になる事故の再発防止）
      const normName = (s) => String(s || '').replace(/[\s　]/g, '');
      const member = members.find(m => normName(typeof m === 'string' ? m : m.name) === normName(getterName));
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
    if (result === '受付再コール' || result === 'キーマン再コール') {
      setRecallModal({
        row: selectedRow,
        statusId: result === '受付再コール' ? 'reception_recall' : 'keyman_recall',
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
    // onResultSubmit が指定されていればキュー送り（Dashboard 起点）、なければ閉じる
    if (singleItemMode) {
      if (onResultSubmit) onResultSubmit(result);
      else onClose();
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
        if (!niExcl && !niRecall) { next = ni; break; }
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
    const url = await fetchRecordingUrl(item.phone, rec.called_at, prevRec?.called_at || null, rec.getter_name || currentUser);
    if (!url) { alert('録音URLを取得できませんでした'); return; }
    const dbError = await updateCallRecordRecordingUrl(rec.id, url);
    if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
    setCallRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
  };

  // アポ報告フォーム用録音URL取得（Zoom APIからリトライ付きで取得）
  // called_at は渡さない: 「ボタン押下時刻-3h」の時間窓だと、通話からしばらく
  // 経ってから報告を書いた場合に通話が窓から外れて取得できない
  // （サンフロンティア事例: 13:38通話→16:40再取得で未取得）。
  // called_at なしの場合、関数側は「この番号への最新の録音」を返すため
  // アポ報告の用途（さっきの通話の録音）には常にこちらが正しい。
  const handleAppoFetchRecording = async (_itemId, phone) => {
    // 最大30秒（5秒×6回）リトライしてZoom録音を取得（Zoom側の処理遅延を吸収）
    for (let i = 0; i < 6; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 5000));
      try {
        const url = await fetchRecordingUrl(phone, null, null);
        if (url) return url;
      } catch (e) { console.warn('[handleAppoFetchRecording] リトライ', i + 1, e); }
    }
    return null;
  };

  const handleAppoSave = async (formData) => {
    if (!appoModal || selectedRound === null) return;
    // 再入防止 (同一 appoModal インスタンスに対し handleAppoSave が 2回呼ばれた場合に弾く)
    if (handleAppoSave._inFlight === appoModal.id) {
      console.warn('[handleAppoSave] 再入検知: 既に処理中のため skip', appoModal.id);
      return;
    }
    handleAppoSave._inFlight = appoModal.id;
    try {

    const calledAtAppo = new Date().toISOString();
    const _prevRecAppo = callRecords
      .filter(r => r.item_id === appoModal.id)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    const _prevCalledAtAppo = _prevRecAppo?.called_at || null;

    // 携帯/別事業所への発信で取得したアポも録音が拾えるよう、
    // 直近 dial 番号を優先（lastDialedPhone）→ 無ければ会社番号 (appoModal.phone) にフォールバック
    const _appoDialedPhone = lastDialedPhone || appoModal.phone;
    const recordingUrlAppo = await fetchRecordingUrl(_appoDialedPhone, calledAtAppo, _prevCalledAtAppo);

    // テンプレ式アポ報告ではモーダル側が先にアポ本体を保存し、DBトリガー
    // (sync_call_status_from_appointment) が「アポ獲得」記録を自動挿入している。
    // その行があれば二重挿入せず memo/録音/round を上書きして1本化する
    // （サンフロンティア事例: トリガー行+フロント行で同じ架電が2回表示された対策）。
    let newRec = null;
    let recErr = null;
    const { data: trigRec } = await findRecentApoCallRecord(appoModal.id);
    if (trigRec) {
      ({ result: newRec, error: recErr } = await updateCallRecordFields(trigRec.id, {
        list_id: list._supaId,
        round: selectedRound,
        memo: localMemo || null,
        called_at: calledAtAppo,
        recording_url: recordingUrlAppo,
        getter_name: currentUser,
      }));
    } else {
      ({ result: newRec, error: recErr } = await insertCallRecord({
        item_id: appoModal.id, list_id: list._supaId,
        round: selectedRound, status: 'アポ獲得', memo: localMemo || null,
        called_at: calledAtAppo, recording_url: recordingUrlAppo, getter_name: currentUser,
      }));
    }
    if (recErr || !newRec) {
      console.error('[handleAppoSave] 架電記録の保存に失敗 — calledCountは更新しない');
      return;
    }

    // 録音URL未取得の場合、自動リトライ（Zoomの録音処理遅延対策）
    // appoIdを保持してappo_reportも更新する
    const _appoItemId = appoModal.id;
    const _appoPhone = _appoDialedPhone;
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
        // クライアント開拓は事前確認を行わないため、デフォルトで事前確認済に（AppoReportModalと同期）
        status:     list?.is_prospecting ? '事前確認済' : 'アポ取得',
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
      // sorted（フィルタ済みリスト）の順序で次の架電可能な企業を探す
      // ※handleResult と同じロジック。newItems を直接使うとステータス絞り込み等の
      //   UI フィルタが無視され、選択順がぐちゃぐちゃになるので必ず sorted を使う。
      const sortedIdx = sorted.findIndex(i => i.id === appoModal.id);
      let next = null;
      for (let j = sortedIdx + 1; j < sorted.length; j++) {
        const ni = sorted[j];
        const niRecs = newRecords.filter(r => r.item_id === ni.id);
        const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
        const niLatest = niRecs.length > 0 ? niRecs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b) : null;
        const niRecall = niLatest && RECALL_STATUSES.has(niLatest.status);
        if (!niExcl && !niRecall) { next = ni; break; }
      }
      setSelectedRow(next || updatedItem);
      if (autoDial && next?.phone) dialPhone(next.phone);
    }
    // zoom.us URLをSupabase Storageに変換（非ブロッキング）
    if (recordingUrlAppo && newRec?.id) uploadRecordingToStorage(newRec.id, recordingUrlAppo);
    } finally {
      handleAppoSave._inFlight = null;
    }
  };

  // 買い手マッチング ニーズヒアリング保存（アポとは独立。売上/報酬計算には一切干渉しない）
  const handleNeedsSave = async (fields) => {
    if (!needsModal) return false;
    const { error } = await insertBuyerNeedsHearing({
      company_name: needsModal.company,
      item_id: needsModal.id || null,
      list_id: list?._supaId || null,
      client_id: list?.client_id || null,
      getter_name: currentUser,
      industry: fields.industry,
      area: fields.area,
      revenue: fields.revenue,
      operating_profit: fields.operating_profit,
      budget: fields.budget,
      purpose: fields.purpose,
      memo: fields.memo,
    });
    if (error) { alert('買収ニーズの保存に失敗しました: ' + (error.message || '不明なエラー')); return false; }
    return true;
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
      // sorted（フィルタ済みリスト）の順序で次の架電可能な企業を探す
      // ※handleResult と同じロジック。newItems を直接使うとステータス絞り込み等の
      //   UI フィルタが無視され、選択順がぐちゃぐちゃになるので必ず sorted を使う。
      const sortedIdx = sorted.findIndex(i => i.id === row.id);
      let next = null;
      for (let j = sortedIdx + 1; j < sorted.length; j++) {
        const ni = sorted[j];
        const niRecs = newRecords.filter(r => r.item_id === ni.id);
        const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
        const niLatest = niRecs.length > 0 ? niRecs.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b) : null;
        const niRecall = niLatest && RECALL_STATUSES.has(niLatest.status);
        if (!niExcl && !niRecall) { next = ni; break; }
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
    const oldValue = (selectedRow.sub_phone_number || '').trim();
    const newValue = (subPhone || '').trim();
    if (oldValue === newValue) return;
    const err = await updateCallListItem(selectedRow.id, { sub_phone_number: newValue });
    if (err) {
      console.error('[subPhone] DB保存失敗 — call_list_items.sub_phone_numberカラムが存在しない可能性があります。SQL: ALTER TABLE call_list_items ADD COLUMN IF NOT EXISTS sub_phone_number TEXT;', err);
      return;
    }
    // 旧別事業所番号で紐づいていた着信履歴を解除
    if (oldValue) {
      unlinkIncomingCallsByCallerNumber(selectedRow.id, oldValue)
        .catch(e => console.warn('[subPhone] 旧番号の着信紐づけ解除エラー:', e));
    }
    // DB保存後にメモリ上のitemsも更新（企業切り替え後に復元できるように）
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, sub_phone_number: newValue } : i));
    setSelectedRow(prev => prev?.id === selectedRow.id ? { ...prev, sub_phone_number: newValue } : prev);
  };

  const handleKeymanMobileBlur = async () => {
    if (!selectedRow) return;
    const oldValue = (selectedRow.keyman_mobile || '').trim();
    const newValue = (keymanMobile || '').trim();
    if (oldValue === newValue) return; // 変更なし
    const err = await updateCallListItem(selectedRow.id, { keyman_mobile: newValue });
    if (err) {
      console.error('[keymanMobile] DB保存失敗', err);
      return;
    }
    // 旧キーマン携帯番号で紐づいていた着信履歴を解除（削除・別番号に変更どちらも）
    if (oldValue) {
      unlinkIncomingCallsByCallerNumber(selectedRow.id, oldValue)
        .catch(e => console.warn('[keymanMobile] 旧番号の着信紐づけ解除エラー:', e));
    }
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, keyman_mobile: newValue } : i));
    setSelectedRow(prev => prev?.id === selectedRow.id ? { ...prev, keyman_mobile: newValue } : prev);
  };

  // AI企業分析: itemIdごとに生成状態を管理し、awaitから戻った時点でも対象企業に正しく反映する
  const triggerAiGenerate = async (row) => {
    if (!row?.id) return;
    const itemId = row.id;
    setAiGenerating(prev => ({ ...prev, [itemId]: true }));
    setAiError(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    try {
      const { data, error } = await invokeGenerateCompanyInfo({
        itemId,
        company: row.company,
        representative: row.representative,
        address: row.address,
      });
      if (error) {
        setAiError(prev => ({ ...prev, [itemId]: 'error' }));
      } else if (data?.error) {
        setAiError(prev => ({ ...prev, [itemId]: data.error }));
      } else if (data?.overview || data?.strengths) {
        const patch = { ai_overview: data.overview, ai_strengths: data.strengths, ai_generated_at: new Date().toISOString() };
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i));
        // 生成中に別企業へ切り替わっていた場合は selectedRow を上書きしない（取り違え防止）
        setSelectedRow(prev => prev?.id === itemId ? { ...prev, ...patch } : prev);
      }
    } catch (e) {
      console.error('[AI企業分析] error:', e);
      setAiError(prev => ({ ...prev, [itemId]: 'error' }));
    } finally {
      setAiGenerating(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    }
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
            {/* IME対応のため共通Inputを使用（生inputだとURL書き戻しで日本語変換が壊れる） */}
            <Input size="sm" value={search} onChange={e => setSearchAndResetPage(e.target.value)} placeholder="企業名・代表者・電話番号で検索..."
              containerStyle={{ flex: 1 }} style={{ fontSize: 11 }} />
            {[['callable','架電可能'],['all','全件'],['excluded','除外']].map(([mode, label]) => (
              <button key={mode} onClick={() => setFilterModeAndResetPage(mode)}
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

              {/* 別事業所番号（本社以外の支店/営業所） */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  type="tel"
                  value={subPhone}
                  onChange={e => setSubPhone(e.target.value)}
                  onBlur={handleSubPhoneBlur}
                  placeholder="別事業所番号 (支店/営業所)"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }}
                />
                <button
                  onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); setLastDialedPhone(subPhone.trim()); }}
                  disabled={!subPhone.trim()}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 13, opacity: subPhone.trim() ? 1 : 0.4, lineHeight: 1 }}
                >発信</button>
              </div>
              {/* キーマン携帯 */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <input
                  type="tel"
                  value={keymanMobile}
                  onChange={e => setKeymanMobile(e.target.value)}
                  onBlur={handleKeymanMobileBlur}
                  placeholder="キーマン携帯番号"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }}
                />
                <button
                  onClick={() => { if (!keymanMobile.trim()) return; dialPhone(keymanMobile.trim()); setLastDialedPhone(keymanMobile.trim()); }}
                  disabled={!keymanMobile.trim()}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: keymanMobile.trim() ? 'pointer' : 'default', fontSize: 13, opacity: keymanMobile.trim() ? 1 : 0.4, lineHeight: 1 }}
                >発信</button>
              </div>

              {/* ラウンドボタン */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.max(getNextRound(selectedRow.id), 10) }, (_, i) => i + 1).map(r => {
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
                    {/* ステータスボタン: 全 9 ステータスを 3×3 均等 grid に配置（アポ獲得は gold 強調、除外は red） */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                      {callStatuses.map(r => {
                        const isAppo = r.id === 'appointment';
                        const isExcl = r.id === 'excluded';
                        return (
                          <button key={r.id} onClick={() => handleResult(r.label)}
                            style={{
                              height: 42, borderRadius: 7,
                              border: isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25',
                              background: isAppo ? C.gold : isExcl ? C.red + '10' : C.navy + '08',
                              color: isAppo ? C.white : isExcl ? C.red : C.navy,
                              cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Noto Sans JP'"
                            }}>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                    {list?.engagementSlug === 'matching' && (
                      <Button variant="outline" size="sm" onClick={() => setNeedsModal(selectedRow)}
                        style={{ width: '100%' }}>買収ニーズを記録</Button>
                    )}
                  </div>
                );
              })()}

              {/* AI企業分析 */}
              {(() => {
                const hasAi = selectedRow.ai_overview || selectedRow.ai_strengths;
                const genAt = selectedRow.ai_generated_at ? new Date(selectedRow.ai_generated_at) : null;
                const genLabel = genAt ? `${genAt.getMonth() + 1}/${genAt.getDate()} ${genAt.getHours()}:${String(genAt.getMinutes()).padStart(2, '0')}` : '';
                const generatingNow = !!aiGenerating[selectedRow.id];
                const errCode = aiError[selectedRow.id];
                const errMsg = errCode === 'not_found' ? '該当企業が特定できませんでした。所在地や代表者を確認してください。'
                  : errCode === 'parse_failed' ? '生成結果が想定形式ではありませんでした。再生成してください。'
                  : errCode ? '生成に失敗しました。再生成してください。' : '';
                return (
                  <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid ' + (hasAi ? '#3B82F620' : C.border), background: hasAi ? '#EFF6FF' : C.offWhite }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: hasAi ? 8 : 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>AI企業分析</span>
                      {hasAi && genLabel && <span style={{ fontSize: 9, color: C.textLight, marginLeft: 6 }}>{genLabel}生成</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        {generatingNow ? (
                          <span style={{ fontSize: 9, color: '#3B82F6', fontWeight: 600 }}>生成中...</span>
                        ) : (
                          <button onClick={() => triggerAiGenerate(selectedRow)}
                            style={{ fontSize: 9, fontWeight: 600, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Noto Sans JP'" }}>
                            {hasAi ? '再生成' : '生成する'}
                          </button>
                        )}
                      </span>
                    </div>
                    {errMsg && (
                      <div style={{ fontSize: 10, color: '#B91C1C', marginTop: 4 }}>{errMsg}</div>
                    )}
                    {!hasAi && !generatingNow && !errMsg && (
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
                const TEMP_LABEL = { HIGH: '温度感: 高', MEDIUM: '温度感: 中', LOW: '温度感: 低', SKIP: '分析不可' };
                const TEMP_COLOR = { HIGH: C.green || '#16a34a', MEDIUM: C.blue || '#0ea5e9', LOW: C.red || '#dc2626', SKIP: C.textLight };
                const parseRejection = (raw) => {
                  if (!raw) return { temp: null, summary: '' };
                  const m = raw.match(/^(HIGH|MEDIUM|LOW|SKIP)\s*\n?([\s\S]*)$/);
                  if (m) return { temp: m[1].toUpperCase(), summary: m[2].trim() };
                  return { temp: null, summary: raw };
                };
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dtStr = formatJST(rec.called_at);
                        const isKeymanReject = rec.status === 'キーマン断り';
                        const rej = isKeymanReject ? parseRejection(rec.rejection_reason) : null;
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
                            {isKeymanReject && rej && (rej.temp || rej.summary) && (
                              <div style={{
                                marginTop: 3, padding: '6px 8px',
                                background: (C.red || '#dc2626') + '0d',
                                borderLeft: '3px solid ' + (C.red || '#dc2626'),
                                borderRadius: 4,
                                display: 'flex', flexDirection: 'column', gap: 3,
                              }}>
                                {rej.temp && TEMP_LABEL[rej.temp] && (
                                  <span style={{
                                    alignSelf: 'flex-start',
                                    fontSize: 10, fontWeight: 600,
                                    padding: '1px 7px', borderRadius: 3,
                                    background: TEMP_COLOR[rej.temp] + '26', color: TEMP_COLOR[rej.temp],
                                  }}>{TEMP_LABEL[rej.temp]}</span>
                                )}
                                {rej.summary && (
                                  <span style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{rej.summary}</span>
                                )}
                              </div>
                            )}
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
              // チップ・即時検索が参照するアウト返し（リスト別優先、なければ共通）
              let rdScript = null;
              try { rdScript = list.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch {}
              const rebuttal = rdScript || qaData;
              const hasTree = !!(list.scriptTree && Array.isArray(list.scriptTree.nodes) && list.scriptTree.nodes.length);
              const showGuide = hasTree && scriptViewMode === 'guide';
              return (
                <>
                  {hasTree && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {[['guide', 'ガイド'], ['text', '全文']].map(([m, l]) => (
                        <button key={m} onClick={() => setScriptViewMode(m)}
                          style={{ fontSize: 9, padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                            border: scriptViewMode === m ? '1px solid ' + C.gold : '1px solid ' + C.borderLight,
                            background: scriptViewMode === m ? C.gold + '20' : C.white,
                            color: scriptViewMode === m ? C.navy : C.textMid,
                            fontWeight: scriptViewMode === m ? 700 : 400 }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  {showGuide
                    ? <ScriptTreeGuide tree={list.scriptTree} rebuttal={rebuttal} resetKey={`${list._supaId}|${selectedRow?.id || ''}`} style={{ fontSize: 11, color: C.textDark }} />
                    : list.scriptBody
                      ? <ScriptBody text={list.scriptBody} rebuttal={rebuttal} style={{ fontSize: 11, color: C.textDark, lineHeight: 1.7 }} />
                      : <div style={{ color: C.textLight, fontSize: 11 }}>スクリプト未設定</div>}
                </>
              );
            })()}
            {scriptTab === 'info' && (() => {
              const pdfs = Array.isArray(list.companyOverviewPdfs) ? list.companyOverviewPdfs : [];
              if (!list.companyInfo && pdfs.length === 0) {
                return <div style={{ color: C.textLight, fontSize: 11 }}>企業概要未設定</div>;
              }
              return (
                <>
                  {list.companyInfo
                    ? <pre style={{ fontSize: 11, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.companyInfo}</pre>
                    : null}
                  {pdfs.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed ' + C.borderLight }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.navy, marginBottom: 4 }}>添付PDF</div>
                      {pdfs.map((pdf, i) => (
                        <button key={pdf.path || i}
                          onClick={() => handleOpenOverviewPdfModal(pdf)}
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
            {scriptTab === 'cautions' && (
              list.cautions
                ? <CautionsCards text={list.cautions} fontSize={11} filter="non-calendar" />
                : <div style={{ color: C.textLight, fontSize: 11 }}>注意事項未設定</div>
            )}
            {scriptTab === 'calendar' && (() => {
              const cl = (clientData || []).find(c => c.company === list.company);
              const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
              const linkedContacts = resolveListContacts(list, contacts);
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
                    onUpdateCalendarLines={async (newLines) => {
                      if (!list?._supaId) return;
                      const newCautions = replaceCalendarSection(list.cautions, newLines);
                      const err = await updateCallListCautions(list._supaId, newCautions);
                      if (err) { alert('注意事項の保存に失敗しました'); return; }
                      if (setCallListData) setCallListData(prev => prev.map(l => l._supaId === list._supaId ? { ...l, cautions: newCautions } : l));
                    }}
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
          initialRecordingUrl={initialRecordingUrl || ''}
          dialedPhone={lastDialedPhone || initialDialedPhone || appoModal.phone || ''}
          onFetchRecordingUrl={() => handleAppoFetchRecording(appoModal.id, lastDialedPhone || initialDialedPhone || appoModal.phone)}
        />
      )}

      {/* ─── 買い手マッチング 買収ニーズ ヒアリングモーダル ─── */}
      {needsModal && (
        <NeedsHearingModal
          row={needsModal}
          currentUser={currentUser}
          onClose={() => setNeedsModal(null)}
          onSave={handleNeedsSave}
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
            onSave={(savedAppoData) => {
              setQuickAppoSlot(null);
              if (setAppoData && savedAppoData) {
                setAppoData(prev => [...(prev || []), {
                  ...savedAppoData,
                  month: savedAppoData.meetDate ? (parseInt(savedAppoData.meetDate.slice(5, 7), 10) + '月') : '',
                  isProspecting: !!list?.is_prospecting,
                }]);
              }
            }}
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: color.offWhite, zIndex: 10000, display: 'flex', flexDirection: 'column', fontFamily: font.family.sans }}>

      {/* ── ヘッダーバー（height:48px） ── */}
      <div style={{ height: 48, background: color.navyDeep, display: 'flex', alignItems: 'center', padding: `0 ${space[4] - 2}px`, gap: space[2] + 2, flexShrink: 0, borderBottom: `1px solid ${alpha('#FFFFFF', 0.08)}` }}>

        {/* 左: リストに戻る（集中モード時のみ表示） */}
        {!listMode && (
          <button onClick={() => setListMode(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: radius.lg, flexShrink: 0,
              border: `1px solid ${alpha('#FFFFFF', 0.25)}`, cursor: 'pointer', fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              background: alpha('#FFFFFF', 0.07), color: color.white }}>
            {isMobile ? '◀' : '◀ リストに戻る'}
          </button>
        )}


        {/* 中央: 位置表示 + 前へ/次へ。通常モードはリスト内、singleItemMode+queue 指定時はキュー内で遷移 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space[2] + 2 }}>
          {!singleItemMode && (<>
          <button
            onClick={() => { if (currentIdx > 0) { setSelectedRow(sorted[currentIdx - 1]); setListMode(false); } }}
            disabled={currentIdx <= 0}
            style={{ padding: '4px 14px', borderRadius: radius.lg, fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              border: currentIdx <= 0 ? `1px solid ${alpha('#FFFFFF', 0.15)}` : `1px solid ${alpha('#FFFFFF', 0.5)}`,
              background: currentIdx <= 0 ? 'transparent' : alpha('#FFFFFF', 0.1),
              color: currentIdx <= 0 ? alpha('#FFFFFF', 0.3) : color.white,
              cursor: currentIdx <= 0 ? 'default' : 'pointer' }}>
            ◀ 前へ
          </button>
          <span style={{ fontSize: font.size.sm, color: color.white, fontWeight: font.weight.bold, minWidth: 90, textAlign: 'center', fontFamily: font.family.mono }}>
            {currentIdx >= 0 ? `${currentIdx + 1} / ${sorted.length}` : `- / ${sorted.length}`}件
          </span>
          <button
            onClick={() => { if (currentIdx < sorted.length - 1) { setSelectedRow(sorted[currentIdx + 1]); setListMode(false); } }}
            disabled={currentIdx >= sorted.length - 1}
            style={{ padding: '4px 14px', borderRadius: radius.lg, fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              border: currentIdx >= sorted.length - 1 ? `1px solid ${alpha('#FFFFFF', 0.15)}` : `1px solid ${alpha('#FFFFFF', 0.5)}`,
              background: currentIdx >= sorted.length - 1 ? 'transparent' : alpha('#FFFFFF', 0.1),
              color: currentIdx >= sorted.length - 1 ? alpha('#FFFFFF', 0.3) : color.white,
              cursor: currentIdx >= sorted.length - 1 ? 'default' : 'pointer' }}>
            次へ ▶
          </button>
          </>)}
          {singleItemMode && (onQueuePrev || onQueueNext) && (<>
          <button
            onClick={() => onQueuePrev && onQueuePrev()}
            disabled={!onQueuePrev}
            style={{ padding: '4px 14px', borderRadius: radius.lg, fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              border: !onQueuePrev ? `1px solid ${alpha('#FFFFFF', 0.15)}` : `1px solid ${alpha('#FFFFFF', 0.5)}`,
              background: !onQueuePrev ? 'transparent' : alpha('#FFFFFF', 0.1),
              color: !onQueuePrev ? alpha('#FFFFFF', 0.3) : color.white,
              cursor: !onQueuePrev ? 'default' : 'pointer' }}>
            ◀ 前へ
          </button>
          <span style={{ fontSize: font.size.sm, color: color.white, fontWeight: font.weight.bold, minWidth: 90, textAlign: 'center', fontFamily: font.family.mono }}>
            {queuePos || ''}
          </span>
          <button
            onClick={() => onQueueNext && onQueueNext()}
            disabled={!onQueueNext}
            style={{ padding: '4px 14px', borderRadius: radius.lg, fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
              border: !onQueueNext ? `1px solid ${alpha('#FFFFFF', 0.15)}` : `1px solid ${alpha('#FFFFFF', 0.5)}`,
              background: !onQueueNext ? 'transparent' : alpha('#FFFFFF', 0.1),
              color: !onQueueNext ? alpha('#FFFFFF', 0.3) : color.white,
              cursor: !onQueueNext ? 'default' : 'pointer' }}>
            次へ ▶
          </button>
          </>)}
        </div>

        {/* 右: オートコール + 閉じる */}
        <button onClick={toggleAutoDial}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: radius.lg, cursor: 'pointer', flexShrink: 0,
            border: `1px solid ${autoDial ? alpha('#FFFFFF', 0.7) : alpha('#FFFFFF', 0.2)}`,
            background: autoDial ? alpha('#FFFFFF', 0.85) : 'transparent',
            color: autoDial ? color.navyDeep : alpha('#FFFFFF', 0.45),
            fontSize: font.size.xs - 1, fontWeight: font.weight.bold, fontFamily: font.family.sans }}>
          <span>{autoDial ? '↻' : '▶'}</span>
          オートコール {autoDial ? 'ON' : 'OFF'}
        </button>
        {onMinimize && (
          <button onClick={onMinimize} title="最小化"
            style={{ width: 32, height: 32, borderRadius: radius.lg, background: alpha('#FFFFFF', 0.08), border: `1px solid ${alpha('#FFFFFF', 0.2)}`, color: color.white, cursor: 'pointer', fontSize: font.size.md, flexShrink: 0 }}>
            ⊟
          </button>
        )}
        <button onClick={handleClose}
          style={{ width: 32, height: 32, borderRadius: radius.lg, background: alpha('#FFFFFF', 0.08), border: `1px solid ${alpha('#FFFFFF', 0.2)}`, color: color.white, cursor: 'pointer', fontSize: font.size.lg, flexShrink: 0 }}>
          ✕
        </button>
      </div>

      {/* ── メインエリア（2カラム / モバイルは縦並び） ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>

        {/* 左カラム（モバイル時は全幅）。左:右=5:5（スクリプト側の充実に合わせて拡大） */}
        <div style={{ width: listMode ? '100%' : isMobile ? '100%' : '50%', overflow: 'auto', padding: isMobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {listMode ? (
            /* ────────────── リスト表示モード ────────────── */
            <div style={{ background: color.white, borderRadius: radius.md, overflow: 'hidden', border: `1px solid ${color.gray200}` }}>
              {/* 検索バー + 架電開始ボタン */}
              <div style={{ padding: `${space[2]}px ${space[3]}px`, borderBottom: `1px solid ${color.gray200}`, display: 'flex', gap: 6, alignItems: 'center', background: color.offWhite, flexWrap: 'wrap' }}>
                {/* IME対応のため共通Inputを使用（生inputだとURL書き戻しで日本語変換が壊れる） */}
                <Input size="sm" value={search} onChange={e => setSearchAndResetPage(e.target.value)} placeholder="検索..."
                  fullWidth={false} containerStyle={{ width: 180, minWidth: 120 }} style={{ fontSize: font.size.xs }} />
                {[['callable','架電可能'],['all','全件'],['excluded','架電不可']].map(([mode, label]) => (
                  <button key={mode} onClick={() => { setStatusFilterLocal([]); setFilterModeAndResetPage(mode); }}
                    style={{ padding: '4px 10px', borderRadius: radius.md, fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, cursor: 'pointer', fontFamily: font.family.sans, whiteSpace: 'nowrap',
                      background: filterMode === mode && statusFilterLocal.length === 0 ? color.navyDeep : 'transparent',
                      color: filterMode === mode && statusFilterLocal.length === 0 ? color.white : color.gray400,
                      border: `1px solid ${filterMode === mode && statusFilterLocal.length === 0 ? color.navyDeep : color.gray200}` }}>
                    {label}
                  </button>
                ))}
                {/* ステータスフィルタ（複数選択対応） */}
                <span style={{ color: color.gray300, fontSize: font.size.xs - 1 }}>|</span>
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
                    style={{ padding: '3px 8px', borderRadius: radius.md, fontSize: 9, fontWeight: font.weight.semibold, cursor: 'pointer', fontFamily: font.family.sans, whiteSpace: 'nowrap',
                      background: isActive ? color.navyDeep : 'transparent',
                      color: isActive ? color.white : color.gray400,
                      border: `1px solid ${isActive ? color.navyDeep : color.gray200}` }}>
                    {st}
                  </button>
                  );
                })}
                <span style={{ color: color.gray300, fontSize: font.size.xs - 1 }}>|</span>
                {/* 売上高フィルター */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.size.xs - 1, color: color.textMid, whiteSpace: 'nowrap' }}>
                  <span>売上高</span>
                  {[
                    { value: revenueMin, setter: (v) => { setRevenueMin(v); setPage(0); }, isMax: false },
                    { value: revenueMax, setter: (v) => { setRevenueMax(v); setPage(0); }, isMax: true },
                  ].map(({ value, setter, isMax }, idx) => (
                    <React.Fragment key={idx}>
                      {idx === 1 && <span>〜</span>}
                      <select value={value} onChange={e => setter(e.target.value)}
                        style={{ padding: '3px 4px', borderRadius: radius.md, border: `1px solid ${color.gray200}`, fontSize: font.size.xs - 1, fontFamily: font.family.sans, background: value ? alpha(color.navyLight, 0.08) : color.white, color: color.navyDeep, cursor: 'pointer' }}>
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
                <span style={{ color: color.gray300, fontSize: font.size.xs - 1 }}>|</span>
                {prefOptions.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    {prefDropOpen && (
                      <div onClick={() => setPrefDropOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
                    )}
                    <button onClick={() => setPrefDropOpen(v => !v)} style={{
                      padding: '3px 8px', borderRadius: radius.md,
                      border: `1px solid ${prefFilters.length > 0 ? color.navyDeep : color.gray200}`,
                      background: prefFilters.length > 0 ? alpha(color.navyLight, 0.08) : color.white,
                      fontSize: font.size.xs - 1, fontFamily: font.family.sans, cursor: 'pointer',
                      color: color.navyDeep, whiteSpace: 'nowrap',
                    }}>
                      {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : '都道府県▼'}
                    </button>
                    {prefDropOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 101,
                        background: color.white, border: `1px solid ${color.gray200}`,
                        borderRadius: radius.md, boxShadow: shadow.md,
                        minWidth: 130, maxHeight: 220, overflowY: 'auto', padding: '4px 0',
                      }}>
                        {prefFilters.length > 0 && (
                          <div onClick={() => { setPrefFilters([]); setPage(0); }} style={{
                            padding: '4px 10px', fontSize: font.size.xs - 1, color: color.navyDeep, cursor: 'pointer',
                            borderBottom: `1px solid ${color.gray200}`, fontWeight: font.weight.semibold,
                          }}>クリア</div>
                        )}
                        {prefOptions.map(p => (
                          <label key={p} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', cursor: 'pointer', fontSize: font.size.xs - 1,
                            fontFamily: font.family.sans, color: color.navyDeep,
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
                <div style={{ marginLeft: 'auto', paddingLeft: space[6] }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartCalling}
                    disabled={sessionStarted || sorted.length === 0}
                    style={{ padding: '6px 20px', fontSize: font.size.xs, fontWeight: font.weight.bold, whiteSpace: 'nowrap', borderRadius: radius.md }}
                  >
                    {sessionStarted ? '架電中' : '架電開始'}
                  </Button>
                </div>
              </div>
              {/* テーブル */}
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: color.textMid, fontSize: font.size.base }}>読み込み中...</div>
                ) : !list._supaId ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: color.textMid, fontSize: font.size.base }}>Supabase未登録リストです</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.xs }}>
                    <thead>
                      <tr style={{ background: color.navyDeep, position: 'sticky', top: 0, zIndex: 1 }}>
                        {[['No', '52px'], ['企業名', null], ['事業内容', null], ['住所', '90px'], ['売上高', '90px'], ['当期純利益', '90px'], ['代表者', '90px'], ['電話番号', '112px'], ['最終架電日', '80px'], ['担当者', '70px'], ['結果', '80px']].map(([h, w]) => {
                          const dir = sortState.column === h ? sortState.direction : null;
                          return (
                            <th key={h} onClick={() => handleSort(h)}
                              style={{ padding: '8px 8px', textAlign: 'left', fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white, letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', ...(w ? { width: w } : {}) }}>
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
                            style={{ cursor: 'pointer', background: isSelected ? alpha(color.navyLight, 0.08) : i % 2 === 0 ? color.white : color.offWhite, borderBottom: `1px solid ${color.gray200}`, transition: 'background 0.12s', borderLeft: isSelected ? `3px solid ${color.navyDeep}` : '3px solid transparent' }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = alpha(color.navyLight, 0.08); }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? color.white : color.offWhite; }}>
                            <td style={{ padding: '7px 8px', fontFamily: font.family.mono, fontSize: 9, color: color.gray500, textAlign: 'right', whiteSpace: 'nowrap' }}>{item.no}</td>
                            <td style={{ padding: '7px 8px', fontWeight: font.weight.semibold, color: color.navyDeep, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</td>
                            <td style={{ padding: '7px 8px', color: color.gray500, fontSize: font.size.xs - 1, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.business}</td>
                            <td style={{ padding: '7px 8px', color: color.gray500, fontSize: 9, width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address || '—'}</td>
                            <td style={{ padding: '7px 8px', fontFamily: font.family.mono, fontSize: 9, color: color.gray500, whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {item.revenue != null ? `${Number(item.revenue).toLocaleString()}千円` : <span style={{ color: color.gray400 }}>-</span>}
                            </td>
                            <td style={{ padding: '7px 8px', fontFamily: font.family.mono, fontSize: 9, color: color.gray500, whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {item.net_income != null ? `${Number(item.net_income).toLocaleString()}千円` : <span style={{ color: color.gray400 }}>-</span>}
                            </td>
                            <td style={{ padding: '7px 8px', color: color.gray500, fontSize: font.size.xs - 1, whiteSpace: 'nowrap' }}>{item.representative}</td>
                            <td style={{ padding: '7px 8px' }}>
                              {item.phone
                                ? <span onClick={e => { e.stopPropagation(); dialPhone(item.phone); setSelectedRow(item); setListMode(false); setLastDialedPhone(item.phone); }}
                                    style={{ fontFamily: font.family.mono, fontSize: font.size.xs - 1, color: color.navyDeep, fontWeight: font.weight.semibold, padding: '2px 6px', borderRadius: radius.md, background: alpha(color.navyDeep, 0.08), border: `1px solid ${alpha(color.navyDeep, 0.18)}`, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                    {item.phone}
                                  </span>
                                : <span style={{ color: color.gray400, fontSize: font.size.xs - 1 }}>-</span>}
                            </td>
                            <td style={{ padding: '7px 8px', fontSize: 9, color: color.gray500, whiteSpace: 'nowrap' }}>
                              {(() => { const recs = getRecordsForItem(item.id); if (!recs.length) return <span style={{ color: color.gray400 }}>-</span>; const latest = recs.reduce((a, b) => new Date(a.called_at || 0) > new Date(b.called_at || 0) ? a : b); return formatJST(latest.called_at); })()}
                            </td>
                            <td style={{ padding: '7px 8px', fontSize: 9, color: color.gray500, whiteSpace: 'nowrap' }}>
                              {(() => { const recs = getRecordsForItem(item.id); if (!recs.length) return <span style={{ color: color.gray400 }}>-</span>; const latest = recs.reduce((a, b) => new Date(a.called_at || 0) > new Date(b.called_at || 0) ? a : b); return latest.getter_name || <span style={{ color: color.gray400 }}>-</span>; })()}
                            </td>
                            <td style={{ padding: '7px 8px' }}>
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: radius.sm, fontWeight: font.weight.semibold, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
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
                <div style={{ padding: `${space[2]}px ${space[3]}px`, borderTop: `1px solid ${color.gray200}`, background: color.white, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ padding: '4px 12px', borderRadius: radius.md, border: page === 0 ? `1px solid ${color.gray200}` : `1px solid ${color.navyDeep}`, background: page === 0 ? color.offWhite : color.white, cursor: page === 0 ? 'default' : 'pointer', fontSize: font.size.xs, color: page === 0 ? color.gray400 : color.navyDeep, fontFamily: font.family.sans }}>← 前</button>
                  <span style={{ fontSize: font.size.xs, color: color.gray500 }}>{page + 1} / {totalPages}（{sorted.length}件）</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    style={{ padding: '4px 12px', borderRadius: radius.md, border: page === totalPages - 1 ? `1px solid ${color.gray200}` : `1px solid ${color.navyDeep}`, background: page === totalPages - 1 ? color.offWhite : color.white, cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: font.size.xs, color: page === totalPages - 1 ? color.gray400 : color.navyDeep, fontFamily: font.family.sans }}>次 →</button>
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
                  if (!latest) return { bg: color.gray100, color: color.textMid };
                  const s = latest.status;
                  if (s === '不通' || s === '受付ブロック') return { bg: color.dangerSoft, color: color.danger };
                  if (s === 'キーマン不在' || s === '受付再コール' || s === 'キーマン再コール') return { bg: color.warnSoft, color: '#C07600' };
                  if (s === 'アポ獲得') return { bg: color.successSoft, color: color.success };
                  return { bg: color.gray100, color: color.textMid };
                })();
                let parsedMemo = null;
                if (selectedRow.memo) { try { parsedMemo = JSON.parse(selectedRow.memo); } catch {} }
                return (
                  <div style={{ padding: space[5], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: space[3] }}>
                      <div style={{ fontSize: font.size.xl + 2, fontWeight: font.weight.bold, color: color.navyDeep, flex: 1, lineHeight: 1.3 }}>{selectedRow.company}</div>
                      <span style={{ fontSize: font.size.xs, padding: '1px 6px', borderRadius: radius.sm, fontWeight: font.weight.semibold, background: prevBadgeStyle.bg, color: prevBadgeStyle.color, flexShrink: 0 }}>
                        {lastResult}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 14 }}>
                      {(() => {
                        const netIncome = selectedRow.net_income ?? parsedMemo?.net_income ?? null;
                        return [
                          { label: '事業内容', value: selectedRow.business },
                          { label: '代表者', value: selectedRow.representative },
                          { label: '住所', value: (selectedRow.address || '').replace(/\/\s*$/, '') },
                          { label: '売上', value: selectedRow.revenue != null ? Number(selectedRow.revenue).toLocaleString() + ' 千円' : null },
                          { label: '当期純利益', value: netIncome != null ? Number(netIncome).toLocaleString() + ' 千円' : null },
                        ];
                      })().filter(x => x.value).map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
                          <span style={{ fontSize: font.size.xs - 1, color: color.gray400, flexShrink: 0, paddingTop: 2, minWidth: 56 }}>{label}</span>
                          <span style={{ fontSize: font.size.sm, color: color.navyDeep, fontWeight: font.weight.medium, wordBreak: 'break-all' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginBottom: 4 }}>
                        メモ{savingMemo && <span style={{ marginLeft: 6, fontSize: 9, color: color.gray400 }}>保存中...</span>}
                      </div>
                      <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleMemoBlur}
                        placeholder="架電メモ（フォーカスを外すと自動保存）"
                        style={{ width: '100%', minHeight: 52, padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${color.gray200}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: color.offWhite, color: color.textDark }} />
                    </div>
                  </div>
                );
              })()}

              {/* ② 架電エリア */}
              <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}` }}>
                {/* 電話番号 */}
                <div style={{ textAlign: 'center', marginBottom: space[3] }}>
                  <div style={{ fontSize: 28, fontWeight: font.weight.bold, color: color.navyDeep, fontFamily: font.family.mono, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {selectedRow.phone || '電話番号なし'}
                  </div>
                </div>
                {/* 架電ラウンド選択 */}
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.max(getNextRound(selectedRow.id), 10) }, (_, i) => i + 1).map(r => {
                    const roundRec = getRecordsForItem(selectedRow.id).find(rec => rec.round === r);
                    const nextRound = getNextRound(selectedRow.id);
                    const isCompleted = !!roundRec;
                    const isCurrent = r === nextRound && !isCompleted;
                    const isFuture = r > nextRound;
                    const isSelectedR = r === selectedRound;
                    return (
                      <button key={r} disabled={isFuture} onClick={() => !isFuture && setSelectedRound(r)}
                        style={{ width: 36, height: 36, borderRadius: radius.md, fontSize: font.size.base, fontWeight: font.weight.bold, fontFamily: font.family.mono,
                          background: isCompleted ? color.gray200 : isCurrent ? '#C07600' : 'transparent',
                          color: isCompleted ? color.gray500 : isCurrent ? color.white : color.gray400,
                          border: isSelectedR ? `2px solid ${color.navyDeep}` : isCompleted ? `1px solid ${color.gray300}` : isFuture ? `1px dashed ${color.gray200}` : '1px solid #C07600',
                          cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.3 : 1 }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
                {/* 電話ボタン */}
                {selectedRow.phone && (
                  <Button
                    variant="primary"
                    onClick={() => { dialPhone(selectedRow.phone); setLastDialedPhone(selectedRow.phone); }}
                    fullWidth
                    style={{ height: 56, borderRadius: radius.md, fontSize: font.size.lg + 2, fontWeight: font.weight.bold, letterSpacing: 1 }}
                  >
                    電話をかける
                  </Button>
                )}
                {/* 別事業所番号（本社以外の支店/営業所） */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  <input type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)} onBlur={handleSubPhoneBlur}
                    placeholder="別事業所番号 (支店/営業所)"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${color.gray200}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none', background: color.offWhite, color: color.textDark }} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); setLastDialedPhone(subPhone.trim()); }}
                    disabled={!subPhone.trim()}
                    style={{ padding: '6px 12px', fontSize: font.size.sm, fontWeight: font.weight.medium }}
                  >発信</Button>
                </div>
                {/* キーマン携帯 */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input type="tel" value={keymanMobile} onChange={e => setKeymanMobile(e.target.value)} onBlur={handleKeymanMobileBlur}
                    placeholder="キーマン携帯番号"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${color.gray200}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: 'none', background: color.offWhite, color: color.textDark }} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { if (!keymanMobile.trim()) return; dialPhone(keymanMobile.trim()); setLastDialedPhone(keymanMobile.trim()); }}
                    disabled={!keymanMobile.trim()}
                    style={{ padding: '6px 12px', fontSize: font.size.sm, fontWeight: font.weight.medium }}
                  >発信</Button>
                </div>
              </div>

              {/* ③ 結果入力エリア */}
              {(() => {
                const roundRec = getRecordsForItem(selectedRow.id).find(r => r.round === selectedRound);
                const sc = roundRec ? callStatusColor(roundRec.status) : null;
                if (roundRec) {
                  return (
                    <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: sc.color }}>{selectedRound}回目の結果：{roundRec.status}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteRecord(roundRec)}
                        style={{ fontSize: font.size.xs, padding: '6px 12px', fontWeight: font.weight.medium }}
                      >取消</Button>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}` }}>
                    {/* ステータスボタン: 全 9 ステータスを 3×3 均等 grid に配置（アポ獲得は navy 強調） */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[2] + 2 }}>
                      {callStatuses.map(st => {
                        const isAppo = st.id === 'appointment';
                        const sc = cfvShortcuts.find(s => s.id === st.id);
                        return (
                          <button key={st.id} onClick={() => handleResult(st.label)}
                            style={{ height: 52, borderRadius: radius.md, border: isAppo ? 'none' : `1px solid ${color.gray200}`, background: isAppo ? color.navy : color.white, color: isAppo ? color.white : color.gray500, fontSize: font.size.sm, fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family.sans, position: 'relative' }}>
                            {st.label}
                            {sc && <span style={{ position: 'absolute', bottom: 4, right: 7, fontSize: 9, opacity: isAppo ? 0.55 : 0.5, fontFamily: font.family.mono, color: isAppo ? color.white : undefined }}>{sc.key}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {list?.engagementSlug === 'matching' && (
                      <Button variant="outline" size="sm" onClick={() => setNeedsModal(selectedRow)}
                        style={{ width: '100%', marginTop: space[2] + 2 }}>買収ニーズを記録</Button>
                    )}
                  </div>
                );
              })()}

              {/* AI企業分析 */}
              {(() => {
                const hasAi = selectedRow.ai_overview || selectedRow.ai_strengths;
                const genAt = selectedRow.ai_generated_at ? new Date(selectedRow.ai_generated_at) : null;
                const genLabel = genAt ? `${genAt.getMonth() + 1}/${genAt.getDate()} ${genAt.getHours()}:${String(genAt.getMinutes()).padStart(2, '0')}` : '';
                const generatingNow = !!aiGenerating[selectedRow.id];
                const errCode = aiError[selectedRow.id];
                const errMsg = errCode === 'not_found' ? '該当企業が特定できませんでした。所在地や代表者を確認してください。'
                  : errCode === 'parse_failed' ? '生成結果が想定形式ではありませんでした。再生成してください。'
                  : errCode ? '生成に失敗しました。再生成してください。' : '';
                return (
                  <div style={{ padding: '12px 14px', borderRadius: radius.md, border: `1px solid ${hasAi ? alpha('#3B82F6', 0.13) : color.gray200}`, background: hasAi ? alpha(color.navyLight, 0.08) : color.white }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: hasAi ? 8 : 0 }}>
                      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navyDeep }}>AI企業分析</span>
                      {hasAi && genLabel && <span style={{ fontSize: 9, color: color.gray400, marginLeft: 6 }}>{genLabel}生成</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        {generatingNow ? (
                          <span style={{ fontSize: font.size.xs - 1, color: '#3B82F6', fontWeight: font.weight.semibold }}>生成中...</span>
                        ) : (
                          <button onClick={() => triggerAiGenerate(selectedRow)}
                            style={{ fontSize: font.size.xs - 1, fontWeight: font.weight.semibold, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: font.family.sans }}>
                            {hasAi ? '再生成' : '生成する'}
                          </button>
                        )}
                      </span>
                    </div>
                    {errMsg && (
                      <div style={{ fontSize: font.size.xs - 1, color: color.danger, marginTop: 4 }}>{errMsg}</div>
                    )}
                    {!hasAi && !generatingNow && !errMsg && (
                      <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginTop: 4 }}>企業HPをもとに概要・特徴を自動生成します</div>
                    )}
                    {hasAi && (
                      <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: 1.7, fontFamily: font.family.sans }}>
                        {selectedRow.ai_overview && (
                          <>
                            <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xs - 1, color: color.navyDeep, marginBottom: 2 }}>企業概要</div>
                            <div style={{ marginBottom: 8 }}>{selectedRow.ai_overview}</div>
                          </>
                        )}
                        {selectedRow.ai_strengths && (
                          <>
                            <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xs - 1, color: color.navyDeep, marginBottom: 2 }}>特徴・強み</div>
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
                // rejection_reason から温度感プレフィックスを切り出すヘルパー
                const TEMP_BADGE = {
                  HIGH:   { bg: alpha(color.success, 0.15), color: color.success, label: '温度感: 高' },
                  MEDIUM: { bg: alpha(color.info,    0.15), color: color.info,    label: '温度感: 中' },
                  LOW:    { bg: alpha(color.danger,  0.15), color: color.danger,  label: '温度感: 低' },
                  SKIP:   { bg: alpha(color.textLight, 0.15), color: color.textLight, label: '分析不可' },
                };
                const parseRejection = (raw) => {
                  if (!raw) return { temp: null, summary: '' };
                  const m = raw.match(/^(HIGH|MEDIUM|LOW|SKIP)\s*\n?([\s\S]*)$/);
                  if (m) return { temp: m[1].toUpperCase(), summary: m[2].trim() };
                  return { temp: null, summary: raw };
                };
                return (
                  <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}` }}>
                    <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navyDeep, marginBottom: 8 }}>架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dtStr = formatJST(rec.called_at);
                        const isKeymanReject = rec.status === 'キーマン断り';
                        const rej = isKeymanReject ? parseRejection(rec.rejection_reason) : null;
                        const tempConf = rej && rej.temp ? TEMP_BADGE[rej.temp] : null;
                        return (
                          <div key={rec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: radius.md, background: color.offWhite, fontSize: font.size.xs, border: `1px solid ${color.gray200}` }}>
                              <span style={{ fontWeight: font.weight.bold, color: color.navyDeep, minWidth: 40, fontFamily: font.family.mono, fontSize: font.size.xs - 1 }}>{rec.round}回目</span>
                              <span style={{ flex: 1, color: sc.color, fontWeight: font.weight.semibold }}>{rec.status}</span>
                              {rec.getter_name && (
                                <span style={{ color: color.textMid, fontSize: font.size.xs - 1 }}>{rec.getter_name}</span>
                              )}
                              <span style={{ color: color.gray400, fontSize: font.size.xs - 1 }}>{dtStr}</span>
                              {rec.recording_url
                                ? <button onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                    style={{ fontSize: font.size.base, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? color.danger : 'inherit' }}>録音</button>
                                : <button onClick={() => handleFetchRecording(rec)}
                                    style={{ fontSize: font.size.base, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>更新</button>
                              }
                            </div>
                            {/* キーマン断り の AI 分析結果（温度感バッジ + 要約） */}
                            {isKeymanReject && rej && (tempConf || rej.summary) && (
                              <div style={{
                                marginTop: 4, padding: '8px 10px',
                                background: alpha(color.danger, 0.04),
                                borderLeft: `3px solid ${color.danger}`,
                                borderRadius: radius.sm,
                                display: 'flex', flexDirection: 'column', gap: 4,
                              }}>
                                {tempConf && (
                                  <span style={{
                                    alignSelf: 'flex-start',
                                    fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
                                    padding: '2px 8px', borderRadius: radius.sm,
                                    background: tempConf.bg, color: tempConf.color,
                                  }}>{tempConf.label}</span>
                                )}
                                {rej.summary && (
                                  <span style={{
                                    fontSize: font.size.xs, color: color.textDark,
                                    lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                  }}>{rej.summary}</span>
                                )}
                              </div>
                            )}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: color.gray400, fontSize: font.size.md, flexDirection: 'column', gap: space[2] }}>
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
          background: color.white, borderTop: `1px solid ${color.gray200}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'height 0.25s ease', zIndex: 10,
          boxShadow: mobileScriptOpen ? shadow.lg : 'none',
        } : {
          width: '50%', background: color.white, borderLeft: `1px solid ${color.gray200}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* タブヘッダー */}
          <div onClick={() => isMobile && setMobileScriptOpen(o => !o)} style={{ display: 'flex', borderBottom: `2px solid ${color.gray200}`, background: color.offWhite, flexShrink: 0, cursor: isMobile ? 'pointer' : 'default' }}>
            {isMobile && <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: font.size.md, color: color.gray400 }}>{mobileScriptOpen ? '▼' : '▲'}</span>}
            {[{ key: 'script', label: 'スクリプト' }, { key: 'info', label: '企業概要' }, { key: 'cautions', label: '注意事項' }, { key: 'calendar', label: 'カレンダー' }].map(tab => (
              <button key={tab.key} onClick={(e) => { e.stopPropagation(); setScriptTab(tab.key); if (isMobile) setMobileScriptOpen(true); }}
                style={{ flex: 1, padding: isMobile ? '12px 4px' : '11px 4px', border: 'none', borderBottom: scriptTab === tab.key ? `2px solid ${color.navyDeep}` : '2px solid transparent',
                  background: 'transparent', color: scriptTab === tab.key ? color.navyDeep : color.gray400,
                  fontSize: isMobile ? font.size.sm : font.size.xs, fontWeight: scriptTab === tab.key ? font.weight.semibold : font.weight.normal, cursor: 'pointer',
                  fontFamily: font.family.sans, marginBottom: -2, transition: 'color 0.15s' }}>
                {tab.label}
              </button>
            ))}
          </div>
          {/* タブコンテンツ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: space[5] }}>
            {scriptTab === 'script' && (() => {
              // チップ・即時検索が参照するアウト返し（リスト別優先、なければ共通）
              let rdScript = null;
              try { rdScript = list.rebuttalData ? JSON.parse(list.rebuttalData) : null; } catch {}
              const rebuttal = rdScript || qaData;
              const hasTree = !!(list.scriptTree && Array.isArray(list.scriptTree.nodes) && list.scriptTree.nodes.length);
              const showGuide = hasTree && scriptViewMode === 'guide';
              return (
                <>
                  {hasTree && (
                    <div style={{ display: 'flex', gap: space[1], marginBottom: space[2] }}>
                      {[['guide', 'ガイド'], ['text', '全文']].map(([m, l]) => (
                        <button key={m} onClick={() => setScriptViewMode(m)}
                          style={{ fontSize: font.size.xs, padding: '4px 14px', borderRadius: radius.md, cursor: 'pointer', fontFamily: font.family.sans, border: 'none',
                            background: scriptViewMode === m ? color.navyDeep : color.gray100,
                            color: scriptViewMode === m ? color.white : color.gray500,
                            fontWeight: scriptViewMode === m ? font.weight.semibold : font.weight.normal }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  {showGuide
                    ? <ScriptTreeGuide tree={list.scriptTree} rebuttal={rebuttal} resetKey={`${list._supaId}|${selectedRow?.id || ''}`} style={{ fontSize: font.size.sm, color: color.navyDeep }} />
                    : list.scriptBody
                      ? <ScriptBody text={list.scriptBody} rebuttal={rebuttal} style={{ fontSize: font.size.sm, color: color.navyDeep, lineHeight: 1.8 }} />
                      : <div style={{ color: color.gray400, fontSize: font.size.sm }}>スクリプト未設定</div>}
                </>
              );
            })()}
            {scriptTab === 'info' && (() => {
              const pdfs = Array.isArray(list.companyOverviewPdfs) ? list.companyOverviewPdfs : [];
              const selectedPdf = pdfs.find(p => p.path === selectedOverviewPdfPath) || pdfs[0] || null;
              const iframeUrl = selectedPdf ? overviewPdfUrls[selectedPdf.path] : null;
              if (!list.companyInfo && pdfs.length === 0) {
                return <div style={{ color: color.gray400, fontSize: font.size.sm }}>企業概要未設定</div>;
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: space[3] }}>
                  {list.companyInfo && (
                    <pre style={{ fontSize: font.size.sm, color: '#4a4a4a', whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: 0, fontFamily: font.family.sans, flexShrink: 0, maxHeight: pdfs.length > 0 ? '30%' : 'none', overflowY: 'auto' }}>{list.companyInfo}</pre>
                  )}
                  {pdfs.length > 0 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', flexShrink: 0, borderBottom: `1px solid ${color.gray200}`, paddingBottom: space[2] }}>
                        {pdfs.map(pdf => {
                          const active = pdf.path === (selectedPdf?.path);
                          return (
                            <button key={pdf.path}
                              onClick={() => { setSelectedOverviewPdfPath(pdf.path); ensureOverviewPdfUrl(pdf); }}
                              title={pdf.name}
                              style={{
                                padding: '4px 10px', fontSize: font.size.xs,
                                borderRadius: radius.sm,
                                border: active ? `1px solid ${color.navyDeep}` : `1px solid ${color.gray200}`,
                                background: active ? color.navyDeep : color.white,
                                color: active ? color.white : color.navyDeep,
                                cursor: 'pointer', fontWeight: active ? font.weight.semibold : font.weight.normal,
                                fontFamily: font.family.sans,
                                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                              {pdf.name}
                            </button>
                          );
                        })}
                        {iframeUrl && (
                          <a href={iframeUrl} target="_blank" rel="noopener noreferrer"
                            style={{ marginLeft: 'auto', fontSize: font.size.xs - 1, color: color.gray500, textDecoration: 'underline', flexShrink: 0 }}>
                            新規タブで開く
                          </a>
                        )}
                      </div>
                      {selectedPdf && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 200, borderRadius: radius.md, border: `1px solid ${color.gray200}`, overflow: 'hidden', background: color.white }}>
                          {iframeUrl ? (
                            <iframe
                              src={`${iframeUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              title={selectedPdf.name}
                              style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }}
                            />
                          ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.gray400, fontSize: font.size.xs }}>PDFを読み込み中...</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
            {scriptTab === 'cautions' && (
              list.cautions
                ? <CautionsCards text={list.cautions} fontSize={12} filter="non-calendar" />
                : <div style={{ color: color.gray400, fontSize: font.size.sm }}>注意事項未設定</div>
            )}
            {scriptTab === 'calendar' && (() => {
              const cl = (clientData || []).find(c => c.company === list.company);
              const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
              const linkedContacts = resolveListContacts(list, contacts);
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
                    onUpdateCalendarLines={async (newLines) => {
                      if (!list?._supaId) return;
                      const newCautions = replaceCalendarSection(list.cautions, newLines);
                      const err = await updateCallListCautions(list._supaId, newCautions);
                      if (err) { alert('注意事項の保存に失敗しました'); return; }
                      if (setCallListData) setCallListData(prev => prev.map(l => l._supaId === list._supaId ? { ...l, cautions: newCautions } : l));
                    }}
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
          initialRecordingUrl={initialRecordingUrl || ''}
          dialedPhone={lastDialedPhone || initialDialedPhone || appoModal.phone || ''}
          onFetchRecordingUrl={() => handleAppoFetchRecording(appoModal.id, lastDialedPhone || initialDialedPhone || appoModal.phone)}
        />
      )}

      {/* ─── 買い手マッチング 買収ニーズ ヒアリングモーダル ─── */}
      {needsModal && (
        <NeedsHearingModal
          row={needsModal}
          currentUser={currentUser}
          onClose={() => setNeedsModal(null)}
          onSave={handleNeedsSave}
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
          background: alpha('#000000', 0.45), zIndex: 10003,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: color.white, borderRadius: radius.md, padding: 28, width: 380,
            border: `1px solid ${color.gray200}`, fontFamily: font.family.sans,
          }}>
            <div style={{ fontSize: 15, fontWeight: font.weight.bold, color: color.navyDeep, marginBottom: space[4] }}>キーボードショートカット</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
              <tbody>
                {[
                  ...(IS_MAC
                    ? [['1', '不通'], ['2', 'キーマン不在'], ['3', 'アポ獲得'],
                       ['4', '受付ブロック'], ['5', '受付再コール'], ['6', 'キーマン再コール'],
                       ['7', 'キーマン断り'], ['8', '除外']]
                    : [['F1', '不通'], ['F2', 'キーマン不在'], ['F3', 'アポ獲得'],
                       ['F4', '受付ブロック'], ['F5', '受付再コール'], ['F6', 'キーマン再コール'],
                       ['F7', 'キーマン断り'], ['F8', '除外']]),
                  ['← →', '前後の企業に移動'], ['Esc', 'モーダルを閉じる'], ['?', 'このヘルプを表示'],
                ].map(([key, desc]) => (
                  <tr key={key} style={{ borderBottom: `1px solid ${color.gray100}` }}>
                    <td style={{ padding: '6px 10px', width: 90 }}>
                      <kbd style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: radius.md,
                        background: color.gray100, border: `1px solid ${color.gray300}`,
                        fontFamily: font.family.mono, fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.gray700,
                      }}>{key}</kbd>
                    </td>
                    <td style={{ padding: '6px 10px', color: color.gray700 }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="primary"
              fullWidth
              onClick={() => setShowShortcutHelp(false)}
              style={{ marginTop: space[4], padding: '6px 12px', fontSize: font.size.sm, fontWeight: font.weight.medium, borderRadius: radius.md }}
            >閉じる</Button>
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
            onSave={(savedAppoData) => {
              setQuickAppoSlot(null);
              if (setAppoData && savedAppoData) {
                setAppoData(prev => [...(prev || []), {
                  ...savedAppoData,
                  month: savedAppoData.meetDate ? (parseInt(savedAppoData.meetDate.slice(5, 7), 10) + '月') : '',
                  isProspecting: !!list?.is_prospecting,
                }]);
              }
            }}
          />
        );
      })()}

      {pdfPreviewLoading && (
        <div style={{ position: 'fixed', inset: 0, background: alpha('#000000', 0.4), zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.white, fontSize: font.size.base }}>
          PDFを読み込み中...
        </div>
      )}

      {pdfPreview && (
        <div onClick={() => setPdfPreview(null)}
          style={{ position: 'fixed', inset: 0, background: alpha('#000000', 0.75), zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[5] }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '95vw', height: '92vh', maxWidth: 1200, borderRadius: radius.md, background: color.white, border: `1px solid ${color.gray200}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: color.navyDeep, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontWeight: font.weight.semibold, fontSize: font.size.base, color: color.white }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfPreview.name}</span>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexShrink: 0 }}>
                <a href={pdfPreview.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: font.size.xs, color: color.white, textDecoration: 'underline' }}>新規タブで開く</a>
                <button onClick={() => setPdfPreview(null)} style={{ background: 'none', border: 'none', color: color.white, fontSize: font.size.lg + 2, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <iframe
              src={`${pdfPreview.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={pdfPreview.name}
              style={{ flex: 1, border: 'none', width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 買い手マッチング 買収ニーズ ヒアリング入力モーダル。
// 7項目（業種/エリア/売上/営業利益/予算/目的/メモ）を自由記述。
// 入力された項目だけ保存。アポとは独立（売上/報酬計算に干渉しない）。
function NeedsHearingModal({ row, currentUser, onClose, onSave }) {
  const [f, setF] = useState({ industry: '', area: '', revenue: '', operating_profit: '', budget: '', purpose: '', memo: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const hasAny = Object.values(f).some(v => (v || '').trim());

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(f);
    setSaving(false);
    if (ok) onClose();
  };

  const textFields = [
    { key: 'industry', label: '業種', ph: '例: 製造業（金属加工）' },
    { key: 'area', label: 'エリア', ph: '例: 関東一円 / 西日本' },
    { key: 'revenue', label: '売上', ph: '例: 5億〜30億' },
    { key: 'operating_profit', label: '営業利益', ph: '例: 5,000万以上 / EBITDA1億〜' },
    { key: 'budget', label: '予算', ph: '例: 〜10億' },
  ];
  const areaStyle = {
    width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: radius.md,
    border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans,
    color: color.textDark, background: color.gray50, outline: 'none', resize: 'vertical', lineHeight: 1.6,
  };
  const lbl = { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, display: 'block', marginBottom: 2 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: alpha('#000000', 0.45), zIndex: 10004, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[5] }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', background: color.white, borderRadius: radius.lg, boxShadow: shadow.xl, border: `1px solid ${color.gray200}` }}>
        <div style={{ background: color.navy, color: color.white, padding: '14px 20px', borderRadius: `${radius.lg}px ${radius.lg}px 0 0` }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>買収ニーズを記録</div>
          <div style={{ fontSize: font.size.xs, opacity: 0.85, marginTop: 2 }}>{row?.company || ''}</div>
        </div>
        <div style={{ padding: space[5] }}>
          <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: space[3], lineHeight: 1.6 }}>
            このアプローチ先がどんな会社を買収したいか（買収ニーズ）を記録します。アポの成否とは独立した実績です。入力した項目だけ保存されます。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            {textFields.map(fd => (
              <div key={fd.key}>
                <label style={lbl}>{fd.label}</label>
                <Input size="sm" value={f[fd.key]} onChange={e => set(fd.key, e.target.value)} placeholder={fd.ph} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: space[3] }}>
            <label style={lbl}>目的</label>
            <textarea value={f.purpose} onChange={e => set('purpose', e.target.value)} rows={2} style={areaStyle} placeholder="例: 商圏拡大 / 技術獲得 / 人材確保" />
          </div>
          <div style={{ marginTop: space[3] }}>
            <label style={lbl}>メモ</label>
            <textarea value={f.memo} onChange={e => set('memo', e.target.value)} rows={3} style={areaStyle} placeholder="その他、先方から聞いた買収ニーズの詳細" />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving || !hasAny}>保存</Button>
        </div>
      </div>
    </div>
  );
}
