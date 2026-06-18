import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Card, Badge } from '../ui';
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
    statuses.filter(s => s.excluded || ['reception_recall', 'keyman_recall'].includes(s.id)).map(s => s.id),
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

  // キーマン断り の AI 分析結果（温度感+要約）を listId 単位で fetch して Map 化
  // 表セルの title 属性で tooltip 表示するために使う
  const [rejectionMap, setRejectionMap] = useState({}); // key: `${item_id}::${round}` → rejection_reason
  useEffect(() => {
    const supaId = list?._supaId;
    if (!supaId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('call_records')
        .select('item_id, round, rejection_reason')
        .eq('list_id', supaId)
        .eq('status', 'キーマン断り')
        .not('rejection_reason', 'is', null);
      if (cancelled || error) return;
      const map = {};
      for (const r of (data || [])) {
        map[`${r.item_id}::${r.round}`] = r.rejection_reason;
      }
      setRejectionMap(map);
    })();
    return () => { cancelled = true; };
  }, [list?._supaId]);

  // rejection_reason の冒頭プレフィックスを「温度感: 高/中/低」に変換した tooltip 文字列を返す
  const tempLabel = (code) => ({ HIGH: '温度感: 高', MEDIUM: '温度感: 中', LOW: '温度感: 低', SKIP: '分析不可' }[code] || null);
  const getRejectionTooltip = (itemId, round) => {
    const raw = rejectionMap[`${itemId}::${round}`];
    if (!raw) return null;
    const m = raw.match(/^(HIGH|MEDIUM|LOW|SKIP)\s*\n?([\s\S]*)$/);
    if (!m) return raw;
    const label = tempLabel(m[1]);
    const summary = m[2].trim();
    return label ? `【${label}】\n${summary}` : summary;
  };

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
      } else if (sc.id === 'reception_recall' || sc.id === 'keyman_recall') {
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
    // 発信者(本人)のzoom_user_idを渡し、サーバー側で進行中通話を特定して確実に切電。
    // ※切電が失敗してもステータス保存・次企業遷移は絶対に止めない（try/catchで隔離）。
    try {
      const _callerMember = members.find(m => (typeof m === 'string' ? m : m.name) === currentUser);
      const _callerZoomUserId = typeof _callerMember === 'object' ? _callerMember?.zoomUserId : null;
      zoomPhone.hangUp({ zoomUserId: _callerZoomUserId, phone: csvData[idx]?.phone });
    } catch (e) {
      console.warn('[markStatus] 自動切電でエラー（ステータス処理は継続）:', e);
    }
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
      background: color.offWhite, zIndex: 10000,
      display: "flex", flexDirection: "column",
      fontFamily: font.family.sans,
    }}>
      {/* Range Input Modal */}
      {csvData.length > 0 && !rangeConfirmed && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: alpha(color.navyDeep, 0.6), zIndex: 10001,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: color.white, borderRadius: radius.lg, width: 400, overflow: "hidden",
            border: `1px solid ${color.border}`, boxShadow: shadow.xl,
          }}>
            <div style={{
              background: color.navy,
              padding: "16px 20px", color: color.white,
            }}>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>架電範囲の指定</div>
              <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.7), marginTop: 2 }}>
                {list?.company || ""} ─ {list?.industry || ""} （全{csvData.length}件）
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: 12 }}>
                架電する番号の範囲を入力してください
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.textLight, letterSpacing: font.letterSpacing.wide, marginBottom: 4, display: "block" }}>開始番号</label>
                  <input type="number" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    placeholder="1" min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: radius.md, border: `1px solid ${color.border}`,
                      fontSize: 16, fontWeight: font.weight.bold, fontFamily: font.family.mono, textAlign: "center",
                      color: color.navy, outline: "none",
                    }}
                  />
                </div>
                <span style={{ fontSize: 16, color: color.textLight, marginTop: 14 }}>〜</span>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: font.weight.semibold, color: color.textLight, letterSpacing: font.letterSpacing.wide, marginBottom: 4, display: "block" }}>終了番号</label>
                  <input type="number" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    placeholder={String(csvData.length)} min={1} max={csvData.length}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: radius.md, border: `1px solid ${color.border}`,
                      fontSize: 16, fontWeight: font.weight.bold, fontFamily: font.family.mono, textAlign: "center",
                      color: color.navy, outline: "none",
                    }}
                  />
                </div>
              </div>
              {rangeError && (!rangeStart || !rangeEnd) && (
                <div style={{ fontSize: font.size.xs, color: color.danger, marginBottom: 10 }}>番号を入力してください</div>
              )}
              <Button
                fullWidth
                disabled={!rangeStart || !rangeEnd}
                onClick={() => {
                  if (!rangeStart || !rangeEnd) { setRangeError(true); return; }
                  setRangeConfirmed(true);
                  updateLiveStatus();
                }}
              >この範囲で開始</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: color.navy,
        padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.white }}>{list.company}</div>
            <div style={{ fontSize: 10, color: alpha(color.white, 0.7) }}>{list.industry}　担当: {list.manager}{rangeConfirmed && rangeStartNum && rangeEndNum ? "　No." + rangeStartNum + " 〜 " + rangeEndNum : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "総数", val: totalCount, color: color.white },
              { label: "架電可能", val: callableCount, color: alpha(color.white, 0.85) },
              { label: currentRound + "周目済", val: roundDoneCount, color: "#90EE90" },
              { label: "除外", val: excludedCount, color: "#ff9999" },
              { label: "アポ", val: appoCount, color: color.success },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: alpha(color.white, 0.55), letterSpacing: 0.3 }}>{s.label}</div>
                <div style={{ fontSize: font.size.md, fontWeight: font.weight.black, color: s.color, fontFamily: font.family.mono }}>{s.val}</div>
              </div>
            ))}
          </div>
          {/* Progress */}
          <div style={{ width: 100 }}>
            <div style={{ height: 5, background: alpha(color.white, 0.2), borderRadius: radius.sm, overflow: "hidden" }}>
              <div style={{ height: "100%", width: ((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100) + "%", background: color.blue, borderRadius: radius.sm, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 8, color: alpha(color.white, 0.75), textAlign: "right", marginTop: 1 }}>{Math.round((roundDoneCount + excludedCount) / Math.max(totalCount, 1) * 100)}%</div>
          </div>
          {onMinimize && (
            <button onClick={onMinimize} style={{
              padding: "5px 14px", borderRadius: radius.lg, background: alpha(color.white, 0.10),
              border: `1px solid ${alpha(color.white, 0.30)}`, color: color.white, cursor: "pointer",
              fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
            }}>⊟ 最小化</button>
          )}
          <button onClick={handleClose} style={{
            padding: "5px 14px", borderRadius: radius.lg, background: alpha(color.white, 0.10),
            border: `1px solid ${alpha(color.white, 0.30)}`, color: color.white, cursor: "pointer",
            fontSize: font.size.xs, fontWeight: font.weight.semibold, fontFamily: font.family.sans,
          }}>✕ 終了</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${color.border}` }}>
          {/* Search + filter */}
          <div style={{ padding: "6px 12px", background: color.white, borderBottom: `1px solid ${color.border}`, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" placeholder="番号・企業名・代表者で検索..." value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPageStart(0); }}
              style={{ flex: 1, padding: "5px 10px", borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.xs, fontFamily: font.family.sans, outline: "none" }} />
            {["callable", "all", "excluded"].map(m => (
              <button key={m} onClick={() => { setFilterMode(m); setPageStart(0); }} style={{
                padding: "4px 8px", borderRadius: radius.md, fontSize: 9, fontWeight: font.weight.semibold,
                border: `1px solid ${filterMode === m ? color.navy : color.border}`,
                background: filterMode === m ? color.navy : color.white,
                color: filterMode === m ? color.white : color.textLight, cursor: "pointer",
              }}>{m === "callable" ? "架電可能" : m === "all" ? "全件" : "除外"}</button>
            ))}
            {prefOptions.length > 1 && (
              <div style={{ position: "relative" }}>
                {prefDropOpen && (
                  <div onClick={() => setPrefDropOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} />
                )}
                <button onClick={() => setPrefDropOpen(v => !v)} style={{
                  padding: "4px 8px", borderRadius: radius.md,
                  border: `1px solid ${prefFilters.length > 0 ? color.navy : color.border}`,
                  background: prefFilters.length > 0 ? alpha(color.navy, 0.06) : color.white,
                  fontSize: 9, fontFamily: font.family.sans, cursor: "pointer",
                  color: prefFilters.length > 0 ? color.navy : color.textDark, whiteSpace: "nowrap",
                }}>
                  {prefFilters.length > 0 ? `都道府県(${prefFilters.length})▼` : "都道府県▼"}
                </button>
                {prefDropOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 10101,
                    background: color.white, border: `1px solid ${color.border}`,
                    borderRadius: radius.lg, boxShadow: shadow.md,
                    minWidth: 120, maxHeight: 220, overflowY: "auto", padding: "4px 0",
                  }}>
                    {prefFilters.length > 0 && (
                      <div onClick={() => { setPrefFilters([]); setPageStart(0); }} style={{
                        padding: "4px 10px", fontSize: 9, color: color.navy, cursor: "pointer",
                        borderBottom: `1px solid ${color.borderLight}`, fontWeight: font.weight.semibold,
                      }}>クリア</div>
                    )}
                    {prefOptions.map(p => (
                      <label key={p} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", cursor: "pointer", fontSize: 9,
                        fontFamily: font.family.sans, color: color.textDark,
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
            <span style={{ fontSize: 9, color: color.textLight, whiteSpace: "nowrap", fontFamily: font.family.mono }}>
              {filtered.length}件
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: `32px 1.4fr 0.6fr 0.7fr 0.6fr 85px 68px repeat(${displayRounds}, 46px)`,
            padding: "5px 10px", background: color.navy, flexShrink: 0,
            fontSize: 9, fontWeight: font.weight.semibold, color: color.white, letterSpacing: font.letterSpacing.wide,
          }}>
            {[["no","No"],["company","企業名"],["business","事業内容"],["address","住所"],["representative","代表者"],["phone","電話番号"],["lastCall","最終発信"]].map(([key, label]) => (
              <span key={key} onClick={() => { if (listSortBy === key) { setListSortBy(null); setListSortDir("asc"); } else { setListSortBy(key); setListSortDir("desc"); } setPageStart(0); }} style={{ cursor: "pointer", userSelect: "none" }}>
                {label}{listSortBy === key ? " ▲" : " ▽"}
              </span>
            ))}
            {Array.from({length: displayRounds}, (_, i) => i + 1).map(w => <span key={w} style={{ textAlign: "center", color: w === currentRound ? color.gold : alpha(color.white, 0.55) }}>{w}周</span>)}
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
                    padding: "6px 10px", fontSize: font.size.xs, alignItems: "center", cursor: "pointer",
                    borderBottom: `1px solid ${color.border}`,
                    background: isSelected ? alpha(color.navyLight, 0.08) : excluded ? alpha(color.danger, 0.06) : roundData ? color.cream : color.white,
                    borderLeft: isSelected ? `3px solid ${color.navy}` : "3px solid transparent",
                    opacity: excluded ? 0.5 : 1,
                    transition: "all 0.1s",
                  }}>
                  <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.textLight }}>{row.no}</span>
                  <span style={{ fontWeight: font.weight.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.company}</span>
                  <span style={{ color: color.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{row.business}</span>
                  <span style={{ color: color.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 }}>{row.address || row.pref || '—'}</span>
                  <span style={{ color: color.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.representative}</span>
                  <span>
                    {row.phone && !excluded ? (
                      <span onClick={e => { e.stopPropagation(); dialPhone(row.phone); setSelectedRow(globalIdx); setMemo(csvData[globalIdx]?.memo || ""); }} style={{
                        color: color.navy, fontWeight: font.weight.semibold, fontSize: 10,
                        fontFamily: font.family.mono,
                        padding: "2px 5px", borderRadius: radius.md, cursor: "pointer",
                        background: alpha(color.navy, 0.08),
                        border: `1px solid ${alpha(color.navy, 0.18)}`,
                      }}>{row.phone}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: color.textLight, fontFamily: font.family.mono }}>{row.phone || "-"}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 9, color: color.textLight, fontFamily: font.family.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(() => { const lcd = getLastCallDate(row); return lcd ? lcd.replace(/T/, " ").slice(5, 16) : "-"; })()}
                  </span>
                  {Array.from({length: displayRounds}, (_, i) => i + 1).map(w => {
                    const wd = getRoundStatus(row, w);
                    const wsd = wd ? getStatusDef(wd.status) : null;
                    // 「キーマン断り」の周は AI 要約を tooltip で見せる
                    const rejTooltip = wd?.status === 'キーマン断り' && (row.id || row.itemId || row.item_id)
                      ? getRejectionTooltip(row.id || row.itemId || row.item_id, w)
                      : null;
                    const cellTitle = [
                      wd?.caller ? `担当: ${wd.caller}` : null,
                      rejTooltip,
                    ].filter(Boolean).join('\n\n');
                    return (
                      <span key={w} style={{ textAlign: "center" }} title={cellTitle || undefined}>
                        {excluded && EXCLUDED_IDS.includes(wd?.status) ? (
                          <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: radius.sm, background: alpha(color.danger, 0.08), color: color.danger, fontWeight: font.weight.semibold }}>除外</span>
                        ) : wsd ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                            <span style={{ fontSize: 7, padding: "1px 3px", borderRadius: radius.sm, background: wsd.bg, color: wsd.color, fontWeight: font.weight.semibold, cursor: rejTooltip ? 'help' : 'default' }}>{wsd.label}</span>
                            {wd.caller && <span style={{ fontSize: 6, color: color.textLight, lineHeight: 1, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 48 }}>{wd.caller}</span>}
                          </div>
                        ) : (
                          <span style={{ fontSize: 8, color: alpha(color.textLight, 0.4) }}>-</span>
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
            <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "5px 0", background: color.white, borderTop: `1px solid ${color.border}`, flexShrink: 0 }}>
              <Button size="sm" variant="outline" disabled={pageStart === 0} onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))}>← 前</Button>
              <Button size="sm" variant="outline" disabled={pageStart + PAGE_SIZE >= filtered.length} onClick={() => setPageStart(pageStart + PAGE_SIZE)}>次 →</Button>
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
            background: color.white, borderRadius: radius.lg, padding: 28, width: 380,
            border: `1px solid ${color.border}`, fontFamily: font.family.sans, boxShadow: shadow.xl,
          }}>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 16 }}>キーボードショートカット</div>
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
                  <tr key={key} style={{ borderBottom: `1px solid ${color.borderLight}` }}>
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
            <Button fullWidth style={{ marginTop: 16 }} onClick={() => setShowShortcutHelp(false)}>閉じる</Button>
          </div>
        </div>
      )}
    </div>
  );
}