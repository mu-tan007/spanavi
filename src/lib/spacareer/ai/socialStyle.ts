// ============================================================
// §8.3 ソーシャルスタイル診断（30問判定）
// ----------------------------------------------------------------
// 30問の回答から4タイプ判定（論理分析型／行動推進型／感情表現型／協調共感型）
// 判定はクライアント側で完結する純粋計算（AI呼び出しなし）。
// 質問項目および各タイプ説明は mock.ts の素案を初期値とし、
// 運営が spacareer_templates.template_type='social_style_questions'
// および 'social_style_descriptions' で上書き可能。
// ============================================================
import { supabase } from '../../supabase';
import {
  SOCIAL_STYLE_QUESTIONS,
  SOCIAL_STYLE_LABELS,
  evaluateSocialStyle as mockEvaluate,
  type SocialStyleAnswer,
  type SocialStyleQuestion,
  type SocialStyleResult,
  type SocialStyleScores,
  type SocialStyleType,
} from './mock';
import { logSpacareerAiUsage } from './usageLog';

export {
  SOCIAL_STYLE_QUESTIONS,
  SOCIAL_STYLE_LABELS,
  type SocialStyleAnswer,
  type SocialStyleQuestion,
  type SocialStyleResult,
  type SocialStyleScores,
  type SocialStyleType,
};

/**
 * 30問の回答からタイプ判定。AI呼び出しなし、純粋計算。
 * 計算ロジックは mock.ts の evaluateSocialStyle と同一。
 */
export async function evaluateSocialStyle(
  answers: SocialStyleAnswer[],
): Promise<SocialStyleResult> {
  return mockEvaluate(answers);
}

/**
 * spacareer_social_style_responses に結果を保存。
 * 回答完了時に invite_token から customer_id を解決して書き込む。
 */
export async function saveSocialStyleResult(
  responseId: string,
  result: SocialStyleResult,
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('spacareer_social_style_responses')
    .update({
      result_type: result.result_type,
      result_scores: result.result_scores,
      completed_at: new Date().toISOString(),
    })
    .eq('id', responseId);
  if (error) console.error('[DB] saveSocialStyleResult error:', error);

  // 利用ログ（純粋計算でもコストカウント目的で記録）
  await logSpacareerAiUsage({
    feature: 'social_style',
    customerId: null,
    model: 'rule-based',
    status: error ? 'error' : 'success',
    errorMessage: error ? String((error as { message?: string }).message ?? error) : undefined,
  });
  return { error };
}

/**
 * 進行中の回答を保存（中断・再開対応）。
 */
export async function saveSocialStyleProgress(
  responseId: string,
  currentQuestionNo: number,
  answers: SocialStyleAnswer[],
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('spacareer_social_style_responses')
    .update({
      current_question_no: currentQuestionNo,
      answers,
    })
    .eq('id', responseId);
  if (error) console.error('[DB] saveSocialStyleProgress error:', error);
  return { error };
}

/**
 * 運営が編集した質問項目があれば優先、無ければ素案を返す。
 */
export async function loadSocialStyleQuestions(orgId: string): Promise<SocialStyleQuestion[]> {
  const { data, error } = await supabase
    .from('spacareer_templates')
    .select('content')
    .eq('org_id', orgId)
    .eq('template_type', 'social_style_questions')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.content) return SOCIAL_STYLE_QUESTIONS;
  const fromTpl = (data.content as { questions?: SocialStyleQuestion[] }).questions;
  if (Array.isArray(fromTpl) && fromTpl.length === 30) return fromTpl;
  return SOCIAL_STYLE_QUESTIONS;
}
