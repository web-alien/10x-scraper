# Codzienny digest z tabeli mailing_recipients — Implementation Plan

## Overview

Przełączamy codzienny mailing (`scripts/send.ts`, odpalany cronem w GitHub Actions)
z czytania listy odbiorców z pliku `subscribers.json` na czytanie z tabeli
`mailing_recipients` (tylko `status = 'active'`). Tabela — zarządzana z panelu
`/dashboard/recipients` — staje się **jedynym źródłem prawdy** o odbiorcach.
Domyka to dług F4 z przeglądu zmiany `mailing-recipients`.

## Current State Analysis

- [scripts/send.ts](scripts/send.ts) w bloku startowym (`if (process.argv[1] === __filename)`)
  czyta `subscribers.json` przez `readFileSync` i waliduje `z.array(z.email())`,
  potem woła `runDigest(articles, subscribers, resend, supabase, fromEmail)`.
- `runDigest(...)` przyjmuje **listę adresów jako parametr** (`string[]`) i jest pokryty
  testami ([tests/send.test.ts](tests/send.test.ts)) — sama logika wysyłki nie musi się zmieniać.
- Skrypt ma już typowanego klienta `service_role`: `createScriptClient(url, serviceRoleKey)`
  zwraca `SupabaseClient<Database>` ([src/lib/supabase-script.ts](src/lib/supabase-script.ts)),
  więc może odpytać `mailing_recipients` z type-safety (bez RLS — service_role pomija RLS).
- Tabela `mailing_recipients` istnieje (kolumny `email`, `status` z `active`/`unsubscribed`).
- CI: [.github/workflows/daily-digest.yml](.github/workflows/daily-digest.yml) ma krok
  `echo '${{ secrets.SUBSCRIBERS_JSON }}' > subscribers.json` przed `npm run send`.
- Skrypt już ma wzorzec „brak danych → exit 0": przy zero artykułów loguje i `process.exit(0)`.

## Desired End State

Codzienny automat pobiera aktywnych odbiorców z `mailing_recipients`. Kto jest na
liście (status `active`) — dostaje mail; kogo usunięto/oznaczono `unsubscribed` —
nie dostaje. `subscribers.json` przestaje mieć jakikolwiek wpływ na wysyłkę. Gdy
brak aktywnych odbiorców, automat loguje informację i kończy się sukcesem (bez wysyłki).

### Key Discoveries:

- `runDigest` jest agnostyczne wobec źródła listy — zmieniamy tylko skąd bierze się `string[]`
  ([scripts/send.ts](scripts/send.ts), blok startowy).
- Typowany klient skryptowy pozwala na `.from("mailing_recipients").select("email").eq("status","active")`.
- Wzorzec „pusto → exit 0" już istnieje w skrypcie (gałąź braku artykułów) — naśladujemy go.

## What We're NOT Doing

- NIE zmieniamy logiki `runDigest` ani jego sygnatury (testy zostają ważne).
- NIE usuwamy plików `subscribers.json` / `subscribers.example.json` ani wpisu w `.gitignore`
  (zostają jako legacy — świadoma decyzja).
- NIE dodajemy fallbacku do `subscribers.json` — źródłem jest wyłącznie tabela.
- NIE usuwamy sekretu `SUBSCRIBERS_JSON` z poziomu kodu (to ręczna operacja w ustawieniach repo — tylko odnotowujemy).
- NIE dotykamy panelu ani API odbiorców (gotowe w zmianie `mailing-recipients`).

## Implementation Approach

Wydzielamy mały, testowalny helper pobierający aktywne adresy z tabeli i podmieniamy
w bloku startowym `send.ts` odczyt pliku na wywołanie helpera. Zero aktywnych →
log + `exit 0` (jak przy braku artykułów). `runDigest` i jego testy nietknięte.
Osobno czyścimy krok CI tworzący `subscribers.json`.

## Phase 1: Źródło odbiorców w send.ts

### Overview

`send.ts` czyta aktywnych odbiorców z `mailing_recipients` zamiast z `subscribers.json`.

### Changes Required:

#### 1. Helper pobierający aktywne adresy

**File**: `scripts/send.ts`

**Intent**: Wydzielić testowalną funkcję, która z klienta Supabase zwraca listę
e-maili aktywnych odbiorców — żeby blok startowy był prosty, a logikę dało się
przetestować jednostkowo.

**Contract**: Eksport `fetchActiveRecipientEmails(supabase: SupabaseClient<Database>): Promise<string[]>`
— wykonuje `.from("mailing_recipients").select("email").eq("status","active")`,
rzuca/propaguje błąd zapytania, zwraca tablicę `email`.

#### 2. Blok startowy czyta z tabeli

**File**: `scripts/send.ts`

**Intent**: Zastąpić odczyt i walidację `subscribers.json` wywołaniem helpera; przy
zero aktywnych odbiorców zalogować i zakończyć sukcesem; usunąć już zbędny odczyt pliku
(oraz `SubscribersSchema`/`readFileSync`, jeśli nie są używane gdzie indziej).

