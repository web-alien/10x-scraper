# Test Plan Auth Exclusion Refresh — Implementation Plan

## Overview

Zaktualizuj `context/foundation/test-plan.md` aby §7 precyzyjnie odzwierciedlał zakres po dodaniu password-reset flow. Nowy flow wprowadził pierwszą własną logikę auth w tym projekcie (middleware session guard + PKCE callback) — §7 musi to jawnie oznaczyć jako carve-out zamiast ogólnego wykluczenia. Dodaj Risk #7 i #8 do §2 dla dwóch nowych testowanych obszarów.

## Current State Analysis

`context/foundation/test-plan.md` ma jeden bullet w §7 opisujący auth jako całkowicie wykluczone z klauzulą "Re-evaluate if auth customised". Password-reset flow (wdrożony w commitach `dc171e5` i `7d74079`, zmiana `context/changes/password-reset/`) dodał:

- `src/middleware.ts` linie 24–31: własna logika guard-u przekierowania dla `/auth/reset-password`
- `src/pages/api/auth/callback.ts`: własna logika `exchangeCodeForSession` + obsługa błędu + redirect
- Form UI (`ForgotPasswordForm`, `ResetPasswordForm`) i API routes (`forgot-password`, `reset-password`): analogiczne do istniejącego sign-in/sign-up — do wykluczenia

§7 klauzula "Re-evaluate if auth customised" jest spełniona. §2 nie zawiera żadnych ryzyk związanych z auth. §8 daty zatrzymały się na 2026-06-01.

## Desired End State

