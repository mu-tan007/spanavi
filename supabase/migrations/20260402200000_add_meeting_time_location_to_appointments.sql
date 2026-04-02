ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_time TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_location TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
