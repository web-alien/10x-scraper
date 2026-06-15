---
title: Niezmiennik → agregat-strażnik — plan refaktoru (DigestRun)
created: 2026-06-12
type: refactor-plan
---

# Plan refaktoru: agregat-strażnik dla niezmiennika dostawy digestu

> Produkt to PLAN, nie implementacja. Kod produkcyjny nie został zmodyfikowany.
> Kontynuacja destylacji: [01-domain-distillation.md](01-domain-distillation.md).

## KROK 0 — Kontekst (odkryty, zweryfikowany)

- **Wymagania:** [context/foundation/prd.md](../foundation/prd.md) (PRD v1, §Success Criteria, §Business Logic), [context/foundation/roadmap.md](../foundation/roadmap.md), [idea-notes.md](../../idea-notes.md).
- **Stack:** Astro 6 SSR + React 19 na Cloudflare Workers; rdzeń domeny w skryptach CLI ([scripts/scrape.ts](../../scripts/scrape.ts), [scripts/send.ts](../../scripts/send.ts)); persystencja Supabase Postgres (jedna tabela domenowa `articles_seen`); transport Resend; read-only dashboard.
- **Warstwy, w których żyje logika wysyłki:**
  - CLI/entry: [scripts/send.ts:96-150](../../scripts/send.ts#L96-L150) (env, config, zapytanie, exit code),
  - „serwis": funkcja `runDigest` [scripts/send.ts:21-94](../../scripts/send.ts#L21-L94) (budowa HTML, wysyłka, oznaczanie),
  - persystencja: kolumna `digest_sent_at` [migration 20260528150000](../../supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql),
  - UI: [src/components/ArticlesTable.tsx:65-66](../../src/components/ArticlesTable.tsx#L65-L66) prezentuje `digest_sent_at` jako status „Wysłano".
- **Testy:** vitest ([vitest.config.ts](../../vitest.config.ts)), istniejące [tests/send.test.ts](../../tests/send.test.ts), mutation testing (stryker). Projekt ma dyscyplinę test-first dostępną przez `/10x-tdd`.

## KROK 1 — Zidentyfikowane niezmienniki biznesowe

| ID | Niezmiennik (MUSI być zawsze prawdziwe) | Źródło (cytat) |
|---|---|---|
| **N1** | Dany artykuł istnieje co najwyżej raz per źródło (unikalność `(source_url, article_url)`). | „system śledzi już przetworzone artykuły per źródło" [prd.md:43](../foundation/prd.md#L43); `UNIQUE (source_url, article_url)` [migration 20260526](../../supabase/migrations/20260526000000_create_articles_seen.sql) |
| **N2** | Artykuł raz wysłany w digestcie nigdy nie trafia do kolejnego digestu. | „Ten sam artykuł nie może być wysłany więcej niż raz" [prd.md:43](../foundation/prd.md#L43); filtr `digest_sent_at IS NULL` [send.ts:130](../../scripts/send.ts#L130) |
| **N3** | **Artykuł jest oznaczony jako wysłany (`digest_sent_at`) wtedy i tylko wtedy, gdy digest z nim faktycznie dotarł do subskrybentów. Błąd dostawy nigdy nie jest cichy.** | „Jeśli scraping zakończył się sukcesem i istnieją nowe artykuły, mail musi dotrzeć do wszystkich subskrybentów z listy. Brak cichych błędów dostawy" [prd.md:44](../foundation/prd.md#L44); „NULL = artykuł nie był jeszcze wysłany w digestcie" [migration 20260528150000](../../supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql) |
| **N4** | Każdy nowy artykuł zostaje kiedyś dostarczony — żaden nie ginie po cichu między scrapingiem a wysyłką. | „każdy subskrybent z listy otrzymuje maila z tytułami i leadami nowych artykułów" [prd.md:52](../foundation/prd.md#L52); §Business Logic [prd.md:95-99](../foundation/prd.md#L95-L99) |
| **N5** | Adresy subskrybentów nie są ujawniane innym odbiorcom. | „adresy email subskrybentów nie są widoczne dla innych odbiorców" [prd.md:91](../foundation/prd.md#L91) |
| **N6** | Wejście do scrapingu to poprawny URL + selektor linku; źródło bez nich nie jest przetwarzane. | „URL + selektory HTML dla tytułu i leadu/linku" [prd.md:62](../foundation/prd.md#L62); `SourceSchema` [scrape.ts:10-18](../../scripts/scrape.ts#L10-L18) |

## KROK 2 — Klasyfikacja i wybór #1

| ID | (a) Rdzeniowość | (b) Rozsmarowanie po warstwach | (c) Egzekwowanie |
|---|---|---|---|
| N1 | Wysoka (guardrail dedup) | Niskie — 1 miejsce (DB constraint + upsert) | **Egzekwowany** (DB) |
| N2 | Wysoka (guardrail dedup) | Średnie — filtr w CLI + semantyka kolumny | Egzekwowany (zapytanie), ale zależny od poprawności N3 |
| **N3** | **Najwyższa** — broni jedynego primary success criterion [prd.md:37](../foundation/prd.md#L37) i jawnego guardrailu [prd.md:44](../foundation/prd.md#L44) | **Najwyższe** — semantyka w migracji, zapis w `runDigest`, odczyt w CLI, prezentacja w UI (4 miejsca, 3 warstwy) | **NARUSZALNY / ignorowany** — kod oznacza „wysłane" niezależnie od wyniku dostawy; dwa połknięte błędy (szczegóły w KROKU 3) |
| N4 | Wysoka | Średnie | **Naruszalny** — 24h cutoff trwale gubi artykuły [send.ts:124-132](../../scripts/send.ts#L124-L132) |
| N5 | Średnia | Niskie | Egzekwowany (osobny `send` per adres [send.ts:66-77](../../scripts/send.ts#L66-L77)) |
| N6 | Średnia | Niskie | Egzekwowany (zod na wejściu) |

**Wybór #1: N3** — jedyny niezmiennik, który jest jednocześnie maksymalnie rdzeniowy (PRD nazywa go wprost guardrailem i primary success criterion) **i** faktycznie naruszany w kodzie, z konsekwencją w postaci cichej, trwałej utraty danych (artykuł „spalony" bez dostarczenia nigdy nie wróci — N2 działa przeciwko użytkownikowi). N4 jest tym samym defektem widzianym z drugiej strony (selekcja zamiast oznaczania) — projekt agregatu domyka oba.

## KROK 3 — Diagnoza N3: gdzie reguła żyje dziś

Reguła „oznaczone = dostarczone, błędy dostawy nie są ciche" żyje w 4 miejscach i **żadne jej nie egzekwuje**:

1. **Dokument (deklaracja):** [prd.md:44](../foundation/prd.md#L44) — guardrail zapisany, bez odzwierciedlenia w kodzie.
2. **Persystencja (semantyka bez strażnika):** komentarz w [migration 20260528150000](../../supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql) definiuje znaczenie `NULL`, ale dostawa jest zdarzeniem zewnętrznym (Resend) — DB nie może sama wymusić „⟺ dostarczony". Strażnikiem musi być kod domenowy; dziś go nie ma.
3. **`runDigest` (naruszenie #1 — oznaczanie mimo porażki):** [send.ts:66-78](../../scripts/send.ts#L66-L78) zbiera porażki do `failedCount` przez `Promise.allSettled`, po czym [send.ts:80-86](../../scripts/send.ts#L80-L86) wykonuje `update({ digest_sent_at })` dla **wszystkich** `safeArticles`, bez sprawdzenia `failedCount`. Przy `failedCount === subscribers.length` (totalna porażka) artykuły i tak są oznaczone jako wysłane.
4. **`runDigest` (naruszenie #2 — połknięty błąd oznaczania):** [send.ts:88-91](../../scripts/send.ts#L88-L91) — błąd `update` jest logowany i przemilczany; komentarz mówi wprost: *„do not exit — articles are considered «sent» regardless of mark failure"*. To odwrotny defekt: dostarczone, ale nieoznaczone → następny run wyśle duplikaty (narusza N2). Log-and-continue zamiast fail-fast.
5. **CLI (egzekucja spóźniona):** [send.ts:149](../../scripts/send.ts#L149) — `if (failedCount > 0) process.exit(1)` sygnalizuje porażkę kodem wyjścia, ale **po** nieodwracalnym oznaczeniu artykułów. Sygnał bez ochrony stanu.
6. **CLI (naruszenie N4 sprzężone):** [send.ts:124-132](../../scripts/send.ts#L124-L132) — selekcja do wysyłki dokłada `seen_at > now-24h`; artykuł niedostarczony (np. po porażce z pkt 3, gdyby oznaczanie naprawiono) i tak wypadnie z okna po 24h. Komentarz w kodzie przyznaje: *„they age out silently"*.
7. **UI (klient prezentuje fałsz jako fakt):** [ArticlesTable.tsx:65-66](../../src/components/ArticlesTable.tsx#L65-L66) renderuje `digest_sent_at` jako „Wysłano {data}" — administrator patrzący na dashboard widzi „wysłano" także dla artykułów, których nikt nie dostał. UI nie jest strażnikiem (i słusznie), ale konsumuje skażony stan.
8. **Testy (kodyfikują naruszenie):** [tests/send.test.ts:32-48](../../tests/send.test.ts#L32-L48) — przypadek „Resend error" asercjonuje tylko `failedCount`; mock Supabase ([tests/send.test.ts:21-29](../../tests/send.test.ts#L21-L29)) przyjmuje `update` bezwarunkowo. Brak testu „przy porażce dostawy artykuły NIE są oznaczane".

**Wniosek diagnostyczny:** nie istnieje żaden byt odpowiedzialny za przejście stanu *pending → sent*. Przejście wykonuje proceduralny kod, który nie sprawdza warunku przejścia (dostarczono?) i nie zatrzymuje się na błędzie. Klasyczny przypadek na agregat z maszyną stanów.

## KROK 4 — Projekt agregatu-strażnika: `DigestRun`

### 4.1 Decyzja polityki (do potwierdzenia przez użytkownika, z rekomendacją)

Przy **częściowej** porażce dostawy N2 i N3 wchodzą w konflikt: ponowienie wyśle duplikat tym, którzy digest dostali. Rekomendacja: **N3 wygrywa** — guardrail dostawy jest primary success criterion, a duplikat u części odbiorców jest odwracalnie irytujący, podczas gdy niedostarczenie jest nieodwracalną utratą. Polityka MVP: *oznaczaj jako wysłane tylko przy pełnym sukcesie (`failedCount === 0`); każda porażka zostawia artykuły w stanie pending do ponowienia*. (Pełne rozwiązanie per-subskrybent — tabela `digest_deliveries` — to v2; odnotowane w 4.5.)

### 4.2 Agregat (root): `DigestRun` — jedyne miejsce egzekwowania N3

Nowy moduł: `src/lib/domain/digest-run.ts` (zgodnie z konwencją „services/helpers w `src/lib/`", [CLAUDE.md](../../CLAUDE.md)). Czysta logika, zero I/O — testowalna bez mocków sieci.

```ts
// src/lib/domain/errors.ts — nazwane błędy domenowe
export class EmptyDigestError extends Error {}        // brak artykułów — digest nie powstaje
export class NoSubscribersError extends Error {}      // brak odbiorców — wysyłka bez sensu
export class DeliveryIncompleteError extends Error {  // ktokolwiek nie dostał maila
  constructor(public readonly failed: ReadonlyArray<{ email: string; reason: string }>) { ... }
}
export class IllegalStateTransitionError extends Error {} // np. markSent przed recordDelivery

// src/lib/domain/digest-run.ts
type RunState = "pending" | "delivered" | "failed";

export class DigestRun {
  private state: RunState = "pending";

  // Fabryka z preconditions — nielegalna konstrukcja rzuca, nie tworzy "pustego" runu
  static create(articles: Article[], subscribers: string[]): DigestRun
  //   throws EmptyDigestError      gdy articles.length === 0   (dziś: exit 0 w CLI — OK, ale reguła przenosi się do domeny)
  //   throws NoSubscribersError    gdy subscribers.length === 0 (dziś: niegwarantowane)
  //   wewnątrz: filtr unsafe URL (przeniesiony z send.ts:28-40)

  subject(): string                 // przeniesione z send.ts:50
  htmlBody(): string                // przeniesione z send.ts:52-64 (grupowanie po hostname, escaping)

  // JEDYNA brama do stanu "delivered". Precondition: state === "pending".
  recordDelivery(report: DeliveryReport): void
  //   report = wynik wysyłki per subskrybent: { email, ok, reason? }[]
  //   gdy wszyscy ok            → state = "delivered"
  //   gdy ktokolwiek nie-ok     → state = "failed"; throw DeliveryIncompleteError(failed)
  //   gdy state !== "pending"   → throw IllegalStateTransitionError

  // Dostęp do ID-ków do oznaczenia. Precondition: state === "delivered".
  sentArticleIds(): string[]
  //   gdy state !== "delivered" → throw IllegalStateTransitionError
  //   ⇒ NIE DA SIĘ oznaczyć artykułów bez wcześniejszego potwierdzenia pełnej dostawy
}
```

Niezmiennik N3 jest egzekwowany **strukturalnie**: jedyna droga do `sentArticleIds()` prowadzi przez `recordDelivery()` z kompletem sukcesów. Naruszenie nie jest możliwe bez ominięcia agregatu.

### 4.3 Repozytorium: `DigestRunRepository` — ładowanie/zapis zamiast rozsianych zapytań

Nowy moduł: `src/lib/repos/digest-run-repository.ts`.

```ts
export class DigestRunRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  // Zastępuje zapytanie z send.ts:127-132.
  // USUWA 24h cutoff (naprawa N4): kryterium wyłącznie digest_sent_at IS NULL.
  loadPendingArticles(): Promise<Article[]>

  // Zastępuje update z send.ts:80-86. Wywołuje run.sentArticleIds() —
  // więc samo wywołanie jest legalne tylko dla run w stanie "delivered".
  markSent(run: DigestRun, at: Date): Promise<void>
  //   pojedynczy UPDATE ... WHERE id IN (...) — jedna instrukcja SQL = atomowo po stronie DB
  //   błąd UPDATE → throw MarkSentFailedError (fail-fast; koniec z "do not exit" z send.ts:88-91)
}
```

**Atomowość:** transakcja nie może objąć Resend (system zewnętrzny), więc atomowość realizują dwie rzeczy: (1) oznaczanie to **jedna** instrukcja `UPDATE … IN (…)` — wszystkie artykuły albo żadne; (2) kolejność *najpierw potwierdzona dostawa, potem oznaczenie* + fail-fast na błędzie oznaczenia. Okno awarii „dostarczono, ale UPDATE padł" zostaje (możliwy duplikat w następnym runie), lecz jest **głośne** (exit ≠ 0, nazwany błąd) — zgodnie z guardrailem ciche jest zabronione; wybieramy duplikat zamiast utraty (decyzja 4.1).

### 4.4 Cienkie wejście: `scripts/send.ts` jako shell

```
main():
  env-check (bez zmian) → wczytaj subscribers.json (zod, bez zmian)
  repo = new DigestRunRepository(supabase)
  articles = await repo.loadPendingArticles()
  try:
    run = DigestRun.create(articles, subscribers)
  catch EmptyDigestError:   log "Brak nowych artykułów…"; exit 0   // decyzja z roadmap.md:130
  catch NoSubscribersError: log błąd; exit 1

  report = await deliver(run, resend, fromEmail)   // adapter Resend: czysty I/O, zero decyzji
  try:
    run.recordDelivery(report)
    await repo.markSent(run, new Date())
    log statystyki; exit 0
  catch DeliveryIncompleteError e:
    log e.failed (kto, dlaczego); exit 1           // artykuły ZOSTAJĄ pending → retry
  catch MarkSentFailedError e:
    log "dostarczono, ale oznaczenie padło — następny run może zduplikować"; exit 1
```

Egzekucja niezmiennika przenosi się z „klienta" (dziś: nadzieja, że operator zauważy exit code) do domeny. CLI tylko parsuje wejście, woła agregat i mapuje nazwane błędy na kody wyjścia/logi — odpowiednik „cienkiego API route" w projekcie bez API.

### 4.5 Świadomie poza zakresem (v2)

- Tabela `digest_runs` / `digest_deliveries` (dostawa per subskrybent, idempotentne ponowienia bez duplikatów) — wymaga migracji i decyzji produktowej; obecny plan nie zamyka do niej drogi.
- Zmiana UI poza etykietą (ArticlesTable czyta tę samą kolumnę; po refaktorze kolumna mówi prawdę, więc UI naprawia się „za darmo").

## KROK 5 — Before/after, fazy, testy, nazwy

### 5.1 Before → After (każde dzisiejsze miejsce reguły)

| Miejsce (dziś) | Before | After |
|---|---|---|
| [send.ts:28-40](../../scripts/send.ts#L28-L40) filtr unsafe URL | luźna logika w `runDigest` | precondition w `DigestRun.create()` |
| [send.ts:50-64](../../scripts/send.ts#L50-L64) subject + HTML | inline w `runDigest` | `run.subject()` / `run.htmlBody()` (czyste, testowalne) |
| [send.ts:66-78](../../scripts/send.ts#L66-L78) wysyłka + zliczanie porażek | `allSettled` → licznik | adapter `deliver()` zwraca `DeliveryReport`; ocena należy do `recordDelivery()` |
| [send.ts:80-86](../../scripts/send.ts#L80-L86) oznaczanie WSZYSTKICH mimo porażek | **naruszenie N3** | `repo.markSent(run)` osiągalne wyłącznie w stanie `delivered`; porażka → `DeliveryIncompleteError`, artykuły pending |
| [send.ts:88-91](../../scripts/send.ts#L88-L91) połknięty błąd UPDATE | log-and-continue | `MarkSentFailedError`, exit ≠ 0 (fail-fast, głośny) |
| [send.ts:124-132](../../scripts/send.ts#L124-L132) 24h cutoff | ciche gubienie (N4) | `loadPendingArticles()` bez okna czasowego — kryterium tylko `digest_sent_at IS NULL` |
| [send.ts:139-142](../../scripts/send.ts#L139-L142) brak artykułów → exit 0 | decyzja w CLI | `EmptyDigestError` z fabryki; CLI tylko mapuje na exit 0 |
| [tests/send.test.ts:32-48](../../tests/send.test.ts#L32-L48) | testuje tylko `failedCount` | zastąpione zestawem testów niezmiennika (5.3) |
| [ArticlesTable.tsx:65-66](../../src/components/ArticlesTable.tsx#L65-L66) | pokazuje skażony stan | bez zmian kodu — kolumna odzyskuje wiarygodność |

### 5.2 Fazy refaktoru (kolejność = malejące ryzyko)

1. **Faza 1 — agregat `DigestRun` + błędy domenowe** *(test-first — czysta logika, idealna pod `/10x-tdd`)*: `src/lib/domain/errors.ts`, `src/lib/domain/digest-run.ts`; przeniesienie filtra URL, subject, HTML.
2. **Faza 2 — `DigestRunRepository`** *(test-first z mockiem Supabase, wzorzec jak w [tests/send.test.ts:21-29](../../tests/send.test.ts#L21-L29))*: `loadPendingArticles` (bez cutoffu), `markSent` (fail-fast).
3. **Faza 3 — przepięcie `scripts/send.ts`** *(implement, nie TDD — orkiestracja I/O)*: cienki shell z 4.4; usunięcie `runDigest`; migracja istniejących testów.
4. **Faza 4 — weryfikacja end-to-end**: `npm run send` na danych testowych z wymuszoną porażką Resend (zły API key) → asercja ręczna: artykuły pozostają `digest_sent_at IS NULL`, exit 1. Stryker na `src/lib/domain/` (mutanty w `recordDelivery` muszą ginąć).
5. **Faza 5 — dokumenty**: PRD — domknięcie Open Question #1 ([prd.md:118-120](../foundation/prd.md#L118-L120)) i dopisanie polityki 4.1; wpis do [lessons.md](../foundation/lessons.md) („stan pochodny od systemu zewnętrznego oznaczaj wyłącznie po potwierdzeniu").

### 5.3 Przypadki testowe niezmiennika (Faza 1–2, test-first)

**Legalne:**
- `create(artykuły, subskrybenci)` → stan `pending`; `subject()`/`htmlBody()` deterministyczne.
- `recordDelivery(wszyscy ok)` → stan `delivered`; `sentArticleIds()` zwraca komplet ID.
- pełny happy path repo: `markSent` wykonuje jeden `UPDATE` z kompletem ID.

**Nielegalne (każdy MUSI rzucać nazwany błąd, nie „logować i jechać"):**
- `create([], subs)` → `EmptyDigestError`.
- `create(arts, [])` → `NoSubscribersError`.
- `recordDelivery(1 z N padł)` → `DeliveryIncompleteError` z listą `{email, reason}`; stan `failed`.
- `recordDelivery(wszyscy padli)` → jw. (dzisiejszy scenariusz z [tests/send.test.ts:32](../../tests/send.test.ts#L32), ale z asercją o NIE-oznaczaniu).
- `sentArticleIds()` w stanie `pending` lub `failed` → `IllegalStateTransitionError`. **(test-strażnik N3)**
- `recordDelivery` wywołane drugi raz → `IllegalStateTransitionError`.
- `markSent` gdy UPDATE zwraca błąd → `MarkSentFailedError` (propagowany, nie połknięty).
- artykuł z `javascript:`-URL odfiltrowany w `create` (parytet z [send.ts:28-40](../../scripts/send.ts#L28-L40)).
- regresja N4: `loadPendingArticles` zwraca artykuł z `seen_at` sprzed 48h i `digest_sent_at IS NULL`.

### 5.4 Nowe nazwy „load-bearing"

Projekt nie prowadzi formalnego rejestru kontraktów (najbliższy byt: [lessons.md](../foundation/lessons.md) — append-only register reguł); nazwy rejestruję tutaj jako kanoniczne:

`DigestRun` (agregat root), stany `pending | delivered | failed`, `DeliveryReport`, `DigestRunRepository`, oraz błędy: `EmptyDigestError`, `NoSubscribersError`, `DeliveryIncompleteError`, `IllegalStateTransitionError`, `MarkSentFailedError`.

---

## Podsumowanie

Z sześciu zidentyfikowanych niezmienników wybrano **N3**: „artykuł jest oznaczony jako wysłany ⟺ digest faktycznie dotarł; brak cichych błędów dostawy" — jest najbardziej rdzeniowy (jawny guardrail i primary success criterion PRD) i jako jedyny aktywnie naruszany. Diagnoza pokazała, że reguła żyje w 4 warstwach (PRD, migracja, `runDigest`, UI) i żadna jej nie egzekwuje: kod oznacza wszystkie artykuły jako wysłane niezależnie od wyniku dostawy ([send.ts:80-86](../../scripts/send.ts#L80-L86)), połyka błąd oznaczania ([send.ts:88-91](../../scripts/send.ts#L88-L91)), a 24h cutoff po cichu gubi niedostarczone artykuły ([send.ts:124-132](../../scripts/send.ts#L124-L132)). Zaprojektowano agregat `DigestRun` z maszyną stanów `pending → delivered | failed`, w którym jedyna droga do oznaczenia artykułów (`sentArticleIds()`) prowadzi przez `recordDelivery()` z kompletem sukcesów — naruszenie niezmiennika staje się strukturalnie niemożliwe, a nielegalne operacje rzucają nazwane błędy domenowe zamiast logować i jechać dalej. Repozytorium zastępuje rozsiane zapytania, oznacza jednym atomowym `UPDATE` i usuwa 24h cutoff, domykając przy okazji niezmiennik N4. Plan ma 5 faz, z których dwie pierwsze (czysta domena + repo) idą test-first na istniejącym vitest, z 9 przypadkami nielegalnych przejść; UI naprawia się bez zmian kodu, bo kolumna `digest_sent_at` odzyskuje wiarygodność. Jedna decyzja wymaga potwierdzenia użytkownika: przy częściowej porażce dostawy rekomendowana polityka to „nie oznaczaj, ponów" (możliwy duplikat u części odbiorców zamiast trwałej utraty artykułów).
