import React, { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { uploadSessionVideoWithAudio, generateSessionMinutes } from '../../../../../lib/spacareer/sessionMinutes';
import SessionCompleteFlow from './SessionCompleteFlow';

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function toDateTimeInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================
// 第N回 セッション管理タブ（キックオフ管理タブと同構成・session_no>=1用）
// ----------------------------------------------------------------
// キックオフ管理(TabKickoff)は専用テーブル spacareer_kickoff_checks に
// チェック/質問記録を保存するが、第1回以降は対象 session 行の
// spacareer_sessions.hearing_sheet_json(jsonb) に保存する。
// 全項目チェックで hearing_sheet_completed=true を更新し、
// 既存の完了ゲート(SessionCompleteFlow)がそのbool値を参照する。
// ============================================================

// 第1回向け ヒアリング/確認チェックリスト（運用に合わせて項目編集可）
const CHECK_FIELDS = [
  { key: 'check_homework_review',     label: '事後課題（宿題）の振り返り確認' },
  { key: 'check_goal_alignment',      label: '今回のゴール／到達イメージのすり合わせ' },
  { key: 'check_values_review',       label: 'キャリアの方向性・価値観の再確認' },
  { key: 'check_next_schedule',       label: '次回（第2回）の日程確認' },
  { key: 'check_next_homework_guide', label: '次回事後課題の提出方法・締切の説明' },
];

export default function TabSessionManage({ detail, sessionNo = 1, onRefresh }) {
  const { customer, sessions, videos, kickoff } = detail || {};
  const customerId = customer?.id;

  const targetSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === sessionNo) || null, [sessions, sessionNo]);
  const prevSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === sessionNo - 1) || null, [sessions, sessionNo]);
  const nextSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === sessionNo + 1) || null, [sessions, sessionNo]);

  // 前回の引き継ぎ（質問記録・議事録）。第1回の前回はキックオフ(kickoff_checks)、
  // 第2回以降の前回は前セッションの hearing_sheet_json から取得する。
  const prevLabel = sessionNo === 1 ? 'キックオフ' : `第${sessionNo - 1}回`;
  const prevQuestions = sessionNo === 1
    ? (kickoff?.customer_questions_log || '')
    : (prevSession?.hearing_sheet_json?.customer_questions_log || '');
  const prevMinutes = prevSession
    ? (prevSession.minutes_final || prevSession.minutes_draft || '')
    : '';

  const [form, setForm] = useState(() => buildForm(targetSession));
  const [nextStartAt, setNextStartAt] = useState(() => toDateTimeInput(nextSession?.scheduled_at));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [videoErr, setVideoErr] = useState(null);
  const videoFileRef = useRef(null);

  useEffect(() => { setForm(buildForm(targetSession)); }, [targetSession?.id, targetSession?.hearing_sheet_json]);
  useEffect(() => { setNextStartAt(toDateTimeInput(nextSession?.scheduled_at)); }, [nextSession?.id, nextSession?.scheduled_at]);

  const allChecked = CHECK_FIELDS.every((f) => !!form[f.key]);
  const checkedCount = CHECK_FIELDS.filter((f) => !!form[f.key]).length;
  const hasVideo = useMemo(
    () => (videos || []).some((v) => v.session?.session_no === sessionNo), [videos, sessionNo]);
  const hasMinutes = !!(targetSession?.minutes_draft || targetSession?.minutes_final);
  const sessionStatus = targetSession?.status;

  async function handleVideoUpload(e) {
    const f = e.target.files?.[0];
    if (!f || !targetSession) return;
    const BUCKET_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
    if (f.size > BUCKET_LIMIT_BYTES) {
      setVideoErr(`動画サイズ ${(f.size / 1024 / 1024).toFixed(1)} MB はバケット上限の 2 GB を超えています。動画を分割してください。`);
      if (videoFileRef.current) videoFileRef.current.value = '';
      return;
    }
    setUploading(true); setVideoErr(null); setUploadPct(0);
    let uploadedVideoId = null;
    try {
      const { videoId, audioWarning, error: upErr } = await uploadSessionVideoWithAudio({
        customerId,
        sessionId: targetSession.id,
        file: f,
        onVideoProgress: setUploadPct,
      });
      if (upErr) throw upErr;
      uploadedVideoId = videoId;
      if (audioWarning) setVideoErr(audioWarning);
      onRefresh && (await onRefresh());
    } catch (e2) {
      console.error('[TabSessionManage] video upload error:', e2);
      setVideoErr(`アップロードに失敗しました: ${e2.message || e2}`);
    } finally {
      setUploading(false);
      setUploadPct(null);
      if (videoFileRef.current) videoFileRef.current.value = '';
    }
    // アップロード完了後、そのままAI議事録生成を自動起動（再生成はボタンから）
    if (uploadedVideoId) await runGenerateMinutes(uploadedVideoId);
  }

  async function runGenerateMinutes(videoId) {
    if (!targetSession) return;
    setGeneratingMinutes(true); setVideoErr(null);
    try {
      await generateSessionMinutes({
        sessionId: targetSession.id,
        customerId,
        videoId,
      });
      onRefresh && (await onRefresh());
    } catch (e) {
      console.error('[TabSessionManage] minutes error:', e);
      setVideoErr(`議事録生成に失敗しました: ${e.message || e}`);
    } finally {
      setGeneratingMinutes(false);
    }
  }

  function handleGenerateMinutes() {
    return runGenerateMinutes(null);
  }

  async function handleSave() {
    if (!targetSession) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('spacareer_sessions')
        .update({
          hearing_sheet_json: form,
          hearing_sheet_completed: allChecked,
        })
        .eq('id', targetSession.id);
      if (error) throw error;

      // 次回（第N+1回）の開始日時を更新。datetime-local はTZ無しのローカル文字列のため
      // new Date(...).toISOString() でブラウザのローカル時刻として正規化してから保存する
      // （timestamptz にそのまま渡すと UTC 解釈で9時間ズレるため）。
      if (nextSession && nextStartAt) {
        const { error: e2 } = await supabase.from('spacareer_sessions')
          .update({ scheduled_at: new Date(nextStartAt).toISOString() })
          .eq('id', nextSession.id);
        if (e2) throw e2;
      }

      setSavedAt(new Date());
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabSessionManage] save error:', e);
      alert(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!targetSession) {
    return (
      <Card padding="md">
        <div style={{ color: color.textLight, fontSize: font.size.sm }}>
          第{sessionNo}回のセッションが見つかりません。
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md"
        title={`前回（${prevLabel}）からの引き継ぎ`}
        description="前回のお客様からの質問記録と議事録です。今回のセッションで解消できるよう、まず確認してください。">
        <div style={{ display: 'grid', gap: space[3] }}>
          <div>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
              前回のお客様からの質問記録
            </div>
            {prevQuestions ? (
              <pre style={{
                margin: 0, padding: space[3],
                background: alpha(color.warn, 0.06), borderRadius: radius.md,
                fontSize: font.size.sm, fontFamily: font.family.sans,
                color: color.textDark, whiteSpace: 'pre-wrap',
                maxHeight: 200, overflow: 'auto',
              }}>{prevQuestions}</pre>
            ) : (
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>前回の質問記録はありません。</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid, marginBottom: space[1] }}>
              前回（{prevLabel}）の議事録
            </div>
            {prevMinutes ? (
              <pre style={{
                margin: 0, padding: space[3],
                background: color.cream, borderRadius: radius.md,
                fontSize: font.size.sm, fontFamily: font.family.sans,
                color: color.textDark, whiteSpace: 'pre-wrap',
                maxHeight: 240, overflow: 'auto',
              }}>{prevMinutes}</pre>
            ) : (
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>前回の議事録はまだありません。</div>
            )}
          </div>
        </div>
      </Card>

      <Card padding="md"
        title={`第${sessionNo}回 動画・AI議事録`}
        description="セッションの録画ファイルをアップロードし、AI議事録を生成します。セッション完了の必須ゲートです。"
        action={
          <div style={{ display: 'flex', gap: space[2] }}>
            <Badge variant={hasVideo ? 'success' : 'warn'} dot>
              {hasVideo ? '動画アップ済' : '動画未アップ'}
            </Badge>
            <Badge variant={hasMinutes ? 'success' : 'warn'} dot>
              {hasMinutes ? '議事録あり' : '議事録未生成'}
            </Badge>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={videoFileRef} type="file" accept="video/*" onChange={handleVideoUpload} style={{ display: 'none' }} />
          <Button variant="primary" size="md" loading={uploading}
            onClick={() => videoFileRef.current?.click()} disabled={sessionStatus === 'completed'}>
            {hasVideo ? '動画を差し替える' : '動画をアップロード'}
          </Button>
          <Button variant="outline" size="md" loading={generatingMinutes}
            onClick={handleGenerateMinutes} disabled={!hasVideo || sessionStatus === 'completed'}>
            AI議事録を生成
          </Button>
          {hasMinutes && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              下部「議事録ドラフト」で確認できます
            </span>
          )}
        </div>
        {uploading && uploadPct != null && (
          <div style={{
            marginTop: space[3], padding: space[2],
            background: alpha(color.info, 0.08),
            fontSize: font.size.xs, color: color.textMid,
            borderRadius: radius.md, fontFamily: font.family.mono,
          }}>
            アップロード中 {uploadPct}%（大容量動画は数分かかります）
          </div>
        )}
        {videoErr && (
          <div style={{
            marginTop: space[3], padding: space[3],
            background: color.dangerSoft, color: '#A20018',
            fontSize: font.size.sm, borderRadius: radius.md,
          }}>{videoErr}</div>
        )}
      </Card>

      <Card padding="md"
        title="議事録ドラフト（AI生成）"
        description="このセッションのAI議事録です。トレーナーが確認・修正してください。最終版は受講生のクライアントポータルにも反映されます。">
        {hasMinutes ? (
          <pre style={{
            margin: 0, padding: space[3],
            background: color.cream, borderRadius: radius.md,
            fontSize: font.size.sm, fontFamily: font.family.sans,
            color: color.textDark, whiteSpace: 'pre-wrap',
            maxHeight: 360, overflow: 'auto',
          }}>{targetSession.minutes_final || targetSession.minutes_draft}</pre>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>
            {generatingMinutes
              ? 'AI議事録を生成中です…（数分かかる場合があります）'
              : '議事録はまだ生成されていません。動画をアップロードすると自動で生成されます。'}
          </div>
        )}
      </Card>

      <Card padding="md"
        title="ヒアリングシート"
        description={`全${CHECK_FIELDS.length}項目チェック完了で「セッション完了」が押下可能になります（必須ゲート）。`}
        action={<Badge variant={allChecked ? 'success' : 'warn'} dot>
          {checkedCount}/{CHECK_FIELDS.length} 項目チェック
        </Badge>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {CHECK_FIELDS.map((f) => (
            <label key={f.key} style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              padding: `${space[2]}px ${space[2]}px`,
              borderRadius: radius.md,
              background: form[f.key] ? alpha(color.success, 0.06) : 'transparent',
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={!!form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: color.success, cursor: 'pointer' }} />
              <span style={{
                fontSize: font.size.sm,
                color: form[f.key] ? color.textDark : color.textMid,
                fontWeight: form[f.key] ? font.weight.semibold : font.weight.normal,
              }}>{f.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card padding="md" title="お客様からの質問記録"
        description="セッション中に出た質問・気になり事を記録します。後続セッションへの引き継ぎ用。">
        <textarea
          value={form.customer_questions_log || ''}
          onChange={(e) => setForm((p) => ({ ...p, customer_questions_log: e.target.value }))}
          placeholder="例) 転職時期について改めて相談したい意向あり…"
          rows={5}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: space[3], fontSize: font.size.sm,
            fontFamily: font.family.sans, color: color.textDark,
            background: color.white,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md, outline: 'none', resize: 'vertical',
          }}
        />
      </Card>

      {nextSession && (
        <Card padding="md" title={`次回（第${sessionNo + 1}回）開始日時`}
          description="次回セッションの開始日時を確定します。セッション履歴・受講生ポータルにも反映されます。">
          <Input size="sm" label={`第${sessionNo + 1}回 開始日時（日付＋時間）`} type="datetime-local"
            value={nextStartAt}
            onChange={(e) => setNextStartAt(e.target.value)}
            hint="保存すると次回セッションのスケジュールに反映されます。" />
        </Card>
      )}

      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <Button variant="outline" loading={saving} onClick={handleSave}>保存</Button>
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.success }}>
            保存しました（{savedAt.toLocaleTimeString()}）
          </span>
        )}
      </div>

      <SessionCompleteFlow session={targetSession} customerId={customerId} detail={detail}
        hearingSheetChecked={allChecked}
        hasVideo={hasVideo} hasMinutes={hasMinutes}
        onCompleted={onRefresh} />
    </div>
  );
}

function buildForm(session) {
  const base = { customer_questions_log: '' };
  CHECK_FIELDS.forEach((f) => { base[f.key] = false; });
  const j = session?.hearing_sheet_json;
  if (j && typeof j === 'object') {
    Object.keys(base).forEach((key) => {
      if (j[key] !== undefined && j[key] !== null) base[key] = j[key];
    });
  }
  return base;
}
