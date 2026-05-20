---
project: 10xScraper
version: 0.1.0
status: draft
created: 2026-05-18
updated: 2026-05-18
context_type: greenfield
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 6
  quality_check_status: accepted
  product_type: web-app
  target_scale: small
  hard_deadline: "2025-06-30"
  after_hours_only: true
  mvp_weeks: 3
---

## Vision & Problem Statement

**Problem:** Ręczne śledzenie wielu serwisów internetowych w poszukiwaniu nowych artykułów jest czasochłonne i zawodne. Wiele wartościowych źródeł nie udostępnia kanałów RSS, co uniemożliwia korzystanie z czytników. Pełne artykuły są za długie, żeby je codziennie czytać w całości.

**Rozwiązanie:** Aplikacja automatycznie scrapuje zadane strony internetowe (przez selektory HTML), pobiera tytuły i leady najnowszych artykułów i raz dziennie rozsyła zestawienie do listy subskrybentów mailingowych.

**Insight:** Scraping HTML jako źródło danych (zamiast RSS) odblokowuje serwisy, które nie wystawiają feedów — to luka, której czytniki RSS nie wypełniają.

## User & Persona

**Persona główna:** Administrator — osoba zarządzająca małą grupą (redakcja, zespół, społeczność), która konfiguruje źródła w pliku konfiguracyjnym, zarządza listą subskrybentów i inicjuje scraping oraz wysyłkę.

**Persona wtórna (odbiorca):** Subskrybent — członek grupy, który otrzymuje codzienny digest mailowy z tytułami i leadami artykułów, bez dostępu do żadnego panelu.

**Moment bólu:** Codziennie, gdy administrator chce sprawdzić co nowego pojawiło się w śledzonych serwisach — i musiałby odwiedzić każdy z nich ręcznie.

**Koszt dziś:** Czas tracony na manualne przeglądanie; ryzyko pominięcia ważnych materiałów; brak narzędzia, które agreguje treści z serwisów bez RSS.

## Access Control

**Administrator:** Loguje się przez formularz email + hasło (dotyczy v2 z panelem). W MVP dostęp do skryptów jest lokalny — brak logowania w MVP. Płaski model uprawnień, brak podziału na role.

**Subskrybent:** Brak logowania. Subskrybent jest pasywnym odbiorcą — otrzymuje digest mailowy. Admin zarządza listą subskrybentów w pliku konfiguracyjnym.

## Success Criteria

### Primary
Admin konfiguruje co najmniej jedno źródło w pliku konfiguracyjnym (URL + selektory HTML), uruchamia skrypt scrapujący, system pobiera nowe artykuły (tytuł + lead) i deduplikuje je, a następnie admin uruchamia skrypt wysyłkowy i wszyscy subskrybenci z listy otrzymują maila. Przepływ działa end-to-end bez ręcznej ingerencji w kod poza konfiguracją.

### Secondary
Skrypt po uruchomieniu wyświetla statystyki: ile artykułów pobrano z każdego źródła.

### Guardrails
- **Deduplication:** Ten sam artykuł nie może być wysłany więcej niż raz — system śledzi już przetworzone artykuły per źródło.
- **Dostawa maila:** Jeśli scraping zakończył się sukcesem i istnieją nowe artykuły, mail musi dotrzeć do wszystkich subskrybentów z listy. Brak cichych błędów dostawy.

## Functional Requirements

### Konfiguracja (plik)
- FR-001: Administrator może skonfigurować źródła w pliku konfiguracyjnym (URL + selektory HTML dla tytułu i leadu/linku). Priority: must-have
  > Socrates: Kontr-argument rozważony: "panel admina to overkill dla MVP — można zacząć od pliku konfiguracyjnego." Rozwiązanie: przyjęte — MVP używa pliku konfiguracyjnego; panel admina (FR-P01–P03) przesunięty do v2.

- FR-002: Administrator może skonfigurować listę subskrybentów w pliku konfiguracyjnym (adresy email). Priority: must-have
  > Socrates: Kontr-argument rozważony: "lista subskrybentów w pliku konfiguracyjnym to wystarczające MVP." Rozwiązanie: przyjęte — UI do zarządzania listą przesunięte do v2.

### Scraping
- FR-003: Administrator może ręcznie uruchomić scraping wszystkich skonfigurowanych źródeł (przez skrypt / CLI). Priority: must-have
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
- FR-A01: System generuje AI-podsumowanie każdego artykułu przez LLM. Priority: nice-to-have (v2)
- FR-S01: Administrator widzi statystyki scrapingu w panelu (liczba artykułów per źródło). Priority: nice-to-have (v2)

## User Stories

### US-01: Cały przepływ MVP
**Given** administrator ma skonfigurowany plik z co najmniej jednym źródłem i jednym subskrybentem,
**When** uruchamia skrypt scrapujący (system znajduje nowe artykuły), a następnie uruchamia skrypt wysyłkowy,
**Then** każdy subskrybent z listy otrzymuje maila z tytułami i leadami nowych artykułów, a żaden artykuł nie jest wysłany ponownie w kolejnych wysyłkach.

## Business Logic

Artykuł trafia do digestu tylko jeśli nie był wcześniej wysłany — aplikacja śledzi co już przetworzyła per źródło i pomija duplikaty.

**Wejście:** URL źródła + selektory HTML wskazujące tytuł i lead/link artykułu. Użytkownik dostarcza te dane raz w pliku konfiguracyjnym.

**Wyjście:** Lista nowych artykułów (tytuł + lead) z każdego źródła, które pojawiły się od ostatniego scrapingu i nie były jeszcze wysłane.

**Jak użytkownik to widzi:** Subskrybent dostaje maila tylko z artykułami, których jeszcze nie otrzymał. Admin uruchamiając skrypt dwa razy pod rząd nie produkuje duplikatów w wysyłce.

## Non-Functional Requirements

- Skuteczność scrapingu: aplikacja pobiera ≥90% artykułów dostępnych na stronie podczas jednego uruchomienia.
- Prywatność listy mailingowej: adresy email subskrybentów nie są ujawniane osobom trzecim ani widoczne w treści maila (BCC lub wysyłka per-rekord).

## Non-Goals

- **Samodzielny zapis/wypis subskrybentów:** Subskrybenci nie mogą sami zarządzać swoją subskrypcją — robi to admin w pliku konfiguracyjnym. Brak formularza opt-in/opt-out.
- **Personalizacja digestu:** Każdy subskrybent otrzymuje identyczny digest ze wszystkich skonfigurowanych źródeł. Brak możliwości wyboru źródeł per-subskrybent.
- **AI-podsumowania w MVP:** MVP wysyła tytuł + lead; LLM przesunięty do v2.
- **Panel admina w MVP:** Konfiguracja przez plik; interfejs webowy przesunięty do v2.
