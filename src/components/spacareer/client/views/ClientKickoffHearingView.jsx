import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, space, font, radius, shadow, alpha } from '../../../../constants/design';
import { Button, Card, Badge, Input } from '../../../ui';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

// 仕様書: tasks/spacareer-spec.md §6.2A 第1回前ヒアリングシート（キックオフ専用・70問固定）
// 実装todo: tasks/spacareer-kickoff-hearing-todo.md Phase C
//
// 仕様要点:
//  - 第1回前のみ起動する独立画面（既存「事前課題」とは別物）
//  - 70問+ボーナス3問、セクションA〜J + BONUS の折りたたみUI
//  - 初回回答から72時間期限（DB trigger で自動セット）
//  - 途中保存可、blur で自動保存
//  - センシティブ項目(G健康・I家族)とBONUSは任意
//  - 必須項目すべて回答済みで初めて提出可能
//  - 提出後はサンクス画面に切替

const AUTOSAVE_DEBOUNCE_MS = 800;

export default function ClientKickoffHearingView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({}); // {[question_id]: answer_text}
  const [collapsed, setCollapsed] = useState({}); // {[section_code]: bool}
  const [savingMap, setSavingMap] = useState({}); // {[question_id]: bool}
  const [savedAt, setSavedAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null); // { message: string }

  // 1秒ごとにカウントダウン更新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // トースト自動非表示
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // 初期ロード
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: member } = await supabase
          .from('members').select('id').eq('user_id', profile.id).maybeSingle();
        if (!member) { if (!cancelled) { setError('メンバー情報が見つかりません'); setLoading(false); } return; }

        const { data: cust } = await supabase
          .from('spacareer_customers').select('id, org_id').eq('member_id', member.id).maybeSingle();
        if (!cust) { if (!cancelled) { setError('受講情報が見つかりません'); setLoading(false); } return; }

        const [sessRes, qRes, rRes] = await Promise.all([
          supabase
            .from('spacareer_kickoff_hearing_sessions')
            .select('*')
            .eq('customer_id', cust.id)
            .maybeSingle(),
          supabase
            .from('spacareer_kickoff_hearing_questions')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true }),
          supabase
            .from('spacareer_kickoff_hearing_responses')
            .select('question_id, answer_text')
            .eq('customer_id', cust.id),
        ]);

        if (cancelled) return;

        if (sessRes.error) throw sessRes.error;
        if (qRes.error) throw qRes.error;
        if (rRes.error) throw rRes.error;

        setCustomer(cust);
        setSession(sessRes.data || null);
        setQuestions(qRes.data || []);

        const respMap = {};
        (rRes.data || []).forEach(r => { respMap[r.question_id] = r.answer_text || ''; });
        setResponses(respMap);

        setLoading(false);
      } catch (e) {
        console.error('[ClientKickoffHearing] load error:', e);
        if (!cancelled) { setError(e.message || String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // セクション分け
  const sections = useMemo(() => {
    const map = new Map();
    questions.forEach(q => {
      if (!map.has(q.section_code)) {
        map.set(q.section_code, { code: q.section_code, name: q.section_name, items: [] });
      }
      map.get(q.section_code).items.push(q);
    });
    return Array.from(map.values());
  }, [questions]);

  // 進捗計算（必須項目のみ）
  // 必須項目は「未回答」または「min_chars 未満」だと進捗にカウントしない
  const requiredQuestions = useMemo(() => questions.filter(q => q.is_required), [questions]);
  const isRequiredFulfilled = (q, raw) => {
    const v = (raw || '').trim();
    if (v.length === 0) return false;
    if (q.min_chars && v.length < q.min_chars) return false;
    return true;
  };
  const requiredAnswered = useMemo(
    () => requiredQuestions.filter(q => isRequiredFulfilled(q, responses[q.id])).length,
    [requiredQuestions, responses],
  );
  const requiredProgress = requiredQuestions.length
    ? Math.round((requiredAnswered / requiredQuestions.length) * 100)
    : 0;
  const canSubmit = requiredAnswered === requiredQuestions.length && requiredQuestions.length > 0;

  // セクションごとの必須未回答数（min_chars 未満も未回答扱い）
  const sectionStats = useMemo(() => {
    const m = {};
    sections.forEach(sec => {
      const req = sec.items.filter(it => it.is_required);
      const answered = req.filter(it => isRequiredFulfilled(it, responses[it.id])).length;
      m[sec.code] = {
        requiredTotal: req.length,
        requiredDone: answered,
        allTotal: sec.items.length,
        allDone: sec.items.filter(it => (responses[it.id] || '').trim().length > 0).length,
      };
    });
    return m;
  }, [sections, responses]);

  // 72hカウントダウン
  const countdown = useMemo(() => {
    if (!session) return null;
    if (session.status === 'submitted' || session.status === 'ai_extracted' || session.status === 'completed') return null;
    const effectiveDeadline = session.deadline_extended_to || session.deadline_at;
    if (!effectiveDeadline) {
      return { kind: 'not_started', label: '最初に1問でも保存すると72時間カウントダウンが始まります' };
    }
    const diff = new Date(effectiveDeadline).getTime() - now;
    if (diff <= 0) return { kind: 'expired', label: '提出期限を過ぎました（運営にご連絡ください）' };
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return {
      kind: hours < 24 ? 'urgent' : 'normal',
      label: `提出期限まで ${hours}時間 ${String(minutes).padStart(2,'0')}分 ${String(seconds).padStart(2,'0')}秒`,
    };
  }, [session, now]);

  // upsert保存（debounced auto-save）
  const saveTimers = useRef({});
  const saveResponse = async (questionId, answerText) => {
    if (!customer) return;
    setSavingMap(prev => ({ ...prev, [questionId]: true }));
    try {
      const { error: e } = await supabase
        .from('spacareer_kickoff_hearing_responses')
        .upsert({
          org_id: customer.org_id,
          customer_id: customer.id,
          question_id: questionId,
          answer_text: answerText ?? null,
          is_draft: true,
          answered_at: new Date().toISOString(),
        }, { onConflict: 'customer_id,question_id' });
      if (e) throw e;
      setSavedAt(new Date());
      // セッション状態の再フェッチ（初回回答時に first_accessed_at/deadline_at が trigger でセットされる）
      if (!session?.first_accessed_at) {
        const { data: s } = await supabase
          .from('spacareer_kickoff_hearing_sessions')
          .select('*')
          .eq('customer_id', customer.id)
          .maybeSingle();
        if (s) setSession(s);
      }
    } catch (e) {
      console.error('[ClientKickoffHearing] save error:', e);
      alert('保存に失敗しました: ' + (e.message || e));
    } finally {
      setSavingMap(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleAnswerChange = (questionId, val) => {
    setResponses(prev => ({ ...prev, [questionId]: val }));
    // debounce
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      saveResponse(questionId, val);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const handleManualSaveAll = async () => {
    if (!customer || !questions.length) return;
    setSavingMap(prev => {
      const m = { ...prev };
      questions.forEach(q => { m[q.id] = true; });
      return m;
    });
    try {
      const rows = questions.map(q => ({
        org_id: customer.org_id,
        customer_id: customer.id,
        question_id: q.id,
        answer_text: responses[q.id] ?? null,
        is_draft: true,
        answered_at: new Date().toISOString(),
      }));
      const { error: e } = await supabase
        .from('spacareer_kickoff_hearing_responses')
        .upsert(rows, { onConflict: 'customer_id,question_id' });
      if (e) throw e;
      setSavedAt(new Date());
      setToast({ message: '回答内容を保存しました' });
    } catch (e) {
      console.error('[ClientKickoffHearing] saveAll error:', e);
      alert('一時保存に失敗しました: ' + (e.message || e));
    } finally {
      setSavingMap(prev => {
        const m = { ...prev };
        questions.forEach(q => { delete m[q.id]; });
        return m;
      });
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      // 文字数下限を満たさない必須項目だけ抽出して具体的に提示
      const insufficient = requiredQuestions
        .filter(q => {
          const v = (responses[q.id] || '').trim();
          return v.length > 0 && q.min_chars && v.length < q.min_chars;
        })
        .map(q => `Q${q.question_number}: ${q.question_text.slice(0, 30)}... （現在 ${(responses[q.id] || '').trim().length} / 最低 ${q.min_chars} 文字）`);
      const empty = requiredQuestions.filter(q => !(responses[q.id] || '').trim().length).length;
      const lines = [];
      if (empty > 0) lines.push(`未回答の必須項目が ${empty} 問あります`);
      if (insufficient.length > 0) {
        lines.push('以下の必須項目が最低文字数を満たしていません:');
        lines.push(...insufficient);
      }
      alert(lines.join('\n'));
      return;
    }
    if (!window.confirm('回答を提出します。\n提出後は内容変更ができません。よろしいですか？')) return;
    setSubmitting(true);
    try {
      // 全件 is_draft=false で確定
      const rows = questions.map(q => ({
        org_id: customer.org_id,
        customer_id: customer.id,
        question_id: q.id,
        answer_text: responses[q.id] ?? null,
        is_draft: false,
        answered_at: new Date().toISOString(),
      }));
      const { error: upErr } = await supabase
        .from('spacareer_kickoff_hearing_responses')
        .upsert(rows, { onConflict: 'customer_id,question_id' });
      if (upErr) throw upErr;

      // セッションを submitted に
      const { data: sess, error: sErr } = await supabase
        .from('spacareer_kickoff_hearing_sessions')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('customer_id', customer.id)
        .select('*')
        .maybeSingle();
      if (sErr) throw sErr;
      if (sess) setSession(sess);

      // AI抽出 Edge Function をバックグラウンドで起動（結果待ちはしない）
      // 失敗してもユーザー体験は止めない。運営側で再実行可能。
      supabase.functions.invoke('analyze-kickoff-hearing', {
        body: { customer_id: customer.id },
      }).catch((e) => {
        console.error('[ClientKickoffHearing] AI extraction invoke error:', e);
      });
    } catch (e) {
      console.error('[ClientKickoffHearing] submit error:', e);
      alert('提出に失敗しました: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------
  // レンダリング分岐
  // -----------------------------
  if (loading) return <Centered>読み込み中...</Centered>;
  if (error) return <Centered>{error}</Centered>;
  if (!customer) return <Centered>受講情報が見つかりません。運営にお問い合わせください。</Centered>;
  if (!session) return <Centered>キックオフヒアリングのセッションが見つかりません。運営にお問い合わせください。</Centered>;
  if (questions.length === 0) return <Centered>質問が見つかりません。運営にお問い合わせください。</Centered>;

  // 提出済み or AI抽出済み or 完了 → サンクス画面
  if (['submitted', 'ai_extracted', 'completed'].includes(session.status)) {
    return <SubmittedView session={session} />;
  }

  return (
    <div style={{ padding: space[6], display: 'flex', flexDirection: 'column', gap: space[4], paddingBottom: 140 }}>
      <Heading />

      {/* 上部固定バー: カウントダウン + 進捗 */}
      <Card padding="md">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[4] }}>
          {countdown && (
            <Badge
              variant={countdown.kind === 'expired' ? 'danger' : countdown.kind === 'urgent' ? 'warn' : 'info'}
              dot
            >{countdown.label}</Badge>
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <ProgressBar pct={requiredProgress} />
            <div style={{ marginTop: space[1], fontSize: font.size.xs, color: color.textMid }}>
              必須項目 {requiredAnswered} / {requiredQuestions.length} 回答済み
            </div>
          </div>
          {savedAt && (
            <span style={{ fontSize: font.size.xs, color: color.textLight }}>
              最終保存: {savedAt.toLocaleTimeString('ja-JP')}
            </span>
          )}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: space[4], alignItems: 'flex-start' }}>
        {/* 中央: セクションA〜J + BONUS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {sections.map(sec => (
            <SectionCard
              key={sec.code}
              section={sec}
              stats={sectionStats[sec.code]}
              collapsed={!!collapsed[sec.code]}
              onToggle={() => setCollapsed(prev => ({ ...prev, [sec.code]: !prev[sec.code] }))}
              responses={responses}
              savingMap={savingMap}
              onAnswerChange={handleAnswerChange}
            />
          ))}
        </div>

        {/* 右カラム: セクション一覧（ジャンプ + 進捗） */}
        <Card title="セクション一覧" padding="md" style={{ position: 'sticky', top: space[4] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sections.map(sec => {
              const st = sectionStats[sec.code];
              const allDone = st.requiredTotal === 0 || st.requiredDone === st.requiredTotal;
              return (
                <a
                  key={sec.code}
                  href={`#sec-${sec.code}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
                    padding: `${space[2]}px ${space[2]}px`,
                    borderRadius: radius.sm,
                    color: color.textDark,
                    fontSize: font.size.xs,
                    textDecoration: 'none',
                    background: allDone ? alpha(color.success, 0.06) : 'transparent',
                  }}
                  onClick={() => {
                    if (collapsed[sec.code]) {
                      setCollapsed(prev => ({ ...prev, [sec.code]: false }));
                    }
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.name}</span>
                  <span style={{ color: color.textLight, fontVariantNumeric: 'tabular-nums' }}>
                    {st.requiredTotal > 0 ? `${st.requiredDone}/${st.requiredTotal}` : '任意'}
                  </span>
                </a>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 下部固定バー: 一時保存 / 提出 */}
      <div style={{
        position: 'fixed', left: 220, right: 0, bottom: 0,
        padding: `${space[3]}px ${space[6]}px`,
        background: color.white,
        borderTop: `1px solid ${color.border}`,
        boxShadow: shadow.md,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3],
        zIndex: 50,
      }}>
        <div style={{ fontSize: font.size.xs, color: color.textMid }}>
          {canSubmit
            ? '必須項目はすべて回答済みです。提出できます。'
            : `必須項目があと ${requiredQuestions.length - requiredAnswered} 問残っています`}
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button variant="outline" onClick={handleManualSaveAll}>一時保存</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!canSubmit || submitting}>
            提出する
          </Button>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 96, right: 32,
          background: color.navy,
          color: color.white,
          padding: `${space[3]}px ${space[4]}px`,
          borderRadius: radius.md,
          boxShadow: shadow.lg,
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          letterSpacing: font.letterSpacing.wide,
          zIndex: 100,
          animation: 'fadeIn 0.2s ease',
        }}>{toast.message}</div>
      )}
    </div>
  );
}

// =====================================================================
// サブコンポーネント
// =====================================================================

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>
        キックオフヒアリング
      </h1>
      <p style={{ fontSize: font.size.sm, color: color.textMid, marginTop: space[1], lineHeight: font.lineHeight.relaxed }}>
        第1回セッションを最大限有意義な時間にするための事前ヒアリングです。所要時間60〜90分を目安に、ご自身の現状と未来像を言語化してください。途中保存できます。
      </p>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ padding: space[6], color: color.textLight, fontSize: font.size.sm }}>{children}</div>
  );
}

function ProgressBar({ pct }) {
  return (
    <div style={{
      width: '100%', height: 8, borderRadius: 999,
      background: color.gray200, overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: pct >= 100 ? color.success : color.navy,
        transition: 'width 0.3s',
      }} />
    </div>
  );
}

function SectionCard({ section, stats, collapsed, onToggle, responses, savingMap, onAnswerChange }) {
  const isOptional = stats.requiredTotal === 0;
  return (
    <Card padding="none" id={`sec-${section.code}`} style={{ scrollMarginTop: 80 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${space[3]}px ${space[4]}px`,
          background: 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${color.borderLight}`,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
            {section.name}
          </span>
          {isOptional && <Badge variant="neutral" size="sm">任意</Badge>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <span style={{ fontSize: font.size.xs, color: color.textMid, fontVariantNumeric: 'tabular-nums' }}>
            {isOptional
              ? `${stats.allDone}/${stats.allTotal} 回答`
              : `必須 ${stats.requiredDone}/${stats.requiredTotal}`}
          </span>
          <Chevron open={!collapsed} />
        </div>
      </button>
      {!collapsed && (
        <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {/* 動機・価値観の深掘りセクションは、本人が後で見返した時の価値を出すため冒頭に注意書きを出す */}
          {section.code === 'D' && (
            <div style={{
              padding: `${space[2]}px ${space[3]}px`,
              background: alpha(color.gold, 0.10),
              border: `1px solid ${alpha(color.gold, 0.30)}`,
              borderRadius: radius.md,
              fontSize: font.size.sm,
              color: color.textDark,
              lineHeight: font.lineHeight.relaxed,
            }}>
              <strong style={{ color: color.navy }}>このセクションは具体的に記載してください。</strong>
              <br />
              数ヶ月後の自分が見返したときに、いま抱えているもやもや・想い・覚悟をはっきり言語化しておくことが、その後の意思決定の軸になります。
            </div>
          )}
          {section.items.map((q, idx) => (
            <QuestionItem
              key={q.id}
              index={idx + 1}
              question={q}
              answer={responses[q.id] || ''}
              saving={!!savingMap[q.id]}
              onAnswerChange={(v) => onAnswerChange(q.id, v)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <path d="M3 5l4 4 4-4" stroke={color.textMid} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionItem({ index, question, answer, saving, onAnswerChange }) {
  const len = (answer || '').length;
  const max = question.char_limit || null;
  const required = question.is_required;
  const isSelectOne = question.answer_type === 'select_one' && Array.isArray(question.options);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2], marginBottom: space[2] }}>
        <span style={{
          flexShrink: 0,
          width: 24, height: 24, borderRadius: '50%',
          background: color.gray100, color: color.textMid,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: font.size.xs, fontWeight: font.weight.bold,
          fontVariantNumeric: 'tabular-nums',
        }}>{question.question_number}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.textDark }}>
              {question.question_text}
            </span>
            {required
              ? <Badge variant="danger" size="sm">必須</Badge>
              : <Badge variant="neutral" size="sm">任意</Badge>}
          </div>
          {question.help_text && (
            <div style={{ fontSize: font.size.xs, color: color.textLight, lineHeight: font.lineHeight.relaxed, marginTop: space[1] }}>
              {question.help_text}
            </div>
          )}
        </div>
      </div>

      {isSelectOne ? (
        <SelectOneInput
          options={question.options}
          value={answer}
          onChange={onAnswerChange}
        />
      ) : question.answer_type === 'date' ? (
        <Input
          type="date"
          value={answer || ''}
          onChange={e => onAnswerChange(e.target.value)}
        />
      ) : question.answer_type === 'number' ? (
        <Input
          type="number"
          value={answer || ''}
          placeholder={question.placeholder || ''}
          onChange={e => onAnswerChange(e.target.value)}
        />
      ) : question.answer_type === 'short_text' ? (
        <Input
          type="text"
          value={answer || ''}
          placeholder={question.placeholder || ''}
          onChange={e => onAnswerChange(e.target.value)}
          maxLength={max || undefined}
        />
      ) : (
        <textarea
          value={answer || ''}
          onChange={e => onAnswerChange(e.target.value)}
          placeholder={question.placeholder || ''}
          rows={6}
          maxLength={max || undefined}
          style={{
            width: '100%',
            padding: `${space[3]}px ${space[3]}px`,
            fontSize: font.size.md,
            color: color.textDark,
            fontFamily: font.family.sans,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            outline: 'none',
            resize: 'vertical',
            minHeight: 120,
            boxSizing: 'border-box',
            lineHeight: font.lineHeight.relaxed,
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space[1] }}>
        <span style={{ fontSize: font.size.xs, color: saving ? color.info : color.textLight }}>
          {saving ? '保存中...' : (answer ? '保存済み' : '未回答')}
        </span>
        {(max || question.min_chars) && (() => {
          const minChars = question.min_chars || null;
          const underMin = minChars != null && len > 0 && len < minChars;
          const overMax = max != null && len > max;
          const color2 = underMin || overMax ? color.danger : color.textLight;
          const remaining = minChars != null && len < minChars ? (minChars - len) : 0;
          return (
            <span style={{
              fontSize: font.size.xs,
              color: color2,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {len}{max ? ` / ${max}` : ''} 文字
              {minChars && (
                <>
                  {' '}（最低 {minChars} 文字
                  {underMin && <>・あと {remaining} 文字必要</>}
                  ）
                </>
              )}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

function SelectOneInput({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {options.map(opt => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              padding: `${space[2]}px ${space[3]}px`,
              border: `1px solid ${selected ? color.navy : color.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              background: selected ? alpha(color.navyLight, 0.08) : color.white,
              fontSize: font.size.sm,
              color: color.textDark,
              transition: 'all 0.15s',
            }}
          >
            <input
              type="radio"
              checked={selected}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: color.navy }}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function SubmittedView({ session }) {
  return (
    <div style={{ padding: space[6], maxWidth: 720 }}>
      <Card padding="lg">
        <h1 style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.navy, margin: 0 }}>
          ご回答ありがとうございました
        </h1>
        <p style={{ fontSize: font.size.md, color: color.textDark, marginTop: space[3], lineHeight: font.lineHeight.relaxed }}>
          キックオフヒアリングの提出が完了しました。第1回セッションでお会いできることを楽しみにしております。
        </p>
        <div style={{
          marginTop: space[4],
          padding: space[3],
          background: color.cream,
          borderRadius: radius.md,
          fontSize: font.size.sm,
          color: color.textMid,
          lineHeight: font.lineHeight.relaxed,
        }}>
          <div>提出日時: {session.submitted_at ? new Date(session.submitted_at).toLocaleString('ja-JP') : '—'}</div>
        </div>
      </Card>
    </div>
  );
}
