import { useState, useEffect } from 'react';
import { C } from '../../../constants/colors';
import { updateClientLeadList } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

// リスト名・業界・スクリプトを編集する軽量モーダル
//   （詳細編集は CRMLeadListDetailView 内のスクリプトエディタで対応するが、
//    こちらは一覧から素早くリネーム・業界変更したいユースケース用）
export default function CRMLeadListEditModal({ list, onClose, onSaved }) {
  const [name, setName] = useState(list?.name || '');
  const [industry, setIndustry] = useState(list?.industry || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(list?.name || '');
    setIndustry(list?.industry || '');
  }, [list?.id]);

  if (!list) return null;

  const handleSave = async () => {
    if (!name.trim()) { alert('リスト名を入力してください'); return; }
    setSaving(true);
    const { error } = await updateClientLeadList(list.id, {
      name: name.trim(),
      industry: industry.trim() || null,
    });
    setSaving(false);
    if (error) {
      alert('保存に失敗しました: ' + (error.message || ''));
      return;
    }
    if (onSaved) onSaved();
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 4,
    border: '1px solid ' + GRAY_200, fontSize: 12, fontFamily: "'Noto Sans JP'",
    outline: 'none', background: GRAY_50, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 4, display: 'block' };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 20001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 20px', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 14 }}>
          リスト情報を編集
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>リスト名 <span style={{ color: C.red }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>業界</label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="例: 製造業" style={inputStyle} />
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: C.textLight }}>
            ※ スクリプトの編集はリスト詳細画面で行えます
          </div>
        </div>
        <div style={{
          padding: '10px 20px', borderTop: '1px solid ' + GRAY_200,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '8px 16px', borderRadius: 4,
            border: '1px solid ' + NAVY, background: '#fff',
            color: NAVY, fontSize: 12, fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 16px', borderRadius: 4, border: 'none',
            background: saving ? C.textLight : NAVY,
            color: '#fff', fontSize: 12, fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
