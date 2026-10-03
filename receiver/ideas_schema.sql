-- Private store for the ratings page's "share an experience or a question" form (Cloudflare D1, bound as IDEAS_DB).
-- One row per submission; submission_id makes a retry of the same text land once (functions/api/ideas.js).
-- No IP address, browser details or cookies are kept. SQLite's length() counts characters, as the page does.
CREATE TABLE IF NOT EXISTS ideas (
  submission_id TEXT PRIMARY KEY,
  scenario      TEXT NOT NULL CHECK (length(scenario) BETWEEN 1 AND 3000),
  focus         TEXT NOT NULL DEFAULT '' CHECK (length(focus) <= 500),
  language      TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  copy_revision TEXT NOT NULL,
  received_at   TEXT NOT NULL
);
