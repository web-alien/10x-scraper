# Scraper Script Implementation Plan

## Overview

Dodanie skryptu `npm run scrape` do projektu 10xScraper. Skrypt ładuje `sources.json` z konfiguracją źródeł (URL + selektory CSS), scrapuje każde źródło przez natywny `fetch` + `cheerio`, deduplikuje artykuły przez Supabase (`articles_seen`), i wypisuje statystyki na stdout.

## Current State Analysis

- `scripts/` — folder istnieje, pusty — to tu trafi skrypt
- `@supabase/supabase-js` v2.99.1 — zainstalowany
- `src/lib/supabase.ts` — używa `@supabase/ssr` z Astro cookies — **nie nadaje się do skryptów standalone**; potrzebny nowy standalone client
- `SUPABASE_KEY` w `.env` — klucz publishable; INSERT do `articles_seen` wymaga service_role (RLS: tylko service_role może pisać)
- Brak: `tsx` (runner TS), `cheerio` (HTML parser), `dotenv` (env vars poza Astro) — do dodania
- Node.js v22 — natywny `fetch()` dostępny, nie trzeba axios/node-fetch
- `"type": "module"` w `package.json` — tylko ES imports

## Desired End State

`npm run scrape` uruchamia TypeScript skrypt, ładuje `sources.json` z katalogu głównego projektu, scrapuje źródła, insertuje nowe artykuły do `articles_seen` i wypisuje:

```
example-blog.pl: 5 nowych, 3 duplikatów
other-site.com: 2 nowe, 0 duplikatów
---
Łącznie: 7 nowych, 3 duplikatów
```

Błędy per źródło trafiają na stderr, skrypt kontynuuje; exit code 0 jeśli ≥1 źródło udało się przetworzyć.

### Key Discoveries

- `src/lib/supabase.ts:1–24` — client Astro SSR, nie reusable ze skryptu
- `src/types/supabase.ts` — `TablesInsert<'articles_seen'>` = `{ source_url: string, article_url: string, id?: string, seen_at?: string }`
- `supabase/migrations/20260526000000_create_articles_seen.sql` — UNIQUE(source_url, article_url); INSERT wymaga service_role
- `package.json` — `"type": "module"`, brak `tsx`/`cheerio`/`dotenv`

## What We're NOT Doing

- Nie obsługujemy JavaScript-rendered stron (playwright/Puppeteer) — tylko statyczny HTML
- Nie zapisujemy treści artykułów w DB — tylko `source_url` + `article_url` w `articles_seen`
- Nie implementujemy wysyłki maila (to S-02: `email-digest-script`)
- Nie tworzymy UI do zarządzania źródłami (v2)
- Nie uruchamiamy automatycznie (cron) — manual only (v2)
- Nie generujemy AI-podsumowań (v2)

## Implementation Approach

Dwa nowe pliki główne: `src/lib/supabase-script.ts` (standalone client factory bez Astro SSR — reusable w S-02) oraz `scripts/scrape.ts` (cała logika scrapera). Config `sources.json` walidowany przez Zod na starcie skryptu. Dwie fazy: setup (zależności + szkielet) → pełna implementacja.

## Critical Implementation Details

**ON CONFLICT DO NOTHING w supabase-js v2**: `.insert()` nie obsługuje konfliktów. Użyj `.upsert(rows, { onConflict: 'source_url,article_url', ignoreDuplicates: true }).select('id')` — generuje `ON CONFLICT (source_url, article_url) DO NOTHING`. `data?.length` po upsert = liczba faktycznie wstawionych wierszy.

**Env vars w standalone skrypcie**: `astro:env/server` nie działa poza Astro. Skrypt czyta z `process.env`. Importuj `dotenv/config` jako pierwszą linię skryptu — ładuje `.env` automatycznie.

---

## Phase 1: Setup i szkielet

### Overview

Dodanie zależności npm, wpisu `npm run scrape` do `package.json`, env vara do `.env.example`, przykładowego `sources.example.json` i minimalnego szkieletu skryptu który uruchamia się bez błędu.

### Changes Required

#### 1. package.json — zależności i skrypt

**File**: `package.json`

**Intent**: Dodać `tsx`, `cheerio` i `dotenv` do `devDependencies`; dodać skrypt `"scrape"` uruchamiający `scripts/scrape.ts`.

