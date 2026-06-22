# Baner o ograniczeniu darmowego Resend — Plan Brief

> Full plan: `context/changes/recipients-resend-notice/plan.md`

## What & Why

Strona `/dashboard/recipients` pozwala dodać wielu odbiorców, ale darmowy Resend
(nadawca `onboarding@resend.dev`) dostarcza maile tylko na jeden adres. Dodajemy stały
baner ostrzegawczy, by użytkownik znał to ograniczenie.

## Starting Point

Strona ma już warunkowy baner błędu oparty na komponencie `Banner` (wariant `warning`
istnieje, import jest). Brak nowego kodu — tylko użycie istniejącego komponentu.

## Desired End State

Nad tabelą odbiorców zawsze widoczny żółty baner: „Ze względu na ograniczenia darmowej
wersji resend.com, nie ma teraz możliwości wysyłki mailingów na więcej niż 1 zdefiniowany
adres."

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Komponent | Istniejący `Banner` (`warning`) | Zero nowego kodu, spójność |
| Widoczność | Stały, niezależny od błędu | To trwała informacja, nie błąd |
| Zakres | Tylko komunikat (bez blokady) | Informacja wystarcza; twarda blokada to osobny temat |
| Proces 10x | Szybka ścieżka (bez review) | Zmiana jednoliniowa |

## Scope

**In scope:** jeden `<Banner variant="warning">` na recipients.astro.

**Out of scope:** blokada dodawania >1 odbiorcy, logika wysyłki, konfiguracja Resend.

## Architecture / Approach

Statyczny baner po nagłówku, nad kartą z tabelą; reużycie `Banner.astro`.

## Phases at a Glance

| Faza | Dostarcza | Ryzyko |
| --- | --- | --- |
| 1. Baner ostrzegawczy | Komunikat na stronie odbiorców | Brak istotnego |

**Prerequisites:** brak (komponent i strona istnieją).
**Estimated effort:** ~kilka minut, 1 faza.

## Open Risks & Assumptions

- Komunikat informacyjny — nie zapobiega technicznie dodaniu odbiorców, którzy nie dostaną maila.

## Success Criteria (Summary)

- Build + lint przechodzą.
- Żółty baner z komunikatem widoczny nad tabelą odbiorców (lokalnie i po wdrożeniu).
