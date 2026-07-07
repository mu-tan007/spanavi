import { useState } from 'react';
import { supabase } from '../../../../../lib/supabase';

// ============================================================
// セッション完了処理 共通フック
// ----------------------------------------------------------------
// SessionCompleteFlow から完了処理を抽出したもの。
// 顧客詳細「セッション管理」タブでは、動画・AI議事録カードの「スキップして完了」ボタンと
// 完了フローの「セッション完了」ボタンが同じ完了処理を共有するため、ロジックを一本化する。
//
// 完了時の副作用（役割分離）:
//   - 対象セッションを completed に更新
//   - 次回(第N+1回)が not_started なら next_up に昇格（第8回まで）
//   - 顧客の current_session_no / progress_percent / status を更新
//   - キックオフ(第0回)完了時はキックオフヒアリング(70問)を Slack 自動配信
//   - 事後課題（固定＝予定日時後cron / 変動＝事後課題タブ）はここでは公開しない
// ============================================================

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function formatJpDate(d) {
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function useSessionCompletion({ session, customerId, detail, onCompleted }) {
  const [completing, setCompleting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  const isKickoff = session?.session_no === 0;

  // キックオフ完了時にキックオフヒアリング(70問) を受講生に配信する。
  // 第1回セッション開始日時の3日前 23:59 を deadline_at にセット。
  async function publishKickoffHearing() {
    if (!detail) return { ok: false, reason: 'detail がないため自動配信できません。手動でヒアリングシートタブから配信してください。' };
    const kHearing = detail.kickoffHearingSession;
    const slack = detail.slack;
    const session1At = detail.kickoff?.session_1_start_at;

    if (!kHearing) return { ok: false, reason: 'キックオフヒアリングセッションが見つかりません。' };
    if (kHearing.status !== 'unnotified') {
      return { ok: true, alreadyNotified: true };
    }
    if (!slack?.channel_id) {
      return { ok: false, reason: '受講生のSlackチャンネルが未作成のため自動配信できません。チャンネル作成後にヒアリングシートタブから手動配信してください。' };
    }
    if (!session1At) {
      return { ok: false, reason: '第1回セッション開始日時が未設定のためキックオフヒアリングを配信できません。' };
    }

    const sess1 = new Date(session1At);
    const deadline = new Date(sess1);
    deadline.setDate(deadline.getDate() - 3);
    deadline.setHours(23, 59, 0, 0);
    if (deadline.getTime() <= Date.now()) {
      return { ok: false, reason: `計算された提出期限 ${formatJpDate(deadline)} が既に過ぎています。日程を見直してください。` };
    }
    const deadlineDisplay = formatJpDate(deadline);
    const customerName = detail.customer?.member?.name || detail.customer?.nickname || '受講生';
    const hearingUrl = `${window.location.origin}/spacareer`;

    const { data, error: invokeErr } = await supabase.functions.invoke('spacareer-slack-notify', {
      body: {
        org_id: detail.customer.org_id,
        customer_id: detail.customer.id,
        notify_key: 'kickoff_hearing_published',
        vars: { customer_name: customerName, hearing_url: hearingUrl, deadline: deadlineDisplay },
      },
    });
    if (invokeErr) return { ok: false, reason: `Slack通知失敗: ${invokeErr.message || invokeErr}` };
    if (data && data.ok === false) return { ok: false, reason: `Slack通知失敗: ${data.error || 'unknown'}` };

    const { error: updErr } = await supabase
      .from('spacareer_kickoff_hearing_sessions')
      .update({
        status: 'unstarted',
        notified_at: new Date().toISOString(),
        deadline_at: deadline.toISOString(),
      })
      .eq('id', kHearing.id);
    if (updErr) return { ok: false, reason: `セッション更新失敗: ${updErr.message || updErr}` };

    return { ok: true, deadlineDisplay };
  }

  // force=true のときは動画/議事録/ヒアリングの必須ゲートを無視して完了させる
  // （テスト用途や、録画なしで進めたいケース向け）。
  // 呼び出し側で canComplete を判定してから complete(false) を呼ぶこと。
  async function complete(force = false) {
    if (!session) return;
    if (session.status === 'completed') return;
    setCompleting(true); setErr(null);
    try {
      const now = new Date().toISOString();

      const { error: e1 } = await supabase.from('spacareer_sessions')
        .update({ status: 'completed', completed_at: now }).eq('id', session.id);
      if (e1) throw e1;

      // 次回昇格・進捗更新・卒業判定は DBトリガーに一本化して任せる
      //   fn_spacareer_advance_next_session → reset_next_up（最も若い未実施を next_up に）
      //   fn_spacareer_sync_customer_progress → recalc_progress（完了/全セッション数で進捗）
      // 旧実装はここで session_no+1 を maybeSingle で昇格していたが、応用コースは
      // 同一 session_no に (1)(2) の2行があるため maybeSingle がエラーになり、さらに /9 固定の
      // 進捗計算がトリガーの正しい値を上書きしていた。フロントでの二重更新を廃止する。
      const nextNo = (session.session_no ?? 0) + 1;

      // キックオフ(第0回)完了時はキックオフヒアリング配信を自動発火。
      // 第1〜7回の事後課題は「セッション完了」では生成・公開しない（役割分離）。
      if (isKickoff) {
        const publishResult = await publishKickoffHearing();
        if (publishResult.ok) {
          if (publishResult.alreadyNotified) {
            setLastResult({ kind: 'kickoff_done_already_notified' });
          } else {
            setLastResult({ kind: 'kickoff_done_with_notify', deadlineDisplay: publishResult.deadlineDisplay });
          }
        } else {
          // セッション完了自体は成功しているので、ユーザーに警告だけ出す
          setLastResult({ kind: 'kickoff_done_notify_failed', reason: publishResult.reason });
        }
      } else {
        setLastResult({ kind: 'session_completed' });
      }

      onCompleted && onCompleted({ event: 'completed', nextSessionNo: nextNo });
    } catch (e) {
      console.error('[useSessionCompletion] complete error:', e);
      setErr(`完了処理に失敗しました: ${e.message || e}`);
    } finally {
      setCompleting(false);
    }
  }

  return { completing, err, lastResult, complete, setErr };
}
