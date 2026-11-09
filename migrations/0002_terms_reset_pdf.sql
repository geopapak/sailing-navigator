-- Terms/GDPR acceptance, admin-handled password resets, PDF import quota.
ALTER TABLE users ADD COLUMN terms_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN terms_at INTEGER;
ALTER TABLE users ADD COLUMN marketing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reset_requested_at INTEGER;
ALTER TABLE users ADD COLUMN pdf_used INTEGER NOT NULL DEFAULT 0;
