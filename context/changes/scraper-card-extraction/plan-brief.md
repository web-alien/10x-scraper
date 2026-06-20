# Card-based Title/Lead Extraction — Plan Brief

> Full plan: `context/changes/scraper-card-extraction/plan.md`

## What & Why

Fix a regression from `article-empty-titles`: the scraper stores all `title`/`lead` as NULL. Root cause
(confirmed on the live parkiet.com DOM): title/lead live at the **article-card** level, not inside the
link element the scraper extracts from. We re-scope extraction to the card.

## Starting Point

`scripts/scrape.ts` extracts title/lead with `$(el).find(...)` inside each `.contentLink`. On parkiet,
each card (`.content--block`) has one `h2`+`.teaser--lead` at card level and two same-href links (image
+ title). So lead never matches, and the image link's NULL title wins the dedup → all NULL.

## Desired End State

Each card produces one row with the correct title AND lead. A unit test on a real-structure fixture
fails on today's code and passes after the fix; a live dry-run confirms extraction on the real page.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Extraction scope | Card via `closest(container)` | Title/lead are card-level, not in the link | Plan |
| Container source | Derived in code (common selector prefix) | Avoid touching `sources.json`/`SOURCES_JSON` secret | User |
| Today's NULL rows | Leave as-is | Phase-2 hardening shows their URL; future scrapes correct | User |
| Test scope | `processSource` unit on real-DOM fixture | Pure function; the wrong fixture caused this regression | User |
| Iteration unit | Keep iterating links + `closest` | Minimal change; dedup collapses the pair | Plan |

## Scope

**In scope:** card-scoped title/lead extraction in `scrape.ts`; real-DOM regression test replacing the
unrealistic one.

**Out of scope:** config/secret changes; DB cleanup; switching to card iteration; rollout (deploy/merge).

## Architecture / Approach

For each link, `card = $(el).closest(container)` where `container` = common leading token-prefix of the
selectors (`.content--block`); title/lead = `card.find(selectorRemainder)`, empty → `null`. Both links
in a card resolve the same card; `ignoreDuplicates` collapses the pair by URL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Card extraction + test | Correct title/lead from cards, proven by real-DOM test | Container derivation must match real selector shapes |

**Prerequisites:** none (code-only).
**Estimated effort:** ~1 short session (2 files).

## Open Risks & Assumptions

- Assumes selectors share a clean leading container prefix; fallback to `$(el)` if none derived.
- Real verification needs the live page (`/verify` dry-run) — the unit fixture must mirror it faithfully.

## Success Criteria (Summary)

- Unit test: card fixture → correct non-null title+lead; fails pre-fix, passes post-fix.
- `npm test` green, lint 0, tsc 0.
- Live dry-run (in `/verify`): title/lead resolved for all cards on real parkiet.com.
