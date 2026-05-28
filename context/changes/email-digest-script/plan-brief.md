# Email Digest Script — Plan Brief

> Full plan: `context/changes/email-digest-script/plan.md`
> Research: `context/changes/email-digest-script/research.md`

## What & Why

Budujemy `scripts/send.ts` — skrypt Node.js uruchamiany przez admina (`npm run send`), który wysyła codzienny digest emailowy z nowymi artykułami do listy subskrybentów. To ostatni brakujący element łańcucha: scraper scrapuje → send wysyła → subskrybenci czytają.

## Starting Point

Scraper (`scripts/scrape.ts`) jest kompletny i wypełnia `articles_seen` (kolumny `source_url, article_url, title, lead, seen_at`). Brakuje kolumny `digest_sent_at` do śledzenia co zostało wysłane, biblioteki Resend SDK oraz samego skryptu send.

## Desired End State

Admin uruchamia `npm run send`. Jeśli w ostatnich 24h były nowe artykuły: każdy subskrybent z `subscribers.json` otrzymuje HTML email z artykułami pogrupowanymi wg źródła (H2 per hostname, tytuł jako link + lead). Artykuły są oznaczone jako wysłane w DB. Drugie uruchomienie tego samego dnia loguje "Brak nowych artykułów" bez wysyłki.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---------|-------|----------|--------|
| Email provider | Resend SDK | Developer-first API, `{data, error}` identyczny jak Supabase, hojny free tier | Research |
| Śledzenie wysłanych | `digest_sent_at` kolumna w `articles_seen` | Minimalna migracja, precedens (tak dodano `title`/`lead`), zero nowych tabel | Plan |
| Zakres artykułów | `digest_sent_at IS NULL AND seen_at > NOW()-24h` | Artykuły starsze niż dobę "agują out" — predictable rozmiar digestu | Plan |
| Format emaila | HTML grupowany wg źródła (hostname) | Pełna informacja bez klikania, czytelna struktura | Plan |
| Subscribers config | `subscribers.json` — `z.array(z.email())` | Minimalna struktura, spójna z filozofią MVP, analogia do `sources.json` | Plan |
| Send API | Sequential loop, nie `resend.batch.send` | Batch jest atomowy (jeden błąd = cała wysyłka fail), loop jest non-fatal per subscriber | Research |
| Oznaczanie jako sent | Wszystkie artykuły po pętli | Unikanie duplikatów ważniejsze niż retry dla failed-delivery | Plan |
| `resend` package | devDependency | Spójne z `cheerio`, `dotenv`, `tsx` — skrypty nie są deployowane do Cloudflare | Research |

## Scope

**In scope:**
- Migracja Supabase: `digest_sent_at timestamptz NULL`
- `npm install --save-dev resend` + `npm run send` script
- `subscribers.json` + `subscribers.example.json` + `.env.example` update
- `scripts/send.ts`: pełna implementacja

**Out of scope:**
- React Email / styled templates (plain HTML)
- Batch Resend API
- Personalizacja per subskrybent
- Cron / automatyczne uruchamianie
- Artykuły starsze niż 24h

## Architecture / Approach

`scripts/send.ts` klon strukturalny `scripts/scrape.ts`: top-level await, `import "dotenv/config"` first, startup guards → `process.exit(1)`, Zod na config, `createScriptClient` z `@/lib/supabase-script.ts`, `{ data, error }` destructuring. Zamiast pętli po źródłach — jedno zapytanie SELECT + pętla po subskrybentach. HTML budowany inline (no template engine).

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
|------|-------------|---------------|
| 1. Infrastructure | Migracja + deps + env + config files gotowe | `supabase link` musi być uruchomione przed `db push` |
| 2. scripts/send.ts | Kompletny skrypt + manual test w inbox | Resend wymaga zweryfikowanej domeny do produkcji |

**Prerequisites:** `supabase link --project-ref hfiasswaduellpweeloc` (CLAUDE.md); API key z resend.com dashboard  
**Estimated effort:** ~1 sesja, 2 fazy (Phase 1 krótka, Phase 2 ~30-40 min implementacji)

## Open Risks & Assumptions

- `onboarding@resend.dev` jako sender działa tylko do konta właściciela — dla produkcji wymagana weryfikacja domeny w Resend
- Jeśli `npm run scrape` nie był uruchamiany danego dnia, `npm run send` loguje "Brak artykułów" bez wysyłki — intencjonalne, ale admin musi pamiętać o kolejności
- Artykuły starsze niż 24h agują out bez wysłania — świadoma decyzja, ale traci się zawartość jeśli send jest pomijany przez więcej niż dobę

## Success Criteria (Summary)

- `npm run send` wysyła email do każdego subskrybenta z `subscribers.json`
- Email zawiera artykuły z ostatnich 24h pogrupowane wg źródła
- Drugie uruchomienie tego samego dnia nie wysyła duplikatu
