-- 退職者（members.is_active=false）が Spanavi にログインできていた（2026-10-08 浅井さんの報告）。
-- 退職にした時点でログインを止め、今あるセッションも切る。戻したら止めるのを外す。
-- 同じアカウントで在籍中のメンバー行がある・管理者・クライアントのポータルのアカウントは止めない。
-- （本番には apply_migration で適用済み。中身は同じ）
create or replace function public.sync_member_login_ban()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare keep boolean;
begin
  if new.user_id is null or new.is_active is not distinct from old.is_active then return new; end if;
  if new.is_active then
    update auth.users set banned_until = null where id = new.user_id;
    return new;
  end if;
  select exists (select 1 from public.members m where m.user_id = new.user_id and m.is_active and m.id <> new.id)
      or exists (select 1 from public.users u where u.id = new.user_id and u.role = 'admin')
      or exists (select 1 from public.clients c where c.auth_user_id = new.user_id)
    into keep;
  if not keep then
    update auth.users set banned_until = 'infinity' where id = new.user_id;
    delete from auth.sessions where user_id = new.user_id;
    delete from auth.refresh_tokens where user_id::uuid = new.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_sync_member_login_ban on public.members;
create trigger trg_sync_member_login_ban after update of is_active on public.members
  for each row execute function public.sync_member_login_ban();
