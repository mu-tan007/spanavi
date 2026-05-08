-- =====================================================================
-- sourcing_list_approach_detail に recording_url を追加
--   クライアントポータルの ListApproachPage で各架電の録音をインライン再生するため
--
-- セキュリティ:
--   - 既存の is_client_user() / current_client_id() / list_id ガードは維持
--   - recording_url を追加で返すだけ（権限チェックロジックは変更なし）
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sourcing_list_approach_detail(p_list_id uuid, p_org_id uuid)
RETURNS TABLE(item_id uuid, no integer, company text, phone text, calls jsonb)
LANGUAGE plpgsql
STABLE
AS $function$
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
            'recording_url', cr.recording_url
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
$function$;
