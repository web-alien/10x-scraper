---
project: "Team Activity Digest"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
created: 2026-06-15
updated: 2026-06-15
timeline_budget:
  mvp_weeks: 2
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "koszt koordynacji + dane uwięzione w wielu miejscach + tarcie w przepływie pracy"
    - topic: "insight"
      decision: "widoczność per-osoba, nie per-projekt — Jira/Git pokazują wg projektu/repo, brakuje przekroju per człowiek"
    - topic: "model dostępu"
      decision: "wspólny read-only widok przez link, bez logowania; płaski model, brak ról"
    - topic: "zakres MVP"
      decision: "Jira + PR pełne złączenie per-osoba, ale jednorazowy statyczny raport (bez interaktywności/odświeżania/filtrów)"
    - topic: "dopasowanie tożsamości"
      decision: "v1 zakłada ten sam login w Jirze i Git; akceptowalne ryzyko przy ≤6 osobach"
  frs_drafted: 6
  quality_check_status: accepted
---

## Vision & Problem Statement

**Problem:** Status pracy małego zespołu programistów (≤6 osób) jest rozproszony między trzy miejsca — zadania w Jirze, kod w pull requestach, powiadomienia o review na Microsoft Teams. Nie istnieje jeden widok, który łączy „co" (zadanie) z „na jakim etapie w kodzie" (PR) w przekroju konkretnej osoby. Programista (IC), który chce wiedzieć, kto rusza obszar, którego on dotyka, albo na czym stoi czyjeś zadanie, musi ręcznie klikać po Jirze i liście PR-ów oraz dopytywać na Teams.

**Insight:** Wartość jest w widoczności **per-osoba, nie per-projekt**. Jira board i lista PR-ów pokazują rzeczy pogrupowane wg projektu/repo; brakuje przekroju „co robi teraz konkretny człowiek" — zadanie Jiry obok jego otwartych PR-ów. To luka, której żadne z istniejących narzędzi osobno nie wypełnia.

**Kategoria bólu:** koszt koordynacji (czas na ustalanie kto co robi), dane uwięzione w wielu miejscach (informacja istnieje, ale rozbita), tarcie w przepływie pracy (kolizje na tym samym kodzie, czekanie).

**Uwaga o skali (sonda 100×):** przy ~600 osobach sama reguła (złączenie + porządek wg utknięcia) przetrwałaby, ale jeden raport per-osoba straciłby użyteczność bez grupowania po zespołach i filtrów, a dopasowanie „ten sam login" rozpadłoby się. Nie zmienia MVP — sygnał, że prezentacja, nie reguła, jest tym, co skaluje się najgorzej.

## User & Persona

**Persona główna:** Programista (IC) w małym zespole (≤6 osób) — nie manager. Pracuje na co dzień w kodzie, potrzebuje orientacji, kto rusza powiązane obszary i na czym stoją zadania/PR-y współpracowników.

**Moment bólu:** Gdy musi ustalić, kto pracuje nad obszarem, którego on dotyka, albo na jakim etapie jest czyjeś zadanie — żeby uniknąć kolizji (dwie osoby, ten sam kod) i pracy w ciemno.

**Koszt dziś:** Ręczne klikanie po Jirze i liście PR-ów + pytanie na Teams. Ryzyko kolizji i niepotrzebnej pracy, gdy informacja przychodzi za późno.

> Uwaga (z mom-test): istnieje ryzyko, że dla IC realny ból jest węższy — latencja review PR-a (sygnał 3 z mapy możliwości), a nie złączenie Jira+Git. Do potwierdzenia w walidacji; trzymane jako założenie obciążone ryzykiem.

## Access Control

**Programista (odbiorca):** Brak logowania. Digest jest wspólnym, read-only widokiem dostępnym przez link w sieci zespołu — każdy członek zespołu widzi ten sam zestaw danych. Płaski model uprawnień, brak podziału na role w MVP.

> Otwarte pytanie: model „bez logowania" jest bezpieczny tylko dlatego, że MVP działa na danych mock/lokalnych/read-only. Jeśli kiedyś podłączymy realne dane firmowe (Jira/Git produkcyjny), kontrola dostępu i audyt muszą wejść przed tym krokiem.

## Success Criteria

