-- invite-member Edge Function が「既存 auth.users にメールで衝突するか」を判定するための
-- security definer RPC。auth スキーマは PostgREST に直接公開されていないため、最小権限の
-- 関数として service_role のみが呼べる形で提供する。

CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- service_role 以外からは呼べないように
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text) TO service_role;
