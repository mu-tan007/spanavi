import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { C } from '../../constants/colors';
import { dialPhone } from '../../utils/phone';
import { zoomPhone } from '../../lib/zoomPhoneStore';
import { getCallListItemId, clearCallListItemIdCache, insertCallRecord, updateCallListItem, deleteCallRecordByItemRound, invokeGetZoomRecording, updateCallRecordRecordingUrl } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { useCallStatuses } from '../../hooks/useCallStatuses';

export default function CallingScreen({ listId, list, importedCSVs, setImportedCSVs, onClose, onMinimize, isMinimized, summaryRef, closeRef, currentUser, liveStatuses, setLiveStatuses, members = [], clientData = [], rewardMaster = [] }) {
  const { statuses, shortcuts: CS_SHORTCUTS, loading: statusLoading } = useCallStatuses();
  const STATUSES = statuses;
  const EXCLUDED_IDS = useMemo(() => statuses.filter(s => s.excluded).map(s => s.id), [statuses]);
  const HIDDEN_FROM_CALLABLE = useMemo(() =>
    statuses.filter(s => s.excluded || ['reception_recall', 'ceo_recall'].includes(s.id)).map(s => s.id),
    [statuses]
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [pageStart, setPageStart] = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);
  const [memo, setMemo] = useState("");
  const [currentRound, setCurrentRound] = useState(1);
  const [filterMode, setFilterMode] = useState("callable"); // "all", "callable", "excluded"
  const [listSortBy, setListSortBy] = useState(null);
  const [listSortDir, setListSortDir] = useState("asc");
  const [appoModal, setAppoModal] = useState(null); // { idx, row } when appointment selected
  const [recallModal, setRecallModal] = useState(null); // { idx, row, statusId } when recall selected
  const [editRound, setEditRound] = useState(1);
  useEffect(() => { setEditRound(currentRound); }, [currentRound]);
  // Reset editRound to next uncalled round when selecting a different company
  useEffect(() => {
    if (selectedRow === null) return;
    const row = (importedCSVs[listId] || [])[selectedRow];
    const keys = row?.rounds ? Object.keys(row.rounds) : [];
    const maxRd = keys.length > 0 ? Math.max(...keys.map(Number)) : 0;
    setEditRound(Math.max(maxRd + 1, 1));
  }, [selectedRow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showScript, setShowScript] = useState(false);
  const [prefFilters, setPrefFilters] = useState([]);
  const [prefDropOpen, setPrefDropOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const kbRef = useRef({});
  const isMinimizedRef = useRef(false);
  useEffect(() => { isMinimizedRef.current = !!isMinimized; }, [isMinimized]);

  const PAGE_SIZE = 30;
  const [sessionKey] = useState(() => "self_" + (currentUser || "unknown") + "_" + Date.now());
  const csvData = importedCSVs[listId] || [];

  // Supabase item ID は遷移時に全件ロードせず、必要になった時だけ getCallListItemId で1件引く（キャッシュあり）。
  // リスト切替時はキャッシュをクリアして古い listId 由来の id を引かないようにする。
  useEffect(() => {
    return () => { if (list?._supaId) clearCallListItemIdCache(list._supaId); };
  }, [list?._supaId]);

  // Range input
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeConfirmed, setRangeConfirmed] = useState(false);
  const [rangeError, setRangeError] = useState(false);

  const rangeStartNum = rangeConfirmed ? parseInt(rangeStart) || 1 : null;
  const rangeEndNum = rangeConfirmed ? parseInt(rangeEnd) || csvData.length : null;

  // Sync live status on mount, row change, round change
  const updateLiveStatus = useCallback((extra) => {
    if (!setLiveStatuses || !currentUser) return;
    const calledCount = csvData.filter(r => r.rounds && r.rounds[currentRound]).length;
    const totalCallable = csvData.filter(r => !r._excluded).length;
    setLiveStatuses(prev => ({
      ...prev,
      [sessionKey]: {
        active: true,
        user: currentUser,
        listName: list ? list.client + " / " + (list.industry || "") : listId,
        listId,
        round: currentRound,
        calledCount,
        totalCallable,
        selectedRow: selectedRow !== null ? selectedRow + 1 : null,
        rangeStart: rangeStartNum,
        rangeEnd: rangeEndNum,
        startedAt: (prev[sessionKey] && prev[sessionKey].startedAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(extra || {}),
      }
    }));
  }, [currentUser, listId, list, currentRound, selectedRow, csvData.length, setLiveStatuses, sessionKey, rangeStartNum, rangeEndNum]);

  useEffect(() => { updateLiveStatus(); }, [currentRound, selectedRow]);

  // キーボードショートカット — refで最新状態を参照しeventリスナーは一度だけ登録
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isMinimizedRef.current) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const { sel, sorted, appoM, recallM, helpOpen, scriptOpen, memo, editRound, csvData, listId, currentUser } = kbRef.current;

      if (e.key === 'Escape') {
        if (appoM)       { e.preventDefault(); setAppoModal(null); return; }
        if (recallM)     { e.preventDefault(); setRecallModal(null); return; }
        if (helpOpen)    { e.preventDefault(); setShowShortcutHelp(false); return; }
        if (scriptOpen)  { e.preventDefault(); setShowScript(false); return; }
        return;
      }
      if (e.key === '?') { e.preventDefault(); setShowShortcutHelp(v => !v); return; }
      if (appoM || recallM || helpOpen) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (sel === null) return;
        const pos = sorted.findIndex(r => r === csvData[sel]);
        if (e.key === 'ArrowLeft' && pos > 0) {
          const idx = csvData.indexOf(sorted[pos - 1]);
          if (idx >= 0) { setSelectedRow(idx); setMemo(csvData[idx]?.memo || ''); }
        } else if (e.key === 'ArrowRight' && pos >= 0 && pos < sorted.length - 1) {
          const idx = csvData.indexOf(sorted[pos + 1]);
          if (idx >= 0) { setSelectedRow(idx); setMemo(csvData[idx]?.memo || ''); }
        }
        return;
      }

      if (sel === null) return;
      const sc = CS_SHORTCUTS.find(s => s.key === e.key);
      if (!sc) return;
      e.preventDefault();
      if (sc.id === 'appointment') {
        setAppoModal({ idx: sel, row: csvData[sel], round: editRound });
      } else if (sc.id === 'reception_recall' || sc.id === 'ceo_recall') {
        setRecallModal({ idx: sel, row: csvData[sel], statusId: sc.id, round: editRound });
      } else {
        setImportedCSVs(prev => {
          const updated = [...(prev[listId] || [])];
          const row = { ...updated[sel] };
          if (!row.rounds) row.rounds = {};
          row.rounds = { ...row.rounds, [editRound]: { status: sc.id, memo, timestamp: new Date().toISOString(), caller: currentUser || '' } };
          row.called = true; row.result = sc.label;
          updated[sel] = row;
          return { ...prev, [listId]: updated };
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    if (setLiveStatuses) {
      setLiveStatuses(prev => prev[sessionKey] ? { ...prev, [sessionKey]: { ...prev[sessionKey], active: false, finishedAt: new Date().toISOString() } } : prev);
    }
    onClose();
  };

  // PiP: summaryRef/closeRefを親に公開
  useEffect(() => {
    if (closeRef) closeRef.current = handleClose;
  });

  // Legacy status migration: map old IDs to new
  const LEGACY_MAP = { rejected: "excluded", discontinued: "excluded", reception_claim: "excluded", ceo_claim: "excluded" };

  const getStatusDef = (id) => STATUSES.find(s => s.id === (LEGACY_MAP[id] || id)) || STATUSES[0];

  // Check if row is permanently excluded
  const isExcluded = (row) => {
    if (!row.rounds) return false;
    return Object.values(row.rounds).some(r => EXCLUDED_IDS.includes(r.status));
  };

  // Get current round status for a row
  const getRoundStatus = (row, round) => {
    if (!row.rounds || !row.rounds[round]) return null;
    return row.rounds[round];
  };

  // Check if row is callable: show everything EXCEPT excluded/recall/appointment
  const isCallable = (row) => {
    if (!row.rounds) return true;
    const keys = Object.keys(row.rounds);
    if (keys.length === 0) return true;
    const latestRound = Math.max(...keys.map(Number));
    const latestStatus = row.rounds[latestRound]?.status;
    if (latestStatus && HIDDEN_FROM_CALLABLE.includes(latestStatus)) return false;
    return true;
  };

  const markStatus = (idx, statusId, extraData) => {
    console.log('[test] ステータスボタン押下');
    zoomPhone.hangUp();
    const calledAt = new Date().toISOString();
    const statusLabel = getStatusDef(statusId).label;

    // ① importedCSVs への書き込み（既存・維持）
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      const row = { ...updated[idx] };
      if (!row.rounds) row.rounds = {};
      row.rounds = { ...row.rounds, [currentRound]: { status: statusId, memo: memo, timestamp: calledAt, caller: currentUser || "", ...extraData } };
      row.called = true;
      row.result = statusLabel;
      updated[idx] = row;
      return { ...prev, [listId]: updated };
    });

    // ② Supabase への書き込み（新規追加）
    const row = csvData[idx];
    (async () => {
    const itemId = list?._supaId ? await getCallListItemId(list._supaId, row?.no) : null;
    if (itemId && list?._supaId) {
      // recall の場合は CallFlowView と同じ memo JSON 形式に変換
      let memoStr = memo || null;
      if (extraData?.recall) {
        const rc = extraData.recall;
        memoStr = JSON.stringify({ recall_date: rc.recallDate, recall_time: rc.recallTime, assignee: rc.assignee || '', note: rc.note || '', recall_completed: false });
      }
      insertCallRecord({
        item_id: itemId, list_id: list._supaId,
        round: currentRound, status: statusLabel,
        memo: memoStr, called_at: calledAt,
        getter_name: currentUser || null,
      }).then(({ result: newRec, error }) => {
        if (error) { console.error('[CallingScreen] markStatus insertCallRecord error:', error); return; }
        if (!newRec) return;
        // バックグラウンドで録音URL取得・保存（失敗してもステータス保存には影響しない）
        ;(async () => {
          try {
            const member = members.find(m => (typeof m === 'string' ? m : m.name) === currentUser);
            const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
            const phone = row?.phone;
            if (!zoomUserId || !phone) return;
            // 同itemの直前レコードを取得して prev_called_at を設定
            const { data: prevRecs } = await supabase
              .from('call_records')
              .select('called_at')
              .eq('item_id', itemId)
              .neq('id', newRec.id)
              .order('called_at', { ascending: false })
              .limit(1);
            const prevCalledAt = prevRecs?.[0]?.called_at || null;
            const normalizedPhone = phone.replace(/[^\d]/g, '');
            const { data } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: normalizedPhone, called_at: calledAt, prev_called_at: prevCalledAt });
            const url = data?.recording_url;
            if (url) {
              await updateCallRecordRecordingUrl(newRec.id, url);
            } else {
              // 90秒後に再試行（Zoom録音処理遅延対策）
              setTimeout(async () => {
                try {
                  const { data: data2 } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: normalizedPhone, called_at: calledAt, prev_called_at: prevCalledAt });
                  if (data2?.recording_url) await updateCallRecordRecordingUrl(newRec.id, data2.recording_url);
                } catch (e) { console.warn('[CallingScreen] 録音URL再試行エラー:', e); }
              }, 90_000);
            }
          } catch (e) {
            console.error('[CallingScreen] 録音URL取得エラー:', e);
          }
        })();
      }).catch(e => console.error('[CallingScreen] markStatus insertCallRecord catch:', e));
      updateCallListItem(itemId, { call_status: statusLabel, called_at: calledAt })
        .then(err => {
          if (err) console.error('[CallingScreen] markStatus updateCallListItem error:', err);
        }).catch(e => console.error('[CallingScreen] markStatus updateCallListItem catch:', e));
    } else {
      console.warn('[CallingScreen] markStatus — Supabase書き込みスキップ（itemId or _supaId が未設定）');
    }
    })();

    // Auto-advance to next callable
    const next = csvData.findIndex((r, i) => i > idx && isCallable(r));
    if (next >= 0) { setSelectedRow(next); setMemo(""); }
    setTimeout(() => updateLiveStatus(), 100);
  };

  const saveMemo = (idx, memoText) => {
    // ① importedCSVs への書き込み（既存・維持）
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      updated[idx] = { ...updated[idx], memo: memoText };
      return { ...prev, [listId]: updated };
    });

    // ② Supabase への書き込み（新規追加）
    const row = csvData[idx];
    (async () => {
      const itemId = list?._supaId ? await getCallListItemId(list._supaId, row?.no) : null;
      if (itemId) {
        updateCallListItem(itemId, { memo: memoText || null })
          .then(err => {
            if (err) console.error('[CallingScreen] saveMemo updateCallListItem error:', err);
          }).catch(e => console.error('[CallingScreen] saveMemo updateCallListItem catch:', e));
      } else {
        console.warn('[CallingScreen] saveMemo — Supabase書き込みスキップ（itemId 未設定）');
      }
    })();
  };

  const undoStatus = (idx, round) => {
    const row = csvData[idx];

    // ① importedCSVs への書き込み（既存・維持）
    setImportedCSVs(prev => {
      const updated = [...(prev[listId] || [])];
      const r = { ...updated[idx] };
      if (r.rounds) {
        const newRounds = { ...r.rounds };
        delete newRounds[round];
        r.rounds = newRounds;
        const remaining = Object.values(newRounds);
        r.called = remaining.length > 0;
        r.result = remaining.length > 0 ? getStatusDef(remaining[remaining.length - 1].status).label : "";
      }
      updated[idx] = r;
      return { ...prev, [listId]: updated };
    });

    // ② Supabase への書き込み（新規追加）
    (async () => {
      const itemId = list?._supaId ? await getCallListItemId(list._supaId, row?.no) : null;
      if (!itemId) return;
      deleteCallRecordByItemRound(itemId, round)
        .catch(e => console.error('[CallingScreen] undoStatus deleteCallRecordByItemRound error:', e));
      // 前のラウンドのステータスを call_list_items.call_status に反映
      const remainingRounds = row?.rounds
        ? Object.entries(row.rounds)
            .filter(([r]) => Number(r) !== round)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
        : [];
      const prevStatusLabel = remainingRounds.length > 0
        ? getStatusDef(remainingRounds[0][1].status).label
        : null;
      updateCallListItem(itemId, { call_status: prevStatusLabel })
        .catch(e => console.error('[CallingScreen] undoStatus updateCallListItem error:', e));
    })();
  };

  // Filtered list
  // Helper: get last call datetime for a row
  const getLastCallDate = (row) => {
    if (!row.rounds) return "";
    return Object.values(row.rounds)
      .filter(rd => rd && rd.timestamp)
      .reduce((latest, rd) => rd.timestamp > latest ? rd.timestamp : latest, "");
  };

  const prefOptions = [...new Set(csvData.map(r => r.pref).filter(Boolean))].sort();

  const filtered = csvData.filter(r => {
    // Range filter
    if (rangeConfirmed && rangeStartNum && rangeEndNum) {
      const rowNo = r.no || 0;
      if (rowNo < rangeStartNum || rowNo > rangeEndNum) return false;
    }
    if (searchTerm && !(
      r.company.includes(searchTerm) ||
      r.representative.includes(searchTerm) ||
      r.phone.includes(searchTerm) ||
      String(r.no).includes(searchTerm)
    )) return false;
    if (prefFilters.length > 0 && !prefFilters.includes(r.pref)) return false;
    if (filterMode === "callable") return isCallable(r);
    if (filterMode === "excluded") return isExcluded(r);
    return true;
  });

  const sorted = listSortBy ? [...filtered].sort((a, b) => {
    let va, vb;
    if (listSortBy === "no") { va = a.no || 0; vb = b.no || 0; }
    else if (listSortBy === "company") { va = a.company || ""; vb = b.company || ""; }
    else if (listSortBy === "business") { va = a.business || ""; vb = b.business || ""; }
    else if (listSortBy === "representative") { va = a.representative || ""; vb = b.representative || ""; }
    else if (listSortBy === "address") { va = a.address || ""; vb = b.address || ""; }
    else if (listSortBy === "phone") { va = a.phone || ""; vb = b.phone || ""; }
    else if (listSortBy === "lastCall") { va = getLastCallDate(a); vb = getLastCallDate(b); }
    else { va = 0; vb = 0; }
    if (typeof va === "number") return listSortDir === "asc" ? va - vb : vb - va;
    return listSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  }) : filtered;

  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // Stats
  const totalCount = csvData.length;
  const excludedCount = csvData.filter(r => isExcluded(r)).length;
  const roundDoneCount = csvData.filter(r => getRoundStatus(r, currentRound) && !isExcluded(r)).length;
  const callableCount = csvData.filter(r => isCallable(r)).length;
  const appoCount = csvData.filter(r => {
    if (!r.rounds) return false;
    return Object.values(r.rounds).some(rd => rd.status === "appointment");
  }).length;

  // PiP: summaryRefを更新
  useEffect(() => {
    if (summaryRef) {
      summaryRef.current = {
        company: list.company,
        industry: list.industry,
        manager: list.manager,
        round: currentRound,
        progress: Math.round((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100),
        total: totalCount,
      };
    }
  });

  // Max round used across all rows
  const maxRound = csvData.reduce((max, r) => {
    if (!r.rounds) return max;
    return Math.max(max, ...Object.keys(r.rounds).map(Number));
  }, 0);
  // Number of round columns to display in the table (at least currentRound)
  const displayRounds = Math.max(maxRound, currentRound, 10);

  const activeRow = selectedRow !== null ? csvData[selectedRow] : null;
  const activeRoundData = activeRow ? getRoundStatus(activeRow, currentRound) : null;
  const activeExcluded = activeRow ? isExcluded(activeRow) : false;
  const activeExcludedRound = activeRow && activeRow.rounds ? Object.entries(activeRow.rounds).find(([_, v]) => EXCLUDED_IDS.includes(v.status)) : null;

  // ref を毎レンダーで最新化（keydownハンドラーが参照する）
  kbRef.current = { sel: selectedRow, sorted, appoM: appoModal, recallM: recallModal, helpOpen: showShortcutHelp, scriptOpen: showScript, memo, editRound, csvData, listId, currentUser };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: C.offWhite, zIndex: 10000,
      display: "flex", flexDirection: "column",
      fontFamily: "'Noto Sans JP', sans-serif",
    }}>
      {/* Range Input Modal */}
      {csvData.length > 0 && !rangeConfirmed && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(26,58,92,0.6)", zIndex: 10001,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: C.white, borderRadius: 4, width: 400, overflow: "hidden",
            border: "1px solid #E5E7EB",
          }}>
            <div style={{
              background: '#0D2247',
              padding: "16px 20px", color: C.white,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>架電範囲の指定</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                {list?.company || ""} ─ {list?.industry || ""} （全{csvData.length}件）
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: C.textMid, marginBottom: 12 }}>
                架電する番号の範囲を入力してください
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4, display: "block" }}>開始番号</label>
                  <input type="number" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    placeholder="1" min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid " + C.border,
                      fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: "center",
                      color: C.navy, outline: "none",
                    }}
                  />
                </div>
                <span style={{ fontSize: 16, color: C.textLight, marginTop: 14 }}>〜</span>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4, display: "block" }}>終了番号</label>
                  <input type="number" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    placeholder={String(csvData.length)} min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid " + C.border,
                      fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: "center",
                      color: C.navy, outline: "none",
                    }}
                  />
                </div>
              </div>
              {rangeError && (!rangeStart || !rangeEnd) && (
                <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>番号を入力してください</div>
              )}
              <button
                disabled={!rangeStart || !rangeEnd}
                onClick={() => {
                  if (!rangeStart || !rangeEnd) { setRangeError(true); return; }
                  setRangeConfirmed(true);
                  updateLiveStatus();
                }}
                style={{
                  width: "100%", padding: "6px 12px", borderRadius: 4, border: "none",
                  background: rangeStart && rangeEnd ? "#0D2247" : C.border,
                  cursor: rangeStart && rangeEnd ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 500,
                  color: C.white, fontFamily: "'Noto Sans JP'",
                }}
              >この範囲で開始</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: '#0D2247',
        padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{list.company}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{list.industry}　担当: {list.manager}{rangeConfirmed && rangeStartNum && rangeEndNum ? "　No." + rangeStartNum + " 〜 " + rangeEndNum : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "総数", val: totalCount, color: C.white },
              { label: "架電可能", val: callableCount, color: 'rgba(255,255,255,0.85)' },
              { label: currentRound + "周目済", val: roundDoneCount, color: "#90EE90" },
              { label: "除外", val: excludedCount, color: "#ff9999" },
              { label: "アポ", val: appoCount, color: C.green },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Progress */}
          <div style={{ width: 100 }}>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: ((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100) + "%", background: "#1E40AF", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', textAlign: "right", marginTop: 1 }}>{Math.round((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100)}%</div>
          </div>
          {onMinimize && (
            <button onClick={onMinimize} style={{
              padding: "5px 14px", borderRadius: 6, background: C.white + "15",
              border: "1px solid " + C.white + "30", color: C.white, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
            }}>⊟ 最小化</button>
          )}
          <button onClick={handleClose} style={{
            padding: "5px 14px", borderRadius: 6, background: C.white + "15",
            border: "1px solid " + C.white + "30", color: C.white, cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'",
          }}>✕ 終了</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #E5E7EB" }}>
          {/* Search + filter */}
          <div style={{ padding: "6px 12px", background: '#fff', borderBottom: "1px solid #E5E7EB", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "5px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }} />
            {["callable", "all", "excluded"].map(m => (
              <button key={m} onClick={() => { setFilterMode(m); setPageStart(0); }} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                border: "1px solid " + (filterMode === m ? '#0D2247' : C.border),
                background: filterMode === m ? '#0D2247' : C.white,
                color: filterMode === m ? '#FFFFFF' : C.textLight, cursor: "pointer",
              }}>{m === "callable" ? "架電可能" : m === "all" ? "全件" : "除外"}</button>
            ))}
            {prefOptions.length > 1 && (
              <div style={{ position: "relative" }}>
                {prefDropOpen && (
                  <div onClick={() => setPrefDropOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
                )}
                <button onClick={() => setPrefDropOpen(v => !v)} style={{
                  padding: "4px 8px", borderRadius: 4,
                  border: "1px solid " + (prefFilters.length > 0 ? C.navy : C.border),
                  background: prefFilters.length > 0 ? C.navy + "10" : C.white,
                  fontSize: 9, fontFamily: "'Noto Sans JP'", cursor: "pointer",
                  color: prefFilters.length > 0 ? C.navy : C.textDark, whiteSpace: "nowrap",
                }}>
                  {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : "都道府県▼"}
                </button>
                {prefDropOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 10101,
                    background: C.white, border: "1px solid " + C.border,
                    borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    minWidth: 120, maxHeight: 220, overflowY: "auto", padding: "4px 0",
                  }}>
                    {prefFilters.length > 0 && (
                      <div onClick={() => { setPrefFilters([]); setPageStart(0); }} style={{
                        padding: "4px 10px", fontSize: 9, color: C.navy, cursor: "pointer",
                        borderBottom: "1px solid " + C.borderLight, fontWeight: 600,
                      }}>クリア</div>
                    )}
                    {prefOptions.map(p => (
                      <label key={p} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", cursor: "pointer", fontSize: 9,
                        fontFamily: "'Noto Sans JP'", color: C.textDark,
                      }}>
                        <input type="checkbox" checked={prefFilters.includes(p)}
                          onChange={() => {
                            setPrefFilters(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
                            setPageStart(0);
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span style={{ fontSize: 9, color: C.textLight, whiteSpace: "nowrap", fontFamily: "'JetBrains Mono'" }}>
              {filtered.length}件
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: `32px 1.4fr 0.6fr 0.7fr 0.6fr 85px 68px repeat(${displayRounds}, 46px)`,
            padding: "5px 10px", background: '#0D2247', flexShrink: 0,
            fontSize: 9, fontWeight: 600, color: '#fff', letterSpacing: 0.5,
          }}>
            {[["no","No"],["company","企業名"],["business","事業内容"],["address","住所"],["representative","代表者"],["phone","電話番号"],["lastCall","最終発信"]].map(([key, label]) => (
              <span key={key} onClick={() => { if (listSortBy === key) { setListSortBy(null); setListSortDir("asc"); } else { setListSortBy(key); setListSortDir("desc"); } setPageStart(0); }} style={{ cursor: "pointer", userSelect: "none" }}>
                {label}{listSortBy === key ? " ▲" : " ▽"}
              </span>
            ))}
            {Array.from({length: displayRounds}, (_, i) => i + 1).map(w => <span key={w} style={{ textAlign: "center", color: w === currentRound ? '#C8A84B' : 'rgba(255,255,255,0.55)' }}>{w}周</span>)}
          </div>

          {/* Table body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {paged.map((row) => {
              const globalIdx = csvData.findIndex(r => r.no === row.no);
              const isSelected = selectedRow === globalIdx;
              const excluded = isExcluded(row);
              const roundData = getRoundStatus(row, currentRound);
              const statusDef = roundData ? getStatusDef(roundData.status) : null;

              return (
                <div key={row.no} onClick={() => { setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); setShowScript(false); }}
                  style={{
                    display: "grid", gridTemplateColumns: `32px 1.4fr 0.6fr 0.7fr 0.6fr 85px 68px repeat(${displayRounds}, 46px)`,
                    padding: "6px 10px", fontSize: 11, alignItems: "center", cursor: "pointer",
                    borderBottom: "1px solid #E5E7EB",
                    background: isSelected ? '#EFF6FF' : excluded ? "#fee2e240" : roundData ? '#F8F9FA' : '#fff',
                    borderLeft: isSelected ? "3px solid #0D2247" : "3px solid transparent",
                    opacity: excluded ? 0.5 : 1,
                    transition: "all 0.1s",
                  }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>{row.address || row.pref || '—'}</span>
                  <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone && !excluded ? (
                      <span onClick={e => { e.stopPropagation(); dialPhone(row.phone); setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }} style={{
                        color: C.navy, fontWeight: 600, fontSize: 10,
                        fontFamily: "'JetBrains Mono'",
                        padding: "2px 5px", borderRadius: 4, cursor: "pointer",
                        background: '#0D224715',
                        border: "1px solid #0D224730",
                      }}>{row.phone}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{row.phone || "-"}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(() => { const lcd = getLastCallDate(row); return lcd ? lcd.replace(/T/, " ").slice(5, 16) : "-"; })()}
                  </span>
                  {Array.from({length: displayRounds}, (_, i) => i + 1).map(w => {
                    const wd = getRoundStatus(row, w);
                    const wsd = wd ? getStatusDef(wd.status) : null;
                    return (
                      <span key={w} style={{ textAlign: "center" }} title={wd?.caller ? "担当: " + wd.caller : ""}>
                        {excluded && EXCLUDED_IDS.includes(wd?.status) ? (
                          <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: "#e5383510", color: "#e53835", fontWeight: 600 }}>除外</span>
                        ) : wsd ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                            <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: 3, background: wsd.bg, color: wsd.color, fontWeight: 600 }}>{wsd.label}</span>
                            {wd.caller && <span style={{ fontSize: 6, color: C.textLight, lineHeight: 1, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 48 }}>{wd.caller}</span>}
                          </div>
                        ) : (
                          <span style={{ fontSize: 8, color: C.textLight + "60" }}>-</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "5px 0", background: '#fff', borderTop: "1px solid #E5E7EB", flexShrink: 0 }}>
              <button disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))} style={{
                padding: "3px 14px", borderRadius: 4,
                border: "1px solid " + (pageStart === 0 ? "#E5E7EB" : "#0D2247"),
                background: pageStart === 0 ? "#F8F9FA" : "white",
                cursor: pageStart === 0 ? "default" : "pointer",
                fontSize: 11, color: pageStart === 0 ? "#9CA3AF" : "#0D2247",
              }}>← 前</button>
              <button disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)} style={{
                padding: "3px 14px", borderRadius: 4,
                border: "1px solid " + (pageStart + PAGE_SIZE >= filtered.length ? "#E5E7EB" : "#0D2247"),
                background: pageStart + PAGE_SIZE >= filtered.length ? "#F8F9FA" : "white",
                cursor: pageStart + PAGE_SIZE >= filtered.length ? "default" : "pointer",
                fontSize: 11, color: pageStart + PAGE_SIZE >= filtered.length ? "#9CA3AF" : "#0D2247",
              }}>次 →</button>
            </div>
          )}
        </div>

      </div>

      {/* Appointment Report Modal */}
      {appoModal && <AppoReportModal
        row={appoModal.row}
        list={list}
        currentUser={currentUser}
        members={members}
        clientData={clientData}
        rewardMaster={rewardMaster}
        onClose={() => setAppoModal(null)}
        onSave={(formData) => {
          markStatus(appoModal.idx, "appointment", { appoReport: formData.note });
        }}
        onDone={() => setAppoModal(null)}
      />}

      {/* Recall Modal */}
      {recallModal && <RecallModal
        row={recallModal.row}
        statusId={recallModal.statusId}
        onSubmit={(recallData) => {
          markStatus(recallModal.idx, recallModal.statusId, { recall: recallData });
          setRecallModal(null);
        }}
        onCancel={() => setRecallModal(null)}
      />}

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
    </div>
  );
}