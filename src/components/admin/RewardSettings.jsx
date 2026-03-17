import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const FIELDS = [
  {
    section: 'ランク別インセンティブ率',
    items: [
      { key: 'reward_rate_trainee',       label: 'トレーニー',       suffix: '%', min: 0, max: 100 },
      { key: 'reward_rate_player',        label: 'プレイヤー',        suffix: '%', min: 0, max: 100 },
      { key: 'reward_rate_spartan',       label: 'スパルタン',        suffix: '%', min: 0, max: 100 },
      { key: 'reward_rate_super_spartan', label: 'スーパースパルタン', suffix: '%', min: 0, max: 100 },
    ],
  },
  {
    section: 'チームボーナス',
    items: [
      { key: 'team_bonus_rate',            label: 'チームボーナス率',        suffix: '%', min: 0, max: 100 },
      { key: 'team_bonus_leader_ratio',    label: 'リーダー配分',            suffix: '%', min: 0, max: 100 },
      { key: 'team_bonus_subleader_ratio', label: 'サブリーダー配分',        suffix: '%', min: 0, max: 100 },
    ],
  },
  {
    section: 'アポイント単価',
    items: [
      { key: 'appo_fee_under_500m', label: '5億円未満',       suffix: '円', min: 0, max: 9999999 },
      { key: 'appo_fee_500m_to_1b', label: '5億円〜10億円', suffix: '円', min: 0, max: 9999999 },
    ],
  },
];

export default function RewardSettings({ onToast }) {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', ORG_ID);
    if (error) { onToast('設定の取得に失敗しました', 'error'); }
    else {
      const map = {};
      (data || []).forEach(r => { map[r.setting_key] = r.setting_value; });
      setValues(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const save = async () => {
    setSaving(true);
    const allKeys = FIELDS.flatMap(s => s.items.map(i => i.key));
    const upsertRows = allKeys.map(key => ({
      org_id: ORG_ID,
      setting_key: key,
      setting_value: String(values[key] ?? ''),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('org_settings')
      .upsert(upsertRows, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('保存しました ✓');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      {FIELDS.map(section => (
        <div key={section.section} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${GOLD}`, display: 'inline-block' }}>
            {section.section}
          </div>
          {section.items.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{item.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={values[item.key] ?? ''}
                  min={item.min}
                  max={item.max}
                  onChange={e => handleChange(item.key, e.target.value)}
                  style={{
                    width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid #E5E5E5',
                    fontSize: 14, textAlign: 'right', fontFamily: "'JetBrains Mono'",
                  }}
                />
                <span style={{ fontSize: 12, color: '#6B7280', width: 16 }}>{item.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '9px 28px', borderRadius: 6, fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', border: 'none',
            background: saving ? '#9CA3AF' : NAVY, color: '#fff',
            fontFamily: "'Noto Sans JP'",
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}
