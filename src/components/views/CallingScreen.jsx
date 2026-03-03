import { useState, useEffect, useCallback } from 'react';
import { C } from '../../constants/colors';
import { dialPhone } from '../../utils/phone';
import { fetchCallListItems, insertCallRecord, updateCallListItem, deleteCallRecordByItemRound } from '../../lib/supabaseWrite';

export default function CallingScreen({ listId, list, importedCSVs, setImportedCSVs, onClose, currentUser, liveStatuses, setLiveStatuses, members = [] }) {
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
  const [showScript, setShowScript] = useState(false);
  const PAGE_SIZE = 30;
  const [sessionKey] = useState(() => "self_" + (currentUser || "unknown") + "_" + Date.now());
  const csvData = importedCSVs[listId] || [];

  // Supabase item ID lookup: { [no]: call_list_items.id }
  const [itemIdMap, setItemIdMap] = useState({});
  useEffect(() => {
    console.log('[CallingScreen] itemIdMap構築 — list._supaId:', list?._supaId);
    if (!list?._supaId) { console.warn('[CallingScreen] _supaId 未設定のため itemIdMap は空のまま'); return; }
    fetchCallListItems(list._supaId).then(({ data, error }) => {
      if (error) { console.error('[CallingScreen] fetchCallListItems error:', error); return; }
      console.log('[CallingScreen] fetchCallListItems 結果 件数:', data?.length, '/ 先頭:', data?.[0]);
      if (!data?.length) return;
      const map = {};
      data.forEach(item => { map[item.no] = item.id; });
      console.log('[CallingScreen] itemIdMap構築完了 エントリ数:', Object.keys(map).length);
      setItemIdMap(map);
    });
  }, [list?._supaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Range input
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeConfirmed, setRangeConfirmed] = useState(false);

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

  const handleClose = () => {
    if (setLiveStatuses) {
      setLiveStatuses(prev => prev[sessionKey] ? { ...prev, [sessionKey]: { ...prev[sessionKey], active: false, finishedAt: new Date().toISOString() } } : prev);
    }
    onClose();
  };

  // Status definitions
  const STATUSES = [
    { id: "normal", label: "不通", desc: "電話がつながらなかった", color: C.navy, bg: C.navy + "08", excluded: false },
    { id: "excluded", label: "除外", desc: "廃止番号・着信拒否・クレーム等", color: "#e53835", bg: "#e5383510", excluded: true },
    { id: "absent", label: "社長不在", desc: "社長が外出中", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "reception_block", label: "受付ブロック", desc: "受付に断られた", color: C.navy, bg: C.navy + "08", excluded: false },
    { id: "reception_recall", label: "受付再コール", desc: "時間を置いて再度", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "ceo_recall", label: "社長再コール", desc: "社長から再度依頼", color: C.gold, bg: C.gold + "10", excluded: false },
    { id: "appointment", label: "アポ獲得", desc: "アポイント獲得！", color: C.gold, bg: C.gold + "10", excluded: true },
    { id: "ceo_decline", label: "社長お断り", desc: "社長本人に断られた", color: C.navy, bg: C.navy + "08", excluded: false },
  ];

  // Legacy status migration: map old IDs to new
  const LEGACY_MAP = { rejected: "excluded", discontinued: "excluded", reception_claim: "excluded", ceo_claim: "excluded" };

  const EXCLUDED_IDS = STATUSES.filter(s => s.excluded).map(s => s.id);
  // IDs hidden from callable view
  const HIDDEN_FROM_CALLABLE = ["excluded", "reception_recall", "ceo_recall", "appointment"];

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
    const latestRound = Math.max(...Object.keys(row.rounds).map(Number));
    const latestStatus = row.rounds[latestRound]?.status;
    if (latestStatus && HIDDEN_FROM_CALLABLE.includes(latestStatus)) return false;
    return true;
  };

  const markStatus = (idx, statusId, extraData) => {
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
    const itemId = itemIdMap[row?.no];
    console.log('[CallingScreen] markStatus — idx:', idx, '/ row.no:', row?.no, '/ itemId:', itemId, '/ list._supaId:', list?._supaId, '/ itemIdMap keys:', Object.keys(itemIdMap).length);
    if (itemId && list?._supaId) {
      // recall の場合は CallFlowView と同じ memo JSON 形式に変換
      let memoStr = memo || null;
      if (extraData?.recall) {
        const rc = extraData.recall;
        memoStr = JSON.stringify({ recall_date: rc.recallDate, recall_time: rc.recallTime, assignee: rc.assignee || '', note: rc.note || '', recall_completed: false });
      }
      console.log('[CallingScreen] markStatus — Supabase書き込み開始 insertCallRecord:', { item_id: itemId, list_id: list._supaId, round: currentRound, status: statusLabel });
      insertCallRecord({
        item_id: itemId, list_id: list._supaId,
        round: currentRound, status: statusLabel,
        memo: memoStr, called_at: calledAt,
        getter_name: currentUser || null,
      }).then(({ result, error }) => {
        if (error) console.error('[CallingScreen] markStatus insertCallRecord error:', error);
        else console.log('[CallingScreen] markStatus insertCallRecord 成功:', result);
      }).catch(e => console.error('[CallingScreen] markStatus insertCallRecord catch:', e));
      updateCallListItem(itemId, { call_status: statusLabel, called_at: calledAt })
        .then(err => {
          if (err) console.error('[CallingScreen] markStatus updateCallListItem error:', err);
          else console.log('[CallingScreen] markStatus updateCallListItem 成功');
        }).catch(e => console.error('[CallingScreen] markStatus updateCallListItem catch:', e));
    } else {
      console.warn('[CallingScreen] markStatus — Supabase書き込みスキップ（itemId or _supaId が未設定）');
    }

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
    const itemId = itemIdMap[row?.no];
    console.log('[CallingScreen] saveMemo — idx:', idx, '/ row.no:', row?.no, '/ itemId:', itemId);
    if (itemId) {
      updateCallListItem(itemId, { memo: memoText || null })
        .then(err => {
          if (err) console.error('[CallingScreen] saveMemo updateCallListItem error:', err);
          else console.log('[CallingScreen] saveMemo updateCallListItem 成功');
        }).catch(e => console.error('[CallingScreen] saveMemo updateCallListItem catch:', e));
    } else {
      console.warn('[CallingScreen] saveMemo — Supabase書き込みスキップ（itemId 未設定）');
    }
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
    const itemId = itemIdMap[row?.no];
    if (itemId) {
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
    }
  };

  // Filtered list
  // Helper: get last call datetime for a row
  const getLastCallDate = (row) => {
    let latest = "";
    for (let w = 5; w >= 1; w--) {
      const rd = getRoundStatus(row, w);
      if (rd && rd.timestamp) {
        if (rd.timestamp > latest) latest = rd.timestamp;
      }
    }
    return latest;
  };

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

  // Max round used
  const maxRound = csvData.reduce((max, r) => {
    if (!r.rounds) return max;
    return Math.max(max, ...Object.keys(r.rounds).map(Number));
  }, 0);

  const activeRow = selectedRow !== null ? csvData[selectedRow] : null;
  const activeRoundData = activeRow ? getRoundStatus(activeRow, currentRound) : null;
  const activeExcluded = activeRow ? isExcluded(activeRow) : false;
  const activeExcludedRound = activeRow && activeRow.rounds ? Object.entries(activeRow.rounds).find(([_, v]) => EXCLUDED_IDS.includes(v.status)) : null;

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
            background: C.white, borderRadius: 12, width: 400, overflow: "hidden",
            boxShadow: "0 20px 40px rgba(26,58,92,0.3)",
          }}>
            <div style={{
              background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
              padding: "16px 20px", color: C.white,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>架電範囲の指定</div>
              <div style={{ fontSize: 11, color: C.goldLight, marginTop: 2 }}>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setRangeStart("1"); setRangeEnd(String(csvData.length)); setRangeConfirmed(true); updateLiveStatus(); }} style={{
                  flex: 1, padding: "10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                  background: C.offWhite, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  color: C.textMid, fontFamily: "'Noto Sans JP'",
                }}>全件かける</button>
                <button onClick={() => { if (!rangeStart) setRangeStart("1"); if (!rangeEnd) setRangeEnd(String(csvData.length)); setRangeConfirmed(true); updateLiveStatus(); }} style={{
                  flex: 1, padding: "10px", borderRadius: 6, border: "none",
                  background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
                  cursor: "pointer", fontSize: 12, fontWeight: 700,
                  color: C.white, fontFamily: "'Noto Sans JP'",
                }}>この範囲で開始</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")",
        padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>📞</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{list.company}</div>
            <div style={{ fontSize: 10, color: C.goldLight }}>{list.industry}　担当: {list.manager}{rangeConfirmed && rangeStartNum && rangeEndNum ? "　📋 No." + rangeStartNum + " 〜 " + rangeEndNum : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "総数", val: totalCount, color: C.white },
              { label: "架電可能", val: callableCount, color: C.goldLight },
              { label: currentRound + "周目済", val: roundDoneCount, color: "#90EE90" },
              { label: "除外", val: excludedCount, color: "#ff9999" },
              { label: "アポ", val: appoCount, color: C.green },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: C.goldLight + "90", letterSpacing: 0.3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Progress */}
          <div style={{ width: 100 }}>
            <div style={{ height: 5, background: C.white + "20", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: ((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100) + "%", background: "linear-gradient(90deg, " + C.gold + ", " + C.green + ")", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 8, color: C.goldLight, textAlign: "right", marginTop: 1 }}>{Math.round((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100)}%</div>
          </div>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid " + C.borderLight }}>
          {/* Search + filter */}
          <div style={{ padding: "6px 12px", background: C.white, borderBottom: "1px solid " + C.borderLight, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "5px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }} />
            {["callable", "all", "excluded"].map(m => (
              <button key={m} onClick={() => { setFilterMode(m); setPageStart(0); }} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                border: "1px solid " + (filterMode === m ? C.navy : C.border),
                background: filterMode === m ? C.navy + "10" : C.white,
                color: filterMode === m ? C.navy : C.textLight, cursor: "pointer",
              }}>{m === "callable" ? "架電可能" : m === "all" ? "全件" : "除外"}</button>
            ))}
            <span style={{ fontSize: 9, color: C.textLight, whiteSpace: "nowrap" }}>
              {filtered.length}件
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "32px 1.4fr 0.6fr 0.6fr 85px 68px repeat(5, 46px)",
            padding: "5px 10px", background: C.navyDeep, flexShrink: 0,
            fontSize: 9, fontWeight: 600, color: C.goldLight, letterSpacing: 0.5,
          }}>
            {[["no","No"],["company","企業名"],["business","事業内容"],["representative","代表者"],["phone","電話番号"],["lastCall","最終発信"]].map(([key, label]) => (
              <span key={key} onClick={() => { if (listSortBy === key) { setListSortBy(null); setListSortDir("asc"); } else { setListSortBy(key); setListSortDir("desc"); } setPageStart(0); }} style={{ cursor: "pointer", userSelect: "none" }}>
                {label}{listSortBy === key ? " ▲" : " ▽"}
              </span>
            ))}
            {[1,2,3,4,5].map(w => <span key={w} style={{ textAlign: "center", color: w === currentRound ? C.gold : C.goldLight + "80" }}>{w}周</span>)}
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
                <div key={row.no} onClick={() => { setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }}
                  style={{
                    display: "grid", gridTemplateColumns: "32px 1.4fr 0.6fr 0.6fr 85px 68px repeat(5, 46px)",
                    padding: "6px 10px", fontSize: 11, alignItems: "center", cursor: "pointer",
                    borderBottom: "1px solid " + C.borderLight,
                    background: isSelected ? C.gold + "12" : excluded ? "#fee2e2" + "40" : roundData ? C.offWhite : C.white,
                    borderLeft: isSelected ? "3px solid " + C.gold : "3px solid transparent",
                    opacity: excluded ? 0.5 : 1,
                    transition: "all 0.1s",
                  }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone && !excluded ? (
                      <span onClick={e => { e.stopPropagation(); dialPhone(row.phone); setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }} style={{
                        color: C.navy, fontWeight: 600, fontSize: 10,
                        fontFamily: "'JetBrains Mono'",
                        padding: "2px 5px", borderRadius: 4, cursor: "pointer",
                        background: C.gold + "15",
                        border: "1px solid " + C.gold + "30",
                      }}>{row.phone}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{row.phone || "-"}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(() => { const lcd = getLastCallDate(row); return lcd ? lcd.replace(/T/, " ").slice(5, 16) : "-"; })()}
                  </span>
                  {[1,2,3,4,5].map(w => {
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
            <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "5px 0", background: C.white, borderTop: "1px solid " + C.borderLight, flexShrink: 0 }}>
              <button disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))} style={{
                padding: "3px 14px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart === 0 ? C.offWhite : C.white, cursor: pageStart === 0 ? "default" : "pointer",
                fontSize: 11, color: C.textMid,
              }}>← 前</button>
              <button disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)} style={{
                padding: "3px 14px", borderRadius: 4, border: "1px solid " + C.border,
                background: pageStart + PAGE_SIZE >= filtered.length ? C.offWhite : C.white,
                cursor: pageStart + PAGE_SIZE >= filtered.length ? "default" : "pointer",
                fontSize: 11, color: C.textMid,
              }}>次 →</button>
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        <div style={{ width: 400, display: "flex", flexDirection: "column", background: C.white, overflow: "hidden" }}>
          {activeRow ? (
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {/* Selected company info */}
              <div style={{ marginBottom: 12, padding: "10px 12px", background: C.offWhite, borderRadius: 8, border: "1px solid " + C.borderLight }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{activeRow.company}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 11 }}>
                  <div><span style={{ color: C.textLight }}>代表者: </span><span style={{ fontWeight: 500 }}>{activeRow.representative}</span></div>
                  <div><span style={{ color: C.textLight }}>業種: </span><span>{activeRow.business}</span></div>
                  <div style={{ gridColumn: "span 2" }}><span style={{ color: C.textLight }}>住所: </span><span style={{ fontSize: 10 }}>{activeRow.address}</span></div>
                </div>
                {activeRow.phone && !activeExcluded && (
                  <div style={{ marginTop: 8 }}>
                    <span onClick={() => dialPhone(activeRow.phone)} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 20px", borderRadius: 6, cursor: "pointer",
                      background: "linear-gradient(135deg, " + C.green + ", #2d8a4e)",
                      color: C.white,
                      fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono'",
                      boxShadow: "0 2px 8px " + C.green + "40",
                    }}>📞 {activeRow.phone}</span>
                  </div>
                )}
              </div>

              {/* Excluded notice */}
              {activeExcluded && activeExcludedRound && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: C.navy + "08", border: "1px solid " + C.navy + "20" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 2 }}>⛔ 架電除外</div>
                      <div style={{ fontSize: 10, color: C.textMid }}>
                        {activeExcludedRound[0]}周目で「{getStatusDef(activeExcludedRound[1].status).label}」のため除外
                        {activeExcludedRound[1].memo && <span>（メモ: {activeExcludedRound[1].memo}）</span>}
                      </div>
                    </div>
                    <button onClick={() => undoStatus(selectedRow, Number(activeExcludedRound[0]))} style={{
                      padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.navy + "30",
                      background: C.white, cursor: "pointer", fontSize: 9, fontWeight: 600,
                      color: C.navy, fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
                    }}>取り消す</button>
                  </div>
                </div>
              )}

              {/* Status buttons for current round */}
              {!activeExcluded && (() => {
                const editRoundData = getRoundStatus(activeRow, editRound);
                const editStatusDef = editRoundData ? getStatusDef(editRoundData.status) : null;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                      {[1,2,3,4,5].map(w => {
                        const wd = getRoundStatus(activeRow, w);
                        const wsd = wd ? getStatusDef(wd.status) : null;
                        return (
                          <button key={w} onClick={() => setEditRound(w)} style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 9, fontWeight: 700,
                            cursor: "pointer", fontFamily: "'Noto Sans JP'", transition: "all 0.15s",
                            border: editRound === w ? "1px solid " + C.gold : "1px solid " + C.borderLight,
                            background: editRound === w ? C.gold + "15" : wsd ? wsd.bg : C.white,
                            color: editRound === w ? C.navy : wsd ? wsd.color : C.textLight,
                          }}>
                            {w}周{wsd ? " ✓" : ""}
                          </button>
                        );
                      })}
                    </div>
                    {editRoundData ? (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: editStatusDef.bg, border: "1px solid " + editStatusDef.color + "20" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: editStatusDef.color }}>{editRound}周目: {editStatusDef.label}</div>
                            {editRoundData.caller && <div style={{ fontSize: 9, color: C.textLight, marginTop: 1 }}>架電者: {editRoundData.caller}</div>}
                            {editRoundData.memo && <div style={{ fontSize: 10, color: C.textMid, marginTop: 2 }}>メモ: {editRoundData.memo}</div>}
                          </div>
                          <button onClick={() => undoStatus(selectedRow, editRound)} style={{
                            padding: "4px 10px", borderRadius: 4, border: "1px solid " + C.navy + "30",
                            background: C.white, cursor: "pointer", fontSize: 9, fontWeight: 600,
                            color: C.navy, fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
                          }}>取り消す</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 6 }}>{editRound}周目 架電結果を記録</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                          {STATUSES.map(s => (
                            <button key={s.id} onClick={() => {
                              if (memo) saveMemo(selectedRow, memo);
                              const prevRound = currentRound;
                              // Temporarily set currentRound for markStatus to use correct round
                              if (s.id === "appointment") {
                                setAppoModal({ idx: selectedRow, row: csvData[selectedRow], round: editRound });
                              } else if (s.id === "reception_recall" || s.id === "ceo_recall") {
                                setRecallModal({ idx: selectedRow, row: csvData[selectedRow], statusId: s.id, round: editRound });
                              } else {
                                // Mark status for specific round
                                setImportedCSVs(prev => {
                                  const updated = [...(prev[listId] || [])];
                                  const row = { ...updated[selectedRow] };
                                  if (!row.rounds) row.rounds = {};
                                  row.rounds = { ...row.rounds, [editRound]: { status: s.id, memo: memo, timestamp: new Date().toISOString(), caller: currentUser || "" } };
                                  row.called = true;
                                  row.result = getStatusDef(s.id).label;
                                  updated[selectedRow] = row;
                                  return { ...prev, [listId]: updated };
                                });
                              }
                            }} style={{
                              padding: "7px 6px", borderRadius: 6,
                              background: s.bg, border: "1px solid " + s.color + "30",
                              cursor: "pointer", textAlign: "left",
                              fontFamily: "'Noto Sans JP'",
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.label}</div>
                              <div style={{ fontSize: 8, color: s.color + "90" }}>{s.desc}</div>
                              {s.excluded && <div style={{ fontSize: 7, color: "#e53e3e", marginTop: 1 }}>※ 以降架電除外</div>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Round history */}
              {activeRow.rounds && Object.keys(activeRow.rounds).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4 }}>架電履歴</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {Object.entries(activeRow.rounds).sort(([a],[b]) => Number(a) - Number(b)).map(([round, data]) => {
                      const sd = getStatusDef(data.status);
                      return (
                        <div key={round} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 8px", borderRadius: 4,
                          background: Number(round) === currentRound ? sd.bg : C.offWhite,
                          border: "1px solid " + (Number(round) === currentRound ? sd.color + "20" : "transparent"),
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, fontFamily: "'JetBrains Mono'", minWidth: 36 }}>{round}周目</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: sd.bg, color: sd.color, fontWeight: 600 }}>{sd.label}</span>
                          {data.memo && <span style={{ fontSize: 9, color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{data.memo}</span>}
                          <button onClick={() => undoStatus(selectedRow, Number(round))} style={{
                            padding: "1px 6px", borderRadius: 3, border: "1px solid " + C.border,
                            background: C.white, cursor: "pointer", fontSize: 8, color: C.textLight,
                            fontFamily: "'Noto Sans JP'", marginLeft: "auto", flexShrink: 0,
                          }}>取消</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Memo */}
              {!activeExcluded && !activeRoundData && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 4 }}>メモ</div>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)}
                    onBlur={() => saveMemo(selectedRow, memo)}
                    placeholder="架電時のメモをここに記入..."
                    style={{
                      width: "100%", minHeight: 60, padding: "6px 10px", borderRadius: 6,
                      border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'",
                      outline: "none", resize: "vertical", background: C.offWhite,
                    }} />
                </div>
              )}

              {/* Script & Notes from list */}
              {(list.scriptBody || list.companyInfo || list.cautions) && (
                <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 10 }}>
                  {list.companyInfo && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>🏢 企業概要</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.offWhite, borderRadius: 6, whiteSpace: "pre-wrap" }}>{list.companyInfo}</div>
                    </div>
                  )}
                  {list.scriptBody && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>📝 スクリプト</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.gold + "08", borderRadius: 6, border: "1px solid " + C.gold + "20", whiteSpace: "pre-wrap" }}>{list.scriptBody}</div>
                    </div>
                  )}
                  {list.cautions && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.red, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>⚠ 注意事項</div>
                      <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, padding: "6px 10px", background: C.red + "06", borderRadius: 6, border: "1px solid " + C.red + "15", whiteSpace: "pre-wrap" }}>{list.cautions}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 32 }}>👈</span>
              <span style={{ fontSize: 12, color: C.textLight }}>左のリストから企業を選択してください</span>
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
    </div>
  );
}