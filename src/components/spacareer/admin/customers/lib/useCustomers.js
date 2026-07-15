// ============================================================
// スパキャリ顧客データ取得 hook
// 仕様書: tasks/spacareer-spec.md §2 / §4 / §7.1
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { useAuth } from '../../../../../hooks/useAuth';

/** 顧客一覧（左カラム＋要対応判定用） */
export function useCustomersList() {
  const { orgId } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      // 担当トレーナーによるスコープは RLS(spacareer_customers_select) が member_id ベースで
      // 正しく担保する（admin=全件 / 非admin=assigned_trainer_id が自分のもの）。
      // 以前はここで assigned_trainer_id == profile.id(=auth user_id) で絞っていたが、
      // assigned_trainer_id は members.id のため user_id との不一致で常に0件化する潜在バグだった。
      // クライアント側の絞り込みは撤去し、スコープは RLS に委ねる。
      const q = supabase
        .from('spacareer_customers')
        .select(`
          id, member_id, nickname, profile_image_url, status,
          current_session_no, progress_percent, course,
          archived_at,
          assigned_trainer_id, assigned_at,
          contract_started_at, occupation, birthdate,
          social_style_type, social_style_completed_at,
          created_at,
          member:members!spacareer_customers_member_id_fkey ( id, name, email )
        `)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      const { data: customers, error: cErr } = await q;
      if (cErr) throw cErr;

      const customerIds = (customers || []).map((c) => c.id);
      if (!customerIds.length) { setRows([]); setLoading(false); return; }

      const [sessionsRes, homeworkRes, trainerRes] = await Promise.all([
        supabase.from('spacareer_sessions')
          .select('id, customer_id, session_no, part, scheduled_at, started_at, completed_at, status')
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
        sessions: (sessByCustomer.get(c.id) || []).sort(
          (a, b) => (a.session_no - b.session_no) || ((a.part || 1) - (b.part || 1))),
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
  }, [orgId]);

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
        khSession, khAi, khResponses, khQuestions, monetizationDiag,
        sessionFeedbacks, feedbackTemplate, homeworkSubmissions,
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
        // uploaded_at 降順（最新が先頭）で取得する。各タブは session_id で該当動画を
        // find/先頭採用するため、再アップロード（同一セッションに複数動画）がある場合でも
        // 常に「最新の動画」が再生・議事録対象になる（古い動画が出る不具合を防ぐ）。
        supabase.from('spacareer_session_videos')
          .select('*, session:spacareer_sessions ( session_no )').eq('org_id', orgId)
          .order('uploaded_at', { ascending: false }),
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
        supabase.from('spacareer_monetization_diagnosis_responses')
          .select('*').eq('customer_id', customerId).maybeSingle(),
        // §6.3 セッション感想（受講生回答）。管理画面「セッション感想」タブで一覧表示する。
        supabase.from('spacareer_session_feedbacks')
          .select('id, session_id, satisfaction_score, free_comment, responses, due_at, submitted_at, created_at, spacareer_sessions ( session_no, completed_at )')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: true }),
        // 設問ID→ラベルの対応付け用（responses は設問IDキーで保存されているため）
        supabase.from('spacareer_templates')
          .select('content')
          .eq('org_id', orgId)
          .eq('template_type', 'session_feedback')
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // 事後課題の提出スナップショット（提出回数ごとの達成率履歴）
        supabase.from('spacareer_homework_submissions')
          .select('*').eq('customer_id', customerId)
          .order('session_no', { ascending: true })
          .order('submitted_at', { ascending: true }),
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
        monetizationDiagnosis: monetizationDiag.data || null,
        sessionFeedbacks: sessionFeedbacks.data || [],
        feedbackTemplate: feedbackTemplate.data?.content || null,
        homeworkSubmissions: homeworkSubmissions.data || [],
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
      // スパキャリ(spartia_career)のページ権限を付与されたメンバーは担当トレーナー候補に含める。
      // 「スパナビでスパキャリのトレーナー権限を付与した人＝アサイン候補」という運用に合わせる。
      // rank が null でも（例: 鷲尾さん）権限行があればここで候補化される。
      const { data: perms } = await supabase
        .from('member_page_permissions')
        .select('member_id')
        .eq('org_id', orgId)
        .eq('engagement_slug', 'spartia_career');
      const permIds = [...new Set((perms || []).map((p) => p.member_id).filter(Boolean))];

      // 条件: rank が trainer 系 OR 許可リストのメール OR spartia_career 権限保有
      const allowedEmailsCsv = SPACAREER_TRAINER_ALLOWED_EMAILS.map(e => `"${e}"`).join(',');
      const orClauses = [
        'rank.in.(admin,trainer,manager)',
        `email.in.(${allowedEmailsCsv})`,
      ];
      if (permIds.length) orClauses.push(`id.in.(${permIds.join(',')})`);

      const { data } = await supabase
        .from('members')
        .select('id, name, email, rank')
        .eq('org_id', orgId)
        .or(orClauses.join(','))
        .order('name');
      setTrainers(data || []);
    })();
  }, [orgId]);
  return trainers;
}
