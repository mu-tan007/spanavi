// ============================================================
// AI利用ログ書き込みヘルパー
// 仕様書 §7.7 AIコストタブ / §7.8 設定>AI利用状況 で集計
// ============================================================
import { supabase } from '../../supabase';
import { getOrgId } from '../../orgContext';

export type SpacareerAiFeature =
  | 'minutes_generation'
  | 'homework_30items'
  | 'social_style'
  | 'strength_diagnosis'
  | 'phrase_extraction'
  | 'daily_message';

export type AiUsageLogInput = {
  feature: SpacareerAiFeature;
  customerId?: string | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  status?: 'success' | 'error';
  errorMessage?: string;
};

// 概算コスト計算（Claude Haiku 4.5：$1/MTok 入力, $5/MTok 出力 の想定）
export function estimateClaudeHaikuCost(inputTokens = 0, outputTokens = 0): number {
  const inputCost = (inputTokens / 1_000_000) * 1.0;
  const outputCost = (outputTokens / 1_000_000) * 5.0;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * spacareer_ai_usage_logs に1行記録する。
 * 失敗しても呼び出し元の処理は止めない（best-effort）。
 */
export async function logSpacareerAiUsage(input: AiUsageLogInput): Promise<void> {
  try {
    const row = {
      org_id: getOrgId(),
      customer_id: input.customerId ?? null,
      feature: input.feature,
      model: input.model ?? 'claude-haiku-4-5-20251001',
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_usd: input.costUsd ?? null,
      status: input.status ?? 'success',
      error_message: input.errorMessage ?? null,
    };
    const { error } = await supabase.from('spacareer_ai_usage_logs').insert(row);
    if (error) console.warn('[spacareer/ai/usageLog] insert failed:', error.message);
  } catch (e) {
    console.warn('[spacareer/ai/usageLog] unexpected:', e);
  }
}
