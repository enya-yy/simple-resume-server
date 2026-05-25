-- Per-resume manual title lock (0 = allow auto naming, 1 = user locked).

ALTER TABLE resumes ADD COLUMN title_locked INTEGER NOT NULL DEFAULT 0;