**Contract**: W gałęzi startowej: po pobraniu artykułów pobrać `emails = await fetchActiveRecipientEmails(supabase)`;
jeśli `emails.length === 0` → `console.log(...)` + `process.exit(0)`; w przeciwnym razie
`runDigest(articles, emails, resend, supabase, fromEmail)`. Błąd zapytania → log + `process.exit(1)`.
Wymagane env bez zmian (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_*`).

#### 3. Test helpera / ścieżki pustej listy

**File**: `tests/send.test.ts`

**Intent**: Dodać test jednostkowy dla `fetchActiveRecipientEmails` na zmockowanym
kliencie (zwraca adresy; pusta lista zwraca `[]`), nie naruszając istniejących testów `runDigest`.

**Contract**: Nowy `describe`/`it` z mockiem `from().select().eq()` zwracającym
`{ data: [{email}], error: null }` oraz wariant pusty `{ data: [], error: null }`.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą (stare + nowe): `npm run test`
- Lint + type-check: `npm run lint`

#### Manual Verification:

- Lokalnie z `.env` (service_role): `npm run send` wysyła do `okres123@gmail.com` (jedyny aktywny w tabeli) i loguje liczbę odbiorców z tabeli
- Po oznaczeniu jedynego odbiorcy jako `unsubscribed` w panelu: `npm run send` loguje „brak odbiorców" i kończy się bez wysyłki (exit 0)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na
potwierdzenie manualne przed kolejną fazą.

---

## Phase 2: Sprzątanie CI

### Overview

Usunięcie martwego kroku tworzącego `subscribers.json` z workflow.

### Changes Required:

#### 1. Workflow daily-digest

**File**: `.github/workflows/daily-digest.yml`

**Intent**: Usunąć krok `echo '${{ secrets.SUBSCRIBERS_JSON }}' > subscribers.json`,
bo skrypt nie czyta już pliku. Dopisać krótki komentarz, że odbiorcy pochodzą z tabeli
`mailing_recipients`, a sekret `SUBSCRIBERS_JSON` jest do usunięcia ręcznie w ustawieniach repo.

**Contract**: Usunięta jedna linia `run:`; pozostałe kroki (`sources.json`, `scrape`, `send`)
i env (`SUPABASE_SERVICE_ROLE_KEY` itd.) bez zmian.

### Success Criteria:

#### Automated Verification:

- Workflow YAML jest poprawny (brak odwołań do `subscribers.json` poza ewentualnym komentarzem): `git grep -n "subscribers.json" .github/`

#### Manual Verification:

- Ręczne uruchomienie workflow (workflow_dispatch) kończy się sukcesem i wysyła do aktywnych odbiorców z tabeli
- (Po stronie repo) sekret `SUBSCRIBERS_JSON` usunięty z ustawień GitHub

---

## Testing Strategy

### Unit Tests:

- `fetchActiveRecipientEmails`: zwraca adresy z `data`; pusta lista → `[]`; błąd → propagacja.
- Istniejące testy `runDigest` pozostają bez zmian (regresja sygnatury).

### Manual Testing Steps:

1. `npm run send` lokalnie → mail dochodzi do `okres123@gmail.com`; log pokazuje liczbę odbiorców z tabeli.
2. W panelu oznacz odbiorcę `unsubscribed` → `npm run send` → „brak odbiorców", exit 0, brak maila.
3. Przywróć `active` → ponowny `npm run send` wysyła.

## Migration Notes

Brak migracji bazy. Po wdrożeniu: usuń sekret `SUBSCRIBERS_JSON` w ustawieniach repo
(GitHub → Settings → Secrets). Plik `subscribers.json` zostaje jako legacy (nieużywany).
Odwrót: przywrócenie odczytu pliku w bloku startowym + kroku CI.

## References

- Źródło: F4 z `context/changes/mailing-recipients/reviews/impl-review.md`
- Pliki: [scripts/send.ts](scripts/send.ts), [tests/send.test.ts](tests/send.test.ts),
  [src/lib/supabase-script.ts](src/lib/supabase-script.ts),
  [.github/workflows/daily-digest.yml](.github/workflows/daily-digest.yml),
  [src/lib/services/recipients.ts](src/lib/services/recipients.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Źródło odbiorców w send.ts

#### Automated

- [x] 1.1 Testy przechodzą (stare + nowe) (`npm run test`) — 8a7ea84
- [x] 1.2 Lint + type-check (`npm run lint`) — 8a7ea84

#### Manual

- [x] 1.3 `npm run send` wysyła do aktywnego odbiorcy z tabeli i loguje ich liczbę — 8a7ea84
- [x] 1.4 Zero aktywnych → log „brak odbiorców" + exit 0, brak wysyłki — 8a7ea84

### Phase 2: Sprzątanie CI

#### Automated

- [x] 2.1 Brak odwołań do `subscribers.json` w `.github/` (poza komentarzem) (`git grep`)

#### Manual

- [ ] 2.2 Ręczne uruchomienie workflow kończy się sukcesem i wysyła do odbiorców z tabeli
- [ ] 2.3 Sekret `SUBSCRIBERS_JSON` usunięty z ustawień GitHub
