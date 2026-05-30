# Auto Digest Cron Implementation Plan

## Overview

Create `.github/workflows/daily-digest.yml` — a GitHub Actions scheduled workflow that runs `npm run scrape && npm run send` every day at 5:00 UTC (7:00 PL). Zero changes to application code, zero new dependencies.

## Current State Analysis

`npm run scrape` and `npm run send` work correctly but require manual invocation by the admin. The existing `.github/workflows/ci.yml` provides the exact node/checkout/install pattern to reuse. Four env vars are needed at runtime; one (`SUPABASE_URL`) already exists as a GitHub Secret from CI.

## Desired End State

`daily-digest.yml` is committed. After the three new GitHub Secrets are configured, the workflow runs automatically at 5:00 UTC daily. Scraping and sending succeed; `digest_sent_at` is updated in Supabase; subscribers receive the email. A failed job appears as a red indicator in Actions and triggers GitHub's default failure email to the repo owner.

### Key Discoveries

- `.github/workflows/ci.yml:1-25` — exact pattern for `actions/checkout@v4` + `actions/setup-node@v4` (node 22, npm cache) + `npm ci`
- `SUPABASE_URL` already in repo secrets (CI); `SUPABASE_KEY` is the anon key and is NOT needed for the digest scripts (they use `SUPABASE_SERVICE_ROLE_KEY`)
- `npm run scrape` (`scripts/scrape.ts`) exits 1 on Supabase error, exits 0 on success including "no sources"
- `npm run send` (`scripts/send.ts`) exits 0 when no articles qualify — so `scrape && send` is safe and won't produce empty email runs

## What We're NOT Doing

- Cloudflare Workers cron / Wrangler scheduled workers — GitHub Actions is sufficient and requires no infra changes
- Separate jobs for scrape and send — one job with `&&` is simpler; if scrape fails, send is intentionally skipped
- Retry logic on failure — job fails once; admin is notified via GitHub email; next day's run is independent
- Slack / webhook alerting — GitHub's default failure email to repo owner is enough for MVP
- `SUPABASE_KEY` (anon key) in the workflow — digest scripts never need it

## Implementation Approach

Mirror `ci.yml` structure exactly: checkout → setup-node (22, npm cache) → `npm ci` → run scripts. Add `workflow_dispatch` trigger alongside `schedule` so the workflow can be manually triggered for testing without waiting 24 hours. Pass all four required env vars from GitHub Secrets.

## Critical Implementation Details

**`workflow_dispatch` is required for testing.** Without it, the only way to trigger the workflow is to wait for the next 5:00 UTC cron tick or push a commit to master. Add `workflow_dispatch: {}` as a second trigger so the first end-to-end test can be run immediately after setup.

---

## Phase 1: Daily Digest Workflow

### Overview

Create the workflow file and document the required GitHub Secrets setup.

### Changes Required

#### 1. Create `.github/workflows/daily-digest.yml`

**File**: `.github/workflows/daily-digest.yml`

**Intent**: Define a scheduled GitHub Actions job that runs the scrape + send pipeline daily at 5:00 UTC, using service_role and Resend credentials from GitHub Secrets. Include `workflow_dispatch` to allow immediate manual testing.

**Contract**:
```yaml
name: Daily Digest

on:
  schedule:
    - cron: '0 5 * * *'
  workflow_dispatch: {}

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: echo '${{ secrets.SOURCES_JSON }}' > sources.json
      - run: echo '${{ secrets.SUBSCRIBERS_JSON }}' > subscribers.json
      - run: npm run scrape && npm run send
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          RESEND_FROM_EMAIL: ${{ secrets.RESEND_FROM_EMAIL }}
```

### Success Criteria

#### Automated Verification

- `npm run build` passes — no regressions from adding the workflow file
- `.github/workflows/daily-digest.yml` exists and contains `cron: '0 5 * * *'`

#### Manual Verification

- Dodaj 5 nowych sekretów w GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
  - `SUPABASE_SERVICE_ROLE_KEY` — service_role key z Supabase dashboard → Settings → API
  - `RESEND_API_KEY` — API key z resend.com/api-keys
  - `RESEND_FROM_EMAIL` — adres FROM (np. `onboarding@resend.dev` lub zweryfikowana domena)
  - `SOURCES_JSON` — zawartość lokalnego `sources.json` (lista źródeł do scrapowania)
  - `SUBSCRIBERS_JSON` — zawartość lokalnego `subscribers.json` (lista adresów email subskrybentów)
- Uruchom workflow ręcznie: Actions → Daily Digest → Run workflow
- Job zakończony zielonym statusem w Actions
- W logach Actions: kroki echo tworzą `sources.json` i `subscribers.json` przed uruchomieniem skryptów (brak błędów "Error loading *.json")

**Implementation Note**: Po przejściu testu manualnego oznacz change jako `implemented`.

## Testing Strategy

### Manual Testing Steps

1. Dodaj 3 sekrety (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) w repo Settings → Secrets
2. Rozwiąż problem `subscribers.json` (patrz Open Risk)
3. Trigger: Actions → Daily Digest → Run workflow (workflow_dispatch)
4. Sprawdź logi: scrape powinien pokazać N nowych artykułów; send powinien pokazać "wysłano" lub "Brak nowych artykułów"
5. Sprawdź inbox subskrybentów — email dotarł z poprawnym formatem
6. Sprawdź Supabase dashboard → `articles_seen` — `digest_sent_at` zaktualizowane
7. Drugi trigger: powinien pokazać "Brak nowych artykułów" (deduplication działa)

## References

- Roadmap slice: `context/foundation/roadmap.md` S-03
- Istniejący workflow: `.github/workflows/ci.yml`
- Skrypt send: `scripts/send.ts`
- Skrypt scrape: `scripts/scrape.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Daily Digest Workflow

#### Automated

- [ ] 1.1 `npm run build` passes — no regressions
- [ ] 1.2 `.github/workflows/daily-digest.yml` exists with correct cron schedule

#### Manual

- [ ] 1.3 5 nowych sekretów dodanych w GitHub repo Settings (SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, SOURCES_JSON, SUBSCRIBERS_JSON)
- [ ] 1.4 Logi Actions: echo steps tworzą sources.json i subscribers.json — brak błędów "Error loading"
- [ ] 1.5 Workflow uruchomiony ręcznie (workflow_dispatch) — job zielony
- [ ] 1.6 Email dotarł do subskrybentów z poprawnym formatem
- [ ] 1.7 `digest_sent_at` zaktualizowane w Supabase po uruchomieniu
- [ ] 1.8 Drugi trigger shows "Brak nowych artykułów" — deduplication działa
