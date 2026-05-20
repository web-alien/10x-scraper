---
project: 10xScraper
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: "2025-06-30"
  after_hours_only: true
---

## Vision & Problem Statement

Ręczne śledzenie wielu serwisów internetowych w poszukiwaniu nowych artykułów jest czasochłonne i zawodne. Administrator zarządzający grupą — redakcją, zespołem lub społecznością — musi codziennie odwiedzać każdy serwis osobno, ryzykując pominięcie ważnych materiałów i tracąc czas na przeszukiwanie stron. Wiele wartościowych źródeł nie udostępnia kanałów RSS, co uniemożliwia korzystanie ze standardowych agregatorów.

Scraping HTML jako źródło danych odblokowuje serwisy, które nie wystawiają feedów — to luka, której czytniki RSS nie wypełniają. Aplikacja, która automatycznie pobiera nowe artykuły ze skonfigurowanych źródeł i rozsyła zestawienie do listy subskrybentów, eliminuje ręczną pracę przy zachowaniu pełnej kontroli nad listą odbiorców i doborem źródeł.

## User & Persona

**Persona główna — Administrator**

Osoba zarządzająca małą grupą (redakcja, zespół, społeczność), która chce, żeby jej odbiorcy regularnie otrzymywali zestawienie nowych artykułów z wybranych serwisów. Konfiguruje źródła i listę subskrybentów, inicjuje scraping oraz wysyłkę.

**Persona wtórna — Subskrybent**

Członek grupy, który otrzymuje codzienny digest mailowy z tytułami i leadami artykułów. Nie ma dostępu do żadnego panelu konfiguracyjnego — jest wyłącznie odbiorcą treści.

## Success Criteria

### Primary
- Admin konfiguruje co najmniej jedno źródło i jednego subskrybenta, uruchamia scraping, system pobiera nowe artykuły (tytuł + lead) i deduplikuje je, a następnie admin uruchamia wysyłkę i wszyscy subskrybenci z listy otrzymują maila. Przepływ działa end-to-end bez ręcznej ingerencji w kod poza konfiguracją.

### Secondary
- Skrypt po uruchomieniu wyświetla informację o liczbie artykułów pobranych z każdego źródła.

### Guardrails
- **Deduplication:** Ten sam artykuł nie może być wysłany więcej niż raz — system śledzi już przetworzone artykuły per źródło.
- **Dostawa maila:** Jeśli scraping zakończył się sukcesem i istnieją nowe artykuły, mail musi dotrzeć do wszystkich subskrybentów z listy. Brak cichych błędów dostawy.

## User Stories

### US-01: Cały przepływ MVP

- **Given** administrator ma skonfigurowane co najmniej jedno źródło i jednego subskrybenta
- **When** uruchamia scraping (system znajduje nowe artykuły), a następnie uruchamia wysyłkę
- **Then** każdy subskrybent z listy otrzymuje maila z tytułami i leadami nowych artykułów, a żaden artykuł nie jest wysłany ponownie w kolejnych wysyłkach

#### Acceptance Criteria
- Mail dociera do każdego subskrybenta zdefiniowanego w konfiguracji
- Artykuły pobrane w poprzednim uruchomieniu nie pojawiają się ponownie w kolejnym digestie
- # TODO: zachowanie skryptu gdy scraping nie znajdzie nowych artykułów — see Open Questions

## Functional Requirements

### Konfiguracja
- FR-001: Administrator może skonfigurować źródła w pliku konfiguracyjnym (URL + selektory HTML dla tytułu i leadu/linku). Priority: must-have
  > Socrates: Kontr-argument rozważony: "panel admina to overkill dla MVP — można zacząć od pliku konfiguracyjnego." Rozwiązanie: przyjęte — MVP używa pliku konfiguracyjnego; panel admina (FR-P01–P02) przesunięty do v2.

- FR-002: Administrator może skonfigurować listę subskrybentów w pliku konfiguracyjnym (adresy email). Priority: must-have
  > Socrates: Kontr-argument rozważony: "lista subskrybentów w pliku konfiguracyjnym to wystarczające MVP." Rozwiązanie: przyjęte — UI do zarządzania listą przesunięte do v2.

