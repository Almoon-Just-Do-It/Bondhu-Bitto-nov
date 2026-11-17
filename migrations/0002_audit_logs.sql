CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT 'anonymous',
  actor_source TEXT NOT NULL DEFAULT 'session',
  target_user_id INTEGER REFERENCES users(id),
  target_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 200,
  outcome TEXT NOT NULL DEFAULT 'success',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outcome ON audit_logs(outcome, id DESC);
