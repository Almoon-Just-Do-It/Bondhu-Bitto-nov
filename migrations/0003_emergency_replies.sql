ALTER TABLE emergency_messages ADD COLUMN admin_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE emergency_messages ADD COLUMN replied_at TEXT;
ALTER TABLE emergency_messages ADD COLUMN replied_by INTEGER REFERENCES users(id);
