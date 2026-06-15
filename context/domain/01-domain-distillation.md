---
title: Destylacja domeny — 10xScraper
created: 2026-06-12
type: domain-distillation
---

# Destylacja domeny: 10xScraper

> Mapa domeny biznesowej zdestylowana z dokumentów źródłowych i kodu. Produkt to MAPA, nie kod.
> Metoda: odkrycie → Ubiquitous Language → klasyfikacja subdomen → kandydaci na agregaty → rozjazdy model↔kod → ranking refaktoru.

## KROK 0 — Kontekst projektu

**Dokumenty źródłowe (znalezione):**

- [idea-notes.md](../../idea-notes.md) — surowa wizja produktu (najwcześniejsza narracja).
- [context/foundation/prd.md](../foundation/prd.md) — PRD v1, status `draft`, greenfield, web-app. Główne źródło wymagań.
- [context/foundation/roadmap.md](../foundation/roadmap.md) — slice'y F-01..S-04, wszystkie `done`/implemented.
- [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md), [AGENTS.md](../../AGENTS.md) — opis stacku i konwencji.
- Historia zmian: [context/changes/](../changes/) i [context/archive/](../archive/) — `supabase-dedup-schema`, `scraper-script`, `email-digest-script`, `auto-digest-cron`, `articles-dashboard`.

