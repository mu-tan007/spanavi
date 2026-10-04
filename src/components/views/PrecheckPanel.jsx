import { useEffect, useState, useCallback } from 'react';
import { color, space, radius, font } from '../../constants/design';
import { Button, Input, Badge } from '../ui';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import { fetchPrecheckAppointmentByItem, fetchPrecheckEvents, insertPrecheckEvent, updatePreCheckResult } from '../../lib/supabaseWrite';

/**
 * 集中モードの「事前確認」欄。アポ獲得済みの企業にだけ出る。
 *
 * 通常の結果ボタンは企業の状態（アポ獲得）を書き換えてしまい、アポ獲得を押すと
 * アポ登録画面が開いて二重登録になる。そのため事前確認の電話は結果を残す場所がなく、
 * 録音も履歴に残っていなかった。ここで押した結果は precheck_events に入り、
 * 録音・#事前確認 スレッドへの返信・顧客への報告の下書きは後から自動で付く。
 * 企業の状態は変えない。アポの状態は 確認完了→事前確認済 ／ リスケ→リスケ中 ／ キャンセル→キャンセル に変える
 * （事前確認タブの記録画面と同じ対応。どちらも売上の累計には入らない状態なので、累計の付け替えは起きない）。
 * 不在・不通はアポの状態を変えない。
 */
