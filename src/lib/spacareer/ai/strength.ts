// ============================================================
// §8.4 強み診断
// ----------------------------------------------------------------
// Gallup CliftonStrengths の4ドメインに基づく20問判定。
// 第2回事後課題のタイミングで1項目として実施される。
// 判定はクライアント側で完結する純粋計算（AI呼び出しなし）。
// values_text のみ Claude Haiku 4.5 で要約・整形する余地あり。
// ============================================================
import { supabase } from '../../supabase';
import {
  STRENGTH_QUESTIONS,
  diagnoseStrengths as mockDiagnose,
  type StrengthAnswer,
  type StrengthDiagnosisInput,
  type StrengthDiagnosisResult,
  type StrengthQuestion,
} from './mock';
import { logSpacareerAiUsage } from './usageLog';

export {
  STRENGTH_QUESTIONS,
  type StrengthAnswer,
  type StrengthDiagnosisInput,
  type StrengthDiagnosisResult,
  type StrengthQuestion,
};

/**
 * 強み診断の判定。
 * scores はカテゴリ平均（0〜100）、topStrengths は上位3。
 */
export async function diagnoseStrengths(
  input: StrengthDiagnosisInput,
): Promise<StrengthDiagnosisResult> {
  return mockDiagnose(input);
}

/**
 * spacareer_strength_responses に結果を upsert。
 */
export async function saveStrengthResult(
  customerId: string,
  orgId: string,
  result: StrengthDiagnosisResult,
  answers: StrengthAnswer[],
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('spacareer_strength_responses')
    .upsert(
      {
        org_id: orgId,
        customer_id: customerId,
        answers,
        strengths: result.topStrengths,
        values_text: result.values_text,
        scores: result.scores,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'customer_id' },
    );
  if (error) console.error('[DB] saveStrengthResult error:', error);

  await logSpacareerAiUsage({
    feature: 'strength_diagnosis',
    customerId,
    model: 'rule-based',
    status: error ? 'error' : 'success',
    errorMessage: error ? String((error as { message?: string }).message ?? error) : undefined,
  });
  return { error };
}