**Ograniczenie odkrycia:** Dokumenty wymagań ISTNIEJĄ i są bogate — nie musiałem opierać się wyłącznie na kodzie. PRD ma jednak status `draft` i jedno otwarte pytanie ([prd.md:118-120](../foundation/prd.md#L118-L120)) realnie wpływające na logikę wysyłki.

**Stack i struktura (gdzie żyje logika biznesowa):**

- **Astro 6 SSR + React 19 + Tailwind 4**, deploy na Cloudflare Workers ([CLAUDE.md](../../CLAUDE.md)).
- **Rdzeń domeny żyje w skryptach CLI**, nie w warstwie webowej:
  - [scripts/scrape.ts](../../scripts/scrape.ts) — scraping + deduplikacja.
  - [scripts/send.ts](../../scripts/send.ts) — budowa i wysyłka digestu.
- **Persystencja:** Supabase Postgres, jedyna tabela domenowa `articles_seen` ([supabase/migrations/](../../supabase/migrations/)).
- **Konfiguracja domeny w plikach** (świadomy wybór MVP): [sources.json](../../sources.json), [subscribers.json](../../subscribers.json).
- **Warstwa web (UI):** read-only dashboard ([src/pages/dashboard/articles.astro](../../src/pages/dashboard/articles.astro)) + service [src/lib/services/articles.ts](../../src/lib/services/articles.ts). Auth (Supabase SSR) istnieje, ale jest poza rdzeniem MVP.
- Warstwy: **plik konfiguracyjny (wejście) → skrypt (domena) → Supabase (stan) → Resend (wyjście) → dashboard (podgląd)**.

---

## KROK 1 — Ubiquitous Language

Każde pojęcie: definicja → cytat źródłowy → miejsce w kodzie (lub „BRAK w kodzie").

| Pojęcie | Definicja domenowa | Cytat źródłowy | Miejsce w kodzie |
|---|---|---|---|
| **Źródło (Source)** | Serwis WWW do scrapowania: URL + selektory HTML wskazujące tytuł i lead/link. | „skonfigurować źródła… (URL + selektory HTML dla tytułu i leadu/linku)" [prd.md:62](../foundation/prd.md#L62) | `SourceSchema` [scrape.ts:10-18](../../scripts/scrape.ts#L10-L18); dane w [sources.json](../../sources.json) |
| **Selektor (Selector)** | Wyrażenie CSS identyfikujące w HTML element tytułu, leadu lub linku artykułu. | „zestawu tagów jako identyfikatorów i klas, dzięki którym skrypt będzie wiedział, który element to tytuł, a który lead lub link" [idea-notes.md:7](../../idea-notes.md#L7) | `selectors: { articleLink, title?, lead? }` [scrape.ts:13-17](../../scripts/scrape.ts#L13-L17) |
| **Artykuł (Article)** | Pojedynczy materiał: tytuł + lead + URL, powiązany ze źródłem. Jednostka deduplikacji i wysyłki. | „pobiera tytuły i leady nowych artykułów" [prd.md:72](../foundation/prd.md#L72) | wiersz `articles_seen`; typ `Article` [send.ts:13-19](../../scripts/send.ts#L13-L19) |
| **Przetworzony / Widziany artykuł (Seen)** | Artykuł już zapisany dla danego źródła — nie pobierany ponownie. | „system śledzi już przetworzone artykuły per źródło" [prd.md:43](../foundation/prd.md#L43) | tabela `articles_seen`, UNIQUE `(source_url, article_url)` [migration 20260526](../../supabase/migrations/20260526000000_create_articles_seen.sql) |
| **Deduplikacja (Deduplication)** | Reguła: ten sam artykuł nie może trafić do digestu więcej niż raz; śledzenie per źródło. | „Ten sam artykuł nie może być wysłany więcej niż raz" [prd.md:43](../foundation/prd.md#L43) | upsert `ignoreDuplicates` [scrape.ts:74-77](../../scripts/scrape.ts#L74-L77); `digest_sent_at` przy wysyłce [send.ts:80-86](../../scripts/send.ts#L80-L86) |
| **Scraping** | Operacja: pobranie HTML wszystkich źródeł i wyłuskanie nowych artykułów. | „ręcznie uruchomić scraping wszystkich skonfigurowanych źródeł" [prd.md:69](../foundation/prd.md#L69) | `processSource` + pętla [scrape.ts:25-148](../../scripts/scrape.ts#L25-L148); `npm run scrape` |
| **Digest** | Zestawienie nowych artykułów (tytuł + lead) wysyłane mailem, grupowane wg hosta źródła. | „maila z listą nowych artykułów (tytuł + lead)" [prd.md:79](../foundation/prd.md#L79) | budowa HTML + subject [send.ts:50-64](../../scripts/send.ts#L50-L64) |
| **Wysyłka (Send / runDigest)** | Operacja rozesłania digestu do wszystkich subskrybentów i oznaczenia artykułów jako wysłane. | „ręcznie uruchomić wysyłkę maila do wszystkich subskrybentów" [prd.md:76](../foundation/prd.md#L76) | `runDigest` [send.ts:21-94](../../scripts/send.ts#L21-L94); `npm run send` |
| **Subskrybent (Subscriber)** | Adres email odbiorcy digestu; pasywny, bez panelu. | „członek grupy, który otrzymuje codzienny digest mailowy… wyłącznie odbiorcą" [prd.md:30-32](../foundation/prd.md#L30-L32) | `SubscribersSchema = z.array(z.email())` [send.ts:10-11](../../scripts/send.ts#L10-L11); [subscribers.json](../../subscribers.json) |
| **Administrator (Administrator)** | Osoba konfigurująca źródła i subskrybentów, inicjująca scraping i wysyłkę. | „Konfiguruje źródła i listę subskrybentów, inicjuje scraping oraz wysyłkę" [prd.md:26-28](../foundation/prd.md#L26-L28) | brak bytu — admin = osoba uruchamiająca `npm run scrape/send` i (v2) logująca się do dashboardu |
| **Lead** | Krótki zajawkowy fragment artykułu (zamiast pełnej treści / AI-podsumowania w MVP). | „MVP wysyła tytuł + lead; AI-podsumowania… przesunięte do v2" [prd.md:80](../foundation/prd.md#L80) | kolumna `lead` [migration 20260528000000](../../supabase/migrations/20260528000000_add_title_lead_to_articles_seen.sql); [scrape.ts:51-57](../../scripts/scrape.ts#L51-L57) |
| **Status wysyłki (digest_sent_at)** | Znacznik czasu: NULL = artykuł nie był wysłany; data = wysłany. Realny nośnik deduplikacji wysyłki. | „NULL = artykuł nie był jeszcze wysłany w digestcie" [migration 20260528150000](../../supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql) | kolumna `digest_sent_at`; filtr `.is(... null)` [send.ts:130](../../scripts/send.ts#L130), zapis [send.ts:80-86](../../scripts/send.ts#L80-L86) |
| **AI-podsumowanie (Summary)** | Skrót artykułu generowany przez LLM. | „za pomocą LLM zmienia w krótkie podsumowanie" [idea-notes.md:4](../../idea-notes.md#L4); v2 [prd.md:85](../foundation/prd.md#L85) | **BRAK w kodzie** — świadomie odłożone do v2 |
| **Panel admina (Admin panel)** | Webowy CRUD źródeł i subskrybentów. | „Panel, w którym po zalogowaniu administrator… dodać, edytować, usuwać" [idea-notes.md:8](../../idea-notes.md#L8); v2 [prd.md:83-84](../foundation/prd.md#L83-L84) | **BRAK w kodzie** (poza read-only dashboardem artykułów) — v2 |

---

## KROK 2 — Klasyfikacja subdomen (Core / Supporting / Generic)

Rdzeń = to, co stanowi przewagę i sens produktu. Punkt odniesienia: §Vision i §Success Criteria.

| Obszar / pojęcie | Kategoria | Uzasadnienie (odwołanie do celów) |
|---|---|---|
| **Scraping HTML przez selektory** | **Core** | To unikalna teza produktu: „Scraping HTML… odblokowuje serwisy, które nie wystawiają feedów — to luka, której czytniki RSS nie wypełniają" [prd.md:22](../foundation/prd.md#L22). Bez tego produkt jest zwykłym agregatorem RSS. Kryterium NFR: ≥90% artykułów [prd.md:90](../foundation/prd.md#L90). |
| **Deduplikacja (Seen / digest_sent_at)** | **Core** | Nienegocjowalny guardrail: „Ten sam artykuł nie może być wysłany więcej niż raz" [prd.md:43](../foundation/prd.md#L43); FR-004 oznaczony jako stojący „bez negocjacji" [prd.md:73](../foundation/prd.md#L73). To rdzeń obietnicy „dostajesz tylko nowe". |
| **Digest + niezawodna wysyłka** | **Core** | Cel nr 1 produktu i jedyne primary success criterion: „wszyscy subskrybenci z listy otrzymują maila… Brak cichych błędów dostawy" [prd.md:37](../foundation/prd.md#L37), [prd.md:44](../foundation/prd.md#L44), [prd.md:77](../foundation/prd.md#L77). North star S-02 [roadmap.md:24](../foundation/roadmap.md#L24). |
| **Konfiguracja źródeł i subskrybentów** | **Supporting** | Konieczna do działania rdzenia, ale świadomie zredukowana do plików JSON — „panel admina to overkill dla MVP" [prd.md:63](../foundation/prd.md#L63). Wspiera rdzeń, nie jest przewagą. |
| **Dashboard / podgląd artykułów** | **Supporting** | Wygodny wgląd zamiast Supabase Studio ([roadmap.md:106-115](../foundation/roadmap.md#L106-L115)); poza primary success criteria (PRD refs: „—"). Ułatwia, nie definiuje produktu. |
| **Prywatność listy mailingowej** | **Supporting** | NFR jakościowy: „adresy email… nie są widoczne dla innych odbiorców" [prd.md:91](../foundation/prd.md#L91). Wspiera zaufanie, nie jest rdzeniem. |
| **Auth / sesje (Supabase SSR)** | **Generic** | Standardowy mechanizm; MVP nie wymaga auth („dostęp lokalny" [prd.md:105](../foundation/prd.md#L105)). Generyczna infrastruktura, nie domena. |
| **Dostawa email (Resend)** | **Generic** | Wymienny dostawca transportu — „dowolny obsługuje use case" [roadmap.md:88](../foundation/roadmap.md#L88). Generyczna, choć jej *niezawodność* należy do rdzenia. |
| **Harmonogram (GitHub Actions cron)** | **Generic** | Generyczny scheduler owijający istniejące skrypty: „Zero zmian w kodzie" [roadmap.md:103](../foundation/roadmap.md#L103). |
| **AI-podsumowania** | **Core (przyszły) — BRAK w MVP** | W oryginalnej wizji rdzeniowe („LLM zmienia w krótkie podsumowanie" [idea-notes.md:4](../../idea-notes.md#L4)), świadomie wycięte z MVP do v2 [prd.md:115](../foundation/prd.md#L115). |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

Dla każdego: niezmiennik (reguła zawsze prawdziwa) → cytat → status egzekwowania w kodzie.

### A. `ArticleSeen` (wiersz `articles_seen`) — główny kandydat na agregat

- **Niezmiennik I1 (unikalność per źródło):** dany artykuł istnieje co najwyżej raz na źródło.
  - Cytat: „system śledzi już przetworzone artykuły per źródło" [prd.md:43](../foundation/prd.md#L43).
  - Status: **EGZEKWOWANY** na poziomie DB — `UNIQUE (source_url, article_url)` [migration 20260526](../../supabase/migrations/20260526000000_create_articles_seen.sql) + `upsert(..., ignoreDuplicates: true)` [scrape.ts:74-77](../../scripts/scrape.ts#L74-L77).

- **Niezmiennik I2 (wysyłka co najwyżej raz):** artykuł raz oznaczony jako wysłany nie trafia do kolejnego digestu.
  - Cytat: „Ten sam artykuł nie może być wysłany więcej niż raz" [prd.md:43](../foundation/prd.md#L43); „Artykuły… nie pojawiają się ponownie w kolejnym digestie" [prd.md:56](../foundation/prd.md#L56).
  - Status: **EGZEKWOWANY, ale poprzez słaby protokół** — filtr `digest_sent_at IS NULL` [send.ts:130](../../scripts/send.ts#L130) gwarantuje brak powtórki, lecz oznaczenie następuje hurtowo bez transakcji ze stanem dostawy (patrz I3, rozjazd D2).

- **Niezmiennik I3 (oznaczony jako wysłany ⟺ dostarczony):** artykuł powinien być oznaczony `digest_sent_at` tylko jeśli faktycznie dotarł do subskrybentów.
  - Cytat: „Jeśli scraping zakończył się sukcesem i istnieją nowe artykuły, mail musi dotrzeć do wszystkich subskrybentów… Brak cichych błędów dostawy" [prd.md:44](../foundation/prd.md#L44).
  - Status: **IGNOROWANY** — `update({ digest_sent_at })` obejmuje WSZYSTKIE `safeArticles` niezależnie od `failedCount` [send.ts:80-86](../../scripts/send.ts#L80-L86). Przy częściowej (lub całkowitej) porażce dostawy artykuły i tak są „spalone" → nigdy nie zostaną ponownie wysłane. Najpoważniejszy nieegzekwowany niezmiennik rdzeniowy.

### B. `Source` (konfiguracja źródła) — kandydat słaby

- **Niezmiennik:** źródło ma poprawny URL i selektor linku, by scraping był możliwy.
  - Cytat: „URL + selektory HTML dla tytułu i leadu/linku" [prd.md:62](../foundation/prd.md#L62).
  - Status: **DEKLAROWANY** walidacją wejścia (`z.url()`, `articleLink` wymagane) [scrape.ts:10-18](../../scripts/scrape.ts#L10-L18), ale to byt konfiguracyjny w pliku, bez tożsamości w bazie ani cyklu życia. Nie jest pełnym agregatem.

### C. `Subscriber` (lista subskrybentów) — kandydat słaby

- **Niezmiennik:** subskrybent to poprawny adres email; lista jest prywatna.
  - Cytat: „adresy email subskrybentów nie są widoczne dla innych odbiorców" [prd.md:91](../foundation/prd.md#L91).
  - Status: format **EGZEKWOWANY** (`z.array(z.email())` [send.ts:10](../../scripts/send.ts#L10)); prywatność **EGZEKWOWANA** — osobny `send` per adres `to: [email]`, brak wspólnego CC/BCC [send.ts:66-77](../../scripts/send.ts#L66-L77). Brak tożsamości/persystencji — byt plikowy.

### D. `DigestRun` (przebieg wysyłki) — agregat UKRYTY / nieistniejący

- **Niezmiennik kandydujący:** pojedyncze uruchomienie wysyłki jest atomowe względem stanu „wysłane" — albo digest dociera i artykuły są oznaczone, albo stan pozostaje odwracalny.
  - Cytat: „Przepływ działa end-to-end bez ręcznej ingerencji… mail musi dotrzeć do wszystkich subskrybentów" [prd.md:37](../foundation/prd.md#L37), [prd.md:44](../foundation/prd.md#L44).
  - Status: **IGNOROWANY** — nie ma żadnego bytu reprezentującego przebieg wysyłki; logika rozsmarowana proceduralnie w `runDigest` [send.ts:21-94](../../scripts/send.ts#L21-L94). To luka koncepcyjna stojąca za rozjazdem D2.

---

## KROK 4 — Rozjazdy MODEL vs KOD

Najcenniejsza tabela: gdzie wiedza domenowa istnieje, a kod jej nie odwzorowuje.

| # | Dokument mówi (X) | Kod robi (Y) | Dowód (plik:linia) | Waga |
|---|---|---|---|---|
| **D1** | „mail musi dotrzeć do wszystkich subskrybentów… Brak cichych błędów dostawy" [prd.md:44](../foundation/prd.md#L44) | Po `Promise.allSettled` artykuły są oznaczane `digest_sent_at` dla WSZYSTKICH, nawet gdy część/wszystkie wysyłki padły; `failedCount` wpływa tylko na kod wyjścia, nie na to, co oznaczono. Padłe artykuły nigdy nie zostaną ponowione. | [send.ts:66-93](../../scripts/send.ts#L66-L93) | **Krytyczna** — cicha utrata danych, łamie rdzeniowy guardrail. |
| **D2** | „artykuł… nie był wcześniej wysłany — aplikacja śledzi co już przetworzyła" — wysyłka oparta o fakt wysłania [prd.md:95](../foundation/prd.md#L95) | Zapytanie o artykuły do wysyłki dokłada okno czasowe `seen_at > teraz-24h`; artykuły starsze niż 24h z `digest_sent_at IS NULL` są **trwale pomijane** („age out silently"). | [send.ts:124-132](../../scripts/send.ts#L124-L132) | **Wysoka** — reguła „24h" nie ma źródła w PRD; może spowodować, że nowy artykuł NIGDY nie zostanie wysłany (sprzeczne z [prd.md:44](../foundation/prd.md#L44)). |
| **D3** | Otwarte pytanie: zachowanie przy braku nowych artykułów — TBD [prd.md:118-120](../foundation/prd.md#L118-L120); roadmap deklaruje „resolved: brak wysyłki (log)" [roadmap.md:130](../foundation/roadmap.md#L130) | Kod: jeśli brak artykułów → log i `exit 0`, brak wysyłki. | [send.ts:139-142](../../scripts/send.ts#L139-L142) | Niska — kod zgodny z rozstrzygnięciem roadmapy, ale PRD wciąż ma to jako Open Question (dokument nieaktualny względem decyzji). |
| **D4** | „pobiera tytuły i leady nowych artykułów" — tytuł jako element artykułu [prd.md:72](../foundation/prd.md#L72) | `title` jest opcjonalny w schemacie; gdy selektor tytułu nie podany, tytułem zostaje tekst linku; gdy `title` null przy wysyłce — fallback do URL. Artykuł bez tytułu jest dopuszczalny. | [scrape.ts:36](../../scripts/scrape.ts#L36), [send.ts:58](../../scripts/send.ts#L58) | Niska — pragmatyczny fallback, ale rozluźnia model „artykuł = tytuł + lead". |
| **D5** | §Access Control MVP: „Brak logowania… dostęp lokalny" [prd.md:105](../foundation/prd.md#L105) | Pełny stos auth Supabase SSR + middleware chroniący trasy istnieje w kodzie (baseline „partial"). Dashboard artykułów wymaga zalogowania. | [src/middleware.ts](../../src/middleware.ts), [src/pages/dashboard/articles.astro:15-19](../../src/pages/dashboard/articles.astro#L15-L19) | Niska — to funkcja v2 obecna wcześniej; rozjazd „kod ma więcej niż MVP", nie luka. |
| **D6** | NFR: „pobiera ≥90% artykułów dostępnych na stronie" [prd.md:90](../foundation/prd.md#L90) | Brak jakiejkolwiek miary pokrycia/weryfikacji skuteczności; przy 0 dopasowań tylko `console.warn`. | [scrape.ts:62-65](../../scripts/scrape.ts#L62-L65) | Średnia — kluczowe NFR rdzenia jest niemierzalne w kodzie. |
| **D7** | Wizja: AI-podsumowania jako sedno („LLM zmienia w krótkie podsumowanie") [idea-notes.md:4](../../idea-notes.md#L4) | Brak — odłożone do v2. | BRAK w kodzie | Niska (świadoma decyzja, [prd.md:115](../foundation/prd.md#L115)) — odnotowane jako redukcja zakresu, nie defekt. |

---

## KROK 5 — Ranking refaktoru

Szeregowanie kandydatów wg **wartości** (jak rdzeniowy niezmiennik) × **ryzyka** (jak słabo egzekwowany dziś).

| Ranga | Cel refaktoru | Wartość (rdzeniowość) | Ryzyko (słabość egzekucji) | Uzasadnienie |
|---|---|---|---|---|
| **#1** | `DigestRun` / I3 — sprząc oznaczenie `digest_sent_at` z faktyczną dostawą (D1) | Najwyższa — to primary success criterion i guardrail PRD | Najwyższe — dziś całkowicie ignorowany; cicha utrata danych | Oznaczać jako wysłane wyłącznie artykuły, których digest dotarł; przy porażce subskrybenta nie „spalać" artykułów. To realizacja niezmiennika I3 i wprowadzenie pojęcia przebiegu wysyłki. |
| **#2** | Reguła „24h cutoff" przy wyborze artykułów (D2) | Wysoka — bezpośrednio dotyka „mail musi dotrzeć" | Wysokie — ukryta reguła bez źródła, trwale gubi artykuły | Albo usunąć okno i wysyłać po `digest_sent_at IS NULL`, albo udokumentować regułę w PRD jako świadomy niezmiennik. Dziś kod milcząco zawęża model. |
| **#3** | NFR skuteczności ≥90% (D6) | Wysoka (rdzeń = scraping) | Średnie — brak pomiaru, ale nie powoduje utraty danych | Wprowadzić obserwowalność pokrycia (np. oczekiwana vs. pobrana liczba), by NFR był weryfikowalny. |
| **#4** | Spójność dokumentów (D3) | Niska | Niskie | Zamknąć Open Question w PRD zgodnie z już podjętą decyzją „brak wysyłki". |

### #1 do refaktoru — rekomendacja

**`DigestRun` / niezmiennik I3 (rozjazd D1).** Jest jednocześnie najbardziej rdzeniowy (broni jedynego primary success criterion i guardrailu „brak cichych błędów dostawy", [prd.md:37](../foundation/prd.md#L37) i [prd.md:44](../foundation/prd.md#L44)) **i** najsłabiej egzekwowany (dziś w ogóle ignorowany — [send.ts:80-86](../../scripts/send.ts#L80-L86)). Najwyższa wartość razy najwyższe ryzyko. Brakuje agregatu reprezentującego przebieg wysyłki, który utrzymywałby atomowość między „dostarczono" a „oznaczono jako wysłane"; jego wprowadzenie domyka również D2 (sposób wyboru artykułów do wysyłki).

---

## Podsumowanie

Artefakt destyluje domenę 10xScrapera z bogatych dokumentów (idea-notes, PRD v1, roadmap) skonfrontowanych z kodem, którego rdzeń żyje nie w aplikacji webowej, lecz w dwóch skryptach CLI ([scrape.ts](../../scripts/scrape.ts), [send.ts](../../scripts/send.ts)) i jednej tabeli `articles_seen`. Zbudowano Ubiquitous Language (13 pojęć z cytatami i lokalizacją w kodzie), sklasyfikowano subdomeny — rdzeń to **scraping HTML przez selektory, deduplikacja i niezawodny digest**, a auth/cron/Resend są generyczne — oraz wskazano kandydatów na agregaty: dojrzały `ArticleSeen` i brakujący, ukryty `DigestRun`. Najcenniejszym wynikiem jest mapa siedmiu rozjazdów model↔kod. Najważniejszy wniosek: **kod łamie rdzeniowy guardrail „brak cichych błędów dostawy"** — artykuły są oznaczane jako wysłane niezależnie od tego, czy mail faktycznie dotarł ([send.ts:80-86](../../scripts/send.ts#L80-L86)), co przy porażce dostawy trwale gubi artykuły. Drugą cichą regułą bez źródła w PRD jest 24-godzinne okno odcięcia artykułów ([send.ts:124-132](../../scripts/send.ts#L124-L132)). Refaktor #1 to wprowadzenie pojęcia `DigestRun` i sprzężenie znacznika `digest_sent_at` z faktyczną dostawą — najwyższa wartość przy najwyższym ryzyku.
