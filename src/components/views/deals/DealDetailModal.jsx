import React, { useState } from 'react';
import { C } from '../../../constants/colors';

const LOST_REASONS = ['辞退', '音信不通', '資金不足', '他社決定'];

export default function DealDetailModal({ deal, stages, onClose, onUpdate }) {
  const [form, setForm] = useState({
    prospect_company: deal.prospect_company || '',
    prospect_name: deal.prospect_name || '',
    prospect_phone: deal.prospect_phone || '',
    prospect_email: deal.prospect_email || '',
    stage: deal.stage,
    probability: deal.probability ?? 0,
    deal_value: deal.deal_value ?? 0,
    expected_close_date: deal.expected_close_date || '',
    lost_reason: deal.lost_reason || '',
    notes: deal.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      ...form,
      probability: parseInt(form.probability, 10) || 0,
      deal_value: parseFloat(form.deal_value) || 0,
      expected_close_date: form.expected_close_date || null,
      closed_status: form.stage === 'closed_won' ? 'won' : form.stage === 'closed_lost' ? 'lost' : 'open',
      closed_at: (form.stage === 'closed_won' || form.stage === 'closed_lost') ? new Date().toISOString() : null,
    };
    const { error } = await onUpdate(deal.id, updates);
    setSaving(false);
    if (error) { alert('保存に失敗しました: ' + error.message); return; }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(3,45,96,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 6, width: '92%', maxWidth: 760,
          maxHeight: '88vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(3,45,96,0.3)',
          display: 'flex', flexDirection: 'column',
          borderTop: `3px solid ${C.gold}`,
        }}
      >
        <div style={{
          padding: '14px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.navy,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Sourcing</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: C.white, margin: 0, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
              Deal 詳細
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
              color: C.white, width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: 16,
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="企業名">
            <input type="text" value={form.prospect_company} onChange={e => setForm({ ...form, prospect_company: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="担当者名">
            <input type="text" value={form.prospect_name} onChange={e => setForm({ ...form, prospect_name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="電話">
            <input type="text" value={form.prospect_phone} onChange={e => setForm({ ...form, prospect_phone: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="メール">
            <input type="email" value={form.prospect_email} onChange={e => setForm({ ...form, prospect_email: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="クライアント">
            <input type="text" value={deal.client?.name || '-'} disabled style={{ ...inputStyle, background: C.offWhite }} />
          </Field>
          <Field label="起点アポ">
            <input
              type="text"
              value={deal.appointment?.appointment_date ? new Date(deal.appointment.appointment_date).toLocaleDateString('ja-JP') : '-'}
              disabled
              style={{ ...inputStyle, background: C.offWhite }}
            />
          </Field>
          <Field label="ステージ">
            <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={inputStyle}>
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="確度 (%)">
            <input type="number" min={0} max={100} value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="想定金額 (円)">
            <input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="成約予定日">
            <input type="date" value={form.expected_close_date || ''} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} style={inputStyle} />
          </Field>
          {form.stage === 'closed_lost' && (
            <Field label="失注理由" span={2}>
              <select value={form.lost_reason} onChange={e => setForm({ ...form, lost_reason: e.target.value })} style={inputStyle}>
                <option value="">選択してください</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          <Field label="メモ" span={2}>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8, background: C.cream,
        }}>
          <button onClick={onClose} style={{
            padding: '7px 16px', fontSize: 12, background: C.white,
            color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
            fontFamily: "'Noto Sans JP',sans-serif",
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '7px 20px', fontSize: 12, fontWeight: 600, background: C.navy,
            color: C.white, border: 'none', borderRadius: 4,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            fontFamily: "'Noto Sans JP',sans-serif",
          }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <label style={{
        display: 'block', fontSize: 10, color: C.textMid,
        marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 12,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  boxSizing: 'border-box',
  color: C.textDark,
  fontFamily: "'Noto Sans JP',sans-serif",
};
