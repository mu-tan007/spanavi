set local search_path = public, extensions;

-- 第1回前70問キックオフヒアリング: 受講生本人による自分のセッションUPDATEを許可。
--
-- 背景:
--   既存 kh_sessions_update は (admin OR trainer) のみ UPDATE 可で、
--   受講生本人による status='submitted' / submitted_at セットが RLS で
--   サイレント拒否されていた（responses は upsert できるので status だけ
--   サーバ側 analyze-kickoff-hearing で 'ai_extracted' まで進むが、
--   submitted_at は null のまま）。
--
-- 修正:
--   追加で kh_sessions_update_self を新設し、自分の customer_id のセッションを
--   UPDATE できるようにする。ただし WITH CHECK で status を ('in_progress',
--   'submitted') に限定し、受講生が勝手に 'completed' / 'ai_extracted' に
--   進められないようガード。後続の状態遷移は service_role の Edge Function
--   (analyze-kickoff-hearing 等) でのみ行う。
create policy kh_sessions_update_self
  on spacareer_kickoff_hearing_sessions
  for update to authenticated
  using (
    org_id = get_user_org_id()
    and customer_id = spacareer_current_customer_id()
  )
  with check (
    org_id = get_user_org_id()
    and customer_id = spacareer_current_customer_id()
    and status in ('in_progress', 'submitted')
  );
