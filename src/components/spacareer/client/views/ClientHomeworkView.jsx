import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Card, Badge, Select } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';
import { loadDraft, saveDraft, clearDraft } from '../../../../lib/spacareer/draftCache';
import { saveWithAuthRetry } from '../../../../lib/spacareer/saveWithRetry';
import ClientMonetizationDiagnosisView from './ClientMonetizationDiagnosisView';

// 仕様書: tasks/spacareer-spec.md §6.2 事後課題
// 参考: イメージ画像③
//
// 仕様要点:
//  - 自動保存なし、ボタンで明示保存
//  - 3ボタン: 一時保存 / 全ての回答を保存 / 回答を提出
//  - 部分提出許容、未回答が1つでもあれば全体は「部分提出」
//  - 文字数カウンター
//  - ファイル添付：最大3、1ファイル50MB、形式制限なし

const MAX_FILES = 3;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const HOMEWORK_BUCKET = 'spacareer-homework-files';

// Supabase Storage のオブジェクトキーに日本語・空白等が含まれると "Invalid key" で
// アップロードに失敗する（第1回「私の人生の地図.pptx」等）。表示名は元のまま保持しつつ、
// キーはASCII安全な形へ変換する。
function sanitizeStorageName(name) {
  const raw = String(name || 'file');
  const dot = raw.lastIndexOf('.');
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot + 1) : '';
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'file';
  const safeExt = ext.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

// 拡張子から MIME を補完する。ブラウザが file.type を空や octet-stream で返すと
// バケットの許可MIMEリストに弾かれてアップロードできないため。
const EXT_MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword', txt: 'text/plain',
};
function resolveContentType(file) {
  const ext = (String(file?.name || '').split('.').pop() || '').toLowerCase();
  const known = EXT_MIME[ext];
  if (known) return known; // 拡張子優先（許可MIMEに確実に合わせる）
  return file?.type || 'application/octet-stream';
}

