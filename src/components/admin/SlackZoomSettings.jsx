import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font } from '../../constants/design';
import { Button, Card } from '../ui';

const NAVY = color.navy;

const SETTING_GROUPS = [
  {
    title: 'Slack Webhook URL',
    icon: '',
    items: [
      { key: 'slack_webhook_ranking',    label: 'ランキング通知（#ランキング）',       placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_precheck',   label: '事前確認通知（#事前確認）',            placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_keiden',     label: '架電報告（#架電報告）',                placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_nario',      label: 'ロープレ分析通知 成尾チーム',          placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_takahashi',  label: 'ロープレ分析通知 高橋チーム',          placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_report_nario',     label: 'チームレポート 成尾チーム',      placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'slack_webhook_report_takahashi', label: 'チームレポート 高橋チーム',      placeholder: 'https://hooks.slack.com/services/...' },
    ],
  },
  {
    title: 'Zoom API 設定',
    icon: '',
    items: [
      { key: 'zoom_account_id',    label: 'Account ID',    placeholder: 'Zoom Account ID' },
      { key: 'zoom_client_id',     label: 'Client ID',     placeholder: 'Zoom Client ID' },
      { key: 'zoom_client_secret', label: 'Client Secret', placeholder: 'Zoom Client Secret' },
    ],
  },
];

function MaskedInput({ value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(value || ''); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(''); };
  const confirm = () => { onSave(draft); setEditing(false); };

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flex: 1 }}>
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
          style={{ flex: 1, padding: `6px ${space[2.5]}px`, borderRadius: radius.lg, border: `1px solid ${color.navyLight}`, fontSize: font.size.sm, fontFamily: font.family.mono }}
        />
        <Button variant="primary" size="sm" onClick={confirm}>保存</Button>
        <Button variant="secondary" size="sm" onClick={cancel}>✕</Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flex: 1 }}>
      <div style={{ flex: 1, padding: `6px ${space[2.5]}px`, background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.mono, color: color.gray600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value ? maskValue(value) : <span style={{ color: color.gray300 }}>未設定</span>}
      </div>
      <Button variant="secondary" size="sm" onClick={startEdit}>編集</Button>
    </div>
  );
}

function maskValue(v) {
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return v.slice(0, 12) + '••••••••' + v.slice(-4);
}

export default function SlackZoomSettings({ onToast }) {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);

  const allKeys = SETTING_GROUPS.flatMap(g => g.items.map(i => i.key));

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', getOrgId())
      .in('setting_key', allKeys);
    if (error) { onToast('設定の取得に失敗しました', 'error'); }
    else {
      const map = {};
      (data || []).forEach(r => { map[r.setting_key] = r.setting_value; });
      setValues(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveField = async (key, val) => {
    const { error } = await supabase
      .from('org_settings')
      .upsert({ org_id: getOrgId(), setting_key: key, setting_value: val, updated_at: new Date().toISOString() }, { onConflict: 'org_id,setting_key' });
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    setValues(prev => ({ ...prev, [key]: val }));
    onToast('保存しました ✓');
  };

  if (loading) return <div style={{ padding: space[10], textAlign: 'center', color: color.gray400 }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      {SETTING_GROUPS.map(group => (
        <Card key={group.title} variant="default" padding="none" style={{ padding: `${space[5]}px ${space[6]}px`, marginBottom: space[5] }}>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[4], paddingBottom: space[2.5], borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
            {group.title}
          </div>
          {group.items.map(item => (
            <div key={item.key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.gray700, marginBottom: 6 }}>{item.label}</div>
              <MaskedInput
                value={values[item.key] || ''}
                placeholder={item.placeholder}
                onSave={(val) => saveField(item.key, val)}
              />
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
