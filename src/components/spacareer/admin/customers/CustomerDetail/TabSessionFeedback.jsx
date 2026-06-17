import React, { useMemo } from 'react';
import { color, space, radius, font, alpha } from '../../../../../constants/design';
import { Card, Badge } from '../../../../ui';

// ============================================================
// セッション感想タブ（管理画面・閲覧専用）
// 仕様書 §6.3 セッション感想。受講生(ClientFeedbackView)が回答した内容を
// トレーナー/運営がこの受講生の全回分まとめて確認する。
// ============================================================

const SATISFACTION = {
  1: { label: '不満', variant: 'danger' },
  2: { label: 'やや不満', variant: 'warn' },
  3: { label: '普通', variant: 'neutral' },
  4: { label: 'やや満足', variant: 'primary' },
  5: { label: '満足', variant: 'success' },
};

// 自由記述欄(ハードコード)のラベル。ClientFeedbackView と揃える。
const FREE_COMMENT_LABEL = 'セッションを通じての感想・気づき';

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sessionLabel(no) {
  if (no === 0) return '第0回 キックオフミーティング';
  return `第${no ?? '?'}回`;
}

export default function TabSessionFeedback({ detail }) {
  const feedbacks = detail?.sessionFeedbacks || [];
  const template = detail?.feedbackTemplate || null;

  // テンプレ設問（満足度を除く自由記述系）の id→label マップ。
  // responses は設問ID（id || key || q_{i}）をキーに保存されているため、
  // ClientFeedbackView の qid 採番ロジックと完全に一致させる。
  const questionMeta = useMemo(() => {
    const qs = Array.isArray(template?.questions) ? template.questions : [];
    const fieldQs = qs.filter((q) => q.id !== 'satisfaction' && q.type !== 'rating_5');
    return fieldQs.map((q, i) => ({
      id: q.id || q.key || `q_${i}`,
      label: q.label || `設問${i + 1}`,
    }));
  }, [template]);

  // 提出済み（submitted_at あり）を上、未提出を下にし、回番号昇順で並べる。
  const sorted = useMemo(() => {
    return [...feedbacks].sort((a, b) => {
      const na = a.spacareer_sessions?.session_no ?? 99;
      const nb = b.spacareer_sessions?.session_no ?? 99;
      return na - nb;
    });
  }, [feedbacks]);

  const submittedCount = feedbacks.filter((f) => f.submitted_at).length;

  if (!feedbacks.length) {
    return (
      <Card title="セッション感想はまだありません" padding="lg">
        <p style={{ fontSize: font.size.sm, color: color.textMid, margin: 0 }}>
          セッション完了後にアンケートが受講生へ配信され、回答されるとここに表示されます。
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: space[2],
        fontSize: font.size.sm, color: color.textMid,
      }}>
        <Badge variant="success" dot>{submittedCount} 件提出済み</Badge>
        <span>全 {feedbacks.length} 回分</span>
      </div>

      {sorted.map((fb) => {
        const no = fb.spacareer_sessions?.session_no;
        const sat = fb.satisfaction_score ? SATISFACTION[fb.satisfaction_score] : null;
        const submitted = !!fb.submitted_at;
        const responses = fb.responses || {};
        // テンプレに無い設問キーが responses にあれば、それも拾って末尾に出す。
        const extraKeys = Object.keys(responses).filter(
          (k) => !questionMeta.some((q) => q.id === k) && (responses[k] || '').toString().trim(),
        );

        return (
          <Card key={fb.id} padding="md">
            <div style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              flexWrap: 'wrap', marginBottom: space[3],
              paddingBottom: space[2], borderBottom: `1px solid ${color.borderLight}`,
            }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy }}>
                {sessionLabel(no)}
              </span>
              {submitted
                ? <Badge variant="success" dot>提出済み</Badge>
                : <Badge variant="neutral">未提出</Badge>}
              {sat && (
                <Badge variant={sat.variant} dot>満足度 {fb.satisfaction_score}・{sat.label}</Badge>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: font.size.xs, color: color.textLight, fontFamily: font.family.mono }}>
                {submitted ? `提出 ${fmtDateTime(fb.submitted_at)}` : `期限 ${fmtDateTime(fb.due_at)}`}
              </span>
            </div>

            {!submitted && !fb.free_comment && Object.keys(responses).length === 0 ? (
              <div style={{ fontSize: font.size.sm, color: color.textLight }}>
                まだ回答されていません。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
                <FieldBlock label={FREE_COMMENT_LABEL} value={fb.free_comment} />
                {questionMeta.map((q) => (
                  <FieldBlock key={q.id} label={q.label} value={responses[q.id]} />
                ))}
                {extraKeys.map((k) => (
                  <FieldBlock key={k} label={k} value={responses[k]} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function FieldBlock({ label, value }) {
  const v = (value ?? '').toString().trim();
  return (
    <div>
      <div style={{
        fontSize: font.size.xs, fontWeight: font.weight.semibold,
        color: color.textMid, marginBottom: space[1],
      }}>{label}</div>
      {v ? (
        <div style={{
          fontSize: font.size.sm, color: color.textDark,
          lineHeight: font.lineHeight.relaxed,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: alpha(color.navyLight, 0.04),
          border: `1px solid ${color.borderLight}`,
          borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
        }}>{v}</div>
      ) : (
        <div style={{ fontSize: font.size.sm, color: color.textLight }}>（未記入）</div>
      )}
    </div>
  );
}
