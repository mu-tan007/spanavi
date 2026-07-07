import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, Select } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';
import { loadDraft, saveDraft, clearDraft } from '../../../../lib/spacareer/draftCache';
import { saveWithAuthRetry } from '../../../../lib/spacareer/saveWithRetry';

// 仕様書: tasks/spacareer-spec.md §6.3 セッション感想
// 参考: イメージ画像②
//
// 仕様要点:
//  - 5段階満足度（必須）
//  - 自由記述（必須）
//  - 設問群（必須/任意マーク付き）：spacareer_templates.session_feedback から取得
//  - 回答期限を画面上部に表示。期限後も事後回答可
//  - 「満足度アンケート未回答＝全額返金保証対象外」を画面で警告

const SATISFACTION_LABELS = [
  { score: 1, label: '不満' },
  { score: 2, label: 'やや不満' },
  { score: 3, label: '普通' },
  { score: 4, label: 'やや満足' },
  { score: 5, label: '満足' },
];

// 「セッションを通じての感想・気づき」(ハードコード自由記述欄) の文字数下限
const FREE_COMMENT_MIN = 100;

// 設問が「回答済み」とみなせるか。min_length 指定があれば下限充足を要求する。
function meetsMin(q, val) {
  const v = (val || '').trim();
  if (!v) return false;
  return v.length >= (q?.min_length || 0);
}

