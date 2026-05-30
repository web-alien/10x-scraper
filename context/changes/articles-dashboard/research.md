---
date: 2026-05-30T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 5357cef9952f46baa506ae4977bbc136cc71cc0b
branch: master
repository: 10xdev
topic: "Articles Dashboard — wzorce SSR, schema articles_seen, istniejące komponenty"
tags: [research, codebase, articles-dashboard, supabase, astro-ssr, dashboard]
status: complete
last_updated: 2026-05-30
last_updated_by: Claude Sonnet 4.6
---

# Research: Articles Dashboard (S-04)

**Date**: 2026-05-30  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `5357cef9952f46baa506ae4977bbc136cc71cc0b`  
**Branch**: master

## Research Question

Co kodebase już ma, a co musi dostać, żeby zaimplementować S-04 — read-only dashboard z tabelą artykułów (`title`, `source`, `seen_at`, `digest_sent_at`) w chronionej stronie Astro SSR?

## Summary

Kodebase ma solidny fundament: chroniona strona `dashboard.astro` (stub), SSR Supabase client gotowy do użycia, `articles_seen` z 7 kolumnami + RLS SELECT dla authenticated, i wzorzec pobierania danych w frontmatter Astro. Brakuje: (1) faktycznego data-fetchingu w `dashboard.astro`, (2) komponentu tabeli (trzeba `shadcn add table`), (3) warstwy serwisowej `src/lib/services/` (opcjonalnie). Zero nowych migracji potrzeba — RLS SELECT dla authenticated już istnieje.

## Detailed Findings

### 1. Istniejący `dashboard.astro` — stub bez data-fetchingu

`src/pages/dashboard.astro` (27 linii) to **w pełni chroniona** strona — middleware już blokuje niezalogowanych. Obecna zawartość:

- Linia 4: `const { user } = Astro.locals;` — user object z middleware, gotowy
- Linia 14: wyświetla `user?.email`
- Linie 17–24: formularz sign-out POST do `/api/auth/signout`
- **Brak jakiegokolwiek zapytania do Supabase** — jest to stub

S-04 rozszerza ten plik dodając: import `createClient`, zapytanie do `articles_seen`, i renderowanie tabeli poniżej istniejącego UI użytkownika.

### 2. SSR Supabase client — wzorzec do użycia w stronie

`src/lib/supabase.ts` eksportuje `createClient(requestHeaders, cookies)`:

```typescript
// Sygnatura (linia 3)
export function createClient(requestHeaders: Headers, cookies: AstroCookies)
  → SupabaseClient | null
```

- Używa `@supabase/ssr` → `createServerClient` z SUPABASE_KEY (anon key)
- Zwraca `null` gdy brak env vars — **zawsze sprawdzaj null przed użyciem**
- Cookie handler: bidirectional (odczyt z request headers, zapis przez Astro cookies API)

**Wzorzec data-fetchingu w stronie .astro** (nie istnieje jeszcze nigdzie poza middleware i API routes):

```astro
---
const supabase = createClient(Astro.request.headers, Astro.cookies);
if (!supabase) return Astro.redirect("/auth/signin");
const { data: articles, error } = await supabase
  .from("articles_seen")
  .select("id, source_url, article_url, title, lead, seen_at, digest_sent_at")
  .order("seen_at", { ascending: false })
  .limit(50);
---
```

**Ważne**: `createClient` używa SUPABASE_KEY (anon key), **nie** SUPABASE_SERVICE_ROLE_KEY. RLS SELECT dla authenticated pokrywa ten przypadek — anon key + sesja zalogowanego użytkownika = dostęp do danych.

Oddzielny `src/lib/supabase-script.ts` → `createScriptClient(url, serviceRoleKey)` — **wyłącznie dla skryptów backendowych** (`scripts/scrape.ts`, `scripts/send.ts`). Nie używać w stronach.

### 3. Schema `articles_seen` — 7 kolumn ze wszystkich 3 migracji

