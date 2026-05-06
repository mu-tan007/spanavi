-- analyze-roleplay の Edge Function 内 Slack 通知が、background task 終端で
-- ワーカー打ち切りに遭い post-roleplay-to-slack に到達しない事故が再発したため、
-- ai_status='done' 遷移時に DB trigger + pg_net で確実に通知する。

CREATE OR REPLACE FUNCTION public.notify_slack_on_roleplay_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_member_name text;
  v_member_team text;
  v_payload jsonb;
BEGIN
  IF (OLD.ai_status IS DISTINCT FROM NEW.ai_status AND NEW.ai_status = 'done') THEN
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
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := v_payload
    );
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_notify_slack_on_roleplay_done ON public.roleplay_sessions;

CREATE TRIGGER trg_notify_slack_on_roleplay_done
AFTER UPDATE OF ai_status ON public.roleplay_sessions
FOR EACH ROW
EXECUTE FUNCTION public.notify_slack_on_roleplay_done();
