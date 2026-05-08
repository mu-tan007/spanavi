import { useState, useEffect } from "react";
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import { CALL_RESULTS } from '../../constants/callResults';
import { updatePreCheckResult, fetchCallListItemByAppo, invokeSendAppoReport, invokeSendEmail } from '../../lib/supabaseWrite';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
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

  const appoMonth = appo.meetDate ? (parseInt(appo.meetDate.slice(5, 7), 10) + '月') : '';
  // noteに埋め込まれた電話番号を抽出（例: "電話番号：03-xxxx-xxxx"）
  const phoneFromNote = (() => {
    if (!appo.note) return '';
    const m = appo.note.match(/電話番号：([^\n]+)/);
    return m ? m[1].trim() : '';
  })();
  const displayPhone = appo.phone || phoneFromNote;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg,
        width: 560, maxWidth: '95vw', maxHeight: '90vh',
        boxShadow: shadow.xl, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ── ヘッダー (Navy bar) ── */}
        <div style={{
          background: color.navy, padding: '14px 24px', color: color.white, flexShrink: 0,
        }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>事前確認入力</div>
          <div style={{ fontSize: font.size.xs, color: alpha('#FFFFFF', 0.7), marginTop: 2 }}>
            {appo.company} ／ {appo.client}
          </div>
        </div>

        {/* ── スクロール可能なコンテンツエリア ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* アポ取得報告セクション */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${color.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, letterSpacing: font.letterSpacing.tight }}>
                {appo.company}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 10 }}>
                {displayPhone && (
                  <a href={'tel:' + displayPhone} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: font.size.xs, color: color.white, background: color.navy,
                    borderRadius: radius.md, padding: '5px 12px', textDecoration: 'none',
                    fontFamily: font.family.mono, fontWeight: font.weight.semibold,
                  }}>{displayPhone}</a>
                )}
                {onNavigate && (
                  <Button size="sm" variant="outline" loading={navigating} onClick={handleNavigate}>
                    {navigating ? '検索中...' : '架電ページへ'}
                  </Button>
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
                <div key={i} style={{
                  padding: '6px 10px', borderRadius: radius.md,
                  background: color.cream, border: `1px solid ${color.borderLight}`,
                }}>
                  <div style={{
                    fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold,
                    letterSpacing: font.letterSpacing.wide, marginBottom: 2,
                  }}>{item.label}</div>
                  <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>
                    {item.value || '—'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: radius.md, background: color.cream, border: `1px solid ${color.borderLight}` }}>
                <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>当社売上</div>
                <div style={{ fontSize: font.size.lg, fontWeight: font.weight.black, color: color.navy, fontFamily: font.family.mono }}>
                  {appo.sales > 0 ? '¥' + appo.sales.toLocaleString() : '—'}
                </div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: radius.md, background: color.cream, border: `1px solid ${color.borderLight}` }}>
                <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 4 }}>インターン報酬</div>
                <div style={{ fontSize: font.size.lg, fontWeight: font.weight.black, color: '#1E40AF', fontFamily: font.family.mono }}>
                  {appo.reward > 0 ? '¥' + appo.reward.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: radius.md, background: color.cream,
              border: `1px solid ${color.borderLight}`, borderLeft: `3px solid ${color.navy}`, marginTop: 8,
            }}>
              <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: 6, letterSpacing: font.letterSpacing.wide }}>
                アポ取得報告
              </div>
              {appo.note
                ? <div style={{ fontSize: font.size.xs, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap' }}>{appo.note}</div>
                : <div style={{ fontSize: font.size.xs, color: color.textLight }}>アポ取得報告が登録されていません</div>
              }
            </div>

            {(() => {
              const m = (appo.note || '').match(/録音URL[：:]\s*(https?:\/\/\S+)/);
              const recUrl = m?.[1]?.trim() || '';
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{
                    padding: '6px 10px', borderRadius: radius.md, background: color.cream,
                    display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${color.borderLight}`,
                  }}>
                    <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>録音</span>
                    {recUrl
                      ? <Button size="sm" variant="ghost" onClick={() => setShowRecording(v => !v)}>
                          {showRecording ? '閉じる' : '再生'}
                        </Button>
                      : <span style={{ fontSize: font.size.xs, color: color.textLight }}>録音なし</span>
                    }
                  </div>
                  {showRecording && recUrl && (
                    <InlineAudioPlayer url={recUrl} onClose={() => setShowRecording(false)} />
                  )}
                </div>
              );
            })()}
          </div>

          {/* 事前確認フォーム */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Select
              label="事前確認結果"
              required
              value={form.preCheckStatus}
              onChange={e => u('preCheckStatus', e.target.value)}
              options={[
                { value: '', label: '選択してください' },
                ...PRE_CHECK_OPTIONS.map(s => ({ value: s, label: s })),
              ]}
            />

            {form.preCheckStatus === 'リスケ' && (
              <div style={{
                background: '#FFF8E1', borderRadius: radius.md, padding: '14px',
                border: `1px solid ${color.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <Select
                  label="状況"
                  value={form.rescheduleStatus}
                  onChange={e => u('rescheduleStatus', e.target.value)}
                  options={[
                    { value: '調整中', label: '調整中' },
                    { value: '日時確定', label: '日時確定' },
                  ]}
                />
                {form.rescheduleStatus === '日時確定' && (
                  <Input
                    label="リスケ先日時"
                    type="datetime-local"
                    value={form.rescheduledAt}
                    onChange={e => u('rescheduledAt', e.target.value)}
                  />
                )}
              </div>
            )}

            {form.preCheckStatus === 'キャンセル' && (
              <div style={{ background: '#FFF5F5', borderRadius: radius.md, padding: '14px', border: `1px solid ${color.borderLight}` }}>
                <Input
                  label="キャンセル理由"
                  value={form.cancelReason}
                  onChange={e => u('cancelReason', e.target.value)}
                  placeholder="例：先方都合によりキャンセル"
                />
              </div>
            )}

            <div>
              <div style={{
                fontSize: font.size.sm, fontWeight: font.weight.semibold,
                color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 4,
              }}>メモ</div>
              <textarea
                value={form.preCheckMemo}
                onChange={e => u('preCheckMemo', e.target.value)}
                rows={3}
                placeholder="備考・引き継ぎ事項など"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: radius.md,
                  border: `1px solid ${color.border}`, fontSize: font.size.sm,
                  color: color.textDark, background: color.white,
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: font.family.sans, resize: 'vertical',
                }}
              />
            </div>
          </div>
        </div>

        {/* フッターボタン */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
          background: color.white,
        }}>
          <Button variant="outline" onClick={onCancel}>キャンセル</Button>
          <Button onClick={handleSave} loading={saving}>{saving ? '保存中...' : '保存'}</Button>
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

// 事前確認状態 → Badge variant
const preCheckBadgeVariant = (pcs) => {
  if (pcs === '確認完了') return 'success';
  if (pcs === '確認中' || pcs === 'リスケ') return 'warn';
  if (pcs === 'キャンセル') return 'danger';
  return 'neutral';
};

export default function PreCheckView({ appoData, setAppoData, setCallFlowScreen, callListData = [], clientData = [], contactsByClient = {} }) {
  const isMobile = useIsMobile();
  const [selectedAppo, setSelectedAppo] = useState(null);
  const [reportAppo, setReportAppo] = useState(null);
  const [reportResultType, setReportResultType] = useState('確認完了');
  const [reportBody, setReportBody] = useState('');
  const [reportStep, setReportStep] = useState('idle');
  const [reportError, setReportError] = useState('');
  const { columns, gridTemplateColumns, contentMinWidth, onResizeStart } = useColumnConfig('preCheck', PRECHECK_COLS, { padding: 40 });

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
    { key: 0, label: "当日", date: t0, color: color.danger,    bg: alpha(color.danger, 0.04),    border: alpha(color.danger, 0.15) },
    { key: 1, label: "1営業日前", date: t1, color: color.warn,  bg: alpha(color.warn, 0.05),      border: alpha(color.warn, 0.18) },
    { key: 2, label: "2営業日前", date: t2, color: color.navy,  bg: alpha(color.navy, 0.04),      border: alpha(color.navy, 0.12) },
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

      {/* サマリー */}
      <Card padding="md" style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>事前確認</div>
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>
              ステータス「アポ取得」で面談が近いアポイント
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {groups.map(g => {
              const cnt = targets.filter(t => t.urgency === g.key).length;
              return (
                <div key={g.key} style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide }}>
                    <span style={{ color: g.color }}>●</span> {g.label}
                  </div>
                  <div style={{ fontSize: font.size.xl, fontWeight: font.weight.black, color: g.color, fontFamily: font.family.mono }}>
                    {cnt}
                  </div>
                </div>
              );
            })}
            <div style={{ textAlign: 'center', borderLeft: `1px solid ${color.border}`, paddingLeft: 16, minWidth: 56 }}>
              <div style={{ fontSize: 9, color: color.textLight, fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide }}>合計</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.black, color: color.navy, fontFamily: font.family.mono }}>
                {totalCount}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 各グループ */}
      {groups.map(g => {
        const items = targets.filter(t => t.urgency === g.key);
        if (items.length === 0) return (
          <Card key={g.key} padding="md" style={{ marginBottom: 12, opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: g.color }}>●</span>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: g.color }}>{g.label}</span>
              <span style={{ fontSize: font.size.xs, color: color.textLight }}>─ 面談日: {dayLabel(g.date)}</span>
              <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textLight }}>対象なし</span>
            </div>
          </Card>
        );
        return (
          <Card key={g.key} padding="none" style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ minWidth: contentMinWidth }}>
                {/* グループヘッダー */}
                <div style={{
                  padding: isMobile ? '10px 14px' : '12px 20px',
                  background: g.bg,
                  borderBottom: `1px solid ${g.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: g.color }}>●</span>
                    <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: g.color }}>{g.label}</span>
                    <span style={{ fontSize: font.size.xs, color: color.textMid }}>─ 面談日: {dayLabel(g.date)}</span>
                  </div>
                  <span style={{
                    fontSize: font.size.xs, color: g.color,
                    background: alpha(g.color, 0.10), padding: '2px 10px', borderRadius: radius.sm,
                    fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide,
                  }}>{items.length}件</span>
                </div>

                {/* テーブルヘッダー */}
                <div style={{
                  display: 'grid', gridTemplateColumns,
                  padding: isMobile ? '8px 14px' : '10px 20px',
                  background: color.navy,
                  fontSize: isMobile ? 10 : font.size.xs,
                  fontWeight: font.weight.semibold, color: color.white,
                  letterSpacing: font.letterSpacing.wide,
                }}>
                  {['企業名', 'クライアント', '取得者', '面談日', '確認状況'].map((label, i) => (
                    <span key={label} style={{ position: 'relative', textAlign: columns[i].align, userSelect: 'none' }}>
                      {label}
                      <ColumnResizeHandle colIndex={i} onResizeStart={onResizeStart} />
                    </span>
                  ))}
                </div>

                {/* 行 */}
                {items.map((a, i) => {
                  const pcs = a.preCheckStatus;
                  return (
                    <div key={i}
                      onClick={() => setSelectedAppo(a)}
                      onMouseEnter={e => { e.currentTarget.style.background = alpha(g.color, 0.04); }}
                      onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? color.white : color.cream; }}
                      style={{
                        display: 'grid', gridTemplateColumns,
                        padding: isMobile ? '8px 14px' : '10px 20px',
                        fontSize: isMobile ? 11 : font.size.sm, alignItems: 'center',
                        borderBottom: `1px solid ${color.borderLight}`,
                        borderLeft: `3px solid ${g.color}`,
                        background: i % 2 === 0 ? color.white : color.cream,
                        cursor: 'pointer', transition: 'background 0.15s ease',
                      }}>
                      <span style={{ fontWeight: font.weight.semibold, color: color.navy, textAlign: columns[0].align }}>{a.company}</span>
                      <span style={{ color: color.textMid, fontSize: font.size.xs, textAlign: columns[1].align }}>{a.client}</span>
                      <span style={{ fontWeight: font.weight.semibold, color: color.textDark, textAlign: columns[2].align }}>{a.getter}</span>
                      <span style={{ fontFamily: font.family.mono, fontSize: 10, color: color.textLight, textAlign: columns[3].align }}>{a.meetDate.slice(5)}</span>
                      <span style={{
                        textAlign: columns[4].align,
                        display: 'flex', alignItems: 'center', gap: 6,
                        justifyContent: columns[4].align === 'right' ? 'flex-end' : 'flex-start',
                      }}>
                        {pcs
                          ? <Badge variant={preCheckBadgeVariant(pcs)} dot>{pcs}</Badge>
                          : <span style={{ fontSize: font.size.xs, color: color.textLight }}>未入力 →</span>
                        }
                        {['確認完了', 'リスケ', 'キャンセル'].includes(pcs) && (
                          <Button
                            size="sm"
                            onClick={e => {
                              e.stopPropagation();
                              const cl = clientData.find(c => c.company === a.client);
                              const contacts = cl ? (contactsByClient[cl._supaId] || []) : [];
                              const contactName = contacts[0]?.name || cl?.company || a.client;
                              setReportAppo(a);
                              setReportResultType(pcs);
                              setReportBody(buildPreCheckReport(a, contactName, pcs));
                              setReportStep('compose');
                              setReportError('');
                            }}
                          >
                            報告
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}

      {totalCount === 0 && (
        <Card padding="lg" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 4 }}>
            事前確認の対象はありません
          </div>
          <div style={{ fontSize: font.size.xs, color: color.textLight }}>
            直近の面談で「アポ取得」ステータスのものはすべて確認済みです
          </div>
        </Card>
      )}

      {selectedAppo && (
        <PreCheckModal
          appo={selectedAppo}
          onSave={handlePreCheckSave}
          onCancel={() => setSelectedAppo(null)}
          onNavigate={setCallFlowScreen ? handlePreCheckNavigate : undefined}
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
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10010, fontFamily: font.family.sans,
          }} onClick={() => { setReportAppo(null); setReportStep('idle'); }}>
            <div style={{
              background: color.white, borderRadius: radius.lg, padding: 24,
              width: 500, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
              boxShadow: shadow.xl,
              border: `1px solid ${color.border}`,
            }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 12 }}>
                事前確認報告を送信
              </div>
              {reportStep === 'compose' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {['確認完了', 'リスケ', 'キャンセル'].map(rt => (
                    <Button
                      key={rt}
                      size="sm"
                      variant={reportResultType === rt ? 'primary' : 'outline'}
                      onClick={() => {
                        setReportResultType(rt);
                        const cl2 = clientData.find(c => c.company === reportAppo.client);
                        const contacts2 = cl2 ? (contactsByClient[cl2._supaId] || []) : [];
                        const cn = contacts2[0]?.name || cl2?.company || reportAppo.client;
                        setReportBody(buildPreCheckReport(reportAppo, cn, rt));
                      }}
                    >
                      {rt}
                    </Button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 8 }}>
                送信先: {channelLabel}{' '}
                {isSlack
                  ? (cl?.slackWebhookUrl ? '（設定済み）' : <span style={{ color: color.danger }}>（未設定）</span>)
                  : isChatwork ? (cl?.chatworkRoomId ? '（設定済み）' : <span style={{ color: color.danger }}>（未設定）</span>) : ''}
              </div>
              {reportStep === 'sent' ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Badge variant="success" dot size="md" style={{ marginBottom: 12 }}>送信完了</Badge>
                  <div style={{ marginTop: 8 }}>
                    <Button onClick={() => { setReportAppo(null); setReportStep('idle'); }}>閉じる</Button>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={reportBody}
                    onChange={e => setReportBody(e.target.value)}
                    style={{
                      width: '100%', minHeight: 200, padding: 10,
                      fontSize: font.size.sm, color: color.textDark,
                      border: `1px solid ${color.border}`, borderRadius: radius.md,
                      fontFamily: font.family.sans, resize: 'vertical', boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  {reportError && (
                    <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: 4 }}>{reportError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <Button variant="outline" onClick={() => { setReportAppo(null); setReportStep('idle'); }}>
                      キャンセル
                    </Button>
                    <Button
                      loading={reportStep === 'sending'}
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
                    >
                      {reportStep === 'sending' ? '送信中...' : `${channelLabel}で送信`}
                    </Button>
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
