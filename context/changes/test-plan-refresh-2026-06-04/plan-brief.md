# Test Plan Auth Exclusion Refresh — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-06-04/plan.md`

## What & Why

Password-reset flow (dodany 2026-06-04) wprowadził pierwszą własną logikę auth w tym projekcie: middleware session guard i PKCE callback. §7 test-plan.md mówił "re-evaluate if auth customised" — warunek jest spełniony. Aktualizujemy §7 żeby precyzyjnie rozróżnić co jest wykluczone (form UI + Supabase API wrappers) od tego co jest w zakresie (guard + callback), i dokumentujemy oba obszary jako Risk #7 i #8 w §2.

## Starting Point

`context/foundation/test-plan.md` §7 ma jeden bullet ogólnie wykluczający całą warstwę auth. §2 nie zawiera żadnych ryzyk związanych z auth. Daty w §8 i headerze zatrzymały się na 2026-06-01.

## Desired End State

`context/foundation/test-plan.md` po zmianie ma: §7 z jednym precyzyjnym bulletem auth (wykluczenia + carve-outy), §2 z Risk #7 (middleware guard) i #8 (PKCE callback) z wypełnionymi guidance rows, §8 z datami 2026-06-04.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Risk #7: add or skip | Dodaj | Password-reset to pierwsza własna logika auth — zasługuje na jawne odnotowanie jako testowany obszar | Plan |
| Risk #7 scope | Guard + callback jako osobne ryzyka (#7 i #8) | Guard (3 linie) i callback (exchangeCodeForSession + error handling) to różne failure modes z różnymi ścieżkami testowymi | Plan |
| §7 wording style | Area-level, bez nazw plików | Spójność z istniejącymi bulletami §7; nazwy plików łamią się przy refactoringu | Plan |
| §8 update | Tylko data, bez notatki o wyzwalaczu | Kontekst jest w git log i change.md; ledger ma być minimalny | Plan |

## Scope

**In scope:** §7 auth bullet (zastąpienie), §2 risk map (2 nowe wiersze), §2 guidance (2 nowe wiersze), §8 freshness dates (3 daty + header)

**Out of scope:** §3 fazy rollout, §1 strategia, §4 stack, §5 quality gates; przypisywanie #7/#8 do faz rollout

## Architecture / Approach

Trzy chirurgiczne edycje jednego pliku markdown. Kolejność: §7 → §2 → §8. Każda faza weryfikowalna przez `git diff`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. §7 refined bullet | Precyzyjny auth exclusion bullet z carve-outami | Zbyt ogólny lub zbyt szczegółowy styl — niespójny z resztą §7 |
| 2. §2 Risk #7 + #8 | Dwa nowe ryzyka z guidance w obu tabelach | Wiersze niezrównane lub stylistycznie niespójne z #1–#6 |
| 3. §8 freshness | Daty 2026-06-04 + header zaktualizowany | Pominięcie jednej z 4 zmian daty |

**Prerequisites:** Password-reset plan kompletny (wszystkie `[x]`) — ✓  
**Estimated effort:** ~1 sesja, 3 proste edycje jednego pliku

## Open Risks & Assumptions

- Zakładamy, że §3 rollout fazy nie potrzebują Risk #7/#8 na liście "Risks covered" — decyzja należy do przyszłej sesji
- Middleware guard i PKCE callback NIE mają jeszcze testów — plan dokumentuje je jako in-scope, ale nie otwiera nowego rollout change (to odrębna decyzja)

## Success Criteria (Summary)

- §7 ma jeden bullet z wyraźnym rozróżnieniem "excluded" vs "carve-out"; brak klauzuli "Re-evaluate if"
- §2 ma Risk #7 i #8 z wypełnionymi guidance rows
- `git diff` pokazuje tylko oczekiwane zmiany — żadne inne sekcje nie są tknięte
