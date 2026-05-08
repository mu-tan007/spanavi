import { useState } from 'react';
import { C } from '../../../constants/colors';
import VoiceRecorderInline from '../contacts/VoiceRecorderInline';
import { insertContactMemoEvent } from '../../../lib/supabaseWrite';
import CRMQuickScheduleModal from './CRMQuickScheduleModal';
import CRMMeetingReportModal from './CRMMeetingReportModal';
import { NAVY, GRAY_200, composeEmailDraft } from './utils';

function ActionButton({ label, hint, onClick, disabled, color = NAVY, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint || label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%',
        padding: '10px 12px',
        borderRadius: 4,
        border: '1px solid ' + (disabled ? GRAY_200 : color),
        background: disabled ? '#F8F9FA' : '#fff',
        color: disabled ? C.textLight : color,
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Noto Sans JP'",
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = color + '0a'; }}
      onMouseLeave={e => { e.currentTarget.style.background = disabled ? '#F8F9FA' : '#fff'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {children}
      </span>
      <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.5 }}>›</span>
    </button>
  );
}

export default function CRMActionPanel({
  client,
  primaryContact,
  currentUser,
  setClientData,
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [memoToast, setMemoToast] = useState(null);

  if (!client) return null;

  const draft = composeEmailDraft(client, primaryContact);
  const canEmail = !!draft.to;

  const handleEmail = () => {
    if (!canEmail) {
      alert('主担当のメールアドレスが登録されていません。担当者の編集から設定してください。');
      return;
    }
    window.open(draft.mailto, '_blank');
  };

  const handleVoiceProcessed = async (result) => {
    // VoiceRecorderInline は targetKind='client_update' のとき
    // 自動でメモ保存しないため、ここで明示的に contact_memo_events に記録する
    if (!primaryContact?.id) {
      setMemoToast('担当者が未登録のため記録できませんでした');
      setTimeout(() => setMemoToast(null), 4000);
      return;
    }
    const ext = result?.ai_extracted || {};
    const summary = ext.summary || result?.transcript || '';
    if (!summary) return;
    try {
      await insertContactMemoEvent({
        contactId: primaryContact.id,
        bodyMd: summary,
        rawTranscript: result?.transcript || null,
        source: 'voice_ai',
        authorName: currentUser || '',
      });
      setMemoToast('メモを記録しました');
      setTimeout(() => setMemoToast(null), 3000);
    } catch (e) {
      console.warn('[CRM ActionPanel] memo save failed', e);
      setMemoToast('メモ保存に失敗しました');
      setTimeout(() => setMemoToast(null), 4000);
    }
  };

  return (
    <>
      <div style={{
        marginBottom: 12,
        padding: '12px',
        background: '#FAFAFA',
        border: '1px solid ' + GRAY_200,
        borderRadius: 4,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: NAVY, letterSpacing: 1,
          marginBottom: 8,
        }}>アクション</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ActionButton
            label="メール送信"
            hint={canEmail ? `宛先: ${draft.to}` : '主担当のメールアドレス未登録'}
            disabled={!canEmail}
            onClick={handleEmail}
          >
            <span style={{
              fontSize: 11, fontWeight: 700, color: canEmail ? NAVY : C.textLight,
              border: '1px solid ' + (canEmail ? NAVY : C.textLight),
              borderRadius: 2, padding: '1px 6px', minWidth: 28, textAlign: 'center',
            }}>@</span>
            メール送信
          </ActionButton>

          <ActionButton
            label="商談予定を入れる"
            hint="次回接点予定日とメモを記録"
            onClick={() => setScheduleOpen(true)}
          >
            <span style={{
              fontSize: 11, fontWeight: 700, color: NAVY,
              border: '1px solid ' + NAVY,
              borderRadius: 2, padding: '1px 6px', minWidth: 28, textAlign: 'center',
            }}>予</span>
            商談予定を入れる
          </ActionButton>

          {/* 商談結果記録（面談予定のときのみ表示） */}
          {client.status === '面談予定' && (
            <ActionButton
              label="商談結果を記録"
              hint="受注/保留/ブレイクを選んで議事録を残す"
              color="#16A34A"
              onClick={() => setReportOpen(true)}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#16A34A',
                border: '1px solid #16A34A',
                borderRadius: 2, padding: '1px 6px', minWidth: 28, textAlign: 'center',
              }}>結</span>
              商談結果を記録
            </ActionButton>
          )}

          {/* メモ録音ボタン: VoiceRecorderInline を埋め込み */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: 4,
            border: '1px solid ' + NAVY,
            background: '#fff',
            color: NAVY,
            fontSize: 12, fontWeight: 600,
            fontFamily: "'Noto Sans JP'",
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: NAVY,
                border: '1px solid ' + NAVY,
                borderRadius: 2, padding: '1px 6px', minWidth: 28, textAlign: 'center',
              }}>録</span>
              メモ録音
            </span>
            <VoiceRecorderInline
              targetKind="client_update"
              clientId={client._supaId || null}
              onProcessed={handleVoiceProcessed}
              onError={msg => alert(msg)}
              size={24}
            />
          </div>
        </div>

        {memoToast && (
          <div style={{
            marginTop: 8, fontSize: 10, color: NAVY,
            padding: '6px 10px', background: '#FFFBEB',
            border: '1px solid ' + C.gold + '60', borderRadius: 3,
          }}>{memoToast}</div>
        )}
      </div>

      {scheduleOpen && (
        <CRMQuickScheduleModal
          client={client}
          primaryContact={primaryContact}
          currentUser={currentUser}
          setClientData={setClientData}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {}}
        />
      )}

      {reportOpen && (
        <CRMMeetingReportModal
          client={client}
          primaryContact={primaryContact}
          currentUser={currentUser}
          setClientData={setClientData}
          onClose={() => setReportOpen(false)}
          onSaved={() => {}}
        />
      )}
    </>
  );
}