| Kolumna | Typ | Nullable | Default | Uwagi |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `source_url` | text | NOT NULL | — | część UNIQUE |
| `article_url` | text | NOT NULL | — | część UNIQUE |
| `seen_at` | timestamptz | NOT NULL | `now()` | data scrappingu |
| `title` | text | NULL | — | dodane w migration 2 |
| `lead` | text | NULL | — | dodane w migration 2 |
| `digest_sent_at` | timestamptz | NULL | — | null = nowy; data = wysłano |

Migracje:
- `supabase/migrations/20260526000000_create_articles_seen.sql` — tabela bazowa + RLS
- `supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql` — +title, +lead
- `supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql` — +digest_sent_at

**RLS**: `"authenticated can select" FOR SELECT TO authenticated USING (true)` — brak INSERT/UPDATE/DELETE policies (service_role writes only). **Zero nowych migracji potrzeba dla S-04.**

TypeScript typ dostępny przez `Tables<"articles_seen">["Row"]` z `src/types/supabase.ts`.

### 4. Wzorzec zapytania z `scripts/send.ts` — jedyne istniejące zapytanie do tej tabeli

`scripts/send.ts` linie 39–44:

```typescript
const { data: articles } = await supabase
  .from("articles_seen")
  .select("id, source_url, article_url, title, lead")
  .is("digest_sent_at", null)       // tylko niewysłane
  .gt("seen_at", cutoff)            // tylko nowe
  .order("seen_at", { ascending: true });
```

Dashboard nie filtruje (`digest_sent_at` może być null lub datą — pokazujemy oba), i potrzebuje też `seen_at` + `digest_sent_at` w wynikach. SELECT dla dashboard: `"id, source_url, article_url, title, lead, seen_at, digest_sent_at"`.

**Wzorzec grupowania po hostname** (send.ts linie 57–62):
```typescript
const bySource = articles.reduce((acc, article) => {
  const hostname = new URL(article.source_url).hostname;
  // ...
}, {});
```
Użyteczny wzorzec — w dashboardzie można grupować po `new URL(article.source_url).hostname`.

### 5. Warstwa serwisowa — nie istnieje, trzeba stworzyć

`src/lib/` zawiera tylko 4 pliki:
- `supabase.ts` — SSR client factory
- `supabase-script.ts` — plain client dla skryptów
- `config-status.ts` — sprawdzanie konfiguracji (używane w Layout do bannerów błędów)
- `utils.ts` — `cn()` helper (clsx + tailwind-merge)

**`src/lib/services/` nie istnieje.** Roadmap sugeruje `src/lib/services/articles.ts` — opcjonalnie, można też fetchować bezpośrednio w `dashboard.astro` bez pośredniej warstwy (prostsze dla MVP).

### 6. Komponenty UI — co jest, czego brak

**Zainstalowane i dostępne:**
- `src/components/ui/button.tsx` — shadcn button z CVA variants
- `cn()` z `src/lib/utils.ts`
- `lucide-react` 1.14.0 — ikony (np. ExternalLink, Send, Clock)
- `Banner.astro` — alert banner (info/warning/error)
- React 19 + Astro islands (dla interaktywnych komponentów)

**Brakuje:**
- Komponent tabeli — **`npx shadcn@latest add table`** (projekt ma shadcn "new-york" style)
- Żaden istniejący React komponent nie robi data-fetchingu — wszystkie są stateless (auth forms)

**Wzorzec Astro → React**: fetch w `.astro` frontmatter → dane jako props do React komponentu. Przykład: `<SignInForm client:load />` (signin.astro linia 16). Dashboard może być czyste Astro (bez React), albo użyć React dla sortowania/filtrowania na kliencie.

### 7. Middleware i ochrona tras — zero zmian potrzeba

`src/middleware.ts` linia 4: `PROTECTED_ROUTES = ["/dashboard"]` — ochrona jest `startsWith("/dashboard")`, więc **zarówno `/dashboard` jak i `/dashboard/anything` są automatycznie chronione**. Zero zmian w middleware dla S-04.

