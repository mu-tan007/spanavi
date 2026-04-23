import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';
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

  if (loading) return <div style={{ padding: 20, color: '#9CA3AF', fontSize: 13 }}>読み込み中...</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
        業種別架電ルール
      </div>
      <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 16 }}>業種ごとの推奨架電時間帯・定休日を設定します。おすすめ度スコアの計算に使用されます。</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map((rule, idx) => (
          <div key={idx} style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 4, padding: '14px 18px' }}>
            {editIdx === idx ? (
              /* 編集モード */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80 }}>業種名</label>
                  <input type="text" value={rule.industry} onChange={e => updateRule(idx, 'industry', e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80 }}>推奨曜日</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAY_LABELS.map((d, di) => (
                      <button key={di} onClick={() => toggleDay(idx, di, 'goodDays')}
                        style={{ width: 28, height: 24, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (rule.goodDays.includes(di) ? '#2E844A' : '#E5E5E5'), background: rule.goodDays.includes(di) ? '#ECFDF5' : '#fff', color: rule.goodDays.includes(di) ? '#2E844A' : '#9CA3AF' }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80 }}>定休日</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAY_LABELS.map((d, di) => (
                      <button key={di} onClick={() => toggleDay(idx, di, 'badDays')}
                        style={{ width: 28, height: 24, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (rule.badDays.includes(di) ? '#EA001E' : '#E5E5E5'), background: rule.badDays.includes(di) ? '#FEF2F2' : '#fff', color: rule.badDays.includes(di) ? '#EA001E' : '#9CA3AF' }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80 }}>推奨時間帯</label>
                  <input type="text" value={rule.goodHours} onChange={e => updateRule(idx, 'goodHours', e.target.value)} placeholder="例: 8:00〜10:00, 16:00〜18:00"
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', width: 80 }}>非推奨時間帯</label>
                  <input type="text" value={rule.badHours} onChange={e => updateRule(idx, 'badHours', e.target.value)} placeholder="例: 10:00〜16:00"
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #E5E5E5', borderRadius: 4, fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => removeRule(idx)} style={{ padding: '4px 12px', border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>削除</button>
                  <button onClick={() => setEditIdx(null)} style={{ padding: '4px 12px', border: '1px solid #E5E5E5', background: '#fff', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>閉じる</button>
                </div>
              </div>
            ) : (
              /* 表示モード */
              <div onClick={() => setEditIdx(idx)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{rule.industry || '(未設定)'}</span>
                  <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 12 }}>
                    推奨: {rule.goodDays.map(d => DAY_LABELS[d]).join('')}
                    {rule.goodHours ? ` / ${rule.goodHours}` : ''}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>クリックで編集</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'space-between' }}>
        <button onClick={addRule} style={{ padding: '6px 16px', border: '1px dashed #9CA3AF', background: 'transparent', borderRadius: 4, fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>+ 業種を追加</button>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 28px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: saving ? '#9CA3AF' : NAVY, color: '#fff' }}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}
