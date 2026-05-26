# Supabase Dedup Schema — Implementation Plan

## Overview

Pierwsza migracja Supabase: tabela `articles_seen` do śledzenia przetworzonych artykułów per źródło. Umożliwia skryptowi scrapującemu (S-01) atomowe wstawianie i sprawdzanie duplikatów przez `INSERT ON CONFLICT DO NOTHING`. Odblokuje S-01 i S-02.

## Current State Analysis

Supabase skonfigurowany wyłącznie dla auth — brak katalogu `supabase/migrations/`, brak własnych tabel, brak TypeScript typów dla tabel. Produkcyjny projekt Supabase jest połączony (`https://hfiasswaduellpweeloc.supabase.co`). Pakiety `@supabase/supabase-js@^2.99.1` i CLI `supabase@^2.23.4` są już zainstalowane.

## Desired End State

Po zakończeniu tej zmiany:
- `supabase/migrations/20260526000000_create_articles_seen.sql` istnieje i aplikuje się bez błędów
- Tabela `articles_seen` w Supabase ma kolumny: `id` (uuid), `source_url` (text), `article_url` (text), `seen_at` (timestamptz)
- `UNIQUE(source_url, article_url)` umożliwia atomowy dedup przez `INSERT ON CONFLICT DO NOTHING`
- RLS włączone; rola `authenticated` ma SELECT; wszystkie zapisy przez service_role (pomija RLS automatycznie)
- `src/types/supabase.ts` wygenerowany z żywego schematu — S-01 może używać typowanego klienta

Weryfikacja: `npx supabase db push` kończy się kodem 0; `src/types/supabase.ts` zawiera typy dla `articles_seen`.

### Key Discoveries:

- `supabase/migrations/` nie istnieje — katalog powstanie przy tworzeniu pierwszego pliku `.sql`
- `supabase/config.toml` ma `project_id = "10x-astro-starter"`, baza na porcie 54322
- `supabase/seed.sql` skonfigurowany w `config.toml:65` ale nie istnieje — poza zakresem
- `src/env.d.ts:1-5` zawiera tylko `App.Locals.user` — brak Database type
- `.env` (gitignored) zawiera `SUPABASE_URL` i `SUPABASE_KEY` (anon key); service_role key będzie potrzebny w S-01

## What We're NOT Doing

- Brak `seed.sql` — pusta tabela jest poprawnym stanem startowym
- Brak kolumn `article_title` / `article_lead` — te dane pozostają w pamięci podczas scrapingu, nie są persystowane
- Brak kolumny `sent_at` — śledzenie "widziany" (scraped) wystarczy do deduplication; S-02 reużyje ten sam mechanizm
- Brak lokalnej instancji Docker/Supabase — push bezpośrednio do połączonego projektu produkcyjnego
- Brak schematu dla sources ani subscribers — żyją w pliku konfiguracyjnym per FR-001/FR-002

## Implementation Approach

Jeden plik SQL z `CREATE TABLE`, constraintem `UNIQUE`, włączonym RLS i jedną polityką dla roli `authenticated`. Push do produkcji przez `npx supabase db push`. Następnie generowanie typów TS dla type-safety w S-01.

Constraint `UNIQUE(source_url, article_url)` pełni podwójną rolę: indeks dla wydajnych lookupów + mechanizm atomowego dedup. Skrypt scrapujący wykonuje `INSERT ... ON CONFLICT DO NOTHING` i sprawdza `affected rows` żeby wiedzieć, czy artykuł był już widziany.

## Critical Implementation Details

- **service_role bypass**: service_role pomija RLS automatycznie w Supabase — nie wymaga żadnej jawnej polityki. Skrypt scrapujący musi używać service_role key (nie anon key z `SUPABASE_KEY`). Zmienna `SUPABASE_SERVICE_ROLE_KEY` będzie potrzebna w `.env` przy implementacji S-01 — nie jest potrzebna teraz dla samej migracji.
- **Naming constraint**: nadaj explicit nazwę constraintowi (`articles_seen_source_article_unique`) żeby migracje rollback były deterministyczne.

---

## Phase 1: Migration SQL + Apply to Supabase

### Overview

Utwórz plik migracji z definicją tabeli i zaaplikuj do połączonego projektu Supabase.

### Changes Required:

#### 0. CLI auth & project link (jednorazowy prerequisite)

**Intent**: Zalogować CLI do Supabase i zlinkować lokalny projekt z produkcyjnym projektem Supabase, żeby `supabase db push` wiedział, do którego projektu wysłać migrację.

**Contract**:
```
npx supabase login
npx supabase link --project-ref hfiasswaduellpweeloc
```
`supabase login` otwiera OAuth w przeglądarce (jednorazowo per maszyna). `supabase link` tworzy `.supabase/` w katalogu projektu z `project_id`. Jeśli `.supabase/` już istnieje, ten krok można pominąć.

#### 1. Migration file

**File**: `supabase/migrations/20260526000000_create_articles_seen.sql`

**Intent**: Definiuje tabelę `articles_seen` umożliwiającą skryptowi atomowe zapisywanie i sprawdzanie przetworzonych artykułów per źródło.

**Contract**:

