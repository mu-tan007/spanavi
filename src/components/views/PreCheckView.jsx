import { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { CALL_RESULTS } from '../../constants/callResults';
import { updatePreCheckResult, fetchCallListItemByAppo } from '../../lib/supabaseWrite';
import { Badge } from '../common/Badge';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';

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
      const { data } = await fetchCallListItemByAppo(appo.company, displayPhone);
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
      <div style={{ background: C.white, borderRadius: 14, width: 560, maxWidth: '92vw', maxHeight: '90vh', boxShadow: '0 8px 40px rgba(26,58,92,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── ヘッダー ── */}
        <div style={{ background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', padding: '14px 20px', color: C.white, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>事前確認入力</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{appo.company} ／ {appo.client}</div>
        </div>

        {/* ── スクロール可能なコンテンツエリア ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── アポ取得報告セクション ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + C.borderLight }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{appo.company}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 10 }}>
                {displayPhone && (
                  <a href={'tel:' + displayPhone} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: C.white, background: C.navy,
                    borderRadius: 6, padding: '5px 12px', textDecoration: 'none',
                    fontFamily: "'JetBrains Mono'", fontWeight: 600,
                  }}>{displayPhone}</a>
                )}
                {onNavigate && (
                  <button onClick={handleNavigate} disabled={navigating} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '5px 12px',
                    borderRadius: 6, border: '1px solid ' + C.navy + '60', background: C.navy + '0a',
                    fontSize: 11, fontWeight: 600, color: C.navy, cursor: navigating ? 'default' : 'pointer',
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
                <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: C.offWhite, border: '1px solid ' + C.borderLight }}>
                  <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: C.navy + '08', border: '1px solid ' + C.navy + '15' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>当社売上</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{appo.sales > 0 ? '¥' + appo.sales.toLocaleString() : '—'}</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: C.gold + '08', border: '1px solid ' + C.gold + '15' }}>
                <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>インターン報酬</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, fontFamily: "'JetBrains Mono'" }}>{appo.reward > 0 ? '¥' + appo.reward.toLocaleString() : '—'}</div>
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: C.gold + '06', border: '1px solid ' + C.gold + '20', borderLeft: '3px solid ' + C.gold, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, marginBottom: 6 }}>アポ取得報告</div>
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
                  <div style={{ padding: '5px 8px', borderRadius: 5, background: C.offWhite,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>録音</span>
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
              <div style={{ background: '#fff8ed', borderRadius: 8, padding: '12px 14px', border: '1px solid #f0d080', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <div style={{ background: '#fff5f5', borderRadius: 8, padding: '12px 14px', border: '1px solid #ffd0d0' }}>
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid ' + C.borderLight, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid ' + C.border, background: C.white, color: C.textMid, fontSize: 12, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: saving ? C.border : 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', color: C.white, fontSize: 12, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontFamily: "'Noto Sans JP'" }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

const PRECHECK_SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';

export default function PreCheckView({ appoData, setAppoData, setCallFlowScreen }) {
  const [selectedAppo, setSelectedAppo] = useState(null);

  const handlePreCheckNavigate = ({ listId, itemId }) => {
    setSelectedAppo(null);
    if (setCallFlowScreen) {
      setCallFlowScreen({ list: { _supaId: listId, id: listId }, defaultItemId: itemId, defaultListMode: false });
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
    { key: 1, label: "1営業日前", date: t1, color: C.gold, bgColor: C.gold + "08", borderColor: C.gold + "20", icon: "●" },
    { key: 2, label: "2営業日前", date: t2, color: C.navy, bgColor: C.navy + "06", borderColor: C.navy + "15", icon: "●" },
  ];

  const totalCount = targets.length;

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Summary */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.white, borderRadius: 10, padding: "14px 20px", marginBottom: 16,
        border: "1px solid " + C.borderLight, boxShadow: "0 1px 4px rgba(26,58,92,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>事前確認</div>
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
          <div style={{ textAlign: "center", borderLeft: "1px solid " + C.borderLight, paddingLeft: 16 }}>
            <div style={{ fontSize: 9, color: C.textLight, fontWeight: 600 }}>合計</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.navy, fontFamily: "'JetBrains Mono'" }}>{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map(g => {
        const items = targets.filter(t => t.urgency === g.key);
        if (items.length === 0) return (
          <div key={g.key} style={{
            background: C.white, borderRadius: 10, padding: "16px 20px", marginBottom: 12,
            border: "1px solid " + C.borderLight, opacity: 0.6,
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
            background: C.white, borderRadius: 10, marginBottom: 12,
            border: "1px solid " + C.borderLight, overflow: "hidden",
          }}>
            {/* Group header */}
            <div style={{
              padding: "12px 20px", background: g.bgColor,
              borderBottom: "1px solid " + g.borderColor,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: g.color }}>{g.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 11, color: C.textMid }}>─ 面談日: {dayLabel(g.date)}</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: g.color,
                background: g.color + "12", padding: "2px 10px", borderRadius: 10,
              }}>{items.length}件</span>
            </div>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 1fr",
              padding: "6px 20px", background: C.offWhite, fontSize: 9, fontWeight: 600, color: C.textLight,
              borderBottom: "1px solid " + C.borderLight,
            }}>
              <span>企業名</span>
              <span>クライアント</span>
              <span>取得者</span>
              <span>面談日</span>
              <span>確認状況</span>
            </div>
            {/* Rows */}
            {items.map((a, i) => {
              const pcs = a.preCheckStatus;
              const badgeColor = pcs === '確認完了' ? C.green : pcs === '確認中' ? C.gold : pcs === 'リスケ' ? C.orange : pcs === 'キャンセル' ? C.red : null;
              return (
                <div key={i}
                  onClick={() => setSelectedAppo(a)}
                  onMouseEnter={e => { e.currentTarget.style.background = C.offWhite; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 1fr",
                    padding: "10px 20px", fontSize: 12, alignItems: "center",
                    borderBottom: i < items.length - 1 ? "1px solid " + C.borderLight : "none",
                    borderLeft: "3px solid " + g.color,
                    cursor: "pointer",
                  }}>
                  <span style={{ fontWeight: 600, color: C.navy }}>{a.company}</span>
                  <span style={{ color: C.textMid, fontSize: 11 }}>{a.client}</span>
                  <span style={{ fontWeight: 600, color: C.textDark }}>{a.getter}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.textLight }}>{a.meetDate.slice(5)}</span>
                  <span>
                    {badgeColor
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeColor + '15', padding: '2px 8px', borderRadius: 10 }}>{pcs}</span>
                      : <span style={{ fontSize: 10, color: C.textLight }}>未入力 →</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {totalCount === 0 && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "40px 20px",
          border: "1px solid " + C.borderLight, textAlign: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>事前確認の対象はありません</div>
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
    </div>
  );
}
