# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-01 (Phase 1 change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `scripts/` (14 commits/30d).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Scraper returns empty or garbage data when source HTML structure changes — silent failure, no output validation | High | High | interview Q1, Q2; hot-spot dir `scripts/` (5 commits/30d) |
| 2 | Email delivery fails silently — Resend API error not propagated, subscribers miss the digest with no admin notification | High | Medium | interview Q3; PRD guardrail "brak cichych błędów dostawy"; hot-spot dir `scripts/` (5 commits/30d) |
| 3 | Duplicate article delivered — deduplication logic fails and subscriber receives the same article in multiple digests | High | Medium | PRD guardrail §Deduplication; archive `context/archive/2026-05-26-supabase-dedup-schema`; hot-spot dir `src/types/` (3 commits/30d) |
| 4 | Subscriber email addresses visible to other recipients — BCC/To addressing error exposes the mailing list | High | Low | PRD §NFR "prywatność listy mailingowej: adresy email nie są widoczne dla innych odbiorców" |
| 5 | Article URL rendered as clickable link without scheme validation in dashboard — javascript: or data: URL enables XSS | Medium | Medium | hot-spot dir `src/components/` (2 commits/30d); confirmed fix commit (vulnerability existed) |
| 6 | GitHub Actions cron fails silently — scrape or send exits non-zero but workflow appears completed, no digest sent | Medium | Medium | roadmap S-03 risk note "must monitor Actions"; hot-spot dir `scripts/` (5 commits/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Scraper returns ≥1 non-empty title + URL per source when HTML matches selectors; exits non-zero or logs a clear error when selectors match nothing | "fetch succeeded" does not mean content was extracted | How scraper validates non-empty output; whether it errors on empty match; title + URL normalization | Integration test with fixture HTML (no live network) | Testing against a live external URL (flaky); asserting fetch success without validating payload shape |
| #2 | Send script exits non-zero AND logs the error when Resend API returns an error response; no silent exit 0 on delivery failure | "script exited 0" does not mean mail was delivered | How send.ts handles Resend API errors; whether HTTP response status is checked; error propagation path | Unit test with mocked Resend client, asserting error propagation | Testing only the happy path where Resend responds with 200 |
| #3 | Running scraper twice on identical HTML inserts each article exactly once; second run reports 0 new articles for that source | "upsert ran" does not mean ON CONFLICT fired correctly | Upsert implementation shape; how the new vs. duplicate count is derived from the DB response | Integration test asserting idempotent upsert behavior | Asserting the SQL string rather than behavior; testing only insert, not the duplicate-detection path |
| #4 | Send script addresses each subscriber individually or uses BCC; no subscriber can read another's address from the email | "all subscribers received email" does not mean they cannot see each other's addresses | How send.ts constructs the Resend API call — to, bcc, or per-recipient loop | Unit test asserting send call shape (addressing) | Testing only that N emails were sent, not HOW they were addressed |
| #5 | ArticlesTable does not render javascript: or data: URLs as clickable `<a href>`; scheme validation rejects all non-http/https inputs | "the fix was merged" does not cover all invalid URL patterns (relative, empty, data:) | Current validation logic applied to article_url before href rendering; what inputs reach the component from the DB | Unit test with fixture data including javascript:, data:, relative, and empty URL | Testing only a valid https:// URL; snapshot without asserting the href attribute value |
| #6 | Cron workflow exits non-zero when scrape or send script fails; no silent success on partial pipeline failure | "workflow completed" does not mean digest was sent | Current daily-digest.yml structure; exit code propagation from npm run commands | Workflow YAML review + manual trigger test via `workflow_dispatch` | Treating GitHub Actions "completed" status as proof of delivery |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bootstrap + critical-path coverage | Set up vitest; prove scraper output validation and email error propagation | #1, #2 | unit + integration | implementing | context/changes/testing-bootstrap-critical-path/ |
| 2 | Deduplication + security coverage | Prove dedup fires correctly; verify email privacy addressing; add XSS regression | #3, #4, #5 | unit + integration | not started | — |
| 3 | Operational gates wiring | Verify cron exit-code propagation; wire unit + integration gates to CI | #6 | workflow smoke + CI gate | not started | — |

**Status vocabulary:**

| Value | Meaning |
|-------|---------|
| `not started` | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched` | `research.md` exists in the change folder. |
| `planned` | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete` | Progress section is fully `[x]`. |

---

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see §3 Phase 1 | TypeScript native, ESM support, `environment: 'node'` for script testing; confirmed via Context7 docs |
| HTTP/API mocking | MSW or vi.mock | none yet — see §3 Phase 1 | Phase 1 research will choose between MSW and vitest mocks based on Resend client shape |
| e2e | Playwright | not warranted yet | MVP is CLI scripts + minimal dashboard; promote only if a risk requires full browser flow |
| accessibility | axe-core | not warranted yet | Dashboard is minimal; revisit if v2 panel lands |
| AI-native review | none | — | No Playwright MCP or multimodal MCP available in current session |

**Stack grounding tools (current session):**
- Docs: Context7 (`/websites/vitest_dev`) — queried vitest TypeScript/Node setup, confirmed v4.x vitest for ESM TypeScript; checked: 2026-06-01
- Search: none — no Exa.ai or web search MCP available in current session
- Runtime/browser: none — no Playwright MCP available in current session
- Provider/platform: Cloudflare MCP present (auth-only relevance); no Supabase MCP; checked: 2026-06-01

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions in scraper, send script, dedup, URL validation |
| post-edit hook | local (agent loop) | recommended after §3 Phase 1 | regressions at edit time before commit |
| CI exit-code gate for cron | GitHub Actions | required after §3 Phase 3 | silent cron failures |
| e2e on critical flows | CI on PR | not planned | scripts are CLI tools; promote only if dashboard grows |
| multimodal visual review | CI on PR | not planned | no multimodal MCP in session; revisit at refresh |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test (script logic)

**Location**: `tests/` (project root) — one file per script.
**Naming**: `<script-name>.test.ts` (e.g., `tests/send.test.ts`, `tests/scraper.test.ts`)
**Run command**: `npm test` (all tests) · `npx vitest run tests/send.test.ts` (single file)

**Pattern (dependency-injection)**:
1. Import the exported function from the script (e.g., `import { runDigest } from '../scripts/send.ts'`)
2. Build plain mock objects for Supabase and Resend — no `vi.mock` needed
3. Call the function and assert the return value or captured arguments

**Reference tests**: `tests/send.test.ts` (Resend error propagation, Risk #2) ·
`tests/scraper.test.ts` (cheerio fixture HTML + upsert capture, Risk #1)

### 6.2 Adding an integration test (Supabase upsert / deduplication)

TBD — see §3 Phase 2 (covers dedup behavior pattern against the articles_seen table).

### 6.3 Adding a unit test for a React component (URL/href validation)

TBD — see §3 Phase 2 (covers ArticlesTable XSS-regression pattern).

### 6.4 Verifying a cron workflow change

TBD — see §3 Phase 3 (covers workflow_dispatch smoke-test pattern and exit-code propagation).

### 6.5 Per-rollout-phase notes

(Filled in as phases ship — captures surprises and fixture decisions not obvious from the plan.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Auth form UI and Supabase API wrappers** — sign-in/sign-up forms (starter, unmodified) and password-reset form UI with its API routes are excluded: they call Supabase APIs without custom logic. **Carve-outs:** the middleware session guard for `/auth/reset-password` and the PKCE callback handler at `/api/auth/callback` contain project-authored logic and are in scope (see Risk #7, #8). (Source: Phase 2 interview Q5; refined 2026-06-04 after password-reset customisation.)
- **Generated TypeScript types (`src/types/supabase.ts`)** — auto-generated by `supabase gen types`; the generator and the live schema are the ground truth. Re-evaluate if hand-edited sections are added. (Source: Phase 1 discovery — no churn in generated code.)
- **Static marketing / landing pages** — no hand-authored logic; snapshot tests break on copy changes and catch nothing. Re-evaluate if client-side logic is added. (Source: Phase 1 discovery — cosmetic-only files.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-01
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: 2026-06-01 (none in use)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
