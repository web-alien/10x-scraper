-- digest_sent_at: NULL = artykuł nie był jeszcze wysłany w digestcie.
-- INSERT/UPDATE/DELETE na articles_seen są wyłącznie przez service_role (pomija RLS) — brak explicit policy jest intencjonalny.
ALTER TABLE articles_seen ADD COLUMN digest_sent_at timestamptz;