### Scraping
- FR-003: Administrator może ręcznie uruchomić scraping wszystkich skonfigurowanych źródeł. Priority: must-have
  > Socrates: Kontr-argument rozważony: "automatyzacja (cron) jest trudniejsza — lepiej zacząć od ręcznego." Rozwiązanie: przyjęte — ręczne uruchamianie świadomym wyborem dla MVP; automatyczny cron w v2.

- FR-004: System pobiera tytuły i leady nowych artykułów ze śledzonych źródeł, pomijając już przetworzone (deduplication per źródło). Priority: must-have
  > Socrates: Deduplication jest nienegocjowalnym guardrailem (patrz Success Criteria). FR stoi jako zapisane.

### Wysyłka mailowa
- FR-005: Administrator może ręcznie uruchomić wysyłkę maila do wszystkich subskrybentów z listy. Priority: must-have
  > Socrates: Kontr-argument rozważony: żaden — wysyłka maila to cel nr 1 produktu. FR stoi jako zapisane.

- FR-006: Subskrybent otrzymuje maila z listą nowych artykułów (tytuł + lead). Priority: must-have
  > Socrates: Kontr-argument rozważony: "AI-podsumowania to zewnętrzna zależność i koszt — można MVP bez AI, tylko tytuł+lead." Rozwiązanie: przyjęte — MVP wysyła tytuł + lead; AI-podsumowania (FR-A01) przesunięte do v2.

### V2 — poza zakresem MVP
- FR-P01: Administrator może dodać/edytować/usunąć źródło przez panel webowy. Priority: nice-to-have (v2)
- FR-P02: Administrator może zarządzać listą subskrybentów przez panel webowy. Priority: nice-to-have (v2)
- FR-A01: System generuje AI-podsumowanie każdego artykułu. Priority: nice-to-have (v2)
- FR-S01: Administrator widzi statystyki scrapingu w panelu (liczba artykułów per źródło). Priority: nice-to-have (v2)

## Non-Functional Requirements

- Skuteczność scrapingu: aplikacja pobiera ≥90% artykułów dostępnych na stronie podczas jednego uruchomienia.
- Prywatność listy mailingowej: adresy email subskrybentów nie są widoczne dla innych odbiorców ani ujawniane osobom trzecim.

## Business Logic

Artykuł trafia do digestu tylko jeśli nie był wcześniej wysłany — aplikacja śledzi co już przetworzyła per źródło i pomija duplikaty.

Wejście: URL źródła i selektory wskazujące tytuł oraz lead artykułu. Administrator dostarcza te dane raz w konfiguracji.

Wyjście: lista nowych artykułów (tytuł + lead) z każdego źródła, które pojawiły się od ostatniego scrapingu i nie były jeszcze wysłane.

Jak użytkownik to widzi: subskrybent dostaje maila tylko z artykułami, których jeszcze nie otrzymał. Ponowne uruchomienie scrapingu bez nowych artykułów nie produkuje duplikatów w wysyłce.

## Access Control

**MVP:** Brak logowania. Dostęp jest lokalny — administrator uruchamia skrypty bezpośrednio na maszynie. Brak uwierzytelniania w MVP.

**V2 (panel webowy):** Administrator loguje się przez formularz email + hasło. Płaski model uprawnień — jeden poziom dostępu, brak podziału na role.

**Subskrybent:** Brak logowania w żadnej wersji. Subskrybent jest wyłącznie pasywnym odbiorcą maila.

## Non-Goals

- **Samodzielny zapis/wypis subskrybentów:** Subskrybenci nie mogą sami zarządzać swoją subskrypcją — robi to admin w konfiguracji. Brak formularza opt-in/opt-out.
- **Personalizacja digestu:** Każdy subskrybent otrzymuje identyczny digest ze wszystkich skonfigurowanych źródeł. Brak możliwości wyboru źródeł per-subskrybent.
- **AI-podsumowania w MVP:** MVP wysyła tytuł + lead; generowanie podsumowań przez model językowy przesunięte do v2.
- **Panel admina w MVP:** Konfiguracja przez plik; interfejs webowy przesunięty do v2.

## Open Questions

1. **Zachowanie przy braku nowych artykułów:** Co powinien zrobić skrypt wysyłkowy gdy scraping nie znalazł nowych artykułów — nie wysyłać niczego, wysłać pusty mail z informacją, czy poinformować tylko admina na wyjściu skryptu? — TBD przez użytkownika. Block: nie (można przyjąć brak wysyłki jako domyślne zachowanie, ale warto ustalić przed implementacją).
