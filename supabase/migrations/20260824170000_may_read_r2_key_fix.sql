-- 録音の読み出し許可。R2へ移してから、ここが唯一の関門になっている。
--
-- ⚠️ 2026-08-24、この関数に3つ穴が見つかった。どれも「録音が一切聞けない」形で出る。
--   ① 所属を `users` からしか引いていなかった
--      → 稼働中47人のうち44人は `members.user_id` にしか居らず、全員が不許可。
--   ② クライアントポータルの人を見ていなかった
--      → ポータル発行済み28社が全員不許可。クライアントは `clients.auth_user_id` で入る。
--   ③ 鍵の出どころを `call_records` しか見ていなかった
--      → アポの録音407本は社内の人でも不許可だった。
--
-- ⚠️ クライアントには**自分の案件のぶんだけ**渡す。
--    組織で括ると他社の録音まで聞けてしまう。絞りは call_records / appointments の
--    RLS（call_records_select_client / appointments_select_client）と同じにしてある。
--    片方だけ広げると、画面には出ないのに鍵だけ通る、という食い違いが生まれる。
create or replace function public.may_read_r2_key(p_uid uuid, p_kind text, p_key text)
returns boolean
language sql stable security definer set search_path to 'public' as $function$
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
                 and r.recording_url like '%/public/recordings/%'
                 and split_part(r.recording_url, '/public/recordings/', 2) = p_key)
      or exists (select 1 from appointments a
                  where a.org_id in (select org_id from me)
                    and a.recording_url like '%/public/recordings/%'
                    and split_part(a.recording_url, '/public/recordings/', 2) = p_key)
      -- クライアント：自分の架電リストのぶんだけ
      or exists (select 1 from call_records r
                   join call_lists l on l.id = r.list_id
                   join cl on cl.id = l.client_id and cl.org_id = r.org_id
                  where r.recording_url like '%/public/recordings/%'
                    and split_part(r.recording_url, '/public/recordings/', 2) = p_key)
      -- クライアント：自分のアポのぶんだけ
      or exists (select 1 from appointments a
                   join cl on cl.id = a.client_id and cl.org_id = a.org_id
                  where a.recording_url like '%/public/recordings/%'
                    and split_part(a.recording_url, '/public/recordings/', 2) = p_key)
    when 'spacareer' then exists (
      select 1 from spacareer_session_videos v
       where v.org_id in (select org_id from me)
         and (v.storage_path = p_key or v.audio_storage_path = p_key))
    else false
  end;
$function$;
