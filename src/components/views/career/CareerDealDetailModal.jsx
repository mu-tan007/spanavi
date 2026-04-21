import React, { useEffect, useState } from 'react';
import { C } from '../../../constants/colors';
import { supabase } from '../../../lib/supabase';
import { getOrgId } from '../../../lib/orgContext';
import { useEngagements } from '../../../hooks/useEngagements';

const LOST_REASONS = ['辞退', '音信不通', '予算NG', '他社決定', '家族反対', 'その他'];
const SOURCE_CHANNELS = [
  { value: '', label: '—' },
  { value: 'cw_application', label: 'クラウドワークス応募' },
  { value: 'cw_scout', label: 'クラウドワークススカウト' },
];
const DISQUAL_REASONS = ['年齢NG', '顔出し不可', '職歴不足', 'その他'];

export default function CareerDealDetailModal({ deal, stages, teams, onClose, onUpdate }) {
  const { currentEngagement } = useEngagements();

  const [form, setForm] = useState({
    prospect_name: deal.prospect_name || '',
    prospect_age: deal.prospect_age ?? '',
    prospect_phone: deal.prospect_phone || '',
    prospect_email: deal.prospect_email || '',
    prospect_line_id: deal.prospect_line_id || '',
    current_annual_income: deal.current_annual_income ?? '',
    target_annual_income: deal.target_annual_income ?? '',
    source_channel: deal.source_channel || '',
    crowdworks_profile_url: deal.crowdworks_profile_url || '',
    is_qualified: deal.is_qualified !== false,
    qualification_reason: deal.qualification_reason || '',
    selected_plan_id: deal.selected_plan_id || '',
    stage: deal.stage,
    team_id: deal.team_id || '',
    sourcer_member_id: deal.sourcer_member_id || '',
    closer_member_id: deal.closer_member_id || '',
    trainer_member_id: deal.trainer_member_id || '',
    probability: deal.probability ?? 0,
    deal_value: deal.deal_value ?? 0,
    expected_close_date: deal.expected_close_date || '',
    lost_reason: deal.lost_reason || '',
    notes: deal.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentEngagement?.id) return;
      const { data } = await supabase
        .from('product_plans')
        .select('id, name, price_total')
        .eq('org_id', getOrgId())
        .eq('engagement_id', currentEngagement.id)
        .eq('is_active', true)
        .order('display_order');
      if (!cancelled && data) setPlans(data);
    })();
    return () => { cancelled = true; };
  }, [currentEngagement?.id]);

  const selectedTeam = teams.find(t => t.id === form.team_id);
  const sourcerCandidates = selectedTeam?.active_members?.filter(tm => tm.role === 'sourcer' || tm.role === 'leader').map(tm => tm.member) || [];
  const closerCandidates = selectedTeam?.active_members?.filter(tm => tm.role === 'closer' || tm.role === 'leader').map(tm => tm.member) || sourcerCandidates;
  const trainerCandidates = selectedTeam?.active_members?.filter(tm => tm.role === 'trainer' || tm.role === 'leader').map(tm => tm.member) || sourcerCandidates;

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      prospect_name: form.prospect_name,
      prospect_age: form.prospect_age ? parseInt(form.prospect_age, 10) : null,
      prospect_phone: form.prospect_phone || null,
      prospect_email: form.prospect_email || null,
      prospect_line_id: form.prospect_line_id || null,
      current_annual_income: form.current_annual_income ? parseFloat(form.current_annual_income) : null,
      target_annual_income: form.target_annual_income ? parseFloat(form.target_annual_income) : null,
      source_channel: form.source_channel || null,
      crowdworks_profile_url: form.crowdworks_profile_url || null,
      is_qualified: form.is_qualified,
      qualification_reason: form.is_qualified ? null : (form.qualification_reason || null),
      selected_plan_id: form.selected_plan_id || null,
      stage: form.stage,
      team_id: form.team_id || null,
      sourcer_member_id: form.sourcer_member_id || null,
      closer_member_id: form.closer_member_id || null,
      trainer_member_id: form.trainer_member_id || null,
      probability: parseInt(form.probability, 10) || 0,
      deal_value: parseFloat(form.deal_value) || 0,
      expected_close_date: form.expected_close_date || null,
      lost_reason: form.stage === 'closed_lost' ? (form.lost_reason || null) : null,
      notes: form.notes || null,
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
          background: C.white, borderRadius: 6, width: '94%', maxWidth: 820,
          maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(3,45,96,0.3)',
          display: 'flex', flexDirection: 'column',
          borderTop: `3px solid ${C.gold}`,
        }}
      >
        <div style={{
          padding: '14px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.navy,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Spartia Career</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: C.white, margin: 0, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
              Deal 詳細
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: C.white,
            width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: 16,
          }}>×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="氏名 *"><input type="text" value={form.prospect_name} onChange={e => setForm({ ...form, prospect_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="年齢"><input type="number" value={form.prospect_age} onChange={e => setForm({ ...form, prospect_age: e.target.value })} style={inputStyle} /></Field>
          <Field label="電話"><input type="text" value={form.prospect_phone} onChange={e => setForm({ ...form, prospect_phone: e.target.value })} style={inputStyle} /></Field>
          <Field label="メール"><input type="email" value={form.prospect_email} onChange={e => setForm({ ...form, prospect_email: e.target.value })} style={inputStyle} /></Field>
          <Field label="LINE ID"><input type="text" value={form.prospect_line_id} onChange={e => setForm({ ...form, prospect_line_id: e.target.value })} style={inputStyle} /></Field>
          <Field label="応募経路">
            <select value={form.source_channel} onChange={e => setForm({ ...form, source_channel: e.target.value })} style={inputStyle}>
              {SOURCE_CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
            </select>
          </Field>
          <Field label="現在年収(円)"><input type="number" value={form.current_annual_income} onChange={e => setForm({ ...form, current_annual_income: e.target.value })} style={inputStyle} /></Field>
          <Field label="目標年収(円)"><input type="number" value={form.target_annual_income} onChange={e => setForm({ ...form, target_annual_income: e.target.value })} style={inputStyle} /></Field>
          <Field label="CWプロフィールURL" span={2}><input type="url" value={form.crowdworks_profile_url} onChange={e => setForm({ ...form, crowdworks_profile_url: e.target.value })} style={inputStyle} /></Field>
          <Field label="チーム">
            <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value, sourcer_member_id: '', closer_member_id: '', trainer_member_id: '' })} style={inputStyle}>
              <option value="">—</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="希望プラン">
            <select value={form.selected_plan_id} onChange={e => setForm({ ...form, selected_plan_id: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="担当 (sourcer)">
            <select value={form.sourcer_member_id} onChange={e => setForm({ ...form, sourcer_member_id: e.target.value })} style={inputStyle} disabled={!form.team_id}>
              <option value="">—</option>
              {sourcerCandidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="担当 (closer)">
            <select value={form.closer_member_id} onChange={e => setForm({ ...form, closer_member_id: e.target.value })} style={inputStyle} disabled={!form.team_id}>
              <option value="">—</option>
              {closerCandidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="担当 (trainer)">
            <select value={form.trainer_member_id} onChange={e => setForm({ ...form, trainer_member_id: e.target.value })} style={inputStyle} disabled={!form.team_id}>
              <option value="">—</option>
              {trainerCandidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="ステージ">
            <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={inputStyle}>
              {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="有効応募">
            <div style={{ display: 'flex', gap: 16, paddingTop: 6, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" checked={form.is_qualified} onChange={() => setForm({ ...form, is_qualified: true, qualification_reason: '' })} />有効
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" checked={!form.is_qualified} onChange={() => setForm({ ...form, is_qualified: false })} />無効
              </label>
            </div>
          </Field>
          {!form.is_qualified && (
            <Field label="無効理由">
              <select value={form.qualification_reason} onChange={e => setForm({ ...form, qualification_reason: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {DISQUAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          <Field label="確度 (%)"><input type="number" min={0} max={100} value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={inputStyle} /></Field>
          <Field label="想定金額(円)"><input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} style={inputStyle} /></Field>
          <Field label="成約予定日"><input type="date" value={form.expected_close_date || ''} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} style={inputStyle} /></Field>
          {form.stage === 'closed_lost' && (
            <Field label="失注理由" span={2}>
              <select value={form.lost_reason} onChange={e => setForm({ ...form, lost_reason: e.target.value })} style={inputStyle}>
                <option value="">選択してください</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          <Field label="メモ" span={2}>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
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
  width: '100%', padding: '7px 10px', fontSize: 12,
  border: `1px solid ${C.border}`, borderRadius: 4, boxSizing: 'border-box',
  color: C.textDark, fontFamily: "'Noto Sans JP',sans-serif",
};
