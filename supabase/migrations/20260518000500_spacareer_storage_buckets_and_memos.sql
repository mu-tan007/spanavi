-- ============================================================
-- スパキャリ Phase 3 統合フォローアップ migration
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md
--
-- 並列実装（6 agents）統合中に発覚した未解決事項を一括対応:
--   1. spacareer_customers.trainer_memo カラム追加（#2 admin1 要求）
--   2. spacareer-homework-files Storage バケット作成
--   3. spacareer-course-videos / spacareer-session-videos Storage バケット作成
--
-- 適用方法 (親エージェント向け):
--   Supabase MCP の apply_migration ツールで本ファイルを適用してください。
--   または supabase CLI:
--     supabase db push --include-all
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 1. spacareer_customers.trainer_memo
-- ----------------------------------------------------------------
-- #2 admin1（顧客一覧/セッション管理）のメモタブで使用する
-- 運営側だけが書ける自由記述メモ（受講生本人には非表示）。
alter table public.spacareer_customers
  add column if not exists trainer_memo text;

comment on column public.spacareer_customers.trainer_memo is
  '運営側専用の自由記述メモ（受講生本人には表示しない）';

-- ----------------------------------------------------------------
-- 2. Storage バケット作成
-- ----------------------------------------------------------------
-- private バケット（直リンク禁止、署名付き URL でのみ配信）
-- RLS は storage.objects に対して別途設定する想定。

-- 2-1. spacareer-homework-files
--   事前課題（30問）の回答添付ファイル置き場（PDF/画像/PPT 想定）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spacareer-homework-files',
  'spacareer-homework-files',
  false,
  52428800, -- 50 MB / file
  array[
    'application/pdf',
    'image/png','image/jpeg','image/webp','image/gif',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- 2-2. spacareer-course-videos
--   AI 講座の本編動画（mp4 / mov）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spacareer-course-videos',
  'spacareer-course-videos',
  false,
  2147483648, -- 2 GB / file
  array['video/mp4','video/quicktime','video/webm','video/x-matroska']
)
on conflict (id) do nothing;

-- 2-3. spacareer-session-videos
--   セッション収録動画（Zoom 録画取り込み or 直接アップロード）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spacareer-session-videos',
  'spacareer-session-videos',
  false,
  2147483648, -- 2 GB / file
  array['video/mp4','video/quicktime','video/webm','video/x-matroska']
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 3. Storage RLS ポリシー
-- ----------------------------------------------------------------
-- 共通方針: org_id を bucket 直下フォルダ名で区別し、所属メンバーのみアクセス可。
-- パス例: <bucket>/<org_id>/<customer_id>/<filename>
-- 受講生は自分の customer_id 配下のみ、運営はその org_id 配下すべて可。

-- 受講生（client portal）と運営（admin portal）の双方の認証ユーザーで使う想定。
-- まずは org_id レベルの read/write 許可を最小権限で入れる（細粒度は後続で）。
do $$
declare
  bkt text;
begin
  foreach bkt in array array['spacareer-homework-files','spacareer-course-videos','spacareer-session-videos'] loop

    -- 既存ポリシーをクリーンに作り直す
    execute format(
      'drop policy if exists "spacareer_%s_org_read" on storage.objects',
      replace(bkt, '-', '_')
    );
    execute format(
      'drop policy if exists "spacareer_%s_org_write" on storage.objects',
      replace(bkt, '-', '_')
    );

    -- 同じ org_id に所属するメンバーは read 可
    execute format($f$
      create policy "spacareer_%s_org_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = (
          select org_id::text from public.members where user_id = auth.uid() limit 1
        )
      )
    $f$, replace(bkt, '-', '_'), bkt);

    -- 同じ org_id に所属するメンバーは write 可（細粒度は後続で）
    execute format($f$
      create policy "spacareer_%s_org_write" on storage.objects
      for all to authenticated
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = (
          select org_id::text from public.members where user_id = auth.uid() limit 1
        )
      )
      with check (
        bucket_id = %L
        and (storage.foldername(name))[1] = (
          select org_id::text from public.members where user_id = auth.uid() limit 1
        )
      )
    $f$, replace(bkt, '-', '_'), bkt, bkt);

  end loop;
end $$;

-- ----------------------------------------------------------------
-- 4. 動作確認用クエリ（コメントアウト済み）
-- ----------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='spacareer_customers' and column_name='trainer_memo';
-- select id, public, file_size_limit from storage.buckets where id like 'spacareer-%';
-- select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'spacareer_%';
