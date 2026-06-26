-- ============================================================
-- 複業クラウド 採用管理 (スパキャリ事業部) 基盤 migration
-- ----------------------------------------------------------------
-- 目的:
--   複業クラウド(Another works) からの応募通知メールを専用 GAS が
--   解析し、候補者(営業マン / トレーナー)を Supabase に蓄積。
--   スパキャリ管理画面「採用管理」タブで候補者一覧・面接日程を管理する。
--
-- 構成:
--   1. recruit_applicants  … 候補者(応募者)
--   2. recruit_interviews  … 面接枠
--   3. recruit-applicant-photos … 顔写真の非公開 Storage バケット
--   4. updated_at 自動更新トリガー
--   5. RLS: 同一 org の認証メンバーは閲覧・編集可。受講生(student)は対象外。
--           GAS は service_role で RLS をバイパスして投入する。
--
-- 適用方法:
--   Supabase MCP の apply_migration、または supabase db push --include-all
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 0. updated_at 自動更新トリガー関数
-- ----------------------------------------------------------------
create or replace function public.recruit_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 1. recruit_applicants (候補者)
-- ----------------------------------------------------------------
create table if not exists public.recruit_applicants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  source            text not null default 'fukugyo_cloud',   -- 流入元
  -- 候補者プロフィール
  full_name         text not null,
  furigana          text,
  job_type          text not null default 'unknown'
                      check (job_type in ('sales','trainer','unknown')),
  job_title         text,            -- 応募した求人の見出し(原文)
  profile_text      text,            -- 自己PR本文
  photo_path        text,            -- recruit-applicant-photos 内のパス
  -- 選考管理
  status            text not null default 'new'
                      check (status in ('new','screening','interview','passed','rejected')),
  staff_memo        text,            -- 運営側メモ
  -- 取込メタ
  applied_at        timestamptz,                 -- 応募(メール受信)日時
  gmail_message_id  text,                        -- 二重取込防止キー
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 二重取込防止: 同じ通知メールからは1件のみ
create unique index if not exists recruit_applicants_gmail_msg_uniq
  on public.recruit_applicants (gmail_message_id)
  where gmail_message_id is not null;

create index if not exists recruit_applicants_org_status_idx
  on public.recruit_applicants (org_id, status);
create index if not exists recruit_applicants_org_jobtype_idx
  on public.recruit_applicants (org_id, job_type);

comment on table public.recruit_applicants is '複業クラウド等からの採用候補者(営業マン/トレーナー)';
comment on column public.recruit_applicants.job_type is 'sales=営業マン / trainer=トレーナー / unknown=判別不能';
comment on column public.recruit_applicants.gmail_message_id is '取込元のGmailメッセージID。重複取込防止のユニークキー';

drop trigger if exists recruit_applicants_set_updated_at on public.recruit_applicants;
create trigger recruit_applicants_set_updated_at
  before update on public.recruit_applicants
  for each row execute function public.recruit_set_updated_at();

-- ----------------------------------------------------------------
-- 2. recruit_interviews (面接枠)
-- ----------------------------------------------------------------
create table if not exists public.recruit_interviews (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  applicant_id  uuid not null references public.recruit_applicants(id) on delete cascade,
  scheduled_at  timestamptz not null,            -- 面接日時
  method        text,                            -- 形式(オンライン/対面 等の自由記述)
  location      text,                            -- 場所 or URL
  note          text,                            -- 面接メモ
  result        text not null default 'scheduled'
                  check (result in ('scheduled','done','passed','rejected','noshow','canceled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists recruit_interviews_applicant_idx
  on public.recruit_interviews (applicant_id);
create index if not exists recruit_interviews_org_sched_idx
  on public.recruit_interviews (org_id, scheduled_at);

comment on table public.recruit_interviews is '採用候補者の面接枠(日時・結果)';

drop trigger if exists recruit_interviews_set_updated_at on public.recruit_interviews;
create trigger recruit_interviews_set_updated_at
  before update on public.recruit_interviews
  for each row execute function public.recruit_set_updated_at();

-- ----------------------------------------------------------------
-- 3. Storage バケット: recruit-applicant-photos (非公開)
-- ----------------------------------------------------------------
-- 顔写真置き場。パス: recruit-applicant-photos/<org_id>/<applicant_id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruit-applicant-photos',
  'recruit-applicant-photos',
  false,
  10485760, -- 10 MB / file
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 4. RLS ポリシー (テーブル)
-- ----------------------------------------------------------------
-- 社内採用バックオフィス。受講生(student)は触れない。
-- 同一 org の認証メンバー(= get_user_org_id() 一致)に read/write を許可。
-- GAS の投入は service_role で RLS をバイパスするため insert ポリシー不要。

alter table public.recruit_applicants enable row level security;

drop policy if exists recruit_applicants_rw on public.recruit_applicants;
create policy recruit_applicants_rw on public.recruit_applicants
  for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

alter table public.recruit_interviews enable row level security;

drop policy if exists recruit_interviews_rw on public.recruit_interviews;
create policy recruit_interviews_rw on public.recruit_interviews
  for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

-- ----------------------------------------------------------------
-- 5. Storage RLS: recruit-applicant-photos
-- ----------------------------------------------------------------
-- 同じ org_id (バケット直下フォルダ名) のメンバーのみ read/write 可。
drop policy if exists recruit_photos_org_read on storage.objects;
create policy recruit_photos_org_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recruit-applicant-photos'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

drop policy if exists recruit_photos_org_write on storage.objects;
create policy recruit_photos_org_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'recruit-applicant-photos'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  )
  with check (
    bucket_id = 'recruit-applicant-photos'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

-- ----------------------------------------------------------------
-- 6. 動作確認用クエリ (コメントアウト済み)
-- ----------------------------------------------------------------
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name like 'recruit_%';
-- select id, public, file_size_limit from storage.buckets where id='recruit-applicant-photos';
-- select policyname from pg_policies where tablename in ('recruit_applicants','recruit_interviews');
