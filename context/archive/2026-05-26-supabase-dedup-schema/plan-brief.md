# Supabase Dedup Schema — Plan Brief

> Full plan: `context/changes/supabase-dedup-schema/plan.md`

## What & Why

Tworzymy pierwszą migrację Supabase: tabelę `articles_seen` do śledzenia przetworzonych artykułów per źródło. Bez niej skrypt scrapujący (S-01) nie ma gdzie zapisywać ani sprawdzać historii — jest to fundament całego przepływu deduplication opisanego w FR-004.

## Starting Point

Supabase jest skonfigurowany wyłącznie dla auth (brak własnych tabel, brak katalogu `supabase/migrations/`). CLI i klient JS są zainstalowane; produkcyjny projekt jest połączony.

## Desired End State

Tabela `articles_seen` istnieje w Supabase z UNIQUE(source_url, article_url), RLS włączonym i wygenerowanymi typami TypeScript. Skrypt S-01 może wykonać `INSERT ON CONFLICT DO NOTHING` żeby atomowo zapisać i zdeduplikować artykuł.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Klucz Supabase w skrypcie | service_role | Pomija RLS; pasuje do PRD "dostęp lokalny bez logowania" | Plan |
| Dedup mechanizm | UNIQUE constraint + INSERT ON CONFLICT | Atomowy, race-condition-safe, jeden round-trip do DB | Plan |
| ID type | uuid DEFAULT gen_random_uuid() | Standard Supabase; kompatybilny z supabase-js i gen types | Plan |
| RLS polityki | authenticated: SELECT only | Minimalne granularne polityki per CLAUDE.md; service_role bypass bez jawnej polityki | Plan |
| TypeScript types | Generować po migracji | Type-safety dla S-01 bez dodatkowego nakładu | Plan |

## Scope

**In scope:**
- `supabase/migrations/20260526000000_create_articles_seen.sql`
- `npx supabase db push` do połączonego projektu
- `src/types/supabase.ts` wygenerowany z schematu

**Out of scope:**
- `seed.sql` (pusta tabela to poprawny stan startowy)
- Kolumny `article_title`, `article_lead`, `sent_at`
- Lokalna instancja Docker/Supabase
- `SUPABASE_SERVICE_ROLE_KEY` w `.env` (potrzebne w S-01, nie tu)

## Architecture / Approach

Jeden plik SQL: `CREATE TABLE` + named `UNIQUE` constraint + `ALTER TABLE ENABLE ROW LEVEL SECURITY` + jedna polityka SELECT dla `authenticated`. Push przez `npx supabase db push`. Generowanie typów przez `npx supabase gen types typescript --project-id`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Migration SQL + Apply | Tabela `articles_seen` w Supabase z RLS | `supabase db push` może wymagać zalogowania przez CLI |
| 2. Generate TypeScript Types | `src/types/supabase.ts` z typami dla `articles_seen` | Wymaga połączenia z projektem; projekt-id musi być poprawny |

**Prerequisites:** Supabase projekt połączony (`SUPABASE_URL` + `SUPABASE_KEY` w `.env`); CLI zalogowane lub dostęp przez `--project-id`
**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- `supabase db push` wymaga autoryzacji CLI — może zapytać o `supabase login` jeśli sesja wygasła
- project-id `hfiasswaduellpweeloc` pochodzi z `.env` — zakładamy, że projekt jest aktywny
- service_role key nie jest jeszcze w `.env` — to zadanie S-01, nie tej migracji

## Success Criteria (Summary)

- `npx supabase db push` kończy się kodem 0
- Tabela `articles_seen` widoczna w Supabase z RLS ON i polityką "authenticated can select"
- `src/types/supabase.ts` zawiera typy `articles_seen.Row`, `.Insert`, `.Update`
