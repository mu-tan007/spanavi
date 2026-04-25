import { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { updatePreCheckResult, fetchCallListItemByAppo, invokeSendAppoReport, invokeSendEmail } from '../../lib/supabaseWrite';
import { Badge } from '../common/Badge';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import { useIsMobile } from '../../hooks/useIsMobile';
import PageHeader from '../common/PageHeader';

export function PreCheckModal({ appo, onSave, onCancel, onNavigate }) {
  const PRE_CHECK_OPTIONS = ['確認完了', '確認中', 'リスケ', 'キャンセル'];
  const [form, setForm] = useState({
    preCheckStatus: appo.preCheckStatus || '',
    rescheduleStatus: appo.rescheduledAt ? '日時確定' : '調整中',
    rescheduledAt: appo.rescheduledAt || '',
    cancelReason: appo.cancelReason || '',
    preCheckMemo: appo.preCheckMemo || '',
  });
  const [saving, setSaving] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const handleNavigate = async () => {
    if (navigating || !onNavigate) return;
    setNavigating(true);
    try {
      const { data } = await fetchCallListItemByAppo(appo.company, displayPhone, appo.list_id, appo.item_id);
      if (!data?.list_id) { alert('架電リストが見つかりませんでした'); return; }
      onNavigate({ listId: data.list_id, itemId: data.id });
    } catch (e) {
      console.error('[handleNavigate]', e);
      alert('遷移に失敗しました');
    } finally {
      setNavigating(false);
    }
  };
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.preCheckStatus) { alert('事前確認結果を選択してください'); return; }
    setSaving(true);
    let newStatus = appo.status;
    if (form.preCheckStatus === '確認完了') newStatus = '事前確認済';
    else if (form.preCheckStatus === 'リスケ') newStatus = 'リスケ中';
    else if (form.preCheckStatus === 'キャンセル') newStatus = 'キャンセル';
    const rescheduledAt = (form.preCheckStatus === 'リスケ' && form.rescheduleStatus === '日時確定')
      ? form.rescheduledAt || null : null;
    await onSave({
      preCheckStatus: form.preCheckStatus,
      preCheckMemo: form.preCheckMemo,
      rescheduledAt,
      rescheduleStatus: form.preCheckStatus === 'リスケ' ? form.rescheduleStatus : '',
      cancelReason: form.preCheckStatus === 'キャンセル' ? form.cancelReason : '',
      status: newStatus,
    });
    setSaving(false);
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + C.border, fontSize: 13, color: C.textDark, background: C.white, outline: 'none', boxSizing: 'border-box', fontFamily: "'Noto Sans JP'" };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: C.textMid, display: 'block', marginBottom: 4 };

  const appoMonth = appo.meetDate ? (parseInt(appo.meetDate.slice(5, 7), 10) + '月') : '';
  // noteに埋め込まれた電話番号を抽出（例: "電話番号：03-xxxx-xxxx"）
  const phoneFromNote = (() => {
    if (!appo.note) return '';
    const m = appo.note.match(/電話番号：([^\n]+)/);
    return m ? m[1].trim() : '';
  })();
  const displayPhone = appo.phone || phoneFromNote;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: 560, maxWidth: '95vw', maxHeight: '90vh', boxShadow: '0 8px 40px rgba(26,58,92,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── ヘッダー ── */}
        <div style={{ background: '#0D2247', padding: '12px 24px', color: '#fff', fontWeight: 600, fontSize: 15, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>事前確認入力</div>
          <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{appo.company} ／ {appo.client}</div>
        </div>

        {/* ── スクロール可能なコンテンツエリア ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── アポ取得報告セクション ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0D2247' }}>{appo.company}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 10 }}>
                {displayPhone && (
                  <a href={'tel:' + displayPhone} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: '#fff', background: '#0D2247',
                    borderRadius: 4, padding: '5px 12px', textDecoration: 'none',
                    fontFamily: "'JetBrains Mono'", fontWeight: 600,
                  }}>{displayPhone}</a>
                )}
                {onNavigate && (
                  <button onClick={handleNavigate} disabled={navigating} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '5px 12px',
                    borderRadius: 4, border: '1px solid #0D2247', background: '#fff',
                    fontSize: 11, fontWeight: 600, color: '#0D2247', cursor: navigating ? 'default' : 'pointer',
                    opacity: navigating ? 0.6 : 1, fontFamily: "'Noto Sans JP'",
                  }}>{navigating ? '検索中...' : '架電ページへ'}</button>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'クライアント', value: appo.client },
                { label: '取得者', value: appo.getter },
                { label: '取得日', value: appo.getDate },
                { label: '面談日', value: appo.meetDate },
                { label: 'ステータス', value: appo.status },
                { label: '月', value: appoMonth },
              ].map((item, i) => (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 4, background: '#F8F9FA', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247' }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: 4, background: '#F8F9FA', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{appo.sales > 0 ? '¥' + appo.sales.toLocaleString() : '—'}</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 4, background: '#F8F9FA', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#1E40AF', fontFamily: "'JetBrains Mono'" }}>{appo.reward > 0 ? '¥' + appo.reward.toLocaleString() : '—'}</div>
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 4, background: '#F8F9FA', border: '1px solid #E5E7EB', borderLeft: '3px solid #0D2247', marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0D2247', marginBottom: 6 }}>アポ取得報告</div>
              {appo.note
                ? <div style={{ fontSize: 11, color: C.textDark, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{appo.note}</div>
                : <div style={{ fontSize: 11, color: C.textLight }}>アポ取得報告が登録されていません</div>
              }
            </div>
            {(() => {
              const m = (appo.note || '').match(/録音URL[：:]\s*(https?:\/\/\S+)/);
              const recUrl = m?.[1]?.trim() || '';
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ padding: '5px 8px', borderRadius: 4, background: '#F8F9FA',
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#0D2247', whiteSpace: 'nowrap' }}>録音</span>
                    {recUrl
                      ? <button onClick={() => setShowRecording(v => !v)}
                          title={showRecording ? "閉じる" : "録音を再生"}
                          style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                            padding: 0, lineHeight: 1, color: showRecording ? C.red : 'inherit' }}>録音</button>
                      : <span style={{ fontSize: 11, color: C.textLight }}>録音なし</span>
                    }
                  </div>
                  {showRecording && recUrl && (
                    <InlineAudioPlayer url={recUrl} onClose={() => setShowRecording(false)} />
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── 事前確認フォーム ── */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>事前確認結果 <span style={{ color: C.red }}>*</span></label>
              <select value={form.preCheckStatus} onChange={e => u('preCheckStatus', e.target.value)} style={inputStyle}>
                <option value=''>選択してください</option>
                {PRE_CHECK_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {form.preCheckStatus === 'リスケ' && (
              <div style={{ background: '#FFF8E1', borderRadius: 4, padding: '12px 14px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>状況</label>
                  <select value={form.rescheduleStatus} onChange={e => u('rescheduleStatus', e.target.value)} style={inputStyle}>
                    <option value='調整中'>調整中</option>
                    <option value='日時確定'>日時確定</option>
                  </select>
                </div>
                {form.rescheduleStatus === '日時確定' && (
                  <div>
                    <label style={labelStyle}>リスケ先日時</label>
                    <input type='datetime-local' value={form.rescheduledAt} onChange={e => u('rescheduledAt', e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>
            )}
            {form.preCheckStatus === 'キャンセル' && (
              <div style={{ background: '#FFF5F5', borderRadius: 4, padding: '12px 14px', border: '1px solid #E5E7EB' }}>
                <label style={labelStyle}>キャンセル理由</label>
                <input type='text' value={form.cancelReason} onChange={e => u('cancelReason', e.target.value)} placeholder='例：先方都合によりキャンセル' style={inputStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>メモ</label>
              <textarea value={form.preCheckMemo} onChange={e => u('preCheckMemo', e.target.value)} rows={3} placeholder='備考・引き継ぎ事項など' style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }} />
            </div>
          </div>
        </div>

        {/* ── ボタン ── */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #0D2247', background: '#fff', color: '#0D2247', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: saving ? C.border : '#0D2247', color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer', fontFamily: "'Noto Sans JP'" }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

const PRECHECK_SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

const PRECHECK_COLS = [
  { key: 'company', width: 280, align: 'left' },
  { key: 'client', width: 310, align: 'left' },
  { key: 'getter', width: 140, align: 'left' },
  { key: 'meetDate', width: 140, align: 'left' },
  { key: 'status', width: 130, align: 'left' },
];

const DAY_NAMES = ['日','月','火','水','木','金','土'];
const formatMeetDateTime = (appo) => {
  if (!appo.meetDate) return '';
  const d = new Date(appo.meetDate + 'T00:00:00');
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const day = DAY_NAMES[d.getDay()];
  const time = appo.meetTime || '';
  return `${m}月${dd}日（${day}）${time ? time + '～' : ''}`;
};

const buildPreCheckReport = (appo, contactName, resultType) => {
  const greeting = contactName || '';
  const dateTime = formatMeetDateTime(appo);
  const companyName = appo.company || '';

  if (resultType === 'リスケ') {
    return `${greeting}様\n\nお世話になっております。\nM&Aソーシングパートナーズの篠宮でございます。\n\n${dateTime} よりご予定を頂いておりました${companyName}様との面談ですが、先方のご都合によりリスケジュールとなりました。\n\n改めて日程が確定次第、ご連絡いたします。\n\nMASP 篠宮`;
  }
  if (resultType === 'キャンセル') {
    return `${greeting}様\n\nお世話になっております。\nM&Aソーシングパートナーズの篠宮でございます。\n\n${dateTime} よりご予定を頂いておりました${companyName}様との面談ですが、先方のご都合によりキャンセルとなりました。\n\n何卒ご了承くださいますようお願い申し上げます。\n\nMASP 篠宮`;
  }
  // 確認完了
  return `${greeting}様\n\nお世話になっております。\nM&Aソーシングパートナーズの篠宮でございます。\n\n${dateTime} よりご予定を頂いております、${companyName}様への事前確認が無事に完了いたしました。\n\n当日はご対応のほど、よろしくお願い申し上げます。\n\nMASP 篠宮`;
};

export default function PreCheckView({ appoData, setAppoData, setCallFlowScreen, callListData = [], clientData = [], contactsByClient = {} }) {
  const isMobile = useIsMobile();
  const [selectedAppo, setSelectedAppo] = useState(null);
  const [reportAppo, setReportAppo] = useState(null);
  const [reportResultType, setReportResultType] = useState('確認完了');
  const [reportBody, setReportBody] = useState('');
  const [reportStep, setReportStep] = useState('idle');
  const [reportError, setReportError] = useState('');
  const { columns, gridTemplateColumns, contentMinWidth, onResizeStart, onHeaderContextMenu, contextMenu, setAlign, resetAll, closeMenu } = useColumnConfig('preCheck', PRECHECK_COLS, { padding: 40 });

  const handlePreCheckNavigate = ({ listId, itemId }) => {
    setSelectedAppo(null);
    if (setCallFlowScreen) {
      const list = callListData.find(l => l._supaId === listId);
      setCallFlowScreen({ list: list || { _supaId: listId, id: listId }, defaultItemId: itemId, defaultListMode: false, singleItemMode: true });
    }
  };

  const handlePreCheckSave = async (saveData) => {
    if (!selectedAppo?._supaId) { alert('保存先が見つかりません'); return; }
    const error = await updatePreCheckResult(selectedAppo._supaId, saveData);
    if (error) { alert('保存に失敗しました: ' + (error.message || '不明なエラー')); return; }
    setAppoData(prev => prev.map(a =>
      a._supaId === selectedAppo._supaId
        ? { ...a, status: saveData.status, preCheckStatus: saveData.preCheckStatus, preCheckMemo: saveData.preCheckMemo, rescheduledAt: saveData.rescheduledAt, cancelReason: saveData.cancelReason }
        : a
    ));
    setSelectedAppo(null);
    // Slack通知（非同期・エラー無視）
    try {
      const appo = selectedAppo;
      let msg = `【事前確認結果】 *${appo.company}* ／ ${appo.client}\n`;
      msg += `・取得者：${appo.getter}\n`;
      msg += `・面談日：${appo.meetDate}\n`;
      msg += `・事前確認結果：${saveData.preCheckStatus}\n`;
      if (saveData.preCheckStatus === 'リスケ') {
        msg += `・状況：${saveData.rescheduleStatus || '調整中'}\n`;
        if (saveData.rescheduledAt) msg += `・リスケ先日時：${saveData.rescheduledAt.replace('T', ' ')}\n`;
      }
      if (saveData.preCheckStatus === 'キャンセル' && saveData.cancelReason) msg += `・キャンセル理由：${saveData.cancelReason}\n`;
      if (appo.note) msg += `・備考：${appo.note}\n`;
      if (saveData.preCheckMemo) msg += `・メモ：${saveData.preCheckMemo}\n`;
      fetch(PRECHECK_SLACK_WEBHOOK, { method: 'POST', body: JSON.stringify({ text: msg }) })
        .catch(e => console.error('[Slack] precheck notification error:', e));
    } catch (e) {
      console.error('[Slack] precheck notification error:', e);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const addBusinessDays = (start, days) => {
    const d = new Date(start);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  };

  const subtractBusinessDays = (target, days) => {
    const d = new Date(target);
    let sub = 0;
    while (sub < days) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) sub++;
    }
    return d;
  };

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  };

  const dayLabel = (d) => {
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return (d.getMonth() + 1) + "/" + d.getDate() + "（" + days[d.getDay()] + "）";
  };

  // Target dates: today, 1BD ahead, 2BD ahead
  const t0 = today;
  const t1 = addBusinessDays(today, 1);
  const t2 = addBusinessDays(today, 2);

  // Filter: status === "アポ取得" AND meetDate is today/1BD/2BD AND pre_check_status not resolved
  const targets = appoData.filter(a => {
    if (a.status !== "アポ取得") return false;
    if (['確認完了', 'リスケ', 'キャンセル'].includes(a.preCheckStatus)) return false;
    const md = a.meetDate;
    return md === toDateStr(t0) || md === toDateStr(t1) || md === toDateStr(t2);
  }).map(a => {
    const md = a.meetDate;
    let urgency = 0;
    let urgLabel = "";
    if (md === toDateStr(t0)) { urgency = 0; urgLabel = "当日"; }
    else if (md === toDateStr(t1)) { urgency = 1; urgLabel = "1営業日前"; }
    else { urgency = 2; urgLabel = "2営業日前"; }
    return { ...a, urgency, urgLabel };
  }).sort((a, b) => a.urgency - b.urgency);

  const groups = [
    { key: 0, label: "当日", date: t0, color: "#e53835", bgColor: "#e5383508", borderColor: "#e5383520", icon: "●" },
    { key: 1, label: "1営業日前", date: t1, color: "#D97706", bgColor: "#D9770608", borderColor: "#D9770620", icon: "●" },
    { key: 2, label: "2営業日前", date: t2, color: "#0D2247", bgColor: "#0D224706", borderColor: "#0D224715", icon: "●" },
  ];

  const totalCount = targets.length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <PageHeader
        eyebrow="Sourcing · Pre-Check"
        title="Pre-Check"
        description="アポ前のヒアリング管理"
        style={{ marginBottom: 24 }}
      />

      {/* Summary */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: '#fff', borderRadius: 4, padding: isMobile ? "10px 12px" : "14px 20px", marginBottom: 16,
        border: "1px solid #E5E7EB",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0D2247' }}>事前確認</div>
            <div style={{ fontSize: 10, color: C.textLight }}>ステータス「アポ取得」で面談が近いアポイント</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {groups.map(g => {
            const cnt = targets.filter(t => t.urgency === g.key).length;
            return (
              <div key={g.key} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600 }}><span style={{ color: g.color }}>{g.icon}</span> {g.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: g.color, fontFamily: "'JetBrains Mono'" }}>{cnt}</div>
              </div>
            );
          })}
          <div style={{ textAlign: "center", borderLeft: "1px solid #E5E7EB", paddingLeft: 16 }}>
            <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600 }}>合計</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0D2247', fontFamily: "'JetBrains Mono'" }}>{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map(g => {
        const items = targets.filter(t => t.urgency === g.key);
        if (items.length === 0) return (
          <div key={g.key} style={{
            background: '#fff', borderRadius: 4, padding: "16px 20px", marginBottom: 12,
            border: "1px solid #E5E7EB", opacity: 0.6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: g.color }}>{g.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.label}</span>
              <span style={{ fontSize: 11, color: C.textLight }}>─ 面談日: {dayLabel(g.date)}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.textLight }}>対象なし</span>
            </div>
          </div>
        );
        return (
          <div key={g.key} style={{
            background: '#fff', borderRadius: 4, marginBottom: 12,
            border: "1px solid #E5E7EB", overflowX: "auto", overflowY: "hidden",
          }}>
            <div style={{ minWidth: contentMinWidth }}>
            {/* Group header */}
            <div style={{
              padding: isMobile ? "8px 12px" : "12px 20px", background: g.bgColor,
              borderBottom: "1px solid " + g.borderColor,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: g.color }}>{g.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 11, color: C.textMid }}>─ 面談日: {dayLabel(g.date)}</span>
              </div>
              <span style={{
                fontSize: 12, color: g.color,
                background: g.color + "1a", padding: "2px 8px", borderRadius: 4,
              }}>{items.length}件</span>
            </div>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns,
              padding: isMobile ? "6px 12px" : "8px 20px", background: '#0D2247', fontSize: isMobile ? 10 : 11, fontWeight: 600, color: '#fff',
              borderBottom: "1px solid #E5E7EB",
            }}>
              {['企業名', 'クライアント', '取得者', '面談日', '確認状況'].map((label, i) => (
                <span key={label} onContextMenu={e => onHeaderContextMenu(e, i)} style={{ position: 'relative', textAlign: columns[i].align, userSelect: 'none' }}>
                  {label}
                  <ColumnResizeHandle colIndex={i} onResizeStart={onResizeStart} />
                </span>
              ))}
            </div>
            {/* Rows */}
            {items.map((a, i) => {
              const pcs = a.preCheckStatus;
              const badgeColor = pcs === '確認完了' ? '#16A34A' : pcs === '確認中' ? '#D97706' : pcs === 'リスケ' ? '#D97706' : pcs === 'キャンセル' ? '#DC2626' : null;
              return (
                <div key={i}
                  onClick={() => setSelectedAppo(a)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FA'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8F9FA'; }}
                  style={{
                    display: "grid", gridTemplateColumns,
                    padding: isMobile ? "6px 12px" : "8px 20px", fontSize: isMobile ? 11 : 12, alignItems: "center",
                    borderBottom: "1px solid #E5E7EB",
                    borderLeft: "3px solid " + g.color,
                    background: i % 2 === 0 ? '#fff' : '#F8F9FA',
                    cursor: "pointer",
                  }}>
                  <span style={{ fontWeight: 600, color: '#0D2247', textAlign: columns[0].align }}>{a.company}</span>
                  <span style={{ color: C.textMid, fontSize: 11, textAlign: columns[1].align }}>{a.client}</span>
                  <span style={{ fontWeight: 600, color: C.textDark, textAlign: columns[2].align }}>{a.getter}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight, textAlign: columns[3].align }}>{a.meetDate.slice(5)}</span>
                  <span style={{ textAlign: columns[4].align, display: 'flex', alignItems: 'center', gap: 6, justifyContent: columns[4].align === 'right' ? 'flex-end' : 'flex-start' }}>
                    {badgeColor
                      ? <span style={{ fontSize: 12, color: badgeColor, background: badgeColor + '1a', borderRadius: 4, padding: '2px 8px' }}>{pcs}</span>
                      : <span style={{ fontSize: 12, color: C.textLight }}>未入力 →</span>
                    }
                    {['確認完了', 'リスケ', 'キャンセル'].includes(pcs) && (
                      <button onClick={e => {
                        e.stopPropagation();
                        const cl = clientData.find(c => c.company === a.client);
                        const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
                        const contactName = contacts[0]?.name || cl?.company || a.client;
                        setReportAppo(a);
                        setReportResultType(pcs);
                        setReportBody(buildPreCheckReport(a, contactName, pcs));
                        setReportStep('compose');
                        setReportError('');
                      }} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, border: 'none', background: '#0D2247', color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        報告
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        );
      })}

      {totalCount === 0 && (
        <div style={{
          background: '#fff', borderRadius: 4, padding: "40px 20px",
          border: "1px solid #E5E7EB", textAlign: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D2247', marginBottom: 4 }}>事前確認の対象はありません</div>
          <div style={{ fontSize: 11, color: C.textLight }}>直近の面談で「アポ取得」ステータスのものはすべて確認済みです</div>
        </div>
      )}
      {selectedAppo && (
        <PreCheckModal
          appo={selectedAppo}
          onSave={handlePreCheckSave}
          onCancel={() => setSelectedAppo(null)}
          onNavigate={setCallFlowScreen ? handlePreCheckNavigate : undefined}
        />
      )}
      {contextMenu.visible && (
        <AlignmentContextMenu
          x={contextMenu.x} y={contextMenu.y}
          currentAlign={columns[contextMenu.colIndex]?.align || 'left'}
          onSelect={align => setAlign(contextMenu.colIndex, align)}
          onReset={resetAll}
          onClose={closeMenu}
        />
      )}

      {/* 事前確認報告モーダル */}
      {reportAppo && reportStep !== 'idle' && (() => {
        const cl = clientData.find(c => c.company === reportAppo.client);
        const contactMethod = cl?.contact || 'メール';
        const isSlack = contactMethod === 'Slack';
        const isChatwork = contactMethod === 'Chatwork';
        const channelLabel = isSlack ? 'Slack' : isChatwork ? 'Chatwork' : 'メール';
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10010, fontFamily: "'Noto Sans JP'" }}
            onClick={() => { setReportAppo(null); setReportStep('idle'); }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 500, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
              onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0D2247' }}>事前確認報告を送信</h3>
              {reportStep === 'compose' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {['確認完了', 'リスケ', 'キャンセル'].map(rt => (
                    <button key={rt} onClick={() => {
                      setReportResultType(rt);
                      const cl2 = clientData.find(c => c.company === reportAppo.client);
                      const contacts2 = cl2 ? (contactsByClient[cl2._supaId] || []) : [];
                      const cn = contacts2[0]?.name || cl2?.company || reportAppo.client;
                      setReportBody(buildPreCheckReport(reportAppo, cn, rt));
                    }} style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
                      background: reportResultType === rt ? '#0D2247' : '#fff', color: reportResultType === rt ? '#fff' : '#0D2247',
                      border: '1px solid #0D2247' }}>
                      {rt}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                送信先: {channelLabel} {isSlack ? (cl?.slackWebhookUrl ? '（設定済み）' : <span style={{ color: '#DC2626' }}>（未設定）</span>) : isChatwork ? (cl?.chatworkRoomId ? '（設定済み）' : <span style={{ color: '#DC2626' }}>（未設定）</span>) : ''}
              </div>
              {reportStep === 'sent' ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', marginBottom: 8 }}>送信完了</div>
                  <button onClick={() => { setReportAppo(null); setReportStep('idle'); }}
                    style={{ padding: '8px 20px', borderRadius: 4, border: 'none', background: '#0D2247', color: '#fff', cursor: 'pointer', fontSize: 13 }}>閉じる</button>
                </div>
              ) : (
                <>
                  <textarea value={reportBody} onChange={e => setReportBody(e.target.value)}
                    style={{ width: '100%', minHeight: 200, padding: 10, fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 4, fontFamily: "'Noto Sans JP'", resize: 'vertical', boxSizing: 'border-box' }} />
                  {reportError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4 }}>{reportError}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button onClick={() => { setReportAppo(null); setReportStep('idle'); }}
                      style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 12 }}>キャンセル</button>
                    <button disabled={reportStep === 'sending'}
                      onClick={async () => {
                        setReportStep('sending'); setReportError('');
                        try {
                          let error = null;
                          if (isSlack) {
                            if (!cl?.slackWebhookUrl) { setReportError('Slack Webhook URLが未設定です'); setReportStep('compose'); return; }
                            ({ error } = await invokeSendAppoReport({ channel: 'slack', text: reportBody, webhook_url: cl.slackWebhookUrl }));
                          } else if (isChatwork) {
                            if (!cl?.chatworkRoomId) { setReportError('Chatwork ルームIDが未設定です'); setReportStep('compose'); return; }
                            ({ error } = await invokeSendAppoReport({ channel: 'chatwork', text: reportBody, room_id: cl.chatworkRoomId }));
                          } else {
                            const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
                            const toEmail = contacts[0]?.email || cl?.clientEmail || '';
                            if (!toEmail) { setReportError('メールアドレスが未設定です'); setReportStep('compose'); return; }
                            ({ error } = await invokeSendEmail({ to: toEmail, subject: '【事前確認完了のご報告】M&Aソーシングパートナーズ', body: reportBody }));
                          }
                          if (error) { setReportError(error); setReportStep('compose'); return; }
                          setReportStep('sent');
                        } catch (e) {
                          setReportError('送信に失敗しました'); setReportStep('compose');
                        }
                      }}
                      style={{ padding: '8px 20px', borderRadius: 4, border: 'none', background: reportStep === 'sending' ? '#6B7280' : '#0D2247', color: '#fff', cursor: reportStep === 'sending' ? 'default' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {reportStep === 'sending' ? '送信中...' : `${channelLabel}で送信`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
