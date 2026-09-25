-- ギフトDMで送った手紙（1社1ページのPDF）を架電画面の「手紙」タブで見せる。
-- 置き場所は専用の非公開バケット gift-letters、鍵は <org_id>/<token>.pdf。
-- script-pdfs は読み取りが public ロールに開いているので間借りしない（手紙には宛名が載る）。
-- 本番へは apply_migration で適用済み（2026-09-25）。
set lock_timeout = '3s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-letters', 'gift-letters', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- 読めるのは同じ組織の社内ユーザーだけ。書き込みは service_role からのみ（ポリシーを置かない）
drop policy if exists gift_letters_select_org on storage.objects;
create policy gift_letters_select_org on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gift-letters'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
    and not public.is_client_user()
  );

alter table public.gift_shipments
  add column if not exists letter_pdf_path text;
comment on column public.gift_shipments.letter_pdf_path is '送った手紙のPDF（gift-letters バケット内の鍵）。無ければ手紙タブに出さない';
