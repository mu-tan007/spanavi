import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';

const DEFAULT_STATUSES = [
  { id: 'missed',           label: '不通',         excluded: false },
  { id: 'absent',           label: '社長不在',     excluded: false },
  { id: 'reception_block',  label: '受付ブロック', excluded: false },
  { id: 'reception_recall', label: '受付再コール', excluded: false },
  { id: 'ceo_recall',       label: '社長再コール', excluded: false },
  { id: 'appointment',      label: 'アポ獲得',     excluded: true  },
  { id: 'ceo_decline',      label: '社長お断り',   excluded: false },
  { id: 'excluded',         label: '除外',         excluded: true  },
];

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

  if (loading) return <div style={{ padding: 20, color: '#9CA3AF', fontSize: 13 }}>読み込み中...</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${NAVY}`, display: 'inline-block' }}>
        架電ステータス定義
      </div>
      <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 16 }}>架電結果のステータス一覧を定義します。順序はキーボードショートカット（F1〜F8）の割り当て順になります。</p>

      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 4, overflow: 'hidden' }}>
        {/* ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 80px 70px 60px', padding: '8px 14px', background: NAVY, fontSize: 11, fontWeight: 600, color: '#fff', gap: 8 }}>
          <span>#</span>
          <span>ステータスID</span>
          <span>表示ラベル</span>
          <span>除外扱い</span>
          <span>ショートカット</span>
          <span>操作</span>
        </div>

        {statuses.map((status, idx) => (
          <div key={status.id + idx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 180px 80px 70px 60px', padding: '8px 14px', borderBottom: '1px solid #F0F0F0', fontSize: 12, alignItems: 'center', gap: 8, background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
            <span style={{ color: '#9CA3AF', fontSize: 11 }}>{idx + 1}</span>
            <input type="text" value={status.id} onChange={e => updateStatus(idx, 'id', e.target.value)}
              style={{ padding: '3px 6px', border: '1px solid #E5E5E5', borderRadius: 3, fontSize: 11, fontFamily: "'JetBrains Mono'" }} />
            <input type="text" value={status.label} onChange={e => updateStatus(idx, 'label', e.target.value)}
              style={{ padding: '3px 6px', border: '1px solid #E5E5E5', borderRadius: 3, fontSize: 12 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={status.excluded} onChange={e => updateStatus(idx, 'excluded', e.target.checked)} />
              <span style={{ fontSize: 11, color: '#6B7280' }}>{status.excluded ? 'はい' : 'いいえ'}</span>
            </label>
            <span style={{ fontSize: 10, color: '#9CA3AF', fontFamily: "'JetBrains Mono'" }}>
              {idx < 8 ? `F${idx + 1}` : '-'}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => moveStatus(idx, -1)} disabled={idx === 0} style={{ border: '1px solid #E5E5E5', background: '#fff', borderRadius: 3, cursor: 'pointer', padding: '1px 5px', fontSize: 10, color: idx === 0 ? '#D1D5DB' : '#374151' }}>↑</button>
              <button onClick={() => moveStatus(idx, 1)} disabled={idx === statuses.length - 1} style={{ border: '1px solid #E5E5E5', background: '#fff', borderRadius: 3, cursor: 'pointer', padding: '1px 5px', fontSize: 10, color: idx === statuses.length - 1 ? '#D1D5DB' : '#374151' }}>↓</button>
              <button onClick={() => removeStatus(idx)} style={{ border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', borderRadius: 3, cursor: 'pointer', padding: '1px 5px', fontSize: 10 }}>×</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'space-between' }}>
        <button onClick={addStatus} style={{ padding: '6px 16px', border: '1px dashed #9CA3AF', background: 'transparent', borderRadius: 4, fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>+ ステータスを追加</button>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 28px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: saving ? '#9CA3AF' : NAVY, color: '#fff' }}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}
