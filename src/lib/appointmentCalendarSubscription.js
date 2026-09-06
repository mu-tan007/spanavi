import { supabase } from './supabase';
import { fetchContactCalendarScope } from './appointmentCalendar';
import { APPOINTMENTS_CHANGED_EVENT } from './appointmentEvents';
import { isContactCalendarChange } from '../utils/appointmentCalendar';

let channelNumber = 0;

// 他の利用者の保存はDB通知、自分の保存は同一タブの保存成功通知から取り込む。
// DELETEは旧行のIDだけ届く場合があるので、表示済みのIDと照合する。
export function subscribeContactCalendar({ clientId, contactId, getSnapshot, onChange, onConnection }) {
  let stopped = false;
  let channel;
  let scope;
  const pending = [];
  const receive = change => {
    if (stopped) return;
    if (!scope) { pending.push(change); return; }
    if (isContactCalendarChange(change, scope, getSnapshot())) onChange();
  };
  const localChange = event => receive(event.detail);
  window.addEventListener(APPOINTMENTS_CHANGED_EVENT, localChange);

  fetchContactCalendarScope({ clientId, contactId }).then(result => {
    if (stopped) return;
    scope = result;
    pending.splice(0).forEach(receive);
    channel = supabase.channel(`appointment-calendar-${contactId}-${++channelNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments', filter: `client_id=eq.${clientId}` }, receive)
      // 担当案件やクライアントを移したUPDATEも、表示済みIDに当たれば旧表示を取り除く。
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `org_id=eq.${scope.orgId}` }, receive)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'appointments' }, receive)
      .subscribe(status => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          onConnection('');
          // 初回接続まで／切断中の取りこぼしを補完。表示は消さず照合する。
          onChange();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          onConnection('自動反映に接続できません。「更新」で最新の予定を確認してください。');
        }
      });
  }).catch(() => {
    if (!stopped) onConnection('自動反映に接続できません。「更新」で最新の予定を確認してください。');
  });

  return () => {
    stopped = true;
    pending.length = 0;
    window.removeEventListener(APPOINTMENTS_CHANGED_EVENT, localChange);
    if (channel) void supabase.removeChannel(channel);
  };
}
