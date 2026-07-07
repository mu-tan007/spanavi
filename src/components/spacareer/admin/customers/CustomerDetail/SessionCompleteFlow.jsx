import React, { useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Card } from '../../../../ui';
import { useFileDrop } from '../../../_shared/useFileDrop';
import { useSessionJobs } from './SessionJobsContext';
import { useSessionCompletion } from './useSessionCompletion';

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

export default function SessionCompleteFlow({
  session, customerId, detail,
  hearingSheetChecked = false,
  hasVideo = false, hasMinutes = false,
  onCompleted,
  // embedded=true のとき（顧客詳細「セッション管理」タブ内）は、動画アップロード/AI議事録生成/
  // スキップ完了ボタンを「動画・AI議事録」カード側に移設済みのため非表示にし、
  // ステップ一覧＋「セッション完了」ボタンのみ表示する。
  embedded = false,
  // completion を渡すと共通の完了フック（呼び出し側で1インスタンス生成）を共有する。
  // 未指定なら内部で独自に生成する（横断ビューでの単独利用）。
  completion = null,
}) {
  const fileRef = useRef(null);

  // 完了処理は共通フックに集約。completion prop があればそれを使い、無ければ内部生成。
  const ownCompletion = useSessionCompletion({ session, customerId, detail, onCompleted });
  const { completing, err, lastResult, complete, setErr } = completion || ownCompletion;

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

  // 完了処理は共通フック(useSessionCompletion)の complete(force) に集約。
  // force=true は動画/議事録/ヒアリングの必須ゲートを無視して完了（スキップ完了）。
  async function handleComplete(force = false) {
    if (!force && !canComplete) return;
    await complete(force);
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
        {/* embedded（顧客詳細タブ）では動画アップロード・AI議事録生成・スキップ完了を
            「動画・AI議事録」カードへ移設済みのため非表示にし、完了ボタンのみ残す。 */}
        {!embedded && (
          <>
            <input ref={fileRef} type="file" accept="video/*,audio/*" onChange={handleUpload} style={{ display: 'none' }} />
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
          </>
        )}
        <div style={{ flex: 1 }} />
        {!embedded && status !== 'completed' && (
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

      {!embedded && uploading && uploadPct != null && (
        <div style={{
          marginTop: space[3], padding: space[2],
          background: color.infoSoft,
          fontSize: font.size.xs, color: color.textMid,
          borderRadius: radius.md, fontFamily: font.family.mono,
        }}>
          アップロード中 {uploadPct}%（大容量動画は数分かかります）
        </div>
      )}
      {!embedded && (uploadStatus || generatingMinutes) && (
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
