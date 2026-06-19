# Fix Empty Article Titles — Plan Brief

> Full plan: `context/changes/article-empty-titles/plan.md`

## What & Why

Some articles on `/dashboard/articles` (and in digest e-mails) show an empty, clickable title. The
scraper pairs titles to links by global ordinal, which desyncs and stores `""`; the consumers'
`title ?? article_url` fallback only fires on `null`. We fix extraction (per-link, empty → `null`),
harden the two consumers, and backfill existing `''` rows.

## Starting Point

`scripts/scrape.ts` uses `$(titleSelector).eq(index)` to match the Nth title to the Nth link. Links
without an `h2` make the index drift, producing `""` titles stored in `articles_seen` (col is
`string | null`). `ArticlesTable.tsx` and `send.ts` already fall back to the URL — but only for `null`.

## Desired End State

New scrapes store real titles (or `null` when truly absent). The table and digest show the URL wherever
a title is missing — no blank rows. Existing `''` rows are converted to `null` so they fall back too.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Links without a title | Store with `title=null` | Don't lose articles; consumers show URL | Plan |
| Existing `''` rows | SQL migration `''→null` | Fix history without deleting data | Plan |
| Consumer hardening | Yes (`title?.trim() ? title : url`) | Robust to any future `''`/whitespace | Plan |
| Test scope | `processSource` unit only | Pure function covers the root cause cheaply | Plan |
| Selector config | No change (normalize in code) | Prod reads `SOURCES_JSON` secret — avoid a secret update | Plan |
| Extraction mechanism | Per-link `$(el).find()` + prefix-strip helper | Removes index desync; fixes `lead` too | Plan |

## Scope

**In scope:** scraper title/lead extraction fix + `null` convention; ArticlesTable + send.ts hardening;
backfill migration.

**Out of scope:** skipping/deleting rows; editing `sources.json`/`SOURCES_JSON`; UI render tests;
other sources; auto-deploy / auto-apply migration to prod.

## Architecture / Approach

Extract title/lead from within each iterated link element. A helper normalizes the configured selector
to its link-relative form (strips the `articleLink` prefix when present), so existing absolute selectors
keep working without touching the production secret. Empty → `null`. Consumers trim-check before
falling back to the URL. A one-shot SQL `UPDATE` backfills historical empties.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scraper | Per-link extraction + `null`; unit-tested | Selector normalization must stay back-compatible with the prod secret |
| 2. Consumers | Trim-aware fallback in table + digest | Trivial; ensure both spots changed |
| 3. Backfill | `''→null` migration | Touches production data → explicit consent before apply |

**Prerequisites:** none for code; Phase 3 prod apply needs DB access + consent.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Assumes links without an `h2` are acceptable to keep as `null`-title rows (they show the URL).
- Prod scraper uses the `SOURCES_JSON` secret (absolute selectors) — the helper must handle that; this
  is the main thing the unit test must lock down.
- Backfill on production is manual and gated behind explicit consent.

## Success Criteria (Summary)

- `processSource` unit test green: aligned titles, `null` on missing, works with absolute selectors.
- `/dashboard/articles` and digest show no blank rows (URL fallback where title absent).
- After backfill, `SELECT count(*) FROM articles_seen WHERE title = ''` = 0.
