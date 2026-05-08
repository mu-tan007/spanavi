import { useState } from 'react';
import { color, space, radius, font, alpha } from '../../../constants/design';
import VoiceRecorderInline from '../contacts/VoiceRecorderInline';
import { insertContactMemoEvent } from '../../../lib/supabaseWrite';
import CRMQuickScheduleModal from './CRMQuickScheduleModal';
import CRMMeetingReportModal from './CRMMeetingReportModal';
import { NAVY, GRAY_200, composeEmailDraft } from './utils';

function ActionButton({ label, hint, onClick, disabled, color: btnColor = NAVY, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint || label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%',
        padding: '10px 12px',
        borderRadius: radius.md,
        border: '1px solid ' + (disabled ? GRAY_200 : btnColor),
        background: disabled ? color.gray50 : color.white,
        color: disabled ? color.textLight : btnColor,
        fontSize: font.size.sm, fontWeight: font.weight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: font.family.sans,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = alpha(btnColor, 0.04); }}
      onMouseLeave={e => { e.currentTarget.style.background = disabled ? color.gray50 : color.white; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        {children}
      </span>
      <span style={{ fontSize: font.size.md, fontWeight: font.weight.normal, opacity: 0.5 }}>›</span>
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
        marginBottom: space[3],
        padding: space[3],
        background: color.gray50,
        border: '1px solid ' + GRAY_200,
        borderRadius: radius.md,
      }}>
        <div style={{
          fontSize: font.size.xs - 1, fontWeight: font.weight.bold, color: NAVY, letterSpacing: 1,
          marginBottom: space[2],
        }}>アクション</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
          <ActionButton
            label="メール送信"
            hint={canEmail ? `宛先: ${draft.to}` : '主担当のメールアドレス未登録'}
            disabled={!canEmail}
            onClick={handleEmail}
          >
            <span style={{
              fontSize: font.size.xs, fontWeight: font.weight.bold, color: canEmail ? NAVY : color.textLight,
              border: '1px solid ' + (canEmail ? NAVY : color.textLight),
              borderRadius: radius.sm, padding: '1px 6px', minWidth: 28, textAlign: 'center',
            }}>@</span>
            メール送信
          </ActionButton>

          <ActionButton
            label="商談予定を入れる"
            hint="次回接点予定日とメモを記録"
            onClick={() => setScheduleOpen(true)}
          >
            <span style={{
              fontSize: font.size.xs, fontWeight: font.weight.bold, color: NAVY,
              border: '1px solid ' + NAVY,
              borderRadius: radius.sm, padding: '1px 6px', minWidth: 28, textAlign: 'center',
            }}>予</span>
            商談予定を入れる
          </ActionButton>

          {/* 商談結果記録（面談予定のときのみ表示） */}
          {client.status === '面談予定' && (
            <ActionButton
              label="商談結果を記録"
              hint="受注/保留/ブレイクを選んで議事録を残す"
              color={color.success}
              onClick={() => setReportOpen(true)}
            >
              <span style={{
                fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.success,
                border: '1px solid ' + color.success,
                borderRadius: radius.sm, padding: '1px 6px', minWidth: 28, textAlign: 'center',
              }}>結</span>
              商談結果を記録
            </ActionButton>
          )}

          {/* メモ録音ボタン: VoiceRecorderInline を埋め込み */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: radius.md,
            border: '1px solid ' + NAVY,
            background: color.white,
            color: NAVY,
            fontSize: font.size.sm, fontWeight: font.weight.semibold,
            fontFamily: font.family.sans,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <span style={{
                fontSize: font.size.xs, fontWeight: font.weight.bold, color: NAVY,
                border: '1px solid ' + NAVY,
                borderRadius: radius.sm, padding: '1px 6px', minWidth: 28, textAlign: 'center',
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
            marginTop: space[2], fontSize: font.size.xs - 1, color: NAVY,
            padding: '6px 10px', background: '#FFFBEB',
            border: '1px solid ' + alpha(color.gold, 0.4), borderRadius: radius.sm,
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
