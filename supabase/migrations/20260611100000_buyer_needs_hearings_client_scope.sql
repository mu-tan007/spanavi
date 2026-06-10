set local search_path = public, extensions;

-- 買い手マッチング ニーズヒアリングを「そのクライアント分だけ」表示する方針へ転換。
-- どのクライアント向けにヒアリングしたかを client_id で保持する（架電リストのクライアント）。
alter table public.buyer_needs_hearings add column if not exists client_id uuid;

create index if not exists buyer_needs_hearings_client_idx
  on public.buyer_needs_hearings(client_id, created_at desc);

-- ポータル閲覧ポリシーをクライアント単位に変更（当初の org 共有プールから方針転換）。
-- 自分(client)宛 = buyer_needs_hearings.client_id が自分の clients.id と一致する分だけ閲覧可。
-- 売り手ソーシングと買い手マッチングを両方やっているクライアントでも、
-- 自分宛の買収ニーズだけが見え、他クライアント分は一切見えない。
drop policy if exists "bnh_portal_select" on public.buyer_needs_hearings;
create policy "bnh_portal_select" on public.buyer_needs_hearings
  for select using (exists (
    select 1 from public.clients c
    where c.auth_user_id = auth.uid()
      and c.id = buyer_needs_hearings.client_id
  ));
