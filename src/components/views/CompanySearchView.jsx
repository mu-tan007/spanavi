import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { dialPhone } from '../../utils/phone';
import { extractUserNote, buildMemoWithNote } from '../../utils/memo';
import {
  updateCallList,
  fetchCallListItems,
  updateCallListItem,
  searchCallListItemsServerSide,
  fetchCallListItemsByIds,
  fetchCalledItemCountsByListIds,
  fetchCallRecordsByItemId,
  fetchCallRecordsByItemIds,
  fetchItemsByCallStatus,
  fetchListIdsByItemCriteria,
  fetchCallRecords,
  insertCallRecord,
  deleteCallRecord,
  invokeGetZoomRecording,
  updateCallRecordRecordingUrl,
  fetchCallRecordsWithRecordings,
  fetchRecordingBookmarks,
  insertRecordingBookmark,
  deleteRecordingBookmark,
} from '../../lib/supabaseWrite';
import AppoReportModal from './AppoReportModal';
import ReportPopupModal from './ReportPopupModal';
import InlineAudioPlayer from '../common/InlineAudioPlayer';
import useColumnConfig from '../../hooks/useColumnConfig';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import PageHeader from '../common/PageHeader';

const SEARCH_COMPANY_COLS = [
  { key: 'company', width: 350, align: 'left' },
  { key: 'rep', width: 140, align: 'left' },
  { key: 'phone', width: 140, align: 'left' },
  { key: 'client', width: 250, align: 'left' },
  { key: 'industry', width: 80, align: 'left' },
  { key: 'lastCallDate', width: 120, align: 'right' },
  { key: 'lastStatus', width: 180, align: 'center' },
];

const SEARCH_LIST_ITEMS_COLS = [
  { key: 'company', width: 280, align: 'left' },
  { key: 'rep', width: 140, align: 'left' },
  { key: 'phone', width: 160, align: 'left' },
  { key: 'status', width: 140, align: 'left' },
  { key: 'listName', width: 210, align: 'left' },
];

const SEARCH_LISTS_COLS = [
  { key: 'listName', width: 280, align: 'left' },
  { key: 'client', width: 170, align: 'left' },
  { key: 'industry', width: 140, align: 'left' },
  { key: 'companyCount', width: 80, align: 'right' },
  { key: 'calledCount', width: 80, align: 'right' },
  { key: 'actions', width: 150, align: 'center' },
];

