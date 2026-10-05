-- 企業DBの検索専用の表に、架電の集計を持たせる（2026-10-06）。
-- 「架電状況」「最終架電日」「架電回数」の条件は、全リストの架電を毎回集計していて24秒かかっていた。
--  call_count     … その会社の全リストの架電回数の合計
--  last_call_at   … 最終架電日時
--  call_statuses  … リストごとの最新の結果（架電なしは「未架電」）。リストに1件も無い会社は空
-- 架電の記録・修正・削除は、印だけ付けて（company_directory_call_dirty）、1分ごとにまとめて集計し直す。
-- 架電の記録そのものは止めない（印付けの失敗は握りつぶす）。毎晩、全社を集計し直して取りこぼしを埋める。
SET LOCAL lock_timeout='4s';
ALTER TABLE public.company_directory_lite
 ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS last_call_at timestamptz,
 ADD COLUMN IF NOT EXISTS call_statuses text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.crm_directory_lite_refresh_calls(p_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 WITH items AS (
  SELECT l.company_id,l.item_id,count(r.id) cnt,max(r.called_at) lc,
   coalesce((array_agg(r.status ORDER BY r.round DESC NULLS LAST,r.called_at DESC NULLS LAST,r.id DESC) FILTER(WHERE r.id IS NOT NULL))[1],'未架電') st
  FROM unnest(p_ids) u(id) JOIN public.company_directory_lite x ON x.company_id=u.id
  JOIN public.company_profile_links l ON l.org_id=x.org_id AND l.company_id=x.company_id AND l.item_id IS NOT NULL
  JOIN public.call_lists cl ON cl.id=l.list_id AND cl.org_id=l.org_id
  LEFT JOIN public.call_records r ON r.item_id=l.item_id AND r.org_id=l.org_id
  GROUP BY l.company_id,l.item_id
 ), agg AS (
  SELECT u.id,coalesce(sum(i.cnt),0)::int cc,max(i.lc) lc,coalesce(array_agg(DISTINCT i.st) FILTER(WHERE i.st IS NOT NULL),'{}') st
  FROM unnest(p_ids) u(id) LEFT JOIN items i ON i.company_id=u.id GROUP BY u.id
 )
 UPDATE public.company_directory_lite x SET call_count=a.cc,last_call_at=a.lc,call_statuses=a.st
 FROM agg a WHERE x.company_id=a.id AND (x.call_count,x.last_call_at,x.call_statuses) IS DISTINCT FROM (a.cc,a.lc,a.st);
END; $function$;
REVOKE ALL ON FUNCTION public.crm_directory_lite_refresh_calls(uuid[]) FROM public, anon, authenticated;

-- 会社の更新（リストの取り込みで会社がつながった時を含む）のたびに、架電の集計も作り直す
DO $do$
DECLARE src text; old text:=$o$  AND NOT EXISTS (SELECT 1 FROM public.company_directory_search d WHERE d.company_id=x.company_id);
END;$o$;
BEGIN
 src:=pg_get_functiondef('public.crm_directory_lite_refresh(uuid[])'::regprocedure);
 IF position('crm_directory_lite_refresh_calls' in src)>0 THEN RETURN; END IF;
 IF position(old in src)=0 THEN RAISE EXCEPTION 'crm_directory_lite_refresh: target not found'; END IF;
 src:=replace(src,old,$n$  AND NOT EXISTS (SELECT 1 FROM public.company_directory_search d WHERE d.company_id=x.company_id);
 PERFORM public.crm_directory_lite_refresh_calls(p_ids);
END;$n$);
 EXECUTE src;
END $do$;

-- 架電の記録に印を付ける
CREATE TABLE IF NOT EXISTS public.company_directory_call_dirty (item_id uuid PRIMARY KEY, marked_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.company_directory_call_dirty ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_directory_call_dirty FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_directory_mark_call_dirty()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.item_id IS NOT NULL THEN
   INSERT INTO public.company_directory_call_dirty(item_id) VALUES (NEW.item_id) ON CONFLICT (item_id) DO NOTHING;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.item_id IS NOT NULL THEN
   INSERT INTO public.company_directory_call_dirty(item_id) VALUES (OLD.item_id) ON CONFLICT (item_id) DO NOTHING;
  END IF;
 EXCEPTION WHEN OTHERS THEN NULL;  -- 架電の記録は止めない。取りこぼしは毎晩の全社集計で埋まる
 END;
 RETURN NULL;
END; $function$;
DROP TRIGGER IF EXISTS crm_directory_call_dirty ON public.call_records;
CREATE TRIGGER crm_directory_call_dirty AFTER INSERT OR DELETE OR UPDATE OF item_id,status,round,called_at ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.crm_directory_mark_call_dirty();

-- 1分ごと：印の付いた架電の会社だけ集計し直す
CREATE OR REPLACE FUNCTION public.crm_directory_lite_process_call_dirty()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE taken uuid[]; ids uuid[];
BEGIN
 WITH t AS (DELETE FROM public.company_directory_call_dirty WHERE item_id IN
   (SELECT item_id FROM public.company_directory_call_dirty ORDER BY marked_at LIMIT 5000 FOR UPDATE SKIP LOCKED) RETURNING item_id)
 SELECT array_agg(item_id) INTO taken FROM t;
 IF taken IS NULL THEN RETURN 0; END IF;
 SELECT array_agg(DISTINCT l.company_id) INTO ids FROM public.company_profile_links l WHERE l.item_id=ANY(taken);
 IF ids IS NOT NULL THEN PERFORM public.crm_directory_lite_refresh_calls(ids); END IF;
 RETURN coalesce(cardinality(ids),0);
END; $function$;
REVOKE ALL ON FUNCTION public.crm_directory_lite_process_call_dirty() FROM public, anon, authenticated;

-- 毎晩：全社を集計し直す（2万社ずつ）
CREATE OR REPLACE FUNCTION public.crm_directory_lite_refresh_all_calls()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE ids uuid[]; last uuid:='00000000-0000-0000-0000-000000000000'; total integer:=0;
BEGIN
 LOOP
  SELECT array_agg(company_id ORDER BY company_id) INTO ids FROM
   (SELECT company_id FROM public.company_directory_lite WHERE company_id>last ORDER BY company_id LIMIT 20000) s;
  EXIT WHEN ids IS NULL;
  PERFORM public.crm_directory_lite_refresh_calls(ids);
  total:=total+cardinality(ids); last:=ids[cardinality(ids)];
 END LOOP;
 RETURN total;
END; $function$;
REVOKE ALL ON FUNCTION public.crm_directory_lite_refresh_all_calls() FROM public, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('company-directory-call-dirty','company-directory-calls-nightly');
SELECT cron.schedule('company-directory-call-dirty','* * * * *','SELECT public.crm_directory_lite_process_call_dirty();');
SELECT cron.schedule('company-directory-calls-nightly','40 18 * * *',$c$SET statement_timeout='15min'; SELECT public.crm_directory_lite_refresh_all_calls();$c$);
