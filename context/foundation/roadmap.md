---
project: 10xScraper
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-30
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: 10xScraper

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices listed in dependency order. The "At a glance" table is the index.

## Vision recap

Ręczne śledzenie wielu serwisów internetowych jest czasochłonne, a wiele źródeł nie udostępnia kanałów RSS. 10xScraper automatycznie scrapuje zadane strony (przez selektory HTML), pobiera tytuły i leady najnowszych artykułów i rozsyła codzienny digest mailowy do listy subskrybentów zarządzanej przez administratora. MVP jest narzędziem skryptowym: brak webowego UI, konfiguracja przez plik, uruchamianie ręczne przez administratora.

## North star

**S-02: Admin może uruchomić wysyłkę i wszyscy subskrybenci otrzymują maila z nowymi artykułami**

> Gwiazda przewodnia to najmniejszy end-to-end przepływ, który udowadnia, że produkt robi to do czego powstał — umieszczony jak najwcześniej w kolejności, bo wszystko inne traci sens jeśli ten przepływ nie działa. S-02 zamyka pętlę scraping → deduplication → email i spełnia jedyne primary success criterion PRD.

## At a glance

| ID   | Change ID             | Outcome (admin może …)                                               | Prerequisites | PRD refs                      | Status   |
|------|-----------------------|----------------------------------------------------------------------|---------------|-------------------------------|----------|
| F-01 | supabase-dedup-schema    | (foundation) tabela `articles_seen` gotowa w Supabase                | —             | FR-004, §Business Logic       | done     |
| S-01 | scraper-script           | uruchomić scraping i zobaczyć nowe artykuły z każdego źródła         | F-01          | FR-001, FR-003, FR-004, US-01 | done     |
| S-02 | email-digest-script      | uruchomić wysyłkę i subskrybenci otrzymują digest mailowy            | S-01          | FR-002, FR-005, FR-006, US-01 | done     |
| S-03 | auto-digest-cron         | zapomnieć o ręcznym uruchamianiu — scraping i wysyłka codziennie same | S-02         | FR-003 (note: cron v2)        | proposed |
| S-04 | articles-dashboard       | zalogować się i zobaczyć zebranych artykuły + status wysyłki w UI    | S-02          | —                             | proposed |

## Baseline

Stan kodu na 2026-05-25 (auto-zbadany + potwierdzony). Foundations poniżej zakładają, że obecne warstwy są na miejscu i nie reskafoldują ich od zera.

- **Frontend:** PRESENT — Astro 6 + React 19, Tailwind 4; `src/pages/`, `src/components/`
- **Backend/API:** PRESENT — Astro SSR, 3 auth API routes, middleware; `src/pages/api/auth/`, `src/middleware.ts`
- **Data:** ABSENT — Supabase skonfigurowany tylko dla auth; brak schematu, brak migracji; `supabase/config.toml`
- **Auth:** PARTIAL — Supabase SSR email+password flow istnieje (`src/lib/supabase.ts`, `src/middleware.ts`); MVP nie wymaga auth (§Access Control: dostęp lokalny)
- **Deploy/infra:** PRESENT — Cloudflare Workers (`wrangler.jsonc`), CI via `.github/workflows/ci.yml`
- **Observability:** ABSENT — brak Sentry/OTel/logowania strukturalnego

## Foundations

### F-01: Supabase schema dla deduplication

- **Outcome:** (foundation) tabela `articles_seen` zainstalowana w Supabase; scraper może zapisywać i sprawdzać przetworzone artykuły per źródło.
- **Change ID:** `supabase-dedup-schema`
- **PRD refs:** FR-004 (deduplication per źródło), §Business Logic (śledzenie przetworzonych artykułów per źródło)
- **Unlocks:** S-01 (scraper potrzebuje tabeli do sprawdzania duplikatów i zapisywania stanu)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Musi być pierwsza — bez tabeli dedup scraper nie może ani sprawdzić duplikatów, ani zapisać stanu. Ryzyko minimalne: Supabase jest już skonfigurowany w baseline (partial).
- **Status:** done

## Slices

### S-01: Skrypt scrapujący z deduplication

- **Outcome:** Admin może uruchomić `npm run scrape`, system pobiera artykuły ze źródeł zdefiniowanych w pliku konfiguracyjnym, deduplikuje je (sprawdza i zapisuje w Supabase), wypisuje statystyki (liczba artykułów per źródło).
- **Change ID:** `scraper-script`
- **PRD refs:** FR-001 (konfiguracja źródeł w pliku), FR-003 (ręczne uruchomienie scrapingu), FR-004 (deduplication per źródło), US-01 (partial)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jaką bibliotekę HTML do parsowania wybrać (cheerio / playwright / Puppeteer)? — Owner: TBD (decyzja techniczna dla `/10x-plan`). Block: no.
- **Risk:** Selektory HTML są zależne od struktury konkretnych stron — działające w dev mogą nie działać na wszystkich źródłach; testowanie na żywych danych (cel `market-feedback`) jest wymaganą weryfikacją. Sekwencjonowane pierwsze jako najbardziej ryzykowna hipoteza produktu.
- **Status:** done

### S-02: Skrypt wysyłkowy — digest email

