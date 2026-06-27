-- ============================================================
-- 採用管理 AI「イケてる判定」ラベリング
-- ----------------------------------------------------------------
-- 目的:
--   recruit_applicants の候補者を、面接前に AI(Claude Haiku) が
--   職種別の観点で 5 段階評価する。営業=営業経験/実績インパクト、
--   トレーナー=AI知見/指導育成。総合スコアと判定理由も保存。
--   profile_text が薄く判断材料が乏しい場合は断定せず info_insufficient。
--
-- 構成:
--   1. recruit_applicants に ai_* 列を追加
--   2. AFTER INSERT トリガー → Edge Function analyze-recruit-applicant 発火
--      (取り込み・手動追加どちらの insert でも自動でラベリング)
--
-- 注意:
--   Edge Function を先に deploy してから本 migration を適用すること。
--   既存候補者のバックフィルは deploy 後に別途 net.http_post で発火。
--
-- 適用方法:
--   Supabase MCP の apply_migration、または supabase db push
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 1. ai_* 列を追加
-- ----------------------------------------------------------------
alter table public.recruit_applicants
  add column if not exists ai_overall_score    smallint
    check (ai_overall_score between 1 and 5),
  add column if not exists ai_axis_scores       jsonb,
  add column if not exists ai_reason            text,
  add column if not exists ai_info_insufficient boolean not null default false,
  add column if not exists ai_labeled_at        timestamptz,
  add column if not exists ai_model             text;

comment on column public.recruit_applicants.ai_overall_score    is 'AI総合イケてる度(1-5)。材料不足で評価不能なら null';
comment on column public.recruit_applicants.ai_axis_scores      is '軸別スコア。営業={experience,achievement} トレーナー={ai_knowledge,mentoring} 各1-5';
comment on column public.recruit_applicants.ai_reason           is 'AI判定理由(日本語の短文)';
comment on column public.recruit_applicants.ai_info_insufficient is 'profile_text が薄く判断材料が乏しい(要面接確認)';
comment on column public.recruit_applicants.ai_labeled_at       is 'AIラベリング実行日時';
comment on column public.recruit_applicants.ai_model            is '使用したモデルID';

-- ----------------------------------------------------------------
-- 2. AFTER INSERT トリガー → Edge Function 発火
-- ----------------------------------------------------------------
-- analyze-recruit-applicant は verify_jwt=true (デフォルト) のため anon JWT を付与。
create or replace function public.trigger_ai_label_recruit_applicant()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $func$
begin
  perform net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/analyze-recruit-applicant',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := jsonb_build_object('applicant_id', NEW.id)
  );
  return NEW;
end;
$func$;

drop trigger if exists trg_ai_label_recruit_applicant on public.recruit_applicants;
create trigger trg_ai_label_recruit_applicant
  after insert on public.recruit_applicants
  for each row execute function public.trigger_ai_label_recruit_applicant();

-- ----------------------------------------------------------------
-- 3. 既存候補者バックフィル用クエリ (deploy 後に手動実行)
-- ----------------------------------------------------------------
-- select net.http_post(
--   url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/analyze-recruit-applicant',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer <ANON_JWT>'),
--   body := jsonb_build_object('applicant_id', id)
-- ) from public.recruit_applicants where ai_labeled_at is null;
