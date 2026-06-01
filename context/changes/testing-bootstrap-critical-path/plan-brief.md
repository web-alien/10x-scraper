# Testing Bootstrap — Critical Path — Plan Brief

> Full plan: `context/changes/testing-bootstrap-critical-path/plan.md`

## What & Why

Bootstrap the project's first test infrastructure (Vitest) and immediately prove protection against the two highest-priority failure scenarios from the quality contract: the scraper silently returning nothing when HTML structure changes, and the send script silently swallowing Resend API errors. Both are live bugs in the current scripts that this plan fixes and tests.

## Starting Point

No test runner exists today. `scripts/scrape.ts` and `scripts/send.ts` execute imperatively at module scope (env validation, `process.exit()`, top-level `await`) — they cannot be imported by tests without side effects firing. `scrape.ts` logs a plain `console.log` on zero-match instead of a warning, and `send.ts` continues silently after a Resend delivery error.

## Desired End State

`npm test` runs 5 Vitest tests (smoke + 2 scraper + 2 send), gates every PR in CI, and gives the team confidence in two behaviors: the scraper warns clearly when selectors match nothing, and the send script exits non-zero when any delivery fails. Both scripts remain fully functional via `npm run scrape` and `npm run send`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| How to make scripts testable | Export core functions; entry-point guard wraps all side effects | Standard Node.js ESM pattern — no separate files needed, `npm run` behavior unchanged | Plan |
| Zero-match scraper behavior | `console.warn`, exit 0 | Quiet days are valid; warning is distinguishable from selector breakage in logs | Plan |
| Send failure exit behavior | Exit non-zero if ANY send fails | Matches test-plan Risk #2 contract and PRD "no silent delivery failures" guardrail | Plan |
| Vitest config placement | Standalone `vitest.config.ts` | Isolated from Astro+Cloudflare build pipeline; no risk of adapter or CSS plugin leaking into test runs | Plan |
| CI wiring scope | Include in this change | Tests that don't gate PRs don't protect the main branch — close the loop while the tests are being written | Plan |
| Fixture strategy | `tests/fixtures/*.html` files | HTML files are readable and diffable; avoids multi-line template literals in test files | Plan |
| Mock strategy | Dependency injection — plain mock objects | Clean ESM compatibility; no `vi.mock` hoisting issues; explicit and type-visible | Plan |

## Scope

**In scope:**
- Vitest install + config + `@/*` alias wiring
- `scripts/scrape.ts` refactor: export `processSource`, entry-point guard, fix zero-match warning
- `scripts/send.ts` refactor: export `runDigest`, entry-point guard, fix `failedCount` exit behavior
- Fixture HTML files for scraper integration tests
- Tests: `tests/scraper.test.ts` (Risk #1) and `tests/send.test.ts` (Risk #2)
- `ci.yml` update: add `npm test` step
- Cookbook §6.1 update in `test-plan.md`

**Out of scope:**
- React component tests (rollout Phase 2)
- Deduplication tests (rollout Phase 2)
- Cron exit-code CI gate (rollout Phase 3)
- Post-edit hooks, MCP servers, CI YAML authoring beyond the test step

## Architecture / Approach

Both scripts are refactored in place using the Node.js ESM dual-mode pattern: exported functions hold the business logic; a `if (process.argv[1] === __filename)` guard at the bottom of each file wraps all entry-point concerns (env validation, file I/O, client creation, process exit). Tests import the exported functions and inject plain mock objects for Supabase and Resend — no `vi.mock` needed. Vitest runs in `environment: 'node'` with a standalone config that mirrors the `@/*` tsconfig alias.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest bootstrap | `npm test` runs a smoke test; config + alias wired | Vite 7.3.2 override incompatible with Vitest version picked |
| 2. Scraper refactor + tests | Risk #1 covered; `processSource` exported and tested | Refactor breaks `npm run scrape` behavior (entry-point guard subtle) |
| 3. Send refactor + tests | Risk #2 covered; `runDigest` exported and tested | `failedCount` fix introduces unintended behavior change in edge cases |
| 4. CI gate + cookbook | Tests block PRs; §6.1 cookbook filled in | CI job lacks correct env/secrets for the test step (none needed — mocked) |

**Prerequisites:** Node 22 installed (`.nvmrc`); project builds cleanly (`npm run build`)
**Estimated effort:** ~1–2 sessions across 4 phases

## Open Risks & Assumptions

- Vitest latest may have a peer-dependency conflict with the pinned `vite@7.3.2` override in `package.json`. If so, specify a compatible Vitest version explicitly.
- `import "dotenv/config"` at the top of both scripts is harmless in tests (dotenv silently no-ops when `.env` is absent) — this assumption should be verified in Phase 1.

## Success Criteria (Summary)

- `npm test` runs 5 tests locally and in CI with no errors
- `npm run scrape` and `npm run send` behavior is unchanged from before the refactor
- A deliberate test failure blocks the CI run on GitHub
