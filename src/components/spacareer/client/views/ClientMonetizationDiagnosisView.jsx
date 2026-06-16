import React, { useEffect, useMemo, useState } from 'react';
import { color, space, font, radius, alpha } from '../../../../constants/design';
import { Button, Card, Badge } from '../../../ui';
import { supabase } from '../../../../lib/supabase';
import {
  MONETIZATION_QUESTIONS, TOTAL_QUESTIONS, SECTIONS, getScale,
} from '../../../../lib/spacareer/diagnosis/monetizationQuestions';
import { computeMonetizationResult } from '../../../../lib/spacareer/diagnosis/monetizationEngine';
import { generateMonetizationReport } from '../../../../lib/spacareer/diagnosis/monetizationReport';

// ============================================================
// 受講生用 マネタイズ領域診断（第2回）
// ----------------------------------------------------------------
// やりたいこと・興味・強み・業界経験から「どの領域 × どの業界で勝つか」を診断。
// 状態遷移: intro → quiz（セクション制・中断再開可）→ result（候補＋AIレポート）
// スコアはローカルの決定論エンジン、最終レポートのみ Claude（失敗時テンプレ）。
// ============================================================

const TABLE = 'spacareer_monetization_diagnosis_responses';

function answersMapToArray(map) {
  return MONETIZATION_QUESTIONS
    .filter((q) => map[q.id] != null && !(Array.isArray(map[q.id]) && map[q.id].length === 0))
    .map((q) => ({ question_id: q.id, value: map[q.id] }));
}

