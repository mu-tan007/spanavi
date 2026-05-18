// ============================================================
// §8.5 フレーズ抽出（あなたの原動力）
// ----------------------------------------------------------------
// 第1回事前課題の提出完了時に Claude Haiku 4.5 へ依頼し、
// 「自分に伝えたいフレーズ」を1〜2文で抽出。
// 結果はマイページのヒーローエリアに表示。
//
// 反映先は spacareer_customers にカラムを増やすのではなく、
// spacareer_strength_responses.values_text と同レベルで
// spacareer_homework_items のメタとして保持するか、または
// 別途 spacareer_customers.driving_phrase（要 schema 拡張）に
// 書き込む。現時点では呼び出し結果のみ返し、保存先は呼出元が決める。
// ============================================================
import { supabase } from '../../supabase';
import {
  extractDrivingPhrase as mockExtract,
  type PhraseExtractionInput,
  type PhraseExtractionResult,
} from './mock';
import { logSpacareerAiUsage, estimateClaudeHaikuCost } from './usageLog';

export type { PhraseExtractionInput, PhraseExtractionResult } from './mock';

/**
 * 第1回事前課題から「あなたの原動力」フレーズを抽出する。
 * Edge Function 経由で Claude Haiku 4.5 を呼び出す。
 * Edge Function 未配備時は mock にフォールバック。
 */
export async function extractDrivingPhrase(
  input: PhraseExtractionInput,
): Promise<PhraseExtractionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('extract-spacareer-phrase', {
      body: input,
    });
    if (error || !data?.phrase) {
      throw new Error((error as { message?: string } | null)?.message || 'edge function unavailable');
    }
    await logSpacareerAiUsage({
      feature: 'phrase_extraction',
      customerId: input.customerId,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      costUsd: estimateClaudeHaikuCost(data.usage?.input_tokens, data.usage?.output_tokens),
    });
    return {
      phrase: String(data.phrase),
      generatedAt: data.generatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[spacareer/ai/phraseExtraction] falling back to mock:', e);
    return mockExtract(input);
  }
}
