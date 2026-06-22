# Strona CRUD do zarządzania listą odbiorców mailingu — Implementation Plan

## Overview

Dodajemy do panelu (`/dashboard`) drugą podstronę — **listę odbiorców mailingu** —
z pełnym CRUD (dodawanie / edycja / usuwanie). Powstaje nowa tabela domenowa
`mailing_recipients`, serwis danych, JSON API, interaktywna wyspa React i strona
Astro. Zakres ogranicza się do zarządzania listą; podłączenie tej listy do
faktycznej wysyłki digestu jest świadomie poza zakresem.

## Current State Analysis

- Panel ([src/pages/dashboard.astro](src/pages/dashboard.astro)) ma dziś jedną
  podstronę — Artykuły. Linkowanie podstron to zwykłe `<a href>`.
- [ArticlesTable.tsx](src/components/ArticlesTable.tsx) jest **tylko do odczytu**
  (sortowanie kolumn). Nie ma w projekcie żadnego write-API ani formularza CRUD do
  skopiowania 1:1 — to pierwszy taki przypadek.
- **Model zapisu artykułów jest inny niż potrzebny tutaj.** `articles_seen`
  zapisuje `service_role` ze skryptów; aplikacja webowa robi tylko `SELECT` jako
  `authenticated` ([migracja](supabase/migrations/20260526000000_create_articles_seen.sql)).
  Aplikacja używa klucza `SUPABASE_KEY` (anon) — więc formularz w panelu działa
  jako rola `authenticated`. Nowa tabela MUSI mieć jawne polityki RLS na
  INSERT/UPDATE/DELETE dla `authenticated`, inaczej zapisy cicho się nie powiodą.
- Klient SSR: [createClient(headers, cookies)](src/lib/supabase.ts) — używany
  identycznie w stronach Astro i w API routes; zwraca `null` bez konfiguracji.
