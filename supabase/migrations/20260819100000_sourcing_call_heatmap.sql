-- クライアント別 曜日×時間帯ヒートマップ（架電結果タブ用）
--
-- 既存の perf_call_heatmap は社内アナリティクス用で org 全体を返すため、
-- クライアントポータルからは使えない（自社以外のリストまで見えてしまう）。
-- sourcing_call_result_by_list と同じ作法で、
--   ・ポータルログイン時は is_client_user() 系で自社 client_id / org_id に強制置換
--   ・SECURITY DEFINER にせず RLS を効かせる
-- とし、call_lists を join して「そのクライアントのリスト」だけに限定する。
--
-- p_list_ids は絞り込むリストの配列。単体リストなら1件、NULL ならクライアント配下の全リスト合算。
-- 配列にしてあるのは、兼業クライアントの engagement サブタブで
-- 画面に出ているリストだけを合算する必要があるため。
-- アーカイブ済リストも対象（過去リストの時間帯傾向を見るため除外しない）。

set local search_path = public, extensions;

DROP FUNCTION IF EXISTS public.sourcing_call_heatmap(uuid, uuid, text[], timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.sourcing_call_heatmap(uuid, uuid, text[], timestamptz, timestamptz, uuid[]);
CREATE OR REPLACE FUNCTION public.sourcing_call_heatmap(
  p_client_id uuid,
  p_org_id uuid,
  p_keyman_labels text[],
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_list_ids uuid[] DEFAULT NULL
)
  RETURNS TABLE(dow integer, hour integer, calls bigint, connects bigint)
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public'
AS $$
declare
  v_client_id uuid := case when is_client_user() then current_client_id() else p_client_id end;
  v_org_id    uuid := case when is_client_user() then current_client_org_id() else p_org_id end;
begin
  return query
  select
    (extract(isodow from (cr.called_at at time zone 'Asia/Tokyo')) - 1)::int as dow,
    extract(hour from (cr.called_at at time zone 'Asia/Tokyo'))::int as hour,
    count(*)::bigint as calls,
    count(*) filter (where cr.status = any(p_keyman_labels))::bigint as connects
  from call_records cr
  join call_lists cl on cl.id = cr.list_id
  where cr.org_id = v_org_id
    and cl.org_id = v_org_id
    and cl.client_id = v_client_id
    and (p_list_ids is null or cr.list_id = any(p_list_ids))
    and (p_from is null or cr.called_at >= p_from)
    and (p_to   is null or cr.called_at <  p_to)
  group by 1, 2
  order by 1, 2;
end;
$$;

COMMENT ON FUNCTION public.sourcing_call_heatmap(uuid, uuid, text[], timestamptz, timestamptz, uuid[])
  IS 'クライアント配下の架電を曜日(0=月)×時(JST)で集計。p_list_ids で対象リストを限定（NULL=全リスト）。ポータルからは自社データのみ。';