```sql
CREATE TABLE articles_seen (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url text        NOT NULL,
  article_url text       NOT NULL,
  seen_at    timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT articles_seen_source_article_unique UNIQUE (source_url, article_url)
);

ALTER TABLE articles_seen ENABLE ROW LEVEL SECURITY;

-- authenticated może SELECT (przyszłe zapytania admina); anon zablokowany domyślnie
-- service_role pomija RLS automatycznie — nie wymaga jawnej polityki
CREATE POLICY "authenticated can select"
  ON articles_seen FOR SELECT TO authenticated USING (true);
```

### Success Criteria:

#### Automated Verification:

- `.supabase/` directory istnieje (projekt zlinkowany: `supabase link --project-ref hfiasswaduellpweeloc`)
- Plik `supabase/migrations/20260526000000_create_articles_seen.sql` istnieje
- `npx supabase db push` kończy się kodem 0

#### Manual Verification:

- Tabela `articles_seen` widoczna w Supabase Table Editor z kolumnami: id, source_url, article_url, seen_at
- RLS włączone na tabeli (toggle ON w Table Editor)
- Policy "authenticated can select" widoczna w zakładce Policies

**Implementation Note**: Po zakończeniu tej fazy i weryfikacji automatycznej, poczekaj na potwierdzenie manualnej weryfikacji przed przejściem do Phase 2.

---

## Phase 2: Generate TypeScript Types

### Overview

Wygeneruj TypeScript typy z żywego schematu Supabase, żeby S-01 mógł używać typowanego klienta.

### Changes Required:

#### 0. Utwórz katalog `src/types/`

**Intent**: Shell redirect `>` nie tworzy katalogów nadrzędnych — katalog musi istnieć przed wygenerowaniem typów.

**Contract**:
```powershell
New-Item -ItemType Directory -Force src\types
```
(lub `mkdir -p src/types` w bash). Jeśli katalog już istnieje, komenda kończy się sukcesem bez zmian.

#### 1. TypeScript types file

**File**: `src/types/supabase.ts`

**Intent**: Auto-generowany plik z typami dla wszystkich tabel Supabase. Skrypt scrapujący (S-01) zaimportuje typ `Database` dla type-safe zapytań do `articles_seen`.

**Contract**: Plik generowany komendą:
```
npx supabase gen types typescript --project-id hfiasswaduellpweeloc > src/types/supabase.ts
```
Eksportuje typ `Database` z kształtami `public.Tables.articles_seen.Row`, `.Insert`, `.Update`. W Insert: `id` i `seen_at` są opcjonalne (mają DEFAULTs).

### Success Criteria:

#### Automated Verification:

- `src/types/supabase.ts` istnieje i jest niepusty
- `npm run lint` przechodzi bez błędów
- `npm run build` przechodzi

#### Manual Verification:

- `src/types/supabase.ts` zawiera definicję `articles_seen` z polami: id, source_url, article_url, seen_at
- Typ `Insert` dla `articles_seen` ma `id` i `seen_at` jako opcjonalne

---

## Testing Strategy

### Manual Testing Steps:

1. Po `npx supabase db push`: otwórz Supabase project → Table Editor → potwierdź tabelę `articles_seen`
2. Sprawdź RLS: toggle powinien być ON w Table Editor
3. Sprawdź polityki: zakładka Policies → "authenticated can select" widoczna
4. Po `supabase gen types`: otwórz `src/types/supabase.ts` → szukaj `articles_seen`

## Migration Notes

Pierwsza migracja projektu. Katalog `supabase/migrations/` tworzy się automatycznie przy tworzeniu pierwszego pliku. Rollback: usuń tabelę przez `DROP TABLE articles_seen;` jeśli potrzeba cofnąć — nie ma danych do stracenia.

## References

- PRD: `context/foundation/prd.md` — FR-004, §Business Logic
- Roadmap: `context/foundation/roadmap.md` — F-01, acceptance criteria
- CLAUDE.md — naming migrations, RLS requirement

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration SQL + Apply to Supabase

#### Automated

- [x] 1.1 `.supabase/` directory istnieje (projekt zlinkowany) — 453432f
- [x] 1.2 Plik `supabase/migrations/20260526000000_create_articles_seen.sql` istnieje — 453432f
- [x] 1.3 `npx supabase db push` kończy się kodem 0 — 453432f

#### Manual

- [x] 1.4 Tabela `articles_seen` widoczna w Supabase z kolumnami: id, source_url, article_url, seen_at — 453432f
- [x] 1.5 RLS włączone na tabeli — 453432f
- [x] 1.6 Policy "authenticated can select" widoczna w zakładce Policies — 453432f

### Phase 2: Generate TypeScript Types

#### Automated

- [x] 2.1 `src/types/supabase.ts` istnieje i jest niepusty
- [x] 2.2 `npm run lint` przechodzi
- [x] 2.3 `npm run build` przechodzi

#### Manual

- [x] 2.4 `src/types/supabase.ts` zawiera typy dla `articles_seen` z polami: id, source_url, article_url, seen_at
- [x] 2.5 Typ `Insert` dla `articles_seen` ma `id` i `seen_at` jako opcjonalne
