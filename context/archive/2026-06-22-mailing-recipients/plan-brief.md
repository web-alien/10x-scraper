# Strona CRUD odbiorców mailingu — Plan Brief

> Full plan: `context/changes/mailing-recipients/plan.md`

## What & Why

Panel ma dziś tylko podstronę Artykuły. Dodajemy drugą — **listę odbiorców
mailingu** z pełnym CRUD (dodawanie / edycja / usuwanie) — żeby zarządzać adresami,
do których trafiają maile, z poziomu UI zamiast pliku `subscribers.json`.

## Starting Point

Istnieje wzorzec strona Astro → serwis → wyspa React, ale tylko do **odczytu**
(`ArticlesTable` sortuje, nie edytuje). Nie ma w projekcie żadnego write-API ani
formularza CRUD — to pierwszy taki przypadek. Maile wysyła Resend (`scripts/send.ts`),
Supabase jest wyłącznie bazą.

## Desired End State

Zalogowany użytkownik: Panel → Odbiorcy → tabela (email / imię / status / data),
modal do dodawania i edycji, trwałe usuwanie z potwierdzeniem. Operacje idą przez
bazę z RLS dla roli `authenticated`. Niezalogowany jest przekierowany na signin.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres | Tylko zarządzanie listą | Bez dotykania logiki wysyłki — mniejsze ryzyko | Plan mode |
| Pola odbiorcy | email (unikalny) + imię + status + timestamps | Prosty, wystarczający model | Plan mode |
| Uprawnienia | Każdy zalogowany | Brak systemu ról w projekcie | Plan mode |
| Model zapisu | RLS write-policies dla `authenticated` | Aplikacja używa klucza anon; wzorzec artykułów (service_role) nie pasuje | Plan mode |
| Usuwanie | Hard delete | Zgodne z „usuwanie użytkowników" i RODO | Plan |
| Wyszukiwanie | Tylko sortowanie | MVP, spójne z ArticlesTable | Plan |

## Scope

**In scope:** tabela `mailing_recipients` + RLS, walidator zod, JSON API
(GET/POST/PUT/DELETE), wyspa React (tabela + formularz w modalu), strona Astro,
link w panelu, testy jednostkowe i E2E.

**Out of scope:** podłączenie do wysyłki digestu, system ról, miękkie usuwanie,
wyszukiwarka/paginacja, import CSV.

## Architecture / Approach

Powtarzamy wzorzec danych (strona Astro pobiera serwisem i renderuje wyspę
`client:load`), dokładając brakującą warstwę zapisu: JSON API wołane `fetch`-em
z wyspy (nie form-POST jak auth — bo komponent ma modale). Walidacja zod
współdzielona klient↔serwer. RLS egzekwuje uprawnienia w bazie.

## Phases at a Glance

| Faza | Dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Migracja + RLS + typy | Tabela z politykami `authenticated` | RLS — bez write-policies zapisy cicho padają |
| 2. Walidator + serwis | zod + funkcje CRUD | — |
| 3. API routes | GET/POST/PUT/DELETE (JSON) | Mapowanie duplikatu emaila na 409 |
| 4. Komponenty shadcn | input / label / dialog | — |
| 5. Wyspy React | Tabela + formularz | Spójność stanu po fetch |
| 6. Strona + nawigacja | `/dashboard/recipients` + link | Build SSR/Cloudflare |

**Prerequisites:** dostęp do projektu Supabase (`supabase link`) do regeneracji typów; lokalny Supabase (Docker) do testu migracji.
**Estimated effort:** ~1–2 sesje, 6 faz.

## Open Risks & Assumptions

- **RLS to najwyższe ryzyko** — weryfikować realnym zapisem z UI (klucz anon), nie przez Studio/service_role.
- **RODO** — lista emaili to dane osobowe; hard delete jest nieodwracalny.
- **Kolejność wdrożenia** — migracja przed deployem kodu, inaczej „relation does not exist".
- **Limity wysyłki (przyszłość, poza zakresem)** — wysyłka idzie przez Resend (Free: 100 maili/dzień, 3 000/mies., 5 req/s), nie przez Supabase.

## Success Criteria (Summary)

- Zalogowany może dodać, edytować i trwale usunąć odbiorcę przez UI, ze zmianą w bazie.
- Duplikat emaila daje czytelny komunikat (409), nie błąd 500.
- Niezalogowany jest przekierowany z `/dashboard/recipients` na signin.
