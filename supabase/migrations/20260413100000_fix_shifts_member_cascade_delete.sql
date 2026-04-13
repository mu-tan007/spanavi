-- shifts.member_id の FK制約を ON DELETE CASCADE に変更
-- メンバー削除時にシフトデータも自動削除されるようにする
ALTER TABLE public.shifts
  DROP CONSTRAINT shifts_member_id_fkey,
  ADD CONSTRAINT shifts_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
