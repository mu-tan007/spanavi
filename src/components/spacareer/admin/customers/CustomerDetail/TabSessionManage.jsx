import React, { useState, useEffect, useMemo, useRef } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Button, Input, Card, Badge } from '../../../../ui';
import { supabase } from '../../../../../lib/supabase';
import SessionCompleteFlow from './SessionCompleteFlow';
import HomeworkVariableEditor from './HomeworkVariableEditor';
import { useSessionJobs } from './SessionJobsContext';
import { useSessionCompletion } from './useSessionCompletion';
import { useFileDrop } from '../../../_shared/useFileDrop';
import SessionVideoModal from '../../_shared/SessionVideoModal';
import { useAuth } from '../../../../../hooks/useAuth';
import { canSkipSessionComplete } from '../../../../../lib/spacareer/permissions';
import { orderSessions, sessionLabel } from '../../../../../lib/spacareer/sessionOrder';

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

// ヒアリング/確認チェックリスト（第1〜8回 全回共通・むー様指示 2026-06-24）:
//   - check_values_review（キャリアの方向性・価値観の再確認）を削除
//   - check_next_homework_guide（次回事後課題の提出方法・締切の説明）を削除
//   - check_unclear_points（不明点の洗い出し）を全回共通で追加
const CHECK_FIELDS = [
  { key: 'check_homework_review',  label: '事後課題（宿題）の振り返り確認' },
  { key: 'check_goal_alignment',   label: '今回のゴール／到達イメージのすり合わせ' },
  { key: 'check_unclear_points',   label: '不明点の洗い出し' },
  { key: 'check_next_schedule',    label: '次回の日程確認' },
];

// 当該回で表示するチェック項目（全回共通）
function checkFieldsFor(sessionNo) {
  return CHECK_FIELDS;
}

