# Sentry Integration Implementation Plan

## Overview

Dodajemy Sentry do projektu Astro 6 na Cloudflare Workers. Celem jest przechwycenie błędów server-side (nieobsłużone wyjątki + `console.warn`/`console.error`) i opcjonalnie błędów w przeglądarce. Używamy podejścia custom Cloudflare Worker entry point wymaganego dla Astro 6 + `@astrojs/cloudflare` v13+ (issue #19762).

## Current State Analysis

- **`wrangler.jsonc`** już istnieje z `main = "@astrojs/cloudflare/entrypoints/server"`, `nodejs_compat` i `assets.directory = "./dist"`. Wystarczy zmienić `main`.
- **Brak jakiegokolwiek error trackingu** — API routes zwracają błędy jako URL params, middleware bez try-catch, skrypty logują do stdout.
- **`@sentry/astro` i `@sentry/cloudflare`** — nie zainstalowane.
- Cloudflare observability (`observability.enabled = true`) już działa — Sentry go uzupełnia.

## Desired End State

- Nieobsłużone wyjątki z Cloudflare Worker trafiają do Sentry.
- `console.warn` i `console.error` z server-side kodu trafiają do Sentry (via `captureConsoleIntegration`).
- Błędy JS po stronie przeglądarki trafiają do Sentry (via `@sentry/astro` integration).
- Brak DSN = tryb no-op (dev bez konfiguracji działa bez zmian).

### Key Discoveries:

- `wrangler.jsonc:4` — `"main": "@astrojs/cloudflare/entrypoints/server"` — to ten wpis zamieniamy
- `wrangler.jsonc:6` — `"nodejs_compat"` już w `compatibility_flags` — nic do dodania
- `wrangler.jsonc:9` — `"directory": "./dist"` — katalog assets to `./dist`, nie `./dist/client`
- `astro.config.mjs:17-22` — env schema z `SUPABASE_URL` i `SUPABASE_KEY` — dodajemy `SENTRY_DSN`

## What We're NOT Doing

- Ręczne instrumentowanie API routes przez `Sentry.captureException()` — to oddzielna zmiana jeśli będzie potrzeba
- Dodawanie Sentry do skryptów Node.js (`scripts/scrape.ts`, `scripts/send.ts`) — inny runtime
- Konfiguracja `SENTRY_AUTH_TOKEN` do upload source map — przygotowujemy slot, ale nie wdrażamy

## Implementation Approach

Jedyny plik runtime to `sentry.server.config.ts` w korzeniu projektu — owija Astro handler w `Sentry.withSentry()`. `wrangler.jsonc` wskazuje na ten plik zamiast domyślnego entry. `@sentry/astro` Vite integration dodana do `astro.config.mjs` obsługuje client-side i source map upload.

---

## Phase 1: Install packages and Cloudflare Worker entry point

### Overview

Instalujemy paczki, tworzymy custom entry point Cloudflare Worker z Sentry wrapper i aktualizujemy `wrangler.jsonc`.

### Changes Required:

#### 1. Instalacja paczek

**File**: `package.json` (via npm install)

**Intent**: Zainstaluj `@sentry/astro` (Vite integration + client SDK) i `@sentry/cloudflare` (Cloudflare Workers runtime SDK).

**Contract**: `npm install @sentry/astro @sentry/cloudflare`

---

#### 2. Custom Cloudflare Worker entry point

**File**: `sentry.server.config.ts` (katalog główny projektu, nowy plik)

**Intent**: Zastępuje domyślny entry point Cloudflare Workers — owija Astro SSR handler w Sentry, przekazując DSN z Cloudflare Worker env. Gdy `SENTRY_DSN` jest pusty lub brak, SDK inicjalizuje się w trybie no-op.

**Contract**:
```typescript
import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

interface Env {
  SENTRY_DSN?: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN ?? "",
    integrations: [Sentry.captureConsoleIntegration({ levels: ["warn", "error"] })],
  }),
  handler,
);
```

---

#### 3. Zmiana main w wrangler.jsonc

**File**: `wrangler.jsonc`

**Intent**: Wskaż Wranglerowi nasz custom entry point zamiast domyślnego adaptera.

**Contract**: Zmień wartość klucza `"main"` z `"@astrojs/cloudflare/entrypoints/server"` na `"./sentry.server.config.ts"`. Pozostałe pola bez zmian.

---

### Success Criteria:

#### Automated Verification:

- TypeScript kompiluje bez błędów: `npx tsc --noEmit`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Plik `sentry.server.config.ts` istnieje w korzeniu projektu
- `wrangler.jsonc` ma `"main": "./sentry.server.config.ts"`

**Implementation Note**: Po ukończeniu tej fazy i przejściu weryfikacji automatycznej, zatrzymaj się i potwierdź manualnie przed przejściem do fazy 2.

---

## Phase 2: Astro integration and env vars

### Overview

Dodajemy `@sentry/astro` Vite integration do `astro.config.mjs` (client-side tracking + source map upload), dodajemy `SENTRY_DSN` do Astro env schema i uzupełniamy `.env.example`.

### Changes Required:

#### 1. Aktualizacja astro.config.mjs

**File**: `astro.config.mjs`

**Intent**: Dodaj `@sentry/astro` jako Astro integration (Vite plugin do client-side SDK i source map upload) oraz `SENTRY_DSN` do env schema tak, żeby był dostępny przez `import.meta.env.SENTRY_DSN` w kodzie aplikacji.

**Contract**: Trzy modyfikacje:
1. Import na górze: `import sentry from "@sentry/astro";`
2. W `integrations`: dodaj `sentry()` (czyta `SENTRY_DSN` z `process.env` automatycznie; brak DSN = no-op)
3. W `env.schema`: `SENTRY_DSN: envField.string({ context: "client", access: "public", optional: true })`

---

#### 2. Aktualizacja .env.example

**File**: `.env.example`

**Intent**: Udokumentuj wymagane i opcjonalne zmienne środowiskowe Sentry dla przyszłych developerów.

**Contract**: Na końcu pliku dodaj blok:
```
# Sentry — error monitoring (opcjonalne; brak DSN = tryb no-op)
SENTRY_DSN=
# Sentry Auth Token — do upload source map (opcjonalne)
SENTRY_AUTH_TOKEN=
```

---

### Success Criteria:

#### Automated Verification:

- Build przechodzi bez błędów: `npm run build`
- TypeScript kompiluje bez błędów: `npx tsc --noEmit`

#### Manual Verification:

- `npm run dev` startuje bez błędów
- W output buildzie widać `[sentry-vite-plugin]` (nawet z warningiem o brakującym auth tokenie — to oczekiwane bez `SENTRY_AUTH_TOKEN`)

**Implementation Note**: Po ukończeniu tej fazy zatrzymaj się i potwierdź manualnie.

---

## Phase 3: End-to-end verification

### Overview

Weryfikacja poprawności integracji z prawdziwym DSN (jeśli dostępny) lub przez inspekcję no-op bez DSN.

### Changes Required:

Brak zmian w kodzie. Faza wyłącznie weryfikacyjna.

---

### Success Criteria:

#### Automated Verification:

- `npm run build` — build produkcyjny przechodzi
- `npm run lint` — brak błędów lint

#### Manual Verification:

- **Bez DSN (lokalnie)**: `npm run dev` startuje, brak błędów w konsoli związanych z Sentry
- **Z DSN**: Dodaj `SENTRY_DSN=<twój-dsn>` do `.dev.vars`, uruchom `npm run dev`, wywołaj `console.error("sentry test")` z dowolnego API route (np. przez tymczasowy `console.error` w `src/middleware.ts`), zweryfikuj że event pojawia się w Sentry dashboard
- **Cloudflare deploy**: Po `npx wrangler deploy` z ustawioną secrets (`npx wrangler secret put SENTRY_DSN`) — wywołaj błąd, zweryfikuj w Sentry

---

## Testing Strategy

### Automated:

- `npm run build` — sprawdza integrację Vite plugin + brak błędów TypeScript
- `npx tsc --noEmit` — weryfikacja typów `sentry.server.config.ts`

### Manual:

1. Uruchom `npm run dev` bez DSN — sprawdź że app startuje normalnie (no-op)
2. Dodaj `SENTRY_DSN` do `.dev.vars` i sprawdź czy test event dociera do Sentry
3. (Opcjonalnie) Dodaj `SENTRY_AUTH_TOKEN` i sprawdź source map upload podczas `npm run build`

## Migration Notes

Produkcja wymaga dodania `SENTRY_DSN` jako Cloudflare Workers secret:
```
npx wrangler secret put SENTRY_DSN
```

## References

- `wrangler.jsonc` — plik konfiguracyjny Cloudflare Workers
- `astro.config.mjs` — konfiguracja Astro z env schema
- Sentry issue #19762 — wsparcie dla Astro 6 + custom entry point (od `@sentry/astro` 10.44.0)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install packages and Cloudflare Worker entry point

#### Automated

- [x] 1.1 TypeScript kompiluje bez błędów: `npx tsc --noEmit` — 14408be
- [x] 1.2 Lint przechodzi: `npm run lint` — 14408be

#### Manual

- [x] 1.3 Plik `sentry.server.config.ts` istnieje w korzeniu projektu — 14408be
- [x] 1.4 `wrangler.jsonc` ma `"main": "./sentry.server.config.ts"` — 14408be

### Phase 2: Astro integration and env vars

#### Automated

- [x] 2.1 Build przechodzi bez błędów: `npm run build`
- [x] 2.2 TypeScript kompiluje bez błędów: `npx tsc --noEmit`

#### Manual

- [x] 2.3 `npm run dev` startuje bez błędów
- [x] 2.4 Output buildu zawiera `[sentry-vite-plugin]`

### Phase 3: End-to-end verification

#### Automated

- [ ] 3.1 `npm run build` przechodzi
- [ ] 3.2 `npm run lint` — brak błędów

#### Manual

- [ ] 3.3 `npm run dev` bez DSN startuje normalnie (no-op)
- [ ] 3.4 Test event z DSN w `.dev.vars` pojawia się w Sentry dashboard