// 非公開バケットの添付を開く。保存済み path から署名URLを都度生成する
// （getPublicUrl の公開URLは非公開バケットでは404になるため）。
async function openHomeworkFile(f) {
  try {
    if (f?.path) {
      const { data, error } = await supabase.storage
        .from(HOMEWORK_BUCKET).createSignedUrl(f.path, 60 * 10);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } else if (f?.url) {
      window.open(f.url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.error('[ClientHomework] open file error:', e);
    alert('ファイルを開けませんでした。時間をおいて再度お試しください。');
  }
}

export default function ClientHomeworkView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [homeworks, setHomeworks] = useState([]);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState('');
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [kickoffHearingStatus, setKickoffHearingStatus] = useState(null);
  // マネタイズ領域診断（第1回事後課題内のタスク）
  const [diagnosisDone, setDiagnosisDone] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  // 提出後ロック解除（「編集する」を押すと true）。提出するたびに再ロック。
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('members').select('id').eq('user_id', profile.id).maybeSingle();
      if (!member) { setLoading(false); return; }
      const { data: cust } = await supabase
        .from('spacareer_customers')
        .select('id, monetization_diagnosis_completed_at')
        .eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setCustomer(cust);
      if (cust) setDiagnosisDone(!!cust.monetization_diagnosis_completed_at);

      if (cust) {
        // 第0回（キックオフヒアリング）の提出状況。事後課題画面の先頭に表示する。
        const { data: kh } = await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .select('status')
          .eq('customer_id', cust.id)
          .maybeSingle();
        if (!cancelled) setKickoffHearingStatus(kh?.status || null);

        // 最新の回を先頭に出す（session_no 降順）。公開済み(notified_at)のみ表示。
        const { data: hws } = await supabase
          .from('spacareer_homework')
          .select('id, session_no, status, notified_at, due_at, submitted_at, first_completed_at')
          .eq('customer_id', cust.id)
          .not('notified_at', 'is', null)
          .order('session_no', { ascending: false });
        if (cancelled) return;
        // 動画UP＝セッション完了した回の事後課題だけを表示する。
        // 自動公開cronの取りこぼしや予定日時ズレで未完了回の課題が公開済みでも、
        // 受講生には完了した回の分しか出さない（二重ガード）。
        const { data: doneSess } = await supabase
          .from('spacareer_sessions')
          .select('session_no')
          .eq('customer_id', cust.id)
          .eq('status', 'completed');
        if (cancelled) return;
        const doneSet = new Set((doneSess || []).map(s => s.session_no));
        const visibleHws = (hws || []).filter(h => doneSet.has(h.session_no));
        setHomeworks(visibleHws);
        // 先頭(最新回)から見て未完了の最初を選択。全完了なら最新回を選択。
        const target = visibleHws.find(h => h.status !== 'completed') || visibleHws[0];
        setSelectedHomeworkId(target?.id || '');
      }
      setLoading(false);
    })().catch(err => {
      console.error('[ClientHomework] load error:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    setEditing(false); // 提出物を切り替えたら編集モードは解除
    if (!selectedHomeworkId) { setItems([]); setAnswers({}); setFiles({}); return; }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('spacareer_homework_items')
        .select('*')
        .eq('homework_id', selectedHomeworkId)
        .eq('is_published', true) // 変動課題のドラフト(is_published=false)は受講生に見せない
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { console.error('[ClientHomework] items error:', error); return; }
      setItems(rows || []);
      const a = {}, f = {};
      (rows || []).forEach(r => {
        a[r.id] = r.answer_text || '';
        f[r.id] = Array.isArray(r.attached_files) ? r.attached_files : [];
      });
      // 端末ローカルの下書きを復元（保存失敗・ログアウトで未送信の回答を取り戻す）
      const draft = customer?.id ? loadDraft(`homework:${customer.id}:${selectedHomeworkId}`) : null;
      if (draft?.data && typeof draft.data === 'object') {
        const dA = draft.data.answers || {};
        Object.entries(dA).forEach(([id, val]) => {
          if (typeof val === 'string' && val.length > 0 && val !== a[id]) a[id] = val;
        });
        const dF = draft.data.files || {};
        Object.entries(dF).forEach(([id, list]) => {
          if (Array.isArray(list) && list.length > 0 && (f[id] || []).length === 0) {
            f[id] = list;
          }
        });
      }
      setAnswers(a);
      setFiles(f);
    })();
    return () => { cancelled = true; };
  }, [selectedHomeworkId]);

  const selectedHomework = useMemo(
    () => homeworks.find(h => h.id === selectedHomeworkId) || null,
    [homeworks, selectedHomeworkId],
  );

  // 下書きの保存キー（受講生×課題で一意）
  const draftKey = customer?.id && selectedHomeworkId
    ? `homework:${customer.id}:${selectedHomeworkId}` : null;

  // 回答済み判定。ファイル提出形式(item_type='file')は添付があれば回答済みとみなす。
  const isAnswered = (it) =>
    it.item_type === 'file'
      ? (files[it.id] || []).length > 0
      : (answers[it.id] || '').trim().length > 0;

  const totalItems = items.length;
  const answeredItems = useMemo(() => {
    return items.filter(isAnswered).length;
  }, [items, answers, files]);
  const progressPct = totalItems ? Math.round((answeredItems / totalItems) * 100) : 0;

  // 一度でも提出した（submitted_at を持つ項目がある）課題は、提出後ロックの対象。
  // 「編集する」(editing=true) を押すと全項目が解放される。
  const hasSubmittedOnce = useMemo(() => items.some(it => it.submitted_at), [items]);
  const locked = hasSubmittedOnce && !editing;

  const deadlineWarning = useMemo(() => {
    if (!selectedHomework?.due_at) return null;
    const due = new Date(selectedHomework.due_at);
    const dueStr = due.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const diffMs = due.getTime() - Date.now();
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffMs < 0) return { level: 'danger', text: `提出期限を過ぎています（${dueStr}）` };
    if (diffHours <= 72) return { level: 'warn', text: `提出期限：${dueStr}（あと約${diffHours}時間）` };
    return { level: 'info', text: `提出期限：${dueStr}` };
  }, [selectedHomework]);

  const saveAnswers = async (itemIds, opts = { setSubmitted: false }) => {
    if (!itemIds.length) return;
    // 設問行はトレーナー配信時に作成済みのため、受講生は常に UPDATE のみ。
    // upsert(INSERT ON CONFLICT)にすると、行が既存でも Postgres が INSERT 用
    // WITH CHECK を評価し、受講生に INSERT 権限が無いため RLS で弾かれる。
    const nowIso = new Date().toISOString();
    const results = await Promise.all(itemIds.map(id => {
      const patch = {
        answer_text: answers[id] ?? null,
        attached_files: files[id] || [],
      };
      // setSubmitted 以外は submitted_at を触らない（既存値を保持）
      if (opts.setSubmitted) patch.submitted_at = nowIso;
      // トークン期限切れでも refreshSession 後に1回再試行する
      return saveWithAuthRetry(() => supabase
        .from('spacareer_homework_items')
        .update(patch)
        .eq('id', id));
    }));
    const firstError = results.find(r => r.error)?.error;
    if (firstError) throw firstError;
    // ローカルの items も更新（提出後ロック判定・表示の整合のため）
    const idSet = new Set(itemIds);
    setItems(prev => prev.map(it => idSet.has(it.id)
      ? {
          ...it,
          answer_text: answers[it.id] ?? null,
          attached_files: files[it.id] || [],
          submitted_at: opts.setSubmitted ? nowIso : it.submitted_at,
        }
      : it));
    setSavedAt(new Date());
  };

  const recomputeHomeworkStatus = async () => {
    const submittedCount = items.filter(isAnswered).length;
    let newStatus = 'unsubmitted';
    if (submittedCount === 0) newStatus = 'unsubmitted';
    else if (submittedCount < totalItems) newStatus = 'partial';
    else newStatus = 'submitted';
    const patch = { status: newStatus };
    if (newStatus === 'submitted') {
      const nowIso = new Date().toISOString();
      patch.submitted_at = nowIso;
      // 初回100%達成日時は一度だけ記録（提出期限内に到達したかの判定に使う）
      if (!selectedHomework?.first_completed_at) patch.first_completed_at = nowIso;
    }
    const { error: stErr } = await saveWithAuthRetry(() =>
      supabase.from('spacareer_homework').update(patch).eq('id', selectedHomeworkId));
    if (stErr) throw stErr;
    setHomeworks(prev => prev.map(h => h.id === selectedHomeworkId ? { ...h, ...patch } : h));
  };

  const handleTempSave = async (itemId) => {
    setSaving(true);
    try {
      await saveAnswers([itemId], { setSubmitted: false });
    } catch (e) {
      console.error('[ClientHomework] tempSave error:', e);
      alert('保存に失敗しましたが、入力内容は端末に保存されています（再ログイン後に自動復元されます）。');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await saveAnswers(items.map(it => it.id), { setSubmitted: false });
      // 全件サーバー保存できたので端末の下書きは破棄
      if (draftKey) clearDraft(draftKey);
      // 保存できたことが必ず分かるようポップアップを出す（むー様指示 2026-07-09）。
      // 「提出」は別ボタン。ここでは保存完了のみを明示する。
      alert('回答を保存しました。\n（まだ「提出」は完了していません。すべて回答できたら「回答を提出」を押してください）');
    } catch (e) {
      console.error('[ClientHomework] saveAll error:', e);
      alert('保存に失敗しましたが、入力内容は端末に保存されています（再ログイン後に自動復元されます）。');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!window.confirm('回答を提出します。提出後も修正・再提出はいつでもできます。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const submitIds = items.filter(isAnswered).map(it => it.id);
      await saveAnswers(submitIds, { setSubmitted: true });
      const nonSubmit = items.filter(it => !isAnswered(it)).map(it => it.id);
      if (nonSubmit.length) await saveAnswers(nonSubmit, { setSubmitted: false });
      await recomputeHomeworkStatus();
      // 全件サーバー保存できたので端末の下書きは破棄
      if (draftKey) clearDraft(draftKey);
      // 提出のたびに、その時点の達成率スナップショットを1行記録する（提出回数ごとの履歴用）。
      // 履歴記録の失敗で提出自体を止めないよう、エラーはログのみ。
      try {
        const pct = totalItems ? Math.round((submitIds.length / totalItems) * 100) : 0;
        const { error: snapError } = await supabase.from('spacareer_homework_submissions').insert({
          homework_id: selectedHomeworkId,
          customer_id: customer?.id,
          session_no: selectedHomework?.session_no,
          due_at: selectedHomework?.due_at ?? null,
          submitted_at: new Date().toISOString(),
          percentage: pct,
          answered_items: submitIds.length,
          total_items: totalItems,
        });
        if (snapError) console.error('[ClientHomework] submission snapshot error:', snapError);
      } catch (snapErr) {
        console.error('[ClientHomework] submission snapshot error:', snapErr);
      }
      // 提出できたことが必ず分かるよう完了ポップアップを出す。
      // 全問回答なら「しっかり提出できました」、一部なら提出済み件数を案内する。
      setEditing(false); // 提出したら再ロック
      if (submitIds.length >= totalItems) {
        alert(`しっかり提出できました！（全${totalItems}問）\nお疲れさまでした。内容は「編集する」を押すといつでも修正・再提出できます。`);
      } else {
        alert(`${submitIds.length} / ${totalItems} 問を提出しました。\n残りの設問は「編集する」から回答後、再度「回答を提出」を押すと提出できます。`);
      }
    } catch (e) {
      console.error('[ClientHomework] submit error:', e);
      alert('提出に失敗しましたが、入力内容は端末に保存されています（再ログイン後に自動復元されます）。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileAdd = async (itemId, file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert('1ファイル50MBまでです。');
      return;
    }
    const current = files[itemId] || [];
    if (current.length >= MAX_FILES) {
      alert('1設問あたり最大3ファイルまでです。');
      return;
    }
    // キーは日本語・空白をサニタイズ（表示名は元のまま name に保持する）。
    const path = `${customer.id}/${selectedHomeworkId}/${itemId}/${Date.now()}_${sanitizeStorageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(HOMEWORK_BUCKET)
      .upload(path, file, { contentType: resolveContentType(file), upsert: false });
    if (upErr) {
      alert('アップロードに失敗しました: ' + upErr.message);
      return;
    }
    setFiles(prev => {
      const next = { ...prev, [itemId]: [...current, { name: file.name, path, size: file.size }] };
      if (draftKey) saveDraft(draftKey, { answers, files: next });
      return next;
    });
  };

  const handleFileRemove = async (itemId, idx) => {
    const list = files[itemId] || [];
    const target = list[idx];
    if (!target) return;
    if (target.path) {
      await supabase.storage.from(HOMEWORK_BUCKET).remove([target.path]);
    }
    setFiles(prev => {
      const next = { ...prev, [itemId]: list.filter((_, i) => i !== idx) };
      if (draftKey) saveDraft(draftKey, { answers, files: next });
      return next;
    });
  };

  if (loading) return <Centered>読み込み中...</Centered>;
  if (!customer) return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;

  const kickoffSubmitted = ['submitted', 'ai_extracted', 'completed'].includes(kickoffHearingStatus);
  const kickoffNote = kickoffSubmitted ? (
    <Card padding="md" variant="subtle" style={{ marginBottom: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Badge variant="success" dot>提出済み</Badge>
        <span style={{ fontSize: font.size.sm, color: color.textMid }}>
          第0回（キックオフヒアリング）は提出済みです。
        </span>
      </div>
    </Card>
  ) : null;

  // マネタイズ領域診断を起動中は、事後課題本体の代わりに診断画面をインライン表示
  if (diagnosisOpen) {
    return (
      <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <Button variant="ghost" size="sm" onClick={() => setDiagnosisOpen(false)} style={{ alignSelf: 'flex-start' }}>
          ← 事後課題に戻る
        </Button>
        <ClientMonetizationDiagnosisView
          customerId={customer?.id}
          onCompleted={() => setDiagnosisDone(true)}
        />
      </div>
    );
  }

  if (homeworks.length === 0) {
    return (
      <div style={{ padding: space[6] }}>
        <Heading />
        {kickoffNote}
        <Card title="現在配信中の事後課題はありません" padding="lg">
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
            セッション後にトレーナーから通知されるとここに表示されます。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4], paddingBottom: 120 }}>
      <Heading />
      {kickoffNote}

      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <Select
            size="sm"
            value={selectedHomeworkId}
            onChange={e => setSelectedHomeworkId(e.target.value)}
            options={homeworks.map(h => ({
              value: h.id,
              label: `第${h.session_no}回 事後課題 (${labelOfStatus(h.status)})`,
            }))}
          />
        </div>
        {deadlineWarning && (
          <Badge variant={deadlineWarning.level} dot>{deadlineWarning.text}</Badge>
        )}
        {savedAt && (
          <span style={{ fontSize: font.size.xs, color: color.textLight }}>
            最終保存: {savedAt.toLocaleTimeString('ja-JP')}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: space[4] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {selectedHomework?.session_no === 1 && (
            <DiagnosisTaskCard done={diagnosisDone} onOpen={() => setDiagnosisOpen(true)} />
          )}
          {items.map((item, idx) => {
            const prevSection = idx > 0 ? items[idx - 1].section : null;
            const showSection = item.section && item.section !== prevSection;
            return (
              <React.Fragment key={item.id}>
                {showSection && <SectionHeader label={item.section} />}
                <QuestionCard
                  index={idx + 1}
                  item={item}
                  answer={answers[item.id] || ''}
                  onAnswerChange={v => setAnswers(prev => {
                    const next = { ...prev, [item.id]: v };
                    if (draftKey) saveDraft(draftKey, { answers: next, files });
                    return next;
                  })}
                  files={files[item.id] || []}
                  onFileAdd={f => handleFileAdd(item.id, f)}
                  onFileRemove={i => handleFileRemove(item.id, i)}
                  onTempSave={() => handleTempSave(item.id)}
                  saving={saving}
                  readOnly={locked}
                />
              </React.Fragment>
            );
          })}
        </div>

        <div>
          <Card title="回答の進捗" padding="md" style={{ position: 'sticky', top: space[4] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[3] }}>
              <Donut pct={progressPct} />
              <div>
                <div style={{ fontSize: font.size.sm, color: color.textMid }}>回答済み</div>
                <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                  {answeredItems} / {totalItems}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto', borderTop: `1px solid ${color.borderLight}`, paddingTop: space[2] }}>
              {items.map((it, idx) => {
                const done = isAnswered(it);
                return (
                  <a
                    key={it.id}
                    href={`#hw-q-${it.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: space[2],
                      padding: `${space[1]}px ${space[2]}px`,
                      borderRadius: radius.sm,
                      color: color.textDark,
                      fontSize: font.size.xs,
                      textDecoration: 'none',
                      background: done ? alpha(color.success, 0.06) : 'transparent',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: done ? color.success : color.gray200,
                      color: color.white, fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{idx + 1}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.question_text}
                    </span>
                  </a>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div style={{
        position: 'fixed', left: 220, right: 0, bottom: 0,
        padding: `${space[3]}px ${space[6]}px`,
        background: color.white,
        borderTop: `1px solid ${color.border}`,
        boxShadow: shadow.md,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: space[2],
        zIndex: 50,
      }}>
        {locked ? (
          <>
            <span style={{
              marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: space[2],
              fontSize: font.size.sm, color: color.textMid,
            }}>
              <Badge variant="success" dot>提出済み</Badge>
              提出済みのため編集できません。修正する場合は「編集する」を押してください。
            </span>
            <Button variant="primary" onClick={() => setEditing(true)}>編集する</Button>
          </>
        ) : (
          <>
            {hasSubmittedOnce && (
              <span style={{ marginRight: 'auto', fontSize: font.size.sm, color: color.warn }}>
                編集中です。修正後は「回答を提出」を押すと再提出され、ロックされます。
              </span>
            )}
            <Button variant="outline" onClick={handleSaveAll} loading={saving}>一時保存</Button>
            <Button variant="secondary" onClick={handleSaveAll} loading={saving}>全ての回答を保存</Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting}>回答を提出</Button>
          </>
        )}
      </div>
    </div>
  );
}

