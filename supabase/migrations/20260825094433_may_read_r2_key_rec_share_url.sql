-- 録音URLの新しい形（rec 共有URL）に権限判定を対応させる
-- ---------------------------------------------------------------------------
-- 2026-08-25。アポ取得報告に貼る録音URLを、押せば再生できる形に変えた。
--   旧 .../storage/v1/object/public/recordings/<鍵>   非公開化以降、開くと400
--   新 .../functions/v1/rec/<鍵>?s=<署名>             押せばR2へ転送される
-- どちらも「鍵の入れ物」。may_read_r2_key が旧形式しか見ていないと、
-- 新しく保存した録音は社内でもクライアントポータルでも弾かれる。

create or replace function public.r2_recording_key(p_url text)
returns text
language sql
immutable
parallel safe
as $function$
  select case
    when p_url is null then null
    when position('/public/recordings/' in p_url) > 0
      then split_part(split_part(p_url, '/public/recordings/', 2), '?', 1)
    when position('/functions/v1/rec/' in p_url) > 0
      then split_part(split_part(p_url, '/functions/v1/rec/', 2), '?', 1)
    else null
  end;
$function$;

comment on function public.r2_recording_key(text) is
  '録音URL（旧・公開URL / 新・rec共有URL）からR2の鍵を取り出す。どちらも鍵の入れ物。';

-- ⚠️ この関数は録音を再生するたびに呼ばれる。
--    call_records は14.8万行あるので、行ごとに r2_recording_key を呼ぶと1回400msかかる。
--    鍵はファイル名なので、まず「その文字列を含む行」に絞ってから正確に突き合わせる。
--    絞り込みは新旧どちらのURLの形でも効く。
-- ⚠️ 入口は3つある（users / members / clients）。members が実務上の正。
--    ここを1つに決めつけると、稼働中の大半を締め出す（2026-08-24 に実際にやった）。
create or replace function public.may_read_r2_key(p_uid uuid, p_kind text, p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (   -- 社内の人。所属は users と members の両方から集める
    select org_id from users   where id = p_uid      and org_id is not null
    union
    select org_id from members where user_id = p_uid and org_id is not null
  ),
  cl as (        -- クライアントポータルの人
    select id, org_id from clients where auth_user_id = p_uid
  )
  select case p_kind
    when 'recordings' then
      -- 社内：自分の組織の録音なら、架電のものでもアポのものでも聞ける
      exists (select 1 from call_records r
               where r.org_id in (select org_id from me)
                 and r.recording_url like '%' || p_key || '%'
                 and r2_recording_key(r.recording_url) = p_key)
      or exists (select 1 from appointments a
                  where a.org_id in (select org_id from me)
                    and a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
      -- クライアント：自分の架電リストのぶんだけ
      or exists (select 1 from call_records r
                   join call_lists l on l.id = r.list_id
                   join cl on cl.id = l.client_id and cl.org_id = r.org_id
                  where r.recording_url like '%' || p_key || '%'
                    and r2_recording_key(r.recording_url) = p_key)
      -- クライアント：自分のアポのぶんだけ
      or exists (select 1 from appointments a
                   join cl on cl.id = a.client_id and cl.org_id = a.org_id
                  where a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
    when 'spacareer' then exists (
      select 1 from spacareer_session_videos v
       where v.org_id in (select org_id from me)
         and (v.storage_path = p_key or v.audio_storage_path = p_key))
    else false
  end;
$function$;
