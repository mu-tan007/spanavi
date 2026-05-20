-- =====================================================================
-- company_dossiers を Supabase Realtime publication に追加
-- ---------------------------------------------------------------------
-- 経緯:
--   AppointmentsTab / CompanyDossierPanel が generate-company-dossier の
--   ステータス遷移（queued → running → succeeded）を即時反映するために
--   supabase Realtime channel を購読しているが、テーブルが publication に
--   含まれていないと postgres_changes イベントが発火しないため、ボタンが
--   「生成中…」のまま固まる事象が発生していた。
-- =====================================================================

set local search_path = public, extensions;

-- publication への追加は冪等性が無いため、存在しない時のみ追加
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'company_dossiers'
  ) then
    execute 'alter publication supabase_realtime add table public.company_dossiers';
  end if;
end$$;
