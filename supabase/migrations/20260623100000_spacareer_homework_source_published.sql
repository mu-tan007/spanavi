-- スパキャリ 事後課題: 固定/変動の区別カラム＋固定自動公開フラグ
--
-- 新フロー（むー様指示 2026-06-23）:
--   - 固定事後課題＋感想 = 各回の scheduled_at を過ぎたら自動公開（別マイグレーションの cron）
--   - 変動事後課題       = 事後課題タブの専用ボタンで AI 生成 → 修正 → 追加公開
-- 本マイグレーションは上記に必要なカラムを追加し、既存データを保護する。

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. homework_items: 固定/変動の区別と、変動ドラフトの公開フラグ
-- ------------------------------------------------------------
alter table public.spacareer_homework_items
  add column if not exists source text not null default 'variable'
    check (source in ('fixed','variable')),
  add column if not exists is_published boolean not null default true;

comment on column public.spacareer_homework_items.source is
  'fixed=固定課題(マスター/共通テンプレ由来) | variable=AI変動課題。自動公開cronとドラフト編集UIで使い分ける。';
comment on column public.spacareer_homework_items.is_published is
  '受講生ポータルに表示するか。固定項目は公開時true。変動ドラフトは生成時false→「追加公開」でtrue。既存項目はtrue。';

-- ------------------------------------------------------------
-- 2. homework: 固定自動公開の冪等フラグ
-- ------------------------------------------------------------
alter table public.spacareer_homework
  add column if not exists fixed_published_at timestamptz;

comment on column public.spacareer_homework.fixed_published_at is
  '固定事後課題＋感想を自動公開した時刻。非NULLなら自動公開cronは再処理しない（手動で停止/再公開しても再生成されない）。';

-- ------------------------------------------------------------
-- 3. 既存データ保護（重要）
-- ------------------------------------------------------------
-- 既存の homework は旧フローで作成済み。自動公開cronが固定項目を二重挿入したり
-- 回答済み課題を作り変えたりしないよう、全既存行に fixed_published_at を立てて
-- cron の対象外にする（cron は本マイグレーション以降の新規セッションのみ扱う）。
update public.spacareer_homework
set fixed_published_at = coalesce(notified_at, ai_generated_at, updated_at, now())
where fixed_published_at is null;

-- 既存項目はすべて公開済み扱い（default true で新規追加分は既にtrueだが明示）。
update public.spacareer_homework_items
set is_published = true
where is_published is distinct from true;
