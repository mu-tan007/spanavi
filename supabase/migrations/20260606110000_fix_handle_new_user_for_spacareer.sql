-- ============================================================
-- handle_new_user() トリガ関数の修正
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-social-style-onboarding.md
--
-- 修正内容:
--   1. SET search_path = public, auth, pg_catalog を明示
--      auth.users への INSERT トリガとして発火した時に search_path に public が
--      含まれず、関数内の INSERT INTO members (...) が
--      「relation "members" does not exist」で失敗していたのを修正。
--      これにより auth.admin.createUser が「Database error creating new user」
--      で 500 を返していた事象を解消。
--
--   2. role='student' を skip 対象に追加
--      スパキャリ受講生は spacareer-invite-customer Edge Function 側で
--      members(rank='student') を明示的に作るが、その前段の auth.admin.createUser で
--      handle_new_user が勝手に rank='トレーニー' の members 行を作ってしまうと、
--      Edge Function 側の「rank='student'以外は社内メンバー扱いで409」分岐に
--      引っかかってしまっていた。これを skip して Edge Function 側に委譲する。
--
--   3. 念のため INSERT INTO members を INSERT INTO public.members に明示化
-- ============================================================

set local search_path = public, auth, pg_catalog;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $function$
DECLARE
  _meta jsonb;
  _name text;
  _role text;
BEGIN
  _meta := NEW.raw_user_meta_data;
  _role := _meta->>'role';
  _name := _meta->>'name';

  -- クライアント・ポータル用 / スパキャリ受講生は呼び出し側の Edge Function で
  -- 別途 members を作るため、ここでは作らない
  IF _role IN ('client', 'student') THEN
    RETURN NEW;
  END IF;

  -- 既存メンバーがいれば user_id + email だけ更新して終了
  IF _name IS NOT NULL AND EXISTS (SELECT 1 FROM public.members WHERE name = _name) THEN
    UPDATE public.members
       SET user_id = NEW.id,
           email   = NEW.email
     WHERE name = _name;
    RETURN NEW;
  END IF;

  IF _name IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.members (
    org_id, name, email, user_id,
    university, grade, team, position,
    cumulative_sales, rank, incentive_rate, is_active
  ) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    _name, NEW.email, NEW.id,
    _meta->>'university',
    (_meta->>'grade')::integer,
    _meta->>'team', 'メンバー',
    0, 'トレーニー', 22, true
  );
  RETURN NEW;
END;
$function$;