**Contract**: W sekcji `devDependencies` dodaj: `"tsx": "^4.19.4"`, `"cheerio": "^1.0.0"`, `"dotenv": "^16.5.0"`. W sekcji `scripts` dodaj: `"scrape": "tsx scripts/scrape.ts"`.

#### 2. .env.example — nowy env var

**File**: `.env.example`

**Intent**: Udokumentować `SUPABASE_SERVICE_ROLE_KEY` jako wymagany env var dla skryptów backendowych.

**Contract**: Dodaj na końcu pliku:
```
# Service role key — required for scraper/email scripts (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=
```

#### 3. sources.example.json — szablon konfiguracji źródeł

**File**: `sources.example.json` (NEW, w katalogu głównym projektu)

**Intent**: Dostarczyć dokumentację i szablon formatu `sources.json` z przykładowym źródłem. Użytkownik kopiuje ten plik do `sources.json` i wypełnia własnymi źródłami.

**Contract**: Tablica obiektów z polami `name` (string), `url` (string — URL strony do scrapowania), `selectors.articleLink` (string — selektor CSS elementu `<a>`; jego `textContent` = tytuł, `href` = URL artykułu), `selectors.lead` (string | opcjonalny — selektor CSS akapitu z leadem).

```json
[
  {
    "name": "Example Blog",
    "url": "https://blog.example.com",
    "selectors": {
      "articleLink": ".post-list .post-title a",
      "lead": ".post-list .post-excerpt"
    }
  }
]
```

#### 4. scripts/scrape.ts — szkielet

**File**: `scripts/scrape.ts` (NEW)

**Intent**: Minimalny szkielet: import dotenv, wypisz "Scraper starting…", exit 0. Cel: potwierdzić że `npm run scrape` działa przed pełną implementacją.

**Contract**: Plik ESM (`import` nie `require`); pierwsza linia `import 'dotenv/config'`.

### Success Criteria

#### Automated Verification

- `npm install` po dodaniu nowych devDependencies exituje z kodem 0
- `npm run build` exituje z kodem 0 (brak regresji w Astro buildzie)
- `npm run lint` exituje z kodem 0

#### Manual Verification

- `npm run scrape` uruchamia się i exituje 0 z wyjściem "Scraper starting…"

**Implementation Note**: Po przejściu automated checks, poczekaj na potwierdzenie manual verification od użytkownika przed przejściem do Phase 2.

---

## Phase 2: Pełna implementacja scrapera

### Overview

Implementacja wszystkich komponentów: standalone Supabase client, Zod schema dla config, scraping przez fetch + cheerio, normalizacja URL, upsert z ON CONFLICT, obsługa błędów per źródło, statystyki na stdout.

### Changes Required

#### 1. src/lib/supabase-script.ts — standalone client

**File**: `src/lib/supabase-script.ts` (NEW)

**Intent**: Stworzyć factory function do tworzenia klienta Supabase dla skryptów standalone (bez Astro SSR). Reusable w S-02 (`email-digest-script`).

**Contract**: Eksportuj `createScriptClient(url: string, serviceRoleKey: string)` zwracające `SupabaseClient<Database>` z `@supabase/supabase-js`. Importuje `Database` z `src/types/supabase.ts` (alias `@/types/supabase`). Brak cookie managementu.

#### 2. scripts/scrape.ts — pełna implementacja

**File**: `scripts/scrape.ts` (REPLACE szkielet)

**Intent**: Kompletna logika scrapera: ładowanie i walidacja config, scraping per źródło, normalizacja URL, deduplication przez Supabase, obsługa błędów, statystyki.

**Contract**: Moduł ESM. Struktura logiczna:

1. **Config loading**: `JSON.parse(readFileSync('sources.json', 'utf-8'))` walidowany przez Zod schema `SourceConfigSchema` (`z.array(z.object({ name: z.string(), url: z.string().url(), selectors: z.object({ articleLink: z.string(), lead: z.string().optional() }) }))`). Jeśli plik nie istnieje lub schema nie przejdzie — wypisz błąd na stderr i `process.exit(1)`.

2. **Supabase client**: `createScriptClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` z `src/lib/supabase-script.ts`. Jeśli brak env varów — wypisz błąd i `process.exit(1)`.

