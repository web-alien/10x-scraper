# Codzienny digest z tabeli mailing_recipients — Plan Brief

> Full plan: `context/changes/digest-from-recipients-table/plan.md`

## What & Why

Codzienny mailing wysyła dziś do listy z pliku `subscribers.json`, a panel
`/dashboard/recipients` pisze do osobnej tabeli — dwa źródła prawdy, które się
rozjeżdżają (dług F4 z przeglądu `mailing-recipients`). Przełączamy wysyłkę na
czytanie odbiorców z tabeli `mailing_recipients` (status `active`), żeby panel stał
się jedynym miejscem zarządzania odbiorcami.

## Starting Point

`scripts/send.ts` w bloku startowym czyta `subscribers.json`, a `runDigest(...)`
przyjmuje listę adresów jako parametr (pokryty testami). Skrypt ma już typowanego
klienta `service_role`, więc może odpytać tabelę bez dodatkowej konfiguracji.

## Desired End State

Automat pobiera aktywnych odbiorców z tabeli: dodanie/usunięcie/wypisanie w panelu
od razu wpływa na to, kto dostaje mail. `subscribers.json` nie ma już wpływu na
wysyłkę. Brak aktywnych odbiorców → automat loguje i kończy się sukcesem bez wysyłki.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Źródło odbiorców | Tylko tabela (status=active) | Jedno źródło prawdy, domyka F4 | Plan |
| Pusta lista aktywnych | Pomiń wysyłkę, exit 0 | Zgodne z istniejącym wzorcem „brak artykułów" | Plan |
| Krok CI subscribers.json | Usuń z daily-digest.yml | Martwy po przełączeniu; sekret do retiringu ręcznie | Plan |
| Pliki subscribers.json/.example | Zostaw (legacy) | Łatwy odwrót, mniej zmian | Plan |
| runDigest | Bez zmian sygnatury | Zachowuje istniejące testy | Plan |

## Scope

**In scope:** helper czytający aktywnych z tabeli, podmiana źródła w bloku startowym
`send.ts`, obsługa zera aktywnych, test jednostkowy helpera, usunięcie kroku CI.

**Out of scope:** zmiana `runDigest`, usuwanie plików JSON i wpisu .gitignore,
fallback do JSON, panel/API odbiorców, usunięcie sekretu z poziomu kodu.

## Architecture / Approach

Wydzielony helper `fetchActiveRecipientEmails(supabase)` zwraca `string[]`; blok
startowy `send.ts` woła go zamiast `readFileSync`, a `runDigest` dostaje tę listę
bez zmian. Zero aktywnych → log + `exit 0`. Workflow traci krok tworzący plik.

## Phases at a Glance

| Faza | Dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Źródło w send.ts | Wysyłka czyta aktywnych z tabeli + test | Pomyłka w obsłudze pustej listy / błędu zapytania |
| 2. Sprzątanie CI | Usunięty martwy krok w daily-digest.yml | Zapomniany sekret SUBSCRIBERS_JSON (ręczne usunięcie) |

**Prerequisites:** tabela `mailing_recipients` istnieje (gotowe); `.env` z `SUPABASE_SERVICE_ROLE_KEY` do testu lokalnego.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Brak fallbacku: awaria bazy = brak wysyłki danego dnia (świadomy kompromis „tylko tabela").
- Sekret `SUBSCRIBERS_JSON` trzeba usunąć ręcznie w GitHub — poza zasięgiem kodu.
- Zmiana wchodzi po scaleniu `mailing-recipients` (tabela musi być na produkcji — jest).

## Success Criteria (Summary)

- Po wdrożeniu mail dostają wyłącznie aktywni odbiorcy z tabeli; zmiana w panelu działa na żywo.
- Pusta lista aktywnych nie wywraca builda (exit 0, brak wysyłki).
- Workflow nie odwołuje się już do `subscribers.json`.
