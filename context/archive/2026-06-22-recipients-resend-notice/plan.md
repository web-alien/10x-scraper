# Baner o ograniczeniu darmowego Resend na stronie Odbiorców — Implementation Plan

## Overview

Strona `/dashboard/recipients` pozwala dodać dowolnie wielu odbiorców, ale codzienny
mailing idzie przez Resend z testowym nadawcą `onboarding@resend.dev`, który dostarcza
maile **tylko na jeden adres** (`okres123@gmail.com`) do czasu weryfikacji własnej domeny.
Dodajemy stały baner ostrzegawczy informujący o tym ograniczeniu, by użytkownik nie dodawał
odbiorców w fałszywym przekonaniu, że dostaną maile.

## Current State Analysis

- [src/pages/dashboard/recipients.astro](src/pages/dashboard/recipients.astro) renderuje
  nagłówek, warunkowy baner błędu (`fetchError`, linia 44) i kartę z tabelą.
- [src/components/Banner.astro](src/components/Banner.astro) ma już wariant `warning`
  (żółte tło, `role="status"`) i jest **już zaimportowany** w recipients.astro (linia 3).
- Brak nowego kodu/komponentu — wystarczy użyć istniejącego `Banner`.

## Desired End State

Po wejściu na `/dashboard/recipients` (zalogowany) nad tabelą zawsze widoczny żółty baner:
„Ze względu na ograniczenia darmowej wersji resend.com, nie ma teraz możliwości wysyłki
mailingów na więcej niż 1 zdefiniowany adres."

### Key Discoveries:

- Wzorzec banera już użyty w tym pliku ([recipients.astro:44](src/pages/dashboard/recipients.astro#L44)).
- `Banner` wariant `warning` istnieje ([Banner.astro:32-36](src/components/Banner.astro#L32-L36)).

## What We're NOT Doing

- NIE blokujemy dodawania kolejnych odbiorców (baner tylko informuje).
- NIE dotykamy logiki wysyłki, walidacji, RLS, komponentu tabeli.
- NIE zmieniamy konfiguracji Resend (weryfikacja domeny to osobne zadanie).

## Implementation Approach

Jeden statyczny `<Banner variant="warning">` z komunikatem, umieszczony zaraz po bloku
nagłówka (nad kartą z tabelą), niezależny od `fetchError` — zawsze widoczny.

## Phase 1: Baner ostrzegawczy

### Overview

Dodanie stałego banera ostrzegawczego na stronie odbiorców.

### Changes Required:

#### 1. Strona odbiorców

**File**: `src/pages/dashboard/recipients.astro`

**Intent**: Wyświetlić stały komunikat o ograniczeniu darmowego Resend, używając
istniejącego komponentu `Banner` (wariant `warning`).

**Contract**: Po bloku nagłówka (`<div class="mb-6 flex …">…</div>`, ~linia 42), przed
istniejącym `{fetchError && …}` / kartą z tabelą, dodać:
`<Banner variant="warning">Ze względu na ograniczenia darmowej wersji resend.com, nie ma
teraz możliwości wysyłki mailingów na więcej niż 1 zdefiniowany adres.</Banner>`.
Import `Banner` już istnieje — bez zmian w nagłówku frontmatter.

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Po zalogowaniu na `/dashboard/recipients` żółty baner z komunikatem jest widoczny nad tabelą, na każdej wizycie

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na
potwierdzenie manualne.

---

## Testing Strategy

### Manual Testing Steps:

1. `npm run dev` → zaloguj się → Panel → Odbiorcy → baner widoczny nad tabelą.
2. (Po wdrożeniu) ten sam baner na https://10x-scraper.okres123.workers.dev/dashboard/recipients.

## References

- Identity: `context/changes/recipients-resend-notice/change.md`
- Powiązane: `context/archive/2026-06-22-digest-from-recipients-table/`, notatka projektowa o Resend.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Baner ostrzegawczy

#### Automated

- [x] 1.1 Build przechodzi (`npm run build`) — 1d9f3e4
- [x] 1.2 Lint przechodzi (`npm run lint`) — 1d9f3e4

#### Manual

- [x] 1.3 Żółty baner z komunikatem widoczny nad tabelą po zalogowaniu — 1d9f3e4
