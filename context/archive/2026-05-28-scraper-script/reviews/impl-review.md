<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Scraper Script

- **Plan**: context/changes/scraper-script/plan.md
- **Scope**: All Phases (1–2 of 2)
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — HTTP errors silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/scrape.ts:53
- **Detail**: fetch() does not check response.ok before response.text(). A 404 or 500 from the source site is treated as valid HTML, parsed by cheerio, yields 0 articles, and logged as "0 nowych, 0 duplikatów" with no indication anything went wrong.
- **Fix**: Add `if (!response.ok) throw new Error(\`HTTP \${response.status}\`);` after the fetch call. The outer try/catch already logs and continues.
- **Decision**: FIXED

### F2 — AbortController doesn't bound body read

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/scrape.ts:46–57
- **Detail**: The 10s AbortController signal only aborts the TCP connection phase. Once a server accepts the connection and starts streaming a large body, the signal is no longer checked and response.text() can hang indefinitely. Common subtle misuse of AbortController.
- **Fix A ⭐ Recommended**: Move clearTimeout after response.text() and add a comment acknowledging the large-body gap as an accepted limitation for the current use case (news front pages, manually run).
  - Strength: Zero structural change; honest about the limitation; scenario unlikely for news front pages.
  - Tradeoff: Doesn't actually fix the hang — only documents it.
  - Confidence: HIGH — for a manually-run news scraper, this tradeoff is acceptable.
  - Blind spot: If extended to arbitrary URLs, this becomes a real problem.
- **Fix B**: Wrap the entire source block (fetch + text) in Promise.race against a second timeout Promise that rejects after 15s.
  - Strength: Actually bounds total per-source time regardless of body size.
  - Tradeoff: More complex; introduces a second timer; requires restructuring the inner try/finally.
  - Confidence: MEDIUM — adds complexity that may not pay off for the current use case.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F3 — title/lead collected but never persisted

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/scrape.ts:62–90
- **Detail**: title and lead are extracted per-article and stored in the in-memory articles array, but only source_url and article_url go to the DB. articles_seen has no title/lead columns. The plan's Note section documented this as intentional. The collected-but-unused fields are technically dead code until S-02 adds storage.
- **Fix**: Remove title/lead collection (lines 65, 77–81) to keep the code honest — or add a comment tying them to the S-02 deferred plan.
- **Decision**: FIXED (added S-02 comment on articles array)

### F4 — sources.json resolved from CWD, not script location

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/scrape.ts:30
- **Detail**: readFileSync("sources.json") resolves relative to the process working directory. npm run scrape from project root works correctly. Running tsx scripts/scrape.ts directly from another directory silently fails. Acceptable for the current manual-only use case.
- **Fix**: No action needed for manual npm run scrape usage. Accept risk.
- **Decision**: ACCEPTED

### F5 — zod added to package.json without plan documentation

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:60
- **Detail**: zod ^4.4.3 was added to devDependencies during Phase 2 but not listed in the plan's "Changes Required." It was required (Zod is used in scrape.ts for config validation) but was a transitive dependency discovered at implementation time. Benign.
- **Fix**: No action needed. Accept as discovered dependency.
- **Decision**: ACCEPTED
