-- CW送信ツール（crowdworks-admin GET /api/workers）用：重複よけの送信済みIDを1回で全部返す。
-- PostgREST の1000行上限で先頭1000件しか返らず、ボット間の重複よけが効いていなかった。
-- status='failed'（送信ボタンを押す前に失敗＝届いていない）は再送できるよう除く。
create or replace function public.cw_sent_worker_ids(p_since timestamptz)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(worker_id), '{}')
    from cw_sent_workers_global
   where sent_at >= p_since
     and coalesce(status, 'sent') = 'sent'
$$;
revoke all on function public.cw_sent_worker_ids(timestamptz) from public, anon, authenticated;
