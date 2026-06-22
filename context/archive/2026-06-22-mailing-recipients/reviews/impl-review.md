<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Strona CRUD odbiorców mailingu

- **Plan**: context/changes/mailing-recipients/plan.md
- **Scope**: All phases (1–6 of 6)
- **Date**: 2026-06-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS (1 observation) |
| Success Criteria | PASS |

## Success Criteria Evidence

- Lint: `npm run lint` → 0 errors (22 pre-existing console warnings, unrelated)
- Tests: `npx vitest run` → 15 passed (4 files), incl. 6 validator cases
- Build: `npm run build` → Complete (SSR/Cloudflare)
- Migration applied to remote Supabase; table seeded with existing recipient (okres123@gmail.com)
- Manual CRUD + auth-redirect confirmed by user

## Documented Deviations (within intent)

- Phase 1: types hand-added to src/types/supabase.ts mirroring generator output instead of `supabase gen types` (Docker unavailable; remote regen yields identical shape).
- Phase 5: native `<select>` for status (shadcn select not installed); `useEffect` prop-sync replaced by `key`-based remount (idiomatic, satisfies react-hooks lint).

## Findings

### F1 — Helper `json()` zduplikowany w dwóch route'ach

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipients/index.ts:9, src/pages/api/recipients/[id].ts:9
- **Detail**: Identyczny helper `json()` w obu plikach. Drobny DRY; inline świadomie dla dyscypliny zakresu.
- **Fix**: Ewentualnie wyciągnąć do src/lib/http.ts.
- **Decision**: FIXED — `json()` wyciągnięty do src/lib/http.ts, oba route'y importują.

### F2 — DELETE nie zwraca 404 dla nieistniejącego id

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipients/[id].ts:46
- **Detail**: DELETE zwraca 200 nawet gdy wiersz nie istniał (PUT mapuje PGRST116→404). Idempotentny delete akceptowalny, ale niespójny z PUT.
- **Fix**: Opcjonalnie sprawdzić liczbę usuniętych wierszy i zwrócić 404.
- **Decision**: FIXED — deleteRecipient zwraca `.select("id")`; DELETE → 404 gdy 0 wierszy.

### F3 — Dyrektywa "use client" w dialog.tsx

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — informational
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/dialog.tsx:1
- **Detail**: CLAUDE.md odradza "use client", ale to wygenerowany kod vendora shadcn — w Astro nieszkodliwy (ignorowany).
- **Fix**: Zostawić (vendor); ewentualnie usunąć linijkę ręcznie.
- **Decision**: FIXED — usunięto `"use client"` z src/components/ui/dialog.tsx.

### F4 — Dwa źródła prawdy odbiorców (tabela vs subscribers.json)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real, intentionally deferred debt
- **Dimension**: Architecture
- **Location**: scripts/send.ts:112 vs mailing_recipients
- **Detail**: Codzienny digest dalej czyta subscribers.json; panel pisze do tabeli. Udokumentowane w ryzykach planu jako odłożone „podłączenie do wysyłki".
- **Fix**: Osobna przyszła zmiana: send.ts czyta z tabeli (status=active).
- **Decision**: FOLLOW-UP — otwarto osobną zmianę na podłączenie send.ts do tabeli.
