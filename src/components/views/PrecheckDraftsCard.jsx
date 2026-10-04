import { useEffect, useState } from 'react';
import { color, space, radius, font } from '../../constants/design';
import { Button, Card, Badge } from '../ui';
import { fetchReadyPrecheckDrafts, markPrecheckDraftDone, invokeSendAppoReport, invokeSendPrecheckSlack } from '../../lib/supabaseWrite';

/**
 * 事前確認の報告の文面（Slack・Chatwork で連絡する顧客の分と、Gmail の下書きを作れなかった分）。
 * メールの顧客は Gmail の返信下書きになるのでここには出ない（作れなかったときだけ出す）。
 * 送るのは必ずむー様。インターンの画面からは顧客に何も届かない。
 */
export default function PrecheckDraftsCard({ clientData = [], isAdmin = false }) {
  const [drafts, setDrafts] = useState([]);
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});

  const load = async () => {
    const rows = await fetchReadyPrecheckDrafts();
    setDrafts(rows);
    setTexts(prev => Object.fromEntries(rows.map(r => [r.id, prev[r.id] ?? r.draft_text ?? ''])));
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin || drafts.length === 0) return null;

  const send = async (row) => {
    const cl = clientData.find(c => c._supaId === row.appointment?.client_id);
    setBusy(row.id); setErrors(e => ({ ...e, [row.id]: '' }));
    try {
      let error = null;
      if (row.draft_channel === 'slack' && row.slack_reply_ts) {
        // アポ取得報告のスレッドへ、むー様の名前で返信する（宛先へのメンションは送信時に先頭へ付く）
        const { error: sendErr } = await invokeSendPrecheckSlack(row.id, texts[row.id]);
        if (sendErr) throw new Error(sendErr);
        await load();
        return;
      } else if (row.draft_channel === 'slack') {
        if (!cl?.slackWebhookUrl) throw new Error('返信先のスレッドが見つからず、Slack Webhook URLも未設定です');
        ({ error } = await invokeSendAppoReport({ channel: 'slack', text: texts[row.id], webhook_url: cl.slackWebhookUrl }));
      } else if (row.draft_channel === 'chatwork') {
        if (!cl?.chatworkRoomId) throw new Error('Chatwork ルームIDが未設定です');
        ({ error } = await invokeSendAppoReport({ channel: 'chatwork', text: texts[row.id], room_id: cl.chatworkRoomId }));
      } else {
        throw new Error('メールの顧客です。Gmailでアポ取得報告のスレッドに返信してください（文面はコピーしてお使いください）');
      }
      if (error) throw new Error(typeof error === 'string' ? error : error.message);
      await markPrecheckDraftDone(row.id, 'sent');
      await load();
    } catch (e) {
      setErrors(er => ({ ...er, [row.id]: e.message || '送信に失敗しました' }));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (row) => {
    setBusy(row.id);
    await markPrecheckDraftDone(row.id, 'dismissed');
    await load();
    setBusy(null);
  };

  return (
    <Card padding="md" title="事前確認の報告（送信待ち）" description="インターンの記録から作った文面です。確かめて送信してください" style={{ marginBottom: space[4] }}>
      {drafts.map(row => {
        const cl = clientData.find(c => c._supaId === row.appointment?.client_id);
        const channelLabel = row.draft_channel === 'slack' ? 'Slack' : row.draft_channel === 'chatwork' ? 'Chatwork' : 'メール';
        const destLabel = row.draft_channel === 'slack' && row.slack_reply_ts
          ? `Slack（アポ取得報告のスレッドにむー様の名前で返信${row.slack_reply_mentions ? '・メンション付き' : ''}）`
          : channelLabel;
        return (
          <div key={row.id} style={{ padding: `${space[3]}px 0`, borderTop: `1px solid ${color.borderLight}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1.5], fontSize: font.size.sm }}>
              <span style={{ fontWeight: font.weight.bold, color: color.navy }}>{row.appointment?.company_name}</span>
              <span style={{ color: color.textMid, fontSize: font.size.xs }}>{cl?.company || ''}</span>
              <Badge size="sm" variant={row.result === '確認完了' ? 'success' : row.result === 'キャンセル' ? 'danger' : 'warn'}>{row.result}</Badge>
              <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.textMid }}>送信先：{destLabel}</span>
            </div>
            {row.memo && <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[1.5] }}>メモ（{row.caller_name}）：{row.memo}</div>}
            {row.draft_status === 'failed' && row.draft_error && (
              <div style={{ fontSize: font.size.xs, color: color.danger, marginBottom: space[1.5] }}>{row.draft_error}</div>
            )}
            <textarea
              value={texts[row.id] ?? ''}
              onChange={e => setTexts(t => ({ ...t, [row.id]: e.target.value }))}
              rows={8}
              style={{
                width: '100%', boxSizing: 'border-box', padding: space[2], resize: 'vertical',
                fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark,
                border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none',
              }}
            />
            {errors[row.id] && <div style={{ fontSize: font.size.xs, color: color.danger, marginTop: space[1] }}>{errors[row.id]}</div>}
            <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', marginTop: space[2] }}>
              <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => dismiss(row)}>送らずに片付ける</Button>
              {row.draft_channel !== 'email' && (
                <Button size="sm" variant="primary" loading={busy === row.id} onClick={() => send(row)}>{channelLabel}で送信</Button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
