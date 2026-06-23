-- スパキャリ 固定自動公開cronの対象を第8回まで拡張（むー様 2026-06-23）。
-- 第2〜8回それぞれのセッション管理タブで変動課題を作成できるようにするため、
-- 固定事後課題の自動公開対象を 1〜7 から 1〜8 に広げる。
-- （第8回は固定マスター未登録なら固定0件＋変動のみ。due_atは次回が無いため7日後フォールバック。）
set local search_path = public, extensions;

create or replace function public.fn_spacareer_publish_due_fixed()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_homework_id uuid;
  v_due timestamptz;
  v_next_sched timestamptz;
  v_tpl jsonb;
  v_item jsonb;
  v_pos int;
begin
  insert into public.spacareer_session_feedbacks (org_id, customer_id, session_id, notified_at, due_at)
  select s.org_id, s.customer_id, s.id, now(), now() + interval '72 hours'
  from public.spacareer_sessions s
  where s.session_no between 1 and 8
    and s.scheduled_at is not null
    and s.scheduled_at <= now()
    and not exists (
      select 1 from public.spacareer_session_feedbacks f where f.session_id = s.id
    );

  for r in
    select s.id as session_id, s.org_id, s.customer_id, s.session_no
    from public.spacareer_sessions s
    where s.session_no between 1 and 8
      and s.scheduled_at is not null
      and s.scheduled_at <= now()
      and not exists (
        select 1 from public.spacareer_homework h
        where h.customer_id = s.customer_id
          and h.session_no = s.session_no
          and h.fixed_published_at is not null
      )
  loop
    select scheduled_at into v_next_sched
    from public.spacareer_sessions
    where customer_id = r.customer_id and session_no = r.session_no + 1;
    if v_next_sched is not null and v_next_sched > now() then
      v_due := v_next_sched - interval '72 hours';
    else
      v_due := now() + interval '7 days';
    end if;

    insert into public.spacareer_homework
      (org_id, customer_id, session_id, session_no, status, notified_at, fixed_published_at, due_at)
    values
      (r.org_id, r.customer_id, r.session_id, r.session_no, 'unsubmitted', now(), now(), v_due)
    on conflict (customer_id, session_no) do update set
      notified_at = coalesce(public.spacareer_homework.notified_at, now()),
      fixed_published_at = now(),
      status = case when public.spacareer_homework.status in ('partial','submitted','completed')
                    then public.spacareer_homework.status else 'unsubmitted' end,
      due_at = coalesce(public.spacareer_homework.due_at, excluded.due_at),
      updated_at = now()
    returning id into v_homework_id;

    if not exists (
      select 1 from public.spacareer_homework_items
      where homework_id = v_homework_id and source = 'fixed'
    ) then
      v_pos := coalesce((select max(position) from public.spacareer_homework_items where homework_id = v_homework_id), 0);

      if r.session_no = 1 then
        select content into v_tpl
        from public.spacareer_templates
        where org_id = r.org_id and template_type = 'homework_1' and is_active = true
        order by version desc limit 1;

        if v_tpl is not null and jsonb_typeof(v_tpl->'items') = 'array' then
          for v_item in select * from jsonb_array_elements(v_tpl->'items')
          loop
            v_pos := v_pos + 1;
            insert into public.spacareer_homework_items
              (org_id, homework_id, position, section, question_text, question_hint,
               is_required, max_length, item_type, template_url, template_name, source, is_published)
            values
              (r.org_id, v_homework_id, v_pos,
               nullif(v_item->>'section',''), coalesce(v_item->>'question_text',''),
               nullif(v_item->>'question_hint',''),
               coalesce((v_item->>'is_required')::boolean, false),
               nullif(v_item->>'max_length','')::int,
               coalesce(nullif(v_item->>'item_type',''), 'text'),
               nullif(v_item->>'template_url',''), nullif(v_item->>'template_name',''),
               'fixed', true);
          end loop;
        end if;
      else
        insert into public.spacareer_homework_items
          (org_id, homework_id, position, section, question_text, question_hint,
           is_required, max_length, item_type, template_url, template_name, source, is_published)
        select r.org_id, v_homework_id,
               v_pos + row_number() over (order by fi.position),
               fi.section, fi.question_text, fi.question_hint,
               fi.is_required, null, coalesce(fi.item_type, 'text'),
               fi.template_url, fi.template_name, 'fixed', true
        from public.spacareer_homework_fixed_items fi
        where fi.org_id = r.org_id and fi.session_no = r.session_no and fi.is_active = true;
      end if;
    end if;
  end loop;
end;
$$;
