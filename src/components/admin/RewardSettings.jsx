import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font } from '../../constants/design';
import { Button, Input, Card } from '../ui';

const NAVY = color.navy;

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
    section: '副リーダーボーナス',
    items: [
      { key: 'subleader_bonus_rate', label: 'チーム売上に対する料率', suffix: '%', min: 0, max: 100, step: 0.1 },
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

const DEFAULT_LEADER_TIERS = [
  { threshold: 0,        rate: 0.5 },
  { threshold: 1000000,  rate: 1.0 },
  { threshold: 2000000,  rate: 1.5 },
  { threshold: 3000000,  rate: 2.0 },
  { threshold: 4000000,  rate: 2.5 },
  { threshold: 5000000,  rate: 3.0 },
  { threshold: 6000000,  rate: 3.5 },
  { threshold: 7000000,  rate: 4.0 },
  { threshold: 8000000,  rate: 4.5 },
  { threshold: 9000000,  rate: 5.0 },
  { threshold: 10000000, rate: 5.5 },
];

const fmtYen = (n) => {
  if (n >= 10000000) return (n / 10000000) + '千万円';
  if (n >= 10000) return (n / 10000) + '万円';
  return n + '円';
};

export default function RewardSettings({ onToast }) {
  const [values, setValues] = useState({});
  const [ranks, setRanks] = useState(DEFAULT_RANKS);
  const [leaderTiers, setLeaderTiers] = useState(DEFAULT_LEADER_TIERS);
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
      if (map.leader_bonus_tiers) {
        try {
          const parsed = JSON.parse(map.leader_bonus_tiers);
          if (Array.isArray(parsed) && parsed.length > 0) setLeaderTiers(parsed);
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
    // リーダーボーナス段階料率を保存
    upsertRows.push({
      org_id: getOrgId(),
      setting_key: 'leader_bonus_tiers',
      setting_value: JSON.stringify(leaderTiers),
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase
      .from('org_settings')
      .upsert(upsertRows, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('保存しました');
  };

  if (loading) return <div style={{ padding: space[10], textAlign: 'center', color: color.gray400 }}>読み込み中...</div>;

  // スコア配分の合計チェック
  const scoreTotal = ['score_weight_time', 'score_weight_import', 'score_weight_recency']
    .reduce((sum, k) => sum + (Number(values[k]) || 0), 0);
  const scoreWarning = values.score_weight_time != null && scoreTotal !== 100;

  const sectionCardStyle = { padding: `${space[5]}px ${space[6]}px`, marginBottom: space[5] };
  const sectionTitleStyle = (hasDesc) => ({
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
    color: NAVY,
    marginBottom: hasDesc ? space[1.5] : space[4],
    paddingBottom: space[2.5],
    borderBottom: `2px solid ${NAVY}`,
    display: 'inline-block',
  });
  const descStyle = { fontSize: font.size.xs, color: color.gray600, marginBottom: space[3] + 2 };
  const labelStyle = { fontSize: font.size.base, color: color.gray700, fontWeight: font.weight.medium };
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] };
  const tinyInpStyle = { padding: `5px ${space[2]}px`, border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, fontFamily: font.family.mono };
  const removeBtnStyle = { border: `1px solid ${color.danger}`, background: 'transparent', color: color.danger, borderRadius: radius.md, padding: `2px ${space[2]}px`, fontSize: font.size.xs, cursor: 'pointer' };
  const addItemBtnStyle = { padding: `4px ${space[3] + 2}px`, border: `1px dashed ${color.gray400}`, background: 'transparent', borderRadius: radius.md, fontSize: font.size.xs, color: color.gray600, cursor: 'pointer', marginTop: 4 };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 既存のkey-valueセクション */}
      {FIELDS.map(section => (
        <Card key={section.section} variant="default" padding="none" style={sectionCardStyle}>
          <div style={sectionTitleStyle(!!section.description)}>
            {section.section}
          </div>
          {section.description && <p style={descStyle}>{section.description}</p>}
          {section.items.map(item => (
            <div key={item.key} style={rowStyle}>
              <label style={labelStyle}>{item.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5] }}>
                <div style={{ width: 90 }}>
                  <Input
                    size="sm"
                    type="number"
                    value={values[item.key] ?? ''}
                    min={item.min}
                    max={item.max}
                    onChange={e => handleChange(item.key, e.target.value)}
                    style={{ textAlign: 'right', fontFamily: font.family.mono }}
                  />
                </div>
                <span style={{ fontSize: font.size.sm, color: color.gray600, width: 16 }}>{item.suffix}</span>
              </div>
            </div>
          ))}
          {section.section === 'おすすめ度スコア配分' && scoreWarning && (
            <div style={{ fontSize: font.size.xs, color: color.danger, marginTop: 4 }}>合計が {scoreTotal}% です（100% にしてください）</div>
          )}
        </Card>
      ))}

      {/* リーダーボーナス段階料率セクション */}
      <Card variant="default" padding="none" style={sectionCardStyle}>
        <div style={sectionTitleStyle(true)}>
          リーダーボーナス（段階料率）
        </div>
        <p style={descStyle}>チーム売上に応じた料率を設定します。売上が該当する最も高い閾値の料率が適用されます。</p>

        <div style={{ display: 'flex', gap: space[2], marginBottom: space[2], paddingLeft: 28 }}>
          <span style={{ flex: 1, fontSize: 10, color: color.gray400, fontWeight: font.weight.semibold }}>売上閾値</span>
          <span style={{ width: 80, fontSize: 10, color: color.gray400, fontWeight: font.weight.semibold, textAlign: 'right' }}>料率</span>
          <span style={{ width: 30 }} />
        </div>
        {leaderTiers.map((tier, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
            <span style={{ fontSize: font.size.xs, color: color.gray400, width: 20, textAlign: 'center' }}>{idx + 1}</span>
            <input
              type="number"
              value={tier.threshold}
              onChange={e => setLeaderTiers(prev => prev.map((t, i) => i === idx ? { ...t, threshold: Number(e.target.value) || 0 } : t))}
              style={{ ...tinyInpStyle, flex: 1, textAlign: 'right' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={tier.rate}
                step="0.1"
                min="0"
                max="100"
                onChange={e => setLeaderTiers(prev => prev.map((t, i) => i === idx ? { ...t, rate: parseFloat(e.target.value) || 0 } : t))}
                style={{ ...tinyInpStyle, width: 70, textAlign: 'right' }}
              />
              <span style={{ fontSize: font.size.sm, color: color.gray600 }}>%</span>
            </div>
            <button onClick={() => setLeaderTiers(prev => prev.filter((_, i) => i !== idx))} style={removeBtnStyle}>×</button>
          </div>
        ))}
        <button onClick={() => setLeaderTiers(prev => [...prev, { threshold: 0, rate: 0 }])} style={addItemBtnStyle}>+ 段階を追加</button>
      </Card>

      {/* ランク定義セクション */}
      <Card variant="default" padding="none" style={sectionCardStyle}>
        <div style={sectionTitleStyle(true)}>
          ランク定義
        </div>
        <p style={descStyle}>累計売上に基づくランク名と昇格閾値を設定します（上位ランクから順に）</p>

        {ranks.map((rank, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2.5] }}>
            <span style={{ fontSize: font.size.xs, color: color.gray400, width: 20, textAlign: 'center' }}>{idx + 1}</span>
            <input
              type="text"
              value={rank.name}
              onChange={e => updateRank(idx, 'name', e.target.value)}
              placeholder="ランク名"
              style={{ ...tinyInpStyle, flex: 1, fontFamily: font.family.sans }}
            />
            <input
              type="number"
              value={rank.threshold}
              onChange={e => updateRank(idx, 'threshold', e.target.value)}
              placeholder="閾値（円）"
              style={{ ...tinyInpStyle, width: 130, textAlign: 'right' }}
            />
            <span style={{ fontSize: 10, color: color.gray400, width: 60 }}>{rank.threshold > 0 ? fmtYen(rank.threshold) + '〜' : '基準なし'}</span>
            <button onClick={() => removeRank(idx)} style={removeBtnStyle}>×</button>
          </div>
        ))}

        <button onClick={addRank} style={addItemBtnStyle}>+ ランクを追加</button>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={save} disabled={saving} loading={saving}>
          {saving ? '保存中...' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
