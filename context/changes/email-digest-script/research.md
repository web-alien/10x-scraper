---
date: 2026-05-28T14:00:00+02:00
researcher: Claude (claude-sonnet-4-6)
git_commit: a3c49b2ac1ee557f1a11d4e1615eaf28bfaba3ca
branch: master
repository: 10x-scraper
topic: "Codebase patterns for email-digest-script (S-02)"
tags: [research, codebase, scripts, supabase, email, resend, zod, tsx]
status: complete
last_updated: 2026-05-28
last_updated_by: Claude (claude-sonnet-4-6)
last_updated_note: "Added follow-up research: Resend SDK external docs (Context7)"
---

# Research: Codebase patterns for email-digest-script (S-02)

**Date**: 2026-05-28T14:00:00+02:00
**Researcher**: Claude (claude-sonnet-4-6)
**Git Commit**: a3c49b2ac1ee557f1a11d4e1615eaf28bfaba3ca
**Branch**: master
**Repository**: 10x-scraper

## Research Question

Jakie wzorce w istniejącej bazie kodu powinien naśladować `email-digest-script`? Obejmuje to: architekturę skryptu `scripts/scrape.ts`, integrację z Supabase, strukturę configów, setup buildowy i decyzje zarchiwizowane w poprzednich zmianach.

## Summary

Kod zawiera kompletny wzorzec skryptu w `scripts/scrape.ts` (131 linii), który `email-digest-script` powinien naśladować 1:1 w zakresie: ładowania env przez `dotenv/config`, walidacji configu przez Zod, inicjalizacji Supabase przez `createScriptClient`, obsługi błędów i loggingu. Kluczowe odkrycie: tabela `articles_seen` przechowuje *scraped* artykuły, ale **nie ma kolumny `digest_sent_at`** — email-digest-script potrzebuje nowej migracji Supabase przed implementacją. Biblioteka Resend nie jest jeszcze zainstalowana.

## Detailed Findings

### 1. Architektura skryptu (wzorzec do skopiowania)

**Plik:** [scripts/scrape.ts](scripts/scrape.ts)

Skrypt używa **top-level await** (ESM, `"type": "module"` w `package.json:3`) — brak opakowującego `main()` ani IIFE. Cały kod jest na poziomie modułu.

**Kolejność inicjalizacji (linie 1–42):**
1. `import "dotenv/config"` — pierwsza linia, ładuje `.env` przed wszystkim
2. Importy: `readFileSync` (fs), `createClient` (supabase-script), `load` (cheerio), `z` (zod)
3. Zod schema inline (linie 7–17)
4. Guard env vars → `process.exit(1)` jeśli brakuje (linie 21–27)
5. Guard config → `process.exit(1)` jeśli `sources.json` brakuje/błędny (linie 29–36)
6. Inicjalizacja klienta Supabase (linia 38)
7. `console.log("Scraper starting…")` (linia 40)

**Pattern wejścia/wyjścia:**
- `process.exit(1)` tylko na błędach startowych
- Sukces = implicit exit 0 (brak jawnego `process.exit(0)`)

### 2. Env vars i ładowanie

**Plik:** [scripts/scrape.ts:1](scripts/scrape.ts)

```typescript
import "dotenv/config";   // linia 1 — ESM side-effect, ładuje .env
```

Odczyt ze `process.env` bezpośrednio (nie z `astro:env/server` — to tylko w Astro SSR):

```typescript
const supabaseUrl = process.env.SUPABASE_URL;                    // scrape.ts:21
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // scrape.ts:22
```

**Plik:** [.env.example](.env.example) — aktualne zmienne:
```
SUPABASE_URL=###
SUPABASE_KEY=###
# Service role key — required for scraper/email scripts (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=###
```

Dla email-digest-script potrzebne dodanie `RESEND_API_KEY=###` do `.env.example`.

### 3. Walidacja configu Zod

**Plik:** [scripts/scrape.ts:7-17](scripts/scrape.ts) — inline schema:

```typescript
const SourceConfigSchema = z.array(
  z.object({
    name: z.string(),
    url: z.url(),
    selectors: z.object({
      articleLink: z.string(),
      title:       z.string().optional(),
      lead:        z.string().optional(),
    }),
  }),
);
type SourceConfig = z.infer<typeof SourceConfigSchema>;
```

**Flow:** (linie 29–36)
1. `readFileSync("sources.json", "utf-8")` — synchronicznie, relative do cwd
2. `JSON.parse(raw)`
3. `SourceConfigSchema.parse(...)` — rzuca `ZodError` jeśli nieprawidłowy
4. Wszystko w `try/catch` → `process.exit(1)`

Używa **`.parse()` (rzucającego)**, nie `.safeParse()`.

**Plik configu:** [sources.json](sources.json) — wzór do naśladowania:
```json
[
  {
    "name": "Parkiet",
    "url": "https://parkiet.com/wiadomosci",
    "selectors": {
      "articleLink": ".content--block .contentLink",
      "title": ".content--block .contentLink h2",
      "lead": ".content--block .teaser--lead"
    }
  }
]
```

Dla email-digest-script analogicznie: `subscribers.json` w root projektu, walidowany Zod schema inline w `scripts/send.ts`.

### 4. Klient Supabase dla skryptów

**Plik:** [src/lib/supabase-script.ts](src/lib/supabase-script.ts) — **gotowy do reużycia**:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function createScriptClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey);
}
```

Używa `service role key` (nie anon key) → **omija RLS** automatycznie. `email-digest-script` używa dokładnie tego samego factory.

**Kontrast:** `src/lib/supabase.ts` używa `@supabase/ssr` z `astro:env/server` — **nie wolno importować w skryptach Node.js**.

### 5. Schema tabeli `articles_seen`

**Migracje:** [supabase/migrations/](supabase/migrations/)

**Tabela (migracja 20260526000000_create_articles_seen.sql):**
```sql
CREATE TABLE articles_seen (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url  text        NOT NULL,
  article_url text        NOT NULL,
  seen_at     timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT articles_seen_source_article_unique UNIQUE (source_url, article_url)
);

ALTER TABLE articles_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select"
  ON articles_seen FOR SELECT TO authenticated USING (true);
```

**Rozszerzenie (migracja 20260528000000_add_title_lead_to_articles_seen.sql):**
```sql
ALTER TABLE articles_seen ADD COLUMN title text;
ALTER TABLE articles_seen ADD COLUMN lead  text;
```

**RLS:** SELECT dla authenticated, INSERT/UPDATE/DELETE wyłącznie przez service_role (pomija RLS). Brak explicit policy dla write — zgodnie z lessons.md: intencjonalne pominięcie powinna dokumentować migracja.

**Obecne kolumny:**
- `id` — uuid PK
- `source_url` — text NOT NULL
- `article_url` — text NOT NULL
- `seen_at` — timestamptz DEFAULT now()
- `title` — text NULL
- `lead` — text NULL

**BRAKUJĄCA kolumna:** `digest_sent_at` — patrz Open Questions #1.

### 6. Wzorzec upsert i pattern zapisu

**Plik:** [scripts/scrape.ts:107-118](scripts/scrape.ts)

```typescript
const { data, error } = await supabase
  .from("articles_seen")
  .upsert(dbRows, { onConflict: "source_url,article_url", ignoreDuplicates: true })
  .select("id");

if (error) {
  console.error(`${source.name}: Supabase error:`, error.message);
  continue;
}

