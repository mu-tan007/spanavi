-- メンバー・シフト・企業DBの見本（2026-10-07 むー様確認）で使う集計。どれも呼んだ人の組織の中だけを数える（security invoker＋org_id）。
-- 架電した人は call_records.getter_name（caller_id は入っていない）。「全社」「自動除外」は人ではないので外す。

-- メンバー：期間の中の、人ごとの架電・社長につながった数・最後に架電した時刻
create or replace function public.member_call_stats(p_from timestamptz, p_to timestamptz default now())
returns table (getter_name text, calls bigint, keyman bigint, appo_calls bigint, last_called_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.getter_name,
         count(*),
         count(*) filter (where r.status in ('キーマン断り', 'キーマン再コール', 'アポ獲得')),
         count(*) filter (where r.status = 'アポ獲得'),
         max(r.called_at)
  from call_records r
  where r.org_id = (select get_user_org_id())
    and r.called_at >= p_from and r.called_at < p_to
    and r.getter_name is not null and r.getter_name not in ('全社', '自動除外')
  group by r.getter_name
$$;

-- シフト：その日（日本時間）の、人ごと・時間ごとの架電件数
create or replace function public.member_calls_by_hour(p_day date)
returns table (getter_name text, hour int, calls bigint)
language sql stable security invoker set search_path = public as $$
  select r.getter_name, extract(hour from r.called_at at time zone 'Asia/Tokyo')::int, count(*)
  from call_records r
  where r.org_id = (select get_user_org_id())
    and r.called_at >= (p_day::timestamp at time zone 'Asia/Tokyo')
    and r.called_at < ((p_day + 1)::timestamp at time zone 'Asia/Tokyo')
    and r.getter_name is not null and r.getter_name not in ('全社', '自動除外')
  group by 1, 2
$$;

-- シフト：時間ごとの「社長につながった割合」（直近 p_days 日・平日）
create or replace function public.keyman_rate_by_hour(p_days int default 60)
returns table (hour int, calls bigint, keyman_rate numeric, appo_calls bigint)
language sql stable security invoker set search_path = public as $$
  select extract(hour from r.called_at at time zone 'Asia/Tokyo')::int,
         count(*),
         round(100.0 * count(*) filter (where r.status in ('キーマン断り', 'キーマン再コール', 'アポ獲得')) / count(*), 1),
         count(*) filter (where r.status = 'アポ獲得')
  from call_records r
  where r.org_id = (select get_user_org_id())
    and r.called_at >= now() - make_interval(days => p_days)
    and r.getter_name is not null and r.getter_name not in ('全社', '自動除外')
    and extract(isodow from r.called_at at time zone 'Asia/Tokyo') < 6
  group by 1
$$;

-- 企業DB：都道府県ごとの社数（地図の色）
create or replace function public.company_directory_prefecture_counts()
returns table (prefecture text, companies bigint)
language sql stable security invoker set search_path = public as $$
  select s.prefecture, count(*)
  from company_directory_search s
  where s.org_id = (select get_user_org_id()) and s.prefecture is not null and s.prefecture <> ''
  group by 1
$$;

revoke all on function public.member_call_stats(timestamptz, timestamptz) from anon;
revoke all on function public.member_calls_by_hour(date) from anon;
revoke all on function public.keyman_rate_by_hour(int) from anon;
revoke all on function public.company_directory_prefecture_counts() from anon;
grant execute on function public.member_call_stats(timestamptz, timestamptz) to authenticated;
grant execute on function public.member_calls_by_hour(date) to authenticated;
grant execute on function public.keyman_rate_by_hour(int) to authenticated;
grant execute on function public.company_directory_prefecture_counts() to authenticated;
