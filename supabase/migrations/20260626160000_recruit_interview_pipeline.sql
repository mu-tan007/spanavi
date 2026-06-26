-- ============================================================
-- 採用管理: 面接日(interview_at) と パイプラインステータス(pipeline_status) を追加
-- ----------------------------------------------------------------
-- 一覧でインライン編集する 面接日 / ステータス を recruit_applicants 本体に持たせる。
-- pipeline_status: 日程調整中/調整済/採用/不採用/保留
-- メモは既存 staff_memo を流用。GAS は pipeline_status を触らない（既定値 'scheduling'）。
-- ============================================================

set local search_path = public, extensions;

alter table public.recruit_applicants
  add column if not exists interview_at timestamptz,
  add column if not exists pipeline_status text not null default 'scheduling';

alter table public.recruit_applicants
  drop constraint if exists recruit_applicants_pipeline_status_check;
alter table public.recruit_applicants
  add constraint recruit_applicants_pipeline_status_check
  check (pipeline_status in ('scheduling','scheduled','hired','rejected','hold'));

comment on column public.recruit_applicants.interview_at is '面接日時（一覧でインライン編集）';
comment on column public.recruit_applicants.pipeline_status is '採用パイプライン: scheduling=日程調整中 / scheduled=調整済 / hired=採用 / rejected=不採用 / hold=保留';
