import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { color, space, radius, font, alpha } from '../../constants/design';
import { Button, Input, Card } from '../ui';

const NAVY = color.navy;
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const DEFAULT_RULES = [
  { industry: "建設", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "8:00〜12:00, 13:00〜19:00", badHours: "12:00〜13:00" },
  { industry: "製造", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "8:00〜12:00, 13:00〜19:00", badHours: "12:00〜13:00" },
  { industry: "物流", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "8:00〜12:00, 13:00〜19:00", badHours: "12:00〜13:00" },
  { industry: "IT", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜12:00, 13:00〜17:00", badHours: "12:00〜13:00" },
  { industry: "不動産", goodDays: [1,2,4,5,6], badDays: [0,3], goodHours: "8:00〜12:00, 13:00〜19:00", badHours: "12:00〜13:00" },
  { industry: "調剤薬局", goodDays: [1,2,3,4,5,6], badDays: [0], goodHours: "13:00〜15:00", badHours: "9:00〜13:00, 15:00〜20:00" },
  { industry: "介護", goodDays: [0,1,2,3,4,5,6], badDays: [], goodHours: "8:00〜19:00", badHours: "" },
  { industry: "その他（平日一般）", goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: "8:00〜12:00, 13:00〜19:00", badHours: "12:00〜13:00" },
];

const emptyRule = () => ({ industry: '', goodDays: [1,2,3,4,5], badDays: [0,6], goodHours: '', badHours: '' });

export default function IndustryRuleSettings({ onToast }) {
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editIdx, setEditIdx] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', getOrgId())
      .eq('setting_key', 'industry_rules')
      .single();
    if (data?.setting_value) {
      try { setRules(JSON.parse(data.setting_value)); } catch { /* use defaults */ }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('org_settings')
      .upsert({
        org_id: getOrgId(),
        setting_key: 'industry_rules',
        setting_value: JSON.stringify(rules),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('業種ルールを保存しました');
  };

  const updateRule = (idx, field, value) => {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const toggleDay = (idx, dayNum, listName) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const list = [...r[listName]];
      const pos = list.indexOf(dayNum);
      if (pos >= 0) list.splice(pos, 1); else list.push(dayNum);
      list.sort((a, b) => a - b);
      return { ...r, [listName]: list };
    }));
  };

  const addRule = () => {
    setRules(prev => [...prev, emptyRule()]);
    setEditIdx(rules.length);
  };

  const removeRule = (idx) => {
    setRules(prev => prev.filter((_, i) => i !== idx));
    setEditIdx(null);
  };

  if (loading) return <div style={{ padding: space[5], color: color.gray400, fontSize: font.size.base }}>読み込み中...</div>;

  const labelStyle = { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.gray700, width: 80 };
  const dayBtn = (active, kind) => {
    const accent = kind === 'good' ? color.success : color.danger;
    const bg = kind === 'good' ? alpha(color.success, 0.10) : alpha(color.danger, 0.08);
    return {
      width: 28, height: 24, borderRadius: radius.sm, fontSize: 10, fontWeight: font.weight.semibold, cursor: 'pointer',
      border: `1px solid ${active ? accent : color.border}`,
      background: active ? bg : color.white,
      color: active ? accent : color.gray400,
    };
  };

  return (
    <div>
      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[4], paddingBottom: space[2.5], borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
        業種別架電ルール
      </div>
      <p style={{ fontSize: font.size.xs, color: color.gray600, marginBottom: space[4] }}>業種ごとの推奨架電時間帯・定休日を設定します。おすすめ度スコアの計算に使用されます。</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {rules.map((rule, idx) => (
          <Card key={idx} variant="default" padding="none" style={{ padding: `14px 18px` }}>
            {editIdx === idx ? (
              /* 編集モード */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <label style={labelStyle}>業種名</label>
                  <div style={{ flex: 1 }}>
                    <Input size="sm" type="text" value={rule.industry} onChange={e => updateRule(idx, 'industry', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <label style={labelStyle}>推奨曜日</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAY_LABELS.map((d, di) => (
                      <button key={di} onClick={() => toggleDay(idx, di, 'goodDays')}
                        style={dayBtn(rule.goodDays.includes(di), 'good')}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <label style={labelStyle}>定休日</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAY_LABELS.map((d, di) => (
                      <button key={di} onClick={() => toggleDay(idx, di, 'badDays')}
                        style={dayBtn(rule.badDays.includes(di), 'bad')}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <label style={labelStyle}>推奨時間帯</label>
                  <div style={{ flex: 1 }}>
                    <Input size="sm" type="text" value={rule.goodHours} onChange={e => updateRule(idx, 'goodHours', e.target.value)} placeholder="例: 8:00〜10:00, 16:00〜18:00" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <label style={labelStyle}>非推奨時間帯</label>
                  <div style={{ flex: 1 }}>
                    <Input size="sm" type="text" value={rule.badHours} onChange={e => updateRule(idx, 'badHours', e.target.value)} placeholder="例: 10:00〜16:00" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
                  <Button variant="danger" size="sm" onClick={() => removeRule(idx)}>削除</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditIdx(null)}>閉じる</Button>
                </div>
              </div>
            ) : (
              /* 表示モード */
              <div onClick={() => setEditIdx(idx)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: font.size.base, fontWeight: font.weight.semibold, color: NAVY }}>{rule.industry || '(未設定)'}</span>
                  <span style={{ fontSize: font.size.xs, color: color.gray600, marginLeft: space[3] }}>
                    推奨: {rule.goodDays.map(d => DAY_LABELS[d]).join('')}
                    {rule.goodHours ? ` / ${rule.goodHours}` : ''}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: color.gray400 }}>クリックで編集</span>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: space[2.5], marginTop: space[4], justifyContent: 'space-between' }}>
        <button onClick={addRule} style={{ padding: `6px ${space[4]}px`, border: `1px dashed ${color.gray400}`, background: 'transparent', borderRadius: radius.md, fontSize: font.size.sm, color: color.gray600, cursor: 'pointer' }}>+ 業種を追加</button>
        <Button variant="primary" onClick={save} disabled={saving} loading={saving}>
          {saving ? '保存中...' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
