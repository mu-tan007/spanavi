import React, { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import { getOrgId } from '../../../../../lib/orgContext';
import SessionCompleteFlow from './SessionCompleteFlow';
import { useSessionJobs } from './SessionJobsContext';
import SessionVideoModal from '../../_shared/SessionVideoModal';

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
  { key: 'check_pre_assignment',          label: '事後課題についての説明' },
  { key: 'check_session_feedback',        label: 'セッション感想についての説明' },
  { key: 'check_deadline',                label: '締め切りについての説明' },
  { key: 'check_first_session_confirmed', label: '第1回の開始日時の確定' },
];

// 右サイドバー等で進捗計算に使うための、現行チェックリストのキー一覧。
// ※ ここを単一の正にしておくことで、サイドバーが古いキーで進捗を誤計算する事故を防ぐ。
export const KICKOFF_CHECK_KEYS = CHECK_FIELDS.map((f) => f.key);

function pad(n) { return n < 10 ? `0${n}` : String(n); }
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
  const videoFileRef = useRef(null);

  // 動画アップロード/AI議事録は常駐ジョブProvider側で実行（タブ移動しても継続）
  const { jobs, startUpload, startMinutes } = useSessionJobs();

  const kickoffSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === 0) || null, [sessions]);
  const job = kickoffSession ? jobs[kickoffSession.id] : null;
  const uploading = job?.phase === 'uploading' || job?.phase === 'extracting';
  const uploadPct = job?.phase === 'uploading' ? (job.pct ?? 0) : null;
  const generatingMinutes = job?.phase === 'minutes';
  const videoErr = job?.phase === 'error' ? job.error : null;
  // キックオフMTGの実際の実施日時。完了ボタン押下時刻(completed_at)とはズレるため
  // 管理者がここで明示設定し、session(第0回)の started_at に保存。受講生のセッション履歴に反映される。
  const [kickoffHeldAt, setKickoffHeldAt] = useState(() => toDateTimeInput(kickoffSession?.started_at));

  useEffect(() => { setForm(buildForm(kickoff)); }, [kickoff]);
  useEffect(() => { setKickoffHeldAt(toDateTimeInput(kickoffSession?.started_at)); }, [kickoffSession?.id, kickoffSession?.started_at]);

  const allChecked = CHECK_FIELDS.every((f) => !!form[f.key]);
  const checkedCount = CHECK_FIELDS.filter((f) => !!form[f.key]).length;
  const hasVideo = useMemo(
    () => (videos || []).some((v) => v.session?.session_no === 0), [videos]);
  // キックオフ回のアップロード済み動画（storage_path あり）。画面内プレーヤーで再生する。
  const sessionVideo = useMemo(
    () => (videos || []).find((v) => v.session_id === kickoffSession?.id && v.storage_path) || null,
    [videos, kickoffSession?.id]);
  const [playerOpen, setPlayerOpen] = useState(false);
  const hasMinutes = !!(kickoffSession?.minutes_draft || kickoffSession?.minutes_final);
  const kickoffStatus = kickoffSession?.status;

  function handleVideoUpload(e) {
    const f = e.target.files?.[0];
    if (videoFileRef.current) videoFileRef.current.value = '';
    if (!f || !kickoffSession) return;
    // 常駐Provider側でアップロード→AI議事録まで実行。タブ移動しても継続する。
    startUpload(kickoffSession, f);
  }

  function handleGenerateMinutes() {
    if (!kickoffSession) return;
    startMinutes(kickoffSession, null);
  }

  async function handleSave() {
    if (!customerId) return;
    setSaving(true);
    try {
      const orgId = getOrgId();
      // datetime-local はタイムゾーン無しのローカル壁時計文字列を返すため、
      // timestamptz カラムにそのまま渡すと Postgres が UTC として解釈し JST 表示で
      // 9時間ズレる。new Date(...).toISOString() でブラウザのローカル時刻として
      // 解釈し直し、正しい UTC 瞬間に正規化してから保存する（scheduled_at と同じ扱い）。
      const payload = {
        org_id: orgId,
        customer_id: customerId,
        ...form,
        session_1_start_at: form.session_1_start_at
          ? new Date(form.session_1_start_at).toISOString()
          : null,
      };
      const { error } = await supabase.from('spacareer_kickoff_checks')
        .upsert(payload, { onConflict: 'customer_id' });
      if (error) throw error;

      // 第1回の開始日時のみ scheduled_at に反映する。
      // 第2〜8回は受講生ポータル側で第1回基準の毎週仮置き表示にするため、ここでは書き込まない
      // （各回の実日時は「第N回セッション管理」タブの『次回開始日時』で個別確定する）。
      const session1 = (sessions || []).find((s) => s.session_no === 1);
      if (session1 && form.session_1_start_at) {
        await supabase.from('spacareer_sessions')
          .update({ scheduled_at: new Date(form.session_1_start_at).toISOString() })
          .eq('id', session1.id);
      }

      // キックオフMTGの実施日時を第0回 session の started_at に保存（受講生履歴の実施日に反映）。
      if (kickoffSession) {
        await supabase.from('spacareer_sessions')
          .update({ started_at: kickoffHeldAt ? new Date(kickoffHeldAt).toISOString() : null })
          .eq('id', kickoffSession.id);
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
            onClick={() => videoFileRef.current?.click()}>
            {hasVideo ? '動画を差し替える' : '動画をアップロード'}
          </Button>
          <Button variant="outline" size="md" loading={generatingMinutes}
            onClick={handleGenerateMinutes} disabled={!hasVideo}>
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

        {/* アップロードした録画は営業代行ロープレと同様に管理画面内でそのまま再生する。 */}
        {sessionVideo && (
          <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.borderLight}` }}>
            <Button variant="primary" size="sm" onClick={() => setPlayerOpen(true)}>
              録画を再生（画面内）
            </Button>
            <span style={{ marginLeft: space[2], fontSize: font.size.xs, color: color.textLight }}>
              アップロードした録画をこの画面でそのまま再生します。
            </span>
          </div>
        )}
      </Card>

      <Card padding="md"
        title="議事録ドラフト（AI生成）"
        description="キックオフのAI議事録です。トレーナーが確認・修正してください。最終版は受講生のクライアントポータルにも反映されます。">
        {hasMinutes ? (
          <pre style={{
            margin: 0, padding: space[3],
            background: color.cream, borderRadius: radius.md,
            fontSize: font.size.sm, fontFamily: font.family.sans,
            color: color.textDark, whiteSpace: 'pre-wrap',
            maxHeight: 360, overflow: 'auto',
          }}>{kickoffSession.minutes_final || kickoffSession.minutes_draft}</pre>
        ) : (
          <div style={{ color: color.textLight, fontSize: font.size.sm }}>
            {generatingMinutes
              ? 'AI議事録を生成中です…（数分かかる場合があります）'
              : '議事録はまだ生成されていません。動画をアップロードすると自動で生成されます。'}
          </div>
        )}
      </Card>

      <Card padding="md" title="キックオフ実施日時"
        description="キックオフミーティングを実施した実際の日時です。受講生のセッション履歴「第0回 実施日」にそのまま反映されます（完了ボタンを押した時刻ではなく、ここで設定した日時が使われます）。">
        <Input size="sm" label="キックオフ実施日時（日付＋時間）" type="datetime-local"
          value={kickoffHeldAt}
          onChange={(e) => setKickoffHeldAt(e.target.value)}
          hint="「保存」を押すと受講生のセッション履歴に反映されます。" />
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

      <Card padding="md" title="第1回 開始日時"
        description="第1回の開始日時のみ入力します。第2〜8回は、この日時を基準に毎週同じ曜日・時刻で受講生ポータルに自動仮置き表示されます（各回の実日時は「第N回セッション管理」タブの『次回開始日時』で確定できます）。">
        <Input size="sm" label="第1回 開始日時（日付＋時間）" type="datetime-local"
          value={toDateTimeInput(form.session_1_start_at)}
          onChange={(e) => setForm((p) => ({ ...p, session_1_start_at: e.target.value }))}
          hint="第1回の開始日時を確定すると、自動的にスケジュールに反映されます。" />
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

      <SessionVideoModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        storagePath={sessionVideo?.storage_path}
        title="キックオフ 録画"
      />
    </div>
  );
}

function buildForm(k) {
  const base = {
    customer_questions_log: '',
    session_1_start_at: null,
  };
  CHECK_FIELDS.forEach((f) => { base[f.key] = false; });
  if (!k) return base;
  Object.keys(base).forEach((key) => {
    if (k[key] !== undefined && k[key] !== null) base[key] = k[key];
  });
  return base;
}
