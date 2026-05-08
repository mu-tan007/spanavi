import React, { useState } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Card } from '../ui';
import { updateAppointmentReport, updateCallRecordReport, invokeGenerateCallReport } from '../../lib/supabaseWrite';

// 通話レポート（スタイル/補足）を確認・編集するポップアップ
// mode: 'appointment' (アポ) | 'callRecord' (架電レコード)
// appo: { id, company_name, getter_name, status, recording_url, report_style, report_supplement, memo, item_id, appo_report? }
export default function ReportPopupModal({ appo, mode = 'callRecord', onClose, onSaved }) {
  const [style, setStyle] = useState(appo?.report_style || '');
  const [supplement, setSupplement] = useState(appo?.report_supplement || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [aiStep, setAiStep] = useState('idle'); // idle | running | done | error
  const [aiError, setAiError] = useState('');

  if (!appo) return null;

  const status = appo.status || '';
  const isAppo = status === 'アポ獲得';
  const isReject = /お断り/.test(status);
  const supplementLabel = isAppo
    ? '経緯・所感'
    : isReject
      ? 'お断り理由'
      : 'メモ・所感';
  const supplementPlaceholder = isAppo
    ? '例：1回目は社長不在、2回目で接続→事例紹介で前向きに転じてアポ獲得'
    : isReject
      ? '例：M&Aには興味なし。後継者は息子に決まっている、と強めの口調で断られた'
      : '例：通話の要点・先方の反応';

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    const updater = mode === 'callRecord' ? updateCallRecordReport : updateAppointmentReport;
    const { error } = await updater(appo.id, { style, supplement });
    setSaving(false);
    if (error) {
      setSaveError(error.message || '保存に失敗しました');
      return;
    }
    setSavedAt(Date.now());
    onSaved?.({ ...appo, report_style: style, report_supplement: supplement });
    setTimeout(() => setSavedAt(null), 2000);
  };

  const handleGenerateAI = async () => {
    if (!appo.recording_url) { setAiError('録音URLがありません'); setAiStep('error'); return; }
    setAiStep('running');
    setAiError('');
    try {
      const { data, error } = await invokeGenerateCallReport({
        recording_url: appo.recording_url,
        call_status: status,
        item_id: appo.item_id || '',
        manual_supplement: supplement,
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || 'unknown');
      if (data.report_style && isAppo) setStyle(data.report_style);
      if (data.report_text) setSupplement(data.report_text);
      setAiStep('done');
      setTimeout(() => setAiStep('idle'), 3000);
    } catch (e) {
      console.error('[ReportPopupModal] AI生成失敗:', e);
      setAiError(e.message || '生成に失敗しました');
      setAiStep('error');
    }
  };

  const STYLES = ['スムーズ', '説得'];

  const sectionLabel = {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: color.navy,
    marginBottom: 4,
  };

  const codeBlock = {
    background: color.gray100,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    padding: space[2.5],
    fontSize: font.size.xs,
    whiteSpace: 'pre-wrap',
    lineHeight: font.lineHeight.relaxed,
    color: color.textDark,
    margin: 0,
    fontFamily: font.family.sans,
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: alpha('#000', 0.5), zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.family.sans }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: color.white, borderRadius: radius.lg, width: 560, maxWidth: '92vw',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: shadow.xl }}>
        <div style={{ padding: `${space[3]}px ${space[5]}px`, background: color.navy, color: color.white, borderRadius: `${radius.lg}px ${radius.lg}px 0 0` }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold }}>通話レポート{isAppo ? '（アポ獲得）' : isReject ? '（社長お断り）' : ''}</div>
          <div style={{ fontSize: font.size.xs, color: alpha(color.white, 0.7), marginTop: 2 }}>
            {appo.company_name} / {appo.getter_name || '—'} / {status}
          </div>
        </div>
        <div style={{ padding: space[4] + 2, overflowY: 'auto', flex: 1 }}>
          {/* AI生成ボタン */}
          <div style={{ marginBottom: space[3] + 2, padding: space[2.5], background: color.gray100, borderRadius: radius.md, display: 'flex', alignItems: 'center', gap: space[2.5] }}>
            <Button
              size="sm"
              variant="primary"
              onClick={handleGenerateAI}
              disabled={!appo.recording_url}
              loading={aiStep === 'running'}
            >
              {aiStep === 'running' ? 'AI生成中...' : '録音から自動生成'}
            </Button>
            <div style={{ fontSize: font.size.xs - 1, color: color.textMid, flex: 1 }}>
              {!appo.recording_url && '録音URL未取得'}
              {aiStep === 'idle' && appo.recording_url && '録音をWhisper→Claudeで分析しレポートを生成します'}
              {aiStep === 'done' && <span style={{ color: color.success }}>生成しました（保存ボタンで確定）</span>}
              {aiStep === 'error' && <span style={{ color: color.danger }}>エラー: {aiError}</span>}
            </div>
          </div>

          {/* スタイルラジオ（アポ獲得のみ） */}
          {isAppo && (
            <div style={{ marginBottom: space[3] }}>
              <div style={sectionLabel}>取得スタイル</div>
              <div style={{ display: 'flex', gap: space[3] + 2, fontSize: font.size.sm }}>
                {STYLES.map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="rps" value={s}
                      checked={style === s} onChange={() => setStyle(s)} />
                    {s}
                  </label>
                ))}
                {style && (
                  <button onClick={() => setStyle('')}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: color.textLight, cursor: 'pointer', fontSize: font.size.xs }}>クリア</button>
                )}
              </div>
            </div>
          )}

          <div style={{ marginBottom: space[3] }}>
            <div style={sectionLabel}>{supplementLabel}</div>
            <textarea value={supplement} onChange={e => setSupplement(e.target.value)}
              placeholder={supplementPlaceholder}
              style={{ width: '100%', minHeight: 140, padding: space[2.5], borderRadius: radius.md,
                border: `1px solid ${color.border}`, fontSize: font.size.sm, background: color.offWhite,
                resize: 'vertical', boxSizing: 'border-box', fontFamily: font.family.sans, lineHeight: font.lineHeight.relaxed,
                color: color.textDark, outline: 'none' }} />
          </div>

          {appo.memo && (
            <div style={{ marginBottom: space[3] }}>
              <div style={sectionLabel}>架電メモ（架電時の入力）</div>
              <pre style={codeBlock}>{appo.memo}</pre>
            </div>
          )}
          {appo.appo_report && (
            <div>
              <div style={sectionLabel}>アポ取得時の元レポート</div>
              <pre style={{
                ...codeBlock,
                fontSize: font.size.xs - 1,
                maxHeight: 240, overflowY: 'auto',
                fontFamily: font.family.mono,
              }}>{appo.appo_report}</pre>
            </div>
          )}
        </div>
        <div style={{ padding: `${space[2.5]}px ${space[5]}px`, borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: space[2], alignItems: 'center' }}>
          {savedAt && <span style={{ fontSize: font.size.xs, color: color.success, marginRight: 'auto' }}>保存しました</span>}
          {saveError && <span style={{ fontSize: font.size.xs, color: color.danger, marginRight: 'auto' }}>エラー: {saveError}</span>}
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={handleSave} loading={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
