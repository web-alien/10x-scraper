# Sentry Integration — Plan Brief

> Full plan: `context/changes/sentry-integration/plan.md`

## What & Why

Dodajemy Sentry do projektu Astro 6 na Cloudflare Workers. Aplikacja aktualnie nie ma żadnego error trackingu — błędy giną jako URL params lub w stdout skryptów. Sentry przechwytuje nieobsłużone wyjątki, `console.warn`/`console.error` server-side oraz błędy JS w przeglądarce.

## Starting Point

`wrangler.jsonc` już istnieje z `nodejs_compat` i `main = "@astrojs/cloudflare/entrypoints/server"`. Żadne paczki Sentry nie są zainstalowane. Cały stack (Astro 6.3.1 + `@astrojs/cloudflare` 13.5.0) jest gotowy do integracji via custom entry point.

## Desired End State

Po wdrożeniu: nieobsłużone wyjątki Worker, `console.warn`/`console.error` server-side i błędy JS w przeglądarce trafiają do Sentry dashboard. Lokalnie bez DSN — tryb no-op, dev działa bez zmian. Produkcja wymaga `wrangler secret put SENTRY_DSN`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Entry point approach | Custom `sentry.server.config.ts` + zmiana `main` w `wrangler.jsonc` | Wymagane dla Astro 6 + `@astrojs/cloudflare` v13+ (issue #19762) | Plan |
| Console capture levels | `["warn", "error"]` | Maksymalna widoczność przy małym ruchu projektu kursowego | Plan |
| Client-side tracking | Tak — `sentry()` w `astro.config.mjs` | Przechwytuje błędy JS w przeglądarce | Plan |
| SENTRY_DSN w Astro env schema | `context: "client", access: "public", optional: true` | Dostępny jako `import.meta.env.SENTRY_DSN` w kodzie aplikacji | Plan |
| Source map upload | Slot w `.env.example`, bez wdrożenia | Prosta ścieżka rozszerzenia bez blokowania implementacji | Plan |

## Scope

**In scope:**
- Custom Cloudflare Worker entry point (`sentry.server.config.ts`)
- `wrangler.jsonc`: zmiana `main`
- `@sentry/astro` Vite integration w `astro.config.mjs`
- `SENTRY_DSN` w Astro env schema i `.env.example`

**Out of scope:**
- Ręczna instrumentacja API routes (`Sentry.captureException`)
- Sentry w skryptach Node.js (`scrape.ts`, `send.ts`)
- `SENTRY_AUTH_TOKEN` i upload source map (tylko slot w `.env.example`)

## Architecture / Approach

```
Request → Cloudflare Worker (sentry.server.config.ts)
            └─ Sentry.withSentry(env.SENTRY_DSN)
                └─ Astro SSR handler (@astrojs/cloudflare/entrypoints/server)
                    └─ middleware → pages → API routes

Browser → @sentry/astro client SDK (wstrzyknięty przez Vite plugin)
```

DSN przekazywany runtime przez Cloudflare Worker env (nie hardcoded).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Packages & entry point | `sentry.server.config.ts` + zmiana `wrangler.jsonc` | Import z `@astrojs/cloudflare/entrypoints/server` musi być rozwiązywalny przez Wrangler |
| 2. Astro integration & env | `sentry()` w `astro.config.mjs` + env vars | Warning o brakującym `authToken` przy każdym buildzie (oczekiwane) |
| 3. Verification | Potwierdzenie end-to-end z prawdziwym DSN | Wymaga dostępu do konta Sentry |

**Prerequisites:** Konto Sentry z projektem i DSN (do fazy 3)
**Estimated effort:** ~1 sesja, 3 fazy

## Open Risks & Assumptions

- `@astrojs/cloudflare/entrypoints/server` musi być rozwiązywalny przez Wrangler bundler — weryfikacja przez `npm run build`
- Warning `[sentry-vite-plugin] No auth token provided` przy każdym buildzie jest oczekiwany bez `SENTRY_AUTH_TOKEN`

## Success Criteria (Summary)

- `npm run build` przechodzi bez błędów
- `npm run dev` startuje bez błędów (tryb no-op bez DSN)
- Test event z `.dev.vars` pojawia się w Sentry dashboard
