-- Flamme quotidienne (streak) réservée aux comptes inscrits
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_current INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_best INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_last_date TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_total_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_recent_dates TEXT[] NOT NULL DEFAULT '{}';
