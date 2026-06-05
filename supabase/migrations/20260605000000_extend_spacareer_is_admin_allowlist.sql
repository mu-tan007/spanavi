-- スパキャリ事業の admin 判定を拡張する。
--
-- 背景:
--   小山（スパキャリ事業責任者）は public.users.role='admin' ではないが、
--   スパキャリ顧客一覧・各種運営画面・代理ログインのために
--   スパキャリ系テーブルでは admin 相当の権限が必要。
--   しかし社内全体の admin に昇格させると、報酬マスター・権限設定など他事業の管理画面まで
--   触れるようになるため、スパキャリ系テーブルの RLS だけに権限を絞り込みたい。
--
-- 対応:
--   spacareer_is_admin() を以下の OR 条件に拡張する。
--   1. public.users.role='admin'（既存・全体admin）
--   2. auth.users.email が SPACAREER_ADMIN_ALLOWLIST に含まれる（スパキャリ運営許可リスト）
--
--   この関数は spacareer_customers / spacareer_sessions / spacareer_homework /
--   spacareer_kickoff_* / spacareer_strength_* / spacareer_social_style_* など
--   spacareer_ プレフィックスのテーブルのみで使われている。
--   営業代行・CRM・給与など他事業の RLS には一切影響しない。
--
-- 将来運営メンバーを追加する場合は、この ARRAY に1行追加した新しい migration を発行すること。

set local search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.spacareer_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND au.email = ANY(ARRAY[
        'koyama@ma-sp.co'  -- 小山（スパキャリ事業責任者）
      ])
  );
$$;
