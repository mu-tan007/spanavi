-- Add filter-condition columns to call_sessions so that the per-list call
-- history panel can display which filters the caller applied at session start.
--
-- NULL means "filter was not recorded" (legacy sessions inserted before this
-- migration). An empty array [] means "caller explicitly started the session
-- with no status/prefecture filter applied". The UI uses this distinction to
-- show "絞込条件 記録なし" vs "絞込: なし".

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS status_filter text[],
  ADD COLUMN IF NOT EXISTS revenue_min   numeric,
  ADD COLUMN IF NOT EXISTS revenue_max   numeric,
  ADD COLUMN IF NOT EXISTS pref_filter   text[];
