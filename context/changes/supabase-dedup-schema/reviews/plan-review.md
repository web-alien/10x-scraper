<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Supabase Dedup Schema

- **Plan**: `context/changes/supabase-dedup-schema/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-26
- **Verdict**: SOUND (po triażu)
- **Findings**: 2 critical, 0 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → FIXED |
| Plan Completeness | PASS |

## Grounding

`supabase/config.toml` ✓, `.env` ✓; `src/types/` ✗ (brak — F2), `.supabase/` ✗ (projekt nie zlinkowany — F1), `supabase/migrations/` ✗ (oczekiwane dla nowego projektu); brief↔plan ✓

## Findings

### F1 — Projekt nie zlinkowany — `supabase db push` zawiedzie

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1
- **Detail**: `.supabase/` nie istnieje — projekt nie jest zlinkowany przez CLI. `supabase db push` (domyślnie --linked=true) zwróci błąd bez `supabase link`. `gen types --project-id` też wymaga aktywnej sesji login.
- **Fix A ⭐ Recommended**: Dodaj `supabase login` + `supabase link --project-ref hfiasswaduellpweeloc` jako krok 0 w Phase 1
  - Strength: standardowa ścieżka CLI; jedna sesja działa dla db push i gen types
  - Tradeoff: login otwiera przeglądarkę (OAuth, jednorazowo)
  - Confidence: HIGH — .supabase/ potwierdzony jako brakujący
  - Blind spot: Brak
- **Fix B**: Zamień komendy na `--db-url`
  - Strength: bez OAuth; działa bez .supabase/
  - Tradeoff: hasło DB w .env; dwa URL-e do utrzymania
  - Confidence: HIGH — flaga potwierdzona w help
  - Blind spot: Postgres URL nieznany — user musi pobrać z dashboardu
- **Decision**: FIXED via Fix A — dodano krok 0 w Phase 1 z `supabase login` + `supabase link`

### F2 — `src/types/` nie istnieje — shell redirect zawiedzie

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Contract
- **Detail**: `src/types/` nie istnieje. Komenda `> src/types/supabase.ts` zwróci błąd. Shell redirect nie tworzy katalogów nadrzędnych.
- **Fix**: Dodaj krok 0 w Phase 2: `New-Item -ItemType Directory -Force src\types` przed generowaniem typów.
- **Decision**: FIXED — dodano krok 0 w Phase 2 z tworzeniem katalogu
