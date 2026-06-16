# Opportunity Map

## Context

- **Project / context**: Widoczność pracy zespołu — kto nad czym pracuje (Jira + Git + Teams)
- **Data constraint**: Mock / lokalne / read-only / niewrażliwe — pierwsza wersja może zostać lekka (bez kontroli dostępu i audytu na start)
- **Date**: 2026-06-15

## Map

| Sygnał | Istniejące rozwiązanie | Cienki dodatek | Pierwsza użyteczna wersja | Ryzyko danych | Kierunek |
|---|---|---|---|---|---|
| Brak widoczności zadań całego zespołu w Jirze — nie wiadomo, kto nad czym pracuje | Pole Assignee, boardy, filtry JQL, dashboardy „Work distribution" / „User workload" | Codzienny digest „kto ma co in-progress" w jednej tabeli osoba × zadanie | Skrypt na eksporcie CSV / API Jiry → tabela assignee → otwarte zadania ze statusem i datą zmiany | read-only / mock | Internal tool |
| Brak łatwego widoku „co teraz w kodzie" — co przerabiane, przez kogo, na jakim etapie | Lista otwartych PR, draft/ready, branche, Pulse, Projects board | Digest otwartych PR: autor, branch, status, wiek, ostatnia aktywność | Skrypt na API / eksporcie PR → tabela osoba × PR | read-only / mock | Internal tool |
| PR-y nie są przypisywane do osób — informuje się o nich przez Teams | Request review, Assignees, CODEOWNERS, oficjalna integracja GitHub/GitLab ↔ Teams | brak istotnego (narzędzie już istnieje) | Włączyć istniejące mechanizmy (required reviewers / CODEOWNERS + integracja Teams) | n/d | **Wait / no build** |

Uwaga: sygnał 3 to tarcie *procesowe* (brak nawyku), nie luka narzędziowa — mechanizm jest na wyciągnięcie ręki, więc budowanie czegokolwiek tylko dublowałoby istniejącą funkcję.

## Recommended First Candidate

```text
Kandydat:
Tablica „Kto nad czym pracuje" (Team Activity Digest)

Czyta:
- eksport CSV / API Jiry (zadania in-progress + assignee + status + data zmiany)
- API / eksport otwartych PR-ów z Git (autor, branch, draft/ready, wiek, ostatnia aktywność)

Zwraca:
Jeden read-only widok keyowany osobą: dla każdego członka zespołu jego
zadania Jira in-progress obok jego otwartych PR-ów. Sortowane po „utknięciu"
(najstarsza aktywność na górze). Forma: statyczny raport / digest, np. tabela
w terminalu, plik Markdown albo zmockowany HTML.

Nie robi:
- nie zmienia statusów w Jirze ani PR-ów (czysty odczyt)
- nie staje się nowym system of record — linkuje do Jiry i Gita
- nie wysyła powiadomień, nie przypisuje reviewerów (to sygnał 3, osobny temat)
- nie integruje się z Teams na tym etapie

Ryzyko danych:
read-only / mock — start na wyeksportowanym CSV i atrapach PR-ów; realne API
dopiero gdy widok udowodni wartość.

Kierunek, jeśli się sprawdzi:
Internal tool → digest „async/remote work" (uruchamiany rano przed standupem).
```

## Why This Candidate

Sygnały 1 i 2 to dwie połówki tej samej potrzeby — „kto teraz nad czym pracuje?" — rozbitej między poziom zadań (Jira) i poziom kodu (Git). Osobno tylko powielałyby to, co Jira board i lista PR-ów już pokazują; wartość rodzi się dopiero ze **złączenia dwóch źródeł** w jeden ludzki widok, którego dziś nie ma nigdzie. Kandydat spełnia wszystkie kryteria: powtarza się codziennie, łączy dwa źródła, ma jasny ręczny ból i da się przetestować read-only na eksportach. Sygnał 3 odpada, bo to brak nawyku, nie brak narzędzia — tańszym ruchem jest włączenie Request review + CODEOWNERS + oficjalnej integracji z Teams.

## Next Direction If Valuable

Wybrana ścieżka: **najpierw walidacja** — `/10x-mom-test` → (jeśli problem przetrwa) `/10x-shape` → `/10x-prd` → `/10x-roadmap`.

Najtańszy pierwszy krok przed budową: krótka rozmowa z osobą, która dziś ręcznie składa te statusy (np. przed standupem) — czy obraz tarcia jest pełny i czy widok faktycznie by jej pomógł. Dopiero walidowana potrzeba wchodzi do `/10x-shape`.
