<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Email Digest Script Implementation Plan

- **Plan**: context/changes/email-digest-script/plan.md
- **Scope**: All phases (1 + 2 of 2)
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical  0 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — XSS in HTML email body (unescaped scraped fields)

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/send.ts:66–76
- **Detail**: article.title, article.lead, article.article_url, and hostname are interpolated directly into HTML with no escaping. Scraped titles commonly contain characters like <, >, &, and " — e.g. "CEO: „Wyniki > oczekiwań"" will produce broken HTML. A crafted lead of </p><script>…</script> can inject executable content into permissive email clients. The attack surface requires either a compromised scraper source or a bad actor inserting rows into articles_seen, but the article data is fully attacker-controlled.
- **Fix**: Add a one-liner escHtml helper and apply it to all four interpolation points (titleText, article.lead, article_url in the href attribute, and hostname in the <h2>):
  ```typescript
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
     .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  ```
  - Strength: Eliminates the injection class entirely; 6-line change. Href-attribute escaping also prevents URL injection via " in article_url.
  - Tradeoff: Minimal — helper + 4 call sites. Email rendering unaffected for well-formed scraped data.
  - Confidence: HIGH — standard HTML escaping, no external dep.
  - Blind spot: Does not sanitize JavaScript pseudo-URLs (javascript:...) in article_url href; that would require a URL scheme allowlist.
- **Decision**: PENDING

### F2 — Import order diverges from scrape.ts reference template

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/send.ts:1–5
- **Detail**: scrape.ts order: dotenv → fs → third-party → zod → internal. send.ts order: dotenv → fs → internal → resend → zod. Internal import placed before third-party.
- **Fix**: Move the @/lib/supabase-script import after the resend import.
- **Decision**: PENDING

### F3 — Relative path for subscribers.json (matches scrape.ts pattern)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/send.ts:24
- **Detail**: readFileSync("subscribers.json") resolves relative to process.cwd(). If the script is invoked from a directory other than the project root, it silently fails. scrape.ts has the same issue — this is a shared latent hazard, not new here, and npm run send always sets cwd correctly.
- **Fix**: Use `new URL("../subscribers.json", import.meta.url)` or `path.resolve(import.meta.dirname, "../subscribers.json")` to make the path invariant to cwd.
- **Decision**: PENDING

### F4 — Unbounded Supabase query (no LIMIT)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/send.ts:39–44
- **Detail**: The query has a 24 h cutoff guard but no LIMIT. A busy scraper day could fetch hundreds of rows into memory and embed all of them into every email. Benign at current scale (~15 articles in live test).
- **Fix**: Add `.limit(200)` to the query; log a warning if articles.length === 200 to signal truncation.
- **Decision**: PENDING

## Note: Failed-send stamping is intentional

The plan's "Critical Implementation Details" explicitly states: "mark ALL queried articles as sent — regardless of per-subscriber Resend errors." This is Plan Adherence: MATCH, not a finding.