function labelOfStatus(s) {
  return { unnotified: '未通知', unsubmitted: '未提出', partial: '部分提出', submitted: '提出済み', completed: '完了' }[s] || s;
}

// 第2回事後課題内に表示する「マネタイズ領域診断」タスクカード
function DiagnosisTaskCard({ done, onOpen }) {
  return (
    <Card padding="md" style={{ border: `1px solid ${alpha(color.navy, 0.25)}`, background: alpha(color.navyLight, 0.04) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: 4 }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
              マネタイズ領域診断
            </span>
            <Badge variant={done ? 'success' : 'warn'} dot>{done ? '回答済み' : '未実施'}</Badge>
          </div>
          <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed }}>
            やりたいこと・興味・強み・業界経験から「どの領域 × どの業界で勝つか」を診断します（約40問・20〜40分）。
            {done
              ? ' ご回答ありがとうございました。内容はコーチが確認し、第2回セッションでお伝えします。'
              : ' 第2回をより有意義にするため、回答をお願いします。'}
          </div>
        </div>
        {!done && (
          <Button variant="primary" size="md" onClick={onOpen} style={{ whiteSpace: 'nowrap' }}>
            診断を始める
          </Button>
        )}
      </div>
    </Card>
  );
}

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>事後課題</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
        セッションをより有意義な時間にするために、以下の質問にご回答ください。
      </p>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2],
      marginTop: space[3],
      paddingBottom: space[1],
      borderBottom: `2px solid ${color.navy}`,
    }}>
      <span style={{
        fontSize: font.size.md,
        fontWeight: font.weight.bold,
        color: color.navy,
        letterSpacing: font.letterSpacing.wide,
      }}>{label}</span>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}

