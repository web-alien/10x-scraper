<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Articles Dashboard

- **Plan**: context/changes/articles-dashboard/plan.md
- **Scope**: All Phases (1–2 of 2)
- **Date**: 2026-05-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — article_url rendered as href without scheme validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ArticlesTable.tsx:104–112
- **Detail**: `article.article_url` is placed directly into `href` without scheme validation. A row with `javascript:alert(1)` or `data:` as `article_url` would execute script on click. The data comes from a scraper that indexes attacker-controlled pages, making this a realistic attack surface even if the DB is internal-only.
- **Fix**: Add a one-liner scheme guard before the href:
  ```tsx
  const safeUrl = /^https?:\/\//i.test(article.article_url)
    ? article.article_url
    : "#";
  // use safeUrl in the href
  ```
  - Strength: Eliminates the `javascript:` class entirely. Matches the pattern `sourceHostname` already uses defensively.
  - Tradeoff: Marginal — one additional regex per row render.
  - Confidence: HIGH — standard defense for user/scraper-supplied URLs.
  - Blind spot: None significant.
- **Decision**: FIXED — safeHref() helper added, href uses scheme-validated URL

---

### F2 — Generic SupabaseClient erases row-level types

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/articles.ts:3 / src/pages/dashboard/articles.astro:24
- **Detail**: `fetchArticles` accepts `SupabaseClient` (untyped generic) instead of `SupabaseClient<Database>`. The Supabase builder infers `data` as `any[]`. In `articles.astro`, `articles = data` compiles because `any` satisfies `Article[]` — TypeScript stays silent even if the `.select()` string omits a column `ArticlesTable` depends on. The bug would appear at runtime, not build time.
- **Fix A ⭐ Recommended**: Type the parameter as `SupabaseClient<Database>`
  ```ts
  // articles.ts
  import type { Database } from "@/types/supabase";
  import type { SupabaseClient } from "@supabase/supabase-js";

  export async function fetchArticles(supabase: SupabaseClient<Database>)
  ```
  Note: `createClient` in supabase.ts will also need `createServerClient<Database>(...)`.
  - Strength: Propagates full row types; any future `.select()` divergence from `Article[]` becomes a compile error.
  - Tradeoff: Requires typing `createClient` too (2-file change).
  - Confidence: HIGH — `Database` is already exported from types/supabase.ts.
  - Blind spot: `createServerClient` return type compatibility untested.
- **Fix B**: Leave as-is, add explicit cast with comment
  ```ts
  // articles.astro
  articles = data as unknown as Article[]; // SupabaseClient untyped — type gap known
  ```
  - Strength: Zero-change to supabase.ts; makes the type gap visible.
  - Tradeoff: Documents the problem rather than fixing it.
  - Confidence: LOW — paper fix only.
  - Blind spot: None (the risk stays real).
- **Decision**: PENDING

---

### F3 — Date columns sorted via localeCompare (works by coincidence)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ArticlesTable.tsx:22–27
- **Detail**: `sortArticles` uses `localeCompare` uniformly for all four columns, including `seen_at` and `digest_sent_at`. ISO 8601 strings sort lexicographically — correct today but an implicit assumption. If the stored format ever changes (timezone suffix, different precision), sort would silently break.
- **Fix**: Branch on date columns to use numeric timestamp comparison:
  ```ts
  if (column === "seen_at" || column === "digest_sent_at") {
    const aTime = aVal ? new Date(aVal).getTime() : 0;
    const bTime = bVal ? new Date(bVal).getTime() : 0;
    return direction === "asc" ? aTime - bTime : bTime - aTime;
  }
  ```
- **Decision**: PENDING

---

### F4 — fetchError && banner is fragile for empty-string errors

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/articles.astro:44
- **Detail**: `{fetchError && <Banner ...>}` — if fetchError were ever `""`, the banner would silently not render. Not a live bug (both code paths set non-empty strings or leave null), but fragile pattern.
- **Fix**: `{fetchError !== null && <Banner ...>}` — explicit null check.
- **Decision**: PENDING

---

### F5 — Back-link and glass wrapper not described in plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard/articles.astro:33–41, 46
- **Detail**: Page adds a `← Dashboard` back-link and wraps the table in a glass-morphism `<div>` — neither described in the plan. Both are benign UX additions. No functional risk.
- **Fix**: None needed — accept as additive scope.
- **Decision**: PENDING

---

### F6 — articles.astro creates a second Supabase client

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard/articles.astro:15
- **Detail**: Middleware already creates a Supabase client for auth and attaches the resolved user to Astro.locals. The page creates a second independent client for the DB query. Accepted pattern (auth client vs. data client), but not uniform with how other pages use Astro.locals.user. No functional risk given both clients use cookie-based sessions.
- **Fix**: None required. Acceptable as-is.
- **Decision**: PENDING
