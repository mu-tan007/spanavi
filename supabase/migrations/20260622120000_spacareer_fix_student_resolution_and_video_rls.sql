-- スパキャリ: 受講生の本人特定(RLS)堅牢化 + 動画一覧の配信絞り込み
--
-- 背景:
--  spacareer_current_member_id() が members.user_id = auth.uid() で照合しておらず、
--  メール一致頼みだった。get_user_org_id() は既に user_id 優先に改修済みのため、
--  この関数だけ旧実装が残り、auth メールと members.email がズレた受講生で
--  本人特定に失敗 → 動画の割当判定・事後課題の閲覧RLSが崩れていた。
--  （配信外動画が表示され再生不可になる / 公開済み事後課題が受講生に出ない の共通根）
--
--  併せて spacareer_course_videos の SELECT RLS が org_id のみで audience/割当を
--  絞っていなかったため、サーバー側で配信先を強制する。

set local search_path = public, extensions;

-- 1) 受講生の本人特定を user_id 優先に（メアド変更耐性・最も確実）
create or replace function public.spacareer_current_member_id()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select coalesce(
    -- パターン1(最優先): auth.uid() = members.user_id でlookup（メアド変更しても切れない）
    (select m.id from public.members m
      where m.user_id = auth.uid() and m.is_active = true
      limit 1),
    -- パターン2(後方互換): user_{memberId}@... 形式のメール
    (select m.id from public.members m
      where m.id::text = substring(
        (select email from auth.users where id = auth.uid()) from 'user_(.+)@')
      limit 1),
    -- パターン3(後方互換): 実メールアドレス一致
    (select m.id from public.members m
      where m.email = (select email from auth.users where id = auth.uid())
      limit 1)
  );
$function$;

-- 2) 動画一覧の SELECT RLS を配信先で絞る
--    スタッフ(管理者/トレーナー = 受講生でない)は従来通り組織内全件閲覧可（管理画面で割当するため）。
--    受講生は「全体公開(audience='all'/未設定)」か「自分に割当られた動画」のみ。
drop policy if exists spacareer_course_videos_select on public.spacareer_course_videos;
create policy spacareer_course_videos_select on public.spacareer_course_videos
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      -- スタッフ(受講生レコードを持たない)は全件閲覧可
      public.spacareer_current_customer_id() is null
      -- 受講生: 全体公開 もしくは 自分に割当られた動画のみ
      or coalesce(audience, 'all') = 'all'
      or id in (
        select va.video_id
        from public.spacareer_video_assignments va
        where va.customer_id = public.spacareer_current_customer_id()
      )
    )
  );
