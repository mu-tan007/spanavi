import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { CALL_RESULTS } from '../../constants/callResults';
import { color, space, radius, font } from '../../constants/design';
import { Button } from '../ui';

const NAVY = color.navy;

const DEFAULT_STATUSES = CALL_RESULTS;

export default function CallStatusSettings({ onToast }) {
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('org_settings')
      .select('setting_value')
      .eq('org_id', getOrgId())
      .eq('setting_key', 'call_statuses')
      .single();
    if (data?.setting_value) {
      try { setStatuses(JSON.parse(data.setting_value)); } catch { /* use defaults */ }
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
        setting_key: 'call_statuses',
        setting_value: JSON.stringify(statuses),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,setting_key' });
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    onToast('ステータス定義を保存しました');
  };

  const updateStatus = (idx, field, value) => {
    setStatuses(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addStatus = () => {
    setStatuses(prev => [...prev, { id: 'new_' + Date.now(), label: '', excluded: false }]);
  };

  const removeStatus = (idx) => {
    setStatuses(prev => prev.filter((_, i) => i !== idx));
  };

  const moveStatus = (idx, dir) => {
    setStatuses(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  if (loading) return <div style={{ padding: space[5], color: color.gray400, fontSize: font.size.base }}>読み込み中...</div>;

  const cellInputStyle = { padding: `3px 6px`, border: `1px solid ${color.border}`, borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family.mono };
  const cellTextInputStyle = { padding: `3px 6px`, border: `1px solid ${color.border}`, borderRadius: radius.sm, fontSize: font.size.sm };
  const moveBtnStyle = (disabled) => ({ border: `1px solid ${color.border}`, background: color.white, borderRadius: radius.sm, cursor: 'pointer', padding: '1px 5px', fontSize: 10, color: disabled ? color.gray300 : color.gray700 });
  const removeBtnStyle = { border: `1px solid ${color.danger}`, background: 'transparent', color: color.danger, borderRadius: radius.sm, cursor: 'pointer', padding: '1px 5px', fontSize: 10 };

  return (
    <div>
      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[4], paddingBottom: space[2.5], borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
        架電ステータス定義
      </div>
      <p style={{ fontSize: font.size.xs, color: color.gray600, marginBottom: space[4] }}>架電結果のステータス一覧を定義します。順序はキーボードショートカット（F1〜F8）の割り当て順になります。</p>

      <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
        {/* ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 80px 70px 60px', padding: `${space[2]}px 14px`, background: NAVY, fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.white, gap: space[2] }}>
          <span>#</span>
          <span>ステータスID</span>
          <span>表示ラベル</span>
          <span>除外扱い</span>
          <span>ショートカット</span>
          <span>操作</span>
        </div>

        {statuses.map((status, idx) => (
          <div key={status.id + idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 80px 70px 60px', padding: `${space[2]}px 14px`, borderBottom: `1px solid ${color.gray100}`, fontSize: font.size.sm, alignItems: 'center', gap: space[2], background: idx % 2 === 0 ? color.white : color.gray50 }}>
            <span style={{ color: color.gray400, fontSize: font.size.xs }}>{idx + 1}</span>
            <input type="text" value={status.id} onChange={e => updateStatus(idx, 'id', e.target.value)}
              style={cellInputStyle} />
            <input type="text" value={status.label} onChange={e => updateStatus(idx, 'label', e.target.value)}
              style={cellTextInputStyle} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={status.excluded} onChange={e => updateStatus(idx, 'excluded', e.target.checked)} />
              <span style={{ fontSize: font.size.xs, color: color.gray600 }}>{status.excluded ? 'はい' : 'いいえ'}</span>
            </label>
            <span style={{ fontSize: 10, color: color.gray400, fontFamily: font.family.mono }}>
              {idx < 8 ? `F${idx + 1}` : '-'}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => moveStatus(idx, -1)} disabled={idx === 0} style={moveBtnStyle(idx === 0)}>↑</button>
              <button onClick={() => moveStatus(idx, 1)} disabled={idx === statuses.length - 1} style={moveBtnStyle(idx === statuses.length - 1)}>↓</button>
              <button onClick={() => removeStatus(idx)} style={removeBtnStyle}>×</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: space[2.5], marginTop: space[4], justifyContent: 'space-between' }}>
        <button onClick={addStatus} style={{ padding: `6px ${space[4]}px`, border: `1px dashed ${color.gray400}`, background: 'transparent', borderRadius: radius.md, fontSize: font.size.sm, color: color.gray600, cursor: 'pointer' }}>+ ステータスを追加</button>
        <Button variant="primary" onClick={save} disabled={saving} loading={saving}>
          {saving ? '保存中...' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
