-- ============================================================
-- 採用管理: 面接担当者(interviewer) カラムを追加
-- ----------------------------------------------------------------
-- 一覧の「面接日」右に面接担当者プルダウン（篠宮 / 小山）を置く。
-- 自由文字列で保持（将来担当者が増えてもマイグレーション不要）。
-- ============================================================

set local search_path = public, extensions;

alter table public.recruit_applicants
  add column if not exists interviewer text;

comment on column public.recruit_applicants.interviewer is '面接担当者（篠宮 / 小山 等）';