export default function ClientFeedbackView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState('');
  const [template, setTemplate] = useState(null);
  const [score, setScore] = useState(null);
  const [freeComment, setFreeComment] = useState('');
  const [responses, setResponses] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('members').select('id').eq('user_id', profile.id).maybeSingle();
      if (!member) { setLoading(false); return; }
      const { data: cust } = await supabase
        .from('spacareer_customers').select('id').eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setCustomer(cust);

      if (cust) {
        const { data: fbs } = await supabase
          .from('spacareer_session_feedbacks')
          .select('id, session_id, satisfaction_score, free_comment, responses, due_at, submitted_at, spacareer_sessions(session_no, completed_at)')
          .eq('customer_id', cust.id)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        // キックオフ(第0回)の感想はクライアントポータルに表示しない（撤廃）。
        const visibleFbs = (fbs || []).filter((f) => f.spacareer_sessions?.session_no !== 0);
        setFeedbacks(visibleFbs);
        const target = visibleFbs.find(f => !f.submitted_at) || visibleFbs[0];
        setSelectedFeedbackId(target?.id || '');

        const { data: tpl } = await supabase
          .from('spacareer_templates')
          .select('content')
          .eq('template_type', 'session_feedback')
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setTemplate(tpl?.content || null);
      }
      setLoading(false);
    })().catch(err => {
      console.error('[ClientFeedback] load error:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    const fb = feedbacks.find(f => f.id === selectedFeedbackId);
    if (!fb) { setScore(null); setFreeComment(''); setResponses({}); return; }
    let nextScore = fb.satisfaction_score ?? null;
    let nextComment = fb.free_comment || '';
    let nextResponses = fb.responses || {};
    // 端末ローカルの下書きを復元（保存失敗・ログアウトで未送信の入力を取り戻す）。
    // 提出済みは編集不可なので復元しない。
    if (customer?.id && !fb.submitted_at) {
      const draft = loadDraft(`feedback:${customer.id}:${fb.id}`);
      if (draft?.data && typeof draft.data === 'object') {
        if (draft.data.score != null) nextScore = draft.data.score;
        if (typeof draft.data.freeComment === 'string' && draft.data.freeComment.length > 0) nextComment = draft.data.freeComment;
        if (draft.data.responses && typeof draft.data.responses === 'object') {
          nextResponses = { ...nextResponses, ...draft.data.responses };
        }
      }
    }
    setScore(nextScore);
    setFreeComment(nextComment);
    setResponses(nextResponses);
  }, [selectedFeedbackId, feedbacks, customer?.id]);

  const selectedFb = useMemo(
    () => feedbacks.find(f => f.id === selectedFeedbackId) || null,
    [feedbacks, selectedFeedbackId],
  );

  // 下書きの保存キー（受講生×感想で一意）
  const draftKey = customer?.id && selectedFeedbackId
    ? `feedback:${customer.id}:${selectedFeedbackId}` : null;

  // 入力が変わるたび端末ローカルに退避（提出済みは退避しない）
  useEffect(() => {
    if (!draftKey || selectedFb?.submitted_at) return;
    saveDraft(draftKey, { score, freeComment, responses });
  }, [score, freeComment, responses, draftKey, selectedFb?.submitted_at]);

  const questions = useMemo(() => {
    if (template?.questions && Array.isArray(template.questions)) return template.questions;
    return [
      { key: 'learnings', label: '今回のセッションで得られた気づき', required: true, type: 'text' },
      { key: 'action_items', label: '次回までに取り組むこと', required: true, type: 'text' },
      { key: 'questions_for_trainer', label: 'トレーナーへ伝えたいこと', required: false, type: 'text' },
    ];
  }, [template]);

  // 満足度(rating_5)はハードコードのスコアボタンで扱うため、設問ループからは除外する。
  // テンプレ設問は key ではなく id を識別子に持つ（key 参照だと全設問が responses[undefined]
  // を共有し、1つ入力すると全項目が同じ値で上書きされるバグになる）。
  const fieldQuestions = useMemo(
    () => questions.filter(q => q.id !== 'satisfaction' && q.type !== 'rating_5'),
    [questions],
  );
  const qid = (q, i) => q.id || q.key || `q_${i}`;

  const totalRequired = useMemo(() => {
    return 1 + 1 + fieldQuestions.filter(q => q.required).length;
  }, [fieldQuestions]);

  const freeCommentOk = (freeComment || '').trim().length >= FREE_COMMENT_MIN;

  const answeredRequired = useMemo(() => {
    let n = 0;
    if (score) n += 1;
    if (freeCommentOk) n += 1;
    fieldQuestions.forEach((q, i) => {
      if (q.required && meetsMin(q, responses[qid(q, i)])) n += 1;
    });
    return n;
  }, [score, freeCommentOk, responses, fieldQuestions]);

  const handleTempSave = async () => {
    if (!selectedFeedbackId) return;
    setSaving(true);
    try {
      const { error } = await saveWithAuthRetry(() => supabase.from('spacareer_session_feedbacks').update({
        satisfaction_score: score ?? null,
        free_comment: freeComment || null,
        responses,
      }).eq('id', selectedFeedbackId));
      if (error) throw error;
    } catch (e) {
      console.error('[ClientFeedback] tempSave error:', e);
      alert('保存に失敗しましたが、入力内容は端末に保存されています（再ログイン後に自動復元されます）。');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFeedbackId) return;
    if (!score) { alert('満足度を選択してください'); return; }
    if (!(freeComment || '').trim()) { alert('感想・気づきをご記入ください'); return; }
    if ((freeComment || '').trim().length < FREE_COMMENT_MIN) {
      alert(`「セッションを通じての感想・気づき」は最低${FREE_COMMENT_MIN}文字以上ご記入ください`);
      return;
    }
    for (let i = 0; i < fieldQuestions.length; i++) {
      const q = fieldQuestions[i];
      const val = (responses[qid(q, i)] || '').trim();
      if (q.required && !val) {
        alert(`「${q.label}」をご記入ください`);
        return;
      }
      if (val && q.min_length && val.length < q.min_length) {
        alert(`「${q.label}」は最低${q.min_length}文字以上ご記入ください`);
        return;
      }
    }
    if (!window.confirm('回答を提出します。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const { error } = await saveWithAuthRetry(() => supabase.from('spacareer_session_feedbacks').update({
        satisfaction_score: score,
        free_comment: freeComment,
        responses,
        submitted_at: new Date().toISOString(),
      }).eq('id', selectedFeedbackId));
      if (error) throw error;
      setFeedbacks(prev => prev.map(f => f.id === selectedFeedbackId ? { ...f, submitted_at: new Date().toISOString(), satisfaction_score: score, free_comment: freeComment, responses } : f));
      // 提出が確定したので端末の下書きは破棄
      if (draftKey) clearDraft(draftKey);
      alert('ご回答ありがとうございました。');
    } catch (e) {
      console.error('[ClientFeedback] submit error:', e);
      alert('提出に失敗しましたが、入力内容は端末に保存されています（再ログイン後に自動復元されます）。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Centered>読み込み中...</Centered>;
  if (!customer) return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;
  if (feedbacks.length === 0) {
    return (
      <div style={{ padding: space[6] }}>
        <Heading />
        <Card title="現在回答可能なセッション感想はありません" padding="lg">
          <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
            セッション完了後にアンケートがここに表示されます。
          </p>
        </Card>
      </div>
    );
  }

  const sessionNo = selectedFb?.spacareer_sessions?.session_no;
  const completedAt = selectedFb?.spacareer_sessions?.completed_at;
  const dueAt = selectedFb?.due_at;
  const submitted = !!selectedFb?.submitted_at;

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading />

      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 320 }}>
          <Select
            size="sm"
            value={selectedFeedbackId}
            onChange={e => setSelectedFeedbackId(e.target.value)}
            options={feedbacks.map(f => {
              const no = f.spacareer_sessions?.session_no;
              const sessionLabel = no === 0 ? '第0回 キックオフミーティング感想' : `第${no ?? '?'}回 感想`;
              return {
                value: f.id,
                label: `${sessionLabel} (${f.submitted_at ? '提出済み' : '未提出'})`,
              };
            })}
          />
        </div>
        {submitted && <Badge variant="success" dot>提出済み</Badge>}
      </div>

      {submitted && (
        <div style={{
          padding: space[3],
          background: alpha(color.success, 0.10),
          border: `1px solid ${alpha(color.success, 0.35)}`,
          borderRadius: radius.md,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          color: color.textDark,
        }}>
          提出完了しました。ご回答ありがとうございました。提出後の内容は編集できません。
        </div>
      )}

      <Card padding="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3] }}>
          <div>
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>対象セッション</div>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
              {sessionNo === 0 ? '第0回 キックオフミーティング' : `第${sessionNo ?? '?'}回`}
            </div>
            {completedAt && (
              <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                実施日: {new Date(completedAt).toLocaleDateString('ja-JP')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: font.size.xs, color: color.textLight }}>回答期限</div>
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>
              {dueAt ? new Date(dueAt).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' まで' : '-'}
            </div>
          </div>
        </div>
      </Card>

      <div style={{
        padding: space[3],
        background: alpha(color.gold, 0.10),
        border: `1px solid ${alpha(color.gold, 0.30)}`,
        borderRadius: radius.md,
        fontSize: font.size.sm,
        color: color.textDark,
        lineHeight: font.lineHeight.relaxed,
      }}>
        自分が得た学びをアウトプットとして記載することで、学習の定着率が上がります。ぜひAIを活用せず、ご自身の表現・言葉でご記載ください。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: space[4] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <Card padding="md">
            <Label>このセッションへの満足度</Label>
            <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
              {SATISFACTION_LABELS.map(s => (
                <button
                  key={s.score}
                  type="button"
                  disabled={submitted}
                  onClick={() => setScore(s.score)}
                  style={{
                    padding: `${space[2]}px ${space[4]}px`,
                    border: `1px solid ${score === s.score ? color.navy : color.border}`,
                    background: score === s.score ? color.navy : color.white,
                    color: score === s.score ? color.white : color.textDark,
                    borderRadius: radius.md,
                    cursor: submitted ? 'default' : 'pointer',
                    opacity: submitted && score !== s.score ? 0.5 : 1,
                    fontSize: font.size.sm,
                    fontWeight: font.weight.semibold,
                    minWidth: 90,
                  }}
                >
                  <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold }}>{s.score}</div>
                  <div style={{ fontSize: font.size.xs, opacity: 0.85 }}>{s.label}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <Label required>セッションを通じての感想・気づき</Label>
            <textarea
              value={freeComment}
              onChange={e => setFreeComment(e.target.value)}
              placeholder="セッションを通じて感じたこと、気づきを自由にご記入ください。"
              rows={6}
              readOnly={submitted}
              style={submitted ? readonlyTextareaStyle : textareaStyle}
            />
            <div style={{ textAlign: 'right', fontSize: font.size.xs, marginTop: space[1],
              color: color.textLight }}>
              {(freeComment || '').length} 文字
            </div>
          </Card>

          {fieldQuestions.map((q, i) => {
            const id = qid(q, i);
            const val = responses[id] || '';
            if (q.type === 'radio' && Array.isArray(q.options)) {
              return (
                <Card key={id} padding="md">
                  <Label required={q.required}>{q.label}</Label>
                  <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled={submitted}
                        onClick={() => setResponses(prev => ({ ...prev, [id]: opt }))}
                        style={{
                          padding: `${space[2]}px ${space[3]}px`,
                          border: `1px solid ${val === opt ? color.navy : color.border}`,
                          background: val === opt ? color.navy : color.white,
                          color: val === opt ? color.white : color.textDark,
                          borderRadius: radius.md,
                          cursor: submitted ? 'default' : 'pointer',
                          opacity: submitted && val !== opt ? 0.5 : 1,
                          fontSize: font.size.sm,
                          fontWeight: font.weight.semibold,
                        }}
                      >{opt}</button>
                    ))}
                  </div>
                </Card>
              );
            }
            return (
              <Card key={id} padding="md">
                <Label required={q.required}>{q.label}</Label>
                <textarea
                  value={val}
                  onChange={e => setResponses(prev => ({ ...prev, [id]: e.target.value }))}
                  rows={4}
                  maxLength={q.max_length || undefined}
                  readOnly={submitted}
                  style={submitted ? readonlyTextareaStyle : textareaStyle}
                />
                {q.max_length ? (
                  <div style={{ textAlign: 'right', fontSize: font.size.xs, marginTop: space[1],
                    color: color.textLight }}>
                    {val.length} / {q.max_length} 文字
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>

        <Card title="回答の進捗" padding="md" style={{ alignSelf: 'flex-start', position: 'sticky', top: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[2] }}>
            <Donut pct={Math.round((answeredRequired / totalRequired) * 100)} />
            <div>
              <div style={{ fontSize: font.size.sm, color: color.textMid }}>回答状況</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                {answeredRequired} / {totalRequired}
              </div>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ProgressRow done={!!score} label="満足度" />
            <ProgressRow done={freeCommentOk} label="自由記述" />
            {fieldQuestions.map((q, i) => {
              const id = qid(q, i);
              const done = q.required ? meetsMin(q, responses[id]) : !!(responses[id] || '').trim();
              return (
                <ProgressRow key={id} done={done} label={q.label} required={q.required} />
              );
            })}
          </ul>
        </Card>
      </div>

      {submitted ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: space[2],
          fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.success,
        }}>
          提出完了しました
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <Button variant="outline" onClick={handleTempSave} loading={saving}>一時保存する</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>回答を提出する</Button>
        </div>
      )}
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>セッション感想</h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
        いただいたご意見は、今後のセッション改善やより良いサポートの提供に活用させていただきます。
      </p>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}

function Label({ children }) {
  // 必須/任意バッジは表示しない（運用方針）。
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
      <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>{children}</span>
    </div>
  );
}

function ProgressRow({ done, label, required = true }) {
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: space[2],
      padding: `${space[1]}px ${space[2]}px`,
      fontSize: font.size.xs,
      background: done ? alpha(color.success, 0.06) : 'transparent',
      borderRadius: radius.sm,
      color: color.textDark,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        background: done ? color.success : (required ? color.gray300 : color.gray200),
        display: 'inline-block', flexShrink: 0,
      }}/>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </li>
  );
}

const textareaStyle = {
  width: '100%',
  padding: `${10}px ${12}px`,
  fontSize: font.size.md,
  color: color.textDark,
  fontFamily: font.family.sans,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  outline: 'none',
  resize: 'vertical',
  minHeight: 100,
  boxSizing: 'border-box',
};

// 提出済み（読み取り専用）の textarea スタイル。編集不可を視覚的にも示す。
const readonlyTextareaStyle = {
  ...textareaStyle,
  background: color.gray50,
  color: color.textMid,
  cursor: 'default',
  resize: 'none',
};

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
