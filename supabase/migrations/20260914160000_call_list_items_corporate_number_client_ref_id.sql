-- 案件「各企業のアプローチ詳細」に法人番号・ID列を出すための土台
-- 背景: レバレジーズM&Aアドバイザリー様の物流リストは取込時に「法人番号」が未マッピング列として
--       memo の JSON に入っていた。専用列に持ち替え、次回以降クライアントが付与する「ID」も受ける。
set local search_path = public, extensions;
set local lock_timeout = '5s';

alter table public.call_list_items
  add column if not exists corporate_number text,
  add column if not exists client_ref_id text;

comment on column public.call_list_items.corporate_number is '法人番号（13桁）。取込時に列を紐付ける';
comment on column public.call_list_items.client_ref_id is 'クライアントが各企業に付与したID。取込時に列を紐付ける';

-- 既存リストの埋め戻し: memo JSON の「法人番号」が13桁ならそのまま移す。
-- Excel経由で「4.01E+12」のように壊れた値は復元できないので触らない。
update public.call_list_items
   set corporate_number = memo::jsonb->>'法人番号'
 where corporate_number is null
   and memo like '%法人番号%'
   and memo ~ '^\s*\{'
   and (memo::jsonb->>'法人番号') ~ '^\d{13}$';

-- 戻り値の列が増えるので create or replace では通らない。落として作り直す（実行権限は既定のPUBLICのまま）
drop function if exists public.sourcing_list_approach_detail(uuid, uuid);

create function public.sourcing_list_approach_detail(p_list_id uuid, p_org_id uuid)
returns table(item_id uuid, no integer, company text, corporate_number text, client_ref_id text, phone text, calls jsonb)
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
    cli.corporate_number,
    cli.client_ref_id,
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
