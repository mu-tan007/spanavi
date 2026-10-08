-- 社長の温度感（2026-10-09 むー様が断り方ごとに高・中・低・除外を決めた）
-- キーマン断り1件ごとに、AIが「断り方」（下の一覧から複数）と根拠の発言を選び、温度感はこの一覧から機械的に決める：
--   除外が1つでもあれば除外／それ以外は一番高いもの（「結構です。ただ後継者は悩みどころ」→高）
create table if not exists public.ceo_temp_reasons (
  label text primary key, level text not null check (level in ('高','中','低','除外','なし')), sort int not null
);
alter table public.ceo_temp_reasons enable row level security;
drop policy if exists ceo_temp_reasons_read on public.ceo_temp_reasons;
create policy ceo_temp_reasons_read on public.ceo_temp_reasons for select to authenticated using (true);
delete from public.ceo_temp_reasons;
insert into public.ceo_temp_reasons (label, level, sort) values
 ('結構です（理由を言わない）','低',1),('大丈夫です','低',2),('いらない・必要ない・間に合ってる','低',3),('興味ない','低',4),
 ('全く・一切考えていない','低',5),('そういう話（M&A・売却）は結構','低',6),('全部お断りしている（方針）','低',7),('時間の無駄・迷惑','低',8),
 ('怒り・二度とかけるな','除外',9),
 ('今のところ考えていない','中',10),('まだ若い・まだ早い','中',11),('5年後・10年後なら考える','高',12),('将来的にもない','低',13),
 ('廃業する予定・自分の代で終わり','高',14),('もう廃業した','除外',15),
 ('後継者がいる・息子や娘が継ぐ','中',16),('後継者がいない・悩んでいる','高',17),
 ('具体的な相手がいるなら・相手次第','高',18),('金額次第・条件次第','高',19),('どこの会社？・相手の名前は？','高',20),
 ('資料を受け取る・メールで送って','高',21),('資料は送っといて（体よく断る）','中',22),('怪しい・詐欺','低',23),('仲介は信用しない・手数料目当て','中',24),
 ('会議中・出張中など今は話せない状況','高',25),('忙しいから結構（口実）','中',26),('また改めて・かけ直して','中',27),('電話では話せない','中',28),
 ('うちは小さい・零細','中',29),('他の仲介・銀行と話している・検討中','高',30),('他に当たってください','低',31),('もう売却した・譲渡済み','除外',32),
 ('買う側なら興味ある','高',33),('子会社・親会社が決める','除外',34),('雇われ社長・株主ではない','中',35),('M&Aの電話が多い・しょっちゅう来る','中',36),
 ('何の電話？・営業？','中',37),('業績が悪い・赤字','中',38),('上場を目指している・拡大中','中',39),('社長ではない・相手違い','なし',40);

alter table public.call_records add column if not exists ceo_temp text;           -- 高・中・低・除外（社長ではない等は null）
alter table public.call_records add column if not exists ceo_temp_reasons text[]; -- 断り方（上の一覧の label）
alter table public.call_records add column if not exists ceo_temp_quote text;     -- 根拠の発言
alter table public.call_records add column if not exists ceo_temp_judged_at timestamptz;
create index if not exists call_records_ceo_temp_todo on public.call_records (called_at desc) where status = 'キーマン断り' and ceo_temp_judged_at is null;

