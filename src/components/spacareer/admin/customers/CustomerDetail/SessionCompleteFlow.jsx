import React, { useState, useRef } from 'react';
import { color, space, radius, font } from '../../../../../constants/design';
import { Button, Card } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { getOrgId } from '../../../../../lib/orgContext';
import { generateMinutesDraft, generateHomework30Items } from '../../../../../lib/spacareer/ai/mock';

// ============================================================
// セッション完了フロー
// 仕様書 §5.3 / §7.2 完了フロー（必須ゲート＋自動連鎖）
//  1. 動画アップロード → 2. AI議事録 → 3. ヒアリング → 4. 完了 → 5. 次回30項目生成
//
// キックオフ(第0回)も第1〜8回と同じく動画+AI議事録が必須。
// 第0回完了時はキックオフヒアリング(70問)の Slack 配信通知を自動発火する。
// ============================================================
const STEP_LABELS = [
  { id: 'upload',   label: '1. 動画アップロード' },
  { id: 'minutes',  label: '2. AI議事録生成' },
  { id: 'hearing',  label: '3. ヒアリングシート確認' },
  { id: 'complete', label: '4. セッション完了' },
  { id: 'homework', label: '5. 次回事前課題30項目生成' },
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
  const [uploading, setUploading] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

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

  async function handleUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    // バケット上限（2GB）の事前チェック
    const BUCKET_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
    if (f.size > BUCKET_LIMIT_BYTES) {
      setErr(`動画サイズ ${(f.size / 1024 / 1024).toFixed(1)} MB はバケット上限の 2 GB を超えています。動画を分割してください。`);
      return;
    }
    setUploading(true); setErr(null);
    try {
      const orgId = getOrgId();
      // Supabase Storage の key は ASCII セーフでないと Invalid key になる。
      // 元のファイル名は使わず、UUID で完全に置き換えて確実に ASCII にする。
      const extMatch = f.name.match(/\.([a-zA-Z0-9]+)$/);
      const ext = (extMatch ? extMatch[1] : 'mp4').toLowerCase();
      const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const safeName = `${uid}.${ext}`;
      const path = `${orgId}/${customerId}/${session.id}/${safeName}`;
      const { error: upErr } = await supabase.storage.from('spacareer-session-videos').upload(path, f, { upsert: false, contentType: f.type || 'video/mp4' });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('spacareer_session_videos').insert({
        org_id: orgId, session_id: session.id,
        storage_path: path, file_size_bytes: f.size, ai_status: 'pending',
      });
      if (insErr) throw insErr;
      onCompleted && onCompleted({ event: 'video_uploaded' });
    } catch (e2) {
      console.error('[SessionCompleteFlow] upload error:', e2);
      let msg = `アップロードに失敗しました: ${e2.message || e2}`;
      if ((e2.message || '').includes('exceeded the maximum allowed size')) {
        msg = (
          `動画ファイル（${(f.size / 1024 / 1024).toFixed(1)} MB）がプロジェクトの File Upload Size Limit を超過しました。\n`
          + `Supabase Dashboard → Settings → Storage の「File upload size limit」を引き上げてください。`
        );
      }
      setErr(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleGenerateMinutes() {
    setGeneratingMinutes(true); setErr(null);
    try {
      const r = await generateMinutesDraft({ sessionId: session.id });
      const { error } = await supabase.from('spacareer_sessions')
        .update({ minutes_draft: r.minutesDraft }).eq('id', session.id);
      if (error) throw error;
      setLastResult({ kind: 'minutes' });
      onCompleted && onCompleted({ event: 'minutes_generated' });
    } catch (e) {
      console.error('[SessionCompleteFlow] minutes error:', e);
      setErr(`議事録生成に失敗しました: ${e.message || e}`);
    } finally {
      setGeneratingMinutes(false);
    }
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

  async function handleComplete() {
    if (!canComplete) return;
    setCompleting(true); setErr(null);
    try {
      const now = new Date().toISOString();
      const orgId = getOrgId();

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

      // キックオフ(第0回)完了時はキックオフヒアリング配信を自動発火、
      // それ以外の回は AI 30問の事前課題ドラフトを生成。
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
      } else if (nextNo >= 1 && nextNo <= 8) {
        const { data: nextSess } = await supabase.from('spacareer_sessions')
          .select('id').eq('customer_id', customerId).eq('session_no', nextNo).maybeSingle();
        if (nextSess) {
          const { data: existing } = await supabase.from('spacareer_homework')
            .select('id').eq('customer_id', customerId).eq('session_no', nextNo).maybeSingle();
          let homeworkId = existing?.id;
          if (!existing) {
            const { data: newHw, error: hwErr } = await supabase.from('spacareer_homework').insert({
              org_id: orgId, customer_id: customerId,
              session_id: nextSess.id, session_no: nextNo,
              status: 'unnotified',
              ai_generated_at: new Date().toISOString(),
            }).select('id').single();
            if (hwErr) throw hwErr;
            homeworkId = newHw.id;
          }

          const items = await generateHomework30Items({ customerId, nextSessionNo: nextNo });
          const payload = items.map((it) => ({
            org_id: orgId, homework_id: homeworkId,
            position: it.position,
            question_text: it.question_text,
            question_hint: it.question_hint || null,
            is_required: it.is_required,
            max_length: it.max_length || null,
          }));
          await supabase.from('spacareer_homework_items').delete().eq('homework_id', homeworkId);
          const { error: insErr } = await supabase.from('spacareer_homework_items').insert(payload);
          if (insErr) throw insErr;
          setLastResult({ kind: 'items_generated', count: items.length, homeworkId });
        }
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
    homework: status === 'completed',
  };

  return (
    <Card padding="md"
      title={`完了フロー（${isKickoff ? 'キックオフ' : `第${session.session_no}回`}）`}
      description={isKickoff
        ? '動画アップロード+AI議事録+9項目チェックを満たすと「セッション完了」が押せます。完了時にキックオフヒアリングが自動配信されます。'
        : '必須ゲートを満たすと「セッション完了」が押せます。完了後は次回の事前課題ドラフトが自動生成されます。'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[2] }}>
        {STEP_LABELS.map((st, idx) => {
          if (st.id === 'homework') {
            return (
              <StepRow key={st.id} index={idx + 1}
                label={isKickoff ? '5. キックオフヒアリングをSlack自動配信' : st.label}
                state={stepDone[st.id] ? 'done' : 'todo'}
                note={stepDone[st.id] ? '完了' : '完了ボタン押下時に自動実行'}
              />
            );
          }
          return (
            <StepRow key={st.id} index={idx + 1} label={st.label}
              state={stepDone[st.id] ? 'done' : 'todo'}
              note={st.id === 'hearing' && !hearingSheetChecked ? '未完了' : null}
            />
          );
        })}
      </div>

      <div style={{
        marginTop: space[4],
        display: 'flex', gap: space[2], flexWrap: 'wrap',
        paddingTop: space[3], borderTop: `1px solid ${color.borderLight}`,
      }}>
        <input ref={fileRef} type="file" accept="video/*" onChange={handleUpload} style={{ display: 'none' }} />
        <Button variant="outline" size="sm" loading={uploading}
          onClick={() => fileRef.current?.click()} disabled={status === 'completed'}>
          動画アップロード
        </Button>
        <Button variant="outline" size="sm" loading={generatingMinutes}
          onClick={handleGenerateMinutes} disabled={!hasVideo || status === 'completed'}>
          AI議事録を生成
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="md" loading={completing}
          disabled={!canComplete} onClick={handleComplete}>
          {status === 'completed' ? '完了済み' : 'セッション完了'}
        </Button>
      </div>

      {err && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.dangerSoft, color: '#A20018',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>{err}</div>
      )}
      {lastResult?.kind === 'items_generated' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          次回事前課題 {lastResult.count} 項目のドラフトを生成しました。事前課題管理画面で確認・修正してください。
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
