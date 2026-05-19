-- =====================================================================
-- company_dossiers: アポ取得した企業のドシエ（成果物）
-- ---------------------------------------------------------------------
-- 経緯:
--   ソーシング配下のクライアントポータルでアポ詳細を行展開すると、
--   対象企業の概要・沿革・直近プレスリリース等の「企業ドシエ」を表示する。
--   アポ取得報告の保存時に generate-company-dossier Edge Function が
--   バックグラウンドで HP + Claude web_search ツール経由で構造化生成。
--
--   同名異社誤認を防ぐため、社名・代表者名・住所の3点照合を行う。
--   各情報源は sources[].identity_match で high/medium/low を記録。
--
-- スコープ:
--   - appointment_id 単位で1ドシエ（履歴バージョニングは MVP 外）
--   - クライアントは閲覧のみ、MASP メンバーは閲覧+編集
--   - 代理ログイン中の編集は update-company-dossier Edge Function 経由
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.company_dossiers (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  appointment_id        uuid not null unique references public.appointments(id) on delete cascade,
  item_id               uuid references public.call_list_items(id) on delete set null,

  -- 同定確認用スナップショット（生成時の引数を残し、後の調査に使う）
  target_company_name   text not null,
  target_representative text,
  target_address        text,

  -- 本体
  -- content JSONB スキーマ:
  --   overview            string         会社概要（数段落）
  --   business_segments   string[]       事業セグメント
  --   history             [{year,event}] 沿革
  --   leadership          [{role,name}]  経営陣
  --   financials          {revenue, employees, established, capital}
  --   press_releases      [{date, title, url, summary}]
  --   news                [{date, title, url, summary, source}]
  --   key_topics          string[]       M&A 関連トピック
  --   mna_relevance       string         M&A 関連性所感
  content               jsonb not null default '{}'::jsonb,
  free_notes            text default '',                  -- MASP の自由記述
  -- sources JSONB スキーマ:
  --   [{type: 'hp'|'web_search', url, fetched_at, identity_match: 'high'|'medium'|'low'}]
  sources               jsonb not null default '[]'::jsonb,

  -- ステータス
  generation_status     text not null default 'queued'
    check (generation_status in ('queued','running','succeeded','partial','failed')),
  generation_error      text,
  generated_at          timestamptz,
  edited_at             timestamptz,
  edited_by             uuid references auth.users(id),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.company_dossiers is
  'アポ取得企業のドシエ。クライアントポータル獲得アポ詳細の行展開で表示。';
comment on column public.company_dossiers.content is
  'JSONB. Keys: overview(string), business_segments(string[]), history([{year,event}]), leadership([{role,name}]), financials({revenue,employees,established,capital}), press_releases([{date,title,url,summary}]), news([{date,title,url,summary,source}]), key_topics(string[]), mna_relevance(string)';
comment on column public.company_dossiers.sources is
  'JSONB array. Each: {type: hp|web_search, url, fetched_at, identity_match: high|medium|low}';
comment on column public.company_dossiers.generation_status is
  'queued: 未着手 / running: 生成中 / succeeded: 成功 / partial: 一部失敗 / failed: 失敗';

create index if not exists idx_company_dossiers_org      on public.company_dossiers(org_id);
create index if not exists idx_company_dossiers_appoint  on public.company_dossiers(appointment_id);
create index if not exists idx_company_dossiers_status   on public.company_dossiers(generation_status);
create index if not exists idx_company_dossiers_item     on public.company_dossiers(item_id);

-- =====================================================================
-- RLS（2層防御）
-- ---------------------------------------------------------------------
--   SELECT: 同 org の members.user_id = auth.uid()  OR
--           clients.auth_user_id = auth.uid() AND そのクライアントのアポ
--   INSERT/UPDATE/DELETE: 同 org の members.user_id = auth.uid() のみ
--   （クライアントロールは update 不可。代理ログイン中の編集は
--    update-company-dossier Edge Function 経由で admin token 検証 + service_role 書込）
-- =====================================================================

alter table public.company_dossiers enable row level security;

drop policy if exists company_dossiers_select on public.company_dossiers;
create policy company_dossiers_select on public.company_dossiers
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    or exists (
      select 1
      from public.appointments a
      join public.clients c on c.id = a.client_id
      where a.id = company_dossiers.appointment_id
        and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists company_dossiers_insert on public.company_dossiers;
create policy company_dossiers_insert on public.company_dossiers
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.org_id = company_dossiers.org_id
    )
  );

drop policy if exists company_dossiers_update on public.company_dossiers;
create policy company_dossiers_update on public.company_dossiers
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.org_id = company_dossiers.org_id
    )
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.org_id = company_dossiers.org_id
    )
  );

drop policy if exists company_dossiers_delete on public.company_dossiers;
create policy company_dossiers_delete on public.company_dossiers
  for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.org_id = company_dossiers.org_id
    )
  );

-- =====================================================================
-- updated_at 自動更新トリガー
-- =====================================================================

create or replace function public.set_company_dossiers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_company_dossiers_updated_at on public.company_dossiers;
create trigger trg_company_dossiers_updated_at
  before update on public.company_dossiers
  for each row execute function public.set_company_dossiers_updated_at();

-- =====================================================================
-- appointments への keyman_ma_intent 補完用カラム確認
--   transcribe-recording Edge Function が録音から keyman_ma_intent を
--   直接判定して書き込むため、本マイグレーションでは存在確認のみ。
--   （列追加は既存 20260515000000_rename_ceo_to_keyman.sql で完了済）
-- =====================================================================
