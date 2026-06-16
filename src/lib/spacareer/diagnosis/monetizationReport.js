// ============================================================
// マネタイズ領域診断 AIレポート生成（フロント側ラッパ）
// ----------------------------------------------------------------
// Edge Function generate-spacareer-monetization-report を呼び、
// 失敗時は決定論エンジンの result からテンプレ文を組み立ててフォールバックする。
// （既存の homework30 / dailyMessage と同じ流儀）
// ============================================================
import { supabase } from '../../supabase';
import { logSpacareerAiUsage } from '../ai/usageLog';

// レポートは sonnet-4-6 を使用（$3/MTok 入力, $15/MTok 出力）
const REPORT_MODEL = 'claude-sonnet-4-6';
function estimateSonnetCost(inputTokens = 0, outputTokens = 0) {
  const cost = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
  return Number(cost.toFixed(6));
}

// result からフォールバックのレポート文を組み立てる（AIが使えない時）
export function buildFallbackReport(result, customerName = '受講生') {
  if (!result || !result.primary) return 'レポートを生成できませんでした。';
  const p = result.primary;
  const r = p.rationale || {};
  const price = r.unitPriceRange
    ? `${r.unitPriceRange.min.toLocaleString()}〜${r.unitPriceRange.max.toLocaleString()}円 / ${r.unitPriceRange.unit}`
    : '—';
  const alts = (result.topCombos || []).slice(1, 4)
    .map((c) => `- ${c.domainLabel} × ${c.industryLabel}（スコア${c.score}）`).join('\n');

  return `## あなたにおすすめの主戦場
${customerName}さんの「やってみたい」と強み・経験から、最有力は **${p.domainLabel} × ${p.industryLabel}**（適性スコア ${p.score}）です。

## なぜあなたが勝てるのか
あなたが特に惹かれている領域であり、${p.industryLabel}の課題に対して${r.presentation || p.domainLabel}という形で価値を出せます。単価の目安は ${price} です。

## この業界の痛みとAIで切り込める余地
${p.industryLabel}には次のような痛みがあります。
${(r.pains || []).map((x) => `- ${x}`).join('\n')}
AI活用余地は5段階で ${r.aiOpportunity ?? '—'}。AIで業務効率化や人手の代替を提案できる余地があります。

## フォーム営業での入り方
テレアポは行わず、問い合わせフォーム経由で接点を作ります。フォーム営業の反応率は一律 0.05% を前提に、まずは送付数を確保して反応を測ります。

## 次点の候補
${alts || '—'}

## 最初の一歩（今週やること3つ）
- ${p.industryLabel}の企業を10社リストアップし、痛みの仮説を書き出す
- ${p.domainLabel}の提供メニューと料金を一枚にまとめる
- フォーム営業の文面を1本作り、5社に送ってみる`;
}

export async function generateMonetizationReport({ result, customerId, customerName }) {
  try {
    const { data, error } = await supabase.functions.invoke('generate-spacareer-monetization-report', {
      body: { result, customerName },
    });
    if (error || !data?.report) {
      throw new Error(error?.message || 'edge function unavailable');
    }
    logSpacareerAiUsage({
      feature: 'monetization_diagnosis',
      customerId,
      model: REPORT_MODEL,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      costUsd: estimateSonnetCost(data.usage?.input_tokens, data.usage?.output_tokens),
    });
    return { report: String(data.report), generatedAt: data.generatedAt || new Date().toISOString(), ai: true };
  } catch (e) {
    console.warn('[monetizationReport] falling back to template:', e);
    return { report: buildFallbackReport(result, customerName), generatedAt: new Date().toISOString(), ai: false };
  }
}
