<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Bootstrap — Critical Path

- **Plan**: context/changes/testing-bootstrap-critical-path/plan.md
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-06-05
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical  5 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — HTML injection in email body

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: scripts/send.ts:38–48
- **Detail**: Article title, lead, and article_url values are interpolated directly into the HTML email body without escaping. Any `<`, `>`, or `&` in a scraped title breaks HTML structure; a malicious value already in the database renders as HTML in subscriber inboxes — stored XSS / email injection vector.
- **Fix A ⭐ Recommended**: Add a minimal HTML-encoding helper and apply to all user-supplied values.
  - Approach: `const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");` Apply to titleText, lead, and display text of article_url.
  - Strength: Self-contained, no new dependency. Closes the injection class at the only rendering point.
  - Tradeoff: Display text of links changes for entities like `&amp;`, but that's correct HTML behavior.
  - Confidence: HIGH — standard pattern with no ambiguity.
  - Blind spot: Does not validate href scheme (see F2).
- **Fix B**: Switch to an HTML templating library (e.g. `html-entities`)
  - Approach: Install `html-entities`, use `encode()` on all user values.
  - Strength: More comprehensive, handles edge cases.
  - Tradeoff: Adds a dependency; overkill for this simple template.
  - Confidence: MED — increases surface area without proportional gain.
  - Blind spot: Still needs F2 fix for href validation.
- **Decision**: FIXED

### F2 — Unvalidated href in email links

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: scripts/send.ts:43–46
- **Detail**: `article.article_url` is interpolated directly into `href="..."` with no scheme validation. A `javascript:` URL stored in the database produces a clickable phishing link in subscriber email — exploitable via any article in the scraper's feed.
- **Fix**: Before building the template, filter articles to those whose `article_url` starts with `https://` or `http://`. Skip or log (console.warn) any others.
  - Strength: One guard covers all future articles. Consistent with the `processSource` refactor that already validates URLs via `new URL()` resolution.
  - Tradeoff: Legitimate articles with unusual schemes silently disappear — log the skip so it's visible.
  - Confidence: HIGH — URL scheme validation is standard practice.
  - Blind spot: Doesn't prevent `data:` URIs; add to the allowlist check.
- **Decision**: FIXED

### F3 — Serial subscriber send loop

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Performance)
- **Location**: scripts/send.ts:51–64
- **Detail**: Subscriber emails are sent one-at-a-time in a `for...of` loop. Total latency scales linearly with subscriber count. At 100 subscribers and ~200ms/send, digest takes ~20 seconds. Resend's API supports concurrent calls.
- **Fix A ⭐ Recommended**: Replace the loop with `Promise.allSettled` over all sends, then count rejected/errored results.
  - Strength: Same `failedCount` semantics, all sends in parallel. Directly improves cron wall-clock time.
  - Tradeoff: All sends fire simultaneously — at very high subscriber counts this could hit Resend's rate limit. Acceptable for current scale.
  - Confidence: HIGH — existing mock in send.test.ts is already async and works with either approach.
  - Blind spot: Resend rate limits not documented in this repo.
- **Fix B**: Keep serial loop, add a note about known perf ceiling.
  - Strength: Zero risk, zero complexity.
  - Tradeoff: Latency grows unbounded as subscriber list grows.
  - Confidence: MED — fine for MVP scale.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — Title selector fragility (surfaced by refactor)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: scripts/scrape.ts:35–59
- **Detail**: `source.selectors.title` uses a document-global selector + index to correlate titles with links. If the document has a different count of title vs link elements, the index mapping silently produces wrong or undefined titles. Pre-existing issue exposed by the now-testable function.
- **Fix**: Scope title/lead selectors to the article link's parent container when configured, or add a console.warn when `$(titleSel).eq(index)` returns an empty selection.
  - Strength: Prevents silent wrong-title bugs; function is now tested so a regression would be caught.
  - Tradeoff: Selector config format may need extending — verify against sources.json.
  - Confidence: MED — depends on actual structure of sources.json.
  - Blind spot: Haven't checked if any live source relies on the global-index pattern for correct titles.
- **Decision**: FIXED

### F5 — vitest pinned to "latest"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:66
- **Detail**: `"vitest": "latest"` resolves at install time; a future `npm ci` can silently pull a new major version with breaking API changes. All other devDependencies use pinned semver ranges.
- **Fix**: Run `npm ls vitest` to get the installed version, then use `"vitest": "^X.Y.Z"` in package.json.
- **Decision**: FIXED

### F6 — Extra unplanned test in scraper.test.ts (ACCEPTED)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/scraper.test.ts:56–67
- **Detail**: A third test — "Supabase error: throws instead of returning zero counts" — was added beyond the two planned tests. It covers the `if (error) throw` path in scrape.ts (a real bug fix). The test is correct and useful but was not in the plan.
- **Fix**: Acknowledge as accepted scope creep — no removal needed; accept as-is.
- **Decision**: ACCEPTED

### F7 — Pending manual check 1.2 (clean-shell test)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress §Phase 1 Manual
- **Detail**: Check 1.2 (`npm test` in clean shell without .env does not crash) remains unchecked across all sessions.
- **Fix**: Run `npm test` in a shell without .env loaded, confirm exit 0, flip 1.2 in Progress.
- **Decision**: FIXED

### F8 — Mock doesn't cover deduplication count

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/scraper.test.ts:25
- **Detail**: The Supabase mock always returns all rows as inserted. The `duplicateCount` calculation is never exercised against a shorter `data` array — a regression in that calculation would not be caught.
- **Fix**: Add a test case where the mock returns fewer rows than upserted, assert `duplicateCount > 0`.
- **Decision**: FIXED
