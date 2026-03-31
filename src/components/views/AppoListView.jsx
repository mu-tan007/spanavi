import { useState, useEffect } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import { calcRankAndRate } from '../../utils/calculations';
import { formatCurrency } from '../../utils/formatters';
import { updateAppointment, insertAppointment, deleteAppointment, updateAppoCounted, updateMember, insertMember, deleteMember, updateMemberReward, invokeSyncZoomUsers, invokeGetZoomRecording, invokeTranscribeRecording, updateEmailStatus, invokeSendEmail, fetchMatchingListItemsByCompanyNames, fetchCallListItemByAppo, uploadAppoRecording } from '../../lib/supabaseWrite';
import { PAST_APPOINTMENT_COMPANIES } from '../../constants/pastAppointmentCompanies';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import { useIsMobile } from '../../hooks/useIsMobile';

const APPO_COLS = [
  { key: 'client', width: 240, align: 'left' },
  { key: 'company', width: 230, align: 'left' },
  { key: 'getter', width: 60, align: 'left' },
  { key: 'getDate', width: 105, align: 'right' },
  { key: 'meetDate', width: 110, align: 'right' },
  { key: 'status', width: 200, align: 'center' },
  { key: 'email', width: 80, align: 'center' },
  { key: 'revenue', width: 90, align: 'right' },
  { key: 'incentive', width: 110, align: 'right' },
];

const EMAIL_STATUS_LABELS = {
  pending: { label: '未送信', color: '#F59E0B', bg: '#FEF3C7' },
  sent: { label: '送信済', color: '#10B981', bg: '#D1FAE5' },
  failed: { label: '失敗', color: '#EF4444', bg: '#FEE2E2' },
};

