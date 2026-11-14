CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','member')),
  active INTEGER NOT NULL DEFAULT 1,
  account_no TEXT,
  father_name TEXT NOT NULL DEFAULT '',
  mother_name TEXT NOT NULL DEFAULT '',
  nominee_name TEXT NOT NULL DEFAULT '',
  nid TEXT NOT NULL DEFAULT '',
  nominee_nid TEXT NOT NULL DEFAULT '',
  profile_photo TEXT NOT NULL DEFAULT '',
  nid_photo TEXT NOT NULL DEFAULT '',
  nominee_nid_photo TEXT NOT NULL DEFAULT '',
  own_signature TEXT NOT NULL DEFAULT '',
  nominee_signature TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_no ON users(account_no) WHERE account_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL CHECK(amount > 0),
  kisti_month TEXT NOT NULL,
  paid_date TEXT NOT NULL,
  method TEXT DEFAULT 'Cash',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  recorded_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved')),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(kisti_month);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_mime TEXT,
  image_data BLOB,
  file_name TEXT,
  file_mime TEXT,
  file_data BLOB,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notices_created ON notices(created_at);

CREATE TABLE IF NOT EXISTS emergency_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '',
  image_mime TEXT,
  image_data BLOB,
  file_name TEXT,
  file_mime TEXT,
  file_data BLOB,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_emergency_status ON emergency_messages(status,created_at);