const RESULTS = [
  { label: '確認完了', hint: '例：社長様に直接確認。当日はオンラインで、リンクは携帯にも送ってほしいとのこと' },
  { label: 'リスケ', hint: '例：急な出張のため、10/20（火）14時に変更したいとのご要望' },
  { label: 'キャンセル', hint: '例：工事の現場が始まり多忙で、時間が取れないとのこと' },
  { label: '不在', hint: '例：社長様は外出中。受付の方より、15時頃に戻られるとのこと' },
  { label: '不通', hint: '例：呼び出し音のみで応答なし' },
];
const NEEDS_RECALL = new Set(['不在', '不通']);
const NEXT_STATUS = { '確認完了': '事前確認済', 'リスケ': 'リスケ中', 'キャンセル': 'キャンセル' };
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${DAY_NAMES[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const meetLabel = (appo) => {
  if (!appo?.meeting_date) return '';
  const d = new Date(appo.meeting_date.slice(0, 10) + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${DAY_NAMES[d.getDay()]}）${appo.meeting_time ? ' ' + appo.meeting_time + '〜' : ''}`;
};
const resultVariant = (r) => (r === '確認完了' ? 'success' : r === 'キャンセル' ? 'danger' : r === 'リスケ' ? 'warn' : 'neutral');
const draftLabel = (ev) => {
  if (ev.draft_status === 'pending') return '報告の下書きを作成中';
  if (ev.draft_status === 'created') return 'Gmailに報告の下書きあり';
  if (ev.draft_status === 'ready') return '報告の文面を用意済み（事前確認タブで送信）';
  if (ev.draft_status === 'sent') return '顧客へ報告済み';
  if (ev.draft_status === 'failed') return '報告の下書きを作れませんでした';
  return '';
};

export default function PrecheckPanel({ itemId, clientName, currentUser, members = [], dialedPhone, onBeforeSave, setAppoData }) {
  const [appo, setAppo] = useState(null);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState('');
  const [memo, setMemo] = useState('');
  const [recallAt, setRecallAt] = useState('');
  const [rescheduledAt, setRescheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [playingId, setPlayingId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await fetchPrecheckAppointmentByItem(itemId);
    setAppo(data);
    setEvents(data ? await fetchPrecheckEvents(data.id) : []);
  }, [itemId]);

  useEffect(() => {
    setResult(''); setMemo(''); setRecallAt(''); setRescheduledAt(''); setError(''); setSavedMsg('');
    load();
  }, [load]);

  // 録音・Slack・下書きは毎分の後処理で埋まるので、処理待ちがある間だけ読み直す
  const hasPending = events.some(e => e.recording_status === 'pending' || e.slack_status === 'pending' || e.draft_status === 'pending');
  useEffect(() => {
    if (!hasPending || !appo) return;
    const t = setInterval(async () => setEvents(await fetchPrecheckEvents(appo.id)), 20000);
    return () => clearInterval(t);
  }, [hasPending, appo]);

  if (!appo) return null;

  const save = async () => {
    if (!result) { setError('結果を選んでください'); return; }
    if (['リスケ', 'キャンセル'].includes(result) && !memo.trim()) { setError('リスケ・キャンセルは先方のご事情をメモに書いてください（報告の文面に使います）'); return; }
    setSaving(true); setError(''); setSavedMsg('');
    try {
      onBeforeSave?.();
      const normName = (s) => String(s || '').replace(/[\s　]/g, '');
      const member = members.find(m => typeof m === 'object' && normName(m.name) === normName(currentUser));
      const { error: insErr } = await insertPrecheckEvent({
        appointmentId: appo.id, itemId, result, memo,
        recallAt: NEEDS_RECALL.has(result) && recallAt ? new Date(recallAt).toISOString() : null,
        calledPhone: dialedPhone, callerName: currentUser, callerZoomUserId: member?.zoomUserId || null,
      });
      if (insErr) throw insErr;

      const nextStatus = NEXT_STATUS[result];
      if (nextStatus) {
        const memoText = [appo.pre_check_memo, memo.trim()].filter(Boolean).join('\n');
        const nextRescheduledAt = result === 'リスケ' ? (rescheduledAt || null) : appo.rescheduled_at;
        const nextCancelReason = result === 'キャンセル' ? memo.trim() : appo.cancel_reason;
        const updErr = await updatePreCheckResult(appo.id, {
          preCheckStatus: result, preCheckMemo: memoText, status: nextStatus,
          rescheduledAt: nextRescheduledAt, cancelReason: nextCancelReason,
        });
        if (updErr) throw updErr;
        setAppoData?.(prev => prev.map(a => a._supaId === appo.id ? {
          ...a, status: nextStatus, preCheckStatus: result, preCheckMemo: memoText,
          rescheduledAt: nextRescheduledAt ? String(nextRescheduledAt).slice(0, 16) : '', cancelReason: nextCancelReason || '',
        } : a));
      }
      setSavedMsg(`「${result}」を記録しました。録音とSlackへの返信は1〜3分ほどで自動で付きます。`);
      setResult(''); setMemo(''); setRecallAt(''); setRescheduledAt('');
      await load();
    } catch (e) {
      setError('保存に失敗しました：' + (e?.message || '不明なエラー'));
    } finally {
      setSaving(false);
    }
  };

  const current = RESULTS.find(r => r.label === result);

  return (
    <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}`, borderLeft: `3px solid ${color.gold}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>事前確認</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>面談 {meetLabel(appo)}{clientName ? ` ／ ${clientName}` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Badge variant={appo.status === '事前確認済' ? 'success' : 'neutral'} dot size="sm">{appo.status}</Badge>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: space[1.5], marginBottom: space[2] }}>
        {RESULTS.map(r => (
          <Button key={r.label} size="sm" variant={result === r.label ? 'primary' : 'outline'} onClick={() => { setResult(r.label); setError(''); }}>
            {r.label}
          </Button>
        ))}
      </div>

      {result && (
        <>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder={current?.hint || ''}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', padding: space[2], resize: 'vertical',
              fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark,
              border: `1px solid ${color.border}`, borderRadius: radius.md, outline: 'none', marginBottom: space[2],
            }}
          />
          {NEEDS_RECALL.has(result) && (
            <div style={{ marginBottom: space[2] }}>
              <Input label="かけ直す時刻" type="datetime-local" size="sm" value={recallAt} onChange={e => setRecallAt(e.target.value)} />
            </div>
          )}
          {result === 'リスケ' && (
            <div style={{ marginBottom: space[2] }}>
              <Input label="新しい面談日時（決まっていれば）" type="datetime-local" size="sm" value={rescheduledAt} onChange={e => setRescheduledAt(e.target.value)} />
            </div>
          )}
          {['リスケ', 'キャンセル'].includes(result) && (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[2] }}>
              アポは「{NEXT_STATUS[result]}」になります。日を改めればお会いできそうなら、キャンセルではなくリスケを選んでください。顧客への報告はむー様が行います。
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>記録する</Button>
          </div>
        </>
      )}
      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1.5] }}>{error}</div>}
      {savedMsg && <div style={{ color: color.success, fontSize: font.size.xs, marginTop: space[1.5] }}>{savedMsg}</div>}

      {events.length > 0 && (
        <div style={{ marginTop: space[3], borderTop: `1px solid ${color.borderLight}`, paddingTop: space[2] }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textMid, marginBottom: space[1.5] }}>事前確認の履歴</div>
          {events.map(ev => (
            <div key={ev.id} style={{ padding: `${space[1.5]}px 0`, borderBottom: `1px solid ${color.borderLight}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.xs }}>
                <span style={{ fontFamily: font.family.mono, color: color.textMid }}>{fmt(ev.called_at)}</span>
                <Badge variant={resultVariant(ev.result)} size="sm">{ev.result}</Badge>
                <span style={{ color: color.textMid }}>{ev.caller_name}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {ev.recording_status === 'pending' && <span style={{ color: color.textLight }}>録音を取得中</span>}
                  {ev.recording_status === 'none' && <span style={{ color: color.textLight }}>録音なし</span>}
                  {ev.recording_status === 'found' && ev.recording_url && (
                    <Button size="sm" variant="ghost" onClick={() => setPlayingId(playingId === ev.id ? null : ev.id)}>
                      {playingId === ev.id ? '閉じる' : '録音を再生'}
                    </Button>
                  )}
                </span>
              </div>
              {ev.memo && <div style={{ fontSize: font.size.xs, color: color.textDark, marginTop: 2, whiteSpace: 'pre-wrap' }}>{ev.memo}</div>}
              {ev.recall_at && <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>かけ直し：{fmt(ev.recall_at)}</div>}
              {draftLabel(ev) && <div style={{ fontSize: font.size.xs, color: ev.draft_status === 'failed' ? color.danger : color.textMid, marginTop: 2 }}>{draftLabel(ev)}{ev.draft_status === 'failed' && ev.draft_error ? `（${ev.draft_error}）` : ''}</div>}
              {playingId === ev.id && ev.recording_url && <InlineAudioPlayer url={ev.recording_url} onClose={() => setPlayingId(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
