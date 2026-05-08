import { useState } from 'react';
import { C } from '../../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select } from '../../ui';
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

  const textareaStyle = {
    width: '100%', padding: '7px 10px', borderRadius: radius.md,
    border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans,
    outline: 'none', background: color.gray50, color: color.textDark,
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: font.size.xs - 1, fontWeight: font.weight.semibold,
    color: color.navy, marginBottom: 3, display: 'block',
  };

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)', zIndex: 20003,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
        width: 560, maxHeight: '92vh', overflow: 'auto',
        boxShadow: shadow.xl,
      }}>
        <div style={{
          padding: '12px 20px', background: color.success, color: color.white,
          fontWeight: font.weight.bold, fontSize: font.size.md,
        }}>
          アポ獲得 — 詳細記入
          <div style={{
            fontSize: font.size.xs - 1, color: alpha(color.white, 0.85),
            fontWeight: font.weight.normal, marginTop: 2,
          }}>
            {company.company}（{company.business || ''}）
          </div>
        </div>

        <div style={{ padding: '14px 20px' }}>
          {/* 面談日時・形式 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>面談日時 <span style={{ color: color.danger }}>*</span></label>
              <Input
                size="sm"
                type="datetime-local"
                value={meetingAt}
                onChange={e => setMeetingAt(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>形式</label>
              <Select
                size="sm"
                value={meetingMode}
                onChange={e => setMeetingMode(e.target.value)}
                options={[
                  { value: 'online', label: 'オンライン' },
                  { value: 'in_person', label: '対面（先方訪問）' },
                  { value: 'our_office', label: '対面（弊社来訪）' },
                  { value: 'phone', label: '電話' },
                ]}
              />
            </div>
          </div>

          {meetingMode === 'in_person' && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>訪問先住所</label>
              <Input
                size="sm"
                value={meetingPlace}
                onChange={e => setMeetingPlace(e.target.value)}
                placeholder={company.address || ''}
              />
            </div>
          )}

          {/* キーマン担当者情報 */}
          <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 10, marginTop: 10 }}>
            <div style={{
              fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy,
              marginBottom: 8, letterSpacing: font.letterSpacing.wide,
            }}>
              キーマン情報
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>担当者名</label>
                <Input size="sm" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="例: 山田 太郎" />
              </div>
              <div>
                <label style={labelStyle}>役職</label>
                <Input size="sm" value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="例: 代表取締役" />
              </div>
              <div>
                <label style={labelStyle}>メール</label>
                <Input size="sm" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="example@..." />
              </div>
              <div>
                <label style={labelStyle}>電話番号</label>
                <Input size="sm" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
          </div>

          {/* 先方の所感 */}
          <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 10, marginTop: 4 }}>
            <label style={labelStyle}>先方の所感・トーン</label>
            <textarea
              value={impression}
              onChange={e => setImpression(e.target.value)}
              rows={3}
              placeholder="興味の度合い・課題感・予算感・決裁ライン・温度感など"
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
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
              style={{ ...textareaStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{
            marginTop: 12, padding: '8px 10px',
            background: '#FFFBEB', border: `1px solid ${alpha(color.gold, 0.4)}`, borderRadius: radius.sm,
            fontSize: 10, color: color.navy,
          }}>
            保存すると CRM の「面談予定」タブにこのクライアントが自動で登録されます。
            あとから面談予定タブで内容の編集・商談結果の記録ができます。
          </div>
        </div>

        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${color.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
        }}>
          <Button variant="outline" size="sm" onClick={onCancel}>キャンセル</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            style={{ background: color.success, borderColor: color.success }}
          >アポ獲得を保存 → CRM登録</Button>
        </div>
      </div>
    </div>
  );
}