### Primary
Na przygotowanych eksportach (zadania Jira „in progress" jako CSV + otwarte PR-y jako eksport/JSON) narzędzie generuje **jeden statyczny raport**, w którym dla każdego członka zespołu widać jego zadania in-progress obok jego otwartych PR-ów, dopasowanych po loginie i posortowanych po „utknięciu" (najstarsza aktywność u góry). Raport powstaje bez ręcznej ingerencji poza dostarczeniem eksportów.

### Secondary
Pozycje „utknięte" (najstarsza aktywność — stary PR, zadanie bez ruchu) są wizualnie wyróżnione, żeby rzucały się w oczy ponad sam porządek sortowania.

### Guardrails
- **Czysty odczyt:** narzędzie wyłącznie czyta eksporty — nigdy nie zapisuje do Jiry ani Gita (żadnych zmian statusów, komentarzy, przypisań).

> Otwarte pytanie (z decyzji o dopasowaniu po loginie): co dzieje się z osobą/PR-em, gdy login nie pasuje między systemami? Ryzyko cichego pominięcia. Do rozstrzygnięcia — kandydat: sekcja „niedopasowane" zamiast usuwania.

## Functional Requirements

### Wczytywanie danych
- FR-001: Narzędzie wczytuje eksport zadań Jira „in progress" (CSV). Priority: must-have
  > Socrates: Kontr-argument rozważony: „eksport CSV to ręczny krok przy każdym raporcie — może zabić nawyk; API Jiry zdjęłoby ten koszt." Rozwiązanie: przyjęte dla MVP — ręczny eksport świadomym uproszczeniem v1 (dane mock/lokalne); automatyzacja przez API to ruch na v2. Ryzyko dla nawyku zanotowane.
- FR-002: Narzędzie wczytuje eksport otwartych PR-ów z Gita. Priority: must-have
  > Socrates: Kontr-argument rozważony: „samą listę otwartych PR-ów widać już w GitHub/GitLab — to duplikat." Rozwiązanie: przyjęte — wartością nie jest lista PR-ów osobno, lecz jej złączenie z Jirą per-osoba (insight). Standalone byłby duplikatem; złączony nie jest.

### Złączenie i prezentacja
- FR-003: Narzędzie dopasowuje zadania i PR-y do osoby po loginie. Priority: must-have
  > Socrates: Kontr-argument rozważony: „login w Jirze ≠ login w Git — dopasowanie po loginie cicho zgubi osoby/PR-y, niszcząc jądro widoku per-osoba." Rozwiązanie: FR stoi, ALE kontr-argument jest mocny — wzmacnia otwarte pytanie o sekcję „niedopasowane". Bez tego fallbacku „załóż ten sam login" zagraża całemu insightowi. Do rozstrzygnięcia przed implementacją.
- FR-004: Narzędzie sortuje pozycje każdej osoby po „utknięciu" (najstarsza aktywność u góry). Priority: must-have
  > Socrates: Kontr-argument rozważony: „stare ≠ problem — niektóre PR-y/zadania leżą celowo (zablokowane, odłożone), a sortowanie po wieku krzyczy o rzeczach, które są OK." Rozwiązanie: przyjęte — sortowanie po utknięciu to heurystyka „na co zerknąć", nie wyrok. W przyszłości warto oznaczać pozycje świadomie odłożone (poza MVP).
- FR-005: Programista widzi jeden statyczny raport z widokiem per-osoba — zadania in-progress obok otwartych PR-ów. Priority: must-have
  > Socrates: Kontr-argument rozważony: „statyczny snapshot jest nieaktualny już w chwili czytania — kto mu zaufa na tyle, by zmienić zachowanie?" Rozwiązanie: FR stoi (snapshot to świadome zwężenie zakresu), ALE raport musi nieść znacznik czasu generacji, żeby nikt nie wziął go za dane live. Dodane do otwartych pytań.
- FR-006: Narzędzie wizualnie wyróżnia pozycje „utknięte". Priority: nice-to-have
  > Socrates: Kontr-argument rozważony: „skoro FR-004 sortuje po utknięciu, najstarsze i tak są na górze — wyróżnianie powtarza tę samą informację." Rozwiązanie: pozostaje nice-to-have (poza MVP), ale jawnie oznaczone jako kandydat do wycięcia jako redundantne wobec FR-004.

## User Stories

### US-01: Wygenerowanie raportu per-osoba
- **Given** przygotowane eksporty (zadania Jira „in progress" w CSV + otwarte PR-y) zawierające loginy osób,
- **When** programista generuje raport,
- **Then** widzi dla każdej osoby jej zadania in-progress obok jej otwartych PR-ów, posortowane po „utknięciu", z wizualnie wyróżnionymi pozycjami najstarszymi.

#### Acceptance Criteria
- Każda osoba obecna w eksportach pojawia się w raporcie raz, ze swoimi zadaniami i PR-ami.
- Pozycje każdej osoby są posortowane wg najstarszej aktywności (utknięcia) u góry.
- Pusty eksport daje czytelny stan pusty, a nie błąd ani zerową listę bez wyjaśnienia.

## Business Logic

Dla każdej osoby aplikacja łączy jej zadania Jira z jej PR-ami i porządkuje je wg czasu bezruchu, tak by najdłużej stojące pozycje trafiały na wierzch.

**Wejście:** dwa zestawy danych dostarczone przez użytkownika jako eksporty — zadania „in progress" (z loginem osoby) oraz otwarte PR-y (z loginem autora i czasem ostatniej aktywności).

**Wyjście:** dla każdej osoby jeden uporządkowany zestaw jej zadań i PR-ów, w którym pozycje o najdłuższym bezruchu są na górze. Reguła nie tworzy ani nie zmienia żadnych rekordów — wyłącznie łączy i porządkuje to, co dostała.

**Jak użytkownik to widzi:** otwierając raport, programista od razu widzi, czyja praca (zadanie + powiązany kod) stoi najdłużej, bez przeskakiwania między Jirą, listą PR-ów i Teams.

## Non-Functional Requirements

- **Kompletność:** każda osoba i każda pozycja (zadanie, PR) obecna w dostarczonych eksportach pojawia się w raporcie; pozycja, której nie udało się dopasować do osoby, trafia do wyraźnej sekcji „niedopasowane", a nie znika po cichu (zero cichych pominięć).

## Non-Goals

- **Brak integracji live z API Jiry/Gita:** MVP działa na eksportach (CSV/JSON); podłączenie API to v2. Decyzja kształtuje przepływ danych. *(wybrane wprost w Fazie 6)*
- **Brak interaktywności (filtry / odświeżanie / panel):** jednorazowy statyczny snapshot — bez live-refresh i filtrów. *(wynika z decyzji o zakresie MVP, Faza 3)*
- **Brak realnych danych firmowych w v1:** tylko dane mock/lokalne/read-only; realne Jira/Git produkcyjne dopiero po przemyśleniu kontroli dostępu i audytu. *(wynika z ograniczenia danych ustalonego w mapie możliwości)*
- **Brak powiadomień i przypisywania reviewerów:** to sygnał 3 z mapy możliwości — osobny temat, mechanizm już istnieje (Request review / CODEOWNERS / integracja Teams). Digest nie wchodzi w tę rolę. *(wykluczone w mapie możliwości)*

## Open Questions

1. **Dopasowanie tożsamości między systemami** — co dzieje się, gdy login w Jirze ≠ login w Git? Decyzja v1 („załóż ten sam login") jest krucha i zagraża jądru widoku per-osoba. Kandydat na rozwiązanie: sekcja „niedopasowane" (spójna z NFR kompletności). Owner: użytkownik. Block: częściowy — bez fallbacku insight per-osoba jest zagrożony.
2. **Znacznik czasu snapshotu** — czy statyczny raport musi jawnie pokazywać czas generacji danych (z rundy sokratejskiej FR-005), żeby nie był mylony z danymi live? Owner: użytkownik.
3. **Definicja „utknięcia"** — od jakiego progu bezruchu pozycja liczy się jako „utknięta" (dotyczy FR-006 i sortowania FR-004)? Owner: użytkownik.
4. **Kontrola dostępu przy realnych danych** — model „bez logowania" jest bezpieczny tylko dla danych mock/lokalnych; wejście realnych danych firmowych wymaga kontroli dostępu i audytu przed implementacją. Owner: użytkownik.
5. **Redundancja FR-006** — czy wizualne wyróżnianie utknięć przeżyje obok sortowania (FR-004), czy zostanie wycięte jako powtórzenie tej samej informacji? Owner: użytkownik.
6. **Walidacja problemu (mom-test)** — założenie, że ból IC to złączenie Jira+Git (a nie sama latencja review PR-a), nie zostało jeszcze potwierdzone rozmowami. Plan w `context/team/mom-test-validation.md`. Owner: użytkownik. Block: tak, jeśli walidacja wskaże węższy ból.
