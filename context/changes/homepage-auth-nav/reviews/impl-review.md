<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Homepage Hero & Topbar Auth-Aware Navigation (Polish)

- **Plan**: context/changes/homepage-auth-nav/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Notes

- 9/9 source files in the diff match the plan exactly; zero unplanned files, zero missing.
- Sign-out form in the hero reuses the existing `POST /api/auth/signout` pattern — no new risk.
- `npm run lint` → 0 errors (22 pre-existing `no-console` warnings in `scripts/`, unrelated).
- Polish plural in the password hint is grammatically correct (`znaku` / `znaków`).
- Code identifiers (`id`, `name`, `type`, state vars, `form.get("password")`) left untouched as intended.

## Findings

### F1 — Stale "What We're NOT Doing" guardrail

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/homepage-auth-nav/plan.md:33
- **Detail**: The guardrail still says "edits stay inline in the two existing files", but phases 2 and 3 (added at the user's request) deliberately extended scope to the dashboard pages and 5 auth form components. The phases are documented, so this is plan hygiene only — no code impact.
- **Fix**: Update the "What We're NOT Doing" bullet to reflect the expanded scope, or leave as-is.
- **Decision**: SKIPPED — user chose "save report & end"; default (leave as-is) accepted.

### F2 — `label="Email"` kept in English

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: SignInForm.tsx:48, SignUpForm.tsx:70, ForgotPasswordForm.tsx:41
- **Detail**: The "Email" field label stays English — a deliberate, defensible choice ("Email" is a standard borrowed term in Polish UIs), consistent across all three forms. Flagged only so the decision is explicit.
- **Fix**: Leave as "Email" (recommended), or change to "Adres e-mail" for zero English on screen.
- **Decision**: SKIPPED — user chose "save report & end"; default (leave as "Email") accepted.
