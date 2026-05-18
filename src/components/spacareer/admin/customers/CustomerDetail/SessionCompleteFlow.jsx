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
// ============================================================
const STEP_LABELS = [
  { id: 'upload',   label: '1. 動画アップロード' },
  { id: 'minutes',  label: '2. AI議事録生成' },
  { id: 'hearing',  label: '3. ヒアリングシート確認' },
  { id: 'complete', label: '4. セッション完了' },
  { id: 'homework', label: '5. 次回事前課題30項目生成' },
];

export default function SessionCompleteFlow({
  session, customerId,
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
  const canComplete =
    status !== 'completed' &&
    hearingSheetChecked &&
    (isKickoff || (hasVideo && hasMinutes));

  async function handleUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setErr(null);
    try {
      const orgId = getOrgId();
      const path = `${orgId}/${customerId}/${session.id}/${Date.now()}_${f.name}`;
      const { error: upErr } = await supabase.storage.from('spacareer-session-videos').upload(path, f, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('spacareer_session_videos').insert({
        org_id: orgId, session_id: session.id,
        storage_path: path, file_size_bytes: f.size, ai_status: 'pending',
      });
      if (insErr) throw insErr;
      onCompleted && onCompleted({ event: 'video_uploaded' });
    } catch (e2) {
      console.error('[SessionCompleteFlow] upload error:', e2);
      setErr(`アップロードに失敗しました: ${e2.message || e2}`);
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

      if (nextNo >= 1 && nextNo <= 8) {
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
              ai_generated_at: isKickoff ? null : new Date().toISOString(),
            }).select('id').single();
            if (hwErr) throw hwErr;
            homeworkId = newHw.id;
          }

          if (isKickoff) {
            setLastResult({ kind: 'kickoff_done', homeworkId });
          } else {
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
      description="必須ゲートを満たすと「セッション完了」が押せます。完了後は次回の事前課題ドラフトが自動生成されます。"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[2] }}>
        {STEP_LABELS.map((st, idx) => {
          if (isKickoff && (st.id === 'upload' || st.id === 'minutes')) {
            return <StepRow key={st.id} index={idx + 1} label={st.label} state="skipped" note="第0回は不要" />;
          }
          if (st.id === 'homework') {
            return (
              <StepRow key={st.id} index={idx + 1}
                label={isKickoff ? '5. 第1回事前課題を自動配布' : st.label}
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
        {!isKickoff && (
          <>
            <input ref={fileRef} type="file" accept="video/*" onChange={handleUpload} style={{ display: 'none' }} />
            <Button variant="outline" size="sm" loading={uploading}
              onClick={() => fileRef.current?.click()} disabled={status === 'completed'}>
              動画アップロード
            </Button>
            <Button variant="outline" size="sm" loading={generatingMinutes}
              onClick={handleGenerateMinutes} disabled={!hasVideo || status === 'completed'}>
              AI議事録を生成
            </Button>
          </>
        )}
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
      {lastResult?.kind === 'kickoff_done' && (
        <div style={{
          marginTop: space[3], padding: space[3],
          background: color.successSoft, color: '#1F6537',
          fontSize: font.size.sm, borderRadius: radius.md,
        }}>
          第1回事前課題（共通テンプレ）の配布記録を作成しました。
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
