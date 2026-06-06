import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge, Select } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

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
        setFeedbacks(fbs || []);
        const target = (fbs || []).find(f => !f.submitted_at) || (fbs || [])[0];
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
    setScore(fb.satisfaction_score ?? null);
    setFreeComment(fb.free_comment || '');
    setResponses(fb.responses || {});
  }, [selectedFeedbackId, feedbacks]);

  const selectedFb = useMemo(
    () => feedbacks.find(f => f.id === selectedFeedbackId) || null,
    [feedbacks, selectedFeedbackId],
  );

  const questions = useMemo(() => {
    if (template?.questions && Array.isArray(template.questions)) return template.questions;
    return [
      { key: 'learnings', label: '今回のセッションで得られた気づき', required: true, type: 'text' },
      { key: 'action_items', label: '次回までに取り組むこと', required: true, type: 'text' },
      { key: 'questions_for_trainer', label: 'トレーナーへ伝えたいこと', required: false, type: 'text' },
    ];
  }, [template]);

  const totalRequired = useMemo(() => {
    return 1 + 1 + questions.filter(q => q.required).length;
  }, [questions]);

  const answeredRequired = useMemo(() => {
    let n = 0;
    if (score) n += 1;
    if ((freeComment || '').trim()) n += 1;
    questions.forEach(q => {
      if (q.required && (responses[q.key] || '').trim()) n += 1;
    });
    return n;
  }, [score, freeComment, responses, questions]);

  const handleTempSave = async () => {
    if (!selectedFeedbackId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('spacareer_session_feedbacks').update({
        satisfaction_score: score ?? null,
        free_comment: freeComment || null,
        responses,
      }).eq('id', selectedFeedbackId);
      if (error) throw error;
    } catch (e) {
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFeedbackId) return;
    if (!score) { alert('満足度を選択してください'); return; }
    if (!(freeComment || '').trim()) { alert('自由記述は必須です'); return; }
    for (const q of questions) {
      if (q.required && !(responses[q.key] || '').trim()) {
        alert(`「${q.label}」は必須です`);
        return;
      }
    }
    if (!window.confirm('回答を提出します。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('spacareer_session_feedbacks').update({
        satisfaction_score: score,
        free_comment: freeComment,
        responses,
        submitted_at: new Date().toISOString(),
      }).eq('id', selectedFeedbackId);
      if (error) throw error;
      setFeedbacks(prev => prev.map(f => f.id === selectedFeedbackId ? { ...f, submitted_at: new Date().toISOString(), satisfaction_score: score, free_comment: freeComment, responses } : f));
      alert('ご回答ありがとうございました。');
    } catch (e) {
      alert('提出に失敗しました: ' + (e.message || e));
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
  const overdueButOk = dueAt && new Date(dueAt).getTime() < Date.now() && !submitted;

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading />

      {!submitted && (
        <div style={{
          padding: space[3],
          background: alpha(color.danger, 0.06),
          border: `1px solid ${alpha(color.danger, 0.25)}`,
          borderRadius: radius.md,
          fontSize: font.size.sm,
          color: color.danger,
          fontWeight: font.weight.semibold,
        }}>
          満足度アンケートが未回答のままだと、全額返金保証の対象外となります。必ずご回答ください。
        </div>
      )}

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
        {overdueButOk && <Badge variant="warn" dot>期限超過（事後回答可）</Badge>}
        {submitted && <Badge variant="success" dot>提出済み</Badge>}
      </div>

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
              {dueAt ? new Date(dueAt).toLocaleDateString('ja-JP') : '-'}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: space[4] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <Card padding="md">
            <Label required>このセッションへの満足度</Label>
            <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
              {SATISFACTION_LABELS.map(s => (
                <button
                  key={s.score}
                  type="button"
                  onClick={() => setScore(s.score)}
                  style={{
                    padding: `${space[2]}px ${space[4]}px`,
                    border: `1px solid ${score === s.score ? color.navy : color.border}`,
                    background: score === s.score ? color.navy : color.white,
                    color: score === s.score ? color.white : color.textDark,
                    borderRadius: radius.md,
                    cursor: 'pointer',
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
              style={textareaStyle}
            />
            <div style={{ textAlign: 'right', fontSize: font.size.xs, color: color.textLight, marginTop: space[1] }}>
              {(freeComment || '').length} 文字
            </div>
          </Card>

          {questions.map(q => (
            <Card key={q.key} padding="md">
              <Label required={q.required}>{q.label}</Label>
              <textarea
                value={responses[q.key] || ''}
                onChange={e => setResponses(prev => ({ ...prev, [q.key]: e.target.value }))}
                rows={4}
                style={textareaStyle}
              />
            </Card>
          ))}
        </div>

        <Card title="回答の進捗" padding="md" style={{ alignSelf: 'flex-start', position: 'sticky', top: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[2] }}>
            <Donut pct={Math.round((answeredRequired / totalRequired) * 100)} />
            <div>
              <div style={{ fontSize: font.size.sm, color: color.textMid }}>必須項目</div>
              <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.navy }}>
                {answeredRequired} / {totalRequired}
              </div>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ProgressRow done={!!score} label="満足度" />
            <ProgressRow done={!!(freeComment || '').trim()} label="自由記述" />
            {questions.map(q => (
              <ProgressRow key={q.key} done={!!(responses[q.key] || '').trim()} label={q.label} required={q.required} />
            ))}
          </ul>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
        <Button variant="outline" onClick={handleTempSave} loading={saving}>一時保存する</Button>
        <Button variant="primary" onClick={handleSubmit} loading={submitting}>回答を提出する</Button>
      </div>
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

function Label({ children, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
      <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>{children}</span>
      {required ? <Badge variant="danger" size="sm">必須</Badge> : <Badge variant="neutral" size="sm">任意</Badge>}
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
        strokeDashoffset={c / 4}
        transform="rotate(-90 32 32)"
        strokeLinecap="round"
      />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="700" fill={color.navy}>{pct}%</text>
    </svg>
  );
}