-- 温度感が付いたら除外する：
--  ・除外（怒り・売却済み・廃業済み・子会社）→ 同じ会社を、動いている全部のリストで除外（苦情と無駄を避ける）
--  ・低 → クライアントの設定（auto_exclude_low_rejection・今はSB様だけ）がある場合だけ、そのリストで除外（従来どおり）
create or replace function public.sync_ceo_temp_exclusion()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_enabled boolean; v_list_id uuid; v_key text; v_reason text;
begin
  if new.item_id is null or new.status <> 'キーマン断り' or new.ceo_temp is null then return new; end if;
  if tg_op = 'UPDATE' and old.ceo_temp is not distinct from new.ceo_temp then return new; end if;
  if new.ceo_temp = '除外' then
    v_reason := 'AI判定:社長の温度感 除外（' || coalesce(array_to_string(new.ceo_temp_reasons, '・'), '') || '）';
    select public.company_key(i.corporate_number, i.phone) into v_key from call_list_items i where i.id = new.item_id;
    create temp table if not exists _ceo_tgt (id uuid) on commit drop;
    delete from _ceo_tgt;
    insert into _ceo_tgt
      select i.id from call_list_items i join call_lists l on l.id = i.list_id
       where i.org_id = new.org_id and not coalesce(l.is_archived, false)
         and (i.id = new.item_id or (v_key is not null and public.company_key(i.corporate_number, i.phone) = v_key));
    insert into mv_excluded_items (org_id, item_id, status, excluded_at)
      select new.org_id, t.id, 'AI除外:社長の温度感', now() from _ceo_tgt t on conflict (org_id, item_id) do nothing;
    update call_list_items set is_excluded = true, exclude_reason = v_reason
     where id in (select id from _ceo_tgt) and is_excluded is distinct from true;
    return new;
  end if;
  if new.ceo_temp = '低' then
    select coalesce(c.auto_exclude_low_rejection, false), cli.list_id into v_enabled, v_list_id
      from call_list_items cli join call_lists cl on cl.id = cli.list_id join clients c on c.id = cl.client_id where cli.id = new.item_id;
    if not coalesce(v_enabled, false) then return new; end if;
    insert into mv_excluded_items (org_id, item_id, status, excluded_at)
    values (new.org_id, new.item_id, 'AI除外:温度感低', coalesce(new.called_at, now())) on conflict (org_id, item_id) do nothing;
    update call_list_items set is_excluded = true, exclude_reason = 'AI判定:温度感低'
     where id = new.item_id and (is_excluded is distinct from true or exclude_reason is distinct from 'AI判定:温度感低');
    if not exists (select 1 from call_records where item_id = new.item_id and status in ('除外','アポ獲得')) then
      insert into call_records (item_id, list_id, org_id, round, status, called_at, memo)
      select new.item_id, coalesce(new.list_id, v_list_id), new.org_id, coalesce(max(round), 0) + 1, '除外', now(), 'AI判定:温度感低により自動除外'
        from call_records where item_id = new.item_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_ceo_temp_exclusion on public.call_records;
create trigger trg_sync_ceo_temp_exclusion after insert or update of ceo_temp on public.call_records
  for each row execute function public.sync_ceo_temp_exclusion();
-- 旧：rejection_reason の先頭 LOW で除外する仕組みは止める（判定は ceo_temp に移した）
drop trigger if exists trg_sync_low_rejection_exclusion on public.call_records;

-- 架電ページの「社長の温度感」：同じ会社の最新の判定（リストをまたいで）。除外はずっと残す。180日以内の高も添える
create or replace function public.company_ceo_temp(p_item_id uuid)
returns table (level text, quote text, reasons text[], called_at timestamptz, client_name text, getter_name text,
               past_high_quote text, past_high_at timestamptz, past_high_client text)
language sql stable security definer set search_path to 'public' as $$
  with me as (select get_user_org_id() as org_id),
  k as (select i.org_id, public.company_key(i.corporate_number, i.phone) as key from call_list_items i where i.id = p_item_id and i.org_id = (select org_id from me)),
  items as (select i.id, i.list_id from call_list_items i, k where k.key is not null and i.org_id = k.org_id and public.company_key(i.corporate_number, i.phone) = k.key),
  rs as (select r.*, items.list_id l_id from call_records r join items on items.id = r.item_id where r.status = 'キーマン断り' and r.ceo_temp is not null),
  pick as (select * from rs order by (rs.ceo_temp = '除外') desc, rs.called_at desc limit 1),
  hi as (select * from rs where rs.ceo_temp = '高' and rs.called_at > now() - interval '180 days' order by rs.called_at desc limit 1)
  select p.ceo_temp, p.ceo_temp_quote, p.ceo_temp_reasons, p.called_at, c.name, p.getter_name,
         case when p.ceo_temp <> '高' then hi.ceo_temp_quote end, case when p.ceo_temp <> '高' then hi.called_at end,
         case when p.ceo_temp <> '高' then hc.name end
    from pick p left join call_lists cl on cl.id = p.l_id left join clients c on c.id = cl.client_id
    left join hi on true left join call_lists hl on hl.id = hi.l_id left join clients hc on hc.id = hl.client_id
$$;
revoke all on function public.company_ceo_temp(uuid) from public, anon;
grant execute on function public.company_ceo_temp(uuid) to authenticated;
