import { useState } from 'react';
import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

// 再コール（受付再コール / キーマン再コール）時に予定日時を入力するモーダル
export default function CRMLeadRecallModal({ company, statusLabel, onSubmit, onCancel }) {
  // 初期値: 翌営業日の10:00
  const initialDateTime = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);  // 土曜→月曜
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);  // 日曜→月曜
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  const [recallAt, setRecallAt] = useState(initialDateTime);
  const [memo, setMemo] = useState('');

  if (!company) return null;

  const handleSave = () => {
    if (!recallAt) { alert('再コール予定日時を入力してください'); return; }
    onSubmit({ recallAt: new Date(recallAt).toISOString(), memo });
  };

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: 4,
    border: '1px solid ' + GRAY_200, fontSize: 12, fontFamily: "'Noto Sans JP'",
    outline: 'none', background: GRAY_50, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 3, display: 'block' };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)', zIndex: 20003,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 20px', background: '#B8860B', color: '#fff', fontWeight: 700, fontSize: 14 }}>
          {statusLabel || '再コール'} — 予定日時
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 400, marginTop: 2 }}>
            {company.company}
          </div>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>再コール予定日時 <span style={{ color: C.red }}>*</span></label>
            <input type="datetime-local" value={recallAt} onChange={e => setRecallAt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>引き継ぎメモ（任意）</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={3}
              placeholder="先方の言葉、再コール時に伝えたい内容など"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div style={{
          padding: '10px 20px', borderTop: '1px solid ' + GRAY_200,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: 4,
            border: '1px solid ' + NAVY, background: '#fff',
            color: NAVY, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            fontFamily: "'Noto Sans JP'",
          }}>キャンセル</button>
          <button onClick={handleSave} style={{
            padding: '8px 18px', borderRadius: 4, border: 'none',
            background: '#B8860B', color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}>記録する</button>
        </div>
      </div>
    </div>
  );
}
