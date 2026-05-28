<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Supabase Dedup Schema

- **Plan**: context/changes/supabase-dedup-schema/plan.md
- **Scope**: All phases (1–2 of 2)
- **Date**: 2026-05-27
- **Verdict**: APPROVED
- **Findings**: 0 critical  2 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Checks

| Criterion | Result |
|-----------|--------|
| 1.1 `.supabase/` dir exists | ABSENT locally (ephemeral — was present during push) |
| 1.2 Migration file exists | ✓ PASS |
| 1.3 `supabase db push` exit 0 | ✓ PASS (ran at implementation time; migration live) |
| 2.1 `src/types/supabase.ts` non-empty | ✓ PASS |
| 2.2 `npx eslint src/types/supabase.ts` exit 0 | ✓ PASS |
| 2.3 `npm run build` exit 0 | ✓ PASS (10.22s) |

## Findings

### F1 — src/types/supabase.ts directory vs. src/types.ts convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/types/supabase.ts
- **Detail**: CLAUDE.md states "Shared types (entities, DTOs) go in src/types.ts". The implementation created `src/types/` (a directory) with `supabase.ts` inside. No flat `src/types.ts` exists. A future developer following CLAUDE.md would try to create `src/types.ts` for entity types — the existing directory blocks that. Two competing patterns now co-exist implicitly.
- **Fix A ⭐ Recommended**: Update CLAUDE.md to document the `src/types/` directory — clarify that `src/types/` holds generated/DB types and that handcrafted entities/DTOs go in `src/types/domain.ts` (or similar).
  - Strength: Keeps generated file at its supabase-cli-conventional path; documents intent for future developers.
  - Tradeoff: CLAUDE.md edit is a separate commit; easy to miss.
  - Confidence: HIGH — auto-generated files typically live in their own subdir.
  - Blind spot: None significant.
- **Fix B**: Move file to `src/lib/supabase.types.ts` — preserves existing CLAUDE.md convention unchanged.
  - Strength: No CLAUDE.md change needed.
  - Tradeoff: Breaks any future importer of `src/types/supabase.ts`; S-01 plan references this path.
  - Confidence: MEDIUM — no current importers yet.
  - Blind spot: S-01 plan may hardcode the `src/types/supabase.ts` path.
- **Decision**: FIXED via Fix A — updated CLAUDE.md:46 to document src/types/ directory convention

### F2 — 3 unplanned tooling files committed in change's window

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/settings.local.json, .mcp.json, .claude/.10x-cli-manifest.json
- **Detail**: Three files changed between 453432f^ and HEAD that aren't part of this feature: settings.local.json (new Bash allow + deny restructure), .mcp.json (Linear MCP server added), .10x-cli-manifest.json (timestamp bump from m2l2 lesson install). All are tooling/IDE configuration — benign, but they landed in the feature's commit range.
- **Fix**: No code change needed. Accepted as normal tooling churn from an interactive dev session. Future note: config changes deserve their own commit ("chore: IDE config") to keep feature commits clean.
- **Decision**: ACCEPTED-AS-RULE: Tooling/config commits mixed with feature commits

### F3 — Only SELECT policy; writes via service_role undocumented at repo level

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260526000000_create_articles_seen.sql:11-14
- **Detail**: CLAUDE.md says "granular per-operation, per-role policies." Migration has only a SELECT policy; INSERT/UPDATE/DELETE are absent because service_role bypasses RLS. This intent IS documented in the migration comments ("service_role pomija RLS automatycznie") so it passes the spirit of the rule.
- **Fix**: No change needed. Intent is documented. Acceptable conscious decision.
- **Decision**: FIXED + ACCEPTED-AS-RULE: RLS policies — service_role bypass must be documented in migration

### F4 — .supabase/ project link is ephemeral, not persisted

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: (no file — directory absent)
- **Detail**: `.supabase/` was created by `supabase link` during the session, used for the push, then disappeared (not committed, not gitignored). Anyone running `supabase db push` on a fresh checkout needs to re-run `supabase link --project-ref hfiasswaduellpweeloc` first. CI doesn't run db push so this is a local-only footgun. Migration is already applied.
- **Fix**: Add `.supabase/` to `.gitignore` (to document the exclusion intentionally) and add a note to project README or CLAUDE.md: "Before running `supabase db push`, run `supabase link --project-ref hfiasswaduellpweeloc`."
- **Decision**: FIXED — added .supabase/ to .gitignore with comment; added supabase link note to CLAUDE.md
