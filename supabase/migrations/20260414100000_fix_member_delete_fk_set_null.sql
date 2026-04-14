-- =====================================================
-- メンバー削除失敗の修正
-- handle_member_delete トリガーが auth.users を削除する際、
-- caller_id 等のFK制約 (NO ACTION) が削除を阻止していた。
-- 履歴保持のため SET NULL に変更。
-- =====================================================

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_caller_id_fkey,
  ADD CONSTRAINT appointments_caller_id_fkey
    FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.call_records
  DROP CONSTRAINT IF EXISTS call_records_caller_id_fkey,
  ADD CONSTRAINT call_records_caller_id_fkey
    FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_leader_id_fkey,
  ADD CONSTRAINT teams_leader_id_fkey
    FOREIGN KEY (leader_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.trial_balances
  DROP CONSTRAINT IF EXISTS trial_balances_uploaded_by_fkey,
  ADD CONSTRAINT trial_balances_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
