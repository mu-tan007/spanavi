-- sourcing_list_approach_detail: calls jsonb に rejection_reason を含める
-- 用途: クライアントポータル「各企業のアプローチ詳細」で キーマン断り の
--       温度感バッジ + AI 要約 を表示するため
set local search_path = public, extensions;

create or replace function public.sourcing_list_approach_detail(p_list_id uuid, p_org_id uuid)
returns table(item_id uuid, no integer, company text, phone text, calls jsonb)
language plpgsql stable as $$
declare
  v_org_id uuid := case when is_client_user() then current_client_org_id() else p_org_id end;
  v_ok boolean;
begin
  if is_client_user() then
    select true into v_ok
      from call_lists
     where id = p_list_id
       and client_id = current_client_id()
       and org_id = v_org_id;
    if not coalesce(v_ok, false) then
      return;
    end if;
  end if;

  return query
  select
    cli.id as item_id,
    cli.no,
    cli.company,
    cli.phone,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'round', cr.round,
            'called_at', cr.called_at,
            'status', cr.status,
            'getter_name', cr.getter_name,
            'recording_url', cr.recording_url,
            'rejection_reason', cr.rejection_reason
          )
          order by cr.round nulls last, cr.called_at
        )
        from call_records cr
        where cr.item_id = cli.id
      ),
      '[]'::jsonb
    ) as calls
  from call_list_items cli
  where cli.list_id = p_list_id
    and cli.org_id = v_org_id
  order by cli.no nulls last;
end;
$$;
