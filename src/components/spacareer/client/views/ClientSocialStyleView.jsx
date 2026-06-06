import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import {
  SOCIAL_STYLE_QUESTIONS,
  SOCIAL_STYLE_DESCRIPTIONS,
} from '../../admin/social-style/socialStyleQuestions';

// ============================================================
// 受講生用 ソーシャルスタイル診断 画面
// ----------------------------------------------------------------
// 仕様書: tasks/spacareer-social-style-onboarding.md Phase 3
//
// 状態遷移:
//   - 招待行が見つからない: エラー表示
//   - completed_at あり: 結果画面（タイプ + スコアバランス + 接し方の自分用ガイド）
//   - 未着手 (current_question_no=0 && answers=[]): イントロ画面 + 開始ボタン
//   - 進行中: 1問ずつ表示、5段階リッカート、進捗バー、随時保存
//   - 30問完了 → 集計 → completed_at セット → 結果画面 → onCompleted コールバック
// ============================================================

const SATISFACTION = [
  { value: 1, label: '全く当てはまらない' },
  { value: 2, label: 'あまり当てはまらない' },
  { value: 3, label: 'どちらでもない' },
  { value: 4, label: 'やや当てはまる' },
  { value: 5, label: '非常に当てはまる' },
];

const TYPE_BADGE_VARIANT = {
  analytical: 'info',
  driver:     'danger',
  expressive: 'warn',
  amiable:    'success',
};

function computeResult(answers) {
  const scores = { analytical: 0, driver: 0, expressive: 0, amiable: 0 };
  for (const a of answers) {
    if (!a || typeof a.value !== 'number') continue;
    const q = SOCIAL_STYLE_QUESTIONS.find(qq => qq.id === a.question_id);
    if (!q) continue;
    scores[q.type] = (scores[q.type] || 0) + (a.value - 3);
  }
  let topType = 'analytical';
  let topScore = -Infinity;
  for (const k of Object.keys(scores)) {
    if (scores[k] > topScore) { topScore = scores[k]; topType = k; }
  }
  return { scores, topType };
}

