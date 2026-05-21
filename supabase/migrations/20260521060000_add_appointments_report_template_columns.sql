-- =====================================================================
-- appointments にテンプレ参照カラムを追加
-- ---------------------------------------------------------------------
-- 経緯:
--   テンプレ駆動の AppoReportModal が保存時に使ったテンプレIDと
--   フィールド値（schema駆動の動的項目）を残すため。
--   テンプレを後から編集しても、過去アポの表示が壊れないよう
--   テンプレIDをスナップショットとして保持する。
-- =====================================================================

set local search_path = public, extensions;

alter table public.appointments
  add column if not exists report_template_id_snapshot uuid references public.appointment_report_templates(id) on delete set null;

alter table public.appointments
  add column if not exists report_data jsonb;

create index if not exists idx_appointments_report_template_id_snapshot
  on public.appointments(report_template_id_snapshot)
  where report_template_id_snapshot is not null;

comment on column public.appointments.report_template_id_snapshot is '保存時に使用したテンプレID（テンプレ変更後も過去アポを壊さない）';
comment on column public.appointments.report_data is 'テンプレschemaに沿った動的フィールド値（JSONB）';