- **Outcome:** Admin może uruchomić `npm run send`, system wysyła email z nowymi artykułami (tytuł + lead) do wszystkich subskrybentów z pliku konfiguracyjnego; żaden artykuł nie pojawia się dwa razy w kolejnych wysyłkach.
- **Change ID:** `email-digest-script`
- **PRD refs:** FR-002 (konfiguracja subskrybentów w pliku), FR-005 (ręczne uruchomienie wysyłki), FR-006 (subskrybent otrzymuje maila z tytułami i leadami), US-01
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Który dostawca email wybrać (Resend / Mailgun / Sendgrid)? — Owner: user. Block: no (dowolny obsługuje use case; `/10x-plan` może zaproponować Resend jako default).
  - Zachowanie skryptu gdy scraping nie znajdzie nowych artykułów — nie wysyłać nic, wysłać pusty mail informacyjny, czy tylko log na stdout? — Owner: user. Block: no (PRD §Open Questions #1 sugeruje "brak wysyłki" jako domyślne zachowanie).
- **Risk:** Zewnętrzna zależność od dostawcy email — błędy dostawy muszą być widoczne (guardrail PRD: "brak cichych błędów dostawy"). Sekwencjonowane po S-01: bez działającego scrapera nie ma co wysyłać.
- **Status:** done

### S-03: Automatyczne wysyłki — GitHub Actions cron

- **Outcome:** Admin nie musi ręcznie uruchamiać `npm run scrape` i `npm run send` — skrypty uruchamiają się automatycznie każdego dnia o ustalonej godzinie.
- **Change ID:** `auto-digest-cron`
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - O której godzinie uruchamiać digest? — Owner: user. Block: no.
- **Risk:** GitHub Actions cron ma 5–15 min opóźnienia (nie jest real-time). Env vars muszą być w GitHub Secrets. Jeśli scrape lub send się wywróci, job będzie "failed" — trzeba monitorować Actions.
- **How:** Nowy `.github/workflows/daily-digest.yml` z `schedule: cron`, `npm ci`, `npm run scrape && npm run send`. Zero zmian w kodzie, zero nowych zależności.
- **Status:** proposed

### S-04: Dashboard — przegląd artykułów

- **Outcome:** Admin może zalogować się na `/dashboard` i zobaczyć listę ostatnio zebranych artykułów (title, source, seen_at, czy wysłany) — bez wchodzenia do Supabase Studio.
- **Change ID:** `articles-dashboard`
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Read-only widok, brak paginacji w MVP (limit 50). Nie zarządza subskrybentami — to osobny krok.
- **How:** Rozbudowa `src/pages/dashboard.astro` (już chroniona przez middleware). Zapytanie do `articles_seen` przez SSR Supabase client. Tabela: title (link), hostname, seen_at, digest_sent_at (null = nowy / data = wysłany). Ewentualnie helper w `src/lib/services/articles.ts`.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID             | Suggested issue title                              | Ready for `/10x-plan` | Notes                                                            |
|------------|-----------------------|----------------------------------------------------|-----------------------|------------------------------------------------------------------|
| F-01       | supabase-dedup-schema | DB: Supabase migration — tabela articles_seen      | done | —                                                                |
| S-01       | scraper-script        | Feature: skrypt scrapujący z deduplication         | done | —                                                                |
| S-02       | email-digest-script   | Feature: skrypt wysyłkowy — digest email           | done | —                                                                |
| S-03       | auto-digest-cron      | Infra: GitHub Actions cron — codzienny scrape+send | yes  | Zero zmian w kodzie; potrzebne GitHub Secrets (4 env vars)       |
| S-04       | articles-dashboard    | Feature: dashboard z przeglądem artykułów          | yes  | Czeka na S-02 (done); można równolegle z S-03                    |

## Open Roadmap Questions

~~1. **Zachowanie skryptu przy braku nowych artykułów**~~ — resolved: brak wysyłki (log na stdout). Zaimplementowane w S-02.
~~2. **Wybór dostawcy email**~~ — resolved: Resend. Zaimplementowane w S-02.

3. **O której godzinie uruchamiać codzienny cron?** — Owner: user. Block: S-03.

## Parked

- **Panel admina webowy (CRUD przez UI)** — Why parked: PRD §Non-Goals; konfiguracja przez plik to świadomy wybór dla MVP (FR-P01, FR-P02 → v2).
- **Automatyczny cron / harmonogram scrapingu** — Why parked: PRD §FR-003 note: ręczne uruchamianie świadomym wyborem dla MVP; cron → v2. *Przeniesiony do S-03.*
- **AI-podsumowania artykułów** — Why parked: PRD §Non-Goals; LLM przesunięty do v2 (FR-A01).
- **Samodzielny zapis/wypis subskrybentów (opt-in/opt-out)** — Why parked: PRD §Non-Goals; admin zarządza listą w pliku konfiguracyjnym.
- **Personalizacja digestu (źródła per-subskrybent)** — Why parked: PRD §Non-Goals.
- **Observability / monitoring** — Why parked: brak w baseline, nie wymagane przez PRD dla MVP; top_blocker: time.
- **Auth scaffolding (formularz email+password w UI)** — Why parked: istnieje w kodzie (baseline: partial), ale §Access Control MVP = dostęp lokalny bez logowania; v2 feature.

## Done

- **F-01: (foundation) tabela `articles_seen` gotowa w Supabase** — Archived 2026-05-28 → `context/archive/2026-05-26-supabase-dedup-schema/`. Lesson: —.
- **S-01: Admin może uruchomić scraping i zobaczyć nowe artykuły z każdego źródła** — Archived 2026-05-28 → `context/archive/2026-05-28-scraper-script/`. Lesson: —.
- **S-02: Admin może uruchomić wysyłkę i subskrybenci otrzymują digest mailowy** — Implemented 2026-05-28 → `context/changes/email-digest-script/`. Lesson: —.
