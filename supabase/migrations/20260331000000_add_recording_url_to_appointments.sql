-- Add recording_url column to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Backfill from appo_report text
UPDATE appointments
SET recording_url = (regexp_match(appo_report, '録音URL[：:]\s*(https?://\S+)'))[1]
WHERE recording_url IS NULL
  AND appo_report IS NOT NULL
  AND appo_report ~ '録音URL[：:]';
