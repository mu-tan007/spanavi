-- 架電カレンダーの更新を定期ポーリングからアポ変更通知へ切り替える。
-- 既存のappointmentsのRLSをそのまま使用する。権限・行データは変更しない。
begin;
set local lock_timeout = '3s';
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
commit;