3. **Per-source loop** (sekwencyjny, nie równoległy): dla każdego źródła w try/catch:
   - `fetch(source.url)` z timeoutem (AbortController, 10s); przy błędzie — `console.error` i `continue`
   - `cheerio.load(html)` → `$(selectors.articleLink)` → iteracja po elementach
   - Dla każdego elementu: `text()` = tytuł, `attr('href')` = rawHref
   - Normalizacja URL: `new URL(rawHref, source.url).href` (obsłuż błędne URL-e przez try/catch — pomiń element)
   - Lead (opcjonalny): `$(selectors.lead).eq(index).text().trim()` — może być pusty string
   - Zbierz `articles: Array<{ source_url, article_url, title, lead }>` — ale do DB wstawiamy tylko `{ source_url, article_url }` (tabela `articles_seen` nie ma kolumn title/lead)

4. **Upsert do Supabase**: `.upsert(dbRows, { onConflict: 'source_url,article_url', ignoreDuplicates: true }).select('id')` — `data?.length` = nowe artykuły, `articles.length - data?.length` = duplikaty

5. **Stats output**: po pętli wypisz per-source stats, potem podsumowanie

**Note**: `articles_seen` przechowuje tylko URL artykułu (nie tytuł/lead) — to wystarczy do deduplication. Tytuł i lead będą pobierane ponownie przy wysyłce S-02 (lub S-02 użyje danych z tego przebiegu w przyszłości, ale teraz nie ma tabeli na te dane). Dla MVP: stat output zawiera tytuł; do DB idzie tylko URL.

### Success Criteria

#### Automated Verification

- `npm run build` exituje z kodem 0 (brak regresji)
- `npm run lint` exituje z kodem 0 na nowych plikach
- TypeScript nie zgłasza błędów typów na `scripts/scrape.ts` i `src/lib/supabase-script.ts` (sprawdź przez `npx tsc --noEmit`)

#### Manual Verification

- `npm run scrape` z poprawnym `sources.json` i ustawionymi env varami wypisuje statystyki per źródło
- Drugie uruchomienie tego samego `npm run scrape` wypisuje 0 nowych (deduplication działa)
- Źródło z błędnym URL wypisuje ostrzeżenie na stderr; pozostałe źródła są scrapowane normalnie
- Nowe artykuły z pierwszego uruchomienia widać w tabeli `articles_seen` w Supabase dashboard

**Implementation Note**: Po przejściu automated checks, poczekaj na potwierdzenie manual verification od użytkownika.

---

## Testing Strategy

### Manual Testing Steps

1. Skopiuj `sources.example.json` do `sources.json`, wpisz realne źródło i selektory
2. Upewnij się że `.env` zawiera `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. Uruchom `npm run scrape` — sprawdź stats na stdout
4. Sprawdź tabelę `articles_seen` w Supabase dashboard
5. Uruchom `npm run scrape` ponownie — stats powinny pokazać 0 nowych
6. Zmień URL jednego źródła na błędny (np. `https://invalid-host-xyz.com`) — sprawdź stderr i że inne źródła nadal działają

## References

- PRD: `context/foundation/prd.md` — FR-001, FR-003, FR-004, US-01
- Roadmap: `context/foundation/roadmap.md` — S-01
- Migration: `supabase/migrations/20260526000000_create_articles_seen.sql`
- Supabase types: `src/types/supabase.ts`
- Existing Supabase client (SSR): `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Setup i szkielet

#### Automated

- [x] 1.1 npm install exituje z kodem 0 po dodaniu nowych devDependencies — 382b79c
- [x] 1.2 npm run build exituje z kodem 0 (brak regresji) — 382b79c
- [x] 1.3 npm run lint exituje z kodem 0 — 382b79c

#### Manual

- [x] 1.4 npm run scrape uruchamia się i exituje 0 z wyjściem "Scraper starting…" — 382b79c

### Phase 2: Pełna implementacja scrapera

#### Automated

- [x] 2.1 npm run build exituje z kodem 0 (brak regresji) — 323541a
- [x] 2.2 npm run lint exituje z kodem 0 na nowych plikach — 323541a
- [x] 2.3 npx tsc --noEmit nie zgłasza błędów typów — 323541a

#### Manual

- [x] 2.4 npm run scrape z poprawnym sources.json wypisuje statystyki per źródło — 323541a
- [x] 2.5 Drugie uruchomienie wypisuje 0 nowych (deduplication działa) — 323541a
- [x] 2.6 Błędne źródło wypisuje ostrzeżenie na stderr; inne źródła są scrapowane normalnie — 323541a
- [x] 2.7 Nowe artykuły widoczne w tabeli articles_seen w Supabase dashboard — 323541a
