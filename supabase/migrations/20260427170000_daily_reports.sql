-- Daily Report テーブル + 個人別 Library カード並び順
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  team_name     text,
  report_date   date NOT NULL,
  payload       jsonb NOT NULL,
  feedback      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, team_id, report_date)
);

CREATE INDEX IF NOT EXISTS daily_reports_org_engagement_date_idx
  ON public.daily_reports (org_id, engagement_id, report_date DESC);
CREATE INDEX IF NOT EXISTS daily_reports_team_date_idx
  ON public.daily_reports (team_id, report_date DESC);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_reports_select_own_org ON public.daily_reports;
CREATE POLICY daily_reports_select_own_org
  ON public.daily_reports FOR SELECT
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS daily_reports_update_feedback ON public.daily_reports;
CREATE POLICY daily_reports_update_feedback
  ON public.daily_reports FOR UPDATE
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

DROP TRIGGER IF EXISTS daily_reports_set_updated_at ON public.daily_reports;
CREATE TRIGGER daily_reports_set_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.library_card_order (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_order text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.library_card_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lib_card_order_self ON public.library_card_order;
CREATE POLICY lib_card_order_self
  ON public.library_card_order FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
