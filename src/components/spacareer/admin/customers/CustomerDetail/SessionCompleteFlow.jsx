import React, { useState, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Card } from '../../../../ui';
import { useFileDrop } from '../../../_shared/useFileDrop';
import { supabase } from '../../../../../lib/supabase';
import { useSessionJobs } from './SessionJobsContext';

// ============================================================
// セッション完了フロー
// 仕様書 §5.3 / §7.2 完了フロー（必須ゲート）
//  1. 動画アップロード → 2. AI議事録 → 3. ヒアリング → 4. 完了
//
// キックオフ(第0回)も第1〜8回と同じく動画+AI議事録が必須。
// 第0回完了時はキックオフヒアリング(70問)の Slack 配信通知を自動発火する。
//
// 事後課題は完了時には生成・公開しない（役割分離）:
//   - 固定事後課題＋感想 … 各回の予定日時を過ぎたら自動公開cron（fn_spacareer_publish_due_fixed）
//   - 変動事後課題       … 事後課題タブの「AI変動課題を生成」→修正→「追加公開」
// ============================================================
const STEP_LABELS = [
  { id: 'upload',   label: '1. 動画アップロード' },
  { id: 'minutes',  label: '2. AI議事録生成' },
  { id: 'hearing',  label: '3. ヒアリングシート確認' },
  { id: 'complete', label: '4. セッション完了' },
];

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function formatJpDate(d) {
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionCompleteFlow({
  session, customerId, detail,
  hearingSheetChecked = false,
  hasVideo = false, hasMinutes = false,
  onCompleted,
}) {
  const fileRef = useRef(null);
  const [completing, setCompleting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  // 動画アップロード/AI議事録は常駐ジョブProvider側で実行（タブ移動しても継続）
  const { jobs, startUpload, startMinutes } = useSessionJobs();
  const job = session ? jobs[session.id] : null;
  const uploading = job?.phase === 'uploading' || job?.phase === 'extracting';
  const uploadPct = job?.phase === 'uploading' ? (job.pct ?? 0) : null;
  const uploadStatus = job?.status || job?.warning || null;
  const generatingMinutes = job?.phase === 'minutes';
  const jobErr = job?.phase === 'error' ? job.error : null;

  // ドラッグ＆ドロップで動画アップロード
  const { isOver: dropOver, dropHandlers } = useFileDrop((f) => { doUpload(f); }, uploading);

  if (!session) {
    return (
      <Card padding="md" style={{ border: `1px dashed ${color.border}` }}>
        <div style={{ color: color.textLight, fontSize: font.size.sm, textAlign: 'center', padding: space[3] }}>
          セッションを選択してください
        </div>
      </Card>
    );
  }

  const isKickoff = session.session_no === 0;
  const status = session.status;
  // キックオフも第1〜8回と同じく、動画+AI議事録+ヒアリングシート3点が必須
  const canComplete =
    status !== 'completed' &&
    hearingSheetChecked &&
    hasVideo && hasMinutes;

  function handleUpload(e) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    doUpload(f);
  }

  function doUpload(f) {
    if (!f) return;
    setErr(null);
    // 完了済みでも動画アップロード・議事録生成は可能（スキップ完了後の後追いアップロードに対応）。
    // 常駐Provider側でアップロード→AI議事録まで実行。タブ移動しても継続する。
    startUpload(session, f);
  }

  function handleGenerateMinutes() {
    setErr(null);
    startMinutes(session, null);
  }

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
  async function handleComplete(force = false) {
    if (!force && !canComplete) return;
    if (status === 'completed') return;
    setCompleting(true); setErr(null);
    try {
      const now = new Date().toISOString();

      const { error: e1 } = await supabase.from('spacareer_sessions')
        .update({ status: 'completed', completed_at: now }).eq('id', session.id);
      if (e1) throw e1;

      const nextNo = (session.session_no ?? 0) + 1;
      if (nextNo <= 8) {
        const { data: nextSess } = await supabase.from('spacareer_sessions')
          .select('id, status').eq('customer_id', customerId).eq('session_no', nextNo).maybeSingle();
        if (nextSess && nextSess.status === 'not_started') {
          await supabase.from('spacareer_sessions')
            .update({ status: 'next_up' }).eq('id', nextSess.id);
        }
      }

      const completedCount = nextNo;
      const pct = Math.round((completedCount / 9) * 1000) / 10;
      const newStatus = nextNo > 8 ? 'graduated' : 'in_progress';
      await supabase.from('spacareer_customers')
        .update({
          current_session_no: Math.min(8, nextNo),
          progress_percent: pct,
          status: newStatus,
        })
        .eq('id', customerId);

      // キックオフ(第0回)完了時はキックオフヒアリング配信を自動発火。
      //
      // 第1〜7回の事後課題は「セッション完了」では生成・公開しない（役割分離）:
      //   - 固定事後課題＋セッション感想 … 各回の予定日時を過ぎたら自動公開cronが配信
      //     （fn_spacareer_publish_due_fixed / fixed_published_at で冪等管理）。
      //   - 変動事後課題 … 事後課題タブの「AI変動課題を生成」→修正→「追加公開」で配信。
      // ここでは完了状態・進捗の更新のみを行う。
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
      console.error('[SessionCompleteFlow] complete error:', e);
      setErr(`完了処理に失敗しました: ${e.message || e}`);
    } finally {
      setCompleting(false);
    }
  }

  const stepDone = {
    upload:   hasVideo,
    minutes:  hasMinutes,
    hearing:  hearingSheetChecked,
    complete: status === 'completed',
    kickoff_hearing: status === 'completed',
  };
  // キックオフはヒアリング自動配信の行を1つ追加で表示する。
  const steps = isKickoff
    ? [...STEP_LABELS, { id: 'kickoff_hearing', label: '5. キックオフヒアリングをSlack自動配信' }]
    : STEP_LABELS;

  return (
    <Card padding="md"
      title={`完了フロー（${isKickoff ? 'キックオフ' : `第${session.session_no}回`}）`}
      description={isKickoff
        ? '動画アップロード+AI議事録+9項目チェックを満たすと「セッション完了」が押せます。完了時にキックオフヒアリングが自動配信されます。'
        : '必須ゲートを満たすと「セッション完了」が押せます。固定の事後課題とセッション感想は各回の予定日時を過ぎると自動公開されます。変動の事後課題は「事後課題」タブから生成・追加公開してください。'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[2] }}>
        {steps.map((st, idx) => (
          <StepRow key={st.id} index={idx + 1} label={st.label}
            state={stepDone[st.id] ? 'done' : 'todo'}
            note={st.id === 'hearing' && !hearingSheetChecked ? '未完了'
              : st.id === 'kickoff_hearing' ? (stepDone[st.id] ? '完了' : '完了ボタン押下時に自動実行')
              : null}
          />
        ))}
      </div>

      <div style={{
        marginTop: space[4],
        display: 'flex', gap: space[2], flexWrap: 'wrap',
        paddingTop: space[3], borderTop: `1px solid ${color.borderLight}`,
      }}>
        <input ref={fileRef} type="file" accept="video/*" onChange={handleUpload} style={{ display: 'none' }} />
        <div
          {...dropHandlers}
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: space[2],
            padding: `${space[1]}px ${space[3]}px`,
            border: `2px dashed ${dropOver ? color.navy : color.border}`,
            background: dropOver ? alpha(color.navyLight, 0.08) : 'transparent',
            borderRadius: radius.md,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          <Button variant="outline" size="sm" loading={uploading}
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            動画アップロード
          </Button>
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>
            またはここにドラッグ＆ドロップ
          </span>
        </div>
        <Button variant="outline" size="sm" loading={generatingMinutes}
          onClick={handleGenerateMinutes} disabled={!hasVideo}>
          AI議事録を生成
        </Button>
        <div style={{ flex: 1 }} />
        {status !== 'completed' && (
          <Button variant="ghost" size="sm" loading={completing}
            onClick={() => {
              if (window.confirm('動画アップロードとAI議事録生成をスキップして、このセッションを完了します。\n（テスト用途や録画なしで進めたい場合向け）\n\nよろしいですか？')) {
                handleComplete(true);
              }
            }}
            title="動画・議事録・ヒアリングの必須チェックを無視して完了します（テスト用）">
            動画・議事録をスキップして完了
          </Button>
        )}
        <Button variant="primary" size="md" loading={completing}
          disabled={!canComplete} onClick={() => handleComplete(false)}>
          {status === 'completed' ? '完了済み' : 'セッション完了'}
        </Button>
      </div>

      {uploading && uploadPct != null && (
        <div style={{
          marginTop: space[3], padding: space[2],
          background: color.infoSoft,
          fontSize: font.size.xs, color: color.textMid,
          borderRadius: radius.md, fontFamily: font.family.mono,
        }}>
          アップロード中 {uploadPct}%（大容量動画は数分かかります）
        </div>
      )}
      {(uploadStatus || generatingMinutes) && (
        <div style={{
          marginTop: space[3], padding: space[2],
          background: color.infoSoft,
          fontSize: font.size.xs, color: color.textMid,
          borderRadius: radius.md,
        }}>
          {uploadStatus || 'AI議事録を生成中...（文字起こし含め数分かかります。完了すると自動で反映されます）'}
        </div>
      )}
      {lastResult?.kind === 'minutes' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          AI議事録ドラフトを生成しました。セッション履歴タブで内容を確認・編集してください。
        </div>
      )}
      {(err || jobErr) && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.dangerSoft, color: '#A20018',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>{err || jobErr}</div>
      )}
      {lastResult?.kind === 'session_completed' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          セッションを完了しました。固定の事後課題とセッション感想は、この回の予定日時を過ぎると自動でポータルに公開されます。
          変動の事後課題は「事後課題」タブから生成・追加公開してください。
        </div>
      )}
      {lastResult?.kind === 'kickoff_done_with_notify' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          キックオフヒアリングを受講生のSlackチャンネルに自動配信しました。提出期限：{lastResult.deadlineDisplay}（第1回の3日前 23:59）
        </div>
      )}
      {lastResult?.kind === 'kickoff_done_already_notified' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          キックオフヒアリングは既に配信済みのため、自動配信はスキップしました。
        </div>
      )}
      {lastResult?.kind === 'kickoff_done_notify_failed' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.dangerSoft, color: '#A20018',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          セッションは完了しましたが、キックオフヒアリングの自動配信に失敗しました。
          {lastResult.reason ? <><br />理由：{lastResult.reason}</> : null}
          <br />ヒアリングシートタブの「Slackで配信通知を送る」ボタンから手動で配信してください。
        </div>
      )}
    </Card>
  );
}

function StepRow({ index, label, state, note }) {
  const palette = {
    done:    { bg: color.success, fg: color.white,     icon: '✓' },
    todo:    { bg: color.gray100, fg: color.textMid,   icon: index },
    skipped: { bg: color.gray100, fg: color.textLight, icon: '–' },
  };
  const p = palette[state] || palette.todo;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
      <div style={{
        width: 22, height: 22, borderRadius: radius.pill,
        background: p.bg, color: p.fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font.size.xs, fontWeight: font.weight.bold,
        fontFamily: font.family.mono, flexShrink: 0,
      }}>{p.icon}</div>
      <div style={{
        flex: 1, fontSize: font.size.sm,
        color: state === 'done' ? color.textDark : color.textMid,
        textDecoration: state === 'skipped' ? 'line-through' : 'none',
      }}>{label}</div>
      {note && (
        <span style={{
          fontSize: font.size.xs,
          color: state === 'done' ? color.success : color.textLight,
          fontFamily: font.family.mono,
        }}>{note}</span>
      )}
    </div>
  );
}
