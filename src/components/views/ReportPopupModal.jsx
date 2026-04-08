import React, { useState } from 'react';
import { C } from '../../constants/colors';
import { updateAppointmentReport } from '../../lib/supabaseWrite';

// 既存アポのレポート（スタイル/補足/全文）を確認・編集するポップアップ
export default function ReportPopupModal({ appo, onClose, onSaved }) {
  const [style, setStyle] = useState(appo?.report_style || '');
  const [supplement, setSupplement] = useState(appo?.report_supplement || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  if (!appo) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateAppointmentReport(appo.id, { style, supplement });
    setSaving(false);
    if (!error) {
      setSavedAt(Date.now());
      onSaved?.({ ...appo, report_style: style, report_supplement: supplement });
      setTimeout(() => setSavedAt(null), 2000);
    }
  };

  const STYLES = ['Smooth', 'Slack', '説得'];

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Noto Sans JP'" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 6, width: 520, maxWidth: '92vw',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '12px 20px', background: '#0D2247', color: '#fff', borderRadius: '6px 6px 0 0' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>アポレポート</div>
          <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
            {appo.company_name} / {appo.getter_name || '—'} / {appo.status || ''}
          </div>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
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
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0D2247', marginBottom: 4 }}>補足（経緯・所感）</div>
            <textarea value={supplement} onChange={e => setSupplement(e.target.value)}
              placeholder="例：1回目は社長不在、2回目で接続→事例紹介で前向きに転じてアポ獲得"
              style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 4,
                border: '1px solid ' + C.border, fontSize: 12, background: C.offWhite,
                resize: 'vertical', boxSizing: 'border-box', fontFamily: "'Noto Sans JP'" }} />
          </div>
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
