-- Backfill: align historical empty titles with the null convention.
-- The scraper used to store "" (and whitespace-only) titles; consumers fall back to the
-- article URL only on NULL. Convert existing empty/whitespace titles to NULL so they
-- render the URL instead of a blank row. Idempotent; no schema change.
UPDATE articles_seen
SET title = NULL
WHERE trim(title) = '';
