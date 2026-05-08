import { useState } from 'react';
import { C } from '../../../constants/colors';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

// アポ獲得時に表示する詳細記入モーダル
//   ユーザー要望: 面談日時・担当者名・先方の所感などをここで入力
//   保存内容は call_record.memo + clients(面談予定) に反映される
export default function CRMLeadAppoModal({ company, defaultGetterName, onSubmit, onCancel }) {
  // 初期値: 1週間後の14:00
  const initialDateTime = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(14, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  const [meetingAt, setMeetingAt] = useState(initialDateTime);
  const [meetingMode, setMeetingMode] = useState('online');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [contactName, setContactName] = useState(company?.representative || '');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState(company?.email || '');
  const [contactPhone, setContactPhone] = useState(company?.phone || '');
  const [impression, setImpression] = useState('');
  const [internalMemo, setInternalMemo] = useState('');

  if (!company) return null;

  const handleSave = () => {
    if (!meetingAt) { alert('面談日時を入力してください'); return; }
    onSubmit({
      meetingAt: new Date(meetingAt).toISOString(),
      meetingMode,
      meetingPlace: meetingMode === 'in_person' ? meetingPlace : null,
      contactName,
      contactRole,
      contactEmail,
      contactPhone,
      impression,
      internalMemo,
    });
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
        width: 560, maxHeight: '92vh', overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '12px 20px', background: '#16A34A', color: '#fff', fontWeight: 700, fontSize: 14 }}>
          アポ獲得 — 詳細記入
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 400, marginTop: 2 }}>
            {company.company}（{company.business || ''}）
          </div>
        </div>

        <div style={{ padding: '14px 20px' }}>
          {/* 面談日時・形式 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>面談日時 <span style={{ color: C.red }}>*</span></label>
              <input type="datetime-local" value={meetingAt} onChange={e => setMeetingAt(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>形式</label>
              <select value={meetingMode} onChange={e => setMeetingMode(e.target.value)} style={inputStyle}>
                <option value="online">オンライン</option>
                <option value="in_person">対面（先方訪問）</option>
                <option value="our_office">対面（弊社来訪）</option>
                <option value="phone">電話</option>
              </select>
            </div>
          </div>

          {meetingMode === 'in_person' && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>訪問先住所</label>
              <input value={meetingPlace} onChange={e => setMeetingPlace(e.target.value)} placeholder={company.address || ''} style={inputStyle} />
            </div>
          )}

          {/* キーマン担当者情報 */}
          <div style={{ borderTop: '1px solid ' + GRAY_200, paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 8, letterSpacing: 0.5 }}>
              キーマン情報
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>担当者名</label>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="例: 山田 太郎" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>役職</label>
                <input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="例: 代表取締役" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>メール</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="example@..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>電話番号</label>
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* 先方の所感 */}
          <div style={{ borderTop: '1px solid ' + GRAY_200, paddingTop: 10, marginTop: 4 }}>
            <label style={labelStyle}>先方の所感・トーン</label>
            <textarea
              value={impression}
              onChange={e => setImpression(e.target.value)}
              rows={3}
              placeholder="興味の度合い・課題感・予算感・決裁ライン・温度感など"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* 架電メモ（内部用） */}
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>架電メモ（内部用・任意）</label>
            <textarea
              value={internalMemo}
              onChange={e => setInternalMemo(e.target.value)}
              rows={2}
              placeholder="今回の架電で気になった点、引き継ぎメモ等"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{
            marginTop: 12, padding: '8px 10px',
            background: '#FFFBEB', border: '1px solid ' + C.gold + '60', borderRadius: 3,
            fontSize: 10, color: NAVY,
          }}>
            保存すると CRM の「面談予定」タブにこのクライアントが自動で登録されます。
            あとから面談予定タブで内容の編集・商談結果の記録ができます。
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
            background: '#16A34A', color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Noto Sans JP'",
          }}>アポ獲得を保存 → CRM登録</button>
        </div>
      </div>
    </div>
  );
}
