import { useState } from 'react';
import { C } from '../../../constants/colors';
import { updateClientNextContactAt, insertContactMemoEvent } from '../../../lib/supabaseWrite';
import { NAVY, GRAY_200, GRAY_50 } from './utils';

export default function CRMQuickScheduleModal({
  client,
  primaryContact,
  currentUser,
  onSaved,
  onClose,
  setClientData,
}) {
  const initialDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const [date, setDate] = useState(
    client?.nextContactAt ? String(client.nextContactAt).slice(0, 10) : initialDate
  );
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  if (!client) return null;

  const handleSave = async () => {
    if (!date) { alert('日付を入力してください'); return; }
    if (!client._supaId) { alert('クライアント ID が取れていません'); onClose(); return; }
    setSaving(true);
    const isoDate = new Date(date + 'T09:00:00').toISOString();

    // 1) next_contact_at 更新
    const { error: e1 } = await updateClientNextContactAt(client._supaId, isoDate);
    if (e1) {
      setSaving(false);
      alert('予定の保存に失敗しました: ' + (e1.message || ''));
      return;
    }
    if (setClientData) {
      setClientData(prev => prev.map(x =>
        x._supaId === client._supaId ? { ...x, nextContactAt: isoDate } : x
      ));
    }

    // 2) メモを Activity Timeline に記録（主担当があるときのみ）
    if (memo.trim() && primaryContact?.id) {
      const body = `[商談予定: ${date}] ${memo.trim()}`;
      try {
        await insertContactMemoEvent({
          contactId: primaryContact.id,
          bodyMd: body,
          source: 'schedule',
          authorName: currentUser || '',
        });
      } catch (e) {
        console.warn('[CRM] schedule memo save failed', e);
      }
    }

    setSaving(false);
    if (onSaved) onSaved({ date: isoDate, memo: memo.trim() });
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 4,
    border: '1px solid ' + GRAY_200,
    fontSize: 12, fontFamily: "'Noto Sans JP'",
    outline: 'none', background: GRAY_50,
  };
  const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 4, display: 'block' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 20001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4,
          width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 20px', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 14 }}>
          商談予定を入れる
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 400, marginTop: 2 }}>
            {client.company}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>次回接点予定日</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              メモ（任意）
              {!primaryContact?.id && (
                <span style={{ color: C.textLight, fontWeight: 400, marginLeft: 6 }}>
                  ※ 担当者未登録のためタイムラインには残りません
                </span>
              )}
            </label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={4}
              placeholder="商談の趣旨・先方の状況など"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div style={{
          padding: '10px 20px', borderTop: '1px solid ' + GRAY_200,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 4,
              border: '1px solid ' + NAVY, background: '#fff',
              color: NAVY, fontSize: 12, fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP'",
            }}
          >キャンセル</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 4, border: 'none',
              background: saving ? C.textLight : NAVY,
              color: '#fff', fontSize: 12, fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP'",
            }}
          >{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