`src/env.d.ts` deklaruje `Astro.locals.user: User | null` — type-safe, dostępny w każdej .astro stronie.

## Code References

- [src/pages/dashboard.astro](src/pages/dashboard.astro) — stub do rozbudowy (linia 4: user z locals, linie 17–24: sign-out form)
- [src/middleware.ts](src/middleware.ts) — auth flow, PROTECTED_ROUTES (linia 4)
- [src/lib/supabase.ts](src/lib/supabase.ts) — `createClient(requestHeaders, cookies)` → SupabaseClient | null
- [src/lib/supabase-script.ts](src/lib/supabase-script.ts) — NIE używać w stronach
- [src/lib/utils.ts](src/lib/utils.ts) — `cn()` helper
- [src/types/supabase.ts](src/types/supabase.ts:17) — `Database["public"]["Tables"]["articles_seen"]["Row"]`
- [scripts/send.ts:39](scripts/send.ts#L39) — jedyne istniejące zapytanie do articles_seen
- [scripts/send.ts:57](scripts/send.ts#L57) — wzorzec grupowania po hostname
- [supabase/migrations/20260526000000_create_articles_seen.sql](supabase/migrations/20260526000000_create_articles_seen.sql) — tabela + RLS
- [supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql](supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql) — title, lead
- [supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql](supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql) — digest_sent_at

## Architecture Insights

1. **Zero nowych migracji** — RLS `"authenticated can select"` już istnieje. Dashboard jest read-only, używa anon key + sesja = dostęp pokryty przez istniejące policy.

2. **Data flow dla S-04**: middleware (user) → `dashboard.astro` frontmatter (createClient + query articles_seen) → render w Astro template (tabela HTML) lub React komponent z props. Brak client-side fetchingu.

3. **Opcja A (prostsze)**: fetch bezpośrednio w `dashboard.astro`, render jako statyczne Astro. Brak React wyspy, brak sortowania na kliencie.
   
4. **Opcja B (z React)**: fetch w `dashboard.astro`, przekaż props do `<ArticlesTable articles={articles} client:load />`. Pozwala na sortowanie/filtrowanie na kliencie bez kolejnego SSR.

5. **Render: pure Astro vs React island** — dla MVP (read-only, no pagination) czyste Astro jest wystarczające. React island wart rozważenia tylko jeśli planujesz sortowanie kolumn.

6. **`limit(50)` wymagane** — roadmap explicite mówi "brak paginacji na MVP", co znaczy hard limit. Bez limitu mogą zwrócić się setki wierszy.

7. **`hostname` display**: `new URL(source_url).hostname` jako skrócona nazwa źródła — gotowy wzorzec z send.ts. Lepiej niż pełny URL w tabeli.

## Historical Context (from prior changes)

- [context/archive/2026-05-26-supabase-dedup-schema/](context/archive/2026-05-26-supabase-dedup-schema/) — decyzje o schemacie i RLS (UNIQUE constraint, service_role writes, authenticated select)
- [context/changes/email-digest-script/](context/changes/email-digest-script/) — implementacja send.ts z jedynym istniejącym zapytaniem do articles_seen

## Open Questions

1. **Czyste Astro vs React island** — czy S-04 wymaga sortowania/filtrowania na kliencie? Jeśli nie — czyste Astro (prostsze). Decyzja dla `/10x-plan`.

2. **Lokalizacja w dashboard.astro** — czy dodać tabelę na końcu `dashboard.astro`, czy stworzyć osobną stronę `/dashboard/articles`? Middleware chroni `startsWith("/dashboard")`, więc obie opcje są chronione.

3. **Shadcn table vs plain HTML** — `npx shadcn@latest add table` daje gotowy styled komponent. Alternatywnie: `<table>` z Tailwind klasami bezpośrednio (szybsze, mniej zależności). Decyzja dla `/10x-plan`.