export default function TabSessionManage({ detail, sessionNo = 1, part = 1, onRefresh }) {
  const { customer, sessions, videos, kickoff } = detail || {};
  const customerId = customer?.id;
  const { profile } = useAuth();
  // 「動画議事録をスキップして完了」は篠宮・小山のみ表示（誤操作防止・むー様指示 2026-07-09）。
  const canSkip = canSkipSessionComplete(profile?.email);

  // 対象セッションは session_no と part の両方で特定（応用コースは同一回に(1)(2)が存在）。
  const targetSession = useMemo(
    () => (sessions || []).find((s) => s.session_no === sessionNo && (s.part || 1) === part) || null,
    [sessions, sessionNo, part]);

  // 加入回 J 以降の interleave 順（sessionOrder.js）で並べ、前回/次回を決める。
  // 応用は 第3回→α1→第4回→α2… のように基本回とプラスアルファが交互になる。
  const ordered = useMemo(
    () => orderSessions((sessions || []).filter((s) => s.session_no >= 1),
      customer?.oyo_start_session_no),
    [sessions, customer?.oyo_start_session_no]);
  const orderIdx = ordered.findIndex((s) => s.session_no === sessionNo && (s.part || 1) === part);
  const prevSession = orderIdx > 0 ? ordered[orderIdx - 1] : null; // null = 前がキックオフ
  const nextSession = orderIdx >= 0 && orderIdx < ordered.length - 1 ? ordered[orderIdx + 1] : null;

  const sessionLabelText = sessionLabel({ session_no: sessionNo, part });
  const nextLabel = nextSession ? sessionLabel(nextSession) : '';

  // 前回の引き継ぎ（質問記録・議事録）。前がキックオフ(prevSession=null)ならキックオフ、
  // そうでなければ前セッションの hearing_sheet_json / 議事録から取得する。
  const prevLabel = prevSession ? sessionLabel(prevSession) : 'キックオフ';
  const prevQuestions = prevSession
    ? (prevSession.hearing_sheet_json?.customer_questions_log || '')
    : (kickoff?.customer_questions_log || '');
  const prevMinutes = prevSession
    ? (prevSession.minutes_final || prevSession.minutes_draft || '')
    : '';

  const [form, setForm] = useState(() => buildForm(targetSession));
  const [nextStartAt, setNextStartAt] = useState(() => toDateTimeInput(nextSession?.scheduled_at));
  const [nextSavedAt, setNextSavedAt] = useState(null);
  const nextSaveTimer = useRef(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const videoFileRef = useRef(null);

  // 動画アップロード/AI議事録は常駐ジョブProvider側で実行（タブ移動しても継続）
  const { jobs, startUpload, startMinutes } = useSessionJobs();
  const job = targetSession ? jobs[targetSession.id] : null;
  const uploading = job?.phase === 'uploading' || job?.phase === 'extracting';
  const uploadPct = job?.phase === 'uploading' ? (job.pct ?? 0) : null;
  const generatingMinutes = job?.phase === 'minutes';
  const videoErr = job?.phase === 'error' ? job.error : null;

  // セッション完了処理（共通フック）。「動画・AI議事録」カードの「スキップして完了」ボタンと
  // 下部の完了フロー（SessionCompleteFlow embedded）で同一インスタンスを共有する。
  const completion = useSessionCompletion({ session: targetSession, customerId, detail, onCompleted: onRefresh });
  // 「動画・AI議事録」カードのドラッグ＆ドロップアップロード。
  const { isOver: dropOver, dropHandlers } = useFileDrop(
    (f) => { if (targetSession) startUpload(targetSession, f); }, uploading);

  // ヒアリングシートのチェック/質問記録は、セッション切替時(id変化)のみ初期化する。
  // hearing_sheet_json の変化では上書きしない（動画アップロード完了や次回日時の自動保存で
  // detail 全体が refetch されても、入力途中のチェック・質問記録が消えないようにするため。
  // 次回日時と同じ保護方針。むー様指示 2026-07-09）。
  useEffect(() => { setForm(buildForm(targetSession)); }, [targetSession?.id]);

  // 次回日時はセッション切替時(id変化)のみ初期化する。scheduled_at の変化では上書きしない
  // （入力中に動画アップロード等でリフレッシュが走っても入力値が消えないようにするため）。
  useEffect(() => { setNextStartAt(toDateTimeInput(nextSession?.scheduled_at)); }, [nextSession?.id]);

  // 次回（第N+1回）開始日時を入力即時で自動保存する（保存ボタン押し忘れ・リフレッシュでの消失対策）。
  function handleNextStartAtChange(value) {
    setNextStartAt(value);
    setNextSavedAt(null);
    if (!nextSession) return;
    if (nextSaveTimer.current) clearTimeout(nextSaveTimer.current);
    nextSaveTimer.current = setTimeout(async () => {
      try {
        const iso = value ? new Date(value).toISOString() : null;
        const { error } = await supabase.from('spacareer_sessions')
          .update({ scheduled_at: iso }).eq('id', nextSession.id);
        if (error) throw error;
        setNextSavedAt(new Date());
        // ここでは onRefresh を呼ばない。日時を選ぶたびに detail 全体を refetch すると
        // 画面全体がリロードされ、入力途中のヒアリング等の体感が悪くなるため。
        // DB へは保存済みで、履歴・受講生ポータル・自動公開cronはDB値を参照する（むー様指示 2026-07-09）。
      } catch (e) {
        console.error('[TabSessionManage] next datetime autosave error:', e);
      }
    }, 600);
  }
  useEffect(() => () => { if (nextSaveTimer.current) clearTimeout(nextSaveTimer.current); }, []);

  const checkFields = useMemo(() => checkFieldsFor(sessionNo), [sessionNo]);
  const allChecked = checkFields.every((f) => !!form[f.key]);
  const checkedCount = checkFields.filter((f) => !!form[f.key]).length;
  const hasVideo = useMemo(
    () => (videos || []).some((v) => v.session_id === targetSession?.id), [videos, targetSession?.id]);
  // この回のアップロード済み動画（storage_path あり）のうち最新のもの。画面内プレーヤーで再生する。
  // 再アップロードで同一セッションに複数動画がある場合、古い動画ではなく最新を必ず選ぶ。
  const sessionVideo = useMemo(
    () => (videos || [])
      .filter((v) => v.session_id === targetSession?.id && v.storage_path)
      .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))[0] || null,
    [videos, targetSession?.id]);
  const [playerOpen, setPlayerOpen] = useState(false);
  const hasMinutes = !!(targetSession?.minutes_draft || targetSession?.minutes_final);
  const sessionStatus = targetSession?.status;

  function handleVideoUpload(e) {
    const f = e.target.files?.[0];
    if (videoFileRef.current) videoFileRef.current.value = '';
    if (!f || !targetSession) return;
    // 常駐Provider側でアップロード→AI議事録まで実行。タブ移動しても継続する。
    startUpload(targetSession, f);
  }

  function handleGenerateMinutes() {
    if (!targetSession) return;
    startMinutes(targetSession, null);
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
          {sessionLabelText}のセッションが見つかりません。
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
        title={`${sessionLabelText} 動画・AI議事録`}
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
          <input ref={videoFileRef} type="file" accept="video/*,audio/*" onChange={handleVideoUpload} style={{ display: 'none' }} />
          {/* ドラッグ＆ドロップ対応のアップロード入口。動画のアップロードはここに一本化。 */}
          <div
            {...dropHandlers}
            onClick={() => !uploading && videoFileRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: space[2],
              padding: `${space[1]}px ${space[3]}px`,
              border: `2px dashed ${dropOver ? color.navy : color.border}`,
              background: dropOver ? alpha(color.navyLight, 0.08) : 'transparent',
              borderRadius: radius.md,
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            <Button variant="primary" size="md" loading={uploading}
              onClick={(e) => { e.stopPropagation(); videoFileRef.current?.click(); }}>
              {hasVideo ? '動画を差し替える' : '動画をアップロード'}
            </Button>
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              またはここにドラッグ＆ドロップ
            </span>
          </div>
          <Button variant="outline" size="md" loading={generatingMinutes}
            onClick={handleGenerateMinutes} disabled={!hasVideo}>
            AI議事録を生成
          </Button>
          {sessionStatus !== 'completed' && canSkip && (
            <Button variant="ghost" size="md" loading={completion.completing}
              onClick={() => {
                if (window.confirm('動画アップロードとAI議事録生成をスキップして、このセッションを完了します。\n（テスト用途や録画なしで進めたい場合向け）\n\nよろしいですか？')) {
                  completion.complete(true);
                }
              }}
              title="動画・議事録・ヒアリングの必須チェックを無視して完了します">
              動画議事録をスキップして完了
            </Button>
          )}
          {hasMinutes && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              下部「議事録ドラフト」で確認できます
            </span>
          )}
        </div>
        {completion.err && (
          <div style={{
            marginTop: space[3], padding: space[3],
            background: color.dangerSoft, color: '#A20018',
            fontSize: font.size.sm, borderRadius: radius.md,
          }}>{completion.err}</div>
        )}
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
        description={`全${checkFields.length}項目チェック完了で「セッション完了」が押下可能になります（必須ゲート）。`}
        action={<Badge variant={allChecked ? 'success' : 'warn'} dot>
          {checkedCount}/{checkFields.length} 項目チェック
        </Badge>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {checkFields.map((f) => (
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
        <Card padding="md" title={`次回（${nextLabel}）開始日時`}
          description="入力するとその場で自動保存され、セッション履歴・受講生ポータルに反映されます。この日時を過ぎると固定の事後課題とセッション感想が自動公開されます。">
          <Input size="sm" label={`${nextLabel} 開始日時（日付＋時間）`} type="datetime-local"
            value={nextStartAt}
            onChange={(e) => handleNextStartAtChange(e.target.value)}
            hint="入力した瞬間に自動保存されます（保存ボタン不要）。" />
          {nextSavedAt && (
            <div style={{ marginTop: space[2], fontSize: font.size.xs, color: color.success }}>
              自動保存しました（{nextSavedAt.toLocaleTimeString()}）
            </div>
          )}
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
        onCompleted={onRefresh}
        embedded completion={completion} />

      {/* この回(第2〜8回・part1)の変動事後課題をここで生成・修正・追加公開する。
          応用コースの(2)には事後課題を紐付けないため part===1 のときだけ表示。 */}
      {sessionNo >= 2 && part === 1 && (
        <HomeworkVariableEditor detail={detail} customerId={customerId} sessionNo={sessionNo} onRefresh={onRefresh} />
      )}

      <SessionVideoModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        storagePath={sessionVideo?.storage_path}
        title={`${sessionLabelText} 録画`}
      />
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
