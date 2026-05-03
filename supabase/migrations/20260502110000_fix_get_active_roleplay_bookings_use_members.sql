-- get_active_roleplay_bookings: public.users → public.members に変更
-- 旧版は public.users への INNER JOIN で org スコープしていたが、
-- 社内Spanaviでは public.users にレコードを持つのは公開版テストテナント3名のみで、
-- 実インターン全員が members 由来のため、ロープレ予約一覧が常時空表示になっていた。
-- members は user_id / org_id / is_active を持ち、get_user_org_id() の参照元でもあるため
-- 本来のテナントスコープ用テーブル。

CREATE OR REPLACE FUNCTION public.get_active_roleplay_bookings()
 RETURNS SETOF roleplay_bookings
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rb.*
  FROM roleplay_bookings rb
  JOIN public.members m ON m.user_id = rb.user_id
  WHERE rb.start_iso >= to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD"T"00:00:00+09:00')
    AND m.is_active = true
    AND m.org_id IS NOT NULL
    AND m.org_id = public.get_user_org_id()
  ORDER BY rb.start_iso ASC;
$function$;
