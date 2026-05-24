import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// コメント本文から「- [ ] アクション」「- [x] アクション」記法を抽出（順序保持）
export function extractActionItemTexts(text) {
  if (!text) return [];
  const lines = String(text).split('\n');
  const items = [];
  lines.forEach(line => {
    const m = line.match(/^\s*-\s*\[\s*([xX ])\s*\]\s*(.+?)\s*$/);
    if (m) items.push(m[2].trim());
  });
  return items;
}

// コメント本文を「テキストブロック」「チェックボックス行」の配列に分解
export function parseCommentBlocks(text) {
  if (!text) return [];
  const lines = String(text).split('\n');
  const blocks = [];
  let buffer = [];
  let checkboxIdx = 0;
  const flush = () => {
    if (buffer.length > 0) {
      blocks.push({ type: 'text', content: buffer.join('\n') });
      buffer = [];
    }
  };
  lines.forEach(line => {
    const m = line.match(/^\s*-\s*\[\s*([xX ])\s*\]\s*(.+?)\s*$/);
    if (m) {
      flush();
      blocks.push({ type: 'checkbox', text: m[2].trim(), index: checkboxIdx++ });
    } else {
      buffer.push(line);
    }
  });
  flush();
  return blocks;
}

// 対象メンバーの週次コーチングコメント一覧 + 再発テーマ + action_items を管理するフック
export function useCoachingComments(targetMemberId) {
  const [comments, setComments] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!targetMemberId) {
      setComments([]); setRecurring([]); return;
    }
    setLoading(true); setError(null);
    try {
      const [cRes, rRes] = await Promise.all([
        supabase
          .from('coaching_comments')
          .select(`
            id, period_start, period_end, comment_text, themes, author_id, created_at, updated_at,
            action_items:coaching_action_items(id, text, done, done_at, created_at)
          `)
          .eq('target_member_id', targetMemberId)
          .order('period_start', { ascending: false })
          .limit(52),
        supabase.rpc('get_recurring_themes', { p_target_member_id: targetMemberId, p_weeks: 3 }),
      ]);
      if (cRes.error) throw cRes.error;
      if (rRes.error) throw rRes.error;
      // action_items を created_at 昇順でソート（保存順を保持）
      const normalized = (cRes.data || []).map(c => ({
        ...c,
        action_items: (c.action_items || []).slice().sort((a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
        ),
      }));
      setComments(normalized);
      setRecurring(rRes.data || []);
    } catch (e) {
      console.error('[useCoachingComments] refresh error', e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [targetMemberId]);

  useEffect(() => { refresh(); }, [refresh]);

  // コメント本文の `- [ ] xxx` を抽出して action_items テーブルと同期。
  // 既存の done 状態は text 一致で引き継ぐ。
  const syncActionItems = useCallback(async (commentId, commentText) => {
    const parsed = extractActionItemTexts(commentText);
    // 1. 現在の done 状態を取得
    const { data: existing } = await supabase
      .from('coaching_action_items')
      .select('text, done')
      .eq('coaching_comment_id', commentId);
    const doneTexts = new Set((existing || []).filter(e => e.done).map(e => e.text));
    // 2. 全削除→再挿入（順序を created_at で保持するため小刻みに insert）
    await supabase.from('coaching_action_items').delete().eq('coaching_comment_id', commentId);
    if (parsed.length > 0) {
      // created_at の順序を確実に保つため、1件ずつ insert
      for (const t of parsed) {
        await supabase.from('coaching_action_items').insert({
          coaching_comment_id: commentId,
          text: t,
          done: doneTexts.has(t),
          done_at: doneTexts.has(t) ? new Date().toISOString() : null,
        });
      }
    }
  }, []);

  const upsertComment = useCallback(async ({ periodStart, periodEnd, commentText, themes, orgId, authorId }) => {
    if (!targetMemberId) throw new Error('targetMemberId is required');
    if (!orgId) throw new Error('orgId is required');
    if (!authorId) throw new Error('authorId is required');
    const { data: row, error: upErr } = await supabase
      .from('coaching_comments')
      .upsert({
        target_member_id: targetMemberId,
        period_start: periodStart,
        period_end: periodEnd,
        comment_text: commentText,
        themes: themes || [],
        org_id: orgId,
        author_id: authorId,
      }, { onConflict: 'target_member_id,period_start' })
      .select('id')
      .single();
    if (upErr) throw upErr;
    if (row?.id) {
      await syncActionItems(row.id, commentText);
    }
    await refresh();
  }, [targetMemberId, refresh, syncActionItems]);

  // メンバー本人がチェックを切り替え
  const toggleActionItem = useCallback(async (itemId, done) => {
    const { error: upErr } = await supabase
      .from('coaching_action_items')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', itemId);
    if (upErr) throw upErr;
    await refresh();
  }, [refresh]);

  return { comments, recurring, loading, error, refresh, upsertComment, toggleActionItem };
}
