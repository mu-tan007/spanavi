import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { dialPhone } from '../../utils/phone';
import { extractUserNote, buildMemoWithNote } from '../../utils/memo';
import { fetchCallListItems, fetchCallRecords, insertCallRecord, updateCallListItem, insertCallSession, updateCallSession, updateCallRecordRecordingUrl, invokeGetZoomRecording } from '../../lib/supabaseWrite';
import RecallModal from './RecallModal';
import AppoReportModal from './AppoReportModal';

// ============================================================
// Call Flow View (架電フロー) — 左右分割レイアウト
// ============================================================
// モジュールレベルのセッションIDキャッシュ（React Strict Mode 二重INSERT防止）
// useRef と異なりStrict Modeのfake unmount/remountでもリセットされない
const _cfSessionCache = new Map(); // `${listId}|${startNo}|${endNo}` → sessionId
// モジュールレベルの「リアルクローズ済みセッションID」セット
// isRealCloseRef（useRef）はStrict Modeで信頼できないため、同じパターンで管理
const _cfRealCloseSet = new Set(); // sessionId → リアルクローズ時にadd、cleanup後にdelete

export default function CallFlowView({ list, startNo, endNo, statusFilter = null, onClose, setAppoData, members = [], currentUser = '', defaultItemId = null, clientData = [], rewardMaster = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [appoModal, setAppoModal] = useState(null); // holds selectedRow when アポ獲得 is clicked
  const [scriptPanelOpen, setScriptPanelOpen] = useState(true);
  const [scriptTab, setScriptTab] = useState('script');
  const [sortState, setSortState] = useState({ column: null, direction: null });
  const [callRecords, setCallRecords] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [filterMode, setFilterMode] = useState('callable');
  const [recallModal, setRecallModal] = useState(null); // { row, statusId, round, label }
  const [subPhone, setSubPhone] = useState('');
  const [lastDialedPhone, setLastDialedPhone] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const PAGE_SIZE = 30;
  const sessionIdRef = React.useRef(null);
  const [autoDial, setAutoDial] = useState(() => {
    try { return localStorage.getItem('cf_autocall') === 'true'; } catch { return false; }
  });
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
    Promise.all([
      fetchCallListItems(list._supaId),
      fetchCallRecords(list._supaId),
    ]).then(([itemsRes, recordsRes]) => {
      const fetchedItems = itemsRes.data || [];
      const fetchedRecords = recordsRes.data || [];
      setItems(fetchedItems);
      setCallRecords(fetchedRecords);
      if (defaultItemId) {
        const target = fetchedItems.find(i => i.id === defaultItemId);
        if (target) setSelectedRow(target);
      }
      setLoading(false);
    }).catch(err => {
      console.error('[CallFlowView] データ取得エラー:', err);
      setLoading(false);
    });
  }, [list._supaId]);

  useEffect(() => {
    setLocalMemo(selectedRow?.id ? extractUserNote(selectedRow.memo) : '');
    setSubPhone(selectedRow?.sub_phone_number || '');
    setLastDialedPhone(null);
  }, [selectedRow?.id]);

  useEffect(() => {
    if (!selectedRow) { setSelectedRound(null); return; }
    const recs = callRecords.filter(r => r.item_id === selectedRow.id);
    const maxRound = recs.length > 0 ? Math.max(...recs.map(r => r.round)) : 0;
    setSelectedRound(Math.min(maxRound + 1, 8));
  }, [selectedRow?.id]);

  // Session creation on mount + beforeunload guard
  React.useEffect(() => {
    const totalCount = (startNo != null && endNo != null)
      ? (Number(endNo) - Number(startNo) + 1)
      : 0;

    // モジュールレベルキャッシュでStrict Modeの二重INSERT防止
    const cacheKey = `${list.id}|${startNo ?? ''}|${endNo ?? ''}`;

    if (_cfSessionCache.has(cacheKey)) {
      sessionIdRef.current = _cfSessionCache.get(cacheKey);
    } else {
      const newId = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      sessionIdRef.current = newId;
      _cfSessionCache.set(cacheKey, newId);
      insertCallSession({
        id: newId,
        list_id: list.id,
        list_supa_id: list._supaId || null,
        list_name: list.company || '',
        industry: list.industry || '',
        caller_name: currentUser || '不明',
        start_no: startNo ?? null,
        end_no: endNo ?? null,
        total_count: totalCount,
        started_at: new Date().toISOString(),
        finished_at: null,
        last_called_at: null,
      })
        .catch(e => console.error('[Session] insertCallSession error:', e));
    }

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
      } else {
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // handleClose ではモジュールレベルの _cfRealCloseSet にセッションIDを登録してから onClose()
  const handleClose = () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) _cfRealCloseSet.add(sessionId);
    onClose();
  };

  const EXCLUDED_STATUSES = new Set(['アポ獲得', '除外']);
  const getRecordsForItem = (itemId) => callRecords.filter(r => r.item_id === itemId);
  const getNextRound = (itemId) => {
    const recs = getRecordsForItem(itemId);
    return recs.length === 0 ? 1 : Math.min(Math.max(...recs.map(r => r.round)) + 1, 8);
  };
  const isExcludedItem = (itemId) => callRecords.some(r => r.item_id === itemId && EXCLUDED_STATUSES.has(r.status));

  // Range filter (Number() で型統一: DBからstringで返る場合も安全)
  const rangeItems = (() => {
    if (startNo != null && endNo != null) {
      const s = Number(startNo), e = Number(endNo);
      const result = items.filter(i => Number(i.no) >= s && Number(i.no) <= e);
      return result;
    }
    return items;
  })();

  // Status filter (statusFilter=null は絞り込みなし)
  const statusFilteredItems = (() => {
    if (!statusFilter || statusFilter.length === 0) return rangeItems;
    return rangeItems.filter(item => {
      const records = getRecordsForItem(item.id);
      if (records.length === 0) return statusFilter.includes('未架電');
      const latestRecord = records.reduce((a, b) => (a.round || 0) >= (b.round || 0) ? a : b);
      return statusFilter.includes(latestRecord.status);
    });
  })();

  // 範囲指定なし時のみ: items ロード完了後に total_count を実件数で確定
  React.useEffect(() => {
    if (!loading && items.length > 0 && (startNo == null || endNo == null)) {
      updateCallSession(sessionIdRef.current, { total_count: items.length })
        .catch(e => console.error('[Session] updateCallSession totalCount error:', e));
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 架電のたびに last_called_at を更新
  const _updateSessionProgress = () => {
    if (!sessionIdRef.current) return;
    updateCallSession(sessionIdRef.current, { last_called_at: new Date().toISOString() })
      .catch(e => console.error('[Session] _updateSessionProgress error:', e));
  };

  const filtered = (() => {
    const result = statusFilteredItems.filter(item => {
      const matchSearch = !search || item.company?.includes(search) || item.representative?.includes(search) || item.phone?.includes(search);
      if (!matchSearch) return false;
      if (filterMode === 'callable') return !isExcludedItem(item.id);
      if (filterMode === 'excluded') return isExcludedItem(item.id);
      return true;
    });
    return result;
  })();

  const COL_KEY_MAP = { 'No': 'no', '企業名': 'company', '事業内容': 'business', '代表者': 'representative', '電話番号': 'phone', '結果': 'call_status' };
  const sorted = sortState.column && sortState.direction
    ? [...filtered].sort((a, b) => {
        const key = COL_KEY_MAP[sortState.column];
        const av = a[key] ?? '';
        const bv = b[key] ?? '';
        const cmp = key === 'no'
          ? (Number(av) || 0) - (Number(bv) || 0)
          : String(av).localeCompare(String(bv), 'ja');
        return sortState.direction === 'desc' ? -cmp : cmp;
      })
    : filtered;

  const handleSort = (col) => {
    setSortState(prev => {
      if (prev.column === col && prev.direction === 'desc') return { column: null, direction: null };
      return { column: col, direction: 'desc' };
    });
    setPage(0);
  };

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

  const callStatusColor = (st, isExcluded) => {
    if (isExcluded) return { bg: '#fee2e2', color: '#e53e3e' };
    const s = st || '未架電';
    if (s === '未架電')      return { bg: 'transparent', color: C.textLight };
    if (s === '不通')        return { bg: '#f0f0f0',     color: '#999' };
    if (s === '社長不在')    return { bg: '#fefce8',     color: '#d69e2e' };
    if (s === '受付ブロック') return { bg: '#fff7ed',    color: '#dd6b20' };
    if (s === '受付再コール') return { bg: '#ebf8ff',    color: '#3182ce' };
    if (s === '社長再コール') return { bg: '#ebf8ff',    color: '#3182ce' };
    if (s === 'アポ獲得')    return { bg: '#f0fff4',     color: '#38a169' };
    if (s === '社長お断り')  return { bg: '#faf5ff',     color: '#805ad5' };
    if (s === '除外')        return { bg: '#fee2e2',     color: '#e53e3e' };
    return { bg: C.offWhite, color: C.textLight };
  };

  const handleResult = async (result) => {
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

    const recordingUrl = await fetchRecordingUrl(lastDialedPhone || selectedRow.phone, calledAt, _prevCalledAtResult);

    const { result: newRec, error } = await insertCallRecord({
      item_id: selectedRow.id, list_id: list._supaId,
      round: selectedRound, status: result, memo: localMemo || null,
      called_at: calledAt, recording_url: recordingUrl, getter_name: currentUser,
    });
    if (error || !newRec) {
      console.error('[handleResult] insertCallRecord 失敗 — calledCountは更新しない');
      return;
    }

    const newRecords = [...callRecords, newRec];

    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(selectedRow.id, { call_status: result, is_excluded: newIsExcl });
    const updatedItem = { ...selectedRow, call_status: result, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === selectedRow.id ? updatedItem : i);
    setItems(newItems);
    setCallRecords(newRecords);
    _updateSessionProgress();

    const idx = newItems.findIndex(i => i.id === selectedRow.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
  };

  const handleDeleteRecord = async (record) => {
    await deleteCallRecord(record.id);
    const newRecords = callRecords.filter(r => r.id !== record.id);
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === selectedRow.id);
    const lastRec = [...itemRecs].sort((a, b) => b.round - a.round)[0];
    const newStatus = lastRec?.status || '未架電';
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(selectedRow.id, { call_status: newStatus, is_excluded: newIsExcl });
    setItems(prev => prev.map(i => i.id === selectedRow.id ? { ...i, call_status: newStatus, is_excluded: newIsExcl } : i));
    setSelectedRow(prev => prev ? { ...prev, call_status: newStatus, is_excluded: newIsExcl } : prev);
    setSelectedRound(record.round);
  };

  const handleFetchRecording = async (rec) => {
    const item = items.find(i => i.id === rec.item_id);
    if (!item) return;
    const url = await fetchRecordingUrl(item.phone, rec.called_at, null);
    if (!url) { alert('録音URLを取得できませんでした'); return; }
    const dbError = await updateCallRecordRecordingUrl(rec.id, url);
    if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
    setCallRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
  };

  // アポ報告フォーム用録音URL取得（callRecords state → Supabase DB → Zoom API の順に検索）
  const handleAppoFetchRecording = async (itemId, phone) => {
    // Step 1: callRecords state に既にある場合
    const stateRec = callRecords
      .filter(r => r.item_id === itemId && r.recording_url)
      .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
    if (stateRec?.recording_url) return stateRec.recording_url;

    // Step 2: Supabase の call_records を直接確認（state が古い・まだ保存されていない可能性）
    const { data: freshRecs } = await fetchCallRecords(list._supaId);
    if (freshRecs?.length) {
      const freshRec = freshRecs
        .filter(r => r.item_id === itemId && r.recording_url)
        .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0];
      if (freshRec?.recording_url) {
        setCallRecords(freshRecs);
        return freshRec.recording_url;
      }
    }

    // Step 3: Zoom API から取得（called_at = 現在時刻で直近の通話を対象にする）
    return await fetchRecordingUrl(phone, new Date().toISOString(), null);
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

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);

    const itemRecs = newRecords.filter(r => r.item_id === appoModal.id);
    await updateCallListItem(appoModal.id, { call_status: 'アポ獲得', is_excluded: true });
    const updatedItem = { ...appoModal, call_status: 'アポ獲得', is_excluded: true };
    const newItems = items.map(i => i.id === appoModal.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress();

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

    const idx = newItems.findIndex(i => i.id === appoModal.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
    setAppoModal(null);
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

    const recordingUrlRecall = await fetchRecordingUrl(row.phone, calledAtRecall, _prevRecRecall?.called_at || null);

    const { result: newRec, error } = await insertCallRecord({
      item_id: row.id, list_id: list._supaId,
      round, status: label, memo: memoJson,
      called_at: calledAtRecall, recording_url: recordingUrlRecall, getter_name: currentUser,
    });
    if (error || !newRec) { setRecallModal(null); return; }

    const newRecords = [...callRecords, newRec];
    setCallRecords(newRecords);
    const itemRecs = newRecords.filter(r => r.item_id === row.id);
    const newIsExcl = itemRecs.some(r => EXCLUDED_STATUSES.has(r.status));
    await updateCallListItem(row.id, { call_status: label, is_excluded: newIsExcl });
    const updatedItem = { ...row, call_status: label, is_excluded: newIsExcl };
    const newItems = items.map(i => i.id === row.id ? updatedItem : i);
    setItems(newItems);
    _updateSessionProgress();

    const idx = newItems.findIndex(i => i.id === row.id);
    let next = null;
    for (let j = idx + 1; j < newItems.length; j++) {
      const ni = newItems[j];
      const niRecs = newRecords.filter(r => r.item_id === ni.id);
      const niExcl = niRecs.some(r => EXCLUDED_STATUSES.has(r.status));
      const niNext = niRecs.length === 0 ? 1 : Math.min(Math.max(...niRecs.map(r => r.round)) + 1, 8);
      if (!niExcl && niNext <= 8) { next = ni; break; }
    }
    setSelectedRow(next || updatedItem);
    if (autoDial && next?.phone) dialPhone(next.phone);
    setRecallModal(null);
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

  return (
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
            border: '1px solid ' + (autoDial ? C.gold : C.white + '30'),
            background: autoDial ? C.gold : C.white + '10',
            color: autoDial ? C.navy : C.white + 'aa',
            fontSize: 10, fontWeight: 700, fontFamily: "'Noto Sans JP'",
          }}>
            <span style={{ fontSize: 12 }}>{autoDial ? '🔁' : '▶'}</span>
            オートコール {autoDial ? 'ON' : 'OFF'}
          </button>
          <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 6, background: C.white + '15', border: '1px solid ' + C.white + '30', color: C.white, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ height: 4, background: C.white + '20', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: progress + '%', height: '100%', background: 'linear-gradient(90deg, ' + C.goldLight + ', #6fcf97)', borderRadius: 2, transition: 'width 0.4s ease' }} />
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
                    {[['No', '36px'], ['企業名', null], ['事業内容', null], ['代表者', '90px'], ['電話番号', '112px'], ['結果', '76px']].map(([h, w]) => {
                      const isActive = sortState.column === h && sortState.direction === 'desc';
                      return (
                        <th key={h} onClick={() => handleSort(h)}
                          style={{ padding: '7px 8px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', ...(w ? { width: w } : {}) }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {h}
                            <svg width="8" height="7" viewBox="0 0 8 7" style={{ flexShrink: 0 }}>
                              {isActive
                                ? <polygon points="2,7 8,7 5,2" fill={C.goldLight} />
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
                    const sc = callStatusColor(item.call_status, item.is_excluded);
                    return (
                      <tr key={item.id} onClick={() => setSelectedRow(item)}
                        style={{ cursor: 'pointer', background: isSelected ? C.gold + '18' : isCalled ? '#f5f3ef' : i % 2 === 0 ? C.white : C.cream, borderLeft: isSelected ? '3px solid ' + C.gold : '3px solid transparent', transition: 'background 0.12s' }}>
                        <td style={{ padding: '6px 8px', fontFamily: "'JetBrains Mono'", fontSize: 9, color: C.textLight }}>{item.no}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: C.navy, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</td>
                        <td style={{ padding: '6px 8px', color: C.textMid, fontSize: 10, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.business}</td>
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
                              : '未架電'}
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
              👈 左のリストから企業を選択してください
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              {/* 企業名 */}
              <div style={{ fontSize: 17, fontWeight: 800, color: C.navy, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid ' + C.borderLight }}>
                {selectedRow.company}
              </div>

              {/* 📋 基本情報 */}
              {(() => {
                const recs = getRecordsForItem(selectedRow.id);
                const latest = recs.length > 0 ? recs.reduce((a, b) => a.round >= b.round ? a : b) : null;
                const lastResult = latest ? latest.status : '未架電';
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📋 基本情報</div>
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

              {/* 📊 詳細情報 */}
              {(() => {
                let parsedMemo = null;
                if (selectedRow.memo) { try { parsedMemo = JSON.parse(selectedRow.memo); } catch { /* plain text */ } }
                const netIncome = selectedRow.net_income ?? parsedMemo?.net_income ?? null;
                const biko = parsedMemo?.biko ?? (selectedRow.memo && !parsedMemo ? selectedRow.memo : null);
                return (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>📊 詳細情報</div>
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
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.white + 'cc', marginBottom: 3 }}>📞 電話をかける</div>
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
                >📞</button>
              </div>

              {/* ラウンドボタン */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4,5,6,7,8].map(r => {
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                    {CALL_RESULTS.map(r => {
                      const isAppo = r.id === 'appointment';
                      const isExcl = r.id === 'excluded';
                      const btnBg    = isAppo ? C.gold    : isExcl ? C.red + '10' : C.navy + '08';
                      const btnColor = isAppo ? C.white   : isExcl ? C.red        : C.navy;
                      const btnBdr   = isAppo ? '1.5px solid ' + C.gold : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                      return (
                        <button key={r.id} onClick={() => handleResult(r.label)}
                          style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                          {r.label}
                        </button>
                      );
                    })}
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
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>📋 架電履歴</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recs.map(rec => {
                        const sc = callStatusColor(rec.status);
                        const dt = rec.called_at ? new Date(rec.called_at) : null;
                        const dtStr = dt
                          ? `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
                          : '';
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
                                      padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>🎙</button>
                                : <button onClick={() => handleFetchRecording(rec)}
                                    title="録音URLを手動取得"
                                    style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>🔄</button>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>📝 スクリプト</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scriptPanelOpen && [
              { key: 'script',   label: '📝 スクリプト' },
              { key: 'info',     label: '🏢 企業概要' },
              { key: 'cautions', label: '⚠ 注意事項' },
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
            {scriptTab === 'script' && (
              list.scriptBody
                ? <pre style={{ fontSize: 11, color: C.textDark, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.scriptBody}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>スクリプト未設定</div>
            )}
            {scriptTab === 'info' && (
              list.companyInfo
                ? <pre style={{ fontSize: 11, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.companyInfo}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>企業概要未設定</div>
            )}
            {scriptTab === 'cautions' && (
              list.cautions
                ? <pre style={{ fontSize: 11, color: C.orange, whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontFamily: "'Noto Sans JP'" }}>{list.cautions}</pre>
                : <div style={{ color: C.textLight, fontSize: 11 }}>注意事項未設定</div>
            )}
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
          initialRecordingUrl={
            callRecords
              .filter(r => r.item_id === appoModal.id && r.recording_url)
              .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))[0]?.recording_url || ''
          }
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
        />
      )}
    </div>
  );
}