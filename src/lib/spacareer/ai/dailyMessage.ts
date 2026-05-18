// ============================================================
// §8.6 今日のひとこと
// ----------------------------------------------------------------
// 日次バッチで生成、マイページ右下に表示。
// バッチ実装は pg_cron + Edge Function を想定（Phase 2）。
// 当面はクライアント呼び出し時に最新を取得する形でも代替可能。
// ============================================================
import { supabase } from '../../supabase';
import {
  generateDailyMessage as mockGenerate,
  type DailyMessageInput,
  type DailyMessageResult,
} from './mock';
import { logSpacareerAiUsage, estimateClaudeHaikuCost } from './usageLog';

export type { DailyMessageInput, DailyMessageResult } from './mock';

/**
 * 受講生向け「今日のひとこと」を生成。
 * Edge Function `generate-spacareer-daily-message` 経由で Claude Haiku 4.5 呼び出し。
 * Edge Function 未配備時は mock にフォールバック。
 */
export async function generateDailyMessage(
  input: DailyMessageInput,
): Promise<DailyMessageResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-spacareer-daily-message', {
      body: input,
    });
    if (error || !data?.message) {
      throw new Error((error as { message?: string } | null)?.message || 'edge function unavailable');
    }
    await logSpacareerAiUsage({
      feature: 'daily_message',
      customerId: input.customerId,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      costUsd: estimateClaudeHaikuCost(data.usage?.input_tokens, data.usage?.output_tokens),
    });
    return {
      message: String(data.message),
      generatedAt: data.generatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[spacareer/ai/dailyMessage] falling back to mock:', e);
    return mockGenerate(input);
  }
}
