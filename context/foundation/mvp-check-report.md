# Raport analizy MVP — 10xBuilder

> Wykonano wg promptu `.claude/prompts/mvp-check.md` (lekcja m0l0).
> Branch: `master` · Data: 2026-06-29
> Bramki w chwili analizy: `npm test` → 18/18 ✅ · `npm run build` → Complete ✅

**Domena projektu (wywnioskowana z plików):** aplikacja webowa (Astro SSR +
Supabase, deploy Cloudflare Workers) — agregator artykułów: scraper HTML →
deduplikacja → wysyłka digestu mailem do listy odbiorców, zarządzanej z panelu
przez Administratora. Źródło: `context/foundation/prd.md`.

---

## 1. Checklist

### 1. Akcje CRUD — ✅

Pełny CRUD na encji `mailing_recipients`, działający na danych trwałych (Supabase):

- **Create** — `POST` w `src/pages/api/recipients/index.ts:22` → `createRecipient` (`src/lib/services/recipients.ts:11`, `.insert(...)`)
- **Read** — `GET` w `src/pages/api/recipients/index.ts:10` → `fetchRecipients` (`src/lib/services/recipients.ts:7`, `.select(...)`)
- **Update** — `PUT` w `src/pages/api/recipients/[id].ts:10` → `updateRecipient` (`src/lib/services/recipients.ts:19`, `.update(...).eq("id", id)`)
- **Delete** — `DELETE` w `src/pages/api/recipients/[id].ts:39` → `deleteRecipient` (`src/lib/services/recipients.ts:33`, `.delete().eq("id", id)`)

Wszystkie cztery operacje istnieją dla jednego typu encji i działają na danych
zapisanych w bazie. Wejście walidowane (zod, `src/lib/validators/recipient.ts`).

### 2. Logika biznesowa — ✅

Wiele funkcji wykraczających poza CRUD, stanowiących rdzeń wartości produktu:

- **Deduplikacja artykułów** — `processSource` (`scripts/scrape.ts:51`): upsert
  `onConflict: "source_url,article_url", ignoreDuplicates` + wyliczanie
  `newCount`/`duplicateCount` (linie 108–126).
- **Wyprowadzanie selektora karty** ze wspólnego prefiksu — `commonContainer` /
  `relativeToContainer` (`scripts/scrape.ts:31-49`).
- **Budowa digestu** — grupowanie artykułów po hoście, składanie HTML, filtr
  bezpiecznych schematów URL (`scripts/send.ts:33-69`, `runDigest`).

Kwalifikuje się jako „data transformations / integrations that process data".

### 3. Testy adresujące zdefiniowane ryzyko — ✅

Dokument planu: `context/foundation/test-plan.md` (mapa ryzyk §2). Testy
realizujące konkretne ryzyka:

- **Ryzyko #1** (scraper zwraca pusty/śmieciowy wynik przy zmianie HTML) →
  `tests/scraper.test.ts` (walidacja niepustego title+URL, zachowanie przy
  pustych selektorach).
- **Ryzyko #2** (cicha awaria wysyłki — błąd Resend niepropagowany) →
  `tests/send.test.ts` (`runDigest` zwraca `failedCount` przy błędzie Resend).
- **Ryzyko #3** (duplikat artykułu) → `tests/scraper.test.ts` (ścieżka
  `duplicateCount > 0`).
- **Ryzyko #7** (guard middleware na `/auth/reset-password`) → `e2e/seed.spec.ts`.

18 testów, wszystkie zielone. Realne testy mapują się na nazwane ryzyka z planu.

### 4. Autentykacja powiązana z użytkownikiem — ✅

- Logowanie Supabase (SSR, sesja cookie): `src/lib/supabase.ts`,
  `src/pages/api/auth/{signin,signup,signout}.ts`.
- `src/middleware.ts` ustala `context.locals.user` i chroni `PROTECTED_ROUTES`
  (`/dashboard`); niezalogowani są przekierowani na `/auth/signin`.
- Każdy endpoint API odbiorców sprawdza `context.locals.user` (401 bez sesji).
- RLS włączone na obu tabelach; rola `anon` zablokowana domyślnie.

**Uzasadnienie modelu (klauzula łagodna z promptu, pkt 4):** PRD definiuje
jedną personę z dostępem — **Administratora** zarządzającego grupą; Subskrybent
celowo nie ma panelu. Pojedynczy operator to uzasadniona decyzja projektowa dla
tej domeny, a system sensownie identyfikuje i autoryzuje użytkownika (login +
guard + kontrola sesji w API). Zasoby są zawężone do roli `authenticated`.

### 5. Dokumentacja — ✅

`context/foundation/` zawiera pełną podstawę 10x z realną treścią (bez
placeholderów):

- `prd.md` — wizja, persony, kryteria sukcesu, zakres
- `shape-notes.md`, `roadmap.md`, `tech-stack.md`, `infrastructure.md`,
  `lessons.md`, `test-plan.md`
- `README.md` (root) — opis projektu, stack, instrukcja uruchomienia i
  konfiguracji Supabase

---

## 2. Status projektu

**5 / 5 spełnionych = 100%** ✅

Minimalny próg techniczny czysty — brak oczywistych luk.

---

## 3. Priority Improvements

Brak kryteriów niespełnionych — żadne poprawki nie są wymagane do przejścia
progu.

**Ponad minimum (warte wzmianki przy zgłoszeniu):** integracja Sentry,
testy e2e Playwright, testy mutacyjne Stryker, pipeline CI (lint + build).
Opcjonalne wyróżniki na przyszłość: prawdziwy multi-tenant (własność zasobów
per-użytkownik) oraz funkcja AI (np. sugerowanie priorytetu artykułu przez
Cloudflare Workers AI) — niewymagane do certyfikatu.
