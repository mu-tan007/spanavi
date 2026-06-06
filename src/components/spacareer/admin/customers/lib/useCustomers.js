// ============================================================
// スパキャリ顧客データ取得 hook
// 仕様書: tasks/spacareer-spec.md §2 / §4 / §7.1
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { useAuth } from '../../../../../hooks/useAuth';

/** 顧客一覧（左カラム＋要対応判定用） */
export function useCustomersList() {
  const { orgId, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isTrainer = profile?.role === 'trainer';
  const trainerMemberId = profile?.id;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('spacareer_customers')
        .select(`
          id, member_id, nickname, profile_image_url, status,
          current_session_no, progress_percent,
          assigned_trainer_id, assigned_at,
          contract_started_at, occupation, birthdate,
          social_style_type, social_style_completed_at,
          created_at,
          member:members!spacareer_customers_member_id_fkey ( id, name, email )
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (isTrainer && trainerMemberId) {
        q = q.eq('assigned_trainer_id', trainerMemberId);
      }
      const { data: customers, error: cErr } = await q;
      if (cErr) throw cErr;

      const customerIds = (customers || []).map((c) => c.id);
      if (!customerIds.length) { setRows([]); setLoading(false); return; }

      const [sessionsRes, homeworkRes, trainerRes] = await Promise.all([
        supabase.from('spacareer_sessions')
          .select('id, customer_id, session_no, scheduled_at, started_at, completed_at, status')
          .in('customer_id', customerIds),
        supabase.from('spacareer_homework')
          .select('id, customer_id, session_no, status, due_at, notified_at, submitted_at')
          .in('customer_id', customerIds),
        (() => {
          const trainerIds = [...new Set((customers || []).map((c) => c.assigned_trainer_id).filter(Boolean))];
          if (!trainerIds.length) return Promise.resolve({ data: [] });
          return supabase.from('members').select('id, name, email').in('id', trainerIds);
        })(),
      ]);
      if (sessionsRes.error) throw sessionsRes.error;
      if (homeworkRes.error) throw homeworkRes.error;
      if (trainerRes.error) throw trainerRes.error;

      const sessByCustomer = new Map();
      (sessionsRes.data || []).forEach((s) => {
        if (!sessByCustomer.has(s.customer_id)) sessByCustomer.set(s.customer_id, []);
        sessByCustomer.get(s.customer_id).push(s);
      });
      const hwByCustomer = new Map();
      (homeworkRes.data || []).forEach((h) => {
        if (!hwByCustomer.has(h.customer_id)) hwByCustomer.set(h.customer_id, []);
        hwByCustomer.get(h.customer_id).push(h);
      });
      const trainerById = new Map();
      (trainerRes.data || []).forEach((t) => trainerById.set(t.id, t));

      const enriched = (customers || []).map((c) => ({
        ...c,
        sessions: (sessByCustomer.get(c.id) || []).sort((a, b) => a.session_no - b.session_no),
        homework: (hwByCustomer.get(c.id) || []).sort((a, b) => a.session_no - b.session_no),
        trainer: c.assigned_trainer_id ? trainerById.get(c.assigned_trainer_id) || null : null,
      }));
      setRows(enriched);
    } catch (e) {
      console.error('[useCustomersList] error:', e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [orgId, isTrainer, trainerMemberId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rows, loading, error, refresh };
}

/** 個人ページの詳細取得 */
export function useCustomerDetail(customerId) {
  const { orgId } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!customerId || !orgId) { setDetail(null); return; }
    setLoading(true);
    try {
      const [
        customer, sessions, homework, kickoff, strength, sstyle, videos, slack,
        khSession, khAi, khResponses, khQuestions,
      ] = await Promise.all([
        supabase.from('spacareer_customers')
          .select(`*, member:members!spacareer_customers_member_id_fkey ( id, name, email, user_id )`)
          .eq('id', customerId).single(),
        supabase.from('spacareer_sessions')
          .select('*').eq('customer_id', customerId).order('session_no'),
        supabase.from('spacareer_homework')
          .select('*').eq('customer_id', customerId).order('session_no'),
        supabase.from('spacareer_kickoff_checks')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        supabase.from('spacareer_strength_responses')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        supabase.from('spacareer_social_style_responses')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        supabase.from('spacareer_session_videos')
          .select('*, session:spacareer_sessions ( session_no )').eq('org_id', orgId),
        supabase.from('spacareer_slack_channels')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        // 第1回前70問キックオフヒアリング（§6.2A）
        supabase.from('spacareer_kickoff_hearing_sessions')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        supabase.from('spacareer_kickoff_hearing_ai_extractions')
          .select('*').eq('customer_id', customerId).eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase.from('spacareer_kickoff_hearing_responses')
          .select('question_id, answer_text, is_draft, answered_at')
          .eq('customer_id', customerId),
        supabase.from('spacareer_kickoff_hearing_questions')
          .select('*').eq('is_active', true).order('display_order'),
      ]);

      const sessIds = new Set((sessions.data || []).map((s) => s.id));
      const videoRows = (videos.data || []).filter((v) => sessIds.has(v.session_id));

      let trainer = null;
      if (customer.data?.assigned_trainer_id) {
        const { data: t } = await supabase.from('members')
          .select('id, name, email').eq('id', customer.data.assigned_trainer_id).maybeSingle();
        trainer = t || null;
      }

      setDetail({
        customer: customer.data,
        sessions: sessions.data || [],
        homework: homework.data || [],
        kickoff: kickoff.data || null,
        strength: strength.data || null,
        socialStyle: sstyle.data || null,
        videos: videoRows,
        slack: slack.data || null,
        trainer,
        kickoffHearingSession: khSession.data || null,
        kickoffHearingAi: khAi.data || [],
        kickoffHearingResponses: khResponses.data || [],
        kickoffHearingQuestions: khQuestions.data || [],
      });
    } catch (e) {
      console.error('[useCustomerDetail] error:', e);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, orgId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { detail, loading, refresh };
}

// スパキャリの担当トレーナー候補に明示追加するメールアドレス。
// 既存の rank フィルタ ('admin','trainer','manager') 以外で、スパキャリ運営に関わる人を追加する。
// 将来運営追加時はこの配列に1行追加すれば候補に出る。
const SPACAREER_TRAINER_ALLOWED_EMAILS = [
  'shinomiya@ma-sp.co', // 篠宮（全体管理者）
  'koyama@ma-sp.co',    // 小山（スパキャリ事業責任者）
];

/** トレーナー一覧 */
export function useTrainers() {
  const { orgId } = useAuth();
  const [trainers, setTrainers] = useState([]);
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      // rank が trainer 系の人 OR 許可リストのメンバー
      const allowedEmailsCsv = SPACAREER_TRAINER_ALLOWED_EMAILS.map(e => `"${e}"`).join(',');
      const { data } = await supabase
        .from('members')
        .select('id, name, email, rank')
        .eq('org_id', orgId)
        .or(`rank.in.(admin,trainer,manager),email.in.(${allowedEmailsCsv})`)
        .order('name');
      setTrainers(data || []);
    })();
  }, [orgId]);
  return trainers;
}