- Middleware ([src/middleware.ts:4](src/middleware.ts#L4)) chroni `/dashboard`
  przez `startsWith`, więc `/dashboard/recipients` jest chroniona bez zmian.
- shadcn/ui: dostępne tylko `button` i `table`. Formularz wymaga doinstalowania
  `input`, `label`, `dialog`.
- Testy: vitest (`tests/**/*.test.ts`, `npm run test`) + Playwright (`e2e/`,
  fixtures `playwright/.auth/user.json`).

## Desired End State

Zalogowany użytkownik wchodzi: Panel → **Odbiorcy** → widzi tabelę odbiorców
(email / imię / status / data dodania), może dodać nowego odbiorcę przez formularz
w modalu, edytować istniejącego i trwale usunąć (z potwierdzeniem). Wszystkie
operacje przechodzą przez bazę z egzekwowanym RLS dla roli `authenticated`.
Niezalogowany na `/dashboard/recipients` jest przekierowany na `/auth/signin`.

### Key Discoveries:

- RLS dla artykułów NIE pasuje — trzeba write-policies dla `authenticated`
  ([wzorzec do rozszerzenia](supabase/migrations/20260526000000_create_articles_seen.sql)).
- Wzorzec strona→serwis→wyspa: [articles.astro](src/pages/dashboard/articles.astro)
  + [services/articles.ts](src/lib/services/articles.ts) + [ArticlesTable.tsx](src/components/ArticlesTable.tsx).
- Wzorzec API + createClient: [api/auth/signin.ts](src/pages/api/auth/signin.ts).
- Typy domenowe importowane jako `Tables<"...">` z [types/supabase.ts](src/types/supabase.ts).

## What We're NOT Doing

- NIE podłączamy listy do faktycznej wysyłki digestu ([scripts/send.ts](scripts/send.ts)
  nadal czyta `subscribers.json`) — to osobna, przyszła zmiana.
- NIE wprowadzamy systemu ról — każdy zalogowany użytkownik ma pełny dostęp.
- NIE robimy miękkiego usuwania ani archiwum — „Usuń" trwale kasuje wiersz (hard delete).
- NIE dodajemy wyszukiwarki/filtra ani paginacji — tylko sortowanie kolumn (jak ArticlesTable).
- NIE budujemy importu CSV / masowych operacji.

## Implementation Approach

Powtarzamy istniejący wzorzec danych (strona Astro pobiera dane serwisem i renderuje
wyspę React `client:load`), ale dokładamy brakującą warstwę zapisu: JSON API routes
wołane `fetch`-em z wyspy (a nie form-POST+redirect jak auth, bo to interaktywny
komponent z modalami). Walidacja zod współdzielona między API a formularzem. RLS
egzekwuje uprawnienia w bazie.

## Critical Implementation Details

- **RLS jest load-bearing.** Bez czterech polityk dla `authenticated` (SELECT
  istnieje przy artykułach, ale INSERT/UPDATE/DELETE — nie) zapisy z UI zwrócą
  „sukces" bez zmiany wiersza lub błąd RLS. Weryfikacja musi iść przez realny zapis
  z UI na kluczu anon, nie przez Studio/`service_role`.
- **Duplikat emaila** (`UNIQUE(email)`) wraca z Postgresa jako kod `23505` — API
  musi zmapować go na czytelny `409`, nie `500`.
- **Kolejność wdrożenia na produkcji:** migracja (`supabase db push`) przed deployem
  kodu — inaczej strona zwróci błąd „relation does not exist".

## Phase 1: Migracja bazy + RLS + typy

### Overview

Tworzy tabelę `mailing_recipients` z politykami RLS umożliwiającymi roli
`authenticated` pełny CRUD, i regeneruje typy.

### Changes Required:

#### 1. Migracja tabeli

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_mailing_recipients.sql`

**Intent**: Utworzyć tabelę odbiorców i — w odróżnieniu od `articles_seen` — nadać
roli `authenticated` jawne prawa zapisu, bo CRUD idzie z aplikacji webowej na
kluczu anon.

**Contract**: Tabela `mailing_recipients(id uuid pk default gen_random_uuid(),
email text not null unique, name text, status text not null default 'active' check
(status in ('active','unsubscribed')), created_at timestamptz not null default now(),
updated_at timestamptz not null default now())`. `ENABLE ROW LEVEL SECURITY` + cztery
polityki `TO authenticated`: SELECT `USING (true)`, INSERT `WITH CHECK (true)`,
UPDATE `USING (true) WITH CHECK (true)`, DELETE `USING (true)`.

#### 2. Regeneracja typów

**File**: `src/types/supabase.ts`

**Intent**: Dodać `mailing_recipients` do wygenerowanych typów, by `Tables<"mailing_recipients">`
był dostępny dla serwisu, API i komponentów.

**Contract**: Plik generowany — `supabase gen types typescript --project-id <ref>`
(po `supabase link`). Zawiera `Row`/`Insert`/`Update` dla nowej tabeli.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na lokalnej bazie (`npx supabase start` → push/reset)
- Type-check przechodzi po regeneracji: `npm run lint`

#### Manual Verification:

- W Supabase Studio tabela `mailing_recipients` istnieje i ma 4 polityki RLS
- `Tables<"mailing_recipients">` rozwiązuje się w edytorze TS

**Implementation Note**: Po tej fazie i przejściu automatycznej weryfikacji, zatrzymaj
się na potwierdzenie manualne przed kolejną fazą.

---

## Phase 2: Walidacja (zod) + serwis danych

### Overview

Współdzielony schemat walidacji i funkcje dostępu do danych w stylu istniejącego
serwisu artykułów.

### Changes Required:

#### 1. Schemat walidacji

**File**: `src/lib/validators/recipient.ts`

**Intent**: Jedno źródło prawdy o kształcie odbiorcy — używane przez API i formularz.

**Contract**: Eksport zod schema: `email` (`z.string().email()`), `name`
(`z.string().optional()`), `status` (`z.enum(['active','unsubscribed'])`, domyślnie
`active`). Eksport typu wejściowego.

#### 2. Serwis danych

**File**: `src/lib/services/recipients.ts`

**Intent**: CRUD na tabeli, funkcje przyjmują `supabase` (wzorzec [articles.ts](src/lib/services/articles.ts)).

**Contract**: `fetchRecipients(supabase)`, `createRecipient(supabase, data)`,
`updateRecipient(supabase, id, data)`, `deleteRecipient(supabase, id)` — zwracają
wynik Supabase (`{ data, error }`). `update` ustawia `updated_at = now()`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe walidatora przechodzą: `npm run test`
- Type-check + lint przechodzą: `npm run lint`

#### Manual Verification:

- Walidator odrzuca pusty/niepoprawny email i nieznany status

---

## Phase 3: API routes (JSON)

### Overview

Endpointy REST wołane przez wyspę React.

### Changes Required:

#### 1. Kolekcja

**File**: `src/pages/api/recipients/index.ts`

**Intent**: Lista i tworzenie odbiorców z walidacją i kontrolą sesji.

**Contract**: `export const prerender = false`. `GET` → `{ recipients }` (200).
`POST` → waliduje body zod, tworzy, zwraca `{ recipient }` (201). `401` gdy brak
`locals.user`/klienta, `400` przy błędzie walidacji, `409` przy duplikacie emaila
(kod Postgresa `23505`).

#### 2. Element

**File**: `src/pages/api/recipients/[id].ts`

**Intent**: Edycja i usuwanie pojedynczego odbiorcy.

**Contract**: `export const prerender = false`. `PUT` → waliduje, aktualizuje,
zwraca `{ recipient }` (200). `DELETE` → trwale kasuje (200/204). Te same kody
błędów co wyżej; `404` gdy `id` nie istnieje.

### Success Criteria:

#### Automated Verification:

- Lint + type-check przechodzą: `npm run lint`
- (Jeśli dodane) testy endpointów przechodzą: `npm run test`

#### Manual Verification:

- `POST` z duplikatem emaila zwraca 409, nie 500
- Wywołania bez sesji zwracają 401

---

## Phase 4: Komponenty UI (shadcn)

### Overview

Dograć brakujące prymitywy formularza.

### Changes Required:

#### 1. Prymitywy shadcn

**File**: `src/components/ui/{input,label,dialog}.tsx`

**Intent**: Udostępnić pola formularza i modal dla CRUD.

**Contract**: `npx shadcn@latest add input label dialog` (wariant „new-york",
zgodnie z konfiguracją projektu).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Pliki `src/components/ui/{input,label,dialog}.tsx` istnieją

#### Manual Verification:

- Komponenty importują się bez błędów

---

## Phase 5: Komponenty React (wyspy)

### Overview

Tabela odbiorców z akcjami i formularz w modalu.

### Changes Required:

#### 1. Tabela

**File**: `src/components/RecipientsTable.tsx`

**Intent**: Lista odbiorców z sortowaniem (wzorzec [ArticlesTable.tsx](src/components/ArticlesTable.tsx)),
przyciskiem „Dodaj odbiorcę" oraz per-wiersz „Edytuj" / „Usuń". Trzyma listę w
`useState`, po udanym `fetch` aktualizuje stan lokalnie. Usuwanie potwierdzane w `Dialog`.

**Contract**: Props `recipients: Tables<"mailing_recipients">[]`. Kolumny: Email /
Imię / Status / Dodano (sortowalne). Woła `/api/recipients` (POST/PUT/DELETE) `fetch`-em.

#### 2. Formularz

**File**: `src/components/RecipientForm.tsx`

**Intent**: Formularz w `Dialog` do dodawania i edycji, z walidacją po stronie
klienta tym samym schematem zod i obsługą błędów z API (np. duplikat emaila).

**Contract**: Props: tryb (create/edit), opcjonalny rekord, callback po sukcesie.
Pola: email, imię, status. Mapuje 409 na komunikat „email już istnieje".

### Success Criteria:

#### Automated Verification:

- Lint + type-check przechodzą: `npm run lint`

#### Manual Verification:

- Dodanie / edycja / usunięcie działa w UI i odświeża listę
- Walidacja klienta blokuje pusty/niepoprawny email

---

## Phase 6: Strona Astro + nawigacja

### Overview

Spina całość: strona panelu i link z dashboardu.

### Changes Required:

#### 1. Strona odbiorców

**File**: `src/pages/dashboard/recipients.astro`

**Intent**: Pobrać listę serwisem i wyrenderować wyspę; kalka z [articles.astro](src/pages/dashboard/articles.astro).

**Contract**: `createClient(Astro.request.headers, Astro.cookies)` → `fetchRecipients`
→ `<Banner variant="error">` na błąd → `<RecipientsTable recipients={...} client:load />`,
backlink „← Panel". Layout/styl jak articles.astro.

#### 2. Link w panelu

**File**: `src/pages/dashboard.astro`

**Intent**: Dodać link „Odbiorcy" obok „Artykuły".

**Contract**: `<a href="/dashboard/recipients">` w tym samym stylu co istniejący link
([dashboard.astro:17-22](src/pages/dashboard.astro#L17-L22)).

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Panel → „Odbiorcy" otwiera stronę z tabelą
- Niezalogowany na `/dashboard/recipients` → redirect `/auth/signin`
- Pełny obieg CRUD działa end-to-end na realnej bazie (test RLS dla `authenticated`)

---

## Testing Strategy

### Unit Tests:

- Walidator `recipient.ts`: poprawny rekord przechodzi; pusty/niepoprawny email i
  nieznany status odrzucone.
- (Opcjonalnie) serwis na zmockowanym kliencie Supabase.

### Integration / E2E Tests (Playwright, `/10x-e2e`):

- Zalogowana sesja: dodaj → edytuj → usuń odbiorcę (unikalny email z sufiksem
  timestamp; cleanup po teście).
- Niezalogowany na `/dashboard/recipients` → redirect na `/auth/signin`.

### Manual Testing Steps:

1. Zaloguj się, wejdź Panel → Odbiorcy.
2. Dodaj odbiorcę → pojawia się w tabeli i w bazie.
3. Dodaj drugi raz ten sam email → komunikat o duplikacie (409).
4. Edytuj imię/status → zmiana widoczna.
5. Usuń → znika z tabeli i z bazy.
6. Wyloguj, wejdź na `/dashboard/recipients` → redirect na signin.

## Migration Notes

Na produkcji uruchom migrację (`supabase link` → `supabase db push`) PRZED deployem
kodu. Twarde usuwanie jest nieodwracalne — brak ścieżki rollbacku danych.

## References

- Identity: `context/changes/mailing-recipients/change.md`
- Wzorce: [articles.astro](src/pages/dashboard/articles.astro),
  [ArticlesTable.tsx](src/components/ArticlesTable.tsx),
  [services/articles.ts](src/lib/services/articles.ts),
  [api/auth/signin.ts](src/pages/api/auth/signin.ts),
  [migracja articles_seen](supabase/migrations/20260526000000_create_articles_seen.sql)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Migracja bazy + RLS + typy

#### Automated

- [x] 1.1 Migracja aplikuje się czysto na lokalnej bazie — 0666ecc
- [x] 1.2 Type-check przechodzi po regeneracji (`npm run lint`) — 0666ecc

#### Manual

- [x] 1.3 W Studio tabela `mailing_recipients` ma 4 polityki RLS — 0666ecc
- [x] 1.4 `Tables<"mailing_recipients">` rozwiązuje się w TS — 0666ecc

### Phase 2: Walidacja (zod) + serwis danych

#### Automated

- [x] 2.1 Testy jednostkowe walidatora przechodzą (`npm run test`) — 857dc04
- [x] 2.2 Type-check + lint przechodzą (`npm run lint`) — 857dc04

#### Manual

- [x] 2.3 Walidator odrzuca pusty/niepoprawny email i nieznany status — 857dc04

### Phase 3: API routes (JSON)

#### Automated

- [x] 3.1 Lint + type-check przechodzą (`npm run lint`) — 51c20a3
- [x] 3.2 (Jeśli dodane) testy endpointów przechodzą (`npm run test`) — 51c20a3

#### Manual

- [ ] 3.3 `POST` z duplikatem emaila zwraca 409, nie 500
- [ ] 3.4 Wywołania bez sesji zwracają 401

### Phase 4: Komponenty UI (shadcn)

#### Automated

- [x] 4.1 Lint przechodzi (`npm run lint`) — 82a6749
- [x] 4.2 Pliki `src/components/ui/{input,label,dialog}.tsx` istnieją — 82a6749

#### Manual

- [x] 4.3 Komponenty importują się bez błędów — 82a6749

### Phase 5: Komponenty React (wyspy)

#### Automated

- [x] 5.1 Lint + type-check przechodzą (`npm run lint`)

#### Manual

- [ ] 5.2 Dodanie / edycja / usunięcie działa w UI i odświeża listę
- [ ] 5.3 Walidacja klienta blokuje pusty/niepoprawny email

### Phase 6: Strona Astro + nawigacja

#### Automated

- [ ] 6.1 Build przechodzi (`npm run build`)
- [ ] 6.2 Lint przechodzi (`npm run lint`)

#### Manual

- [ ] 6.3 Panel → „Odbiorcy" otwiera stronę z tabelą
- [ ] 6.4 Niezalogowany na `/dashboard/recipients` → redirect `/auth/signin`
- [ ] 6.5 Pełny obieg CRUD działa end-to-end na realnej bazie (RLS dla `authenticated`)
