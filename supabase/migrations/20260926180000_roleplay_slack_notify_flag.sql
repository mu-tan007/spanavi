-- ロープレの Slack 完了通知を行ごとに止められるようにする。
-- 既定は通知する（従来どおり）。過去分をまとめて登録するときだけ false で入れ、
-- 何十件もの完了通知がチャンネルに流れないようにする（2026-09-26 Slack「ロープレ録画格納庫」の遡り登録）
set lock_timeout = '5s';

alter table public.roleplay_sessions
  add column if not exists slack_notify boolean not null default true;

-- 本体は本番で動いている版（Authorization/apikey 付き）をそのまま使い、条件に slack_notify を足しただけ
CREATE OR REPLACE FUNCTION public.notify_slack_on_roleplay_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_member_name text;
  v_member_team text;
  v_payload jsonb;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g';
BEGIN
  IF (OLD.ai_status IS DISTINCT FROM NEW.ai_status AND NEW.ai_status = 'done' AND NEW.slack_notify) THEN
    SELECT name, team
      INTO v_member_name, v_member_team
      FROM public.members
     WHERE user_id = NEW.user_id
     LIMIT 1;

    IF v_member_team IS NULL OR v_member_team = '' THEN
      RAISE NOTICE 'notify_slack_on_roleplay_done: team missing for user %', NEW.user_id;
      RETURN NEW;
    END IF;

    v_payload := jsonb_build_object(
      'memberName',  v_member_name,
      'memberTeam',  v_member_team,
      'partnerName', NEW.partner_name,
      'sessionDate', NEW.session_date,
      'aiFeedback',  NEW.ai_feedback,
      'videoUrl',    NEW.video_url
    );

    PERFORM net.http_post(
      url     := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/post-roleplay-to-slack',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon_key,
        'apikey',        v_anon_key
      ),
      body    := v_payload
    );
  END IF;

  RETURN NEW;
END;
$function$;
