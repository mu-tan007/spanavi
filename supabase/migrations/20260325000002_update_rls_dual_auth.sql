-- ============================================================
-- get_user_org_id() を実メールアドレスにも対応させる
-- パターン1: masp-internal形式 (既存)
-- パターン2: 実メールアドレスでmembers.emailを検索 (新規)
-- ============================================================

create or replace function public.get_user_org_id()
returns uuid
language sql
stable
security definer
as $$
  select coalesce(
    -- パターン1: user_{memberId}@masp-internal.com → member_idでlookup
    (select org_id from public.members
     where id = (
       select substring(email from 'user_(.+)@masp-internal\.com')::uuid
       from auth.users where id = auth.uid()
     )
     limit 1),
    -- パターン2: 実メールアドレス → members.emailでlookup
    (select org_id from public.members
     where email = (select email from auth.users where id = auth.uid())
     limit 1)
  );
$$;
