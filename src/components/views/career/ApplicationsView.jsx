import React, { useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
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
    <div style={{ background: color.offWhite, margin: -28, marginTop: 0, marginBottom: 0, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ padding: '14px 20px 16px', background: color.white, borderBottom: `1px solid ${color.border}` }}>
        <div style={{ fontSize: font.size.xs - 1, color: color.textLight, letterSpacing: font.letterSpacing.widest, textTransform: 'uppercase', marginBottom: 2 }}>
          スパキャリ · Applications
        </div>
        <h1 style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: '0 0 2px', color: color.navy, fontFamily: font.family.display }}>
          応募管理
        </h1>
        <p style={{ fontSize: font.size.xs, color: color.textMid, margin: 0 }}>
          クラウドワークスからの応募・スカウト反応を登録すると Deal が自動作成されます
        </p>
      </div>

      <div style={{ padding: space[5], maxWidth: 840 }}>
        {message && (
          <div style={{
            padding: '10px 14px', marginBottom: space[4], borderRadius: radius.md, fontSize: font.size.sm,
            background: message.type === 'error' ? alpha(color.danger, 0.08) : color.successSoft,
            color: message.type === 'error' ? color.danger : color.success,
            border: `1px solid ${message.type === 'error' ? color.danger : color.success}`,
          }}>
            {message.text}
          </div>
        )}

        <Card padding="md">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="氏名 *">
              <Input size="sm" type="text" value={form.prospect_name} onChange={e => setForm({ ...form, prospect_name: e.target.value })} />
            </Field>
            <Field label="年齢">
              <Input size="sm" type="number" value={form.prospect_age} onChange={e => setForm({ ...form, prospect_age: e.target.value })} />
            </Field>
            <Field label="電話">
              <Input size="sm" type="text" value={form.prospect_phone} onChange={e => setForm({ ...form, prospect_phone: e.target.value })} />
            </Field>
            <Field label="メール">
              <Input size="sm" type="email" value={form.prospect_email} onChange={e => setForm({ ...form, prospect_email: e.target.value })} />
            </Field>
            <Field label="LINE ID">
              <Input size="sm" type="text" value={form.prospect_line_id} onChange={e => setForm({ ...form, prospect_line_id: e.target.value })} />
            </Field>
            <Field label="現在年収(円)">
              <Input size="sm" type="number" value={form.current_annual_income} onChange={e => setForm({ ...form, current_annual_income: e.target.value })} />
            </Field>
            <Field label="目標年収(円)">
              <Input size="sm" type="number" value={form.target_annual_income} onChange={e => setForm({ ...form, target_annual_income: e.target.value })} />
            </Field>
            <Field label="応募経路">
              <Select
                size="sm"
                value={form.source_channel}
                onChange={e => setForm({ ...form, source_channel: e.target.value })}
                options={SOURCE_CHANNELS}
              />
            </Field>
            <Field label="CWプロフィールURL" span={2}>
              <Input size="sm" type="url" value={form.crowdworks_profile_url} onChange={e => setForm({ ...form, crowdworks_profile_url: e.target.value })} />
            </Field>
            <Field label="チーム *">
              <Select
                size="sm"
                value={form.team_id}
                onChange={e => setForm({ ...form, team_id: e.target.value, sourcer_member_id: '' })}
                options={[{ value: '', label: '選択してください' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
              />
            </Field>
            <Field label="担当 (sourcer) *">
              <Select
                size="sm"
                value={form.sourcer_member_id}
                onChange={e => setForm({ ...form, sourcer_member_id: e.target.value })}
                disabled={!form.team_id}
                options={[{ value: '', label: '選択してください' }, ...sourcers.map(m => ({ value: m.id, label: m.name }))]}
              />
            </Field>
            <Field label="有効応募">
              <div style={{ display: 'flex', gap: space[4], paddingTop: 6, fontSize: font.size.sm }}>
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
                <Select
                  size="sm"
                  value={form.qualification_reason}
                  onChange={e => setForm({ ...form, qualification_reason: e.target.value })}
                  options={[{ value: '', label: '選択してください' }, ...DISQUAL_REASONS.map(r => ({ value: r, label: r }))]}
                />
              </Field>
            )}
            <Field label="メモ" span={2}>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                style={{
                  width: '100%', padding: '7px 10px', fontSize: font.size.sm,
                  border: `1px solid ${color.border}`, borderRadius: radius.md, boxSizing: 'border-box',
                  color: color.textDark, fontFamily: font.family.sans, resize: 'vertical', outline: 'none',
                  background: color.white,
                }}
              />
            </Field>
          </div>

          <div style={{ marginTop: space[5], display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
            <Button variant="outline" size="sm" onClick={() => { setForm(EMPTY); setMessage(null); }}>クリア</Button>
            <Button size="sm" loading={saving} onClick={handleSubmit}>
              {saving ? '登録中...' : '登録 (Deal作成)'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <label style={{
        display: 'block', fontSize: font.size.xs - 1, color: color.textMid,
        marginBottom: 4, fontWeight: font.weight.semibold, letterSpacing: font.letterSpacing.wide, textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  );
}
