import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #6366F1', fontSize: 12, fontFamily: "'JetBrains Mono'" }}
        />
        <button onClick={confirm} style={sBtnStyle('primary')}>保存</button>
        <button onClick={cancel} style={sBtnStyle()}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
      <div style={{ flex: 1, padding: '6px 10px', background: '#FFFFFF', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12, fontFamily: "'JetBrains Mono'", color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value ? maskValue(value) : <span style={{ color: '#D1D5DB' }}>未設定</span>}
      </div>
      <button onClick={startEdit} style={sBtnStyle()}>編集</button>
    </div>
  );
}

function maskValue(v) {
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return v.slice(0, 12) + '••••••••' + v.slice(-4);
}

const sBtnStyle = (variant = 'default') => ({
  padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap',
  border: variant === 'primary' ? 'none' : '1px solid #E5E5E5',
  background: variant === 'primary' ? NAVY : '#fff',
  color: variant === 'primary' ? '#fff' : '#374151',
});

export default function SlackZoomSettings({ onToast }) {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);

  const allKeys = SETTING_GROUPS.flatMap(g => g.items.map(i => i.key));

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', ORG_ID)
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
      .upsert({ org_id: ORG_ID, setting_key: key, setting_value: val, updated_at: new Date().toISOString() }, { onConflict: 'org_id,setting_key' });
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    setValues(prev => ({ ...prev, [key]: val }));
    onToast('保存しました ✓');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      {SETTING_GROUPS.map(group => (
        <div key={group.title} style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
            {group.title}
          </div>
          {group.items.map(item => (
            <div key={item.key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{item.label}</div>
              <MaskedInput
                value={values[item.key] || ''}
                placeholder={item.placeholder}
                onSave={(val) => saveField(item.key, val)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
