import React, { useState } from 'react';
import { C } from '../../../constants/colors';
import { useEngagements } from '../../../hooks/useEngagements';
import { useTeams } from '../../../hooks/useTeams';
import { useCareerDeals } from '../../../hooks/useCareerDeals';

const SOURCE_CHANNELS = [
  { value: 'cw_application', label: 'クラウドワークス応募' },
  { value: 'cw_scout', label: 'クラウドワークススカウト' },
];
const DISQUAL_REASONS = ['年齢NG', '顔出し不可', '職歴不足', 'その他'];

const EMPTY = {
  prospect_name: '',
  prospect_phone: '',
  prospect_email: '',
  prospect_line_id: '',
  prospect_age: '',
  current_annual_income: '',
  target_annual_income: '',
  source_channel: 'cw_application',
  crowdworks_profile_url: '',
  is_qualified: true,
  qualification_reason: '',
  team_id: '',
  sourcer_member_id: '',
  notes: '',
};

export default function ApplicationsView() {
  const { currentEngagement } = useEngagements();
  const { teams } = useTeams(currentEngagement?.id);
  const { createDeal } = useCareerDeals({ engagementId: currentEngagement?.id });

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedTeam = teams.find(t => t.id === form.team_id);
  const sourcers = selectedTeam?.active_members
    ?.filter(tm => tm.role === 'sourcer' || tm.role === 'leader')
    .map(tm => tm.member) || [];

  const handleSubmit = async () => {
    if (!form.prospect_name.trim() || !form.team_id || !form.sourcer_member_id) {
      setMessage({ type: 'error', text: '氏名・チーム・担当は必須です' });
      return;
    }
    setSaving(true);
    const { error } = await createDeal({
      prospect_name: form.prospect_name.trim(),
      prospect_phone: form.prospect_phone || null,
      prospect_email: form.prospect_email || null,
      prospect_line_id: form.prospect_line_id || null,
      prospect_age: form.prospect_age ? parseInt(form.prospect_age, 10) : null,
      current_annual_income: form.current_annual_income ? parseFloat(form.current_annual_income) : null,
      target_annual_income: form.target_annual_income ? parseFloat(form.target_annual_income) : null,
      source_channel: form.source_channel,
      crowdworks_profile_url: form.crowdworks_profile_url || null,
      is_qualified: form.is_qualified,
      qualification_reason: form.is_qualified ? null : (form.qualification_reason || null),
      team_id: form.team_id,
      sourcer_member_id: form.sourcer_member_id,
      notes: form.notes || null,
      stage: 'application_received',
    });
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: '登録失敗: ' + error.message });
      return;
    }
    setMessage({ type: 'success', text: `「${form.prospect_name}」を登録しました（Deal作成済み）` });
    setForm(prev => ({
      ...EMPTY,
      source_channel: prev.source_channel,
      team_id: prev.team_id,
      sourcer_member_id: prev.sourcer_member_id,
    }));
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div style={{ background: C.offWhite, margin: -28, marginTop: 0, marginBottom: 0, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ padding: '14px 20px 16px', background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
          Spartia Career · Applications
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 2px', color: C.navy, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
          応募管理
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, margin: 0 }}>
          クラウドワークスからの応募・スカウト反応を登録すると Deal が自動作成されます
        </p>
      </div>

      <div style={{ padding: 20, maxWidth: 840 }}>
        {message && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 4, fontSize: 12,
            background: message.type === 'error' ? 'rgba(234,0,30,0.08)' : C.greenLight,
            color: message.type === 'error' ? C.red : C.green,
            border: `1px solid ${message.type === 'error' ? C.red : C.green}`,
          }}>
            {message.text}
          </div>
        )}

        <div style={{
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: 20,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="氏名 *"><input type="text" value={form.prospect_name} onChange={e => setForm({ ...form, prospect_name: e.target.value })} style={inputStyle} /></Field>
            <Field label="年齢"><input type="number" value={form.prospect_age} onChange={e => setForm({ ...form, prospect_age: e.target.value })} style={inputStyle} /></Field>
            <Field label="電話"><input type="text" value={form.prospect_phone} onChange={e => setForm({ ...form, prospect_phone: e.target.value })} style={inputStyle} /></Field>
            <Field label="メール"><input type="email" value={form.prospect_email} onChange={e => setForm({ ...form, prospect_email: e.target.value })} style={inputStyle} /></Field>
            <Field label="LINE ID"><input type="text" value={form.prospect_line_id} onChange={e => setForm({ ...form, prospect_line_id: e.target.value })} style={inputStyle} /></Field>
            <Field label="現在年収(円)"><input type="number" value={form.current_annual_income} onChange={e => setForm({ ...form, current_annual_income: e.target.value })} style={inputStyle} /></Field>
            <Field label="目標年収(円)"><input type="number" value={form.target_annual_income} onChange={e => setForm({ ...form, target_annual_income: e.target.value })} style={inputStyle} /></Field>
            <Field label="応募経路">
              <select value={form.source_channel} onChange={e => setForm({ ...form, source_channel: e.target.value })} style={inputStyle}>
                {SOURCE_CHANNELS.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
              </select>
            </Field>
            <Field label="CWプロフィールURL" span={2}>
              <input type="url" value={form.crowdworks_profile_url} onChange={e => setForm({ ...form, crowdworks_profile_url: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="チーム *">
              <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value, sourcer_member_id: '' })} style={inputStyle}>
                <option value="">選択してください</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="担当 (sourcer) *">
              <select value={form.sourcer_member_id} onChange={e => setForm({ ...form, sourcer_member_id: e.target.value })} style={inputStyle} disabled={!form.team_id}>
                <option value="">選択してください</option>
                {sourcers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                  <option value="">選択してください</option>
                  {DISQUAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            )}
            <Field label="メモ" span={2}>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setForm(EMPTY); setMessage(null); }}
              style={{
                padding: '8px 16px', fontSize: 12, background: C.white,
                color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
                fontFamily: "'Noto Sans JP',sans-serif",
              }}
            >クリア</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: '8px 24px', fontSize: 12, fontWeight: 600, background: C.navy,
                color: C.white, border: 'none', borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                fontFamily: "'Noto Sans JP',sans-serif",
              }}
            >{saving ? '登録中...' : '登録 (Deal作成)'}</button>
          </div>
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
