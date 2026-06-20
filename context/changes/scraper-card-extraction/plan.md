# Card-based Title/Lead Extraction (Scraper Regression Fix) — Implementation Plan

## Overview

Fix the regression from `article-empty-titles`: the scraper now stores all `title`/`lead` as NULL.
Extract title/lead from the **article card** (`.content--block`) instead of from inside a single link
element. One phase, test-first, on a fixture that mirrors the real parkiet.com DOM.

## Current State Analysis

- [scripts/scrape.ts](scripts/scrape.ts) extracts title/lead **inside each link** via
  `relativeSelector` + `$(el).find(...)`. Confirmed on live DOM (fetch + cheerio) that this is wrong:
  - parkiet.com: each article = a `.content--block` card with ONE `h2` and ONE `.teaser--lead` at
    card level, and TWO `.contentLink` anchors with the SAME href (image link without `h2` + title
    link with `h2`).
  - **lead** → always null: selector `.content--block .teaser--lead` doesn't start with `articleLink`,
    so it isn't stripped and `find` inside the link matches nothing.
  - **title** → always null: the image link (no `h2`, first in DOM) yields null and is inserted first;
    the title link has the same href → `ignoreDuplicates` ([scrape.ts:76](scripts/scrape.ts#L76)) drops it.
- Existing tests in [tests/scraper.test.ts](tests/scraper.test.ts) (added by `article-empty-titles`)
  asserted the link-relative behavior with an unrealistic fixture (`<a><h2>…</h2></a>`, no duplicate
  links) — false green. They must be replaced.
- `processSource(html, source, supabase)` is pure and unit-testable. Vitest `include` = `tests/**`.

## Desired End State

Each card yields ONE row with the correct `title` AND `lead` (deduped by URL via `ignoreDuplicates`).
Verified by a unit test on a real-structure fixture that fails on the current code and passes after the
fix, plus a live dry-run (in `/verify`).

### Key Discoveries

- Title/lead live at **card level**, not inside the link — extraction must scope to the card.
- The card selector is the **common leading prefix** of `articleLink`/`title`/`lead` (`.content--block`).
- Both links per card share the href; once both resolve the card's title/lead, DB dedup collapses them.
- No config/secret change needed — the container is derived in code from existing (absolute) selectors.

## What We're NOT Doing

- NOT changing `sources.json` or the `SOURCES_JSON` secret (container derived in code).
- NOT touching the database (today's NULL rows left as-is — Phase-2 hardening shows their URL).
- NOT switching iteration from links to cards (keep iterating `articleLink`, scope via `closest`).
- NOT doing rollout here (build/deploy/merge) — that's a separate, consent-gated step after `/verify`.

## Implementation Approach

For each iterated link `el`, resolve the card with `$(el).closest(container)` where `container` is the
common leading whitespace-delimited token-prefix of the configured selectors. Extract title/lead within
that card using each selector's remainder after the container prefix. Empty → `null`. Both links in a
card resolve the same card → same title/lead → `ignoreDuplicates` collapses to one row.

## Phase 1: Card-based extraction + real-DOM regression test

### Changes Required:

#### 1. Real-DOM regression test (RED first)

**File**: `tests/scraper.test.ts`

**Intent**: Replace the unrealistic link-relative tests with a fixture mirroring parkiet: a
`.content--block` card containing two `.contentLink` with the SAME href (one without `h2`, one with
`h2`) and a `.teaser--lead` at card level. Assert the resulting row has the correct title AND lead.

**Contract**: Source uses `selectors: { articleLink: ".content--block .contentLink", title:
".content--block .contentLink h2", lead: ".content--block .teaser--lead" }`. After `processSource`, the
deduped row for the card's href has `title === "<h2 text>"` and `lead === "<lead text>"` (neither null).
Test must fail on current code (both null) and pass after the fix. Inline HTML (no separate fixture file).

#### 2. Card-scoped extraction

**File**: `scripts/scrape.ts`

**Intent**: Replace link-relative extraction with card-relative. Add `commonContainer(selectors)`
(longest shared leading token prefix of articleLink/title/lead) and `relativeToContainer(sel, container)`
(strip that prefix). In the loop, scope title/lead to `$(el).closest(container)`; empty → `null`.
Remove the old link-based `relativeSelector`.

**Contract**: `commonContainer({articleLink,title,lead}): string` and
`relativeToContainer(sel, container): string` (both exported for unit reach if useful). Extraction:
`scope = container ? $(el).closest(container) : $(el); text = (rel ? scope.find(rel) : scope).first().text().trim() || null`.
`title`/`lead` stay `string | null`. Keep the "matched nothing" `console.warn`. `processSource` signature unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test` (new card-based tests + existing scraper/send/smoke)
- [ ] Lint passes: `npm run lint`
- [ ] Type-check passes: `npx tsc --noEmit`

#### Manual Verification:

- [ ] Test fails on pre-fix code (title/lead null), passes after fix (correct title+lead from card)

**Implementation Note**: After automated verification passes, pause for human confirmation. Live-site
dry-run and prod re-check happen in `/verify`; rollout (build/deploy/merge) is separate and consent-gated.

## Testing Strategy

### Unit Tests:

- `processSource` on a card fixture (2 same-href links, one without `h2`, lead at card level) →
  correct title AND lead, single deduped row.
- Keep existing tests green (valid/empty/duplicate/error cases).

### Manual Testing Steps (in /verify):

1. Live dry-run: `fetch` parkiet + cheerio → `closest('.content--block').find('.contentLink h2')` and
   `.find('.teaser--lead')` return title/lead for all 10 cards.
2. After rollout + next scrape: new `articles_seen` rows have non-null title/lead.

## References

- Change: `context/changes/scraper-card-extraction/change.md`
- Prior (regressing) change: `context/changes/article-empty-titles/`
- Core file: [scripts/scrape.ts](scripts/scrape.ts) · tests: [tests/scraper.test.ts](tests/scraper.test.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Card-based extraction + real-DOM regression test

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type-check passes: `npx tsc --noEmit`

#### Manual

- [x] 1.4 Test fails pre-fix (null), passes post-fix (correct title+lead from card)
