-- ericgabbard.com attribution store (Cloudflare D1 / SQLite)
--
-- Two tables. `links` is one row per company you send a URL to; `events` is
-- one row per time that URL was touched. Deliberately no IP address column:
-- country comes from Cloudflare's edge and is as far as this goes.

CREATE TABLE IF NOT EXISTS links (
  code       TEXT PRIMARY KEY,
  company    TEXT NOT NULL,
  role       TEXT,
  channel    TEXT,              -- where you pasted it: "Greenhouse", "LinkedIn DM"
  notes      TEXT,
  dest       TEXT,              -- where it lands; NULL means the homepage
  created_at TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  code     TEXT NOT NULL REFERENCES links(code) ON DELETE CASCADE,
  kind     TEXT NOT NULL,       -- 'click' = link was followed
                                -- 'view'  = a real browser rendered a page
  path     TEXT,
  ts       TEXT NOT NULL,       -- ISO 8601, UTC
  country  TEXT,
  device   TEXT,                -- 'mobile' | 'desktop'
  ua       TEXT,
  referrer TEXT,
  is_bot   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_code_ts ON events (code, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind    ON events (kind, is_bot);
