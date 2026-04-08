import React, { useState } from 'react';
import { C } from '../../constants/colors';
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

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Noto Sans JP'" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 6, width: 560, maxWidth: '92vw',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '12px 20px', background: '#0D2247', color: '#fff', borderRadius: '6px 6px 0 0' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>通話レポート{isAppo ? '（アポ獲得）' : isReject ? '（社長お断り）' : ''}</div>
          <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
            {appo.company_name} / {appo.getter_name || '—'} / {status}
          </div>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {/* AI生成ボタン */}
          <div style={{ marginBottom: 14, padding: 10, background: '#F3F4F6', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handleGenerateAI} disabled={aiStep === 'running' || !appo.recording_url}
              style={{ padding: '8px 14px', borderRadius: 4, border: 'none', background: '#0D2247', color: '#fff',
                cursor: (aiStep === 'running' || !appo.recording_url) ? 'default' : 'pointer',
                fontSize: 12, fontWeight: 600, opacity: (aiStep === 'running' || !appo.recording_url) ? 0.6 : 1 }}>
              {aiStep === 'running' ? 'AI生成中...' : '録音から自動生成'}
            </button>
            <div style={{ fontSize: 10, color: C.textMid, flex: 1 }}>
              {!appo.recording_url && '録音URL未取得'}
              {aiStep === 'idle' && appo.recording_url && '録音をWhisper→Claudeで分析しレポートを生成します'}
              {aiStep === 'done' && <span style={{ color: '#0a0' }}>✓ 生成しました（保存ボタンで確定）</span>}
              {aiStep === 'error' && <span style={{ color: '#c00' }}>エラー: {aiError}</span>}
            </div>
          </div>

          {/* スタイルラジオ（アポ獲得のみ） */}
          {isAppo && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 4 }}>取得スタイル</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                {STYLES.map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" name="rps" value={s}
                      checked={style === s} onChange={() => setStyle(s)} />
                    {s}
                  </label>
                ))}
                {style && (
                  <button onClick={() => setStyle('')}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.textLight, cursor: 'pointer', fontSize: 11 }}>クリア</button>
                )}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 4 }}>{supplementLabel}</div>
            <textarea value={supplement} onChange={e => setSupplement(e.target.value)}
              placeholder={supplementPlaceholder}
              style={{ width: '100%', minHeight: 140, padding: 10, borderRadius: 4,
                border: '1px solid ' + C.border, fontSize: 12, background: C.offWhite,
                resize: 'vertical', boxSizing: 'border-box', fontFamily: "'Noto Sans JP'", lineHeight: 1.6 }} />
          </div>

          {appo.memo && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 4 }}>架電メモ（架電時の入力）</div>
              <pre style={{ background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4,
                padding: 10, fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.6,
                color: C.textDark, margin: 0, fontFamily: "'Noto Sans JP'" }}>{appo.memo}</pre>
            </div>
          )}
          {appo.appo_report && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 4 }}>アポ取得時の元レポート</div>
              <pre style={{ background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4,
                padding: 10, fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.6,
                color: C.textDark, margin: 0, maxHeight: 240, overflowY: 'auto',
                fontFamily: "'JetBrains Mono', monospace" }}>{appo.appo_report}</pre>
            </div>
          )}
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid #E5E7EB',
          display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          {savedAt && <span style={{ fontSize: 11, color: '#0a0', marginRight: 'auto' }}>保存しました</span>}
          {saveError && <span style={{ fontSize: 11, color: '#c00', marginRight: 'auto' }}>エラー: {saveError}</span>}
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #0D2247',
              background: '#fff', cursor: 'pointer', fontSize: 12, color: '#0D2247' }}>閉じる</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 4, border: 'none',
              background: '#0D2247', cursor: saving ? 'default' : 'pointer',
              fontSize: 12, color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