export default function ClientMonetizationDiagnosisView({ customerId, onCompleted }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);
  const [phase, setPhase] = useState('intro'); // 'intro' | 'quiz' | 'result'
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        let { data, error: qErr } = await supabase
          .from(TABLE)
          .select('id, customer_id, answers, current_question_no, result, report_text, completed_at')
          .eq('customer_id', customerId)
          .maybeSingle();
        if (qErr) throw qErr;

        // 行が無ければ作成（受講生本人がupsert可能なRLS）
        if (!data) {
          const { data: cust } = await supabase
            .from('spacareer_customers').select('org_id').eq('id', customerId).maybeSingle();
          if (!cust?.org_id) throw new Error('受講生情報が取得できませんでした。');
          const { data: created, error: insErr } = await supabase
            .from(TABLE)
            .insert({ customer_id: customerId, org_id: cust.org_id })
            .select('id, customer_id, answers, current_question_no, result, report_text, completed_at')
            .single();
          if (insErr) throw insErr;
          data = created;
        }
        if (cancelled) return;
        setResponse(data);

        const map = {};
        for (const a of (data.answers || [])) {
          if (a && a.question_id != null) map[a.question_id] = a.value;
        }
        setAnswersMap(map);

        if (data.completed_at) {
          setPhase('result');
        } else if (data.current_question_no > 0 || Object.keys(map).length > 0) {
          setPhase('quiz');
          setCurrentIdx(Math.max(0, Math.min(TOTAL_QUESTIONS - 1, data.current_question_no)));
        } else {
          setPhase('intro');
        }
      } catch (e) {
        console.error('[MonetizationDiag] load error:', e);
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
    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from(TABLE)
        .update({ answers: answersMapToArray(map), current_question_no: idx })
        .eq('id', response.id);
      if (uErr) throw uErr;
    } catch (e) {
      console.error('[MonetizationDiag] persist error:', e);
    } finally {
      setSaving(false);
    }
  };

  const goNext = (nextMap) => {
    const isLast = currentIdx >= TOTAL_QUESTIONS - 1;
    if (isLast) {
      finalize(nextMap);
    } else {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      persistProgress(nextMap, nextIdx);
    }
  };

  // rating / single はタップで自動前進、multi は「次へ」で前進
  const handleChoose = (q, value) => {
    const nextMap = { ...answersMap, [q.id]: value };
    setAnswersMap(nextMap);
    if (q.type === 'multi') return; // multiは確定ボタンで進む
    goNext(nextMap);
  };
  const toggleMulti = (q, value) => {
    const cur = Array.isArray(answersMap[q.id]) ? answersMap[q.id] : [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setAnswersMap({ ...answersMap, [q.id]: next });
  };
  const handleBack = () => { if (currentIdx > 0) setCurrentIdx(currentIdx - 1); };

  const finalize = async (mapForCalc) => {
    if (!response) return;
    setFinalizing(true);
    try {
      const map = mapForCalc || answersMap;
      const answersArr = answersMapToArray(map);
      const result = computeMonetizationResult(answersArr);
      const customerName = await fetchCustomerName(customerId);
      const { report, generatedAt } = await generateMonetizationReport({
        result, customerId, customerName,
      });
      const completedAt = new Date().toISOString();
      const { error: uErr } = await supabase
        .from(TABLE)
        .update({
          answers: answersArr,
          current_question_no: TOTAL_QUESTIONS,
          result,
          report_text: report,
          report_generated_at: generatedAt,
          completed_at: completedAt,
        })
        .eq('id', response.id);
      if (uErr) throw uErr;
      setResponse((prev) => ({ ...prev, result, report_text: report, completed_at: completedAt }));
      setPhase('result');
      if (onCompleted) onCompleted({ result });
    } catch (e) {
      console.error('[MonetizationDiag] finalize error:', e);
      alert('診断結果の保存に失敗しました。お手数ですが時間を置いて再度お試しください。');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <Centered>読み込み中...</Centered>;
  if (error) return <Centered>{error}</Centered>;
  if (!response) return <Centered>診断データが見つかりません。運営にお問い合わせください。</Centered>;

  if (phase === 'intro') return <IntroView onStart={() => { setPhase('quiz'); setCurrentIdx(0); }} hasProgress={Object.keys(answersMap).length > 0} />;
  if (phase === 'result') return <ResultView response={response} />;

  const q = MONETIZATION_QUESTIONS[currentIdx];
  return (
    <QuizView
      question={q}
      index={currentIdx}
      total={TOTAL_QUESTIONS}
      value={answersMap[q.id]}
      saving={saving}
      finalizing={finalizing}
      isLast={currentIdx >= TOTAL_QUESTIONS - 1}
      onChoose={handleChoose}
      onToggleMulti={toggleMulti}
      onNext={() => goNext(answersMap)}
      onBack={handleBack}
    />
  );
}

async function fetchCustomerName(customerId) {
  try {
    const { data } = await supabase
      .from('spacareer_customers')
      .select('nickname, member:members!spacareer_customers_member_id_fkey ( name )')
      .eq('id', customerId).maybeSingle();
    return data?.member?.name || data?.nickname || '受講生';
  } catch { return '受講生'; }
}

// ────────────────────────────────────────────────────────
function IntroView({ onStart, hasProgress }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading title="マネタイズ領域診断" subtitle="あなたが「どの領域 × どの業界」で勝てるかを診断します（全約40問・20〜40分）" />
      <Card padding="lg">
        <p style={{ fontSize: font.size.md, color: color.textDark, lineHeight: font.lineHeight.relaxed, marginTop: 0 }}>
          コンテンツ販売・運用代行・コンサル・受託開発などの<strong>マネタイズ領域</strong>と、
          SaaS・介護・建設・製造などの<strong>業界</strong>を掛け合わせ、
          あなたの<strong>「やってみたい」という気持ち・強み・経験</strong>から最適な主戦場を導きます。
        </p>
        <div style={{
          marginTop: space[4], padding: space[3],
          background: color.cream, borderRadius: radius.md,
          fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed,
        }}>
          <strong>ご回答にあたって</strong><br />
          ・正解はありません。<strong>「面白そう」「やってみたい」という直感</strong>を大切にお答えください。<br />
          ・所要 20〜40分。途中で離脱しても続きから再開できます。<br />
          ・結果は領域×業界の候補と、フォーム営業を前提とした入り方まで提示します。
        </div>
        <div style={{ marginTop: space[5], display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" size="lg" onClick={onStart}>
            {hasProgress ? '続きから再開する' : '診断を始める'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────
function QuizView({ question, index, total, value, saving, finalizing, isLast, onChoose, onToggleMulti, onNext, onBack }) {
  const section = SECTIONS.find((s) => s.id === question.section);
  const progress = Math.round((index / total) * 100);
  const multiSelected = Array.isArray(value) ? value : [];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading title="マネタイズ領域診断" subtitle={`質問 ${index + 1} / ${total}`} />

      <div>
        <div style={{ height: 8, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: color.navyLight, transition: 'width 0.3s ease' }} />
        </div>
        <div style={{ marginTop: space[1], display: 'flex', justifyContent: 'space-between', fontSize: font.size.xs, color: color.textMid }}>
          <span><Badge variant="neutral">{section?.label}</Badge></span>
          <span style={{ fontFamily: font.family.mono }}>{progress}%{saving && ' · 保存中…'}</span>
        </div>
      </div>

      <Card padding="lg">
        <div style={{
          fontSize: font.size.xs, color: color.textLight, marginBottom: space[2],
          letterSpacing: font.letterSpacing.wider, fontWeight: font.weight.semibold,
        }}>Q{index + 1}</div>
        <div style={{
          fontSize: font.size.xl, color: color.textDark, lineHeight: font.lineHeight.relaxed,
          fontWeight: font.weight.semibold, marginBottom: question.hint ? space[2] : space[5],
        }}>{question.text}</div>
        {question.hint && (
          <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[5], lineHeight: font.lineHeight.relaxed }}>
            {question.hint}
          </div>
        )}

        {question.type === 'rating' && (
          <div style={{ display: 'grid', gap: space[2] }}>
            {getScale(question.scaleId).map((opt) => (
              <ChoiceButton key={opt.value} active={value === opt.value} disabled={finalizing}
                num={opt.value} label={opt.label} onClick={() => onChoose(question, opt.value)} />
            ))}
          </div>
        )}

        {question.type === 'single' && (
          <div style={{ display: 'grid', gap: space[2] }}>
            {question.options.map((opt) => (
              <ChoiceButton key={opt.value} active={value === opt.value} disabled={finalizing}
                label={opt.label} onClick={() => onChoose(question, opt.value)} />
            ))}
          </div>
        )}

        {question.type === 'multi' && (
          <>
            <div style={{ display: 'grid', gap: space[2] }}>
              {question.options.map((opt) => (
                <ChoiceButton key={opt.value} active={multiSelected.includes(opt.value)} disabled={finalizing}
                  check label={opt.label} onClick={() => onToggleMulti(question, opt.value)} />
              ))}
            </div>
            <div style={{ marginTop: space[4], display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" loading={finalizing} onClick={onNext}>
                {isLast ? '診断結果を見る' : '次へ'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={onBack} disabled={index === 0 || finalizing}>← 前の質問</Button>
        <div style={{ fontSize: font.size.xs, color: color.textLight, alignSelf: 'center' }}>
          {finalizing ? '結果を集計中…' : (question.type === 'multi' ? '選んで「次へ」' : '選ぶと次の質問へ進みます')}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({ active, disabled, num, label, check, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: (num != null || check) ? '32px 1fr' : '1fr',
      alignItems: 'center', gap: space[3],
      padding: `${space[3]}px ${space[4]}px`,
      background: active ? color.navy : color.white,
      color: active ? color.white : color.textDark,
      border: `1px solid ${active ? color.navy : color.border}`,
      borderRadius: radius.md, cursor: disabled ? 'wait' : 'pointer',
      fontSize: font.size.md, fontWeight: active ? font.weight.semibold : font.weight.normal,
      textAlign: 'left', transition: 'all 0.15s ease',
    }}>
      {(num != null || check) && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: check ? radius.sm : radius.pill,
          background: active ? color.white : alpha(color.navy, 0.08),
          color: color.navy, fontWeight: font.weight.bold, fontFamily: font.family.mono, fontSize: font.size.sm,
        }}>{check ? (active ? '✓' : '') : num}</span>
      )}
      <span>{label}</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────
function ResultView({ response }) {
  const result = response.result;
  const report = response.report_text;
  if (!result || !result.primary) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Heading title="マネタイズ領域診断 結果" subtitle="結果を取得できませんでした" />
        <Card padding="md"><p style={{ fontSize: font.size.sm, color: color.textMid }}>運営にお問い合わせください。</p></Card>
      </div>
    );
  }
  const p = result.primary;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Heading title="マネタイズ領域診断 結果" subtitle="あなたの「やってみたい」と強み・経験から導きました" />

      <Card padding="lg">
        <div style={{ fontSize: font.size.xs, color: color.textLight, letterSpacing: font.letterSpacing.wide, fontWeight: font.weight.semibold }}>
          最有力の主戦場
        </div>
        <div style={{ marginTop: space[2], display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy }}>{p.domainLabel}</span>
          <span style={{ color: color.textLight }}>×</span>
          <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.textDark }}>{p.industryLabel}</span>
          <Badge variant="success" dot>適性スコア {p.score}</Badge>
        </div>
        <div style={{ marginTop: space[2], fontSize: font.size.sm, color: color.textMid }}>{p.rationale?.howToEnter}</div>
      </Card>

      <Card padding="md" title="他の有力候補">
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {result.topCombos.slice(1).map((c) => (
            <div key={c.domainId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: `${space[2]}px ${space[3]}px`, background: color.snow,
              border: `1px solid ${color.borderLight}`, borderRadius: radius.md,
            }}>
              <span style={{ fontSize: font.size.md, color: color.textDark }}>
                <strong>{c.domainLabel}</strong> × {c.industryLabel}
              </span>
              <Badge variant="neutral">スコア {c.score}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="md" title="領域別の適性">
        {result.domainRanking.slice(0, 8).map((d) => (
          <ScoreBar key={d.domainId} label={d.domainLabel} value={d.score} active={d.domainId === p.domainId} />
        ))}
      </Card>

      <Card padding="md" title="フォーム営業での見込み（概算）"
        description="テレアポは行わず、問い合わせフォーム経由で接点を作る前提です。">
        <div style={{ fontSize: font.size.sm, color: color.textMid, marginBottom: space[3] }}>{result.funnel.note}</div>
        <div style={{ display: 'grid', gap: space[2] }}>
          {result.funnel.samples.map((s) => (
            <div key={s.approaches} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: `${space[2]}px ${space[3]}px`, background: color.snow,
              borderRadius: radius.md, fontFamily: font.family.mono, fontSize: font.size.sm, color: color.textDark,
            }}>
              <span>送付 {s.approaches.toLocaleString()} 件</span>
              <span>反応率 0.05% → 約 {s.expectedResponses} 件</span>
            </div>
          ))}
        </div>
        {result.funnel.unitPriceRange && (
          <div style={{ marginTop: space[3], fontSize: font.size.sm, color: color.textMid }}>
            想定単価: {result.funnel.unitPriceRange.min.toLocaleString()}〜{result.funnel.unitPriceRange.max.toLocaleString()}円 / {result.funnel.unitPriceRange.unit}
          </div>
        )}
      </Card>

      {report && (
        <Card padding="lg" title="あなたへのアドバイス">
          <ReportMarkdown text={report} />
        </Card>
      )}
    </div>
  );
}

// 簡易マークダウン描画（## 見出し / - 箇条書き / 段落）。外部依存なし。
function ReportMarkdown({ text }) {
  const lines = String(text).split('\n');
  const blocks = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      blocks.push(<ul key={`ul${blocks.length}`} style={{ margin: `${space[1]}px 0 ${space[2]}px`, paddingLeft: space[4] }}>
        {list.map((li, i) => <li key={i} style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, marginBottom: 2 }}>{li}</li>)}
      </ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const ln = raw.trim();
    if (!ln) { flush(); return; }
    if (ln.startsWith('## ')) {
      flush();
      blocks.push(<div key={`h${i}`} style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginTop: space[3], marginBottom: space[1] }}>{ln.slice(3)}</div>);
    } else if (ln.startsWith('- ')) {
      list.push(stripBold(ln.slice(2)));
    } else {
      flush();
      blocks.push(<p key={`p${i}`} style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, margin: `0 0 ${space[2]}px` }}>{stripBold(ln)}</p>);
    }
  });
  flush();
  return <div>{blocks}</div>;
}
function stripBold(s) { return s.replace(/\*\*(.+?)\*\*/g, '$1'); }

// ────────────────────────────────────────────────────────
function Heading({ title, subtitle }) {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1] }}>{subtitle}</p>}
    </div>
  );
}
function Centered({ children }) {
  return <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>;
}
function ScoreBar({ label, value, active }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ marginBottom: space[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.xs, color: active ? color.navy : color.textMid, marginBottom: 2, fontWeight: active ? font.weight.bold : font.weight.normal }}>
        <span>{label}{active && ' ← おすすめ'}</span>
        <span style={{ fontFamily: font.family.mono }}>{value}</span>
      </div>
      <div style={{ height: 6, background: color.gray100, borderRadius: radius.pill, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: active ? color.navy : color.navyLight, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}
