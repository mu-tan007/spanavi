set local search_path = public, extensions;

-- ============================================================
-- ロープレSlack通知トリガー Authorizationヘッダー修正 (2026-05-18)
-- ------------------------------------------------------------
-- 2026-05-06 に追加した trg_notify_slack_on_roleplay_done が
-- pg_net で post-roleplay-to-slack を呼ぶ際に Authorization ヘッダーを
-- 付けておらず、Edge Function が verify_jwt=true 状態にあったため
-- 401 UNAUTHORIZED_NO_AUTH_HEADER で全件サイレントに弾かれていた。
--
-- 証跡: 2026-05-18 08:04 にdone遷移 → 08:06:45 pg_net response 401。
-- 既存 kick_sheet_sync / notify-pre-check-daily と同じパターンで
-- anon key を Authorization と apikey に直書きする（公開キー）。
-- verify_jwt 設定の変動にも強くなる。
-- ============================================================

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
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g';
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
$func$;
