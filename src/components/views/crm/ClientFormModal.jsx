import { C } from '../../../constants/colors';
import VoiceRecorderInline from '../contacts/VoiceRecorderInline';
import { NAVY, GRAY_200, GRAY_50, STATUS_LIST } from './utils';

const inputStyle = {
  width: '100%', padding: '6px 10px', borderRadius: 4,
  border: '1px solid ' + GRAY_200, fontSize: 11, fontFamily: "'Noto Sans JP'",
  outline: 'none', background: GRAY_50,
};
const labelStyle = { fontSize: 10, fontWeight: 600, color: NAVY, marginBottom: 2, display: 'block' };

export default function ClientFormModal({
  mode,                       // 'add' | 'edit'
  form,
  setForm,
  onSave,
  onCancel,
  onDelete,                   // edit のみ
  saving = false,
  rewardMaster = [],
  rewardMap = {},
  pendingContacts = [],
  onClearPendingContacts,
  voiceTargetKind,            // 'client_create' | 'client_update'
  voiceClientId = null,
  onVoiceProcessed,
}) {
  if (!form) return null;

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const rewardIds = [...new Set(rewardMaster.map(r => r.id))].sort();
  const isEdit = mode === 'edit';

  const title = isEdit ? `顧客情報を編集 — ${form.company}` : '新規顧客を追加';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', border: '1px solid ' + GRAY_200, borderRadius: 4, width: 580, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '12px 24px', background: NAVY, borderRadius: '4px 4px 0 0', color: '#fff', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{title}</span>
          <span style={{ display: 'inline-flex' }}>
            <VoiceRecorderInline
              targetKind={voiceTargetKind}
              clientId={voiceClientId}
              onProcessed={onVoiceProcessed}
              onError={msg => alert(msg)}
              size={28}
            />
          </span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {pendingContacts.length > 0 && (
            <div style={{
              marginBottom: 12, padding: '6px 10px',
              fontSize: 10, color: NAVY,
              background: '#FFFBF0', border: '1px solid ' + C.gold + '40',
              borderRadius: 3,
            }}>
              AI から担当者 {pendingContacts.length} 名の追加候補があります。保存時にまとめて登録されます。
              <button
                onClick={onClearPendingContacts}
                style={{
                  background: 'none', border: 'none', color: C.textLight,
                  fontSize: 10, marginLeft: 6, cursor: 'pointer',
                  fontFamily: "'Noto Sans JP', sans-serif", textDecoration: 'underline',
                }}
              >クリア</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>ステータス</label>
              <select value={form.status || ''} onChange={e => u('status', e.target.value)} style={inputStyle}>
                {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>契約</label>
              <select value={form.contract || ''} onChange={e => u('contract', e.target.value)} style={inputStyle}>
                <option value="済">済</option>
                <option value="未">未</option>
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              {isEdit ? (
                <label style={labelStyle}>企業名</label>
              ) : (
                <label style={{ ...labelStyle, color: C.red }}>企業名 <span style={{ fontWeight: 400 }}>*</span></label>
              )}
              <input
                value={form.company || ''}
                onChange={e => u('company', e.target.value)}
                placeholder={isEdit ? '' : '株式会社○○'}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>業界</label>
              <input value={form.industry || ''} onChange={e => u('industry', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>供給目標（件/月）</label>
              <input type="number" value={form.target ?? 0} onChange={e => u('target', Number(e.target.value))} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>報酬体系</label>
              <select value={form.rewardType || ''} onChange={e => u('rewardType', e.target.value)} style={inputStyle}>
                <option value="">-</option>
                {rewardIds.map(id => <option key={id} value={id}>{id} - {rewardMap[id] ? rewardMap[id].name : ''}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>支払サイト</label>
              <input value={form.paySite || ''} onChange={e => u('paySite', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>支払特記事項</label>
              <input value={form.payNote || ''} onChange={e => u('payNote', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>リスト負担</label>
              <select value={form.listSrc || ''} onChange={e => u('listSrc', e.target.value)} style={inputStyle}>
                <option value="">-</option>
                <option value="当社持ち">当社持ち</option>
                <option value="先方持ち">先方持ち</option>
                <option value="両方">両方</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>カレンダー</label>
              <select value={form.calendar || ''} onChange={e => u('calendar', e.target.value)} style={inputStyle}>
                <option value="">-</option>
                <option value="Google">Google</option>
                <option value="Spir">Spir</option>
                <option value="Outlook">Outlook</option>
                <option value="なし">なし</option>
                <option value="調整アポ">調整アポ</option>
                <option value="Google(入力)">Google(入力)</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>連絡手段</label>
              <select value={form.contact || ''} onChange={e => u('contact', e.target.value)} style={inputStyle}>
                <option value="">-</option>
                <option value="LINE">LINE</option>
                <option value="Slack">Slack</option>
                <option value="Chatwork">Chatwork</option>
                <option value="メール">メール</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>メールアドレス</label>
              <input value={form.clientEmail || ''} onChange={e => u('clientEmail', e.target.value)} placeholder="client@example.com" style={inputStyle} />
            </div>

            {form.contact === 'Slack' && (
              <div>
                <label style={labelStyle}>Slack Webhook URL（アポ報告用）</label>
                <input value={form.slackWebhookUrl || ''} onChange={e => u('slackWebhookUrl', e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} />
              </div>
            )}

            {form.contact === 'Chatwork' && (
              <div>
                <label style={labelStyle}>Chatwork ルームID</label>
                <input value={form.chatworkRoomId || ''} onChange={e => u('chatworkRoomId', e.target.value)} placeholder="123456789" style={inputStyle} />
              </div>
            )}

            <div>
              <label style={labelStyle}>Slack Webhook URL（社内報告用）</label>
              <input value={form.slackWebhookUrlInternal || ''} onChange={e => u('slackWebhookUrlInternal', e.target.value)} placeholder="https://hooks.slack.com/services/..." style={inputStyle} />
            </div>

            {(form.calendar === 'Google' || form.calendar === 'Google(入力)') && (
              <div>
                <label style={labelStyle}>Google Calendar ID</label>
                <input value={form.googleCalendarId || ''} onChange={e => u('googleCalendarId', e.target.value)} placeholder="クライアントのGoogleメールアドレス" style={inputStyle} />
              </div>
            )}

            {(form.calendar === 'Spir' || form.calendar === '調整アポ') && (
              <div>
                <label style={labelStyle}>日程調整URL</label>
                <input value={form.schedulingUrl || ''} onChange={e => u('schedulingUrl', e.target.value)} placeholder="https://app.spir.com/..." style={inputStyle} />
              </div>
            )}

            {/* 備考: add は初回面談のみ、edit は3つ */}
            {isEdit ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 12, marginTop: 4 }}>備考</div>
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>初回面談時</label>
                  <textarea value={(form.noteFirst || '').replace(/\\n/g, '\n')} onChange={e => u('noteFirst', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>キックオフミーティング時</label>
                  <textarea value={(form.noteKickoff || '').replace(/\\n/g, '\n')} onChange={e => u('noteKickoff', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div>
                  <label style={labelStyle}>定期ミーティング時</label>
                  <textarea value={(form.noteRegular || '').replace(/\\n/g, '\n')} onChange={e => u('noteRegular', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                </div>
              </div>
            ) : (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>初回面談メモ</label>
                <textarea value={form.noteFirst || ''} onChange={e => u('noteFirst', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid ' + GRAY_200, display: 'flex', justifyContent: isEdit ? 'space-between' : 'flex-end' }}>
          {isEdit && (
            <button
              onClick={onDelete}
              style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #DC2626', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#DC2626', fontFamily: "'Noto Sans JP'" }}
            >
              削除
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid ' + NAVY, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: NAVY, fontFamily: "'Noto Sans JP'" }}
            >
              キャンセル
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 4, border: 'none',
                background: saving ? C.textLight : NAVY,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: "'Noto Sans JP'",
              }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
