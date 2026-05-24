import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// 対象メンバーの週次コーチングコメント一覧 + 再発テーマを管理するフック
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
          .select('id, period_start, period_end, comment_text, themes, author_id, created_at, updated_at')
          .eq('target_member_id', targetMemberId)
          .order('period_start', { ascending: false })
          .limit(52),
        supabase.rpc('get_recurring_themes', { p_target_member_id: targetMemberId, p_weeks: 3 }),
      ]);
      if (cRes.error) throw cRes.error;
      if (rRes.error) throw rRes.error;
      setComments(cRes.data || []);
      setRecurring(rRes.data || []);
    } catch (e) {
      console.error('[useCoachingComments] refresh error', e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [targetMemberId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertComment = useCallback(async ({ periodStart, periodEnd, commentText, themes, orgId, authorId }) => {
    if (!targetMemberId) throw new Error('targetMemberId is required');
    if (!orgId) throw new Error('orgId is required');
    if (!authorId) throw new Error('authorId is required');
    const { error: upErr } = await supabase
      .from('coaching_comments')
      .upsert({
        target_member_id: targetMemberId,
        period_start: periodStart,
        period_end: periodEnd,
        comment_text: commentText,
        themes: themes || [],
        org_id: orgId,
        author_id: authorId,
      }, { onConflict: 'target_member_id,period_start' });
    if (upErr) throw upErr;
    await refresh();
  }, [targetMemberId, refresh]);

  return { comments, recurring, loading, error, refresh, upsertComment };
}
