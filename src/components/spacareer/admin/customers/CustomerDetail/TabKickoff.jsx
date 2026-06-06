import React, { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { getOrgId } from '../../../../../lib/orgContext';
import { generateMinutesDraft } from '../../../../../lib/spacareer/ai/mock';
import SessionCompleteFlow from './SessionCompleteFlow';

// ============================================================
// 2. キックオフ管理タブ
// 仕様書 §7.1 キックオフ管理タブ / §5.2 キックオフ
// ============================================================
// キックオフ管理 ヒアリング/説明チェックリスト（運用最新版）
// 仕様: tasks/spacareer-social-style-onboarding.md / 運用合意 2026-06-07
//   - 全額返金ポリシーは契約書読み合わせで実施済みのためここからは除外
//   - スケジュール調整完了の項目は削除（個別の日程確定で代替）
const CHECK_FIELDS = [
  { key: 'check_unclear_points',          label: '不明点・不安点のヒアリング' },
  { key: 'check_slide_explained',         label: 'キックオフスライドの説明' },
  { key: 'check_login_explained',         label: 'スパナビのログイン説明' },
  { key: 'check_ai_community',            label: 'AIコミュニティについての説明' },
  { key: 'check_ai_course',               label: 'AI講座に関しての説明' },
  { key: 'check_zoom_recording',          label: 'Zoom録画などについての説明' },
  { key: 'check_reschedule_rules',        label: '振替・キャンセル規定の説明' },
  { key: 'check_next_session_content',    label: '次回のセッション内容についての説明' },
  { key: 'check_pre_assignment',          label: '事前課題についての説明' },
  { key: 'check_session_feedback',        label: 'セッション感想についての説明' },
  { key: 'check_deadline',                label: '締め切りについての説明' },
  { key: 'check_first_session_confirmed', label: '第1回の開始日時の確定' },
  { key: 'check_all_sessions_dated',      label: '第2回〜第8回 全回の仮日程の確定' },
];

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function toDateInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDateTimeInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TabKickoff({ detail, onRefresh }) {
  const { customer, sessions, kickoff, videos } = detail || {};
  const customerId = customer?.id;
  const [form, setForm] = useState(() => buildForm(kickoff));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [videoErr, setVideoErr] = useState(null);
  const videoFileRef = useRef(null);

  useEffect(() => { setForm(buildForm(kickoff)); }, [kickoff]);

  const allChecked = CHECK_FIELDS.every((f) => !!form[f.key]);
  const checkedCount = CHECK_FIELDS.filter((f) => !!form[f.key]).length;
  const kickoffSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === 0) || null, [sessions]);
  const hasVideo = useMemo(
    () => (videos || []).some((v) => v.session?.session_no === 0), [videos]);
  const hasMinutes = !!kickoffSession?.minutes_draft;
  const kickoffStatus = kickoffSession?.status;

  async function handleVideoUpload(e) {
    const f = e.target.files?.[0];
    if (!f || !kickoffSession) return;
    // バケット上限（2GB）の事前チェック。プロジェクトレベルの上限はDashboard設定次第のため、
    // 超過時は「Supabase Dashboard で上限を引き上げてください」のヒントを添えて案内する。
    const BUCKET_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
    if (f.size > BUCKET_LIMIT_BYTES) {
      setVideoErr(`動画サイズ ${(f.size / 1024 / 1024).toFixed(1)} MB はバケット上限の 2 GB を超えています。動画を分割してください。`);
      if (videoFileRef.current) videoFileRef.current.value = '';
      return;
    }
    setUploading(true); setVideoErr(null);
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
      const path = `${orgId}/${customerId}/${kickoffSession.id}/${safeName}`;
      const { error: upErr } = await supabase.storage.from('spacareer-session-videos').upload(path, f, { upsert: false, contentType: f.type || 'video/mp4' });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('spacareer_session_videos').insert({
        org_id: orgId, session_id: kickoffSession.id,
        storage_path: path, file_size_bytes: f.size, ai_status: 'pending',
      });
      if (insErr) throw insErr;
      onRefresh && (await onRefresh());
    } catch (e2) {
      console.error('[TabKickoff] video upload error:', e2);
      let msg = `アップロードに失敗しました: ${e2.message || e2}`;
      // プロジェクトレベルの File Upload Size Limit を超過した時のメッセージ。
      // むー様自身が Supabase Dashboard で設定変更する必要があるため、操作場所を併記。
      if ((e2.message || '').includes('exceeded the maximum allowed size')) {
        msg = (
          `動画ファイル（${(f.size / 1024 / 1024).toFixed(1)} MB）がプロジェクトの File Upload Size Limit を超過しました。\n`
          + `Supabase Dashboard → Settings → Storage の「File upload size limit」を引き上げてください。`
        );
      }
      setVideoErr(msg);
    } finally {
      setUploading(false);
      if (videoFileRef.current) videoFileRef.current.value = '';
    }
  }

  async function handleGenerateMinutes() {
    if (!kickoffSession) return;
    setGeneratingMinutes(true); setVideoErr(null);
    try {
      const r = await generateMinutesDraft({ sessionId: kickoffSession.id });
      const { error } = await supabase.from('spacareer_sessions')
        .update({ minutes_draft: r.minutesDraft }).eq('id', kickoffSession.id);
      if (error) throw error;
      onRefresh && (await onRefresh());
    } catch (e) {
      console.error('[TabKickoff] minutes error:', e);
      setVideoErr(`議事録生成に失敗しました: ${e.message || e}`);
    } finally {
      setGeneratingMinutes(false);
    }
  }

  async function handleSave() {
    if (!customerId) return;
    setSaving(true);
    try {
      const orgId = getOrgId();
      const payload = { org_id: orgId, customer_id: customerId, ...form };
      const { error } = await supabase.from('spacareer_kickoff_checks')
        .upsert(payload, { onConflict: 'customer_id' });
      if (error) throw error;

      const sessByNo = {};
      (sessions || []).forEach((s) => { sessByNo[s.session_no] = s; });
      for (let i = 1; i <= 8; i++) {
        const dateKey = `session_${i}_date`;
        const v = form[dateKey];
        if (!v) continue;
        const target = sessByNo[i];
        if (!target) continue;
        const scheduledAt = i === 1 && form.session_1_start_at
          ? new Date(form.session_1_start_at).toISOString()
          : new Date(`${v}T10:00:00`).toISOString();
        await supabase.from('spacareer_sessions')
          .update({ scheduled_at: scheduledAt }).eq('id', target.id);
      }

      setSavedAt(new Date());
      onRefresh && onRefresh();
    } catch (e) {
      console.error('[TabKickoff] save error:', e);
      alert(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <Card padding="md"
        title="キックオフ動画・AI議事録"
        description="キックオフミーティングの録画ファイルをアップロードし、AI議事録を生成します。セッション完了の必須ゲートです。"
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
            onClick={() => videoFileRef.current?.click()} disabled={kickoffStatus === 'completed'}>
            {hasVideo ? '動画を差し替える' : '動画をアップロード'}
          </Button>
          <Button variant="outline" size="md" loading={generatingMinutes}
            onClick={handleGenerateMinutes} disabled={!hasVideo || kickoffStatus === 'completed'}>
            AI議事録を生成
          </Button>
          {hasMinutes && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              下部「議事録ドラフト」で確認できます
            </span>
          )}
        </div>
        {videoErr && (
          <div style={{
            marginTop: space[3], padding: space[3],
            background: color.dangerSoft, color: '#A20018',
            fontSize: font.size.sm, borderRadius: radius.md,
          }}>{videoErr}</div>
        )}
      </Card>

      <Card padding="md"
        title="ヒアリングシート（PDF §4.3.1〜4.3.9）"
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
        description="キックオフ中に出た質問・気になり事を記録します。後続セッションへの引き継ぎ用。">
        <textarea
          value={form.customer_questions_log || ''}
          onChange={(e) => setForm((p) => ({ ...p, customer_questions_log: e.target.value }))}
          placeholder="例) 第3回までに転職活動を本格化したい意向あり…"
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

      <Card padding="md" title="第1〜第8回 大枠日程"
        description="第1〜第8回の日付を確定します。第1回のみ時間まで入力。">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: space[3] }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Input key={n} size="sm" label={`第${n}回`} type="date"
              value={toDateInput(form[`session_${n}_date`])}
              onChange={(e) => setForm((p) => ({ ...p, [`session_${n}_date`]: e.target.value }))} />
          ))}
        </div>
        <div style={{ marginTop: space[3] }}>
          <Input size="sm" label="第1回 開始日時（日付＋時間）" type="datetime-local"
            value={toDateTimeInput(form.session_1_start_at)}
            onChange={(e) => setForm((p) => ({ ...p, session_1_start_at: e.target.value }))}
            hint="第1回の開始日時を確定すると、自動的にスケジュールに反映されます。" />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <Button variant="outline" loading={saving} onClick={handleSave}>ヒアリング内容を保存</Button>
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.success }}>
            保存しました（{savedAt.toLocaleTimeString()}）
          </span>
        )}
      </div>

      <SessionCompleteFlow session={kickoffSession} customerId={customerId} detail={detail}
        hearingSheetChecked={allChecked}
        hasVideo={hasVideo} hasMinutes={hasMinutes}
        onCompleted={onRefresh} />
    </div>
  );
}

function buildForm(k) {
  const base = {
    customer_questions_log: '',
    session_1_date: null, session_2_date: null, session_3_date: null, session_4_date: null,
    session_5_date: null, session_6_date: null, session_7_date: null, session_8_date: null,
    session_1_start_at: null,
  };
  CHECK_FIELDS.forEach((f) => { base[f.key] = false; });
  if (!k) return base;
  Object.keys(base).forEach((key) => {
    if (k[key] !== undefined && k[key] !== null) base[key] = k[key];
  });
  return base;
}