export default function ClientSocialStyleView({ customerId, onCompleted }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null); // spacareer_social_style_responses 行
  const [phase, setPhase] = useState('intro'); // 'intro' | 'quiz' | 'result'
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({}); // {question_id: value}
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from('spacareer_social_style_responses')
          .select('id, customer_id, answers, current_question_no, completed_at, result_type, result_scores')
          .eq('customer_id', customerId)
          .maybeSingle();
        if (qErr) throw qErr;
        if (!data) {
          if (!cancelled) setError('診断データが見つかりません。運営にお問い合わせください。');
          return;
        }
        if (cancelled) return;
        setResponse(data);

        // 既存回答を Map 化
        const map = {};
        for (const a of (data.answers || [])) {
          if (a && a.question_id != null && typeof a.value === 'number') {
            map[a.question_id] = a.value;
          }
        }
        setAnswersMap(map);

        if (data.completed_at) {
          setPhase('result');
        } else if (data.current_question_no > 0 || Object.keys(map).length > 0) {
          setPhase('quiz');
          setCurrentIdx(Math.max(0, Math.min(SOCIAL_STYLE_QUESTIONS.length - 1, data.current_question_no)));
        } else {
          setPhase('intro');
        }
      } catch (e) {
        console.error('[ClientSocialStyle] load error:', e);
        if (!cancelled) setError(e?.message || 'データ取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const persistProgress = async (overrideMap, overrideIdx) => {
    if (!response) return;
    const map = overrideMap || answersMap;
    const idx = overrideIdx != null ? overrideIdx : currentIdx;
    const answers = SOCIAL_STYLE_QUESTIONS
      .filter(q => map[q.id] != null)
      .map(q => ({ question_id: q.id, value: map[q.id], type: q.type }));
    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from('spacareer_social_style_responses')
        .update({ answers, current_question_no: idx })
        .eq('id', response.id);
      if (uErr) throw uErr;
    } catch (e) {
      console.error('[ClientSocialStyle] persist error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = () => {
    setPhase('quiz');
    setCurrentIdx(0);
  };

  const handleAnswer = async (value) => {
    const q = SOCIAL_STYLE_QUESTIONS[currentIdx];
    const nextMap = { ...answersMap, [q.id]: value };
    setAnswersMap(nextMap);
    const isLast = currentIdx >= SOCIAL_STYLE_QUESTIONS.length - 1;
    if (isLast) {
      await persistProgress(nextMap, SOCIAL_STYLE_QUESTIONS.length - 1);
      await finalize(nextMap);
    } else {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      persistProgress(nextMap, nextIdx); // fire-and-forget
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const finalize = async (mapForCalc) => {
    if (!response) return;
    setFinalizing(true);
    try {
      const map = mapForCalc || answersMap;
      const answers = SOCIAL_STYLE_QUESTIONS
        .filter(q => map[q.id] != null)
        .map(q => ({ question_id: q.id, value: map[q.id], type: q.type }));
      const { scores, topType } = computeResult(answers);
      const completedAt = new Date().toISOString();
      const { error: uErr } = await supabase
        .from('spacareer_social_style_responses')
        .update({
          answers,
          current_question_no: SOCIAL_STYLE_QUESTIONS.length,
          result_type: topType,
          result_scores: scores,
          completed_at: completedAt,
        })
        .eq('id', response.id);
      if (uErr) throw uErr;
      setResponse(prev => ({ ...prev, result_type: topType, result_scores: scores, completed_at: completedAt }));
      setPhase('result');
      if (onCompleted) onCompleted({ type: topType, scores });
    } catch (e) {
      console.error('[ClientSocialStyle] finalize error:', e);
      alert('診断結果の保存に失敗しました。お手数ですが時間を置いて再度お試しください。');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <Centered>読み込み中...</Centered>;
  if (error) return <Centered>{error}</Centered>;
  if (!response) return <Centered>診断データが見つかりません。運営にお問い合わせください。</Centered>;

  if (phase === 'intro') return <IntroView onStart={handleStart} />;
  if (phase === 'result') return <ResultView response={response} />;

  return (
    <QuizView
      currentIdx={currentIdx}
      total={SOCIAL_STYLE_QUESTIONS.length}
      question={SOCIAL_STYLE_QUESTIONS[currentIdx]}
      selectedValue={answersMap[SOCIAL_STYLE_QUESTIONS[currentIdx].id]}
      saving={saving}
      finalizing={finalizing}
      onAnswer={handleAnswer}
      onBack={handleBack}
    />
  );
}

// ────────────────────────────────────────────────────────
function IntroView({ onStart }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading
        title="ソーシャルスタイル診断"
        subtitle="トレーナーがあなたに最適な関わり方をするための事前診断です（全30問・約5分）"
      />
      <Card padding="lg">
        <p style={{ fontSize: font.size.md, color: color.textDark, lineHeight: font.lineHeight.relaxed, marginTop: 0 }}>
          スパキャリでは、受講生お一人おひとりの<strong>コミュニケーションのタイプ</strong>に合わせて、
          トレーナーが関わり方・フィードバックの伝え方を調整します。
        </p>
        <p style={{ fontSize: font.size.md, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
          このあとに表示される30問は、
          <strong>「主張度（聞く ⇔ 述べる）」</strong>と
          <strong>「情緒度（抑制 ⇔ 表出）」</strong>の2軸から、
          あなたが4タイプのどれに近いかを判定します。
        </p>
        <div style={{
          marginTop: space[4], padding: space[3],
          background: color.cream, borderRadius: radius.md,
          fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed,
        }}>
          <strong>ご回答にあたって</strong><br/>
          ・正解・不正解はありません。<strong>仕事中の自分</strong>を思い浮かべて回答してください。<br/>
          ・1問あたり10秒以内、直感でお答えいただいて構いません。<br/>
          ・途中で離脱しても、続きから再開できます。<br/>
          ・<strong>診断完了までは他のメニューに進めません</strong>。
        </div>
        <div style={{ marginTop: space[5], display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" size="lg" onClick={onStart}>
            ソーシャルスタイル診断を開始する
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────
function QuizView({ currentIdx, total, question, selectedValue, saving, finalizing, onAnswer, onBack }) {
  const progress = Math.round(((currentIdx) / total) * 100);
  const answeredProgress = Math.round(((currentIdx + (selectedValue != null ? 1 : 0)) / total) * 100);
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading title="ソーシャルスタイル診断" subtitle={`質問 ${currentIdx + 1} / ${total}`} />

      <div>
        <div style={{
          height: 8, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${answeredProgress}%`,
            background: color.navyLight, transition: 'width 0.3s ease',
          }}/>
        </div>
        <div style={{
          marginTop: space[1], fontSize: font.size.xs, color: color.textMid,
          fontFamily: font.family.mono, textAlign: 'right',
        }}>
          {progress}% {saving && ' · 保存中…'}
        </div>
      </div>

      <Card padding="lg">
        <div style={{
          fontSize: font.size.xs, color: color.textLight, marginBottom: space[2],
          letterSpacing: font.letterSpacing.wider, fontWeight: font.weight.semibold,
        }}>
          Q{currentIdx + 1}
        </div>
        <div style={{
          fontSize: font.size.xl, color: color.textDark, lineHeight: font.lineHeight.relaxed,
          fontWeight: font.weight.semibold, marginBottom: space[5],
        }}>
          {question.text}
        </div>

        <div style={{ display: 'grid', gap: space[2] }}>
          {SATISFACTION.map(opt => {
            const active = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                disabled={finalizing}
                onClick={() => onAnswer(opt.value)}
                style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr',
                  alignItems: 'center', gap: space[3],
                  padding: `${space[3]}px ${space[4]}px`,
                  background: active ? color.navy : color.white,
                  color: active ? color.white : color.textDark,
                  border: `1px solid ${active ? color.navy : color.border}`,
                  borderRadius: radius.md,
                  cursor: finalizing ? 'wait' : 'pointer',
                  fontSize: font.size.md,
                  fontWeight: active ? font.weight.semibold : font.weight.normal,
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: radius.pill,
                  background: active ? color.white : alpha(color.navy, 0.08),
                  color: active ? color.navy : color.navy,
                  fontWeight: font.weight.bold, fontFamily: font.family.mono,
                  fontSize: font.size.sm,
                }}>{opt.value}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={onBack} disabled={currentIdx === 0 || finalizing}>
          ← 前の質問
        </Button>
        <div style={{ fontSize: font.size.xs, color: color.textLight, alignSelf: 'center' }}>
          {finalizing ? '結果を集計中…' : '選択肢をタップすると次の質問に進みます'}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
function ResultView({ response }) {
  const type = response.result_type;
  const def = type ? SOCIAL_STYLE_DESCRIPTIONS[type] : null;
  const scores = response.result_scores || null;

  if (!def) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Heading title="ソーシャルスタイル診断 結果" subtitle="判定タイプが取得できませんでした" />
        <Card padding="md">
          <p style={{ fontSize: font.size.sm, color: color.textMid }}>
            運営にお問い合わせください。
          </p>
        </Card>
      </div>
    );
  }

  const detailed = def.coach_detailed_guide || null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading title="ソーシャルスタイル診断 結果" subtitle="ご回答ありがとうございました" />

      <Card padding="lg">
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[3] }}>
          <Badge variant={TYPE_BADGE_VARIANT[type] || 'neutral'} dot>{def.label}</Badge>
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
            {def.headline}
          </span>
        </div>
        <p style={{ fontSize: font.size.md, color: color.textDark, lineHeight: font.lineHeight.relaxed, margin: 0 }}>
          {def.summary}
        </p>
      </Card>

      <Card padding="md" title="あなたの強み">
        <Chips items={def.strengths} variant="success" />
      </Card>

      <Card padding="md" title="意識しておきたいこと">
        <Chips items={def.cautions} variant="warn" />
      </Card>

      {scores && (
        <Card padding="md" title="スコアバランス">
          {Object.entries(SOCIAL_STYLE_DESCRIPTIONS).map(([k, d]) => (
            <ScoreBar key={k} label={d.label} value={scores[k] || 0} active={k === type} />
          ))}
        </Card>
      )}

      {detailed && (
        <Card padding="md" title="トレーナーがあなたに合わせて意識すること" description="この内容はトレーナーにも共有され、セッションでの関わり方に反映されます">
          {detailed.conversation_opener && <DetailRow label="会話の入り方" body={detailed.conversation_opener} />}
          {detailed.feedback_style && <DetailRow label="フィードバックの伝え方" body={detailed.feedback_style} />}
          {detailed.motivation_design && <DetailRow label="動機付け方" body={detailed.motivation_design} />}
        </Card>
      )}

      <div style={{
        padding: space[3], background: alpha(color.success, 0.08),
        border: `1px solid ${alpha(color.success, 0.3)}`,
        borderRadius: radius.md,
        fontSize: font.size.sm, color: color.textDark, textAlign: 'center',
      }}>
        診断が完了しました。次にサイドメニューから「キックオフヒアリング」または「基本情報」へお進みください。
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
function Heading({ title, subtitle }) {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>
      {children}
    </div>
  );
}

function Chips({ items, variant }) {
  if (!items || !items.length) return <div style={{ fontSize: font.size.sm, color: color.textLight }}>—</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1.5] }}>
      {items.map((it, i) => <Badge key={i} variant={variant}>{it}</Badge>)}
    </div>
  );
}

function DetailRow({ label, body }) {
  return (
    <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.borderLight}` }}>
      <div style={{
        fontSize: font.size.xs, color: color.textMid,
        letterSpacing: font.letterSpacing.wider,
        fontWeight: font.weight.semibold,
        marginBottom: space[1],
      }}>
        {label}
      </div>
      <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed }}>
        {body}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, active }) {
  const max = 16;
  const v = Math.max(-max, Math.min(max, value));
  const pct = ((v + max) / (max * 2)) * 100;
  return (
    <div style={{ marginBottom: space[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.xs, color: active ? color.navy : color.textMid, marginBottom: 2, fontWeight: active ? font.weight.bold : font.weight.normal }}>
        <span>{label}{active && ' ← あなたのタイプ'}</span>
        <span style={{ fontFamily: font.family.mono }}>{v > 0 ? '+' : ''}{v}</span>
      </div>
      <div style={{
        height: 6, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: active ? color.navy : color.navyLight,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
