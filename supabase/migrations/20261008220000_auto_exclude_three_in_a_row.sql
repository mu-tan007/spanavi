-- 3回続けて不通・3回続けて受付ブロックの会社は自動で除外する（2026-10-08 むー様）
-- 根拠（10/8 の架電記録）：3回続けて不通の後のアポ率 0.05%（全体 0.22%）、3回続けて受付ブロックの後は 142件で 0件。
-- 本番には apply_migration で適用済み（中身は同じ）。同日、動いているリストの該当986社（不通950・ブロック36）も同じ決まりで除外した。
create or replace function public.auto_exclude_three_in_a_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare last3 text[]; reason text;
begin
  if new.item_id is null or new.status not in ('不通', '受付ブロック', '受付NG') then return new; end if;
  select array_agg(status order by called_at desc) into last3
  from (select status, called_at from call_records where item_id = new.item_id and status is not null order by called_at desc limit 3) x;
  if array_length(last3, 1) < 3 then return new; end if;
  if last3 <@ array['不通'] then reason := '3回連続不通のため自動除外（2026-10-08の決まり）';
  elsif last3 <@ array['受付ブロック', '受付NG'] then reason := '3回連続受付ブロックのため自動除外（2026-10-08の決まり）';
  else return new; end if;
  update call_list_items set is_excluded = true, exclude_reason = reason
   where id = new.item_id and not coalesce(is_excluded, false) and coalesce(call_status, '') not in ('アポ獲得', '除外');
  if found then
    insert into mv_excluded_items (org_id, item_id, status, excluded_at)
    values (new.org_id, new.item_id, '自動除外', coalesce(new.called_at, now())) on conflict (org_id, item_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists trg_auto_exclude_three_in_a_row on public.call_records;
create trigger trg_auto_exclude_three_in_a_row after insert on public.call_records
  for each row execute function public.auto_exclude_three_in_a_row();
