import React, { useMemo, useState } from 'react';
import { color, space, font, radius, alpha, shadow } from '../../../../../constants/design';
import { Button, Card, Badge } from '../../../../ui';
import { useAuth } from '../../../../../hooks/useAuth';
import { supabase } from '../../../../../lib/supabase';

// 仕様書: tasks/spacareer-spec.md §6.2A / §8.7 / §11
// 実装todo: tasks/spacareer-kickoff-hearing-todo.md Phase D
//
// 顧客個人ページの「キックオフヒアリング」タブ。第1回前70問の進捗・AI抽出結果・原文を表示。
// AI抽出は §8.7 (highlight_top5 / deep_dive_3) を表示。Phase E で本実装される Edge Function 出力を扱う。

const SESSION_STATUS_LABEL = {
  unnotified: '未通知',
  unstarted: '未着手',
  in_progress: '入力中',
  submitted: '提出済み',
  ai_extracted: 'AI抽出済み',
  completed: '完了',
};
const SESSION_STATUS_VARIANT = {
  unnotified: 'neutral',
  unstarted: 'warn',
  in_progress: 'info',
  submitted: 'primary',
  ai_extracted: 'success',
  completed: 'success',
};

export default function TabKickoffHearing({ detail, onRefresh }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const session = detail.kickoffHearingSession;
  const aiList = detail.kickoffHearingAi || [];
  const responses = detail.kickoffHearingResponses || [];
  const questions = detail.kickoffHearingQuestions || [];

  const [collapsed, setCollapsed] = useState({});
  const [extending, setExtending] = useState(false);

  const responseByQid = useMemo(() => {
    const m = new Map();
    responses.forEach((r) => m.set(r.question_id, r));
    return m;
  }, [responses]);

  const sections = useMemo(() => {
    const map = new Map();
    questions.forEach((q) => {
      if (!map.has(q.section_code)) {
        map.set(q.section_code, { code: q.section_code, name: q.section_name, items: [] });
      }
      map.get(q.section_code).items.push(q);
    });
    return Array.from(map.values());
  }, [questions]);

  const requiredQuestions = questions.filter((q) => q.is_required);
  const requiredAnswered = requiredQuestions.filter((q) => {
    const r = responseByQid.get(q.id);
    return r && (r.answer_text || '').trim().length > 0;
  }).length;
  const requiredProgressPct = requiredQuestions.length
    ? Math.round((requiredAnswered / requiredQuestions.length) * 100)
    : 0;

  const remainingLabel = useMemo(() => {
    if (!session) return '—';
    if (['submitted', 'ai_extracted', 'completed'].includes(session.status)) return '提出済み';
    const dl = session.deadline_extended_to || session.deadline_at;
    if (!dl) return '未スタート';
    const diff = new Date(dl).getTime() - Date.now();
    if (diff <= 0) return '期限切れ';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `残り ${hours}時間 ${String(minutes).padStart(2, '0')}分`;
  }, [session]);

  const highlightAi = aiList.find((a) => a.extraction_type === 'highlight_top5');
  const deepDiveAi = aiList.find((a) => a.extraction_type === 'deep_dive_3');

  // -----------------------------
  // アクション
  // -----------------------------
  const handleExtendDeadline = async () => {
    if (!session) return;
    const baseDate = new Date(session.deadline_extended_to || session.deadline_at || Date.now());
    const defaultIso = new Date(baseDate.getTime() + 24 * 3600000).toISOString().slice(0, 16);
    const input = window.prompt(
      `新しい提出期限を入力してください (現在: ${session.deadline_extended_to || session.deadline_at || '未設定'})\nYYYY-MM-DDTHH:MM 形式`,
      defaultIso,
    );
    if (!input) return;
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) { alert('日時の形式が不正です'); return; }
    setExtending(true);
    try {
      const { error: e } = await supabase
        .from('spacareer_kickoff_hearing_sessions')
        .update({ deadline_extended_to: parsed.toISOString() })
        .eq('id', session.id);
      if (e) throw e;
      onRefresh && (await onRefresh());
    } catch (e) {
      alert('期限延長に失敗しました: ' + (e.message || e));
    } finally {
      setExtending(false);
    }
  };

  const [reextracting, setReextracting] = useState(false);
  const handleReextract = async () => {
    if (!session) return;
    if (!window.confirm('AI抽出を再実行します。\n（既存抽出はアーカイブされ、新しい結果が表示されます）')) return;
    setReextracting(true);
    try {
      const { error: e } = await supabase.functions.invoke('analyze-kickoff-hearing', {
        body: { customer_id: detail.customer?.id, force_rerun: true },
      });
      if (e) throw e;
      // バックグラウンド処理のため即座には反映されない。少し待ってから refresh
      setTimeout(() => { onRefresh && onRefresh(); }, 8000);
      alert('AI抽出を起動しました。数秒後に結果が表示されます。\n表示されない場合は画面を再読込してください。');
    } catch (e) {
      alert('AI抽出の起動に失敗しました: ' + (e.message || e));
    } finally {
      setReextracting(false);
    }
  };

  const handleCsvExport = () => {
    if (!questions.length) return;
    const header = ['section_code', 'section_name', 'question_number', 'question_text', 'answer_text', 'is_required', 'is_draft', 'answered_at'];
    const rows = [header];
    questions.forEach((q) => {
      const r = responseByQid.get(q.id);
      rows.push([
        q.section_code,
        q.section_name,
        q.question_number,
        q.question_text,
        (r?.answer_text || '').replace(/\r?\n/g, '\\n'),
        q.is_required ? '必須' : '任意',
        r ? (r.is_draft ? 'draft' : 'submitted') : '',
        r?.answered_at || '',
      ]);
    });
    const csv = rows.map((row) =>
      row.map((cell) => {
        const s = String(cell ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    ).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kickoff_hearing_${detail.customer?.id || 'customer'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -----------------------------
  // セッション未生成
  // -----------------------------
  if (!session) {
    return (
      <Card padding="lg">
        <div style={{ color: color.textMid, fontSize: font.size.sm, lineHeight: font.lineHeight.relaxed }}>
          この顧客にはまだキックオフヒアリングのセッションが作成されていません。<br />
          顧客を登録するとDB trigger で自動作成されます（既存顧客への遡及作成は Migration で実行済み）。
        </div>
      </Card>
    );
  }

  // -----------------------------
  // メイン
  // -----------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* KPI カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space[3] }}>
        <KpiCard
          label="ステータス"
          value={
            <Badge variant={SESSION_STATUS_VARIANT[session.status] || 'neutral'} dot>
              {SESSION_STATUS_LABEL[session.status] || session.status}
            </Badge>
          }
        />
        <KpiCard
          label="必須項目 回答率"
          value={`${requiredAnswered} / ${requiredQuestions.length} (${requiredProgressPct}%)`}
        />
        <KpiCard label="残り期限" value={remainingLabel} />
        <KpiCard
          label="提出日時"
          value={session.submitted_at ? new Date(session.submitted_at).toLocaleString('ja-JP') : '—'}
        />
      </div>

      {/* アクションバー */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={handleCsvExport}>CSVエクスポート</Button>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={handleExtendDeadline} loading={extending}>期限を延長</Button>
            <Button size="sm" variant="ghost" onClick={handleReextract} loading={reextracting}>AI抽出を再実行</Button>
          </>
        )}
      </div>

      {/* AI抽出結果 */}
      <Card title="AI抽出（ハイライトTop5 / 深掘り候補3つ）" padding="md">
        {!highlightAi && !deepDiveAi ? (
          <div style={{ color: color.textMid, fontSize: font.size.sm, lineHeight: font.lineHeight.relaxed }}>
            提出完了後、AI抽出が自動実行されます（Phase E: Edge Function `analyze-kickoff-hearing` で実装予定）。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {highlightAi && (
              <ExtractionBlock
                heading="重要発言ハイライト Top5"
                aiRow={highlightAi}
                renderItem={(item, i) => (
                  <div key={i}>
                    <div style={{ fontSize: font.size.sm, color: color.textDark, lineHeight: font.lineHeight.relaxed, whiteSpace: 'pre-wrap' }}>
                      {item.excerpt}
                    </div>
                    {item.why_important && (
                      <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                        理由: {item.why_important}
                      </div>
                    )}
                  </div>
                )}
              />
            )}
            {deepDiveAi && (
              <ExtractionBlock
                heading="深掘り候補 3つ"
                aiRow={deepDiveAi}
                renderItem={(item, i) => (
                  <div key={i}>
                    <div style={{ fontSize: font.size.sm, color: color.textDark, fontWeight: font.weight.semibold }}>
                      {item.topic}
                    </div>
                    {item.rationale && (
                      <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: space[1] }}>
                        {item.rationale}
                      </div>
                    )}
                    {item.suggested_question && (
                      <div style={{
                        fontSize: font.size.xs, color: color.navy, marginTop: space[1],
                        padding: space[2], background: alpha(color.navyLight, 0.06), borderRadius: radius.sm,
                      }}>
                        想定問い: {item.suggested_question}
                      </div>
                    )}
                  </div>
                )}
              />
            )}
          </div>
        )}
      </Card>

      {/* 原文回答 */}
      <Card title="原文回答（セクションA〜J + BONUS）" padding="none">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sections.map((sec) => {
            const isCollapsed = !!collapsed[sec.code];
            const answeredCount = sec.items.filter((q) => {
              const r = responseByQid.get(q.id);
              return r && (r.answer_text || '').trim().length > 0;
            }).length;
            return (
              <div key={sec.code} style={{ borderTop: `1px solid ${color.borderLight}` }}>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [sec.code]: !prev[sec.code] }))}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: `${space[3]}px ${space[4]}px`,
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.navy }}>
                    {sec.name}
                  </span>
                  <span style={{ fontSize: font.size.xs, color: color.textMid, fontVariantNumeric: 'tabular-nums' }}>
                    {answeredCount}/{sec.items.length} 回答
                  </span>
                </button>
                {!isCollapsed && (
                  <div style={{ padding: `0 ${space[4]}px ${space[4]}px`, display: 'flex', flexDirection: 'column', gap: space[3] }}>
                    {sec.items.map((q) => {
                      const r = responseByQid.get(q.id);
                      const answer = r?.answer_text || '';
                      const hasAnswer = answer.trim().length > 0;
                      return (
                        <div key={q.id} style={{
                          padding: space[3],
                          background: hasAnswer ? color.white : alpha(color.warn, 0.04),
                          border: `1px solid ${color.borderLight}`,
                          borderRadius: radius.md,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                            <span style={{
                              fontSize: font.size.xs, color: color.textMid,
                              fontVariantNumeric: 'tabular-nums', minWidth: 28,
                            }}>Q{q.question_number}</span>
                            <span style={{ flex: 1, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.textDark }}>
                              {q.question_text}
                            </span>
                            <Badge variant={q.is_required ? 'danger' : 'neutral'} size="sm">
                              {q.is_required ? '必須' : '任意'}
                            </Badge>
                          </div>
                          <div style={{
                            fontSize: font.size.sm,
                            color: hasAnswer ? color.textDark : color.textLight,
                            lineHeight: font.lineHeight.relaxed,
                            whiteSpace: 'pre-wrap',
                            fontStyle: hasAnswer ? 'normal' : 'italic',
                          }}>
                            {hasAnswer ? answer : '（未回答）'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// サブコンポーネント
// =====================================================================

function KpiCard({ label, value }) {
  return (
    <div style={{
      padding: space[3],
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
      boxShadow: shadow.xs,
    }}>
      <div style={{ fontSize: font.size.xs, color: color.textMid, letterSpacing: font.letterSpacing.wide, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.textDark }}>
        {value}
      </div>
    </div>
  );
}

function ExtractionBlock({ heading, aiRow, renderItem }) {
  const items = Array.isArray(aiRow.content_json) ? aiRow.content_json : [];
  return (
    <div>
      <div style={{
        fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy,
        marginBottom: space[2],
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span>{heading}</span>
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.regular, color: color.textLight }}>
          {aiRow.model} / {new Date(aiRow.created_at).toLocaleString('ja-JP')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {items.length === 0 ? (
          <div style={{ fontSize: font.size.sm, color: color.textLight }}>抽出結果が空です</div>
        ) : (
          items.map((item, i) => renderItem(item, i))
        )}
      </div>
    </div>
  );
}
