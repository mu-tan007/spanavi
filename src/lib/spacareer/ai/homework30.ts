// ============================================================
// §8.2 AI事後課題30項目自動生成
// ----------------------------------------------------------------
// セッション完了押下時に Claude Haiku 4.5 へ依頼し、次回事後課題
// 30項目のドラフトを生成する。トレーナーが手動修正後に確定。
// AIプロンプトは spacareer_templates.template_type='ai_prompt' から
// 取得する想定（運営のみ編集可）。
// ============================================================
import { supabase } from '../../supabase';
import { generateHomework30Items as mockGenerate, type HomeworkItem, type HomeworkItemsInput } from './mock';
import { logSpacareerAiUsage, estimateClaudeHaikuCost } from './usageLog';

export type { HomeworkItem, HomeworkItemsInput } from './mock';

/**
 * 30項目を生成し、必要なら spacareer_homework_items にドラフトとして保存する。
 * 本実装：Edge Function 経由で Claude Haiku 4.5 を呼び出す。
 *
 * NOTE: Edge Function 側の実装は将来追加。現状はサーバ実装が整うまで
 * mock 版へフォールバックし、画面側は同シグネチャで動作する。
 */
export async function generateHomework30Items(
  input: HomeworkItemsInput,
): Promise<HomeworkItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-spacareer-homework30', {
      body: input,
    });
    if (error || !data?.items) {
      throw new Error((error as { message?: string } | null)?.message || 'edge function unavailable');
    }
    await logSpacareerAiUsage({
      feature: 'homework_30items',
      customerId: input.customerId,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      costUsd: estimateClaudeHaikuCost(data.usage?.input_tokens, data.usage?.output_tokens),
    });
    return data.items as HomeworkItem[];
  } catch (e) {
    // Edge Function 未配備時は mock にフォールバック（画面側は機能継続）
    console.warn('[spacareer/ai/homework30] falling back to mock:', e);
    return mockGenerate(input);
  }
}

/**
 * 生成された30項目を spacareer_homework_items に upsert する。
 * homework_id が既存ならドラフトとして上書き、無ければ insert。
 */
export async function saveHomework30Draft(
  homeworkId: string,
  orgId: string,
  items: HomeworkItem[],
): Promise<{ error: unknown }> {
  // 既存項目を削除 → 新版を投入（position 順）
  const { error: delErr } = await supabase
    .from('spacareer_homework_items')
    .delete()
    .eq('homework_id', homeworkId);
  if (delErr) {
    console.error('[DB] saveHomework30Draft delete error:', delErr);
    return { error: delErr };
  }
  const rows = items.map((it) => ({
    org_id: orgId,
    homework_id: homeworkId,
    position: it.position,
    question_text: it.question_text,
    question_hint: it.question_hint ?? null,
    is_required: it.is_required,
    max_length: it.max_length ?? null,
  }));
  const { error: insErr } = await supabase
    .from('spacareer_homework_items')
    .insert(rows);
  if (insErr) console.error('[DB] saveHomework30Draft insert error:', insErr);
  return { error: insErr };
}
