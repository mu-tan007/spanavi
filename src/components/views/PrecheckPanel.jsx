import { useEffect, useState, useCallback } from 'react';
import { color, space, radius, font } from '../../constants/design';
import { Button, Input, Badge } from '../ui';
import { InlineAudioPlayer } from '../common/InlineAudioPlayer';
import { fetchPrecheckAppointmentByItem, fetchPrecheckEvents, insertPrecheckEvent, updatePreCheckResult, invokeCancelPrecheckEvent, markPrecheckTellDone } from '../../lib/supabaseWrite';

/**
 * 架電ページの「事前確認」欄。アポ獲得済みの企業にだけ出る。
 *
 * 通常の結果ボタンは企業の状態（アポ獲得）を書き換えてしまい、アポ獲得を押すと
 * アポ登録画面が開いて二重登録になる。そのため事前確認の電話は結果を残す場所がなく、
 * 録音も履歴に残っていなかった。ここで押した結果は precheck_events に入り、
 * 録音・#事前確認 スレッドへの返信・顧客への報告の下書きは後から自動で付く。
 * 企業の状態は変えない。アポの状態は 確認完了→事前確認済 ／ リスケ→リスケ中 ／ キャンセル→キャンセル に変える
 * （事前確認タブの記録画面と同じ対応。どちらも売上の累計には入らない状態なので、累計の付け替えは起きない）。
 * 不在・不通はアポの状態を変えない。
 *
 * 取り消し：記録した本人（管理者も可）が、篠宮が報告を送る前なら1件ずつ取り消せる。
 * 下書きの削除と Slack の印は cancel-precheck-event、アポの状態を記録前に戻すのはここ（通常の保存と同じ道）。
 * 同じアポの他の記録（1回目・2回目の不在など）はそのまま残る。
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
  if (ev.draft_status === 'cancelled') return '報告の下書きは取り消しで削除済み';
  return '';
};

export default function PrecheckPanel({ itemId, clientName, currentUser, members = [], dialedPhone, onBeforeSave, setAppoData }) {
  const [appo, setAppo] = useState(null);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState('');
  const [memo, setMemo] = useState('');
  const [recallAt, setRecallAt] = useState('');
  const [rescheduledAt, setRescheduledAt] = useState('');
  const [cancelType, setCancelType] = useState(''); // キャンセルの区分（2026-10-08）
  const [told, setTold] = useState(false); // クライアント様からの伝言を先方に伝えたか（2026-10-08）
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [cancelMsg, setCancelMsg] = useState('');

  const load = useCallback(async () => {
    const { data } = await fetchPrecheckAppointmentByItem(itemId);
    setAppo(data);
    setEvents(data ? await fetchPrecheckEvents(data.id) : []);
  }, [itemId]);

  useEffect(() => {
    setResult(''); setMemo(''); setRecallAt(''); setRescheduledAt(''); setCancelType(''); setTold(false); setError(''); setSavedMsg('');
    load();
  }, [load]);

  // 録音・Slack・下書きは毎分の後処理で埋まるので、処理待ちがある間だけ読み直す
  const hasPending = events.some(e => !e.cancelled_at && (e.recording_status === 'pending' || e.slack_status === 'pending' || e.draft_status === 'pending'));
  useEffect(() => {
    if (!hasPending || !appo) return;
    const t = setInterval(async () => setEvents(await fetchPrecheckEvents(appo.id)), 20000);
    return () => clearInterval(t);
  }, [hasPending, appo]);

  if (!appo) return null;
  const tellPending = !!(appo.precheck_tell || '').trim() && !appo.precheck_tell_done_at;

  const save = async () => {
    if (!result) { setError('結果を選んでください'); return; }
    if (['リスケ', 'キャンセル'].includes(result) && !memo.trim()) { setError('リスケ・キャンセルは先方のご事情をメモに書いてください（報告の文面に使います）'); return; }
    if (result === 'キャンセル' && !cancelType) { setError('キャンセルは「先方都合」か「クライアント都合」かを選んでください'); return; }
    if (result === '確認完了' && tellPending && !told) { setError('「クライアントからの依頼」を先方に伝えたら、チェックを入れてください'); return; }
    setSaving(true); setError(''); setSavedMsg('');
    try {
      onBeforeSave?.();
      // 伝えた記録は、事前確認の記録より先に入れる（報告の下書きに「お伝えしました」を入れるため）
      if (tellPending && told) {
        const tellErr = await markPrecheckTellDone(appo.id);
        if (tellErr) throw tellErr;
      }
      const normName = (s) => String(s || '').replace(/[\s　]/g, '');
      const member = members.find(m => typeof m === 'object' && normName(m.name) === normName(currentUser));
      const { error: insErr } = await insertPrecheckEvent({
        appointmentId: appo.id, itemId, result, memo,
        recallAt: NEEDS_RECALL.has(result) && recallAt ? new Date(recallAt).toISOString() : null,
        calledPhone: dialedPhone, callerName: currentUser, callerZoomUserId: member?.zoomUserId || null,
        prevAppo: {
          status: appo.status, pre_check_status: appo.pre_check_status || null, pre_check_memo: appo.pre_check_memo || null,
          rescheduled_at: appo.rescheduled_at || null, cancel_reason: appo.cancel_reason || null,
        },
      });
      if (insErr) throw insErr;

      const nextStatus = NEXT_STATUS[result];
      if (nextStatus) {
        const memoText = [appo.pre_check_memo, memo.trim()].filter(Boolean).join('\n');
        const nextRescheduledAt = result === 'リスケ' ? (rescheduledAt || null) : appo.rescheduled_at;
        const nextCancelReason = result === 'キャンセル' ? memo.trim() : appo.cancel_reason;
        const updErr = await updatePreCheckResult(appo.id, {
          preCheckStatus: result, preCheckMemo: memoText, status: nextStatus,
          rescheduledAt: nextRescheduledAt, cancelReason: nextCancelReason, cancelType: result === 'キャンセル' ? cancelType : null,
        });
        if (updErr) throw updErr;
        setAppoData?.(prev => prev.map(a => a._supaId === appo.id ? {
          ...a, status: nextStatus, preCheckStatus: result, preCheckMemo: memoText,
          rescheduledAt: nextRescheduledAt ? String(nextRescheduledAt).slice(0, 16) : '', cancelReason: nextCancelReason || '',
        } : a));
      }
      setSavedMsg(`「${result}」を記録しました。録音とSlackへの返信は1〜3分ほどで自動で付きます。`);
      setResult(''); setMemo(''); setRecallAt(''); setRescheduledAt(''); setCancelType(''); setTold(false);
      await load();
    } catch (e) {
      setError('保存に失敗しました：' + (e?.message || '不明なエラー'));
    } finally {
      setSaving(false);
    }
  };

  const current = RESULTS.find(r => r.label === result);

  const normName = (s) => String(s || '').replace(/[\s　]/g, '');
  const canCancel = (ev) => !ev.cancelled_at && ev.draft_status !== 'sent' && normName(ev.caller_name) === normName(currentUser);

  const cancelEvent = async (ev) => {
    setCancelingId(ev.id); setCancelMsg('');
    try {
      const { data, error: cErr } = await invokeCancelPrecheckEvent(ev.id);
      if (cErr) throw new Error(cErr);
      if (data?.restore) {
        const r = data.restore;
        const updErr = await updatePreCheckResult(appo.id, {
          preCheckStatus: r.pre_check_status, preCheckMemo: r.pre_check_memo, status: r.status,
          rescheduledAt: r.rescheduled_at, cancelReason: r.cancel_reason,
        });
        if (updErr) throw updErr;
        setAppoData?.(prev => prev.map(a => a._supaId === appo.id ? {
          ...a, status: r.status, preCheckStatus: r.pre_check_status || '', preCheckMemo: r.pre_check_memo || '',
          rescheduledAt: r.rescheduled_at ? String(r.rescheduled_at).slice(0, 16) : '', cancelReason: r.cancel_reason || '',
        } : a));
      }
      setCancelMsg(`「${ev.result}」の記録を取り消しました。${data?.restore ? `アポは「${data.restore.status}」に戻りました。` : ''}正しい結果を記録し直してください。`);
      setConfirmCancelId(null);
      await load();
    } catch (e) {
      setCancelMsg('取り消せませんでした：' + (e?.message || '不明なエラー'));
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div style={{ padding: space[4], background: color.white, borderRadius: radius.md, border: `1px solid ${color.gray200}`, borderLeft: `3px solid ${color.gold}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy }}>事前確認</span>
        <span style={{ fontSize: font.size.xs, color: color.textMid }}>面談 {meetLabel(appo)}{clientName ? ` ／ ${clientName}` : ''}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Badge variant={appo.status === '事前確認済' ? 'success' : 'neutral'} dot size="sm">{appo.status}</Badge>
        </span>
      </div>

      {(appo.precheck_tell || '').trim() && (
        <div style={{ padding: space[2], marginBottom: space[2], borderRadius: radius.md, background: appo.precheck_tell_done_at ? color.gray50 : color.warnSoft, border: `1px solid ${appo.precheck_tell_done_at ? color.borderLight : color.warn}` }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: space[0.5] }}>
            クライアントからの依頼{appo.precheck_tell_done_at ? '（先方に伝えました）' : '（先方に伝えてください）'}
          </div>
          <div style={{ fontSize: font.size.sm, color: color.textDark, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{appo.precheck_tell}</div>
          {!appo.precheck_tell_done_at && (
            <label style={{ display: 'flex', alignItems: 'center', gap: space[1], marginTop: space[1], fontSize: font.size.xs, color: color.textDark, cursor: 'pointer' }}>
              <input type="checkbox" checked={told} onChange={e => setTold(e.target.checked)} />
              先方に伝えた
            </label>
          )}
        </div>
      )}

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
          {result === 'キャンセル' && (
            <div style={{ marginBottom: space[2] }}>
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 4 }}>どちらの都合か（必須）</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['prospect', '先方（アポ先）都合'], ['client', 'クライアント都合']].map(([k, l]) => (
                  <Button key={k} size="sm" variant={cancelType === k ? 'primary' : 'outline'} onClick={() => setCancelType(k)}>{l}</Button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: color.textLight, marginTop: 4 }}>先方都合なら、面談日から30日たつと誰でもかけ直せるようにリストへ戻ります。クライアント都合は戻しません。</div>
            </div>
          )}
          {['リスケ', 'キャンセル'].includes(result) && (
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: space[2] }}>
              アポは「{NEXT_STATUS[result]}」になります。日を改めればお会いできそうなら、キャンセルではなくリスケを選んでください。クライアントへの報告は篠宮が行います。
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>記録する</Button>
          </div>
        </>
      )}
      {error && <div style={{ color: color.danger, fontSize: font.size.xs, marginTop: space[1.5] }}>{error}</div>}
      {savedMsg && <div style={{ color: color.success, fontSize: font.size.xs, marginTop: space[1.5] }}>{savedMsg}</div>}
      {cancelMsg && <div style={{ color: cancelMsg.startsWith('取り消せません') ? color.danger : color.success, fontSize: font.size.xs, marginTop: space[1.5] }}>{cancelMsg}</div>}

      {events.length > 0 && (
        <div style={{ marginTop: space[3], borderTop: `1px solid ${color.borderLight}`, paddingTop: space[2] }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.textMid, marginBottom: space[1.5] }}>事前確認の履歴</div>
          {events.map(ev => (
            <div key={ev.id} style={{ padding: `${space[1.5]}px 0`, borderBottom: `1px solid ${color.borderLight}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.xs }}>
                <span style={{ fontFamily: font.family.mono, color: color.textMid }}>{fmt(ev.called_at)}</span>
                <Badge variant={ev.cancelled_at ? 'neutral' : resultVariant(ev.result)} size="sm">{ev.result}</Badge>
                {ev.cancelled_at && <Badge variant="neutral" size="sm">取り消し済み</Badge>}
                <span style={{ color: color.textMid, textDecoration: ev.cancelled_at ? 'line-through' : 'none' }}>{ev.caller_name}</span>
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
              {canCancel(ev) && (
                confirmCancelId === ev.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[1], fontSize: font.size.xs, color: color.danger, flexWrap: 'wrap' }}>
                    <span>この記録を取り消しますか？下書きも消え、アポの状態も記録の前に戻ります。</span>
                    <Button size="sm" variant="danger" loading={cancelingId === ev.id} onClick={() => cancelEvent(ev)}>取り消す</Button>
                    <Button size="sm" variant="outline" disabled={cancelingId === ev.id} onClick={() => setConfirmCancelId(null)}>やめる</Button>
                  </div>
                ) : (
                  <div style={{ marginTop: space[1] }}>
                    <Button size="sm" variant="ghost" onClick={() => { setConfirmCancelId(ev.id); setCancelMsg(''); }}>この記録を取り消す</Button>
                  </div>
                )
              )}
              {ev.cancelled_at && ev.cancelled_by && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 2 }}>{ev.cancelled_by}さんが取り消し（{fmt(ev.cancelled_at)}）</div>}
              {playingId === ev.id && ev.recording_url && <InlineAudioPlayer url={ev.recording_url} onClose={() => setPlayingId(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
