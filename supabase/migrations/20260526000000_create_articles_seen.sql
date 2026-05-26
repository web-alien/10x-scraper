CREATE TABLE articles_seen (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url  text        NOT NULL,
  article_url text        NOT NULL,
  seen_at     timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT articles_seen_source_article_unique UNIQUE (source_url, article_url)
);

ALTER TABLE articles_seen ENABLE ROW LEVEL SECURITY;

-- authenticated może SELECT (przyszłe zapytania admina); anon zablokowany domyślnie
-- service_role pomija RLS automatycznie — nie wymaga jawnej polityki
CREATE POLICY "authenticated can select"
  ON articles_seen FOR SELECT TO authenticated USING (true);
