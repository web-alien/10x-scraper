# Scraper Script — Plan Brief

> Full plan: `context/changes/scraper-script/plan.md`

## What & Why

Dodanie `npm run scrape` — skryptu Node.js/TypeScript, który automatycznie pobiera artykuły ze skonfigurowanych źródeł HTML i zapisuje je do Supabase. Motywacja: wiele wartościowych serwisów nie ma RSS, więc scraping HTML to jedyna droga do automatycznego śledzenia nowych artykułów (FR-001, FR-003, FR-004).

## Starting Point

Projekt ma pustą `scripts/` i zainstalowany `@supabase/supabase-js`, ale brak biblioteki HTML parsowania i TS runnera dla skryptów standalone. Tabela `articles_seen` istnieje w Supabase (F-01), gotowa do odczytu/zapisu przez skrypt.

## Desired End State

Admin tworzy `sources.json` z listą źródeł (URL + selektory CSS), uruchamia `npm run scrape`, widzi raport `site.pl: 5 nowych, 3 duplikatów`. Ponowne uruchomienie wypisuje 0 nowych — deduplication działa. S-01 jest ukończone; S-02 (digest email) może startować.

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) |
|---|---|---|
| HTML parser | cheerio | Statyczny HTML + zero narzutu; playwright zbyt ciężki dla MVP |
| Config format | JSON (`sources.json`) | Łatwy do edycji ręcznie, Zod walidacja runtime |
| Error handling | Kontynuuj, loguj stderr | Jeden zepssuty selektor nie blokuje pozostałych źródeł |
| Dedup strategy | `upsert ON CONFLICT DO NOTHING` | Jeden round-trip do DB, bezpieczne przy re-run |
| Supabase key | `SUPABASE_SERVICE_ROLE_KEY` (nowy env var) | Publishable key nie ma uprawnień INSERT (RLS: service_role only) |
| URL normalizacja | Auto (new URL(href, baseUrl)) | Względne URL-e → absolute; dedup i linki w mailu działają poprawnie |
| Stats output | Nowe + duplikaty per źródło | Spełnia PRD + informuje o aktywności dedup |

## Scope

**In scope:**
- `npm run scrape` uruchamiający `scripts/scrape.ts` przez `tsx`
- `sources.json` walidowany przez Zod (name, url, selectors.articleLink, selectors.lead?)
- Scraping przez `fetch` + `cheerio` (statyczny HTML)
- Deduplication przez `articles_seen` (upsert ON CONFLICT)
- Stats na stdout, błędy na stderr
- `src/lib/supabase-script.ts` — standalone client (reusable w S-02)

**Out of scope:**
- JavaScript-rendered strony (playwright)
- Zapis tytułu/leadu w DB (tylko URL do dedup)
- Wysyłka maila (S-02)
- Automatyczny cron (v2)
- Panel webowy (v2)

## Architecture / Approach

```
sources.json → Zod validation
  ↓
foreach source:
  fetch(url) → cheerio.load(html) → $(selectors.articleLink)
    ↓
  normalize URL (new URL(href, baseUrl))
    ↓
  supabase.upsert([{source_url, article_url}], ON CONFLICT DO NOTHING)
    ↓
  count new vs duplicates
  ↓
stdout: stats per source + total
stderr: errors per source (script continues)
```

Supabase client: nowy `createScriptClient()` w `src/lib/supabase-script.ts` używa `@supabase/supabase-js` bezpośrednio (bez Astro SSR cookies). Env vars przez `process.env` + `dotenv`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Setup | tsx + cheerio + dotenv, npm run scrape, szkielet | npm install conflicts |
| 2. Implementacja | Pełny scraper: config, fetch, parse, dedup, stats | Selektory CSS nie pasują do żywych stron |

**Prerequisites:** F-01 ukończone (tabela `articles_seen` w Supabase) ✅; `SUPABASE_SERVICE_ROLE_KEY` dostępny w Supabase dashboard (Settings → API)

**Estimated effort:** ~1 sesja (2 fazy)

## Open Risks & Assumptions

- CSS selektory są wrażliwe na strukturę HTML strony — działające w dev mogą nie działać na wszystkich źródłach (roadmap: "testowanie na żywych danych jest wymaganą weryfikacją")
- `articles_seen` przechowuje tylko URL artykułu; tytuł/lead nie są zapisywane w DB — S-02 będzie scrapował ponownie (lub potrzebna będzie dodatkowa tabela)

## Success Criteria (Summary)

- `npm run scrape` z realnym `sources.json` wypisuje statystyki bez błędów
- Drugie uruchomienie wypisuje 0 nowych artykułów (deduplication)
- Błędne źródło → stderr warning, inne źródła nadal scrapowane
