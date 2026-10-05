-- 顧客管理を実情に合わせて使うための欄（2026-10-06 むー様）
--   獲得：どこから来たか（問い合わせフォーム・SNSのDM・紹介・テレアポ・フォーム営業・その他）と紹介元
--   契約：単価は既存の fee_amount（1件あたり・税込）を使う。月の件数の上限・試しの条件を足す
--   停止：止まった理由・止めた側・再開の見込み・ひとこと。ステータスを停止中／保留に変えるときに画面で聞く
--   ステータス変更の記録（client_status_log）に、そのときの理由を一緒に残す
--   停止中にしたら、そのクライアントの架電リストを自動でアーカイブする（止まった先へのかけ続けを防ぐ）
set lock_timeout = '5s';

alter table public.clients add column if not exists acquisition_channel text;
alter table public.clients add column if not exists referrer text;
alter table public.clients add column if not exists monthly_cap integer;
alter table public.clients add column if not exists trial_terms text;
alter table public.clients add column if not exists stop_reason text;
alter table public.clients add column if not exists stopped_by text;
alter table public.clients add column if not exists resume_outlook text;
alter table public.clients add column if not exists stop_note text;

comment on column public.clients.acquisition_channel is '獲得経路：問い合わせフォーム／SNSのDM／紹介／テレアポ／フォーム営業／その他';
comment on column public.clients.fee_amount is '単価（アポ1件あたり・税込・円）';
comment on column public.clients.monthly_cap is '月に受けられるアポの上限（件）。先方が面談をさばける量';
comment on column public.clients.trial_terms is '試しの条件（予算・件数・期間・本契約への切り替え条件）';
comment on column public.clients.stop_reason is '止まった理由：方針転換・体制／アポの質／予算／成果不足／その他';
comment on column public.clients.stopped_by is '止めた側：先方／弊社／自然消滅';
comment on column public.clients.resume_outlook is '再開の見込み：あり／未定／なし';

alter table public.client_status_log add column if not exists note text;

create or replace function public.log_client_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    insert into public.client_status_log (org_id, client_id, from_status, to_status, changed_by_name, note)
    values (
      new.org_id, new.id, old.status, new.status,
      (select m.name from public.members m where m.user_id = auth.uid() and m.org_id = new.org_id limit 1),
      case when new.status in ('停止中', '保留') then
        nullif(concat_ws('・',
          nullif(new.stopped_by, ''),
          nullif(new.stop_reason, ''),
          case when coalesce(new.resume_outlook, '') <> '' then '再開の見込み' || new.resume_outlook end,
          nullif(new.stop_note, '')), '')
      end
    );
  end if;
  return new;
end;
$function$;

-- 停止中にしたら架電リストをアーカイブ（むー様 10/6 了承）。戻すときは架電リストの画面で手で戻す
create or replace function public.archive_lists_on_client_stop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = '停止中' and old.status is distinct from '停止中' then
    update public.call_lists set is_archived = true where client_id = new.id and not is_archived;
  end if;
  return new;
end;
$function$;

drop trigger if exists clients_archive_lists_on_stop on public.clients;
create trigger clients_archive_lists_on_stop
  after update of status on public.clients
  for each row execute function public.archive_lists_on_client_stop();
