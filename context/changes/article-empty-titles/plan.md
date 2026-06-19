# Fix Empty Article Titles — Implementation Plan

## Overview

Some articles on `/dashboard/articles` (and in digest e-mails) render with an empty title. Root cause
is in the scraper: it pairs each link to a title by **global ordinal** (`$(titleSelector).eq(index)`),
which desyncs when the link selector matches more elements than the title selector. Empty results are
stored as `""`, and both consumers use `title ?? article_url`, whose fallback only fires on `null`.
This plan fixes extraction (title/lead taken **relative to each link**, empty → `null`), hardens the
two consumers against empty/whitespace, and backfills existing `''` rows to `null`.

## Current State Analysis

- [scripts/scrape.ts:36](scripts/scrape.ts#L36) — `const title = source.selectors.title ? $(source.selectors.title).eq(index).text().trim() : $(el).text().trim();`
  Global `.eq(index)` assumes the Nth title matches the Nth link. On parkiet.com some `.contentLink`
  elements have no `h2`, so titles desync and run out → `title = ""`.
- [scripts/scrape.ts:53](scripts/scrape.ts#L53) — `lead` uses the **same** `.eq(index)` pattern (same latent bug).
- Column `articles_seen.title` is `string | null` ([src/types/supabase.ts:25](src/types/supabase.ts#L25)),
  but scraper writes `""` (the `articles`/`dbRows` types force `title: string`).
- Consumers already expect missing titles via fallback, but only for `null`:
  [ArticlesTable.tsx:103](src/components/ArticlesTable.tsx#L103) `{article.title ?? article.article_url}`,
  [send.ts:58](scripts/send.ts#L58) `esc(article.title ?? article.article_url)`.
- `processSource(html, source, supabase)` is a **pure, exported** function — directly unit-testable.
- Existing `''` rows persist: upsert uses `ignoreDuplicates` ([scrape.ts:76](scripts/scrape.ts#L76)).
- Production scraper runs from `.github/workflows/daily-digest.yml`, which writes selectors from the
  **`SOURCES_JSON` secret** (not the local `sources.json`). → The fix MUST keep working with the
  existing (absolute) selector config so no secret update is required.

## Desired End State

- New scrapes: each link's title/lead extracted from within that link element; when truly absent,
  stored as `null` (never `""`).
- `/dashboard/articles` and digest: no blank rows — where a real title is missing, the URL shows.
- Existing `''` rows converted to `null` (backfill), so current blank rows also fall back to URL.
- `processSource` covered by a unit test proving alignment + `null`-on-missing, including links without
  a title element. No production secret change needed.

### Key Discoveries

- Fix must be **backward-compatible with absolute selectors** (prod reads `SOURCES_JSON` secret) →
  normalize the configured selector to a link-relative one instead of requiring a config edit.
- `lead` shares the identical `.eq(index)` bug; the same relative-extraction helper fixes both.
- Consumers' `?? article_url` was designed for missing titles — aligning data to `null` makes it work,
  and trim-hardening makes it robust to any future `''`.

## What We're NOT Doing

- NOT skipping/dropping links without a title (decision: keep them with `title=null`).
- NOT deleting existing rows (decision: backfill `''→null`, not DELETE).
- NOT editing `sources.json` or the `SOURCES_JSON` secret (the helper makes selectors work as-is).
- NOT adding React/UI render tests (decision: unit-test `processSource` only).
- NOT changing scraping for any other source/site beyond the shared extraction code path.
- NOT auto-deploying or auto-applying the migration to production (separate explicit consent).

## Implementation Approach

Extract title/lead **relative to the iterated link element** (`$(el).find(<relative>)`). A small helper
normalizes a configured selector to its link-relative form: if the selector begins with the
`articleLink` selector, strip that prefix (e.g. `.content--block .contentLink h2` → `h2`); otherwise use
it as-is, scoped under `el`. Empty results become `null`. This eliminates the global-index desync,
fixes `lead` for free, and works with both absolute (current secret) and relative configs. Then harden
the two consumers and backfill the historical `''` rows.

## Critical Implementation Details

- **Backward compatibility is load-bearing:** production selectors come from the `SOURCES_JSON` secret
  and are absolute. The normalization helper must turn the existing absolute title/lead selectors into
  correct link-relative `.find()` queries, so prod keeps working without touching the secret.

## Phase 1: Scraper — relative extraction + null convention

### Overview

Replace global-index title/lead pairing with link-relative extraction; store `null` for empty. Pure
function → test-first.

### Changes Required:

#### 1. Relative-selector helper + extraction

**File**: `scripts/scrape.ts`

**Intent**: Stop using `$(selector).eq(index)`; for each link `el`, find its title/lead within `el`.
Add a helper that converts a configured selector to a link-relative one (strip the `articleLink`
prefix if present). Store `null` when the extracted text is empty.

**Contract**: New helper `relativeSelector(selector: string, articleLink: string): string` — returns
`selector` with a leading `articleLink` prefix removed and trimmed, else `selector` unchanged.
In `processSource`, title becomes `$(el).find(relativeSelector(source.selectors.title, source.selectors.articleLink)).first().text().trim() || null` (and the no-title-selector branch `$(el).text().trim() || null`); `lead` analogous. The `articles` array and `dbRows` element types change `title`/`lead` from `string` to `string | null`. Keep the "matched nothing" `console.warn`. `processSource` signature and return shape unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` (new `scripts/scrape.test.ts` covering `processSource`)
- Lint passes: `npm run lint`
- Type-check passes: `npx astro sync && npx tsc --noEmit` (or the project's check)

#### Manual Verification:

- Test asserts: links WITH a title → correct aligned title; links WITHOUT one → `null` (not `""`);
  no index desync when title-count < link-count.

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Harden consumers against empty/whitespace titles

### Overview

Make the table and digest treat empty/whitespace titles as missing, independent of the scraper.

### Changes Required:

#### 1. Article table cell

**File**: `src/components/ArticlesTable.tsx`

**Intent**: Replace `title ?? article_url` so empty/whitespace also falls back to the URL.

**Contract**: Cell renders `article.title?.trim() ? article.title : article.article_url` at
[ArticlesTable.tsx:103](src/components/ArticlesTable.tsx#L103). (Sort logic already null-safe.)

#### 2. Digest title text

**File**: `scripts/send.ts`

**Intent**: Same trim-aware fallback for the e-mail link text.

**Contract**: `const titleText = esc(article.title?.trim() ? article.title : article.article_url);` at
[send.ts:58](scripts/send.ts#L58).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type-check passes: project check

#### Manual Verification:

- Locally `/dashboard/articles`: rows with empty/whitespace title show the URL, none blank.

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Backfill existing empty titles

### Overview

Convert historical `''` titles to `null` so existing rows benefit from the fallback.

### Changes Required:

#### 1. Backfill migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_backfill_null_article_titles.sql`

**Intent**: One-shot data fix; align stored empties with the `null` convention.

**Contract**: `UPDATE articles_seen SET title = NULL WHERE title = '';` (idempotent; no schema change).

### Success Criteria:

#### Automated Verification:

- Migration file exists and is valid SQL: `ls supabase/migrations/*backfill_null_article_titles.sql`

#### Manual Verification:

- Applied to the target DB **with explicit consent**; afterwards
  `SELECT count(*) FROM articles_seen WHERE title = '';` returns 0.
- `/dashboard/articles` (after deploy) shows no blank rows for previously-empty titles.

**Implementation Note**: Applying to production touches live data — do NOT run without explicit user
consent. Local apply needs Docker + `npx supabase start`; prod needs `supabase link` + `db push`.

---

## Testing Strategy

### Unit Tests:

- `processSource` with crafted HTML where some `.contentLink` have an `h2` and some don't:
  - titles align 1:1 with their own link (no global-index drift),
  - missing title/lead → `null` (never `""`),
  - absolute selector config (e.g. `.content--block .contentLink h2`) resolves correctly via the helper.

### Manual Testing Steps:

1. Run the scraper locally against a saved/sample page; confirm DB rows have real titles or `null`.
2. Open `/dashboard/articles`; verify no blank rows (URL shown where title absent).
3. Inspect a digest render; verify no empty `<a>` link text.

## Migration Notes

- Backfill is data-only and idempotent. Existing rows are immutable via the scraper (`ignoreDuplicates`),
  so the migration is the only way to fix history without deleting.

## References

- Change: `context/changes/article-empty-titles/change.md`
- Core file: [scripts/scrape.ts](scripts/scrape.ts) · consumers: [ArticlesTable.tsx](src/components/ArticlesTable.tsx), [send.ts](scripts/send.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Scraper — relative extraction + null convention

#### Automated

- [x] 1.1 Unit tests pass: `npm test` (tests added to `tests/scraper.test.ts` — vitest `include` is `tests/**`) — 0b3b2d2
- [x] 1.2 Lint passes: `npm run lint` — 0b3b2d2
- [x] 1.3 Type-check passes — 0b3b2d2

#### Manual

- [x] 1.4 Test asserts alignment + `null`-on-missing + no index desync — 0b3b2d2

### Phase 2: Harden consumers against empty/whitespace titles

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Type-check passes

#### Manual

- [ ] 2.3 `/dashboard/articles` locally: empty/whitespace titles show URL, none blank

### Phase 3: Backfill existing empty titles

#### Automated

- [ ] 3.1 Migration file exists and is valid SQL

#### Manual

- [ ] 3.2 Applied to DB with consent; `count(*) WHERE title=''` = 0
- [ ] 3.3 `/dashboard/articles` shows no blank rows for previously-empty titles
