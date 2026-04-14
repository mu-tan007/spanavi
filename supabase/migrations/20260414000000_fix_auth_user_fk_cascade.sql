-- メンバー削除時の auth.users 連鎖削除を可能にするためのFK修正
-- handle_member_delete() trigger が auth.users を削除する際、
-- 依存テーブルのFK制約が ON DELETE 未指定だと削除が失敗する

-- roleplay_bookings: ユーザー削除時に予約も削除
ALTER TABLE public.roleplay_bookings
  DROP CONSTRAINT IF EXISTS roleplay_bookings_user_id_fkey,
  ADD CONSTRAINT roleplay_bookings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- members: ユーザー削除時にメンバー行も削除（整合性保証）
ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_user_id_fkey,
  ADD CONSTRAINT members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