`context/foundation/test-plan.md` po zmianie:
1. §7: jeden zaktualizowany bullet auth jawnie wyłączający form UI + Supabase API wrappers i wyraźnie oznaczający middleware guard i PKCE callback jako carve-outy w zakresie
2. §2: dwa nowe ryzyka (#7 i #8) w obu tabelach (risk map i risk response guidance)
3. §8 + header: daty zaktualizowane do 2026-06-04 z opisem zmiany

### Key Discoveries:

- Middleware guard: `src/middleware.ts` linie 24–31 — własna logika pathname + redirect, nie pochodzi ze startera
- PKCE callback: `src/pages/api/auth/callback.ts` — `exchangeCodeForSession(code)` + error path + `next` redirect; więcej ruchomych części niż guard
- Password-reset w pełni skompletowany: wszystkie Progress items `[x]`
- §7 styl: area-level descriptions bez nazw plików — nowy bullet musi utrzymać ten wzorzec

## What We're NOT Doing

- Zmiany faz rollout §3 — bez zmian
- Zmiany strategii §1, stack §4, quality gates §5
- Przypisywanie Risk #7/#8 do faz rollout §3 (odrębna decyzja)
- Edycja test-plan.md poza tym planem

## Implementation Approach

Trzy chirurgiczne edycje jednego pliku markdown w logicznej kolejności: §7 najpierw (definiuje co jest wykluczone), potem §2 (definiuje co jest w zakresie i jak testować), potem §8 (bookkeeping). Każda faza jest niezależnie weryfikowalna przez `git diff`.

---

## Phase 1: §7 auth exclusion — refined bullet

### Overview

Zastąp istniejący bullet auth w §7 precyzyjną wersją z jawnym carve-outem dla middleware guard i PKCE callback.

### Changes Required:

#### 1. Replace §7 auth bullet

**File**: `context/foundation/test-plan.md`

**Intent**: Zastąp istniejący bullet auth w sekcji §7 nowym sformułowaniem, które (a) pozostawia sign-in/sign-up jako wykluczone, (b) jawnie wyklucza password-reset form UI i API routes, (c) oznacza middleware guard i PKCE callback jako carve-outy w zakresie, (d) usuwa klauzulę "Re-evaluate if" — warunek jest już spełniony.

**Contract**: Zastąp istniejący bullet:
```
- **Auth scaffolding and sign-in/sign-up forms** — built by the starter, not modified by the project, and used by a single admin. Re-evaluate if the auth flow is customised or if user-facing auth surfaces are added. (Source: Phase 2 interview Q5.)
```
nowym tekstem:
```
- **Auth form UI and Supabase API wrappers** — sign-in/sign-up forms (starter, unmodified) and password-reset form UI with its API routes are excluded: they call Supabase APIs without custom logic. **Carve-outs:** the middleware session guard for `/auth/reset-password` and the PKCE callback handler at `/api/auth/callback` contain project-authored logic and are in scope (see Risk #7, #8). (Source: Phase 2 interview Q5; refined 2026-06-04 after password-reset customisation.)
```

### Success Criteria:

#### Automated Verification:

- `git diff context/foundation/test-plan.md` shows exactly one bullet replaced in §7; no changes outside §7 in this step

#### Manual Verification:

- §7 auth bullet precyzyjnie wyklucza form UI i API routes
- Carve-outy dla guard i callback są jawnie wymienione z referencją do Risk #7, #8
- Klauzula "Re-evaluate if" nie istnieje w nowym bullecie

**Implementation Note**: Sprawdź git diff po tej fazie — §7 edycja musi być czysta przed przejściem dalej.

---

## Phase 2: §2 risk map — Risk #7 and #8

### Overview

Dodaj dwa nowe wiersze na końcu tabeli Risk Map i dwa wiersze na końcu tabeli Risk Response Guidance w §2.

### Changes Required:

#### 1. Add Risk #7 and #8 to risk map table

**File**: `context/foundation/test-plan.md`

**Intent**: Dołącz dwa wiersze na końcu tabeli Risk Map §2, po istniejącym wierszu #6.

**Contract**: Po wierszu `| 6 | GitHub Actions cron...` dodaj:
```
| 7 | Middleware session guard on `/auth/reset-password` fails to redirect unauthenticated users — user reaches the reset-password form without a valid session | Medium | Low | `context/changes/password-reset/` plan; custom guard added to `src/middleware.ts` |
| 8 | PKCE callback swallows an `exchangeCodeForSession` error or misroutes the redirect — a valid recovery link produces no session and no actionable error | Medium | Low | `context/changes/password-reset/` plan; custom error-handling logic in `/api/auth/callback` |
```

#### 2. Add Risk #7 and #8 to risk response guidance table

**File**: `context/foundation/test-plan.md`

**Intent**: Dołącz dwa wiersze na końcu tabeli Risk Response Guidance §2, po istniejącym wierszu #6.

**Contract**: Po wierszu `| #6 | Cron workflow exits non-zero...` dodaj:
```
| #7 | Guard redirects unauthenticated requests to `/auth/forgot-password?error=...`; authenticated users pass through | "`context.locals.user` is set" does not prove the guard fires for all `/auth/reset-password` path patterns | Shape of the middleware guard condition; how `context.locals.user` is populated before the guard check | Unit test on the middleware guard with mocked `context.locals` | Asserting "user can't reach the page" without checking the redirect target |
| #8 | `exchangeCodeForSession(code)` error path redirects to `/auth/forgot-password?error=...`; success path redirects to `next` param | "no exception thrown" does not mean session was written to cookies | How callback.ts propagates Supabase errors; whether errors from `exchangeCodeForSession` are caught and surfaced | Unit test with mocked Supabase client asserting redirect on error vs. success | Testing only the happy path; treating "redirect happened" as proof session exists |
```

### Success Criteria:

#### Automated Verification:

- `git diff context/foundation/test-plan.md` shows exactly 4 new lines in §2 (2 in risk map + 2 in guidance table); no edits to existing rows

#### Manual Verification:

- Risk #7 i #8 mają spójny styl z istniejącymi ryzykami #1–#6
- Guidance rows dla #7 i #8 mają wypełnione wszystkie kolumny
- Tabele markdown wyrównane poprawnie

---

## Phase 3: §8 freshness dates

### Overview

Zaktualizuj daty w §8 Freshness Ledger i nagłówek "Last updated" w headerze dokumentu.

### Changes Required:

#### 1. Update header "Last updated"

**File**: `context/foundation/test-plan.md`

**Intent**: Zaktualizuj datę i opis w nagłówku dokumentu.

**Contract**: Zastąp:
```
> Last updated: 2026-06-01 (Phase 1 change opened)
```
na:
```
> Last updated: 2026-06-04 (§7 auth exclusion refined; Risk #7, #8 added)
```

#### 2. Update §8 dates

**File**: `context/foundation/test-plan.md`

**Intent**: Zaktualizuj trzy daty w §8 Freshness Ledger na 2026-06-04.

**Contract**: Zastąp:
```
- Strategy (§1–§5) last reviewed: 2026-06-01
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: 2026-06-01 (none in use)
```
na:
```
- Strategy (§1–§5) last reviewed: 2026-06-04
- Stack versions last verified: 2026-06-04
- AI-native tool references last verified: 2026-06-04 (none in use)
```

### Success Criteria:

#### Automated Verification:

- `git diff context/foundation/test-plan.md` shows exactly 4 date/text changes (1 header + 3 in §8); no other changes

#### Manual Verification:

- Wszystkie daty w §8 czytają 2026-06-04
- Header "Last updated" opisuje co zostało zmienione w tej sesji

---

## Testing Strategy

### Manual Testing Steps:

1. Przeczytaj §7 — bullet jasno wyklucza form UI i API routes; carve-outy dla guard i callback jawnie wymienione; brak klauzuli "Re-evaluate if"
2. Przeczytaj §2 Risk Map — Risk #7 i #8 na końcu tabeli, spójny styl z #1–#6
3. Przeczytaj §2 Risk Response Guidance — wiersze #7 i #8 z wypełnionymi wszystkimi kolumnami
4. Przeczytaj §8 — wszystkie 3 daty + header mają 2026-06-04
5. `git diff context/foundation/test-plan.md` — zmiany tylko w §2, §7, §8 i headerze

## References

- Password-reset plan: `context/changes/password-reset/plan.md`
- Middleware guard: `src/middleware.ts` linie 24–31
- PKCE callback: `src/pages/api/auth/callback.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: §7 auth exclusion — refined bullet

#### Automated

- [x] 1.1 `git diff` shows exactly one bullet replaced in §7, no other changes — c88a9c6

#### Manual

- [x] 1.2 §7 auth bullet precyzyjnie wyklucza form UI i API routes — c88a9c6
- [x] 1.3 Carve-outy dla guard i callback jawnie wymienione z referencją do Risk #7, #8 — c88a9c6
- [x] 1.4 Klauzula "Re-evaluate if" nie istnieje — c88a9c6

### Phase 2: §2 risk map — Risk #7 and #8

#### Automated

- [x] 2.1 `git diff` shows 4 new lines in §2 (2 risk map rows + 2 guidance rows)

#### Manual

- [x] 2.2 Risk #7 i #8 spójne stylistycznie z #1–#6
- [x] 2.3 Guidance rows dla #7 i #8 mają wypełnione wszystkie kolumny
- [x] 2.4 Tabele markdown wyrównane poprawnie

### Phase 3: §8 freshness dates

#### Automated

- [ ] 3.1 `git diff` shows exactly 4 date/text changes (header + 3 in §8)

#### Manual

- [ ] 3.2 Wszystkie daty w §8 czytają 2026-06-04
- [ ] 3.3 Header "Last updated" opisuje zmiany tej sesji
