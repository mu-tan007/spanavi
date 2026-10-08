-- 業種が決まらなかった会社を AI で判定する（2026-10-09 むー様）。迷ったものは理由を残し、むー様に相談する
alter table public.call_list_items add column if not exists industry_ai_note text;
insert into public.internal_cron_tokens (name) values ('classify-industry') on conflict do nothing;

-- まだ業種が無く、AIにもまだ聞いていない会社（弊社の組織だけ）
create or replace function public.industry_ai_todo(p_limit int)
returns table (id uuid, company text, business text, list_ind text)
language sql stable security definer set search_path to 'public' as $$
  select i.id, i.company, i.business, l.industry
    from call_list_items i join call_lists l on l.id = i.list_id
   where i.org_id = 'a0000000-0000-0000-0000-000000000001'
     and i.industry_group is null and coalesce(i.industry_source, '') not in ('ai', 'ai_unsure')
   limit p_limit
$$;
create or replace function public.industry_ai_todo_count()
returns bigint language sql stable security definer set search_path to 'public' as $$
  select count(*) from call_list_items i
   where i.org_id = 'a0000000-0000-0000-0000-000000000001'
     and i.industry_group is null and coalesce(i.industry_source, '') not in ('ai', 'ai_unsure')
$$;
revoke all on function public.industry_ai_todo(int) from public, anon, authenticated;
revoke all on function public.industry_ai_todo_count() from public, anon, authenticated;
