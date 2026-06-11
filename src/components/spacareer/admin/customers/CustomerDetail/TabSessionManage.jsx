import React, { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { uploadSessionVideoWithAudio, generateSessionMinutes } from '../../../../../lib/spacareer/sessionMinutes';
import SessionCompleteFlow from './SessionCompleteFlow';

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
  { key: 'check_homework_review',     label: '事前課題（宿題）の振り返り確認' },
  { key: 'check_goal_alignment',      label: '今回のゴール／到達イメージのすり合わせ' },
  { key: 'check_values_review',       label: 'キャリアの方向性・価値観の再確認' },
  { key: 'check_next_schedule',       label: '次回（第2回）の日程確認' },
  { key: 'check_next_homework_guide', label: '次回事前課題の提出方法・締切の説明' },
];

export default function TabSessionManage({ detail, sessionNo = 1, onRefresh }) {
  const { customer, sessions, videos } = detail || {};
  const customerId = customer?.id;

  const targetSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === sessionNo) || null, [sessions, sessionNo]);

  const [form, setForm] = useState(() => buildForm(targetSession));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [videoErr, setVideoErr] = useState(null);
  const videoFileRef = useRef(null);

  useEffect(() => { setForm(buildForm(targetSession)); }, [targetSession?.id, targetSession?.hearing_sheet_json]);

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

      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <Button variant="outline" loading={saving} onClick={handleSave}>ヒアリング内容を保存</Button>
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
