# Articles Dashboard — Plan Brief

> Full plan: `context/changes/articles-dashboard/plan.md`
> Research: `context/changes/articles-dashboard/research.md`

## What & Why

Admin musi wchodzić do Supabase Studio żeby zobaczyć zebrane artykuły. S-04 eliminuje ten krok — chroniona strona `/dashboard/articles` pokazuje tabelę `articles_seen` z sortowaniem. Zamienia scraper z "czarnej skrzynki" w narzędzie z feedbackiem.

## Starting Point

`src/pages/dashboard.astro` istnieje i jest chroniona przez middleware, ale to stub (email + sign-out). `articles_seen` ma 7 kolumn z RLS SELECT dla authenticated. SSR Supabase client (`createClient`) gotowy — nie jest jeszcze używany w żadnej stronie do data queries.

## Desired End State

Admin klika link na `/dashboard` → otwiera `/dashboard/articles` → widzi tabelę z artykułami (Tytuł-link, Źródło-hostname, Zebrany-data, Status-Nowy/Wysłano). Klik nagłówka kolumny sortuje wiersze po stronie klienta bez reload. Błąd DB → inline banner zamiast crash.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Lokalizacja tabeli | Nowa podstrona `/dashboard/articles` | Czyste rozdzielenie — dashboard jako hub, articles jako sekcja | Plan |
| Architektura | React island (`client:load`) z sortowaniem | Sortowanie kolumn bez reload — więcej interaktywności niż czyste Astro | Plan |
| UI tabeli | shadcn/ui Table (`npx shadcn add table`) | Spójny z istniejącym stylem "new-york", zero custom CSS | Plan |
| Obsługa błędów | Inline banner (`Banner.astro`) | Zalogowany użytkownik nie powinien być wyrzucany przy błędzie technicznym | Plan |
| Limit wierszy | 50 (hard limit) | MVP bez paginacji — roadmap explicite | Research |
| Brak migracji | ✓ — zero nowych migracji | RLS `"authenticated can select"` już istnieje w migration 1 | Research |

## Scope

**In scope:**
- Nowa strona `src/pages/dashboard/articles.astro`
- `src/components/ArticlesTable.tsx` (React island z sortowaniem)
- `src/lib/services/articles.ts` (query service)
- shadcn Table install (`npx shadcn@latest add table`)
- Link nawigacyjny w istniejącym `dashboard.astro`

**Out of scope:**
- Paginacja, filtrowanie po statusie
- Mutacje (delete, resend)
- Real-time updates (Supabase subscriptions)
- Kolumna `lead` w tabeli (przechowywana w DB, ale nie wyświetlana)
- Zmiany w middleware lub auth

## Architecture / Approach

SSR data flow: `dashboard/articles.astro` frontmatter → `createClient` (anon key + session) → `fetchArticles` service (SELECT 50 rows, desc by seen_at) → `<ArticlesTable articles={articles} client:load />`. React island zarządza stanem sortowania bez kolejnego SSR.

Kluczowy gotcha: brak `"use client"` w `ArticlesTable.tsx` — Astro aktywuje React przez `client:load` na miejscu importu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. shadcn + ArticlesTable | Komponent tabeli z typami i sortowaniem | Shadcn add table może wygenerować niekompatybilne typy |
| 2. Service + Page + Nav | Działająca strona z prawdziwymi danymi | `createClient` null path musi pokazać banner, nie crashować |

**Prerequisites:** S-02 `email-digest-script` — done ✓ (articles_seen istnieje i ma dane)  
**Estimated effort:** ~1 sesja (4-5 plików, brak migracji, brak API routes)

## Open Risks & Assumptions

- `new URL(source_url).hostname` — zakłada, że wszystkie `source_url` w DB są poprawnymi URL-ami (scraper to gwarantuje)
- shadcn `add table` może wymagać aktualizacji `components.json` jeśli nie był uruchamiany wcześniej od ostatniej zmiany shadcn config

## Success Criteria (Summary)

- `/dashboard/articles` renderuje tabelę z artykułami — bez błędów w konsoli
- Klik nagłówka kolumny sortuje wiersze bez reload
- Unauthenticated access → redirect do sign-in (bez zmian w middleware — auto-działa)