const newCount = data.length;
const duplicateCount = articles.length - newCount;
```

- `ignoreDuplicates: true` → kolizja = silent skip
- `.select("id")` → zwraca tylko nowo wstawione wiersze → `data.length` = liczba nowych

### 7. Obsługa błędów

Trzy warstwy:

| Warstwa | Typ | Zachowanie |
|---------|-----|-----------|
| Startup guards (env vars, config) | Fatal | `process.exit(1)` |
| Per-źródło try/catch (linie 46–127) | Non-fatal | `console.error`, `continue` do następnego |
| Supabase error check (`if (error)`) | Non-fatal | `console.error`, `continue` |
| Per-URL invalid href (catch w `each`) | Silent | `return` z callbacka |

### 8. Wzorzec loggingu

Czysty `console.*` — brak biblioteki strukturalnego logowania:
- `console.log("Scraper starting…")` — start
- `console.warn(...)` — selector hit empty
- `console.error(...)` — wszystkie błędy
- `console.log(\`${source.name}: ${newCount} nowych, ${duplicateCount} duplikatów\`)` — per-source stats
- `console.log("---")` + summary — koniec

### 9. Setup buildowy

**Plik:** [package.json](package.json)

```json
"scripts": {
  "scrape": "tsx scripts/scrape.ts"
}
```

Nowy skrypt będzie: `"send": "tsx scripts/send.ts"`

**Runner:** `tsx v4.19.4` — bezpośrednie uruchomienie TypeScript bez pre-compilacji.

**Kluczowe devDependencies już zainstalowane:**
- `tsx: ^4.19.4`
- `dotenv: ^16.5.0`
- `zod: ^4.4.3`
- `cheerio: ^1.0.0` (nie potrzebne dla email)

**BRAKUJĄCA zależność:** `resend` — nie ma w `dependencies` ani `devDependencies`.

**tsconfig.json:** `include: ["**/*"]` — `scripts/` jest objęty głównym configuiem TypeScript. Brak osobnego `tsconfig.scripts.json`.

### 10. TypeScript types (Database)

**Plik:** [src/types/supabase.ts:11-37](src/types/supabase.ts)

```typescript
articles_seen: {
  Row: {
    article_url: string;
    id: string;
    lead: string | null;
    seen_at: string;
    source_url: string;
    title: string | null;
  };
  Insert: {
    article_url: string;
    id?: string | undefined;
    lead?: string | null | undefined;
    seen_at?: string | undefined;
    source_url: string;
    title?: string | null | undefined;
  };
  // ...
}
```

Po dodaniu `digest_sent_at` do tabeli (nowa migracja) typy trzeba zregenerować: `supabase gen types typescript --project-id hfiasswaduellpweeloc`.

## Code References

- [scripts/scrape.ts:1](scripts/scrape.ts) — `import "dotenv/config"` — pierwsze wczytanie env
- [scripts/scrape.ts:7-17](scripts/scrape.ts) — Zod schema + type inference pattern
- [scripts/scrape.ts:21-27](scripts/scrape.ts) — startup guards dla env vars
- [scripts/scrape.ts:29-36](scripts/scrape.ts) — config load + Zod parse + fatal exit
- [scripts/scrape.ts:38](scripts/scrape.ts) — `createScriptClient(url, key)`
- [scripts/scrape.ts:46-127](scripts/scrape.ts) — per-source try/catch loop
- [scripts/scrape.ts:107-110](scripts/scrape.ts) — upsert z `ignoreDuplicates`
- [src/lib/supabase-script.ts:1-6](src/lib/supabase-script.ts) — reużywalny factory
- [supabase/migrations/20260526000000_create_articles_seen.sql](supabase/migrations/20260526000000_create_articles_seen.sql) — DDL tabeli
- [supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql](supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql) — kolumny title/lead
- [src/types/supabase.ts:11-37](src/types/supabase.ts) — wygenerowane typy DB
- [sources.json](sources.json) — wzór config file
- [.env.example](.env.example) — zmienne środowiskowe
- [package.json:13](package.json) — npm run scrape → tsx

## Architecture Insights

1. **Top-level await jako pattern skryptów** — brak `main()`. Skrypt = sekwencja top-level `await`. Email script powinien robić to samo.

2. **`readFileSync` (sync) dla configu na starcie** — nie async, bo jest przed loopem i błąd jest fatal.

3. **`createScriptClient` jako shared helper** — świadomie zaprojektowany do reużycia między S-01 i S-02 (potwierdzone w archived plan.md).

4. **Service role key w skryptach** — nie anon key. Email script będzie pisał do DB (UPDATE `digest_sent_at`) — wymaga service role.

5. **`@/` alias w skryptach** — `import { createScriptClient } from "@/lib/supabase-script"` działa bo tsconfig.json ma paths `@/*: ./src/*` i `tsx` honoruje te paths.

6. **Bez kompilacji** — `tsx` transpiluje w locie; nie ma `dist/` dla skryptów. Deployment to Cloudflare Workers nie obejmuje tych skryptów.

7. **Subscribers.json pattern** — analogia do `sources.json`: array na root poziomie, walidowany inline Zod schemą w `scripts/send.ts`, ładowany przez `readFileSync("subscribers.json", "utf-8")`.

8. **Zod 4** (v4.4.3) — używa `z.url()` (native, Zod 4 API), nie `z.string().url()` (Zod 3 API). Email schema może użyć `z.email()`.

## Historical Context (from prior changes)

- [context/archive/2026-05-28-scraper-script/plan.md](context/archive/2026-05-28-scraper-script/plan.md) — `supabase-script.ts` celowo zaprojektowany jako reużywalny factory dla S-02: *"Standalone Supabase client: reusable across scripts (S-01, S-02)"*
- [context/archive/2026-05-28-scraper-script/plan.md](context/archive/2026-05-28-scraper-script/plan.md) — decyzja o `ON CONFLICT ignoreDuplicates + .select("id")` dla liczenia nowych artykułów
- [context/archive/2026-05-26-supabase-dedup-schema/plan.md](context/archive/2026-05-26-supabase-dedup-schema/plan.md) — RLS: service_role pomija RLS, brak explicit INSERT policy jest intencjonalny; zgodnie z lessons.md powinno być udokumentowane w SQL

## Open Questions

### OQ-1 (BLOCKER): Brak kolumny `digest_sent_at` — wymaga migracji

Tabela `articles_seen` śledzi *kiedy artykuł był scrapowany* (`seen_at`), ale nie *kiedy był wysłany w digestcie*. Requirement S-02: "żaden artykuł nie pojawia się dwa razy w kolejnych wysyłkach."

**Potrzebna decyzja — jak śledzić "wysłany w digestcie":**

**Opcja A (rekomendowana):** Dodaj `digest_sent_at timestamptz NULL` do `articles_seen`.
- Query nowych: `WHERE digest_sent_at IS NULL`
- Po wysyłce: `UPDATE articles_seen SET digest_sent_at = NOW() WHERE id IN (...)`
- Minimalna migracja, żaden istniejący kod nie jest dotknięty
- Zgodne z precedensem: tak samo dodano `title`/`lead` bez reskaffoldowania

**Opcja B:** Nowa tabela `digest_runs` z relacją do `articles_seen`.
- Bardziej normalizowana, ale over-engineered dla MVP
- Wymaga JOIN przy query

**Opcja C:** Śledzenie przez czas: `seen_at > (MAX(digest_runs.run_at) OR epoch)`.
- Kruchość: jeśli scrape i send są uruchamiane close-in-time, ryzyko race condition

**Konkluzja:** Opcja A jest najprostsza i zgodna z filozofią "add columns when needed" (precedens: migracja title/lead). Plan.md powinien zawierać migrację jako Phase 1.

### OQ-2: Subscribers.json schema

Nie istnieje jeszcze. Potrzebna decyzja o schemacie. Propozycja minimalna:

```json
["jan@example.com", "anna@example.com"]
```

lub bardziej rozszerzalna:

```json
[
  { "email": "jan@example.com", "name": "Jan" }
]
```

Dla MVP (bez personalizacji) wystarczy array stringów z emailami. Zod: `z.array(z.email())`.

### OQ-3: Resend API — co wysyłać jako `from`

Resend wymaga `from: "name@verified-domain.com"`. Trzeba wybrać sender address, które trzeba dodać do `.env.example` jako `RESEND_FROM_EMAIL=###`. Bez zweryfikowanej domeny Resend pozwala wysyłać z `onboarding@resend.dev` tylko do właściciela konta.

## Follow-up Research: Resend SDK (Context7, 2026-05-28)

Źródło: [resend.com/docs](https://resend.com/docs) — High reputation, 2551 snippets, score 89.4

### Inicjalizacja SDK

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
```

Konstruktor przyjmuje API key bezpośrednio. Pasuje do wzorca skryptu: odczyt z `process.env` po załadowaniu `dotenv/config`.

### Wysyłka pojedynczego emaila

```typescript
const { data, error } = await resend.emails.send({
  from: 'Digest <digest@twoja-domena.com>',
  to: ['subskrybent@example.com'],
  subject: 'Dzisiejszy digest',
  html: '<p>...</p>',
});

if (error) {
  console.error('Resend error:', error.message);
  // non-fatal: kontynuuj do następnego subskrybenta
}
```

**Wzorzec `{ data, error }`** — identyczny jak Supabase. Email-digest-script może użyć tej samej warstwy obsługi błędów co scraper (non-fatal per-subskrybent).

### Wysyłka wsadowa (`resend.batch.send`)

```typescript
const { data, error } = await resend.batch.send([
  {
    from: 'Digest <digest@twoja-domena.com>',
    to: ['jan@example.com'],
    subject: 'Digest',
    html: '<p>...</p>',
  },
  {
    from: 'Digest <digest@twoja-domena.com>',
    to: ['anna@example.com'],
    subject: 'Digest',
    html: '<p>...</p>',
  },
]);
```

**Limity batch:**
- Max **100 emaili** na jeden request
- Max **50 odbiorców** na jeden email w batchu
- **Brak załączników** i schedulingu w batchu
- **Atomowy**: jeden błąd walidacji = cały batch fail

**Konsekwencja dla digest-script:** Batch jest kuszący (jeden request = wszyscy subskrybenci), ale atomowość jest ryzykiem — jeden zły email w `subscribers.json` wysypuje całą wysyłkę. Jeśli Zod `z.email()` waliduje listę przed wysyłką (guard na starcie), batch jest bezpieczny dla list ≤100 subskrybentów.

### Rekomendacja: batch vs. sequential loop

| Podejście | Zalety | Wady |
|-----------|--------|------|
| `resend.batch.send` | 1 request, szybsze | Atomowy — błąd jednego = fail całości |
| Sequential `resend.emails.send` w pętli | Non-fatal per-subskrybent | N requestów |

**Dla MVP:** Sequential loop (jak pętla scrapera) jest prostszy i spójny ze stylem kodu. Batch wymaga pre-walidacji i zmienia model błędów. Przy małej liście subskrybentów latencja nie jest problemem.

### Format `from`

```
"Nazwa <email@verified-domain.com>"
```

Wymaga **zweryfikowanej domeny** w Resend. W fazie dev można użyć `onboarding@resend.dev` (wysyłka tylko do właściciela konta). Dla produkcji: osobna zmienna `RESEND_FROM_EMAIL`.

### Instalacja

```bash
npm install resend
```

Resend to `dependency` (nie devDependency) bo jest używany w runtime skryptów Node.js (nie tylko w build toolingu).

---

### OQ-4: Zakres czasowy digestu

Które artykuły wchodzą do digestu? Opcje:
- Wszystkie z `digest_sent_at IS NULL` (rekomendowane jeśli opcja A z OQ-1)
- Artykuły z ostatnich N godzin
- Artykuły od ostatniego uruchomienia `send`

Opcja "wszystkie niesłane" jest najprostsza i najspójniejsza z `ignoreDuplicates` pattern z scrapera.
