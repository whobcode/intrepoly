-- Email logs table for tracking inbound emails
CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_addr TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT,
    action TEXT NOT NULL,  -- 'noreply', 'signin', 'signup', 'support', 'info', 'contact', 'catch-all'
    status TEXT NOT NULL,  -- 'received', 'forwarded', 'rejected', 'rate_limited'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying recent emails
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);

-- Index for querying by action type
CREATE INDEX IF NOT EXISTS idx_email_logs_action ON email_logs(action);

-- Index for querying by sender
CREATE INDEX IF NOT EXISTS idx_email_logs_from ON email_logs(from_addr);