export function MemberSuggestInput({ value, onChange, members = [], style, placeholder = '名前を入力して絞り込み' }) {
  const [suggs, setSuggs] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [rect, setRect] = React.useState(null);
  const inputRef = React.useRef(null);
  const memberNames = React.useMemo(
    () => members.map(m => typeof m === 'string' ? m : m.name || '').filter(Boolean),
    [members]
  );
  const open = (val) => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    const filtered = val ? memberNames.filter(n => n.includes(val)) : memberNames;
    setSuggs(filtered);
    setShow(filtered.length > 0);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); open(e.target.value); }}
        onFocus={() => open('')}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        style={style}
        placeholder={placeholder}
      />
      {show && rect && (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
          background: C.white, border: '1px solid ' + C.border, borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 99999, maxHeight: 180, overflowY: 'auto' }}>
          {suggs.map((name, i) => (
            <div key={i}
              onMouseDown={() => { onChange(name); setShow(false); }}
              style={{ padding: '7px 12px', fontSize: 11, cursor: 'pointer', color: C.textDark, fontFamily: "'Noto Sans JP'" }}
              onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
              onMouseLeave={e => e.currentTarget.style.background = C.white}
            >{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailApprovalSection({ appo, clientData = [], onStatusUpdate }) {
  const [emailStep, setEmailStep] = React.useState('idle'); // 'idle' | 'compose' | 'sending' | 'sent' | 'error'
  const [emailTo, setEmailTo] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailBody, setEmailBody] = React.useState('');
  const [sendError, setSendError] = React.useState('');

  const cl = (clientData || []).find(c => c.company === appo.client);
  const es = EMAIL_STATUS_LABELS[appo.emailStatus] || EMAIL_STATUS_LABELS.pending;

  const initCompose = () => {
    setEmailTo(cl?.clientEmail || '');
    setEmailSubject(`【面談日程のご連絡】${appo.company}`);
    setEmailBody(
      `お世話になっております。\n` +
      `MA-SPの篠宮です。\n\n` +
      `下記の通り面談の日程をご連絡いたします。\n\n` +
      `企業名：${appo.company}\n` +
      `面談日：${appo.meetDate || '（未定）'}\n\n` +
      `何卒よろしくお願いいたします。\n\n` +
      `篠宮`
    );
    setSendError('');
    setEmailStep('compose');
  };

  const handleSend = async () => {
    if (!emailTo) { setSendError('宛先メールアドレスを入力してください'); return; }
    setEmailStep('sending');
    setSendError('');
    const { error } = await invokeSendEmail({ to: emailTo, subject: emailSubject, body: emailBody });
    if (error) {
      setSendError(typeof error === 'string' ? error : error.message || '送信に失敗しました');
      setEmailStep('compose');
      return;
    }
    if (appo._supaId) await updateEmailStatus(appo._supaId, 'sent');
    onStatusUpdate?.('sent');
    setEmailStep('sent');
  };

  const iStyle = { width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 4, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#92400E' }}>メール送信</div>
        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, background: es.bg, color: es.color, fontWeight: 600 }}>{es.label}</span>
      </div>

      {appo.emailStatus === 'sent' && appo.emailSentAt && (
        <div style={{ fontSize: 10, color: '#6B7280' }}>送信日時: {new Date(appo.emailSentAt).toLocaleString('ja-JP')}</div>
      )}

      {emailStep === 'idle' && appo.emailStatus !== 'sent' && (
        <button onClick={initCompose}
          style={{ padding: '7px 16px', borderRadius: 4, border: 'none', background: '#0D2247', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>
          メール内容を確認・送信
        </button>
      )}

      {emailStep === 'sent' && (
        <div style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>メールを送信しました</div>
      )}

      {(emailStep === 'compose' || emailStep === 'sending') && (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: '#92400E', display: 'block', marginBottom: 2 }}>宛先</label>
            <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="client@example.com" style={iStyle} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: '#92400E', display: 'block', marginBottom: 2 }}>件名</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={iStyle} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: '#92400E', display: 'block', marginBottom: 2 }}>本文</label>
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
              style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          {sendError && <div style={{ fontSize: 10, color: '#DC2626', marginBottom: 6 }}>{sendError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEmailStep('idle')}
              style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #0D2247', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#0D2247', fontFamily: "'Noto Sans JP'" }}>
              キャンセル
            </button>
            <button onClick={handleSend} disabled={emailStep === 'sending'}
              style={{ padding: '6px 14px', borderRadius: 4, border: 'none', background: emailStep === 'sending' ? '#9CA3AF' : '#0D2247', color: '#fff', cursor: emailStep === 'sending' ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>
              {emailStep === 'sending' ? '送信中...' : '承認してメール送信'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppoListView({ appoData, setAppoData, members = [], setMembers, clientData = [], rewardMaster = [], setCallFlowScreen, callListData = [] }) {
  const isMobile = useIsMobile();
  const clientOptions = clientData.filter(c => c.status === "支援中" || c.status === "停止中");
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'past'
  // ── ランク・レート自動計算 ──────────────────────────────────────
  const [apPeriod, setApPeriod] = useState(() =>
    localStorage.getItem('spanavi_appo_period') || "all"
  );
  const [apSelectedMonth, setApSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_appo_month');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || "2026-03");
  });
  const [apCustomFrom, setApCustomFrom] = useState(() =>
    localStorage.getItem('spanavi_appo_from') || ""
  );
  const [apCustomTo, setApCustomTo] = useState(() =>
    localStorage.getItem('spanavi_appo_to') || ""
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState('status');
  const [sortDir, setSortDir] = useState('asc');
  const [editForm, setEditForm] = useState(null);
  const [addAppoForm, setAddAppoForm] = useState(null);
  const [reportDetail, setReportDetail] = useState(null); // Appointment detail modal
  const [showRecordingDetail, setShowRecordingDetail] = useState(false);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailEditForm, setDetailEditForm] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailNavigating, setDetailNavigating] = useState(false);
  // 'idle' | 'fetching' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [transcribeStep, setTranscribeStep] = React.useState('idle');
  // 録音URL差し替え用
  const [showReplaceUrl, setShowReplaceUrl] = useState(false);
  const [replaceUrl, setReplaceUrl] = useState('');
  // 'idle' | 'saving' | 'uploading' | 'transcribing' | 'enhancing' | 'done' | 'error'
  const [replaceStep, setReplaceStep] = useState('idle');
  const [dragOver, setDragOver] = useState(false);
  // ── 一括ステータス変更 ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // ── 請求書作成 ──
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceMonth, setInvoiceMonth] = useState(AVAILABLE_MONTHS[0]?.yyyymm || '');
  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]);   // [{ company, quantity, unitPrice, amount }]
  const [invoiceExporting, setInvoiceExporting] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState('');
  useEffect(() => {
    setShowRecordingDetail(false);
    setDetailEditing(false); setDetailEditForm(null);
    setShowReplaceUrl(false); setReplaceUrl(''); setReplaceStep('idle');
  }, [reportDetail]);

  useEffect(() => {
    localStorage.setItem('spanavi_appo_period', apPeriod);
    localStorage.setItem('spanavi_appo_month', apSelectedMonth);
    localStorage.setItem('spanavi_appo_from', apCustomFrom);
    localStorage.setItem('spanavi_appo_to', apCustomTo);
  }, [apPeriod, apSelectedMonth, apCustomFrom, apCustomTo]);

  // フィルター変更時に選択をクリア
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, apPeriod, apSelectedMonth, apCustomFrom, apCustomTo, search]);

  const statuses = [...new Set(appoData.map(a => a.status))];

  const statusOrder = { "面談済": 0, "事前確認済": 1, "アポ取得": 2, "リスケ中": 3, "キャンセル": 4 };
  const filtered = appoData.filter(a => {
    const dm = a.meetDate ? a.meetDate.slice(0, 7) : "";
    if (apPeriod === "month") { if (dm !== apSelectedMonth) return false; }
    else if (apPeriod === "custom") {
      if (apCustomFrom && dm < apCustomFrom) return false;
      if (apCustomTo && dm > apCustomTo) return false;
    }
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search && !a.company.includes(search) && !a.client.includes(search) && !a.getter.includes(search)) return false;
    return true;
  }).sort((a, b) => {
    if (sortKey === 'status') {
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (a.meetDate || '').localeCompare(b.meetDate || '');
    }
    let valA, valB;
    if (sortKey === 'meetDate') { valA = a.meetDate || ''; valB = b.meetDate || ''; }
    else if (sortKey === 'client') { valA = a.client || ''; valB = b.client || ''; }
    else if (sortKey === 'getter') { valA = a.getter || ''; valB = b.getter || ''; }
    else if (sortKey === 'getDate') { valA = a.getDate || ''; valB = b.getDate || ''; }
    else { valA = a.meetDate || ''; valB = b.meetDate || ''; }
    const cmp = valA.localeCompare(valB);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const countableStatuses = ["面談済", "事前確認済", "アポ取得"];
  const countable = filtered.filter(a => countableStatuses.includes(a.status));
  const totalSales = countable.reduce((s, a) => s + (a.sales || 0), 0);
  const totalReward = countable.reduce((s, a) => s + (a.reward || 0), 0);

  const monthStats = AVAILABLE_MONTHS.map(({ label, yyyymm }) => {
    const items = appoData.filter(a =>
      a.meetDate && a.meetDate.slice(0, 7) === yyyymm && countableStatuses.includes(a.status)
    );
    return { month: label, count: items.length,
      sales: items.reduce((s, a) => s + (a.sales || 0), 0),
      reward: items.reduce((s, a) => s + (a.reward || 0), 0) };
  });

  const statusColor = (st) => {
    if (st === "面談済") return { bg: C.green + "12", color: C.green };
    if (st === "事前確認済") return { bg: '#1E40AF1a', color: '#1E40AF' };
    if (st === "アポ取得") return { bg: '#C8A84B1a', color: '#C8A84B' };
    if (st === "リスケ中") return { bg: "#ff980012", color: "#ff9800" };
    if (st === "キャンセル" || st.includes("キャンセル")) return { bg: "#e5383512", color: "#e53835" };
    return { bg: C.textLight + "10", color: C.textLight };
  };

  const { columns: appoCols, gridTemplateColumns: appoGrid, contentMinWidth: appoMinW, onResizeStart: appoResize, onHeaderContextMenu: appoCtxMenu, contextMenu: appoCtx, setAlign: appoSetAlign, resetAll: appoReset, closeMenu: appoClose } = useColumnConfig('appoList', APPO_COLS, { padding: 22, gap: 2 });

  // チェックボックス列を先頭に追加（useColumnConfigには影響しない）
  const appoGridWithCheckbox = setAppoData ? `28px ${appoGrid}` : appoGrid;
  const appoMinWWithCheckbox = setAppoData ? appoMinW + 28 : appoMinW;
  const selectableFiltered = filtered.filter(a => a._supaId);
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every(a => selectedIds.has(a._supaId));
  const someSelected = selectableFiltered.some(a => selectedIds.has(a._supaId));
  const headerCheckboxRef = React.useRef(null);
  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  // ── 一括ステータス変更 ──────────────────────────────────────
  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedIds.size === 0 || bulkProcessing) return;
    const targetAppos = appoData.filter(a => selectedIds.has(a._supaId));
    const msg = `${targetAppos.length}件のアポイントメントのステータスを「${bulkStatus}」に変更します。よろしいですか？`;
    if (!window.confirm(msg)) return;
    setBulkProcessing(true);
    try {
      // 1. getter名でデルタを集計
      const memberDeltas = {};
      for (const appo of targetAppos) {
        const wasKanryo = appo.status === '面談済';
        const isKanryo = bulkStatus === '面談済';
        if (wasKanryo === isKanryo) continue;
        const delta = isKanryo ? (appo.sales || 0) : -(appo.sales || 0);
        if (delta === 0) continue;
        if (!memberDeltas[appo.getter]) memberDeltas[appo.getter] = { delta: 0, appos: [] };
        memberDeltas[appo.getter].delta += delta;
        memberDeltas[appo.getter].appos.push(appo);
      }
      // 2. メンバーの累計売上・ランク・インセンティブ率を更新
      const memberUpdates = [];
      if (setMembers) {
        for (const [getterName, { delta }] of Object.entries(memberDeltas)) {
          if (delta === 0) continue;
          const member = members.find(m => typeof m !== 'string' && m.name === getterName);
          if (!member?._supaId) continue;
          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
          memberUpdates.push({ member, newTotal, newRank, newRate });
          await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
        }
      }
      // 3. 各アポのステータスとis_counted_in_cumulativeを更新
      const errors = [];
      for (const appo of targetAppos) {
        const wasKanryo = appo.status === '面談済';
        const isKanryo = bulkStatus === '面談済';
        const error = await updateAppointment(appo._supaId, { ...appo, status: bulkStatus });
        if (error) { errors.push(appo.company); continue; }
        if (wasKanryo !== isKanryo) await updateAppoCounted(appo._supaId, isKanryo);
      }
      // 4. ローカルstate反映
      setAppoData(prev => prev.map(a => selectedIds.has(a._supaId) ? { ...a, status: bulkStatus } : a));
      if (memberUpdates.length > 0 && setMembers) {
        setMembers(prev => prev.map(m => {
          const upd = memberUpdates.find(u => u.member._supaId === m._supaId);
          return upd ? { ...m, totalSales: upd.newTotal, rank: upd.newRank, rate: upd.newRate } : m;
        }));
      }
      if (errors.length > 0) alert(`${targetAppos.length - errors.length}件更新成功、${errors.length}件失敗しました。`);
      setSelectedIds(new Set());
      setBulkStatus('');
    } catch (e) {
      alert('一括更新に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      setBulkProcessing(false);
    }
  };

  // ── 請求書PDF生成 ──────────────────────────────────────
  // クライアント選択時に明細行を自動生成
  // appoData.sales は消費税込みの金額 → 税別クライアントは税抜単価に変換
  const initInvoiceItems = (clientName, month) => {
    const client = clientData.find(c => c.company === clientName);
    const rm = client ? rewardMaster.find(r => r.id === client.rewardType) : null;
    const isTaxExcl = (rm?.tax || '税別') === '税別';
    const appos = appoData.filter(a =>
      a.status === '面談済' && a.client === clientName && a.meetDate && a.meetDate.slice(0, 7) === month
    );
    setInvoiceItems(appos.map(a => {
      const raw = a.sales || 0;
      const unitPrice = isTaxExcl ? Math.floor(raw / 1.1) : raw;
      return { company: a.company, quantity: 1, unitPrice, amount: unitPrice, note: '' };
    }));
  };

  const handleInvoiceExport = async () => {
    if (!invoiceMonth || !invoiceClient || invoiceExporting) return;
    const client = clientData.find(c => c.company === invoiceClient);
    if (!client) { alert('クライアントが見つかりません'); return; }
    if (invoiceItems.length === 0) { alert('明細行がありません'); return; }

    setInvoiceExporting(true);
    try {
      // 税区分の判定
      const rm = rewardMaster.find(r => r.id === client.rewardType);
      const taxType = rm?.tax || '税別';

      // 明細行はinvoiceItems stateから（編集済みの値を使用）
      const items = invoiceItems;
      const subtotal = items.reduce((s, it) => s + it.amount, 0);
      const tax = taxType === '税別'
        ? Math.floor(subtotal * 0.1)
        : Math.floor(subtotal - subtotal / 1.1);  // 内税の消費税額
      const total = taxType === '税別' ? subtotal + tax : subtotal;

      // 月ラベル
      const monthNum = parseInt(invoiceMonth.split('-')[1], 10);
      const monthLabel = monthNum + '月';

      // 発行日: 対象月の翌月1日
      const [y, m] = invoiceMonth.split('-').map(Number);
      const nextMonth = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
      const issueDate = `${nextMonth.getFullYear()}年${String(nextMonth.getMonth() + 1).padStart(2, '0')}月01日`;

      // 請求番号
      const clientIdx = clientData.filter(c => c.status === '支援中').findIndex(c => c.company === invoiceClient);
      const invoiceNumber = `${nextMonth.getFullYear()}${String(nextMonth.getMonth() + 1).padStart(2, '0')}01-${String((clientIdx >= 0 ? clientIdx : 0) + 1).padStart(3, '0')}`;

      // 支払期限: paySiteから推定（翌月末をデフォルト）
      let paymentDeadline = '';
      const paySite = client.paySite || '';
      if (paySite.includes('翌月15日')) {
        const pd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 15);
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月15日`;
      } else if (paySite.includes('翌月末')) {
        const pd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 2, 0);
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      } else if (paySite.includes('翌々月')) {
        const pd = paySite.includes('15日')
          ? new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 2, 15)
          : new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 3, 0);
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      } else {
        // デフォルト: 翌月末
        const pd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
        paymentDeadline = `${pd.getFullYear()}年${String(pd.getMonth() + 1).padStart(2, '0')}月${String(pd.getDate()).padStart(2, '0')}日`;
      }

      // コンポーネント描画 → html2canvas → jsPDF
      const { default: InvoicePDF } = await import('./InvoicePDF');
      const ReactDOM = await import('react-dom/client');
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      const root = ReactDOM.createRoot(container);
      root.render(
        <InvoicePDF
          clientName={invoiceClient}
          month={monthLabel}
          items={items}
          subtotal={subtotal}
          tax={tax}
          total={total}
          taxType={taxType}
          invoiceNumber={invoiceNumber}
          issueDate={issueDate}
          paymentDeadline={paymentDeadline}
        />
      );

      await new Promise(resolve => setTimeout(resolve, 600));

      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const el = document.getElementById('invoice-pdf-page');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      pdf.save(`業務委託料_${monthLabel}分_${invoiceClient} 御中.pdf`);

      root.unmount();
      document.body.removeChild(container);
      setInvoiceModal(false);
    } catch (e) {
      console.error('[handleInvoiceExport]', e);
      alert('請求書の生成に失敗しました: ' + (e.message || '不明なエラー'));
    } finally {
      setInvoiceExporting(false);
    }
  };

  const handleTranscribeDetail = async () => {
    if (transcribeStep !== 'idle') return;
    // Step 1: アポ取得報告または備考から録音URLを取得
    const src = detailEditForm?.appoReport || detailEditForm?.note || '';
    const urlMatch = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
    let recordingUrl = urlMatch?.[1]?.trim() || '';
    if (!recordingUrl) {
      // Zoom APIから録音URLを取得
      setTranscribeStep('fetching');
      const phone = (reportDetail?.phone || '').replace(/[^\d]/g, '');
      const getterName = detailEditForm?.getter || '';
      const member = (members || []).find(m => (typeof m === 'string' ? m : m.name) === getterName);
      const zoomUserId = typeof member === 'object' ? member?.zoomUserId : null;
      if (zoomUserId && phone) {
        try {
          const { data } = await invokeGetZoomRecording({
            zoom_user_id: zoomUserId,
            callee_phone: phone,
            called_at: new Date().toISOString(),
            prev_called_at: null,
          });
          recordingUrl = data?.recording_url || '';
        } catch (e) {
          console.error('[handleTranscribeDetail] Zoom取得エラー:', e);
        }
      }
      if (!recordingUrl) {
        setTranscribeStep('error');
        setTimeout(() => setTranscribeStep('idle'), 3000);
        return;
      }
    }
    // Step 2: 文字起こし＋AI添削
    setTranscribeStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url: recordingUrl,
        item_id: '',
        temperature: '', meetingExp: '', futureConsider: '', other: '',
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setTranscribeStep('enhancing');
      // アポ取得報告テキストの該当フィールドを添削結果で更新
      let report = detailEditForm?.appoReport || '';
      const replaceField = (text, pattern, value) => {
        return pattern.test(text) ? text.replace(pattern, value) : text + '\n' + value;
      };
      if (data.temperature)    report = replaceField(report, /^　・先方の温度感→.*$/m, `　・先方の温度感→${data.temperature}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無→.*$/m, `　・面談経験の有無→${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否→.*$/m, `　・将来的な検討可否→${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他→.*$/m, `　・その他→${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL：.*$/m, `　・録音URL：${data.publicRecordingUrl}`);
      setDetailEditForm(f => ({ ...f, appoReport: report }));
      setTranscribeStep('done');
      setTimeout(() => setTranscribeStep('idle'), 3000);
    } catch (e) {
      console.error('[handleTranscribeDetail]', e);
      setTranscribeStep('error');
      setTimeout(() => setTranscribeStep('idle'), 4000);
    }
  };

  // 録音URL差し替え＋AI再分析
  const handleReplaceRecordingUrl = async () => {
    if (!replaceUrl || replaceStep !== 'idle') return;
    const supaId = reportDetail?._supaId;
    if (!supaId) return;

    // Step 1: recording_url を DB 更新
    setReplaceStep('saving');
    const updateErr = await updateAppointment(supaId, {
      ...reportDetail,
      recording_url: replaceUrl,
    });
    if (updateErr) {
      alert('録音URL保存に失敗しました: ' + (updateErr.message || ''));
      setReplaceStep('idle');
      return;
    }

    // appo_report 内の録音URLも差し替え
    let report = reportDetail.appoReport || '';
    const urlPattern = /^　・録音URL[：:]\s*.*$/m;
    if (urlPattern.test(report)) {
      report = report.replace(urlPattern, `　・録音URL：${replaceUrl}`);
    }

    // Step 2: transcribe-recording で AI 再分析
    setReplaceStep('transcribing');
    try {
      const { data, error } = await invokeTranscribeRecording({
        recording_url: replaceUrl,
        item_id: reportDetail.item_id || '',
        temperature: '', meetingExp: '', futureConsider: '', other: '',
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setReplaceStep('enhancing');

      // appo_report の4項目を更新
      const replaceField = (text, pattern, value) =>
        pattern.test(text) ? text.replace(pattern, value) : text;
      if (data.temperature)    report = replaceField(report, /^　・先方の温度感→.*$/m, `　・先方の温度感→${data.temperature}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無→.*$/m, `　・面談経験の有無→${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否→.*$/m, `　・将来的な検討可否→${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他→.*$/m, `　・その他→${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL[：:].*$/m, `　・録音URL：${data.publicRecordingUrl}`);

      // 更新された appo_report を DB 保存
      await updateAppointment(supaId, {
        ...reportDetail,
        appoReport: report,
        recording_url: data.publicRecordingUrl || replaceUrl,
      });

      // ローカル state 更新
      const updated = { ...reportDetail, appoReport: report, recordingUrl: data.publicRecordingUrl || replaceUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: data.publicRecordingUrl || replaceUrl } : a));

      setReplaceStep('done');
      setTimeout(() => { setReplaceStep('idle'); setShowReplaceUrl(false); }, 3000);
    } catch (e) {
      console.error('[handleReplaceRecordingUrl]', e);
      // URL保存は成功しているので state は更新
      const updated = { ...reportDetail, appoReport: report, recordingUrl: replaceUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: replaceUrl } : a));
      setReplaceStep('error');
      setTimeout(() => setReplaceStep('idle'), 4000);
    }
  };

  // ドラッグ&ドロップで音声ファイルをアップロード → AI再分析
  const handleDropRecording = async (file) => {
    const supaId = reportDetail?._supaId;
    if (!supaId || replaceStep !== 'idle') return;
    setDroppedFileName(file.name);
    setReplaceStep('uploading');
    try {
      const { url, error: upErr } = await uploadAppoRecording(supaId, file);
      if (upErr || !url) throw new Error(upErr?.message || 'アップロード失敗');
      setReplaceUrl(url);

      // recording_url を DB 保存
      setReplaceStep('saving');
      await updateAppointment(supaId, { ...reportDetail, recording_url: url });

      let report = reportDetail.appoReport || '';
      const urlPattern = /^　・録音URL[：:]\s*.*$/m;
      if (urlPattern.test(report)) report = report.replace(urlPattern, `　・録音URL：${url}`);

      // transcribe-recording で AI 再分析
      setReplaceStep('transcribing');
      const { data, error } = await invokeTranscribeRecording({
        recording_url: url,
        item_id: reportDetail.item_id || '',
        temperature: '', meetingExp: '', futureConsider: '', other: '',
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      setReplaceStep('enhancing');

      const replaceField = (text, pattern, value) =>
        pattern.test(text) ? text.replace(pattern, value) : text;
      if (data.temperature)    report = replaceField(report, /^　・先方の温度感→.*$/m, `　・先方の温度感→${data.temperature}`);
      if (data.meetingExp)     report = replaceField(report, /^　・面談経験の有無→.*$/m, `　・面談経験の有無→${data.meetingExp}`);
      if (data.futureConsider) report = replaceField(report, /^　・将来的な検討可否→.*$/m, `　・将来的な検討可否→${data.futureConsider}`);
      if (data.other)          report = replaceField(report, /^　・その他→.*$/m, `　・その他→${data.other}`);
      if (data.publicRecordingUrl) report = replaceField(report, /^　・録音URL[：:].*$/m, `　・録音URL：${data.publicRecordingUrl}`);

      const finalUrl = data.publicRecordingUrl || url;
      await updateAppointment(supaId, { ...reportDetail, appoReport: report, recording_url: finalUrl });
      const updated = { ...reportDetail, appoReport: report, recordingUrl: finalUrl };
      setReportDetail(updated);
      if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === supaId ? { ...a, appoReport: report, recordingUrl: finalUrl } : a));

      setReplaceStep('done');
      setTimeout(() => { setReplaceStep('idle'); setShowReplaceUrl(false); setDroppedFileName(''); }, 3000);
    } catch (e) {
      console.error('[handleDropRecording]', e);
      setReplaceStep('error');
      setTimeout(() => { setReplaceStep('idle'); setDroppedFileName(''); }, 4000);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 0, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Appointments</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>アポイントメント・パイプライン管理</div>
        <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
          {[['current', 'アポ一覧'], ['past', '過去アポ一覧']].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{
                padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Noto Sans JP'", border: 'none', borderBottom: activeTab === key ? '3px solid #0D2247' : '3px solid transparent',
                background: 'transparent', color: activeTab === key ? '#0D2247' : '#9CA3AF',
                transition: 'all 0.15s',
              }}>{label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'current' && (<>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: isMobile ? "10px 12px" : "14px 18px", background: '#fff', borderRadius: 4,
        border: "1px solid #E5E7EB",
        overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0D2247' }}>アポ一覧</span>
          <span style={{ fontSize: 11, color: C.textLight }}>{filtered.length}件</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・クライアント・取得者..."
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 200 }} />
          {/* 月 / 期間指定 */}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {[["all", "全月"], ["month", "月"], ["custom", "期間指定"]].map(([k, l]) => (
              <button key={k} onClick={() => setApPeriod(k)} style={{
                padding: "5px 10px", borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: "pointer",
                fontFamily: "'Noto Sans JP'",
                background: apPeriod === k ? '#0D2247' : '#fff',
                color: apPeriod === k ? '#fff' : C.textMid,
                border: "1px solid " + (apPeriod === k ? '#0D2247' : C.border),
              }}>{l}</button>
            ))}
            {apPeriod === "month" && (
              <select value={apSelectedMonth} onChange={e => setApSelectedMonth(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                  fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
            {apPeriod === "custom" && (
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <select value={apCustomFrom} onChange={e => setApCustomFrom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">開始月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
                <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
                <select value={apCustomTo} onChange={e => setApCustomTo(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid " + C.border,
                    fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                  <option value="">終了月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none" }}>
            <option value="all">全ステータス</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {setAppoData && (
            <button onClick={() => { setSortKey('status'); setSortDir('asc'); }} style={{
              padding: "6px 12px", borderRadius: 4,
              background: sortKey === 'status' ? '#0D2247' : '#fff',
              border: "1px solid " + (sortKey === 'status' ? '#0D2247' : C.border),
              color: sortKey === 'status' ? '#fff' : C.textMid,
              fontSize: 11, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
            }}>デフォルト</button>
          )}
          {setAppoData && (
            <button onClick={() => setAddAppoForm({ client: "", company: "", getter: "", getDate: "", meetDate: "", status: "アポ取得", sales: 0, reward: 0, note: "" })} style={{
              padding: "8px 16px", borderRadius: 4,
              background: "#0D2247",
              border: "none", color: '#fff', cursor: "pointer", fontSize: 11, fontWeight: 500,
              fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1E3A6E"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#0D2247"; }}
            >＋ アポ追加</button>
          )}
          {setAppoData && (
            <button onClick={() => { setInvoiceModal(true); setInvoiceClient(''); }}
              style={{
                padding: "8px 16px", borderRadius: 4,
                background: "#fff", border: "1px solid #0D2247",
                color: '#0D2247', cursor: "pointer", fontSize: 11, fontWeight: 500,
                fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F0F4FF"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
            >請求書作成</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: 16 }}>
        {/* Total row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 10 }}>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: '#fff', borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>アポ件数 <span style={{ fontSize: 9, color: C.textLight + "90" }}>（有効）</span></div>
            <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{countable.length}<span style={{ fontSize: 11, fontWeight: 500, color: C.textLight, marginLeft: 4 }}>/ {filtered.length}件</span></div>
          </div>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: '#fff', borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上合計</div>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 900, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(totalSales)}</div>
          </div>
          <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: '#fff', borderRadius: 4, border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬合計</div>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 900, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(totalReward)}</div>
          </div>
        </div>
        {/* Monthly breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + AVAILABLE_MONTHS.length + ", 1fr)", gap: isMobile ? 6 : 10, overflowX: isMobile ? 'auto' : 'visible' }}>
          {monthStats.map(ms => (
            <div key={ms.month} style={{
              padding: "10px 14px", background: '#fff', borderRadius: 4,
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2247', marginBottom: 6, borderBottom: "1px solid #E5E7EB", paddingBottom: 4 }}>{ms.month}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>有効アポ</span>
                <span style={{ fontWeight: 700, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{ms.count}件</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                <span style={{ color: C.textLight }}>売上</span>
                <span style={{ fontWeight: 700, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(ms.sales)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.textLight }}>報酬</span>
                <span style={{ fontWeight: 700, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(ms.reward)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {setAppoData && selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: '#0D2247', borderRadius: '4px 4px 0 0',
          marginBottom: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: "'Noto Sans JP'" }}>
              {selectedIds.size}件選択中
            </span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #CBD5E1', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none' }}>
              <option value="">ステータスを選択</option>
              <option value="面談済">面談済</option>
              <option value="事前確認済">事前確認済</option>
              <option value="アポ取得">アポ取得</option>
              <option value="リスケ中">リスケ中</option>
              <option value="キャンセル">キャンセル</option>
            </select>
            <button onClick={handleBulkStatusChange} disabled={!bulkStatus || bulkProcessing}
              style={{
                padding: '5px 14px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600,
                fontFamily: "'Noto Sans JP'", cursor: !bulkStatus || bulkProcessing ? 'default' : 'pointer',
                background: !bulkStatus || bulkProcessing ? '#4B5563' : '#2E844A', color: '#fff',
              }}>
              {bulkProcessing ? '処理中...' : '一括変更'}
            </button>
          </div>
          <button onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); }}
            style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid #CBD5E1', background: 'transparent', color: '#CBD5E1', fontSize: 11, fontFamily: "'Noto Sans JP'", cursor: 'pointer' }}>
            選択解除
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: selectedIds.size > 0 ? '0 0 4px 4px' : 4, overflowX: "auto", overflowY: "hidden", border: "1px solid #E5E7EB" }}>
        <div style={{ minWidth: appoMinWWithCheckbox }}>
        <div style={{
          display: "grid", gridTemplateColumns: appoGridWithCheckbox,
          padding: isMobile ? "6px 4px 6px 10px" : "8px 6px 8px 16px", columnGap: 2, background: "#0D2247",
          fontSize: isMobile ? 10 : 11, fontWeight: 600, color: "#fff",
          borderBottom: "1px solid #E5E7EB",
          alignItems: "center",
          verticalAlign: "middle",
        }}>
          {setAppoData && (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input type="checkbox" ref={headerCheckboxRef} checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelectedIds(new Set());
                  else setSelectedIds(new Set(selectableFiltered.map(a => a._supaId)));
                }}
                style={{ cursor: 'pointer', accentColor: '#2E844A' }} />
            </span>
          )}
          {[
            { label: 'クライアント', key: 'client' },
            { label: '企業名', key: null },
            { label: '取得者', key: 'getter' },
            { label: '取得日', key: 'getDate' },
            { label: '面談日', key: 'meetDate' },
            { label: 'ステータス', key: null },
            { label: 'メール', key: null },
            { label: '当社売上', key: null },
            { label: 'インセンティブ', key: null },
          ].map(({ label, key }, i) => (
            <span key={label}
              onClick={key ? () => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } } : undefined}
              onContextMenu={e => appoCtxMenu(e, i)}
              style={{ position: 'relative', textAlign: appoCols[i]?.align || 'left', whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none', minWidth: 0 }}>
              {label}
              {key && (
                <span style={{ marginLeft: 2 }}>
                  <span style={{ color: sortKey === key && sortDir === 'asc' ? '#fff' : 'rgba(255,255,255,0.4)' }}>▲</span>
                  <span style={{ color: sortKey === key && sortDir === 'desc' ? '#fff' : 'rgba(255,255,255,0.4)' }}>▼</span>
                </span>
              )}
              <ColumnResizeHandle colIndex={i} onResizeStart={appoResize} />
            </span>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.textLight, fontSize: 12 }}>データがありません</div>
        ) : filtered.map((a, i) => {
          const sc = statusColor(a.status);
          const isSelected = a._supaId && selectedIds.has(a._supaId);
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: appoGridWithCheckbox,
              padding: "8px 6px 8px 16px", columnGap: 2, fontSize: 11, alignItems: "center",
              borderBottom: "1px solid #E5E7EB",
              background: isSelected ? '#EAF4FF' : (i % 2 === 0 ? '#fff' : '#F8F9FA'),
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#EAF4FF"; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8F9FA'; }}>
              {setAppoData && (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a._supaId ? (
                    <input type="checkbox" checked={isSelected}
                      onChange={() => setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(a._supaId)) next.delete(a._supaId); else next.add(a._supaId);
                        return next;
                      })}
                      style={{ cursor: 'pointer', accentColor: '#2E844A' }} />
                  ) : <span style={{ width: 13 }} />}
                </span>
              )}
              <span style={{ color: C.textMid, fontSize: 10, textAlign: appoCols[0]?.align || 'left' }}>{a.client}</span>
              <span style={{ fontWeight: 600, color: '#0D2247', cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2, textAlign: appoCols[1]?.align || 'left' }} onClick={() => setReportDetail(a)}>{a.company}</span>
              <span style={{ color: C.textDark, textAlign: appoCols[2]?.align || 'left' }}>{a.getter}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: appoCols[3]?.align || 'right', display: 'block' }}>{a.getDate.slice(5)}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: appoCols[4]?.align || 'right', display: 'block' }}>{a.meetDate.slice(5)}</span>
              <span style={{
                display: 'block', textAlign: appoCols[5]?.align || 'center', fontSize: 10, padding: "2px 6px",
                color: sc.color,
                whiteSpace: 'nowrap',
              }}>{a.status}</span>
              {(() => {
                const es = EMAIL_STATUS_LABELS[a.emailStatus] || EMAIL_STATUS_LABELS.pending;
                return <span style={{ textAlign: appoCols[6]?.align || 'center', display: 'flex', justifyContent: 'center' }}>
                  <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, background: es.bg, color: es.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{es.label}</span>
                </span>;
              })()}
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 600, color: '#0D2247', textAlign: appoCols[7]?.align || 'right', fontVariantNumeric: 'tabular-nums' }}>{a.sales > 0 ? formatCurrency(a.sales) : "-"}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textMid, textAlign: appoCols[8]?.align || 'right', fontVariantNumeric: 'tabular-nums' }}>{a.reward > 0 ? formatCurrency(a.reward) : "-"}</span>
            </div>
          );
        })}
        </div>
      </div>

      {/* Invoice Modal */}
      {invoiceModal && setAppoData && (() => {
        const invoiceClients = [...new Set(appoData.filter(a => a.status === '面談済' && a.meetDate && a.meetDate.slice(0, 7) === invoiceMonth).map(a => a.client))].filter(Boolean);
        const previewClient = clientData.find(c => c.company === invoiceClient);
        const previewRm = previewClient ? rewardMaster.find(r => r.id === previewClient.rewardType) : null;
        const previewTaxType = previewRm?.tax || '税別';
        const previewSubtotal = invoiceItems.reduce((s, it) => s + it.amount, 0);
        const previewTax = previewTaxType === '税別' ? Math.floor(previewSubtotal * 0.1) : Math.floor(previewSubtotal - previewSubtotal / 1.1);
        const previewGrandTotal = previewTaxType === '税別' ? previewSubtotal + previewTax : previewSubtotal;
        const invInputStyle = { padding: '4px 8px', borderRadius: 3, border: '1px solid ' + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: '#fff' };

        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: 640, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: '#0D2247', borderRadius: '4px 4px 0 0', color: '#fff', fontWeight: 600, fontSize: 15, flexShrink: 0 }}>
                請求書作成
              </div>
              <div style={{ padding: "20px 24px", overflowY: 'auto', flex: 1 }}>
                {/* 月 + クライアント選択 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', marginBottom: 4, display: 'block' }}>対象月</label>
                    <select value={invoiceMonth} onChange={e => { setInvoiceMonth(e.target.value); setInvoiceClient(''); setInvoiceItems([]); }}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 12, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                      {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', marginBottom: 4, display: 'block' }}>クライアント</label>
                    <select value={invoiceClient} onChange={e => { setInvoiceClient(e.target.value); if (e.target.value) initInvoiceItems(e.target.value, invoiceMonth); else setInvoiceItems([]); }}
                      style={{ width: '100%', padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 12, fontFamily: "'Noto Sans JP'", outline: "none" }}>
                      <option value="">選択してください</option>
                      {invoiceClients.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                </div>

                {/* 編集可能な明細テーブル */}
                {invoiceClient && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#0D2247' }}>明細（{invoiceItems.length}件）</span>
                      <button onClick={() => setInvoiceItems(prev => [...prev, { company: '', quantity: 1, unitPrice: 0, amount: 0, note: '' }])}
                        style={{ padding: '3px 10px', borderRadius: 3, border: '1px solid #0D2247', background: '#fff', color: '#0D2247', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
                        ＋ 行を追加
                      </button>
                    </div>
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                      {/* テーブルヘッダー */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 120px 28px', gap: 0, background: '#F3F4F6', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: '#374151' }}>
                        <span>品名</span><span style={{ textAlign: 'center' }}>数量</span><span style={{ textAlign: 'right' }}>単価</span><span style={{ textAlign: 'right' }}>金額</span><span style={{ paddingLeft: 6 }}>備考</span><span></span>
                      </div>
                      {/* 明細行 */}
                      {invoiceItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 120px 28px', gap: 4, padding: '5px 10px', borderTop: '1px solid #E5E7EB', alignItems: 'center' }}>
                          <input value={item.company} onChange={e => setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, company: e.target.value } : it))}
                            style={{ ...invInputStyle, width: '100%' }} />
                          <input type="number" value={item.quantity} onChange={e => { const q = Number(e.target.value) || 0; setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: q, amount: q * it.unitPrice } : it)); }}
                            style={{ ...invInputStyle, width: '100%', textAlign: 'center' }} />
                          <input type="number" value={item.unitPrice} onChange={e => { const p = Number(e.target.value) || 0; setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: p, amount: it.quantity * p } : it)); }}
                            style={{ ...invInputStyle, width: '100%', textAlign: 'right' }} />
                          <span style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#0D2247', fontFamily: "'JetBrains Mono'", paddingRight: 4 }}>{formatCurrency(item.amount)}</span>
                          <input value={item.note || ''} onChange={e => setInvoiceItems(prev => prev.map((it, i) => i === idx ? { ...it, note: e.target.value } : it))}
                            placeholder="備考" style={{ ...invInputStyle, width: '100%', fontSize: 10 }} />
                          <button onClick={() => setInvoiceItems(prev => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 14, padding: 0, lineHeight: 1 }} title="削除">×</button>
                        </div>
                      ))}
                      {invoiceItems.length === 0 && (
                        <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: 11, color: C.textLight }}>明細行がありません</div>
                      )}
                    </div>

                    {/* 合計セクション */}
                    <div style={{ marginTop: 12, padding: 14, background: '#F8F9FA', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                        <span style={{ color: C.textLight }}>小計</span>
                        <span style={{ fontWeight: 600, color: '#0D2247', textAlign: 'right', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewSubtotal)}</span>
                        {previewTaxType === '税別' && <>
                          <span style={{ color: C.textLight }}>消費税 (10%)</span>
                          <span style={{ fontWeight: 600, color: '#0D2247', textAlign: 'right', fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewTax)}</span>
                        </>}
                        <span style={{ color: C.textLight, fontWeight: 600 }}>ご請求金額</span>
                        <span style={{ fontWeight: 700, color: '#0D2247', textAlign: 'right', fontSize: 14, fontFamily: "'JetBrains Mono'" }}>{formatCurrency(previewGrandTotal)}</span>
                        {previewTaxType === '税込' && (
                          <>
                            <span></span>
                            <span style={{ fontSize: 9, color: '#6B7280', textAlign: 'right' }}>（内消費税 {formatCurrency(previewTax)}）</span>
                          </>
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 10, color: '#6B7280' }}>
                        税区分: {previewTaxType}　/　支払サイト: {previewClient?.paySite || '未設定'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 24px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
                <button onClick={() => { setInvoiceModal(false); setInvoiceItems([]); }}
                  style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #0D2247", background: '#fff', cursor: "pointer", fontSize: 11, fontWeight: 500, color: '#0D2247', fontFamily: "'Noto Sans JP'" }}>
                  キャンセル
                </button>
                <button onClick={handleInvoiceExport} disabled={!invoiceClient || invoiceItems.length === 0 || invoiceExporting}
                  style={{
                    padding: "8px 16px", borderRadius: 4, border: "none",
                    background: (!invoiceClient || invoiceItems.length === 0 || invoiceExporting) ? '#9CA3AF' : '#0D2247',
                    cursor: (!invoiceClient || invoiceItems.length === 0 || invoiceExporting) ? 'default' : 'pointer',
                    fontSize: 11, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                  }}>
                  {invoiceExporting ? 'PDF生成中...' : 'PDFダウンロード'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: '#0D2247', marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: 520, maxWidth: '95vw', maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: '#0D2247', borderRadius: '4px 4px 0 0', color: '#fff', fontWeight: 600, fontSize: 15 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>アポ情報を編集</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{editForm.company}</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント</label>
                    <select value={editForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setEditForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名</label><input value={editForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者</label><MemberSuggestInput value={editForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={editForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={editForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={editForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={editForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={editForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={editForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (editForm._supaId) {
                    const error = await deleteAppointment(editForm._supaId);
                    if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                  }
                  setAppoData(prev => prev.filter((_, i) => i !== editForm._idx));
                  setEditForm(null);
                }} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #DC2626", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#DC2626", fontFamily: "'Noto Sans JP'" }}>削除</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditForm(null)} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #0D2247", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#0D2247', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    const idx = editForm._idx;
                    const original = appoData[idx];
                    const updated = { ...editForm };
                    delete updated._idx;

                    const wasKanryo = original?.status === '面談済';
                    const isKanryo  = updated.status === '面談済';

                    // ── 面談済ステータス変更時の累計売上更新 ──────────
                    // intern_reward はアポ取得時の確定値を維持（上書きしない）
                    if ((isKanryo || wasKanryo) && setMembers) {
                      const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                      if (member?._supaId) {
                        // cumulative_sales の増減のみ（rewardは触らない）
                        const delta = (isKanryo && !wasKanryo)  ?  (updated.sales  || 0)
                                    : (!isKanryo && wasKanryo)  ? -(original.sales || 0)
                                    : 0;
                        if (delta !== 0) {
                          const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                          const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                          await updateMemberReward(member._supaId, {
                            cumulativeSales: newTotal,
                            rank: newRank,
                            incentiveRate: newRate,
                          });
                          setMembers(prev => prev.map(m =>
                            (typeof m !== 'string' && m._supaId === member._supaId)
                              ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate }
                              : m
                          ));
                          if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                        }
                      }
                    }

                    if (updated._supaId) {
                      const error = await updateAppointment(updated._supaId, updated);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                    }
                    setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 16px", borderRadius: 4, border: "none",
                    background: "#0D2247",
                    cursor: "pointer", fontSize: 11, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Appo Modal */}
      {addAppoForm && setAppoData && (() => {
        const inputStyle = { width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: '#0D2247', marginBottom: 2, display: "block" };
        const u = (k, v) => setAddAppoForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: 520, maxWidth: '95vw', maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "12px 24px", background: '#0D2247', borderRadius: '4px 4px 0 0', color: '#fff', fontWeight: 600, fontSize: 15 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>アポを追加</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>新規アポイント登録</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>クライアント名</label>
                    <select value={addAppoForm.client} onChange={e => {
                      const name = e.target.value;
                      const client = clientOptions.find(c => c.company === name);
                      const rewardRow = client?.rewardType ? rewardMaster.find(r => r.id === client.rewardType) : null;
                      setAddAppoForm(p => ({ ...p, client: name, ...(name && rewardRow ? { sales: rewardRow.price } : {}) }));
                    }} style={inputStyle}>
                      <option value="">選択...</option>
                      {clientOptions.map(c => (
                        <option key={c._supaId || c.company} value={c.company}>
                          {c.company}{c.status === "停止中" ? "（停止中）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div><label style={labelStyle}>企業名 <span style={{ color: "#e53835" }}>*</span></label><input value={addAppoForm.company} onChange={e => u("company", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>取得者名</label><MemberSuggestInput value={addAppoForm.getter} onChange={v => u("getter", v)} members={members} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ステータス</label>
                    <select value={addAppoForm.status} onChange={e => u("status", e.target.value)} style={inputStyle}>
                      <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>取得日</label><input type="date" value={addAppoForm.getDate} onChange={e => u("getDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>面談日</label><input type="date" value={addAppoForm.meetDate} onChange={e => u("meetDate", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>当社売上</label><input type="number" value={addAppoForm.sales} onChange={e => u("sales", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インターン報酬</label><input type="number" value={addAppoForm.reward} onChange={e => u("reward", Number(e.target.value))} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>備考</label><input value={addAppoForm.note} onChange={e => u("note", e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setAddAppoForm(null)} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #0D2247", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: '#0D2247', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                <button onClick={async () => {
                  if (!addAppoForm.company.trim()) return;
                  const newAppo = {
                    client: addAppoForm.client,
                    company: addAppoForm.company,
                    getter: addAppoForm.getter,
                    getDate: addAppoForm.getDate,
                    meetDate: addAppoForm.meetDate,
                    status: addAppoForm.status,
                    sales: addAppoForm.sales,
                    reward: addAppoForm.reward,
                    note: addAppoForm.note,
                    month: addAppoForm.meetDate ? (parseInt(addAppoForm.meetDate.slice(5, 7), 10) + '月') : '',
                  };
                  const { result, error } = await insertAppointment(addAppoForm);
                  if (error || !result) { alert('保存に失敗しました: ' + (error?.message || '不明なエラー')); return; }
                  newAppo._supaId = result.id;
                  setAppoData(prev => [...prev, newAppo]);
                  setAddAppoForm(null);
                }} style={{
                  padding: "8px 16px", borderRadius: 4, border: "none",
                  background: "#0D2247",
                  cursor: "pointer", fontSize: 11, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
                }}>保存</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Appointment Detail Modal */}
      {reportDetail && (
        <div onClick={() => setReportDetail(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(10,25,41,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, animation: "fadeIn 0.2s ease",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: 520, maxWidth: '95vw', maxHeight: "80vh", overflow: "auto",
            boxShadow: "0 20px 60px rgba(10,25,41,0.3)",
          }}>
            <div style={{
              background: '#0D2247',
              padding: "12px 24px", borderRadius: "4px 4px 0 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>アポイント詳細</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {!detailEditing && setCallFlowScreen && (
                  <button disabled={detailNavigating} onClick={async () => {
                    setDetailNavigating(true);
                    try {
                      const phone = (reportDetail?.phone || '').replace(/[^\d]/g, '');
                      const { data } = await fetchCallListItemByAppo(reportDetail.company, phone, reportDetail.list_id, reportDetail.item_id);
                      if (!data?.list_id) { alert('架電リストが見つかりませんでした'); return; }
                      const list = callListData.find(l => l._supaId === data.list_id);
                      setCallFlowScreen({ list: list || { _supaId: data.list_id, id: data.list_id, company: '' }, defaultItemId: data.id, defaultListMode: false });
                      setReportDetail(null);
                    } catch (e) {
                      console.error('[detailNavigate]', e);
                      alert('遷移に失敗しました');
                    } finally { setDetailNavigating(false); }
                  }}
                    style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: '#fff', cursor: detailNavigating ? "default" : "pointer", opacity: detailNavigating ? 0.6 : 1, fontSize: 11, fontFamily: "'Noto Sans JP'" }}>
                    {detailNavigating ? '検索中...' : '架電ページへ'}
                  </button>
                )}
                {!detailEditing ? (
                  <button onClick={() => { setDetailEditForm({ ...reportDetail, _idx: appoData.findIndex(a => a._supaId === reportDetail._supaId) }); setDetailEditing(true); }}
                    style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: '#fff', cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'" }}>
                    編集
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setDetailEditing(false); setDetailEditForm(null); }}
                      style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: 'rgba(255,255,255,0.8)', cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans JP'" }}>
                      キャンセル
                    </button>
                    <button disabled={detailSaving} onClick={async () => {
                      const idx = detailEditForm._idx;
                      const original = appoData[idx];
                      const updated = { ...detailEditForm };
                      delete updated._idx;
                      const wasKanryo = original?.status === '面談済';
                      const isKanryo  = updated.status === '面談済';
                      if ((isKanryo || wasKanryo) && setMembers) {
                        const member = members.find(m => typeof m !== 'string' && m.name === updated.getter);
                        if (member?._supaId) {
                          const delta = (isKanryo && !wasKanryo) ? (updated.sales || 0) : (!isKanryo && wasKanryo) ? -(original.sales || 0) : 0;
                          if (delta !== 0) {
                            const newTotal = Math.max(0, (member.totalSales || 0) + delta);
                            const { rank: newRank, rate: newRate } = calcRankAndRate(newTotal);
                            await updateMemberReward(member._supaId, { cumulativeSales: newTotal, rank: newRank, incentiveRate: newRate });
                            setMembers(prev => prev.map(m => (typeof m !== 'string' && m._supaId === member._supaId) ? { ...m, totalSales: newTotal, rank: newRank, rate: newRate } : m));
                            if (original?._supaId) await updateAppoCounted(original._supaId, isKanryo);
                          }
                        }
                      }
                      setDetailSaving(true);
                      if (updated._supaId) {
                        const error = await updateAppointment(updated._supaId, updated);
                        setDetailSaving(false);
                        if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      } else { setDetailSaving(false); }
                      setAppoData(prev => prev.map((a, i) => i === idx ? updated : a));
                      setReportDetail(updated);
                      setDetailEditing(false); setDetailEditForm(null);
                    }} style={{ padding: "4px 14px", borderRadius: 4, border: "none", background: detailSaving ? C.border : '#1E40AF', color: '#fff', cursor: detailSaving ? "default" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>
                      {detailSaving ? '保存中…' : '保存'}
                    </button>
                  </>
                )}
                <button onClick={() => setReportDetail(null)} style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.15)', border: "none", color: '#fff', cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {(() => {
                const ef = detailEditForm;
                const iS = { width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid " + C.border, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.white, boxSizing: "border-box" };
                const u = (k, v) => setDetailEditForm(p => ({ ...p, [k]: v }));
                return (
                  <>
                    {detailEditing
                      ? <input value={ef.company} onChange={e => u("company", e.target.value)} style={{ ...iS, fontSize: 16, fontWeight: 700, marginBottom: 12, padding: "6px 10px" }} />
                      : <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2247', marginBottom: 12 }}>{reportDetail.company}</div>
                    }
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      {/* クライアント */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>クライアント</div>
                        {detailEditing
                          ? <select value={ef.client} onChange={e => { const name = e.target.value; const cl = clientOptions.find(c => c.company === name); const rr = cl?.rewardType ? rewardMaster.find(r => r.id === cl.rewardType) : null; u("client", name); if (name && rr) u("sales", rr.price); }} style={iS}>
                              <option value="">選択...</option>
                              {clientOptions.map(c => <option key={c._supaId || c.company} value={c.company}>{c.company}{c.status === "停止中" ? "（停止中）" : ""}</option>)}
                            </select>
                          : <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{reportDetail.client}</div>}
                      </div>
                      {/* 取得者 */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>取得者</div>
                        {detailEditing
                          ? <MemberSuggestInput value={ef.getter} onChange={v => u("getter", v)} members={members} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{reportDetail.getter}</div>}
                      </div>
                      {/* 取得日 */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>取得日</div>
                        {detailEditing
                          ? <input type="date" value={ef.getDate} onChange={e => u("getDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{reportDetail.getDate}</div>}
                      </div>
                      {/* 面談日 */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>面談日</div>
                        {detailEditing
                          ? <input type="date" value={ef.meetDate} onChange={e => u("meetDate", e.target.value)} style={iS} />
                          : <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{reportDetail.meetDate}</div>}
                      </div>
                      {/* ステータス */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>ステータス</div>
                        {detailEditing
                          ? <select value={ef.status} onChange={e => u("status", e.target.value)} style={iS}>
                              <option value="面談済">面談済</option><option value="事前確認済">事前確認済</option><option value="アポ取得">アポ取得</option><option value="リスケ中">リスケ中</option><option value="キャンセル">キャンセル</option>
                            </select>
                          : <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>{reportDetail.status}</div>}
                      </div>
                      {/* 月（読み取り専用） */}
                      <div style={{ padding: "8px 12px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>月</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0D2247' }}>
                          {(detailEditing ? ef.meetDate : reportDetail.meetDate) ? (parseInt((detailEditing ? ef.meetDate : reportDetail.meetDate).slice(5, 7), 10) + "月") : null}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      <div style={{ padding: "10px 14px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                        {detailEditing
                          ? <input type="number" value={ef.sales} onChange={e => u("sales", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: 900, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{reportDetail.sales > 0 ? "¥" + reportDetail.sales.toLocaleString() : "-"}</div>}
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                        {detailEditing
                          ? <input type="number" value={ef.reward} onChange={e => u("reward", Number(e.target.value))} style={iS} />
                          : <div style={{ fontSize: 20, fontWeight: 900, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{reportDetail.reward > 0 ? "¥" + reportDetail.reward.toLocaleString() : "-"}</div>}
                      </div>
                    </div>
                    {detailEditing && (
                      <div style={{ marginBottom: 12, textAlign: "right" }}>
                        <button onClick={async () => {
                          if (!reportDetail._supaId) return;
                          if (!window.confirm('このアポを削除しますか？')) return;
                          const error = await deleteAppointment(reportDetail._supaId);
                          if (error) { alert('削除に失敗しました: ' + (error.message || '不明なエラー')); return; }
                          if (setAppoData) setAppoData(prev => prev.filter(a => a._supaId !== reportDetail._supaId));
                          setReportDetail(null);
                        }} style={{ padding: "6px 16px", borderRadius: 4, border: "1px solid #DC2626", background: '#fff', cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#DC2626", fontFamily: "'Noto Sans JP'" }}>
                          削除
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
              {/* ── 備考 ── */}
              <div style={{ padding: "10px 14px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>備考</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.note || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, note: e.target.value }))}
                    rows={4}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                      fontSize: 12, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: C.white, color: C.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.note ? (
                  <div style={{ fontSize: 12, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.note}</div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textLight }}>備考なし</div>
                )}
              </div>
              {/* ── アポ取得報告 ── */}
              <div style={{ padding: "10px 14px", borderRadius: 4, background: '#F8F9FA', border: "1px solid #E5E7EB", borderLeft: "3px solid #0D2247", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0D2247', marginBottom: 6 }}>アポ取得報告</div>
                {detailEditing ? (
                  <textarea
                    value={detailEditForm.appoReport || ''}
                    onChange={e => setDetailEditForm(f => ({ ...f, appoReport: e.target.value }))}
                    rows={10}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + C.borderLight,
                      fontSize: 11, fontFamily: "'Noto Sans JP'", lineHeight: 1.7, resize: "vertical",
                      outline: "none", background: C.white, color: C.textDark, boxSizing: "border-box" }}
                  />
                ) : reportDetail.appoReport ? (
                  <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{reportDetail.appoReport}</div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textLight, textAlign: "center", padding: "8px 0" }}>
                    アポ取得報告はまだ登録されていません
                  </div>
                )}
                {detailEditing && (
                  <button
                    onClick={handleTranscribeDetail}
                    disabled={transcribeStep !== 'idle'}
                    style={{ marginTop: 8, padding: '7px 14px', borderRadius: 4, border: '1px solid #0D2247', background: '#fff', cursor: transcribeStep !== 'idle' ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, color: '#0D2247', fontFamily: "'Noto Sans JP'", opacity: transcribeStep !== 'idle' ? 0.6 : 1 }}>
                    {transcribeStep === 'fetching'     && '録音を検索中...'}
                    {transcribeStep === 'transcribing' && '文字起こし中...'}
                    {transcribeStep === 'enhancing'    && 'AI添削中...'}
                    {transcribeStep === 'done'         && '添削完了'}
                    {transcribeStep === 'error'        && '録音データが見つかりませんでした'}
                    {transcribeStep === 'idle'         && '文字起こし＋AI添削'}
                  </button>
                )}
              </div>
              {(() => {
                const src = reportDetail.appoReport || reportDetail.note || '';
                const m = src.match(/録音URL[：:]\s*(https?:\/\/\S+)/);
                const recUrl = reportDetail.recordingUrl || m?.[1]?.trim() || '';
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ padding: '5px 8px', borderRadius: 4, background: '#F8F9FA',
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', whiteSpace: 'nowrap' }}>録音</span>
                      {recUrl
                        ? <button onClick={() => setShowRecordingDetail(v => !v)}
                            title={showRecordingDetail ? "閉じる" : "録音を再生"}
                            style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, lineHeight: 1, color: showRecordingDetail ? C.red : 'inherit' }}>録音</button>
                        : <span style={{ fontSize: 11, color: C.textLight }}>録音なし</span>
                      }
                      {!detailEditing && (
                        <button onClick={() => { setShowReplaceUrl(v => !v); setReplaceUrl(''); setReplaceStep('idle'); }}
                          style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 10px', borderRadius: 4,
                            border: '1px solid #0D2247', background: showReplaceUrl ? '#0D2247' : '#fff',
                            color: showReplaceUrl ? '#fff' : '#0D2247', cursor: 'pointer', fontFamily: "'Noto Sans JP'", fontWeight: 500 }}>
                          {showReplaceUrl ? '閉じる' : '差し替え'}
                        </button>
                      )}
                    </div>
                    {showRecordingDetail && recUrl && (
                      <InlineAudioPlayer url={recUrl} onClose={() => setShowRecordingDetail(false)} />
                    )}
                    {showReplaceUrl && !detailEditing && (
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                          e.preventDefault(); setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/') || /\.(mp3|mp4|m4a|wav|ogg|webm)$/i.test(file.name))) {
                            handleDropRecording(file);
                          } else if (file) {
                            alert('音声・動画ファイルを選択してください');
                          }
                        }}
                        style={{ marginTop: 6, padding: '8px 10px', borderRadius: 4,
                          background: dragOver ? '#E0E7FF' : '#F0F4FF',
                          border: dragOver ? '2px dashed #0D2247' : '1px solid #CBD5E1',
                          transition: 'all 0.15s' }}>
                        {/* ドロップゾーン */}
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', marginBottom: 6 }}>
                          URLを貼り付け、または音声ファイルをドラッグ&ドロップ
                        </div>
                        {droppedFileName && replaceStep !== 'idle' && (
                          <div style={{ fontSize: 10, color: C.textMid, marginBottom: 4 }}>{droppedFileName}</div>
                        )}
                        <input
                          type="text"
                          value={replaceUrl}
                          onChange={e => setReplaceUrl(e.target.value)}
                          placeholder="https://..."
                          disabled={replaceStep !== 'idle'}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid ' + C.border,
                            fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', background: replaceStep !== 'idle' ? '#f0f0f0' : '#fff',
                            boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                          <button
                            onClick={handleReplaceRecordingUrl}
                            disabled={!replaceUrl || replaceStep !== 'idle'}
                            style={{ padding: '6px 14px', borderRadius: 4, border: 'none',
                              background: (!replaceUrl || replaceStep !== 'idle') ? C.border : '#0D2247',
                              color: '#fff', cursor: (!replaceUrl || replaceStep !== 'idle') ? 'default' : 'pointer',
                              fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>
                            {replaceStep === 'saving'       && '保存中...'}
                            {replaceStep === 'uploading'    && 'アップロード中...'}
                            {replaceStep === 'transcribing' && '文字起こし中...'}
                            {replaceStep === 'enhancing'    && 'AI添削中...'}
                            {replaceStep === 'done'         && '完了'}
                            {replaceStep === 'error'        && 'エラー（リトライ可）'}
                            {replaceStep === 'idle'         && '保存＋AI再分析'}
                          </button>
                          {replaceStep === 'idle' && (
                            <label style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #0D2247',
                              background: '#fff', color: '#0D2247', cursor: 'pointer',
                              fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans JP'" }}>
                              ファイル選択
                              <input type="file" accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm"
                                style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleDropRecording(f); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* ── メール承認・送信 ── */}
              <EmailApprovalSection
                appo={reportDetail}
                clientData={clientData}
                onStatusUpdate={(newStatus) => {
                  const updated = { ...reportDetail, emailStatus: newStatus };
                  setReportDetail(updated);
                  if (setAppoData) setAppoData(prev => prev.map(a => a._supaId === updated._supaId ? { ...a, emailStatus: newStatus } : a));
                }}
              />
            </div>
          </div>
        </div>
      )}
      {appoCtx.visible && (
        <AlignmentContextMenu
          x={appoCtx.x} y={appoCtx.y}
          currentAlign={appoCols[appoCtx.colIndex]?.align || 'left'}
          onSelect={align => appoSetAlign(appoCtx.colIndex, align)}
          onReset={appoReset}
          onClose={appoClose}
        />
      )}
      </>)}

      {activeTab === 'past' && (
        <PastAppoTab appoData={appoData} callListData={callListData} setCallFlowScreen={setCallFlowScreen} />
      )}
    </div>
  );
}

// ============================================================
// Past Appointments Tab (過去アポ一覧)
// ============================================================
const PAST_APPO_COLS = [
  { key: 'company', width: 240, align: 'left' },
  { key: 'client', width: 200, align: 'left' },
  { key: 'getter', width: 80, align: 'center' },
  { key: 'getDate', width: 100, align: 'right' },
  { key: 'listMatch', width: 400, align: 'left' },
];

function PastAppoTab({ appoData, callListData = [], setCallFlowScreen }) {
  const isMobile = useIsMobile();
  const [pastSearch, setPastSearch] = useState('');
  const [matchMap, setMatchMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'spanavi' | 'excel'
  const [listFilter, setListFilter] = useState('all'); // 'all' | 'matched' | 'unmatched'

  const { columns: pastCols, gridTemplateColumns: pastGrid, contentMinWidth: pastMinW, onResizeStart: pastResize, onHeaderContextMenu: pastCtxMenu, contextMenu: pastCtx, setAlign: pastSetAlign, resetAll: pastReset, closeMenu: pastClose } = useColumnConfig('pastAppoList', PAST_APPO_COLS, { padding: 22, gap: 2 });

  // 全過去アポ企業名を統合（企業名単位で1行に統合）
  const pastItems = React.useMemo(() => {
    const map = {};
    // Spanaviデータを企業名でグループ化
    appoData.forEach(a => {
      const name = a.company;
      if (!map[name]) map[name] = { company: name, clients: [], getters: [], getDates: [] };
      if (a.client && !map[name].clients.includes(a.client)) map[name].clients.push(a.client);
      if (a.getter && !map[name].getters.includes(a.getter)) map[name].getters.push(a.getter);
      if (a.getDate) map[name].getDates.push(a.getDate);
    });
    // Excelデータで未登録の企業を追加
    PAST_APPOINTMENT_COMPANIES.forEach(name => {
      if (!map[name]) map[name] = { company: name, clients: [], getters: [], getDates: [] };
    });
    return Object.values(map).map(g => ({
      company: g.company,
      clients: g.clients,
      client: g.clients.join(', '),
      getter: g.getters.join(', '),
      getDates: [...new Set(g.getDates)].sort().reverse(),
      getDate: [...new Set(g.getDates)].sort().reverse().join(', '),
    }));
  }, [appoData]);

  // 架電可能リストのIDリスト
  const activeListIds = React.useMemo(
    () => callListData.filter(l => l.status === '架電可能' && !l.is_archived).map(l => l._supaId).filter(Boolean),
    [callListData]
  );

  // マウント時＋activeListIds変更時にマッチ検索
  useEffect(() => {
    if (!activeListIds.length) { setMatchMap({}); return; }
    const allNames = [...new Set(pastItems.map(p => p.company))];
    setLoading(true);
    fetchMatchingListItemsByCompanyNames(allNames, activeListIds)
      .then(({ data }) => setMatchMap(data || {}))
      .catch(() => setMatchMap({}))
      .finally(() => setLoading(false));
  }, [activeListIds, pastItems]);

  // 該当企業のクライアント群に含まれないリストのみを返すヘルパー
  const getOtherListMatches = (p) => {
    const matches = matchMap[p.company] || [];
    return matches.filter(m => {
      const list = callListData.find(l => l._supaId === m.listId);
      return list && !list.is_archived && !p.clients.includes(list.company);
    });
  };

  const filtered = pastItems.filter(p => {
    if (sourceFilter === 'spanavi' && p.clients.length === 0) return false;
    if (sourceFilter === 'excel' && p.clients.length > 0) return false;
    if (pastSearch && !p.company.includes(pastSearch) && !p.client.includes(pastSearch)) return false;
    if (listFilter !== 'all') {
      const hasOther = getOtherListMatches(p).length > 0;
      if (listFilter === 'matched' && !hasOther) return false;
      if (listFilter === 'unmatched' && hasOther) return false;
    }
    return true;
  });

  const matchCount = filtered.filter(p => getOtherListMatches(p).length > 0).length;

  const handleNavigate = (companyName, listId, itemId) => {
    const list = callListData.find(l => l._supaId === listId);
    if (!list || !setCallFlowScreen) return;
    setCallFlowScreen({ list, defaultItemId: itemId, defaultListMode: false });
  };

  return (
    <>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
        padding: isMobile ? '10px 12px' : '14px 18px', background: '#fff', borderRadius: 4, border: '1px solid #E5E7EB',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0D2247' }}>過去アポ一覧</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{filtered.length}件</span>
          {matchCount > 0 && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: '#DBEAFE', color: '#1E40AF', fontWeight: 600 }}>
              {matchCount}件がリストに存在
            </span>
          )}
          {loading && <span style={{ fontSize: 10, color: '#9CA3AF' }}>照合中...</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={pastSearch} onChange={e => setPastSearch(e.target.value)} placeholder="企業名で検索..."
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none', width: 200 }} />
          {[['all', '全て'], ['spanavi', 'Spanavi'], ['excel', '過去データ']].map(([k, l]) => (
            <button key={k} onClick={() => setSourceFilter(k)} style={{
              padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Noto Sans JP'",
              background: sourceFilter === k ? '#0D2247' : '#fff',
              color: sourceFilter === k ? '#fff' : '#6B7280',
              border: '1px solid ' + (sourceFilter === k ? '#0D2247' : '#E5E7EB'),
            }}>{l}</button>
          ))}
          <span style={{ width: 1, height: 16, background: '#E5E7EB' }} />
          {[['all', '全リスト'], ['matched', 'リスト有'], ['unmatched', 'リスト無']].map(([k, l]) => (
            <button key={k} onClick={() => setListFilter(k)} style={{
              padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'Noto Sans JP'",
              background: listFilter === k ? '#1E40AF' : '#fff',
              color: listFilter === k ? '#fff' : '#6B7280',
              border: '1px solid ' + (listFilter === k ? '#1E40AF' : '#E5E7EB'),
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 4, overflowX: 'auto', overflowY: 'hidden', border: '1px solid #E5E7EB' }}>
        <div style={{ minWidth: pastMinW }}>
        <div style={{
          display: 'grid', gridTemplateColumns: pastGrid,
          padding: isMobile ? '6px 4px 6px 10px' : '8px 6px 8px 16px', columnGap: 2, background: '#0D2247', fontSize: isMobile ? 10 : 11, fontWeight: 600, color: '#fff',
          borderBottom: '1px solid #E5E7EB', alignItems: 'center',
        }}>
          {[
            { label: '企業名' },
            { label: 'アポ供給先クライアント' },
            { label: '担当者' },
            { label: '取得日' },
            { label: '収録先の別リスト（架電可能分）' },
          ].map(({ label }, i) => (
            <span key={label}
              onContextMenu={e => pastCtxMenu(e, i)}
              style={{ position: 'relative', textAlign: pastCols[i]?.align || 'left', whiteSpace: 'nowrap', userSelect: 'none', minWidth: 0 }}>
              {label}
              <ColumnResizeHandle colIndex={i} onResizeStart={pastResize} />
            </span>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>データがありません</div>
        ) : filtered.map((p, i) => {
          const otherMatches = getOtherListMatches(p);
          return (
            <div key={p.company + '-' + i} style={{
              display: 'grid', gridTemplateColumns: pastGrid,
              padding: '8px 6px 8px 16px', columnGap: 2, fontSize: 11, alignItems: 'center',
              borderBottom: '1px solid #E5E7EB',
              background: otherMatches.length > 0 ? '#F0F7FF' : (i % 2 === 0 ? '#fff' : '#F8F9FA'),
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#EAF4FF'}
            onMouseLeave={e => e.currentTarget.style.background = otherMatches.length > 0 ? '#F0F7FF' : (i % 2 === 0 ? '#fff' : '#F8F9FA')}>
              <span style={{ fontWeight: 600, color: '#0D2247', textAlign: pastCols[0]?.align || 'left' }}>{p.company}</span>
              <span style={{ fontSize: 10, color: '#6B7280', textAlign: pastCols[1]?.align || 'left' }}>{p.client || '-'}</span>
              <span style={{ fontSize: 10, color: '#6B7280', textAlign: pastCols[2]?.align || 'center' }}>{p.getter || '-'}</span>
              <span style={{ fontSize: 10, color: '#6B7280', fontFamily: "'JetBrains Mono'", textAlign: pastCols[3]?.align || 'right' }}>{p.getDates.length > 0 ? p.getDates.map(d => d.slice(5)).join(', ') : '-'}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: pastCols[4]?.align === 'right' ? 'flex-end' : pastCols[4]?.align === 'center' ? 'center' : 'flex-start' }}>
                {otherMatches.length > 0 ? otherMatches.map((m, mi) => {
                  const list = callListData.find(l => l._supaId === m.listId);
                  if (!list) return null;
                  return (
                    <button key={mi} onClick={() => handleNavigate(p.company, m.listId, m.itemId)}
                      title={`${list.company} / ${list.type}${list.industry ? ' / ' + list.industry : ''} → 集中ページへ`}
                      style={{
                        padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                        background: '#1E40AF', color: '#fff', border: 'none',
                        fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1E3A6E'}
                      onMouseLeave={e => e.currentTarget.style.background = '#1E40AF'}>
                      {list.company?.replace(/^株式会社/, '(株)').slice(0, 8)} / {list.industry || list.type}
                    </button>
                  );
                }) : (
                  <span style={{ fontSize: 10, color: '#D1D5DB' }}>-</span>
                )}
              </span>
            </div>
          );
        })}
        </div>
      </div>
      {pastCtx.visible && (
        <AlignmentContextMenu
          x={pastCtx.x} y={pastCtx.y}
          currentAlign={pastCols[pastCtx.colIndex]?.align || 'left'}
          onSelect={align => pastSetAlign(pastCtx.colIndex, align)}
          onReset={pastReset}
          onClose={pastClose}
        />
      )}
    </>
  );
}

// ============================================================
// Members View (Employee Directory)
// ============================================================
export function MembersView({ members, setMembers, onDataRefetch }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [addForm, setAddForm] = useState(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const filtered = members.filter(m => {
    if (search && !m.name.includes(search) && !m.university.includes(search)) return false;
    return true;
  });

  // Group by team
  const teamOrder = ["代表取締役", "営業統括", "成尾", "高橋", "クライアント開拓"];
  const grouped = {};
  filtered.forEach(m => {
    const t = m.team || (m.role === "営業統括" ? "営業統括" : null);
    if (!t) return; // チーム未設定は非表示
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(m);
  });
  const sortedTeams = Object.keys(grouped).sort((a, b) => {
    const ai = teamOrder.indexOf(a); const bi = teamOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const formatCurrency = (val) => {
    if (!val) return "-";
    return "¥" + Math.round(val).toLocaleString('ja-JP');
  };

  const MEMBER_COLS_BASE = [
    { key: 'no', width: 36, align: 'center' },
    { key: 'name', width: 120, align: 'left' },
    { key: 'university', width: 180, align: 'left' },
    { key: 'year', width: 45, align: 'center' },
    { key: 'role', width: 100, align: 'center' },
    { key: 'rank', width: 80, align: 'center' },
    { key: 'sales', width: 110, align: 'right' },
    { key: 'rate', width: 110, align: 'right' },
    { key: 'joinDate', width: 100, align: 'center' },
  ];
  const MEMBER_COLS_EDIT = [...MEMBER_COLS_BASE, { key: 'edit', width: 50, align: 'center' }];
  const { columns: memCols, gridTemplateColumns: memGrid, contentMinWidth: memMinW, onResizeStart: memResize, onHeaderContextMenu: memCtxMenu, contextMenu: memCtx, setAlign: memSetAlign, resetAll: memReset, closeMenu: memClose } = useColumnConfig(setMembers ? 'membersEdit' : 'members', setMembers ? MEMBER_COLS_EDIT : MEMBER_COLS_BASE);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Employee Roster</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>従業員名簿</div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
        padding: isMobile ? "10px 12px" : "14px 18px", background: '#fff', borderRadius: 4,
        border: "1px solid #E5E7EB",
        overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0D2247' }}>メンバー一覧</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{members.length}名</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="名前・大学で検索..."
            style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", width: 180 }} />
          {setMembers && <button
            onClick={() => setAddForm({ name: "", university: "", year: 1, team: "成尾", role: "メンバー", rank: "トレーニー", rate: 0.22, referrerName: "" })}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "none", fontSize: 11, fontWeight: 600,
              background: "#0D2247",
              color: '#fff', cursor: "pointer", fontFamily: "'Noto Sans JP'",
            }}>+ 追加</button>}
          {setMembers && <button
            disabled={syncLoading}
            onClick={async () => {
              setSyncLoading(true);
              setSyncResult(null);
              const { data, error } = await invokeSyncZoomUsers();
              setSyncLoading(false);
              if (error || !data) {
                setSyncResult({ error: error?.message || '通信エラーが発生しました' });
              } else {
                setSyncResult(data);
                // ページのmembersステートを更新（zoom_user_idをsetMembersで反映）
                if (data.updated?.length > 0) {
                  setMembers(prev => prev.map(m => {
                    const matched = data._updatedMap?.[m._supaId];
                    return matched ? { ...m, zoomUserId: matched } : m;
                  }));
                }
              }
            }}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "none", fontSize: 11, fontWeight: 600,
              background: syncLoading ? "#9CA3AF" : "#1a7f5a",
              color: '#fff', cursor: syncLoading ? "not-allowed" : "pointer",
              fontFamily: "'Noto Sans JP'", whiteSpace: "nowrap",
            }}>
            {syncLoading ? "同期中..." : "Zoom ID同期"}
          </button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sortedTeams.map(team => (
          <div key={team} style={{
            background: '#fff', borderRadius: 4, overflowX: "auto", overflowY: "hidden",
            border: "1px solid #E5E7EB",
          }}>
            <div style={{ minWidth: memMinW }}>
            <div style={{
              padding: "10px 16px", background: "#0D2247",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{(team === "営業統括" || team === "代表取締役") ? team : team + "チーム"}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{grouped[team].length}名</span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: memGrid,
              padding: "8px 16px", background: "#0D2247", borderBottom: "1px solid #0D2247",
              fontSize: 11, fontWeight: 600, color: '#fff',
            }}>
              {['No', '氏名', '大学名', '学年', '役職', 'ランク', '累計売上', 'インセンティブ率', '入社日', ...(setMembers ? [''] : [])].map((label, i) => (
                <span key={i} onContextMenu={e => memCtxMenu(e, i)} style={{ textAlign: memCols[i]?.align || 'left', position: 'relative', userSelect: 'none' }}>
                  {label}
                  <ColumnResizeHandle colIndex={i} onResizeStart={memResize} />
                </span>
              ))}
            </div>
            {grouped[team].sort((a, b) => {
              const order = { "チームリーダー": 0, "副リーダー": 1, "営業統括": 2, "メンバー": 3, "": 4 };
              return (order[a.role] ?? 4) - (order[b.role] ?? 4);
            }).map((m, idx) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: memGrid,
                padding: "8px 16px", fontSize: 11, alignItems: "center",
                borderBottom: "1px solid #E5E7EB",
                background: idx % 2 === 0 ? '#fff' : '#F8F9FA',
              }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#9CA3AF', textAlign: memCols[0]?.align }}>{idx + 1}</span>
                <span style={{ fontWeight: 600, color: '#0D2247', textAlign: memCols[1]?.align }}>{m.name}</span>
                <span style={{ color: '#6B7280', fontSize: 10, textAlign: memCols[2]?.align }}>{m.university}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", color: '#9CA3AF', textAlign: memCols[3]?.align }}>{m.year}</span>
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, textAlign: memCols[4]?.align,
                  background: m.role === "チームリーダー" ? '#0D224715' : m.role === "副リーダー" ? '#1E40AF15' : m.role === "営業統括" ? '#05966915' : 'transparent',
                  color: m.role === "チームリーダー" ? '#0D2247' : m.role === "副リーダー" ? '#1E40AF' : m.role === "営業統括" ? '#059669' : '#9CA3AF',
                  fontWeight: 600,
                }}>{m.role || "メンバー"}</span>
                <span style={{ fontSize: 10, textAlign: memCols[5]?.align, color: '#6B7280' }}>{m.rank || "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, fontWeight: 500, textAlign: memCols[6]?.align, fontVariantNumeric: 'tabular-nums', color: m.totalSales > 0 ? '#0D2247' : '#9CA3AF' }}>{formatCurrency(m.totalSales)}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, textAlign: memCols[7]?.align, fontVariantNumeric: 'tabular-nums', color: m.rate > 0 ? '#059669' : '#9CA3AF' }}>{m.rate > 0 ? (m.rate * 100).toFixed(0) + "%" : "-"}</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, textAlign: memCols[8]?.align, color: C.textLight }}>{(m.joinDate || '').slice(2)}</span>
                {setMembers && <span style={{ textAlign: memCols[9]?.align }}><button onClick={() => setEditForm({ ...m })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2 }}>&#9998;</button></span>}
              </div>
            ))}
            </div>
          </div>
        ))}
      </div>

      {memCtx.visible && (
        <AlignmentContextMenu
          x={memCtx.x} y={memCtx.y}
          currentAlign={memCols[memCtx.colIndex]?.align || 'left'}
          onSelect={align => memSetAlign(memCtx.colIndex, align)}
          onReset={memReset}
          onClose={memClose}
        />
      )}

      {/* Zoom ID Sync Result Modal */}
      {syncResult && (
        <div
          onClick={() => setSyncResult(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, width: 480, maxWidth: '95vw', maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, #1a7f5a, #2da57a)", borderRadius: "12px 12px 0 0", color: C.white }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Zoom ID同期結果</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {syncResult.error ? (
                <div style={{ color: "#c0392b", fontSize: 13, padding: "12px 16px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                  エラー：{syncResult.error}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    <div style={{ padding: "10px 14px", background: "#f0faf5", borderRadius: 8, border: "1px solid #a8dfc5" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a7f5a" }}>
                        更新成功：{syncResult.updated?.length ?? 0}名
                      </span>
                      {syncResult.updated?.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#2d6a4f", lineHeight: 1.8 }}>
                          {syncResult.updated.join('　/　')}
                        </div>
                      )}
                    </div>
                    {syncResult.skipped?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid " + C.borderLight }}>
                        <span style={{ fontSize: 12, color: C.textMid }}>
                          ✔ 登録済みスキップ：{syncResult.skipped.length}名
                        </span>
                      </div>
                    )}
                    {syncResult.unmatched?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fff8f0", borderRadius: 8, border: "1px solid #f5c99a" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#b05e00" }}>
                          ✗ 未マッチ：{syncResult.unmatched.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#7a4200", lineHeight: 1.8 }}>
                          {syncResult.unmatched.map(u => (
                            <div key={u.email}>{u.name}（{u.email}）</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {syncResult.errors?.length > 0 && (
                      <div style={{ padding: "10px 14px", background: "#fdf0ef", borderRadius: 8, border: "1px solid #e8b4b0" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#c0392b" }}>
                          更新エラー：{syncResult.errors.length}名
                        </span>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#7b241c" }}>{syncResult.errors.join('、')}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.textLight, textAlign: "center" }}>クリックで閉じる</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{editForm.name} を編集</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={editForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={editForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={editForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={editForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={editForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>累計売上 (¥)</label><input type="number" value={editForm.totalSales || 0} onChange={e => { const s = Number(e.target.value); const { rank, rate } = calcRankAndRate(s); setEditForm(p => ({ ...p, totalSales: s, rank, rate })); }} style={inputStyle} /></div>
                  <div><label style={labelStyle}>ランク <span style={{ fontWeight: 400, color: C.textLight }}>(自動)</span></label><input value={editForm.rank || 'トレーニー'} readOnly style={{ ...inputStyle, background: '#f0f4f8', color: C.navy, fontWeight: 600 }} /></div>
                  <div><label style={labelStyle}>内定先</label><input value={editForm.offer || ""} onChange={e => u("offer", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>インセンティブ率 <span style={{ fontWeight: 400, color: C.textLight }}>(自動)</span></label><input value={((editForm.rate || 0) * 100).toFixed(0) + '%'} readOnly style={{ ...inputStyle, background: '#f0f4f8', color: C.navy, fontWeight: 600 }} /></div>
                  <div><label style={labelStyle}>入社日</label><input type="date" value={editForm.joinDate || ""} onChange={e => u("joinDate", e.target.value)} style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>稼働開始日</label>
                    <input type="date" value={editForm.operationStartDate || ""} onChange={e => u("operationStartDate", e.target.value)} style={inputStyle} />
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={editForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.filter(m => m.id !== editForm.id).map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ ...labelStyle, color: C.gold }}>Zoom User ID <span style={{ fontWeight: 400, color: C.textLight }}>（管理者専用）</span></label>
                    <input value={editForm.zoomUserId || ""} onChange={e => u("zoomUserId", e.target.value)} style={inputStyle} placeholder="例: lXsqw8miT5iHmX7cKz0R5w" />
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {deleteError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>削除エラー: {deleteError}</div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={async () => {
                  if (!editForm._supaId) { setDeleteError('IDが見つかりません。ページを再読み込みしてください。'); return; }
                  if (!window.confirm(`「${editForm.name}」を削除しますか？`)) return;
                  setDeleteSaving(true);
                  setDeleteError(null);
                  const error = await deleteMember(editForm._supaId);
                  setDeleteSaving(false);
                  if (error) { setDeleteError(error.message || 'DBからの削除に失敗しました。'); return; }
                  setMembers(prev => prev.filter(x => x.id !== editForm.id));
                  setEditForm(null);
                  setDeleteError(null);
                  if (onDataRefetch) onDataRefetch();
                }} disabled={deleteSaving} style={{
                  padding: "8px 16px", borderRadius: 6, border: "1px solid #e5383530",
                  background: C.white, cursor: deleteSaving ? "default" : "pointer", fontSize: 11, fontWeight: 600, color: "#e53835", fontFamily: "'Noto Sans JP'",
                }}>{deleteSaving ? '削除中...' : '削除'}</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setEditForm(null); setDeleteError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!editForm.name.trim()) return;
                    if (editForm._supaId) {
                      const error = await updateMember(editForm._supaId, editForm);
                      if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
                      await updateMemberReward(editForm._supaId, { cumulativeSales: editForm.totalSales || 0, rank: editForm.rank, incentiveRate: editForm.rate });
                    }
                    setMembers(prev => prev.map(m => m.id === editForm.id ? { ...m, ...editForm } : m));
                    setEditForm(null);
                  }} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>保存</button>
                </div>
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Member Modal */}
      {addForm && setMembers && (() => {
        const inputStyle = {
          width: "100%", padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.border,
          fontSize: 11, fontFamily: "'Noto Sans JP'", outline: "none", background: C.offWhite,
        };
        const labelStyle = { fontSize: 10, fontWeight: 600, color: C.navy, marginBottom: 2, display: "block" };
        const u = (k, v) => setAddForm(p => ({ ...p, [k]: v }));
        return (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: C.white, borderRadius: 12, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ padding: "14px 20px", background: "linear-gradient(135deg, " + C.navyDeep + ", " + C.navy + ")", borderRadius: "12px 12px 0 0", color: C.white }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>従業員を追加</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>氏名 *</label><input value={addForm.name} onChange={e => u("name", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>大学名</label><input value={addForm.university || ""} onChange={e => u("university", e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>学年</label><input type="number" value={addForm.year} onChange={e => u("year", Number(e.target.value))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>チーム</label>
                    <select value={addForm.team} onChange={e => u("team", e.target.value)} style={inputStyle}>
                      <option value="成尾">成尾</option><option value="高橋">高橋</option><option value="クライアント開拓">クライアント開拓</option><option value="">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>役職</label>
                    <select value={addForm.role} onChange={e => u("role", e.target.value)} style={inputStyle}>
                      <option value="メンバー">メンバー</option><option value="副リーダー">副リーダー</option><option value="チームリーダー">チームリーダー</option><option value="営業統括">営業統括</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>ランク</label>
                    <select value={addForm.rank} onChange={e => u("rank", e.target.value)} style={inputStyle}>
                      <option value="トレーニー">トレーニー</option><option value="プレイヤー">プレイヤー</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>紹介者</label>
                    <select value={addForm.referrerName || ""} onChange={e => u("referrerName", e.target.value)} style={inputStyle}>
                      <option value="">（なし）</option>
                      {members.map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.borderLight }}>
                {addError && <div style={{ fontSize: 11, color: "#e53835", marginBottom: 8, padding: "6px 10px", background: "#fde8e8", borderRadius: 4 }}>エラー: {addError}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { setAddForm(null); setAddError(null); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.border, background: C.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMid, fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
                  <button onClick={async () => {
                    if (!addForm.name.trim()) return;
                    setAddSaving(true);
                    setAddError(null);
                    const today = new Date().toISOString().slice(0, 10);
                    const { result, error } = await insertMember(addForm);
                    setAddSaving(false);
                    if (error || !result) {
                      setAddError(error?.message || 'DBへの保存に失敗しました。RLSポリシーを確認してください。');
                      return;
                    }
                    setMembers(prev => [...prev, {
                      ...addForm,
                      id: result.id,
                      _supaId: result.id,
                      offer: addForm.offer || "",
                      totalSales: 0,
                      joinDate: today,
                    }]);
                    setAddForm(null);
                    setAddError(null);
                    if (onDataRefetch) onDataRefetch();
                  }} disabled={!addForm.name.trim() || addSaving} style={{
                    padding: "8px 24px", borderRadius: 6, border: "none",
                    background: addForm.name.trim() && !addSaving ? "linear-gradient(135deg, " + C.navy + ", " + C.navyLight + ")" : C.border,
                    cursor: addForm.name.trim() && !addSaving ? "pointer" : "default", fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Noto Sans JP'",
                  }}>{addSaving ? '保存中...' : '追加'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Stats View (Performance Dashboard)
// ============================================================
// StatsView は src/components/views/StatsView.jsx に移動済み
