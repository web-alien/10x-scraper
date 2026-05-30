# Auto Digest Cron — Plan Brief

> Full plan: `context/changes/auto-digest-cron/plan.md`

## What & Why

Admin musi codziennie ręcznie uruchamiać `npm run scrape && npm run send`. S-03 eliminuje tę pracę — jeden plik YAML w GitHub Actions automatyzuje cały pipeline bez żadnych zmian w kodzie aplikacji.

## Starting Point

`npm run scrape` i `npm run send` działają poprawnie. Istnieje `.github/workflows/ci.yml` z gotowym wzorcem (checkout + node 22 + npm ci). `SUPABASE_URL` jest już w GitHub Secrets z CI.

## Desired End State

Po wgraniu pliku i konfiguracji 3 sekretów: każdego dnia o 7:00 PL scraper zbiera artykuły, send wysyła digest do subskrybentów — bez udziału admina. Nieudany job pojawia się jako czerwony w Actions i wysyła email powiadamiający.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Czas crona | 5:00 UTC (7:00 PL) | Poza szczytem Actions, digest gotowy przed pracą |
| Błąd scrape | `&&` — nie wysyłaj | Brak nowych danych = brak sensu wysyłać digest |
| Alerty | Tylko GitHub email | Zero dodatkowej konfiguracji, wystarczy dla MVP |
| Testowanie | `workflow_dispatch` dodany | Możliwość natychmiastowego testu bez czekania na cron |
| Sekrety | Plan dokumentuje instrukcję | 3 nowe sekrety nie są jeszcze w repo |

## Scope

**In scope:**
- `.github/workflows/daily-digest.yml` (1 nowy plik)
- Dokumentacja instrukcji dodania 3 sekretów GitHub
- Rozwiązanie problemu `subscribers.json` (gitignorowany, nie istnieje w Actions)

**Out of scope:**
- Zmiany w `scripts/scrape.ts` lub `scripts/send.ts`
- Slack/webhook alerting
- Retry logic
- Cloudflare Workers cron

## Architecture / Approach

GitHub Actions `schedule` cron trigger (+ `workflow_dispatch` do testów). Jeden job: checkout → node 22 → npm ci → `scrape && send`. Wszystkie sekrety przekazywane przez `${{ secrets.* }}`. `SUPABASE_URL` już istnieje; dodajemy `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

**⚠️ Open Risk:** `subscribers.json` jest gitignorowany — nie istnieje w Actions checkout. Rekomendowane rozwiązanie: dodać `SUBSCRIBERS_JSON` jako GitHub Secret i stworzyć plik w workflow step przed uruchomieniem skryptu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Daily Digest Workflow | Działający cron w GitHub Actions | `subscribers.json` nie istnieje w Actions — wymaga dodatkowego workflow step lub zmiany w skrypcie |

**Prerequisites:** S-02 `email-digest-script` — done ✓  
**Estimated effort:** ~1 sesja (1 plik YAML + konfiguracja sekretów)

## Open Risks & Assumptions

- **`subscribers.json` nie istnieje w Actions** — krytyczne, musi być rozwiązane przed pierwszym testem. Plan proponuje trzy opcje; opcja 2 (tworzenie pliku przez workflow step z GitHub Secret) jest rekomendowana dla MVP.
- GitHub Actions cron ma 5–15 min opóźnienia — nie jest real-time; 7:00 PL może być 7:10-7:15.

## Success Criteria (Summary)

- Workflow uruchomiony ręcznie (`workflow_dispatch`) — job zielony, brak błędów w logach
- Email z digestem dotarł do subskrybentów z poprawnym formatem (H2 per źródło, tytuł jako link)
- Drugi trigger tego samego dnia → "Brak nowych artykułów" (deduplication potwierdzone)
