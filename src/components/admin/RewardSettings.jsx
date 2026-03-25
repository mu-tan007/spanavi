import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';

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
  {
    section: 'おすすめ度スコア配分',
    description: '3つの重みの合計が100%になるように設定してください',
    items: [
      { key: 'score_weight_time',    label: '時間帯スコアの重み',     suffix: '%', min: 0, max: 100 },
      { key: 'score_weight_import',  label: 'リスト鮮度スコアの重み', suffix: '%', min: 0, max: 100 },
      { key: 'score_weight_recency', label: '再架電間隔スコアの重み', suffix: '%', min: 0, max: 100 },
    ],
  },
  {
    section: '架電時間帯',
    items: [
      { key: 'calling_hour_start', label: '架電開始時刻', suffix: '時', min: 0, max: 23 },
      { key: 'calling_hour_end',   label: '架電終了時刻', suffix: '時', min: 1, max: 24 },
    ],
  },
];

const DEFAULT_RANKS = [
  { name: 'スーパースパルタン', threshold: 10000000 },
  { name: 'スパルタン',         threshold: 5000000 },
  { name: 'プレイヤー',          threshold: 2000000 },
  { name: 'トレーニー',          threshold: 0 },
];

const fmtYen = (n) => {
  if (n >= 10000000) return (n / 10000000) + '千万円';
  if (n >= 10000) return (n / 10000) + '万円';
  return n + '円';
};

export default function RewardSettings({ onToast }) {
  const [values, setValues] = useState({});
  const [ranks, setRanks] = useState(DEFAULT_RANKS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('org_settings')
      .select('setting_key, setting_value')
      .eq('org_id', getOrgId());
    if (error) { onToast('設定の取得に失敗しました', 'error'); }
    else {
      const map = {};
      (data || []).forEach(r => { map[r.setting_key] = r.setting_value; });
      setValues(map);
      if (map.rank_definitions) {
        try {
          const parsed = JSON.parse(map.rank_definitions);
          if (Array.isArray(parsed) && parsed.length > 0) setRanks(parsed);
        } catch { /* use defaults */ }
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const updateRank = (idx, field, value) => {
    setRanks(prev => prev.map((r, i) => i === idx ? { ...r, [field]: field === 'threshold' ? Number(value) || 0 : value } : r));
  };

  const addRank = () => {
    setRanks(prev => [...prev, { name: '', threshold: 0 }]);
  };

  const removeRank = (idx) => {
    setRanks(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    const allKeys = FIELDS.flatMap(s => s.items.map(i => i.key));
    const upsertRows = allKeys.map(key => ({
      org_id: getOrgId(),
      setting_key: key,
      setting_value: String(values[key] ?? ''),
      updated_at: new Date().toISOString(),
    }));
    // ランク定義もJSON で保存
    upsertRows.push({
      org_id: getOrgId(),
      setting_key: 'rank_definitions',
      setting_value: JSON.stringify(ranks),
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase
      .from('org_settings')
      .upsert(upsertRows, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('保存しました');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>;

  // スコア配分の合計チェック
  const scoreTotal = ['score_weight_time', 'score_weight_import', 'score_weight_recency']
    .reduce((sum, k) => sum + (Number(values[k]) || 0), 0);
  const scoreWarning = values.score_weight_time != null && scoreTotal !== 100;

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 既存のkey-valueセクション */}
      {FIELDS.map(section => (
        <div key={section.section} style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: section.description ? 6 : 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
            {section.section}
          </div>
          {section.description && <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>{section.description}</p>}
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
          {section.section === 'おすすめ度スコア配分' && scoreWarning && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>合計が {scoreTotal}% です（100% にしてください）</div>
          )}
        </div>
      ))}

      {/* ランク定義セクション */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
          ランク定義
        </div>
        <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>累計売上に基づくランク名と昇格閾値を設定します（上位ランクから順に）</p>

        {ranks.map((rank, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF', width: 20, textAlign: 'center' }}>{idx + 1}</span>
            <input
              type="text"
              value={rank.name}
              onChange={e => updateRank(idx, 'name', e.target.value)}
              placeholder="ランク名"
              style={{ flex: 1, padding: '5px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12 }}
            />
            <input
              type="number"
              value={rank.threshold}
              onChange={e => updateRank(idx, 'threshold', e.target.value)}
              placeholder="閾値（円）"
              style={{ width: 130, padding: '5px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12, textAlign: 'right', fontFamily: "'JetBrains Mono'" }}
            />
            <span style={{ fontSize: 10, color: '#9CA3AF', width: 60 }}>{rank.threshold > 0 ? fmtYen(rank.threshold) + '〜' : '基準なし'}</span>
            <button onClick={() => removeRank(idx)} style={{ border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>×</button>
          </div>
        ))}

        <button onClick={addRank} style={{ padding: '4px 14px', border: '1px dashed #9CA3AF', background: 'transparent', borderRadius: 4, fontSize: 11, color: '#6B7280', cursor: 'pointer', marginTop: 4 }}>+ ランクを追加</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '9px 28px', borderRadius: 4, fontSize: 13, fontWeight: 700,
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