function QuestionCard({ index, item, answer, onAnswerChange, files, onFileAdd, onFileRemove, onTempSave, saving, readOnly = false }) {
  const len = (answer || '').length;
  const max = item.max_length || null;
  const isFile = item.item_type === 'file';

  // テンプレートのダウンロード。<a download> 直リンクは Content-Disposition: inline や
  // SPA フォールバックの影響でファイルが開かず別ページに遷移することがあるため、
  // 議事録ダウンロード(downloadMinutes)と同じく blob 経由で確実にダウンロードさせる。
  const downloadTemplate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(item.template_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.template_name || 'template.pptx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('テンプレートのダウンロードに失敗しました。時間をおいて再度お試しください。');
    }
  };
  return (
    <Card padding="md" style={{ scrollMarginTop: 80 }}>
      <div id={`hw-q-${item.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: space[3], marginBottom: space[3] }}>
        <div style={{
          width: 28, height: 28, flexShrink: 0,
          borderRadius: '50%', background: color.navy, color: color.white,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: font.weight.bold, fontSize: font.size.sm,
        }}>{index}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>
              {item.question_text}
            </span>
          </div>
          {item.question_hint && (
            <div style={{ fontSize: font.size.xs, color: color.textLight, lineHeight: font.lineHeight.relaxed, marginBottom: space[2] }}>
              {item.question_hint}
            </div>
          )}
          {item.template_url && (
            <a
              href={item.template_url}
              download={item.template_name || ''}
              onClick={downloadTemplate}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: space[2],
                padding: `${space[2]}px ${space[3]}px`,
                background: color.navy,
                color: color.white,
                borderRadius: radius.md,
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                textDecoration: 'none',
                marginBottom: space[2],
              }}
            >
              ↓ テンプレートをダウンロード（{item.template_name || 'ファイル'}）
            </a>
          )}
        </div>
      </div>

      {isFile ? (
        <div style={{
          border: `1px dashed ${color.border}`,
          borderRadius: radius.md,
          padding: space[3],
          background: color.cream,
        }}>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark, marginBottom: space[2] }}>
            完成したファイルをアップロード
          </div>
          <FileAttachArea files={files} onAdd={onFileAdd} onRemove={onFileRemove} readOnly={readOnly} />
          <textarea
            value={answer}
            onChange={e => onAnswerChange(e.target.value)}
            placeholder="補足メモ（任意）"
            rows={2}
            readOnly={readOnly}
            style={{
              width: '100%', marginTop: space[2],
              padding: `${space[2]}px ${space[3]}px`,
              fontSize: font.size.sm,
              color: color.textDark,
              fontFamily: font.family.sans,
              background: readOnly ? color.gray50 : color.white,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[2] }}>
              <Button size="sm" variant="ghost" onClick={onTempSave} loading={saving}>この設問を保存</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <textarea
            value={answer}
            onChange={e => onAnswerChange(e.target.value)}
            placeholder="ここに回答を入力してください"
            rows={6}
            readOnly={readOnly}
            style={{
              width: '100%',
              padding: `${space[3]}px ${space[3]}px`,
              fontSize: font.size.md,
              color: color.textDark,
              fontFamily: font.family.sans,
              background: readOnly ? color.gray50 : color.white,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              outline: 'none',
              resize: 'vertical',
              minHeight: 120,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space[2] }}>
            <FileAttachArea files={files} onAdd={onFileAdd} onRemove={onFileRemove} readOnly={readOnly} />
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <span style={{ fontSize: font.size.xs, color: max && len > max ? color.danger : color.textLight }}>
                {len}{max ? ` / ${max}` : ''} 文字
              </span>
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={onTempSave} loading={saving}>この設問を保存</Button>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function FileAttachArea({ files, onAdd, onRemove, readOnly = false }) {
  const inputId = 'fileinput-' + Math.random().toString(36).slice(2, 8);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      {files.map((f, i) => (
        <a
          key={i}
          href={f.url || '#'}
          onClick={(e) => { e.preventDefault(); openHomeworkFile(f); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: space[1],
            padding: `2px ${space[2]}px`,
            background: color.cream,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            fontSize: font.size.xs,
            color: color.textDark,
            textDecoration: 'none',
            maxWidth: 200,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={f.name}
        >
          {f.name}
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onRemove(i); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.textLight, padding: 0 }}
              aria-label="削除"
            >×</button>
          )}
        </a>
      ))}
      {!readOnly && files.length < MAX_FILES && (
        <>
          <label htmlFor={inputId} style={{
            display: 'inline-flex', alignItems: 'center', gap: space[1],
            padding: `4px ${space[2]}px`,
            border: `1px dashed ${color.border}`,
            borderRadius: radius.sm,
            cursor: 'pointer',
            color: color.textMid,
            fontSize: font.size.xs,
          }}>
            ファイル添付（{files.length}/{MAX_FILES}）
          </label>
          <input
            id={inputId}
            type="file"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ''; }}
          />
        </>
      )}
    </div>
  );
}

function Donut({ pct }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke={color.gray200} strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none"
        stroke={color.navyLight} strokeWidth="7"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset={0}
        transform="rotate(-90 32 32)"
        strokeLinecap="round"
      />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill={color.navy}>{pct}%</text>
    </svg>
  );
}