export default function CompanySearchView({ importedCSVs, callListData, setCallingScreen, setImportedCSVs, clientData = [], currentUser, members = [], setCallFlowScreen, rewardMaster = [] }) {
  const [subTab, setSubTab] = useState("company");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientSortBy, setClientSortBy] = useState(null);
  const [clientSortDir, setClientSortDir] = useState("asc");

  // Column resize/alignment hooks
  const { columns: scCols, gridTemplateColumns: scGrid, contentMinWidth: scMinW, onResizeStart: scResize, onHeaderContextMenu: scCtxMenu, contextMenu: scCtx, setAlign: scSetAlign, resetAll: scReset, closeMenu: scClose } = useColumnConfig('searchCompany', SEARCH_COMPANY_COLS);
  const { columns: sliCols, gridTemplateColumns: sliGrid, contentMinWidth: sliMinW, onResizeStart: sliResize, onHeaderContextMenu: sliCtxMenu, contextMenu: sliCtx, setAlign: sliSetAlign, resetAll: sliReset, closeMenu: sliClose } = useColumnConfig('searchListItems', SEARCH_LIST_ITEMS_COLS);
  const { columns: slCols, gridTemplateColumns: slGrid, contentMinWidth: slMinW, onResizeStart: slResize, onHeaderContextMenu: slCtxMenu, contextMenu: slCtx, setAlign: slSetAlign, resetAll: slReset, closeMenu: slClose } = useColumnConfig('searchLists', SEARCH_LISTS_COLS);
  const { statuses, ceoConnectLabels, getStatusColor, labelMap } = useCallStatuses();

  // List search state（リスト検索）
  const [lsClientInput, setLsClientInput] = useState("");
  const [lsClientFocused, setLsClientFocused] = useState(false);
  const [lsIndustry, setLsIndustry] = useState("");
  const [lsIndustryFocused, setLsIndustryFocused] = useState(false);
  const [lsPref, setLsPref] = useState("");
  const [lsRevenueMin, setLsRevenueMin] = useState("");
  const [lsRevenueMax, setLsRevenueMax] = useState("");
  const [lsNetIncomeMin, setLsNetIncomeMin] = useState("");
  const [lsNetIncomeMax, setLsNetIncomeMax] = useState("");
  const [lsStatus, setLsStatus] = useState([]);
  const [lsCallCountMin, setLsCallCountMin] = useState("");
  const [lsCallCountMax, setLsCallCountMax] = useState("");
  const [lsResults, setLsResults] = useState(null); // null = 未検索（リストレベル）
  const [lsItemResults, setLsItemResults] = useState(null); // null = 未検索（企業レベル）
  const [lsCalledCounts, setLsCalledCounts] = useState({});
  const [lsSearching, setLsSearching] = useState(false);
  const [lsExporting, setLsExporting] = useState(null); // エクスポート中の _supaId
  const [lsPdfExporting, setLsPdfExporting] = useState(null); // PDFエクスポート中の _supaId

  // Supabase-based company search

  const [searchResults, setSearchResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const currentPageRef = useRef(0);
  const sentinelRef = useRef(null);

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemRecords, setItemRecords] = useState([]);
  const [loadingItemRecords, setLoadingItemRecords] = useState(false);
  useEffect(() => {
    if (!selectedItem) {
      setItemRecords([]); setSelectedItemFull(null); setActiveRecordingId(null);
      return;
    }
    setLoadingItemRecords(true);
    setSelectedItemFull(null);
    setActiveRecordingId(null);
    Promise.all([
      fetchCallRecordsByItemId(selectedItem.id),
      fetchCallListItemsByIds([selectedItem.id]),
    ]).then(([recordsRes, fullItemRes]) => {
      const recs = (recordsRes.data || []).sort((a, b) => a.round - b.round);
      setItemRecords(recs);
      const full = fullItemRes.data?.[0] || null;
      setSelectedItemFull(full);
      const nextRound = recs.length === 0 ? 1 : Math.max(...recs.map(r => r.round)) + 1;
      setSelectedRound(nextRound);
      setLocalMemo(extractUserNote(full?.memo));
      setSubPhone(full?.sub_phone_number || '');
      setLoadingItemRecords(false);
    });
  }, [selectedItem?.id]);

  const [pageRecords, setPageRecords] = useState({});
  const fetchedRecordIdsRef = useRef(new Set());

  // Detail panel state
  const [selectedRound, setSelectedRound] = useState(null);
  const [localMemo, setLocalMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [appoModal, setAppoModal] = useState(null);

  // ====== 録音一覧タブ用 state ======
  const [recGetter, setRecGetter] = useState('all');
  const [recStatus, setRecStatus] = useState('all');
  const [recDateFrom, setRecDateFrom] = useState('');
  const [recDateTo, setRecDateTo] = useState('');
  const [recSortDir, setRecSortDir] = useState('desc');
  const [recList, setRecList] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recPlayingId, setRecPlayingId] = useState(null);
  const [reportPopup, setReportPopup] = useState(null);
  const [bookmarkSet, setBookmarkSet] = useState({}); // call_record_id -> bookmark row

  const [subPhone, setSubPhone] = useState('');
  const [activeRecordingId, setActiveRecordingId] = useState(null);
  const [selectedItemFull, setSelectedItemFull] = useState(null);

  // Filter
  const PAGE_SIZE = 100;
  const sortedResults = clientSortBy ? [...searchResults].sort((a, b) => {
    let va, vb;
    if (clientSortBy === "company") { va = a.company || ""; vb = b.company || ""; }
    else if (clientSortBy === "representative") { va = a.representative || ""; vb = b.representative || ""; }
    else if (clientSortBy === "phone") { va = a.phone || ""; vb = b.phone || ""; }
    else if (clientSortBy === "list") {
      const la = callListData.find(l => l._supaId === a.list_id); const lb = callListData.find(l => l._supaId === b.list_id);
      va = la ? la.company : ""; vb = lb ? lb.company : "";
    }
    else if (clientSortBy === "industry") {
      const la = callListData.find(l => l._supaId === a.list_id); const lb = callListData.find(l => l._supaId === b.list_id);
      va = la?.industry || ""; vb = lb?.industry || "";
    }
    else if (clientSortBy === "lastCall") {
      const getLC = (c) => { const recs = pageRecords[c.id]; if (!recs) return ""; let latest = ""; Object.values(recs).forEach(r => { if (r.called_at && r.called_at > latest) latest = r.called_at; }); return latest; };
      va = getLC(a); vb = getLC(b);
    }
    else if (clientSortBy === "status") { va = a.call_status || ""; vb = b.call_status || ""; }
    else { va = 0; vb = 0; }
    if (typeof va === "number") return clientSortDir === "asc" ? va - vb : vb - va;
    return clientSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  }) : searchResults;

  // Lazy-load call records for newly added results only（ページ追加時に既フェッチIDを再取得しない）
  const resultIdsKey = useMemo(() => searchResults.map(i => i.id).join(','), [searchResults]);
  useEffect(() => {
    if (!searchResults.length) {
      setPageRecords({});
      fetchedRecordIdsRef.current = new Set();
      return;
    }
    const newIds = searchResults.map(i => i.id).filter(id => !fetchedRecordIdsRef.current.has(id));
    if (!newIds.length) return;
    newIds.forEach(id => fetchedRecordIdsRef.current.add(id));
    fetchCallRecordsByItemIds(newIds).then(({ data }) => {
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.item_id]) map[r.item_id] = {};
        map[r.item_id][r.round] = r;
      });
      setPageRecords(prev => ({ ...prev, ...map }));
    });
  }, [resultIdsKey]);

  // サーバーサイド検索（デバウンス300ms）
  useEffect(() => {
    currentPageRef.current = 0;
    setSearchResults([]);
    setTotalCount(0);
    setHasMore(false);

    if (!searchTerm.trim() && statusFilter === 'all') {
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const { data, count } = await searchCallListItemsServerSide({
        keyword: searchTerm, searchField, statusFilter, page: 0, pageSize: PAGE_SIZE,
      });
      setSearchResults(data);
      setTotalCount(count);
      setHasMore(data.length === PAGE_SIZE && count > PAGE_SIZE);
      setSearchLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, searchField, statusFilter]);

  // 追加読み込み（次ページ）
  const loadMore = useCallback(async () => {
    if (searchLoading || !hasMore) return;
    const nextPage = currentPageRef.current + 1;
    currentPageRef.current = nextPage;
    setSearchLoading(true);
    const { data, count } = await searchCallListItemsServerSide({
      keyword: searchTerm, searchField, statusFilter, page: nextPage, pageSize: PAGE_SIZE,
    });
    setSearchResults(prev => [...prev, ...data]);
    setTotalCount(count);
    setHasMore((currentPageRef.current + 1) * PAGE_SIZE < count);
    setSearchLoading(false);
  }, [searchLoading, hasMore, searchTerm, searchField, statusFilter]);

  // IntersectionObserver でスクロール最下部到達時に loadMore
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const statusOptions = [
    { id: "all", label: "すべて" }, { id: "uncalled", label: "未架電" },
    ...statuses.map(s => ({ id: s.id, label: s.label })),
  ];

  const fieldOptions = [
    { id: "all", label: "全項目" }, { id: "company", label: "企業名" },
    { id: "representative", label: "代表者名" }, { id: "phone", label: "電話番号" },
    { id: "status", label: "ステータス" },
  ];

  const statusColor = (sid) => getStatusColor(sid).color;

  // === List search computed values ===
  const clientCandidates = useMemo(() => {
    return (clientData || [])
      .filter(c => c.status === "支援中" || c.status === "停止中")
      .map(c => c.company)
      .sort();
  }, [clientData]);

  const filteredClientCandidates = useMemo(() => {
    if (!lsClientInput) return clientCandidates;
    return clientCandidates.filter(n => n.includes(lsClientInput));
  }, [clientCandidates, lsClientInput]);

  const industryOptions = useMemo(() => {
    const set = new Set();
    (callListData || []).forEach(l => { if (l.industry) set.add(l.industry); });
    return [...set].sort();
  }, [callListData]);

  const filteredIndustryCandidates = useMemo(() => {
    if (!lsIndustry) return industryOptions;
    return industryOptions.filter(v => v.includes(lsIndustry));
  }, [industryOptions, lsIndustry]);

  const handleListSearch = async () => {
    setLsSearching(true);
    try {
      if (lsStatus.length > 0) {
        // ステータスフィルター選択時: 企業レベルで絞り込み（個別架電先企業を表示）
        const { data: items } = await fetchItemsByCallStatus(lsStatus);
        let filteredItems = items || [];
        // クライアント名・業種フィルターが指定されている場合は追加絞り込み
        if (lsClientInput || lsIndustry) {
          const listMap = {};
          callListData.forEach(l => { if (l._supaId) listMap[l._supaId] = l; });
          filteredItems = filteredItems.filter(item => {
            const list = listMap[item.list_id];
            if (!list) return false;
            if (lsClientInput && !list.company.includes(lsClientInput)) return false;
            if (lsIndustry && !(list.industry || "").includes(lsIndustry)) return false;
            return true;
          });
        }
        setLsItemResults(filteredItems);
        setLsResults(null);
      } else {
        // ステータスフィルターなし: リストレベルで絞り込み（従来動作）
        setLsItemResults(null);
        let results = callListData;
        if (lsClientInput) results = results.filter(l => l.company.includes(lsClientInput));
        if (lsIndustry) results = results.filter(l => (l.industry || "").includes(lsIndustry));
        const hasItemFilter = lsPref || lsRevenueMin || lsRevenueMax || lsNetIncomeMin || lsNetIncomeMax || lsCallCountMin || lsCallCountMax;
        if (hasItemFilter) {
          const matchingListIds = await fetchListIdsByItemCriteria({
            prefecture: lsPref || null,
            revenueMin: lsRevenueMin !== "" ? Number(lsRevenueMin) : null,
            revenueMax: lsRevenueMax !== "" ? Number(lsRevenueMax) : null,
            netIncomeMin: lsNetIncomeMin !== "" ? Number(lsNetIncomeMin) : null,
            netIncomeMax: lsNetIncomeMax !== "" ? Number(lsNetIncomeMax) : null,
            callCountMin: lsCallCountMin !== "" ? Number(lsCallCountMin) : null,
            callCountMax: lsCallCountMax !== "" ? Number(lsCallCountMax) : null,
          });
          if (matchingListIds !== null) {
            const idSet = new Set(matchingListIds);
            results = results.filter(l => l._supaId && idSet.has(l._supaId));
          } else {
            results = []; // DBエラー時は空結果
          }
        }
        setLsResults(results);
        const supaIds = results.map(l => l._supaId).filter(Boolean);
        if (supaIds.length > 0) {
          const counts = await fetchCalledItemCountsByListIds(supaIds);
          setLsCalledCounts(counts);
        }
      }
    } catch (e) {
      console.error("[handleListSearch] error:", e);
      setLsItemResults([]);
      setLsResults(null);
    }
    setLsSearching(false);
  };

  // 社長通電ステータス（Excel/PDFレポート共通）
  const CEO_CONNECT_PDF = ceoConnectLabels;

  const handleExport = async (list) => {
    if (!list._supaId) { alert("このリストはSupabase未連携のためエクスポートできません"); return; }
    setLsExporting(list._supaId);
    try {
      const [itemsRes, recordsRes] = await Promise.all([
        fetchCallListItems(list._supaId),
        fetchCallRecords(list._supaId),
      ]);
      const items = itemsRes.data || [];
      const records = recordsRes.data || [];

      // item_id -> {round -> {status, date}} マップ
      const recordMap = {};
      records.forEach(r => {
        if (!recordMap[r.item_id]) recordMap[r.item_id] = {};
        const calledAt = r.called_at
          ? new Date(new Date(r.called_at).getTime() + 9 * 60 * 60 * 1000)
              .toISOString().slice(0, 10).replace(/-/g, '/')
          : '';
        recordMap[r.item_id][r.round] = { status: r.status, date: calledAt };
      });
      const maxRound = records.length > 0 ? Math.max(...records.map(r => r.round)) : 0;

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();

      // ======== Sheet 1: リストデータ ========
      const ws = wb.addWorksheet("リストデータ");
      const colWidths = [6, 30, 20, 40, 14, 14, 15, 16, 20];
      const header = ["No.", "企業名", "事業内容", "住所", "売上高（千円）", "当期純利益（千円）", "代表者", "電話番号", "備考"];
      for (let i = 1; i <= maxRound; i++) { header.push(`${i}回目日付`); colWidths.push(14); header.push(`${i}回目結果`); colWidths.push(16); }
      ws.columns = header.map((h, i) => ({ header: h, key: String(i), width: colWidths[i] || 16 }));

      const NAVY_ARGB = "FF1A3A5C";
      const GOLD_ARGB = "FFCBA040";
      const WHITE_ARGB = "FFFFFFFF";
      const RED_ARGB = "FFE53835";

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: GOLD_ARGB } } };
      });
      headerRow.height = 20;

      items.forEach(item => {
        const netIncome = item.net_income ?? "";
        const address = (item.address || "").replace(/\/$/, "");
        const memoText = (() => { try { const p = JSON.parse(item.memo || ""); return p.biko ?? ""; } catch { return item.memo || ""; } })();
        const rowData = [
          item.no, item.company || "", item.business || "", address,
          item.revenue ?? "", netIncome, item.representative || "", item.phone || "", memoText,
        ];
        const itemRecs = recordMap[item.id] || {};
        for (let i = 1; i <= maxRound; i++) { rowData.push(itemRecs[i]?.date || ""); rowData.push(itemRecs[i]?.status || ""); }
        const dataRow = ws.addRow(rowData);
        dataRow.getCell(1).alignment = { horizontal: "center" };
        // 売上高・当期純利益: 数値フォーマット + 右寄せ
        if (item.revenue != null && item.revenue !== "") {
          dataRow.getCell(5).numFmt = '#,##0';
          dataRow.getCell(5).alignment = { horizontal: "right" };
        }
        if (netIncome !== "") {
          dataRow.getCell(6).numFmt = '#,##0';
          dataRow.getCell(6).alignment = { horizontal: "right" };
        }
        // 電話番号: 中央寄せ
        dataRow.getCell(8).alignment = { horizontal: "center" };
      });

      // ======== Sheet 2: レポート ========
      const rs = wb.addWorksheet("レポート");
      rs.columns = [
        { key: "a", width: 16 }, { key: "b", width: 12 }, { key: "c", width: 12 },
        { key: "d", width: 12 }, { key: "e", width: 12 }, { key: "f", width: 12 },
      ];

      const weekMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const d = new Date(r.called_at);
        const dow = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow);
        const wk = mon.toISOString().slice(0, 10);
        if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 };
        weekMap[wk].calls++;
        if (CEO_CONNECT_PDF.has(r.status)) weekMap[wk].connected++;
        if (r.status === "アポ獲得") weekMap[wk].appo++;
      });
      const weeks = Object.keys(weekMap).sort();
      const totalCalls = records.length;
      const totalConnected = records.filter(r => CEO_CONNECT_PDF.has(r.status)).length;
      const totalAppo = records.filter(r => r.status === "アポ獲得").length;
      const connRateTotal = totalCalls > 0 ? (totalConnected / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const appoRateTotal = totalCalls > 0 ? (totalAppo / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const dates = records.map(r => r.called_at?.slice(0, 10)).filter(Boolean).sort();
      const firstDate = dates[0] || ""; const lastDate = dates[dates.length - 1] || "";

      // テーブルヘッダー行
      const rh = rs.addRow(["週", "架電件数", "社長通電数", "社長通電率", "アポ数", "アポ率"]);
      rh.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rh.height = 18;

      // 週ごとの行
      weeks.forEach(wk => {
        const { calls, connected, appo } = weekMap[wk];
        const cr = calls > 0 ? (connected / calls * 100).toFixed(1) + "%" : "0.0%";
        const ar = calls > 0 ? (appo / calls * 100).toFixed(1) + "%" : "0.0%";
        const dr = rs.addRow([`${wk}〜`, calls, connected, cr, appo, ar]);
        dr.getCell(4).alignment = { horizontal: "right" };
        dr.getCell(6).alignment = { horizontal: "right" };
        if (calls > 0 && connected / calls < 0.05) dr.getCell(4).font = { color: { argb: RED_ARGB } };
      });

      // 月間合計行（ゴールド背景）
      const totRow = rs.addRow(["月間合計", totalCalls, totalConnected, connRateTotal, totalAppo, appoRateTotal]);
      totRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: NAVY_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_ARGB } };
        cell.alignment = { horizontal: "center" };
      });

      // 空行
      rs.addRow([]);

      // レポートサマリーセクション
      const fmt = d => d ? d.replace(/-/g, "/") : "";
      const addSumRow = (text, bold = false) => {
        const row = rs.addRow([text]);
        row.getCell(1).font = { bold, color: { argb: NAVY_ARGB } };
        return row;
      };
      const sumHdr = rs.addRow(["【レポートサマリー】"]);
      sumHdr.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE_ARGB } };
      sumHdr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
      sumHdr.height = 22;
      rs.mergeCells(sumHdr.number, 1, sumHdr.number, 6);

      addSumRow(`対象期間: ${fmt(firstDate)} 〜 ${fmt(lastDate)}`);
      addSumRow(`総架電件数: ${totalCalls}件`);
      addSumRow(`社長通電数: ${totalConnected}件（社長通電率: ${connRateTotal}）`);
      addSumRow(`アポ取得数: ${totalAppo}件（アポ率: ${appoRateTotal}）`);
      addSumRow(`週平均架電件数: ${weeks.length > 0 ? Math.round(totalCalls / weeks.length) : 0}件`);

      // ダウンロード
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `${list.company || "クライアント"}_${list.industry || "リスト"}_${today}.xlsx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[Export] error:", e);
      if (e.message?.includes("dynamically imported module")) {
        alert("アプリが更新されました。ページを再読み込みします。");
        window.location.reload();
        return;
      }
      alert("エクスポートに失敗しました: " + e.message);
    }
    setLsExporting(null);
  };

  // ─── PDF サマリーレポート出力 ───────────────────────────────────
  const toJSTDate = (utcStr) => new Date(utcStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const toJSTHour = (utcStr) => parseInt(new Date(utcStr).toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }), 10);

  const handlePdfExport = async (list) => {
    if (!list._supaId) { alert("このリストはSupabase未連携のためPDF出力できません"); return; }
    setLsPdfExporting(list._supaId);
    try {
      const [itemsRes, recordsRes] = await Promise.all([
        fetchCallListItems(list._supaId),
        fetchCallRecords(list._supaId),
      ]);
      const items = itemsRes.data || [];
      const records = recordsRes.data || [];

      // 日次集計
      const dayMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const day = toJSTDate(r.called_at);
        if (!dayMap[day]) dayMap[day] = { calls: 0, connected: 0, appo: 0 };
        dayMap[day].calls++;
        if (CEO_CONNECT_PDF.has(r.status)) dayMap[day].connected++;
        if (r.status === 'アポ獲得') dayMap[day].appo++;
      });
      const dailyStats = Object.keys(dayMap).sort().map(day => {
        const { calls, connected, appo } = dayMap[day];
        return {
          date: day.replace(/-/g, '/'), calls, connected,
          connRate: calls > 0 ? parseFloat((connected / calls * 100).toFixed(1)) : 0,
          appo,
          appoRate: calls > 0 ? parseFloat((appo / calls * 100).toFixed(1)) : 0,
        };
      });

      // 週次集計
      const weekMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const d = new Date(toJSTDate(r.called_at) + 'T12:00:00Z');
        const dow = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow);
        const wk = mon.toISOString().slice(0, 10);
        if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 };
        weekMap[wk].calls++;
        if (CEO_CONNECT_PDF.has(r.status)) weekMap[wk].connected++;
        if (r.status === 'アポ獲得') weekMap[wk].appo++;
      });
      const weeklyStats = Object.keys(weekMap).sort().map(wk => {
        const { calls, connected, appo } = weekMap[wk];
        return {
          week: wk.replace(/-/g, '/') + '〜', calls, connected,
          connRate: calls > 0 ? parseFloat((connected / calls * 100).toFixed(1)) : 0,
          appo,
          appoRate: calls > 0 ? parseFloat((appo / calls * 100).toFixed(1)) : 0,
        };
      });

      // 時間帯集計（JST 9〜19時）
      const hourBuckets = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const h = toJSTHour(r.called_at);
        if (!hourBuckets[h]) hourBuckets[h] = { calls: 0, connected: 0 };
        hourBuckets[h].calls++;
        if (CEO_CONNECT_PDF.has(r.status)) hourBuckets[h].connected++;
      });
      const hourlyStats = Object.keys(hourBuckets)
        .sort((a, b) => +a - +b)
        .map(h => ({
          hour: +h,
          calls: hourBuckets[+h].calls,
          connected: hourBuckets[+h].connected,
          connRate: parseFloat((hourBuckets[+h].connected / hourBuckets[+h].calls * 100).toFixed(1)),
        }));
      const bestHour = hourlyStats.every(h => h.calls === 0)
        ? null
        : hourlyStats.reduce((b, c) => c.connRate > b.connRate ? c : b).hour;

      // アポ一覧
      const appoList = items
        .filter(item => item.call_status === 'アポ獲得')
        .map(item => {
          const rec = records
            .filter(r => r.item_id === item.id && r.status === 'アポ獲得')
            .sort((a, b) => new Date(b.called_at) - new Date(a.called_at))[0];
          return {
            company: item.company,
            date: rec ? toJSTDate(rec.called_at).replace(/-/g, '/') : '—',
            status: 'アポ獲得',
          };
        });

      // サマリー指標
      const totalCalls = records.length;
      const totalConnected = records.filter(r => CEO_CONNECT_PDF.has(r.status)).length;
      const totalAppo = records.filter(r => r.status === 'アポ獲得').length;
      const sortedDates = records.map(r => r.called_at).filter(Boolean).sort();
      const dateRange = sortedDates.length
        ? `${toJSTDate(sortedDates[0]).replace(/-/g, '/')} 〜 ${toJSTDate(sortedDates.at(-1)).replace(/-/g, '/')}`
        : '—';

      // コンポーネント描画 → html2canvas → jspdf
      const { default: ClientReportPDF } = await import('./ClientReportPDF');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = ReactDOM.createRoot(container);
      root.render(
        <ClientReportPDF
          clientName={list.company || 'クライアント'}
          listName={`${list.company || ''}${list.industry ? ' - ' + list.industry : ''}`}
          dateRange={dateRange}
          totalCalls={totalCalls}
          ceoConnectRate={totalCalls > 0 ? parseFloat((totalConnected / totalCalls * 100).toFixed(1)) : 0}
          appoRate={totalCalls > 0 ? parseFloat((totalAppo / totalCalls * 100).toFixed(1)) : 0}
          appoList={appoList}
          dailyStats={dailyStats}
          weeklyStats={weeklyStats}
          hourlyStats={hourlyStats}
          bestHour={bestHour}
        />
      );

      // recharts の描画完了を待機
      await new Promise(resolve => setTimeout(resolve, 1200));

      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`pdf-page-${i}`);
        const canvas = await html2canvas(el, {
          scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        });
        if (i > 1) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      }

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      pdf.save(`${list.company || 'report'}_サマリーレポート_${today}.pdf`);

      root.unmount();
      document.body.removeChild(container);
    } catch (e) {
      console.error('[PDF Export]', e);
      if (e.message?.includes("dynamically imported module")) {
        alert("アプリが更新されました。ページを再読み込みします。");
        window.location.reload();
        return;
      }
      alert('PDF出力に失敗しました: ' + e.message);
    }
    setLsPdfExporting(null);
  };

  const handleExportItems = async () => {
    if (!lsItemResults?.length) return;
    setLsExporting('__items__');
    try {
      const itemIds = lsItemResults.map(i => i.id).filter(Boolean);
      const [itemsRes, recordsRes] = await Promise.all([
        fetchCallListItemsByIds(itemIds),
        fetchCallRecordsByItemIds(itemIds),
      ]);
      const items = itemsRes.data || [];
      const records = recordsRes.data || [];

      const itemListMap = {};
      callListData.forEach(l => { if (l._supaId) itemListMap[l._supaId] = l; });

      const recordMap = {};
      records.forEach(r => {
        if (!recordMap[r.item_id]) recordMap[r.item_id] = {};
        const calledAt = r.called_at
          ? new Date(new Date(r.called_at).getTime() + 9 * 60 * 60 * 1000)
              .toISOString().slice(0, 10).replace(/-/g, '/')
          : '';
        recordMap[r.item_id][r.round] = { status: r.status, date: calledAt };
      });
      const maxRound = records.length > 0 ? Math.max(...records.map(r => r.round)) : 0;

      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();

      // ======== Sheet 1: リストデータ ========
      const ws = wb.addWorksheet("リストデータ");
      const colWidths = [6, 30, 20, 40, 14, 14, 15, 16, 20];
      const header = ["No.", "企業名", "事業内容", "住所", "売上高（千円）", "当期純利益（千円）", "代表者", "電話番号", "備考"];
      for (let i = 1; i <= maxRound; i++) { header.push(`${i}回目日付`); colWidths.push(14); header.push(`${i}回目結果`); colWidths.push(16); }
      ws.columns = header.map((h, i) => ({ header: h, key: String(i), width: colWidths[i] || 16 }));

      const NAVY_ARGB = "FF1A3A5C";
      const GOLD_ARGB = "FFCBA040";
      const WHITE_ARGB = "FFFFFFFF";
      const RED_ARGB = "FFE53835";

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: GOLD_ARGB } } };
      });
      headerRow.height = 20;

      items.forEach(item => {
        const netIncome = item.net_income ?? "";
        const address = (item.address || "").replace(/\/$/, "");
        const memoText = (() => { try { const p = JSON.parse(item.memo || ""); return p.biko ?? ""; } catch { return item.memo || ""; } })();
        const rowData = [
          item.no, item.company || "", item.business || "", address,
          item.revenue ?? "", netIncome, item.representative || "", item.phone || "", memoText,
        ];
        const itemRecs = recordMap[item.id] || {};
        for (let i = 1; i <= maxRound; i++) { rowData.push(itemRecs[i]?.date || ""); rowData.push(itemRecs[i]?.status || ""); }
        const dataRow = ws.addRow(rowData);
        dataRow.getCell(1).alignment = { horizontal: "center" };
        if (item.revenue != null && item.revenue !== "") {
          dataRow.getCell(5).numFmt = '#,##0';
          dataRow.getCell(5).alignment = { horizontal: "right" };
        }
        if (netIncome !== "") {
          dataRow.getCell(6).numFmt = '#,##0';
          dataRow.getCell(6).alignment = { horizontal: "right" };
        }
        dataRow.getCell(8).alignment = { horizontal: "center" };
      });

      // ======== Sheet 2: レポート ========
      const rs = wb.addWorksheet("レポート");
      rs.columns = [
        { key: "a", width: 16 }, { key: "b", width: 12 }, { key: "c", width: 12 },
        { key: "d", width: 12 }, { key: "e", width: 12 }, { key: "f", width: 12 },
      ];
      const weekMap = {};
      records.forEach(r => {
        if (!r.called_at) return;
        const d = new Date(r.called_at);
        const dow = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - dow);
        const wk = mon.toISOString().slice(0, 10);
        if (!weekMap[wk]) weekMap[wk] = { calls: 0, connected: 0, appo: 0 };
        weekMap[wk].calls++;
        if (CEO_CONNECT_PDF.has(r.status)) weekMap[wk].connected++;
        if (r.status === "アポ獲得") weekMap[wk].appo++;
      });
      const weeks = Object.keys(weekMap).sort();
      const totalCalls = records.length;
      const totalConnected = records.filter(r => CEO_CONNECT_PDF.has(r.status)).length;
      const totalAppo = records.filter(r => r.status === "アポ獲得").length;
      const connRateTotal = totalCalls > 0 ? (totalConnected / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const appoRateTotal = totalCalls > 0 ? (totalAppo / totalCalls * 100).toFixed(1) + "%" : "0.0%";
      const dates = records.map(r => r.called_at?.slice(0, 10)).filter(Boolean).sort();
      const firstDate = dates[0] || ""; const lastDate = dates[dates.length - 1] || "";

      const rh = rs.addRow(["週", "架電件数", "社長通電数", "社長通電率", "アポ数", "アポ率"]);
      rh.eachCell(cell => {
        cell.font = { bold: true, color: { argb: WHITE_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rh.height = 18;
      weeks.forEach(wk => {
        const { calls, connected, appo } = weekMap[wk];
        const cr = calls > 0 ? (connected / calls * 100).toFixed(1) + "%" : "0.0%";
        const ar = calls > 0 ? (appo / calls * 100).toFixed(1) + "%" : "0.0%";
        const dr = rs.addRow([`${wk}〜`, calls, connected, cr, appo, ar]);
        dr.getCell(4).alignment = { horizontal: "right" };
        dr.getCell(6).alignment = { horizontal: "right" };
        if (calls > 0 && connected / calls < 0.05) dr.getCell(4).font = { color: { argb: RED_ARGB } };
      });
      const totRow = rs.addRow(["合計", totalCalls, totalConnected, connRateTotal, totalAppo, appoRateTotal]);
      totRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: NAVY_ARGB } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_ARGB } };
        cell.alignment = { horizontal: "center" };
      });
      rs.addRow([]);
      const fmt = d => d ? d.replace(/-/g, "/") : "";
      const addSumRow = (text) => {
        const row = rs.addRow([text]);
        row.getCell(1).font = { color: { argb: NAVY_ARGB } };
        return row;
      };
      const sumHdr = rs.addRow(["【レポートサマリー】"]);
      sumHdr.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE_ARGB } };
      sumHdr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_ARGB } };
      sumHdr.height = 22;
      rs.mergeCells(sumHdr.number, 1, sumHdr.number, 6);
      addSumRow(`対象期間: ${fmt(firstDate)} 〜 ${fmt(lastDate)}`);
      addSumRow(`総架電件数: ${totalCalls}件`);
      addSumRow(`社長通電数: ${totalConnected}件（社長通電率: ${connRateTotal}）`);
      addSumRow(`アポ取得数: ${totalAppo}件（アポ率: ${appoRateTotal}）`);
      addSumRow(`週平均架電件数: ${weeks.length > 0 ? Math.round(totalCalls / weeks.length) : 0}件`);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const statusLabel = lsStatus.length > 0 ? lsStatus.join("_") : "検索結果";
      a.download = `企業リスト_${statusLabel}_${today}.xlsx`;
      a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[ExportItems] error:", e);
      if (e.message?.includes("dynamically imported module")) {
        alert("アプリが更新されました。ページを再読み込みします。");
        window.location.reload();
        return;
      }
      alert("エクスポートに失敗しました: " + e.message);
    }
    setLsExporting(null);
  };

  const inputStyle2 = {
    padding: "8px 12px", borderRadius: 6, border: "1px solid " + C.border,
    background: C.offWhite, fontSize: 12, color: C.navy, fontFamily: "'Noto Sans JP'", outline: "none",
  };

  // ── 詳細パネル用ヘルパー ──
  const detailCallStatusColor = (st) => {
    if (!st || st === '未架電') return { bg: 'transparent', color: C.textLight };
    return getStatusColor(st);
  };

  const handleDetailResult = async (label) => {
    if (!selectedItem || selectedRound === null) return;
    // アポ獲得はモーダルを開いて詳細入力
    if (label === 'アポ獲得') {
      const l = callListData.find(li => li._supaId === selectedItem.list_id);
      if (!l) { alert('リスト情報が見つかりません'); return; }
      setAppoModal({ item: { ...(selectedItemFull || {}), ...selectedItem }, list: l, round: selectedRound });
      return;
    }
    const calledAt = new Date().toISOString();
    const { result: newRec, error } = await insertCallRecord({
      item_id: selectedItem.id,
      list_id: selectedItem.list_id,
      round: selectedRound,
      status: label,
      memo: localMemo || null,
      called_at: calledAt,
      getter_name: currentUser || null,
    });
    if (error || !newRec) { console.error('[DetailResult] insertCallRecord 失敗', error); return; }
    const newRecs = [...itemRecords, newRec].sort((a, b) => a.round - b.round);
    setItemRecords(newRecs);
    await updateCallListItem(selectedItem.id, { call_status: label });
    setSearchResults(prev => prev.map(i => i.id === selectedItem.id ? { ...i, call_status: label } : i));
    const newNext = Math.min(Math.max(...newRecs.map(r => r.round)) + 1, 8);
    setSelectedRound(newNext);
    setPageRecords(prev => {
      const itemMap = { ...(prev[selectedItem.id] || {}) };
      itemMap[selectedRound] = newRec;
      return { ...prev, [selectedItem.id]: itemMap };
    });
  };

  // ====== 録音一覧タブ ロジック ======
  const reloadBookmarks = useCallback(async () => {
    if (!currentUser) return;
    const { data } = await fetchRecordingBookmarks(currentUser);
    const map = {};
    (data || []).forEach(b => { if (b.call_record_id) map[b.call_record_id] = b; });
    setBookmarkSet(map);
  }, [currentUser]);
  useEffect(() => { if (subTab === 'recordings') reloadBookmarks(); }, [subTab, reloadBookmarks]);
  useEffect(() => {
    if (subTab !== 'recordings') return;
    setRecLoading(true);
    fetchCallRecordsWithRecordings({
      getter: recGetter === 'all' ? null : recGetter,
      status: recStatus === 'all' ? null : recStatus,
      dateFrom: recDateFrom || null,
      dateTo: recDateTo || null,
      sortDir: recSortDir,
    }).then(({ data }) => { setRecList(data); setRecLoading(false); });
  }, [subTab, recGetter, recStatus, recDateFrom, recDateTo, recSortDir]);
  const handleToggleBookmark = async (rec) => {
    const existing = bookmarkSet[rec.id];
    if (existing) {
      await deleteRecordingBookmark(existing.id);
    } else {
      await insertRecordingBookmark({
        userName: currentUser,
        callRecordId: rec.id,
        recordingUrl: rec.recording_url,
        companyName: rec.company_name,
        getterName: rec.getter_name,
      });
    }
    reloadBookmarks();
  };

  const handleAppoSave = async (_formData) => {
    if (!appoModal) return;
    const { item, round } = appoModal;
    const calledAt = new Date().toISOString();
    const { result: newRec, error } = await insertCallRecord({
      item_id: item.id,
      list_id: item.list_id,
      round,
      status: 'アポ獲得',
      memo: localMemo || null,
      called_at: calledAt,
      getter_name: currentUser || null,
    });
    if (error || !newRec) { console.error('[AppoSave] insertCallRecord 失敗', error); return; }
    const newRecs = [...itemRecords, newRec].sort((a, b) => a.round - b.round);
    setItemRecords(newRecs);
    await updateCallListItem(item.id, { call_status: 'アポ獲得' });
    setSearchResults(prev => prev.map(i => i.id === item.id ? { ...i, call_status: 'アポ獲得' } : i));
    const newNext = Math.min(Math.max(...newRecs.map(r => r.round)) + 1, 8);
    setSelectedRound(newNext);
    setPageRecords(prev => {
      const itemMap = { ...(prev[item.id] || {}) };
      itemMap[round] = newRec;
      return { ...prev, [item.id]: itemMap };
    });
  };

  const handleDetailDeleteRecord = async (record) => {
    await deleteCallRecord(record.id);
    const newRecs = itemRecords.filter(r => r.id !== record.id).sort((a, b) => a.round - b.round);
    setItemRecords(newRecs);
    const lastRec = [...newRecs].sort((a, b) => b.round - a.round)[0];
    const newStatus = lastRec?.status || null;
    await updateCallListItem(selectedItem.id, { call_status: newStatus });
    setSearchResults(prev => prev.map(i => i.id === selectedItem.id ? { ...i, call_status: newStatus } : i));
    setSelectedRound(record.round);
    setPageRecords(prev => {
      const itemMap = { ...(prev[selectedItem.id] || {}) };
      delete itemMap[record.round];
      return { ...prev, [selectedItem.id]: itemMap };
    });
  };

  const handleDetailMemoBlur = async () => {
    if (!selectedItem) return;
    const currentNote = extractUserNote(selectedItemFull?.memo);
    if (localMemo === currentNote) return;
    setSavingMemo(true);
    const newMemo = buildMemoWithNote(selectedItemFull?.memo, localMemo);
    const err = await updateCallListItem(selectedItem.id, { memo: newMemo });
    setSavingMemo(false);
    if (err) { console.error('[memo] DB保存失敗', err); return; }
    setSelectedItemFull(prev => prev ? { ...prev, memo: newMemo } : prev);
  };

  const handleDetailSubPhoneBlur = async () => {
    if (!selectedItem) return;
    const err = await updateCallListItem(selectedItem.id, { sub_phone_number: subPhone });
    if (err) { console.error('[subPhone] DB保存失敗', err); return; }
    setSelectedItemFull(prev => prev ? { ...prev, sub_phone_number: subPhone } : prev);
  };

  const handleDetailFetchRecording = async (rec) => {
    if (!selectedItem?.phone) return;
    const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === currentUser);
    const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
    if (!zoomUserId) { alert('ZoomユーザーIDが設定されていません'); return; }
    try {
      const { data } = await invokeGetZoomRecording({ zoom_user_id: zoomUserId, callee_phone: selectedItem.phone.replace(/[^\d]/g, ''), called_at: rec.called_at, prev_called_at: null });
      const url = data?.recording_url || null;
      if (!url) { alert('録音URLを取得できませんでした'); return; }
      const dbError = await updateCallRecordRecordingUrl(rec.id, url);
      if (dbError) { alert('録音URLのDB保存に失敗しました: ' + dbError.message); return; }
      setItemRecords(prev => prev.map(r => r.id === rec.id ? { ...r, recording_url: url } : r));
    } catch (e) {
      console.error('[DetailFetchRecording] error:', e);
      alert('録音URL取得に失敗しました');
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        eyebrow="Sourcing · 検索"
        title="Search"
        description="企業・連絡先検索"
        style={{ marginBottom: 24 }}
      />
      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
        {[
          { id: "company", label: "企業検索" },
          { id: "recordings", label: "録音一覧" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
            padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Noto Sans JP'", border: "1px solid #E5E7EB",
            borderBottom: subTab === tab.id ? "2px solid #0D2247" : "2px solid transparent",
            background: subTab === tab.id ? "#fff" : "#F8F9FA",
            color: subTab === tab.id ? "#0D2247" : "#9CA3AF",
            borderRadius: "4px 4px 0 0", marginRight: -1,
          }}>{tab.label}</button>
        ))}
      </div>

      {subTab === "company" && (<div>
      {/* Search bar */}
      <div style={{
        background: "#fff", borderRadius: 4, padding: "16px 20px", marginBottom: 16,
        border: "1px solid #E5E7EB",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>企業検索</span>
          <span style={{ fontSize: 10, color: C.textLight }}>全リストから横断検索{totalCount > 0 ? `（${totalCount.toLocaleString()}社）` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={searchField} onChange={e => setSearchField(e.target.value)} style={{
            padding: "8px 12px", borderRadius: 6, border: "1px solid " + C.border,
            background: C.offWhite, fontSize: 12, color: C.navy, fontFamily: "'Noto Sans JP'", outline: "none",
          }}>
            {fieldOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="企業名、代表者名、電話番号などを入力..."
            style={{
              flex: 1, padding: "8px 14px", borderRadius: 6, border: "1px solid " + C.border,
              background: C.white, fontSize: 13, color: C.textDark, fontFamily: "'Noto Sans JP'", outline: "none",
            }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
          {statusOptions.map(s => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "'Noto Sans JP'", transition: "all 0.15s",
              border: statusFilter === s.id ? "1px solid #0D2247" : "1px solid #E5E7EB",
              background: statusFilter === s.id ? "#0D224715" : "#fff",
              color: statusFilter === s.id ? "#0D2247" : C.textMid,
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 11, color: C.textLight, marginBottom: 8 }}>
        <span>検索結果: <span style={{ fontWeight: 700, color: C.navy }}>{totalCount.toLocaleString()}</span>件</span>
        {searchResults.length < totalCount && <span>（{searchResults.length}件表示中）</span>}
      </div>

      {/* Results table */}
      <div style={{ background: "#fff", borderRadius: 4, border: "1px solid #E5E7EB", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minWidth: scMinW }}>
        <div style={{
          display: "grid", gridTemplateColumns: scGrid,
          padding: "8px 16px", background: "#0D2247", fontSize: 11, fontWeight: 600, color: "#fff", verticalAlign: 'middle',
        }}>
          {[["company","企業名"],["representative","代表者"],["phone","電話番号"],["list","クライアント名"],["industry","業種"],["lastCall","最終発信日"],["status","最終ステータス"]].map(([key, label], i) => (
            <span key={key}
              onClick={() => { if (clientSortBy === key) { setClientSortBy(null); setClientSortDir("asc"); } else { setClientSortBy(key); setClientSortDir("desc"); } }}
              onContextMenu={e => scCtxMenu(e, i)}
              style={{ position: 'relative', cursor: "pointer", userSelect: "none", textAlign: scCols[i]?.align || 'left', whiteSpace: 'nowrap', minWidth: 0 }}>
              {label}{clientSortBy === key ? " ▲" : " ▽"}
              {i < 6 && <ColumnResizeHandle colIndex={i} onResizeStart={scResize} />}
            </span>
          ))}
        </div>
        {searchLoading && !searchResults.length ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.textLight }}>検索中...</div>
        ) : sortedResults.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.textLight }}>
            {(searchTerm || statusFilter !== "all") ? "該当する企業が見つかりませんでした" : "検索キーワードを入力してください"}
          </div>
        ) : sortedResults.map((c, i) => {
          const listInfo = callListData.find(l => l._supaId === c.list_id);
          const rounds = pageRecords[c.id] || {};
          const latestCalled = (() => { let latest = ""; Object.values(rounds).forEach(r => { if (r.called_at && r.called_at > latest) latest = r.called_at; }); return latest; })();
          const stColor = getStatusColor(c.call_status).color;
          return (
            <div key={c.id} onClick={() => setSelectedItem(c)} style={{
              display: "grid", gridTemplateColumns: scGrid,
              padding: "8px 16px", fontSize: 11, alignItems: "center",
              borderBottom: "1px solid #E5E7EB",
              background: i % 2 === 0 ? "#fff" : "#F8F9FA",
              cursor: "pointer",
            }}>
              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: scCols[0]?.align || 'left' }}>{c.company}</span>
              <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: scCols[1]?.align || 'left' }}>{c.representative || "-"}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, textAlign: scCols[2]?.align || 'left' }}>{c.phone || "-"}</span>
              <span style={{ fontSize: 10, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: scCols[3]?.align || 'left' }}>
                {listInfo ? listInfo.company : "-"}
              </span>
              <span style={{ fontSize: 10, color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: scCols[4]?.align || 'left' }}>
                {listInfo?.industry || "-"}
              </span>
              <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'JetBrains Mono'", textAlign: scCols[5]?.align || 'right' }}>
                {latestCalled ? new Date(new Date(latestCalled).getTime() + 9*60*60*1000).toISOString().slice(0,10).replace(/-/g, '/') : "-"}
              </span>
              <span style={{ textAlign: scCols[6]?.align || 'center' }}>
                {c.call_status ? (
                  <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: stColor + "18", color: stColor, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {c.call_status}
                  </span>
                ) : (
                  <span style={{ fontSize: 9, color: C.textLight }}>未架電</span>
                )}
              </span>
            </div>
          );
        })}
        </div>
      </div>

      {/* 無限スクロール sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {searchLoading && searchResults.length > 0 && (
        <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12, color: C.textLight }}>読み込み中...</div>
      )}
      {!hasMore && searchResults.length > 0 && (
        <div style={{ padding: "10px 0", textAlign: "center", fontSize: 11, color: C.textLight }}>
          全 {totalCount.toLocaleString()} 件を表示
        </div>
      )}
      {/* 企業詳細モーダル */}
      {selectedItem && (
        <div onClick={() => setSelectedItem(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 4, width: "min(480px, 96vw)",
            maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 40px rgba(26,58,92,0.22)",
            border: "1px solid #E5E7EB",
          }}>
            {/* ヘッダー */}
            <div style={{
              padding: "12px 24px", borderBottom: "1px solid #E5E7EB",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#0D2247",
              flexShrink: 0,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedItem.company}
                </div>
                {(() => { const l = callListData.find(li => li._supaId === selectedItem.list_id); return l ? (
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{l.company} / {l.industry || ''}</div>
                ) : null; })()}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => {
                    const l = callListData.find(li => li._supaId === selectedItem.list_id);
                    if (!l) { alert('リスト情報が見つかりません'); return; }
                    setSelectedItem(null);
                    if (setCallFlowScreen) setCallFlowScreen({ list: l, defaultItemId: selectedItem.id, defaultListMode: false, singleItemMode: true });
                    else setCallingScreen({ listId: l.id, list: l });
                  }}
                  style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #fff', background: 'transparent', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP'" }}>
                  架電フローへ
                </button>
                <button onClick={() => setSelectedItem(null)} style={{
                  width: 28, height: 28, borderRadius: 6, background: C.white + '15',
                  border: '1px solid ' + C.white + '30', color: C.white, cursor: "pointer", fontSize: 16, lineHeight: 1,
                }}>✕</button>
              </div>
            </div>

            {/* 本体スクロール */}
            <div style={{ overflowY: "auto", padding: "14px 16px", flex: 1 }}>
              {loadingItemRecords ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: C.textLight, fontSize: 13 }}>読み込み中...</div>
              ) : (
                <>
                  {/* 基本情報 */}
                  {(() => {
                    const latest = itemRecords.length > 0 ? itemRecords.reduce((a, b) => a.round >= b.round ? a : b) : null;
                    return (
                      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>基本情報</div>
                        {[
                          { label: '事業内容', value: selectedItemFull?.business || selectedItem.business },
                          { label: '住所', value: (selectedItemFull?.address || '').replace(/\/\s*$/, '') },
                          { label: '代表者', value: selectedItemFull?.representative || selectedItem.representative },
                          { label: '前回架電結果', value: latest ? latest.status : '未架電' },
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
                    const full = selectedItemFull;
                    let parsedMemo = null;
                    if (full?.memo) { try { parsedMemo = JSON.parse(full.memo); } catch { /* plain text */ } }
                    const netIncome = full?.net_income ?? parsedMemo?.net_income ?? null;
                    const biko = parsedMemo?.biko ?? (full?.memo && !parsedMemo ? full.memo : null);
                    return (
                      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + C.borderLight }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 8 }}>詳細情報</div>
                        {[
                          { label: '売上', value: full?.revenue != null ? Number(full.revenue).toLocaleString() + ' 千円' : '-' },
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
                  {selectedItem.phone && (
                    <div onClick={() => dialPhone(selectedItem.phone)} style={{ display: 'block', marginBottom: 10, padding: '10px 16px', borderRadius: 4, background: '#0D2247', textAlign: 'center', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.white + 'cc', marginBottom: 2 }}>電話をかける</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: C.white, fontFamily: "'JetBrains Mono'" }}>{selectedItem.phone}</div>
                    </div>
                  )}

                  {/* サブ電話番号 */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                    <input type="tel" value={subPhone} onChange={e => setSubPhone(e.target.value)} onBlur={handleDetailSubPhoneBlur}
                      placeholder="別の番号に架電"
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: C.offWhite, color: C.textDark }} />
                    <button onClick={() => { if (!subPhone.trim()) return; dialPhone(subPhone.trim()); }}
                      disabled={!subPhone.trim()}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, cursor: subPhone.trim() ? 'pointer' : 'default', fontSize: 13, opacity: subPhone.trim() ? 1 : 0.4, lineHeight: 1 }}>発信</button>
                  </div>

                  {/* ラウンドボタン */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>架電ラウンド選択</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(() => {
                        const itemNextRound = itemRecords.length === 0 ? 1 : Math.max(...itemRecords.map(rec => rec.round)) + 1;
                        return Array.from({ length: Math.max(itemNextRound, 10) }, (_, i) => i + 1);
                      })().map(r => {
                        const roundRec = itemRecords.find(rec => rec.round === r);
                        const nextRound = itemRecords.length === 0 ? 1 : Math.max(...itemRecords.map(rec => rec.round)) + 1;
                        const isCompleted = !!roundRec;
                        const isCurrent = r === nextRound && !isCompleted;
                        const isFuture = r > nextRound;
                        const isSelected = r === selectedRound;
                        const bg = isCompleted ? C.border : isCurrent ? '#1E40AF' : 'transparent';
                        const color = isCompleted ? C.textLight : isCurrent ? '#fff' : C.textLight;
                        const border = isSelected
                          ? '2px solid ' + C.navy
                          : isFuture ? '1px solid ' + C.borderLight
                          : isCompleted ? '1px solid ' + C.border
                          : '1px solid #1E40AF';
                        return (
                          <button key={r} disabled={isFuture} onClick={() => !isFuture && setSelectedRound(r)}
                            style={{ width: 34, height: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
                              background: bg, color, border, cursor: isFuture ? 'default' : 'pointer',
                              fontFamily: "'JetBrains Mono'", opacity: isFuture ? 0.3 : 1, flexShrink: 0 }}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ステータスエリア */}
                  {(() => {
                    const roundRec = itemRecords.find(r => r.round === selectedRound);
                    const sc = roundRec ? detailCallStatusColor(roundRec.status) : null;
                    return roundRec ? (
                      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 4,
                        background: sc.bg, border: '1.5px solid ' + sc.color + '40',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>
                          {selectedRound}回目の結果：{roundRec.status}
                        </span>
                        <button onClick={() => handleDetailDeleteRecord(roundRec)}
                          style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4,
                            border: '1px solid ' + C.border, background: C.white,
                            cursor: 'pointer', color: C.textMid, fontFamily: "'Noto Sans JP'" }}>取消</button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                        {CALL_RESULTS.map(r => {
                          const isAppo = r.id === 'appointment';
                          const isExcl = r.id === 'excluded';
                          const btnBg    = isAppo ? '#38a169'  : isExcl ? C.red + '10' : C.navy + '08';
                          const btnColor = isAppo ? '#fff'     : isExcl ? C.red        : C.navy;
                          const btnBdr   = isAppo ? '1.5px solid #38a169' : isExcl ? '1.5px solid ' + C.red + '40' : '1px solid ' + C.navy + '25';
                          return (
                            <button key={r.id} onClick={() => handleDetailResult(r.label)}
                              style={{ padding: '9px 6px', borderRadius: 7, border: btnBdr, background: btnBg, color: btnColor, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Noto Sans JP'", lineHeight: 1.2 }}>
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* メモ */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      メモ
                      {savingMemo && <span style={{ fontSize: 9, color: C.textLight, fontWeight: 400 }}>保存中...</span>}
                    </div>
                    <textarea value={localMemo} onChange={e => setLocalMemo(e.target.value)} onBlur={handleDetailMemoBlur}
                      placeholder="架電メモを入力（フォーカスを外すと自動保存）..."
                      style={{ width: '100%', minHeight: 64, padding: '8px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: C.offWhite }} />
                  </div>

                  {/* 架電履歴 */}
                  {itemRecords.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 6 }}>架電履歴</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {itemRecords.map(rec => {
                          const sc = detailCallStatusColor(rec.status);
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
                                <span style={{ color: C.textLight, fontSize: 10 }}>{rec.getter_name || '-'}</span>
                                <span style={{ color: C.textLight, fontSize: 10 }}>{dtStr}</span>
                                {rec.recording_url
                                  ? <button onClick={() => setActiveRecordingId(activeRecordingId === rec.id ? null : rec.id)}
                                      title={activeRecordingId === rec.id ? "閉じる" : "録音を再生"}
                                      style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: activeRecordingId === rec.id ? C.red : 'inherit' }}>録音</button>
                                  : <button onClick={() => handleDetailFetchRecording(rec)} title="録音URLを手動取得"
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
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>)}

      {subTab === "listSearch" && (<div>
        {/* 検索フォーム */}
        <div style={{
          background: "#fff", borderRadius: 4, padding: "16px 20px", marginBottom: 16,
          border: "1px solid #E5E7EB",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>リスト検索</span>
            <span style={{ fontSize: 10, color: C.textLight }}>クライアント・業種・企業属性でSupabaseの架電リストを絞り込み</span>
          </div>
          {/* 1行目: クライアント名 + 業種 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* クライアント名コンボボックス */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>クライアント名</label>
              <input
                type="text"
                value={lsClientInput}
                onChange={e => { setLsClientInput(e.target.value); setLsClientFocused(true); }}
                onFocus={() => setLsClientFocused(true)}
                onBlur={() => setTimeout(() => setLsClientFocused(false), 150)}
                placeholder="クライアント名を入力..."
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }}
              />
              {lsClientFocused && filteredClientCandidates.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500,
                  background: C.white, border: "1px solid " + C.border, borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 180, overflowY: "auto",
                }}>
                  {filteredClientCandidates.map(name => (
                    <div key={name}
                      onMouseDown={() => { setLsClientInput(name); setLsClientFocused(false); }}
                      style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.textDark, borderBottom: "1px solid " + C.borderLight + "60" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{name}</div>
                  ))}
                </div>
              )}
            </div>
            {/* 業種コンボボックス */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>業種</label>
              <input
                type="text"
                value={lsIndustry}
                onChange={e => { setLsIndustry(e.target.value); setLsIndustryFocused(true); }}
                onFocus={() => setLsIndustryFocused(true)}
                onBlur={() => setTimeout(() => setLsIndustryFocused(false), 150)}
                placeholder="業種を入力..."
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }}
              />
              {lsIndustryFocused && filteredIndustryCandidates.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500,
                  background: C.white, border: "1px solid " + C.border, borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 180, overflowY: "auto",
                }}>
                  {filteredIndustryCandidates.map(v => (
                    <div key={v}
                      onMouseDown={() => { setLsIndustry(v); setLsIndustryFocused(false); }}
                      style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.textDark, borderBottom: "1px solid " + C.borderLight + "60" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >{v}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 2行目: 都道府県 + ステータス */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>都道府県（企業住所）</label>
              <input type="text" placeholder="例: 東京都、大阪府..." value={lsPref}
                onChange={e => setLsPref(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleListSearch()}
                style={{ ...inputStyle2, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>
                架電ステータス
                {lsStatus.length > 0 && <span style={{ marginLeft: 5, color: C.navy, fontWeight: 700 }}>{lsStatus.length}件選択</span>}
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "6px 8px",
                border: "1px solid " + C.border, borderRadius: 5, background: C.white, boxSizing: "border-box", width: "100%" }}>
                {statuses.map(s => s.label).map(s => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap", color: C.textMid }}>
                    <input type="checkbox" checked={lsStatus.includes(s)}
                      onChange={e => setLsStatus(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                      style={{ cursor: "pointer", accentColor: C.navy }} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {/* 3行目: 売上高 range + 純利益 range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>売上高（千円）</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsRevenueMin}
                  onChange={e => setLsRevenueMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsRevenueMax}
                  onChange={e => setLsRevenueMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>当期純利益（千円）</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsNetIncomeMin}
                  onChange={e => setLsNetIncomeMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsNetIncomeMax}
                  onChange={e => setLsNetIncomeMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
          </div>
          {/* 4行目: 架電回数 range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textLight, marginBottom: 3, display: "block" }}>架電回数</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="下限" value={lsCallCountMin}
                  onChange={e => setLsCallCountMin(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
                <span style={{ color: C.textLight, fontSize: 11 }}>〜</span>
                <input type="number" placeholder="上限" value={lsCallCountMax}
                  onChange={e => setLsCallCountMax(e.target.value)}
                  style={{ ...inputStyle2, flex: 1, minWidth: 0 }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => {
              setLsClientInput(""); setLsIndustry(""); setLsPref("");
              setLsRevenueMin(""); setLsRevenueMax("");
              setLsNetIncomeMin(""); setLsNetIncomeMax("");
              setLsStatus([]); setLsCallCountMin(""); setLsCallCountMax("");
              setLsResults(null); setLsItemResults(null); setLsCalledCounts({});
            }} style={{
              padding: "8px 16px", borderRadius: 4, border: "1px solid #0D2247",
              background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500,
              color: "#0D2247", fontFamily: "'Noto Sans JP'",
            }}>条件クリア</button>
            <button onClick={handleListSearch} disabled={lsSearching} style={{
              padding: "8px 22px", borderRadius: 4, border: "none",
              background: lsSearching ? C.textLight : '#0D2247', color: "#fff",
              cursor: lsSearching ? "default" : "pointer", fontSize: 13, fontWeight: 500,
              fontFamily: "'Noto Sans JP'",
            }}>{lsSearching ? "検索中..." : "検索"}</button>
          </div>
        </div>

        {/* 検索結果テーブル */}
        {lsResults === null && lsItemResults === null ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
            条件を入力して「検索」ボタンを押してください
          </div>
        ) : lsItemResults !== null ? (
          // ステータスフィルター選択時: 企業レベルの結果
          lsItemResults.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
              条件に一致する企業が見つかりませんでした
            </div>
          ) : (() => {
            const itemListMap = {};
            callListData.forEach(l => { if (l._supaId) itemListMap[l._supaId] = l; });
            const statusColorFn = (s) => getStatusColor(s) || { color: '#9CA3AF', bg: '#9CA3AF18' };
            return (
              <div style={{ background: "#fff", borderRadius: 4, overflowX: "auto", overflowY: "hidden", border: "1px solid #E5E7EB" }}>
                <div style={{ minWidth: sliMinW }}>
                <div style={{ padding: "8px 16px", background: "#F8F9FA", borderBottom: "1px solid #E5E7EB", fontSize: 12, color: C.textLight, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>架電先企業 {lsItemResults.length.toLocaleString()} 件</span>
                  <button
                    onClick={handleExportItems}
                    disabled={lsExporting === '__items__'}
                    style={{
                      padding: "5px 14px", borderRadius: 4, border: "none",
                      background: lsExporting === '__items__' ? C.textLight : '#0D2247',
                      color: "#fff", cursor: lsExporting === '__items__' ? "default" : "pointer",
                      fontSize: 13, fontWeight: 500, fontFamily: "'Noto Sans JP'",
                    }}
                  >{lsExporting === '__items__' ? "処理中..." : "エクスポート"}</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: sliGrid, padding: "8px 16px", background: "#0D2247", fontSize: 11, fontWeight: 600, color: "#fff", verticalAlign: 'middle' }}>
                  {['企業名','代表者名','電話番号','最新ステータス','リスト名'].map((label, i) => (
                    <span key={label} onContextMenu={e => sliCtxMenu(e, i)} style={{ position: 'relative', textAlign: sliCols[i]?.align || 'left', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {label}
                      {i < 4 && <ColumnResizeHandle colIndex={i} onResizeStart={sliResize} />}
                    </span>
                  ))}
                </div>
                {lsItemResults.map((item, i) => {
                  const list = itemListMap[item.list_id];
                  return (
                    <div key={item.id || i} style={{ display: "grid", gridTemplateColumns: sliGrid, padding: "8px 16px", fontSize: 11, alignItems: "center", borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F8F9FA" }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: sliCols[0]?.align || 'left' }}>{item.company || "-"}</span>
                      <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: sliCols[1]?.align || 'left' }}>{item.representative || "-"}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.navy, textAlign: sliCols[2]?.align || 'left' }}>{item.phone || "-"}</span>
                      <span style={{ textAlign: sliCols[3]?.align || 'left' }}>
                        <span style={{ fontSize: 10, borderLeft: '3px solid ' + (statusColorFn(item.call_status).color), paddingLeft: 8, color: statusColorFn(item.call_status).color }}>
                          {item.call_status || "-"}
                        </span>
                      </span>
                      <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, textAlign: sliCols[4]?.align || 'left' }}>
                        {list ? `${list.company}${list.industry ? ` - ${list.industry}` : ""}` : "-"}
                      </span>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })()
        ) : lsResults !== null && lsResults.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>
            条件に一致するリストが見つかりませんでした
          </div>
        ) : lsResults !== null && (
          <div style={{ background: "#fff", borderRadius: 4, overflowX: "auto", overflowY: "hidden", border: "1px solid #E5E7EB" }}>
            <div style={{ minWidth: slMinW }}>
            <div style={{
              display: "grid", gridTemplateColumns: slGrid,
              padding: "8px 16px", background: "#0D2247",
              fontSize: 11, fontWeight: 600, color: "#fff", verticalAlign: 'middle',
            }}>
              {['リスト名','クライアント名','業種','企業数','架電済み','操作'].map((label, i) => (
                <span key={label} onContextMenu={e => slCtxMenu(e, i)} style={{ position: 'relative', textAlign: slCols[i]?.align || 'left', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {label}
                  {i < 5 && <ColumnResizeHandle colIndex={i} onResizeStart={slResize} />}
                </span>
              ))}
            </div>
            {lsResults.map((list, i) => (
              <div key={list._supaId || i} style={{
                display: "grid", gridTemplateColumns: slGrid,
                padding: "8px 16px", fontSize: 11, alignItems: "center",
                borderBottom: "1px solid #E5E7EB",
                background: i % 2 === 0 ? "#fff" : "#F8F9FA",
              }}>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: slCols[0]?.align || 'left' }}>
                  {list.company}{list.industry ? ` - ${list.industry}` : ""}
                </span>
                <span style={{ color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: slCols[1]?.align || 'left' }}>{list.company}</span>
                <span style={{ color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: slCols[2]?.align || 'left' }}>{list.industry || "-"}</span>
                <span style={{ textAlign: slCols[3]?.align || 'right', fontFamily: "'JetBrains Mono'", fontWeight: 700, color: C.navy }}>{(list.count || 0).toLocaleString()}</span>
                <span style={{ textAlign: slCols[4]?.align || 'right', fontFamily: "'JetBrains Mono'", color: C.textMid }}>
                  {lsCalledCounts[list._supaId] != null ? lsCalledCounts[list._supaId].toLocaleString() : "-"}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                  <button
                    onClick={() => handleExport(list)}
                    disabled={lsExporting === list._supaId}
                    style={{
                      padding: "5px 10px", borderRadius: 4, border: "none", width: 126,
                      background: lsExporting === list._supaId ? C.textLight : '#0D2247',
                      color: "#fff", cursor: lsExporting === list._supaId ? "default" : "pointer",
                      fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans JP'",
                    }}
                  >{lsExporting === list._supaId ? "処理中..." : "Excelエクスポート"}</button>
                  <button
                    onClick={() => handlePdfExport(list)}
                    disabled={lsPdfExporting === list._supaId}
                    style={{
                      padding: "5px 10px", borderRadius: 4, border: "1px solid #0D2247", width: 126,
                      background: lsPdfExporting === list._supaId ? C.textLight : '#fff',
                      color: lsPdfExporting === list._supaId ? '#fff' : '#0D2247', cursor: lsPdfExporting === list._supaId ? "default" : "pointer",
                      fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans JP'",
                    }}
                  >{lsPdfExporting === list._supaId ? "処理中..." : "PDFレポート"}</button>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>)}
      {/* ─── 録音一覧タブ ─── */}
      {subTab === "recordings" && (
        <div>
          <div style={{ background: "#fff", borderRadius: 4, padding: "16px 20px", marginBottom: 16, border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>録音一覧</span>
              <span style={{ fontSize: 10, color: C.textLight }}>担当者・ステータスで絞り込み{recList.length > 0 ? `（${recList.length}件）` : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', display: 'block', marginBottom: 4 }}>担当者</label>
                <select value={recGetter} onChange={e => setRecGetter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, minWidth: 160, fontFamily: "'Noto Sans JP'" }}>
                  <option value="all">全担当者</option>
                  {(members || []).map(m => {
                    const name = typeof m === 'string' ? m : (m?.name || '');
                    return name ? <option key={name} value={name}>{name}</option> : null;
                  })}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', display: 'block', marginBottom: 4 }}>架電ステータス</label>
                <select value={recStatus} onChange={e => setRecStatus(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, minWidth: 160, fontFamily: "'Noto Sans JP'" }}>
                  <option value="all">全ステータス</option>
                  {statuses.map(s => (
                    <option key={s.id} value={s.label}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', display: 'block', marginBottom: 4 }}>架電日 From</label>
                <input type="date" value={recDateFrom} onChange={e => setRecDateFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: "'Noto Sans JP'" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', display: 'block', marginBottom: 4 }}>架電日 To</label>
                <input type="date" value={recDateTo} onChange={e => setRecDateTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: "'Noto Sans JP'" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', display: 'block', marginBottom: 4 }}>並び順</label>
                <select value={recSortDir} onChange={e => setRecSortDir(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 12, fontFamily: "'Noto Sans JP'" }}>
                  <option value="desc">新しい順</option>
                  <option value="asc">古い順</option>
                </select>
              </div>
              {(recGetter !== 'all' || recStatus !== 'all' || recDateFrom || recDateTo) && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={() => { setRecGetter('all'); setRecStatus('all'); setRecDateFrom(''); setRecDateTo(''); }}
                    style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 11, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>
                    クリア
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 4, border: "1px solid #E5E7EB", overflow: 'hidden' }}>
            {recLoading && <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>読み込み中...</div>}
            {!recLoading && recList.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>該当する録音がありません</div>}
            {!recLoading && recList.map((rec, idx) => {
              const isPlaying = recPlayingId === rec.id;
              const isBookmarked = !!bookmarkSet[rec.id];
              const sc = getStatusColor(rec.status);
              const calledLabel = rec.called_at
                ? new Date(new Date(rec.called_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')
                : '';
              return (
                <div key={rec.id} style={{ borderBottom: '1px solid #F0F0F0', padding: '10px 16px', background: idx % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: "'Noto Sans JP'" }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0D2247', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.company_name || '—'}</div>
                      <div style={{ fontSize: 10, color: C.textLight, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{rec.getter_name || '—'}</span>
                        <span>・</span>
                        <span style={{ padding: '1px 6px', background: sc.bg, color: sc.color, borderRadius: 3, fontWeight: 600 }}>{rec.status || ''}</span>
                        <span>・</span>
                        <span>{calledLabel}</span>
                        {rec.report_style && <span style={{ padding: '1px 6px', background: '#0D2247', color: '#fff', borderRadius: 3, fontSize: 9 }}>{rec.report_style}</span>}
                      </div>
                    </div>
                    <button onClick={() => setRecPlayingId(isPlaying ? null : rec.id)}
                      style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247', background: isPlaying ? '#0D2247' : '#fff', color: isPlaying ? '#fff' : '#0D2247', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {isPlaying ? '■ 停止' : '▶ 録音'}
                    </button>
                    <button onClick={() => setReportPopup(rec)}
                      style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #0D2247', background: '#fff', color: '#0D2247', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      レポート
                    </button>
                    <button onClick={() => handleToggleBookmark(rec)}
                      title={isBookmarked ? 'ブックマーク解除' : 'ブックマーク'}
                      style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 14, color: isBookmarked ? '#F59E0B' : '#9CA3AF' }}>
                      {isBookmarked ? '★' : '☆'}
                    </button>
                  </div>
                  {isPlaying && (
                    <InlineAudioPlayer url={rec.recording_url} onClose={() => setRecPlayingId(null)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reportPopup && (
        <ReportPopupModal
          appo={reportPopup}
          mode="callRecord"
          onClose={() => setReportPopup(null)}
          onSaved={(updated) => {
            setRecList(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
            setReportPopup(updated);
          }}
        />
      )}

      {/* ─── アポ取得報告モーダル（リスト検索から） ─── */}
      {appoModal && (
        <AppoReportModal
          row={appoModal.item}
          list={appoModal.list}
          currentUser={currentUser}
          members={members}
          clientData={clientData}
          rewardMaster={rewardMaster}
          onClose={() => setAppoModal(null)}
          onSave={handleAppoSave}
          onDone={() => setAppoModal(null)}
        />
      )}
      {scCtx.visible && (
        <AlignmentContextMenu
          x={scCtx.x} y={scCtx.y}
          currentAlign={scCols[scCtx.colIndex]?.align || 'left'}
          onSelect={align => scSetAlign(scCtx.colIndex, align)}
          onReset={scReset}
          onClose={scClose}
        />
      )}
      {sliCtx.visible && (
        <AlignmentContextMenu
          x={sliCtx.x} y={sliCtx.y}
          currentAlign={sliCols[sliCtx.colIndex]?.align || 'left'}
          onSelect={align => sliSetAlign(sliCtx.colIndex, align)}
          onReset={sliReset}
          onClose={sliClose}
        />
      )}
      {slCtx.visible && (
        <AlignmentContextMenu
          x={slCtx.x} y={slCtx.y}
          currentAlign={slCols[slCtx.colIndex]?.align || 'left'}
          onSelect={align => slSetAlign(slCtx.colIndex, align)}
          onReset={slReset}
          onClose={slClose}
        />
      )}
    </div>
  );
}
