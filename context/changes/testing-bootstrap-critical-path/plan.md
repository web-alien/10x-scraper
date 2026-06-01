# Testing Bootstrap — Critical Path Implementation Plan

## Overview

Bootstrap Vitest and prove protection against the two highest-priority risks from the test-plan: scraper silent failures on bad selectors (Risk #1) and email delivery silent failures (Risk #2). This plan fixes two exit-code/warning bugs in the scripts, refactors both scripts to be importable by tests, and wires the test gate into CI.

## Current State Analysis

- No test runner installed. `package.json` has no `test` script and Vitest is absent from `devDependencies`.
- `scripts/scrape.ts` and `scripts/send.ts` run top-level logic on import, making them untestable. Both have env-validation `process.exit()` calls at module scope.
- `scrape.ts` line 95–96: zero-match (`articles.length === 0`) logs via `console.log`, not `console.warn`. Test-plan Risk #1 requires a clear warning.
- `send.ts` line 85: Resend error is logged but not tracked — loop continues and the script exits 0. Test-plan Risk #2 requires non-zero exit on any delivery failure.
- CI (`ci.yml`) runs lint + build only; no test step.

## Desired End State

After this plan:
- `npm test` runs all Vitest tests locally and in CI.
- `processSource(html, source, supabase)` is an exported, tested function: proves ≥1 article with non-empty title + URL is upserted for valid HTML, and a `console.warn` fires with 0 articles for empty-selector HTML.
- `runDigest(articles, subscribers, resend, supabase, fromEmail)` is an exported, tested function: proves it returns `failedCount > 0` when Resend errors, and `failedCount === 0` on success.
- The test suite gates PRs via GitHub Actions.

### Key Discoveries:

- Both scripts use top-level `await` and `process.exit()` at module scope. The entry-point guard (`if (process.argv[1] === __filename)`) wraps all of this, leaving only the export and safe imports at module scope. This is the standard Node.js ESM pattern for dual-mode scripts.
- `SourceConfig` is currently typed as an array (`z.infer<typeof SourceConfigSchema>`). Extracting `processSource` requires splitting into `SourceSchema` (single element) and `SourceConfigSchema = z.array(SourceSchema)`, so the function signature can reference the single-element type.
- `@/lib/supabase-script` is imported at the top of both scripts. Vitest's `resolve.alias` must map `@` → `./src` or the test run will fail to resolve this import when loading the script module.
- The `resend.emails.send` call returns `{ data, error }`. Mocking with a plain object is sufficient — no `vi.mock` needed.
- Fixture files should use `fileURLToPath(new URL('./fixtures/...', import.meta.url))` for loading, not relative `readFileSync` paths, to avoid cwd-dependency in test execution.

## What We're NOT Doing

- Not adding React component tests (Phase 2 of rollout).
- Not testing env-var validation logic or `sources.json` / `subscribers.json` loading paths.
- Not testing Supabase connection or real Resend API calls — all external clients are mocked.
- Not configuring post-edit hooks (Lesson 3 of Module 3).
- Not wiring the cron exit-code CI gate (Phase 3 of rollout).

## Implementation Approach

Each script is refactored in place: the core processing logic moves up into an exported async function, and all entry-point code is wrapped in a `if (process.argv[1] === __filename)` guard. The exported functions accept external clients (Supabase, Resend) as parameters so tests inject plain mock objects without `vi.mock` complexity.

---

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest, configure it for Node + ESM + the `@/*` path alias, add test scripts to `package.json`, and verify the setup with a smoke test.

### Changes Required:

#### 1. Install Vitest

**File**: `package.json`

**Intent**: Add Vitest as a dev dependency and expose `npm test` and `npm run test:watch` commands.

**Contract**: Add `"vitest"` to `devDependencies` (latest). Add to `scripts`: `"test": "vitest run"` and `"test:watch": "vitest"`. Run `npm install` after editing.

#### 2. Create Vitest config

**File**: `vitest.config.ts` (new, project root)

**Intent**: Configure Vitest with the `node` environment, limit discovery to `tests/**/*.test.ts`, and replicate the `@/*` → `./src` path alias from `tsconfig.json`.

**Contract**:

```typescript
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

Omits `globals: true` — tests import `describe`, `it`, `expect` etc. explicitly from `'vitest'`.

#### 3. Smoke test

**File**: `tests/smoke.test.ts` (new)

**Intent**: Trivial assertion that Vitest can discover and run a test in this project.

**Contract**: A single `it('setup is working', ...)` asserting `expect(true).toBe(true)`.

### Success Criteria:

#### Automated Verification:

- `npm test` runs successfully and the smoke test passes

#### Manual Verification:

- Running `npm test` in a clean shell without `.env` set does not crash with "SUPABASE_URL is not defined" — confirms the scripts are not yet imported

**Implementation Note**: After automated verification passes, pause here for confirmation before proceeding to Phase 2.

---

## Phase 2: Scraper Refactoring + Tests (Risk #1)

### Overview

Refactor `scrape.ts` to export a testable `processSource` function. Fix the zero-match behavior to warn instead of log. Write integration tests with fixture HTML proving two behaviors.

### Changes Required:

#### 1. Refactor scrape.ts

**File**: `scripts/scrape.ts`

**Intent**: Export `processSource` near the top of the file; move all entry-point code into an entry-point guard at the bottom. Fix the zero-match path to use `console.warn`.

**Contract**:

Split the Zod schema: define `SourceSchema` for a single element, keep `SourceConfigSchema = z.array(SourceSchema)`. Export `Source = z.infer<typeof SourceSchema>`.

Export:
```typescript
export async function processSource(
  html: string,
  source: Source,
  supabase: SupabaseClient<Database>
): Promise<{ newCount: number; duplicateCount: number }>
```

The function body contains the cheerio parsing (current lines 63–93), URL resolution, and Supabase upsert (lines 107–123). It does NOT call `fetch`; fetching stays in the entry point.

Fix at the current `articles.length === 0` branch (line 95): change `console.log(...)` to `console.warn(\`${source.name}: no articles found — selectors may be broken\`)`.

Entry-point guard pattern:
```typescript
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
  // env validation, process.exit() calls, sources.json load,
  // client creation, fetch loop, and totals logging all go here
}
```

`import "dotenv/config"` stays at the top of the file (harmless in tests — dotenv does nothing when `.env` is absent).

#### 2. Valid fixture HTML

**File**: `tests/fixtures/source-valid.html` (new)

**Intent**: Minimal HTML with two article link elements matching the test selector `a.article-link`. Used to prove `processSource` returns ≥1 article with non-empty title and URL.

**Contract**: Contains at least two `<a class="article-link" href="/article-N">Title N</a>` elements with distinct non-empty `href` and text content.

#### 3. Empty fixture HTML

**File**: `tests/fixtures/source-empty.html` (new)

**Intent**: HTML with no elements matching `a.article-link`. Used to prove `processSource` emits `console.warn` and returns zero counts.

**Contract**: Valid HTML with body content but no `<a class="article-link">` elements.

#### 4. Scraper integration tests

**File**: `tests/scraper.test.ts` (new)

**Intent**: Two integration tests proving Risk #1 protection. No live network calls; Supabase client is a plain mock object that captures the rows argument passed to `upsert`.

**Contract**:

Test source config: `{ name: 'test', url: 'https://example.com', selectors: { articleLink: 'a.article-link' } }`.

Load fixtures using `readFileSync(fileURLToPath(new URL('./fixtures/source-valid.html', import.meta.url)), 'utf-8')`.

Mock supabase: plain object whose `from(...).upsert(rows, ...).select('id')` resolves to `{ data: rows.map((_, i) => ({ id: \`id-${i}\` })), error: null }`. Capture the `rows` argument.

Test 1 — valid HTML:
- Call `processSource(validHtml, source, mockSupabase)`
- Assert `capturedRows.length >= 1`
- Assert every row has a non-empty `title` and a non-empty `article_url` starting with `https://example.com`
- Assert return value `newCount >= 1`

Test 2 — empty-selector HTML:
- Spy on `console.warn` via `vi.spyOn(console, 'warn')`
- Call `processSource(emptyHtml, source, mockSupabase)`
- Assert `console.warn` was called with a string containing `'no articles found'`
- Assert return value `{ newCount: 0, duplicateCount: 0 }`
- Assert mock supabase `upsert` was NOT called

### Success Criteria:

#### Automated Verification:

- `npm test` — both scraper tests pass (3 tests total with smoke)
- `npm run lint` passes on modified and new files
- `npm run build` passes (no TypeScript errors introduced)

#### Manual Verification:

- `npm run scrape` with `.env` set produces identical output to before the refactor

**Implementation Note**: Pause after all automated checks pass for confirmation before proceeding to Phase 3.

---

## Phase 3: Send Refactoring + Tests (Risk #2)

### Overview

Refactor `send.ts` to export a testable `runDigest` function, fix the silent-failure bug (track `failedCount`, exit non-zero if > 0), and write unit tests proving error propagation.

### Changes Required:

#### 1. Refactor send.ts

**File**: `scripts/send.ts`

**Intent**: Export `runDigest` near the top of the file; move all entry-point code into the entry-point guard. Fix the subscriber send loop to track failures and return `failedCount`. Wire the entry point to `process.exit(1)` when `failedCount > 0`.

**Contract**:

Export `Article` type for the shape returned by the Supabase select: `{ id: string; source_url: string; article_url: string; title: string | null; lead: string | null }`.

Export:
```typescript
export async function runDigest(
  articles: Article[],
  subscribers: string[],
  resend: Pick<Resend, 'emails'>,
  supabase: SupabaseClient<Database>,
  fromEmail: string
): Promise<{ failedCount: number }>
```

The function body contains: grouped HTML generation, the subscriber send loop (tracking `failedCount` instead of silently continuing), and the Supabase `update` call. Returns `{ failedCount }`.

Entry-point guard wraps everything: env reads, `process.exit()` on missing env, subscribers loading, client creation, article query, `runDigest` call, and:
```typescript
if (failedCount > 0) process.exit(1)
```

`import "dotenv/config"` stays at top.

#### 2. Send unit tests

**File**: `tests/send.test.ts` (new)

**Intent**: Two unit tests proving Risk #2 protection — Resend error returns `failedCount > 0`, success returns `failedCount === 0`. No external calls.

**Contract**:

Test fixtures: `articles` array with 1 item (all required fields populated), `subscribers = ['test@example.com']`, `fromEmail = 'noreply@test.com'`.

Mock Supabase: plain object whose `from(...).update(...).in(...)` resolves to `{ error: null }`.

Test 1 — Resend error:
- `mockResend = { emails: { send: async () => ({ data: null, error: { message: 'rate limited' } }) } }`
- Assert `failedCount === subscribers.length`

Test 2 — happy path:
- `mockResend = { emails: { send: async () => ({ data: { id: 'msg-id-1' }, error: null }) } }`
- Assert `failedCount === 0`

#### 3. Update cookbook §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 placeholder with the pattern established by the tests in this phase.

**Contract**: Replace `TBD — see §3 Phase 1 (covers scraper output validation and send error propagation patterns).` with:

```
**Location**: `tests/` (project root) — one file per script.
**Naming**: `<script-name>.test.ts` (e.g., `tests/send.test.ts`, `tests/scraper.test.ts`)
**Run command**: `npm test` (all tests) · `npx vitest run tests/send.test.ts` (single file)

**Pattern (dependency-injection)**:
1. Import the exported function from the script (e.g., `import { runDigest } from '../scripts/send.ts'`)
2. Build plain mock objects for Supabase and Resend — no `vi.mock` needed
3. Call the function and assert the return value or captured arguments

**Reference tests**: `tests/send.test.ts` (Resend error propagation, Risk #2) ·
`tests/scraper.test.ts` (cheerio fixture HTML + upsert capture, Risk #1)
```

### Success Criteria:

#### Automated Verification:

- `npm test` — all 5 tests pass (smoke + 2 scraper + 2 send)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `npm run send` with `.env` set exits 0 on success and 1 when Resend returns an error (test by temporarily pointing `RESEND_API_KEY` at an invalid key)

**Implementation Note**: Pause after all automated checks pass for confirmation before proceeding to Phase 4.

---

## Phase 4: CI Gate Wiring

### Overview

Add `npm test` to `ci.yml` so the test suite gates every push and PR to master.

### Changes Required:

#### 1. Add test step to CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Run `npm test` after lint so failing tests block merges.

**Contract**: Add `- run: npm test` after `- run: npm run lint` and before `- run: npm run build`. The test suite does not require `SUPABASE_URL` or `SUPABASE_KEY` (all clients are mocked), so no new secrets are needed.

### Success Criteria:

#### Automated Verification:

- Push the branch to GitHub and the CI run passes with the `npm test` step visible in the Actions log
- All 5 tests show as green in the CI output

#### Manual Verification:

- Introduce a deliberate failure locally (`expect(true).toBe(false)` in smoke.test.ts), confirm `npm test` exits non-zero, then revert

**Implementation Note**: After CI passes, revert any deliberate failure introduced during manual verification.

---

## Testing Strategy

### Unit Tests:

- `tests/send.test.ts`: Resend error-propagation path (`failedCount > 0`) and happy path — no external calls

### Integration Tests:

- `tests/scraper.test.ts`: fixture HTML via cheerio (no live fetch), mock Supabase upsert argument capture

### Manual Testing Steps:

1. Run `npm run scrape` with `.env` set and verify output matches pre-refactor behavior
2. Run `npm run send` with an invalid `RESEND_API_KEY` and confirm it exits non-zero
3. Push to GitHub and confirm CI passes with the test step

## References

- Test-plan: `context/foundation/test-plan.md` — §2 Risk Map (Risks #1, #2) and §3 Phase 1
- Scraper script: `scripts/scrape.ts`
- Send script: `scripts/send.ts`
- Supabase script client: `src/lib/supabase-script.ts`
- CI workflow: `.github/workflows/ci.yml`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm test` runs successfully and the smoke test passes — a36b73a

#### Manual

- [ ] 1.2 `npm test` in clean shell without `.env` does not crash with missing env-var errors

### Phase 2: Scraper Refactoring + Tests (Risk #1)

#### Automated

- [x] 2.1 `npm test` — both scraper tests pass (3 tests total with smoke)
- [x] 2.2 `npm run lint` passes on modified and new files
- [x] 2.3 `npm run build` passes with no TypeScript errors

#### Manual

- [x] 2.4 `npm run scrape` with `.env` set produces identical output to before the refactor

### Phase 3: Send Refactoring + Tests (Risk #2)

#### Automated

- [ ] 3.1 `npm test` — all 5 tests pass (smoke + 2 scraper + 2 send)
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 `npm run send` with invalid `RESEND_API_KEY` exits non-zero

### Phase 4: CI Gate Wiring

#### Automated

- [ ] 4.1 CI run on GitHub passes with `npm test` step visible and green

#### Manual

- [ ] 4.2 Deliberate test failure causes `npm test` to exit non-zero locally
