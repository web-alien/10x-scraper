---
title: Anti-Corruption Layer — izolacja przeciekającej zależności (Supabase / kształt articles_seen)
created: 2026-06-12
type: refactor-plan
---

# Plan refaktoru: ACL dla najgorszego przecieku zależności

> Produkt to PLAN, nie implementacja. Kod produkcyjny nie został zmodyfikowany.
> Poprzednie kroki destylacji: [01-domain-distillation.md](01-domain-distillation.md), [02-invariant-aggregate-refactor.md](02-invariant-aggregate-refactor.md).

## KROK 0 — Kontekst

- **Dokumenty:** [prd.md](../foundation/prd.md), [tech-stack.md](../foundation/tech-stack.md), [roadmap.md](../foundation/roadmap.md), [README.md](../../README.md).
- **Deklaracje wymienialności znalezione w dokumentach:**
  - Resend: „Który dostawca email wybrać (Resend / Mailgun / Sendgrid)? — … dowolny obsługuje use case" [roadmap.md:88](../foundation/roadmap.md#L88) — dostawca email jest *z założenia* wymienialny.
  - cheerio: „Jaką bibliotekę HTML do parsowania wybrać (cheerio / playwright / Puppeteer)?" [roadmap.md:75](../foundation/roadmap.md#L75) — wybór parsera traktowany jako odwracalna decyzja techniczna.
  - Supabase: tech-stack deklaruje go jako trwały fundament („nie będzie potrzeby migracji stacku" [tech-stack.md:24](../foundation/tech-stack.md#L24)), ale TĘ SAMĄ linią deklaruje dyscyplinę granic: „TypeScript z Zod **na granicach** i konwencje Astro minimalizują tarcie" — czyli kontrakt: granice warstw mają być chronione walidacją/typami domenowymi, nie surowym kształtem biblioteki.
- **Zależności zewnętrzne (manifest [package.json](../../package.json)):** runtime-domenowe: `@supabase/supabase-js`, `@supabase/ssr`, `resend` (devDep, używany runtime przez tsx), `cheerio` (devDep, jw.), `zod`; pozostałe to framework/UI/tooling.
- **Warstwy:** CLI/skrypty (`scripts/`), serwisy (`src/lib/services/`), helpery persystencji (`src/lib/supabase*.ts`), strony SSR (`src/pages/`), komponenty klienckie React (`src/components/`), testy (`tests/`).

## KROK 1 — Zidentyfikowane przeciekające zależności

### P1. Supabase: `SupabaseClient<Database>` + wygenerowany kształt wiersza `articles_seen` (`Tables`/`Database`)

Wszystkie pliki, które dziś znają tę zależność (zweryfikowane):

| Plik | Co zna | Dowód |
|---|---|---|
| [scripts/scrape.ts](../../scripts/scrape.ts) | `SupabaseClient<Database>` **w sygnaturze funkcji domenowej** `processSource`; nazwę tabeli i kontrakt upsert | [scrape.ts:6-8](../../scripts/scrape.ts#L6-L8), [scrape.ts:25-29](../../scripts/scrape.ts#L25-L29), [scrape.ts:74-77](../../scripts/scrape.ts#L74-L77) |
| [scripts/send.ts](../../scripts/send.ts) | `SupabaseClient<Database>` w sygnaturze `runDigest`; tabelę, kolumny, filtry | [send.ts:7-8](../../scripts/send.ts#L7-L8), [send.ts:25](../../scripts/send.ts#L25), [send.ts:80-86](../../scripts/send.ts#L80-L86), [send.ts:127-132](../../scripts/send.ts#L127-L132) |
| [src/lib/supabase-script.ts](../../src/lib/supabase-script.ts) | fabrykę klienta (legalnie) | [supabase-script.ts:1-6](../../src/lib/supabase-script.ts#L1-L6) |
| [src/lib/services/articles.ts](../../src/lib/services/articles.ts) | `SupabaseClient` w sygnaturze; tabelę i kolumny; **zwraca surową odpowiedź biblioteki** (`{data, error}`) do strony | [articles.ts:1-9](../../src/lib/services/articles.ts#L1-L9) |
| [src/pages/dashboard/articles.astro](../../src/pages/dashboard/articles.astro) | `Tables<"articles_seen">` jako typ widoku; rozpakowuje `{data, error}` biblioteki | [articles.astro:8-10](../../src/pages/dashboard/articles.astro#L8-L10), [articles.astro:20-26](../../src/pages/dashboard/articles.astro#L20-L26) |
| [src/components/ArticlesTable.tsx](../../src/components/ArticlesTable.tsx) | `Tables<"articles_seen">` **w komponencie React hydratowanym na kliencie** (`client:load` [articles.astro:47](../../src/pages/dashboard/articles.astro#L47)); nazwy kolumn DB jako klucze sortowania | [ArticlesTable.tsx:3-7](../../src/components/ArticlesTable.tsx#L3-L7), [ArticlesTable.tsx:14-19](../../src/components/ArticlesTable.tsx#L14-L19) |
| [tests/scraper.test.ts](../../tests/scraper.test.ts) | **ręczną rekonstrukcję fluent-API biblioteki** (`from().upsert().select()`) w mocku | [scraper.test.ts:4-5](../../tests/scraper.test.ts#L4-L5), [scraper.test.ts:18-33](../../tests/scraper.test.ts#L18-L33) |
| [tests/send.test.ts](../../tests/send.test.ts) | jw. (`from().update().in()`) | [send.test.ts:2-3](../../tests/send.test.ts#L2-L3), [send.test.ts:21-29](../../tests/send.test.ts#L21-L29) |
| [src/types/supabase.ts](../../src/types/supabase.ts) | plik wygenerowany (legalnie — to źródło kształtu) | [supabase.ts:17](../../src/types/supabase.ts#L17) |

Dodatkowo **duplikacja rekonstrukcji typu artykułu** — kształt wiersza odtwarzany niezależnie w 3 miejscach:
- ręczny interfejs `Article` [send.ts:13-19](../../scripts/send.ts#L13-L19) (subset kolumn, przepisany ręcznie),
- alias `type Article = Tables<"articles_seen">` [articles.astro:10](../../src/pages/dashboard/articles.astro#L10),
- ten sam alias drugi raz [ArticlesTable.tsx:6](../../src/components/ArticlesTable.tsx#L6).

**Zasięg: 8 plików produkcyjno-testowych, 5 warstw (CLI, serwis, persystencja, strona SSR, komponent kliencki).**

*Poza zakresem P1:* `@supabase/ssr` w [src/lib/supabase.ts:1](../../src/lib/supabase.ts#L1) oraz auth (middleware, `api/auth/*`) — to subdomena **generic** (auth), natywnie supabase'owa; jej wymiana to wymiana produktu auth, nie przeciek domeny artykułów.

### P2. Resend: typ biblioteki w sygnaturze domenowej

- `Pick<Resend, "emails">` w sygnaturze `runDigest` [send.ts:24](../../scripts/send.ts#L24); import typu w teście [send.test.ts:4](../../tests/send.test.ts#L4). 2 pliki, 2 warstwy. Dokument **deklaruje wymienialność** [roadmap.md:88](../foundation/roadmap.md#L88) — rozjazd intencja-vs-kod istnieje, ale plan [02](02-invariant-aggregate-refactor.md) już go domyka (port `DeliveryReport` + adapter `deliver()`, §4.2/4.4 tamże).

### P3. cheerio: parser sklejony z logiką domenową

- `load()` wewnątrz `processSource` [scrape.ts:4](../../scripts/scrape.ts#L4), [scrape.ts:30-31](../../scripts/scrape.ts#L30-L31) — ekstrakcja artykułów (domena) i mechanika selektorów (biblioteka) w jednej funkcji. 1 plik. Roadmap traktuje wybór parsera jako otwartą decyzję [roadmap.md:75](../foundation/roadmap.md#L75).

### P4. zod — NIE jest przeciekiem

- Używany dokładnie tam, gdzie tech-stack go deklaruje: „Zod na granicach" [tech-stack.md:24](../foundation/tech-stack.md#L24) — parsowanie configów na wejściu ([scrape.ts:10-20](../../scripts/scrape.ts#L10-L20), [send.ts:10](../../scripts/send.ts#L10)). Odnotowany dla kompletności.

## KROK 2 — Klasyfikacja i wybór #1

| Przeciek | (a) Warstwy/pliki | (b) Koszt wymiany dziś | (c) Deklaracja wymienialności |
|---|---|---|---|
| **P1 Supabase/`articles_seen`** | **5 warstw / 8 plików** | Najwyższy — wymiana lub zmiana schematu dotyka CLI, serwisu, strony, komponentu klienckiego i obu testów naraz | Brak deklaracji wymiany całego Supabase, ALE kod łamie zadeklarowaną dyscyplinę granic ([tech-stack.md:24](../foundation/tech-stack.md#L24)); migracja DB zmieniająca kolumnę propaguje się do UI |
| P2 Resend | 2 warstwy / 2 pliki | Niski | **Tak, wprost** [roadmap.md:88](../foundation/roadmap.md#L88) — domknięte planem 02 |
| P3 cheerio | 1 warstwa / 1 plik | Niski | Pośrednio [roadmap.md:75](../foundation/roadmap.md#L75) |

**Wybór #1: P1 — kształt `articles_seen` + `SupabaseClient` jako wspólna waluta wszystkich warstw.** Uzasadnienie: (a) dominuje bezapelacyjnie — to jedyna zależność znana jednocześnie skryptom CLI, serwisowi, stronie SSR, komponentowi klienckiemu i testom; (b) każda migracja schematu (a były już trzy: [supabase/migrations/](../../supabase/migrations/)) zmienia wygenerowany `Tables<>` i może złamać UI oraz oba skrypty naraz; (c) choć nikt nie obiecuje wymiany Supabase, kod łamie kontrakt „typy/walidacja na granicach" — surowy kształt persystencji JEST kontraktem UI i sygnaturą funkcji domenowych. P2 ma najmocniejszy cytat wymienialności, ale jest mały i już zaadresowany w planie 02 — wybranie go ponownie nie wnosi nic.

## KROK 3 — Diagnoza P1

**Duplikacja rekonstrukcji kształtu (3 niezależne definicje „artykułu"):**
1. [send.ts:13-19](../../scripts/send.ts#L13-L19) — ręcznie przepisany subset (`id, source_url, article_url, title, lead`); rozjedzie się cicho przy zmianie schematu, bo nie jest generowany.
2. [articles.astro:10](../../src/pages/dashboard/articles.astro#L10) i 3. [ArticlesTable.tsx:6](../../src/components/ArticlesTable.tsx#L6) — dwa identyczne aliasy `Tables<"articles_seen">` definiowane osobno.

**Przecieki przez granice:**
- **Persystencja → komponent kliencki (najgroźniejszy kierunek):** `Tables<"articles_seen">` jest typem propsów komponentu hydratowanego w przeglądarce ([ArticlesTable.tsx:6-11](../../src/components/ArticlesTable.tsx#L6-L11) + `client:load` [articles.astro:47](../../src/pages/dashboard/articles.astro#L47)). To `import type`, więc kod biblioteki nie trafia do bundla — ale **kontrakt UI = autogenerowany schemat DB**: kolumny `source_url`, `digest_sent_at` są kluczami sortowania i nagłówkami tabeli [ArticlesTable.tsx:14-19](../../src/components/ArticlesTable.tsx#L14-L19). UI sortuje po surowej kolumnie, a host źródła wycina w renderze — pojęcie domenowe „źródło" nie istnieje, jest kolumna.
- **Biblioteka w sygnaturach domenowych:** `processSource(html, source, supabase: SupabaseClient<Database>)` [scrape.ts:25-29](../../scripts/scrape.ts#L25-L29) i `runDigest(..., supabase: SupabaseClient<Database>, ...)` [send.ts:21-27](../../scripts/send.ts#L21-L27) — funkcje logiki biznesowej przyjmują klienta SDK zamiast portu.
- **Surowa odpowiedź biblioteki jako kontrakt serwisu:** `fetchArticles` zwraca nieprzetworzone `{data, error}` PostgREST [articles.ts:3-9](../../src/lib/services/articles.ts#L3-L9), a strona rozpakowuje je sama [articles.astro:20-26](../../src/pages/dashboard/articles.astro#L20-L26) — obsługa błędów biblioteki rozsmarowana na konsumenta.
- **Testy odtwarzają fluent-API SDK:** mocki ręcznie rekonstruują łańcuchy `from().upsert().select()` [scraper.test.ts:18-33](../../tests/scraper.test.ts#L18-L33) i `from().update().in()` [send.test.ts:21-29](../../tests/send.test.ts#L21-L29) — każda zmiana sposobu użycia SDK psuje mocki, mimo że logika domenowa się nie zmieniła.
- **Wiedza o kontrakcie biblioteki wpleciona w logikę:** zliczanie duplikatów opiera się na niszowym zachowaniu PostgREST (`ignoreDuplicates` ⇒ `select()` zwraca tylko wstawione wiersze) — `newCount = data.length; duplicateCount = articles.length - newCount` [scrape.ts:83-85](../../scripts/scrape.ts#L83-L85). Ta reguła to czysta wiedza o bibliotece, a żyje w funkcji domenowej.

**Rozjazd intencja-vs-kod:** tech-stack obiecuje „TypeScript z Zod na granicach i konwencje Astro" [tech-stack.md:24](../foundation/tech-stack.md#L24) — granica serwer→klient przepuszcza dziś surowy, niewalidowany kształt persystencji; jedyne istniejące granice z walidacją to wejścia configów (zod), wyjście do UI nie ma żadnej.

## KROK 4 — Projekt ACL

### 4.1 Value object/encja: `Article` — jedyne miejsce wiedzy o kształcie

Nowy moduł `src/lib/domain/article.ts` (konwencja: logika w `src/lib/`, [CLAUDE.md](../../CLAUDE.md)). Zero importów z `@supabase/*` w API publicznym; typ wiersza pojawia się wyłącznie w mapowaniach.

```ts
// src/lib/domain/article.ts
import type { Tables, TablesInsert } from "@/types/supabase"; // JEDYNY plik domeny, który to importuje

export class Article {
  readonly id: string;
  readonly articleUrl: URL;
  readonly sourceHost: string;        // pojęcie domenowe "źródło" — nie kolumna source_url
  readonly title: string | null;
  readonly lead: string | null;
  readonly seenAt: Date;
  readonly sentAt: Date | null;       // null = pending (semantyka z migracji 20260528150000)

  // ── mapowanie Z persystencji (ACL: tu i tylko tu wolno znać kształt wiersza)
  static fromRow(row: Tables<"articles_seen">): Article
  //   waliduje URL (przeniesiony filtr unsafe-scheme z send.ts:28-40 → tu, jako reguła konstrukcji)
  //   parsuje daty ISO → Date

  // ── mapowanie DO persystencji
  static toInsertRow(scraped: ScrapedArticle): TablesInsert<"articles_seen">

  // ── operacje domenowe (przeniesione z rozsianych miejsc)
  isSent(): boolean                   // dziś: ArticlesTable.tsx:65 sprawdza surowe pole
  displayTitle(): string              // fallback tytuł→URL, dziś inline w send.ts:58
}

// DTO dla granicy serwer→klient: plain, serializowalne, bez klas i bez typów DB
export interface ArticleView {
  id: string; title: string; url: string;
  sourceHost: string; seenAtISO: string; sentAtISO: string | null;
}
export function toView(a: Article): ArticleView
```

```ts
// src/lib/domain/scraped-article.ts — wynik scrapingu PRZED persystencją
export interface ScrapedArticle { sourceUrl: string; articleUrl: string; title: string; lead: string }
```

### 4.2 Wąski port + adapter

```ts
// src/lib/domain/ports.ts — port: cała persystencja artykułów w 4 metodach domenowych
export interface ArticleRepository {
  recordScraped(batch: ScrapedArticle[]): Promise<{ inserted: number; duplicates: number }>;
  findPending(): Promise<Article[]>;            // kryterium: sentAt === null (bez 24h cutoff — plan 02)
  markSent(ids: string[], at: Date): Promise<void>;  // throws MarkSentFailedError (plan 02)
  listRecent(limit: number): Promise<Article[]>;     // dla dashboardu (dziś services/articles.ts)
}
```

```ts
// src/lib/adapters/supabase-article-repository.ts — JEDYNA implementacja, JEDYNY plik z SDK
import { createClient } from "@supabase/supabase-js";   // wchłania src/lib/supabase-script.ts

export class SupabaseArticleRepository implements ArticleRepository {
  recordScraped(batch) {
    // upsert(..., { onConflict: "source_url,article_url", ignoreDuplicates: true }).select("id")
    // DECYZJA KONTRAKTOWA ZAKODOWANA TUTAJ (nie w skrypcie):
    // PostgREST z ignoreDuplicates zwraca wyłącznie wstawione wiersze,
    // więc duplicates = batch.length - data.length   [dziś: scrape.ts:83-85]
  }
  findPending()  { /* .is("digest_sent_at", null).order("seen_at") → rows.map(Article.fromRow) */ }
  markSent()     { /* .update({digest_sent_at}).in("id", ids); error → throw MarkSentFailedError */ }
  listRecent(n)  { /* .order("seen_at", desc).limit(n) → Article[]; error → throw, nie {data,error} */ }
}
```

Reszta kodu zna wyłącznie port: skrypty i strona dostają `ArticleRepository` (wstrzykiwany w entry-point), testy mockują **4 metody portu** zamiast fluent-API SDK. `DigestRunRepository` z planu [02 §4.3](02-invariant-aggregate-refactor.md) realizuje się jako te metody portu (`findPending` + `markSent`) — plany są zbieżne, 02 nie wymaga osobnego repo.

### 4.3 Cienkie warstwy zewnętrzne

- `scripts/scrape.ts`: `processSource(html, source): ScrapedArticle[]` (czysta funkcja, bez klienta) → `repo.recordScraped(batch)`. Sygnatura domenowa traci `SupabaseClient`.
- `scripts/send.ts`: wg planu 02; `repo.findPending()` / `repo.markSent()`.
- `articles.astro`: `repo.listRecent(50)` → `articles.map(toView)` → `<ArticlesTable articles={views} />`. Błąd repo łapany jako wyjątek, nie rozpakowywany z `{data, error}`.
- `ArticlesTable.tsx`: props `ArticleView[]`; kolumny/sortowanie po polach domenowych (`sourceHost`, `sentAtISO`), nie po kolumnach DB.

## KROK 5 — Dowód izolacji + before/after

### 5.1 Dowód: wymiana biblioteki dotyka tylko adaptera

Scenariusz „wymień supabase-js na cokolwiek (np. postgres.js / Drizzle / inny BaaS)":

| Artefakt | Wymaga zmiany? |
|---|---|
| `src/lib/adapters/supabase-article-repository.ts` | **TAK — jedyny** (nowy adapter implementuje te same 4 metody portu) |
| `src/lib/domain/article.ts` (mapowania `fromRow`/`toInsertRow`) | tylko jeśli zmienia się schemat — i to w jednym miejscu |
| tabela `articles_seen` / migracje | NIE (schemat niezależny od SDK) |
| `scripts/scrape.ts`, `scripts/send.ts` | NIE (znają port) |
| `articles.astro`, `ArticlesTable.tsx` | NIE (znają `ArticleView`) |
| `tests/*` | NIE (mockują port) |

### 5.2 Before/after dla zduplikowanych i przeciekających miejsc

| Miejsce | Before | After |
|---|---|---|
| [send.ts:13-19](../../scripts/send.ts#L13-L19) ręczny interfejs `Article` | duplikat kształtu wiersza | usunięty — `Article` z `src/lib/domain/article.ts` |
| [articles.astro:10](../../src/pages/dashboard/articles.astro#L10) + [ArticlesTable.tsx:6](../../src/components/ArticlesTable.tsx#L6) | 2× alias `Tables<"articles_seen">` | `ArticleView` (serializowalne DTO domenowe) |
| [scrape.ts:25-29](../../scripts/scrape.ts#L25-L29) `processSource(..., supabase)` | SDK w sygnaturze domenowej | czysta funkcja `→ ScrapedArticle[]`; persystencja przez port |
| [send.ts:21-27](../../scripts/send.ts#L21-L27) `runDigest(..., supabase, ...)` | jw. | agregat `DigestRun` (plan 02) + port |
| [articles.ts:3-9](../../src/lib/services/articles.ts#L3-L9) zwraca `{data, error}` | surowa odpowiedź PostgREST jako kontrakt | `repo.listRecent(): Promise<Article[]>`, błędy = wyjątki |
| [scrape.ts:83-85](../../scripts/scrape.ts#L83-L85) `duplicateCount` z zachowania PostgREST | wiedza o kontrakcie SDK w domenie | zakodowana w `recordScraped` adaptera |
| [scraper.test.ts:18-33](../../tests/scraper.test.ts#L18-L33), [send.test.ts:21-29](../../tests/send.test.ts#L21-L29) mocki fluent-API | rekonstrukcja `from().upsert().select()` | mock 4 metod portu (`{ findPending: vi.fn()… }`) |
| [ArticlesTable.tsx:14-19](../../src/components/ArticlesTable.tsx#L14-L19), [ArticlesTable.tsx:65-66](../../src/components/ArticlesTable.tsx#L65-L66) | sortowanie/status po kolumnach DB | pola `ArticleView`; status z `sentAtISO` zmapowanego przez `Article.isSent()` po stronie serwera |

UI dostaje **gotowe dane domenowe** (`ArticleView` z `sourceHost`, `displayTitle` już rozstrzygniętym), nie surowy wiersz — host nie jest już wycinany w komponencie, fallback tytułu nie jest już duplikowany między mailem a tabelą.

### 5.3 Otwarte pytania zależne od kontraktu biblioteki — rozstrzygnięcia

1. **Czy `upsert(ignoreDuplicates).select()` zwraca tylko nowe wiersze?** Tak — PostgREST przy `Prefer: resolution=ignore-duplicates` zwraca wyłącznie faktycznie wstawione rekordy; na tym opiera się dzisiejsze liczenie [scrape.ts:83-85](../../scripts/scrape.ts#L83-L85). Decyzja zostaje **zakodowana w adapterze** (`recordScraped`), z komentarzem i testem kontraktowym — nie w skrypcie.
2. **Czy błędy zapytań mają płynąć jako `{data, error}`?** Nie — konwencja `{data, error}` to idiom supabase-js; port tłumaczy ją na wyjątki domenowe (`MarkSentFailedError` itd., nazwy z planu 02 §5.4). Mapowanie w adapterze.

## KROK 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu (grep)

`grep -rE '@supabase/supabase-js|Tables<"articles_seen">|from\("articles_seen"\)' src scripts tests` zwraca **wyłącznie**:
- `src/lib/adapters/supabase-article-repository.ts` (adapter),
- `src/lib/domain/article.ts` (mapowania `fromRow`/`toInsertRow` — import samego typu `Tables`),
- `src/types/supabase.ts` (plik generowany — źródło typów).

*Dozwolony wyjątek poza zakresem (auth, subdomena generic):* `src/lib/supabase.ts` (`@supabase/ssr`), `src/middleware.ts`, `src/pages/api/auth/*` — odnotowany jawnie; grep po `@supabase/ssr` celowo nie wchodzi do kryterium.

**Pliki, które dziś znają zależność, a po refaktorze już NIE:** `scripts/scrape.ts`, `scripts/send.ts`, `src/lib/services/articles.ts` (znika, wchłonięty przez port), `src/lib/supabase-script.ts` (wchłonięty przez adapter), `src/pages/dashboard/articles.astro`, `src/components/ArticlesTable.tsx`, `tests/scraper.test.ts`, `tests/send.test.ts`.

### 6.2 Fazy (konwencja projektu: zmiana per change-id, vitest, commit per faza)

1. **Faza 1 — domena** *(test-first)*: `src/lib/domain/article.ts` (+`ScrapedArticle`, `ArticleView`, `toView`) i `src/lib/domain/ports.ts`. Testy: `fromRow` (daty, unsafe URL), `displayTitle` fallback, `isSent`, `toView` serializowalność.
2. **Faza 2 — adapter** *(test-first na poziomie kontraktu)*: `SupabaseArticleRepository`; test kontraktowy `recordScraped` (duplicates z różnicy długości), mapowanie błędów na wyjątki. Wchłania `src/lib/supabase-script.ts`.
3. **Faza 3 — przepięcie skryptów**: `processSource` → czysta funkcja; `send.ts` przez port (jeśli plan 02 idzie pierwszy — tylko podmiana repo na port). Migracja mocków testowych na port.
4. **Faza 4 — przepięcie UI**: `articles.astro` + `ArticlesTable.tsx` na `ArticleView`; usunięcie `src/lib/services/articles.ts`.
5. **Faza 5 — weryfikacja**: grep z 6.1 jako check w CI lub skrypt; `npm run test`, `npm run build`, smoke `npm run scrape`/`send` na danych testowych; stryker na `src/lib/domain/`.

**Kolejność względem planu 02:** rekomendowana sekwencja 02 → 03 (najpierw niezmiennik N3, bo chroni dane; potem ACL, bo Faza 3 tutaj przepina `send.ts`, który 02 i tak przepisuje — wykonanie w odwrotnej kolejności podwoiłoby pracę na tym samym pliku). Alternatywnie jedna zmiana łączona z fazami 02.1→02.2→03.1→03.2→wspólne przepięcie.

---

## Podsumowanie

Zidentyfikowałem cztery zależności zewnętrzne i trzy realne przecieki: Supabase (P1), Resend (P2, już domknięty planem 02) i cheerio (P3); zod nie przecieka — pracuje dokładnie tam, gdzie tech-stack go deklaruje. Najgorszy przeciek to **P1: kształt wiersza `articles_seen` i `SupabaseClient<Database>` jako wspólna waluta pięciu warstw** — typ wygenerowany z DB jest kontraktem propsów komponentu klienckiego ([ArticlesTable.tsx:6](../../src/components/ArticlesTable.tsx#L6)), SDK siedzi w sygnaturach funkcji domenowych ([scrape.ts:25-29](../../scripts/scrape.ts#L25-L29), [send.ts:21-27](../../scripts/send.ts#L21-L27)), kształt artykułu jest rekonstruowany w trzech miejscach, testy odtwarzają fluent-API biblioteki, a niszowa wiedza o kontrakcie PostgREST (liczenie duplikatów) żyje w logice scrapera. To łamie zadeklarowaną w tech-stacku dyscyplinę „typy/walidacja na granicach" ([tech-stack.md:24](../foundation/tech-stack.md#L24)). Projekt ACL: encja `Article` z mapowaniami `fromRow`/`toInsertRow` jako jedyne miejsce wiedzy o kształcie, DTO `ArticleView` dla granicy serwer→klient, wąski port `ArticleRepository` (4 metody) i adapter `SupabaseArticleRepository` jako jedyny plik znający SDK. Dowód izolacji: wymiana biblioteki dotyka wyłącznie adaptera — tabele, skrypty, UI i testy zostają nietknięte; kryterium sukcesu to grep po nazwie pakietu zwracający tylko adapter, mapowania i plik generowany (z jawnym wyjątkiem dla generycznego auth). Plan ma 5 faz, dwie pierwsze test-first, i jest zsynchronizowany z planem 02 (port realizuje `DigestRunRepository`; rekomendowana kolejność 02 → 03, żeby nie przepisywać `send.ts` dwa razy).

Dokument zapisany: [context/domain/03-anti-corruption-layer.md](03-anti-corruption-layer.md).
