# Password Reset — Plan Brief

> Full plan: `context/changes/password-reset/plan.md`

## What & Why

Aplikacja nie ma żadnego mechanizmu odzyskiwania hasła — użytkownik który zapomni hasła nie może się zalogować. Dodajemy kompletny flow: "Zapomniałeś hasła?" → email recovery → nowe hasło → powrót na logowanie z potwierdzeniem.

## Starting Point

Istnieją strony auth (`signin`, `signup`, `confirm-email`) i API routes (`signin`, `signup`, `signout`) w spójnym wzorcu: Astro page + React form component + POST API route. Brak jakiejkolwiek obsługi recovery. Auth używa `@supabase/ssr` z PKCE flow.

## Desired End State

Użytkownik na stronie logowania widzi link "Zapomniałeś hasła?", może wpisać email, otrzymuje link recovery, klika go, wpisuje nowe hasło (min. 6 znaków, potwierdzone) i wraca na stronę logowania z zielonym komunikatem "Hasło zostało zmienione".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Dostęp do forgot-password | Link na sign-in poniżej pola hasła | Użytkownicy odkrywają opcję gdy jej potrzebują — standard UX | Plan |
| Po resecie | Redirect na signin z zielonym komunikatem | Spójne z istniejącym wzorcem przekazywania stanu przez query params | Plan |
| Walidacja hasła | Min. 6 znaków (jak przy rejestracji) | Spójność UX — ta sama reguła co w SignUpForm | Plan |
| Wygasły link | Redirect na forgot-password z błędem | Użytkownik od razu może poprosić o nowy link | Plan |
| redirectTo URL | Dynamicznie z `context.url.origin` | Działa lokalnie i na produkcji bez konfiguracji | Plan |
| User enumeration | Zawsze redirect na `?sent=true` | Nie ujawnia czy email istnieje w bazie | Plan |

## Scope

**In scope:**
- Strona `/auth/forgot-password` z formularzem email
- API route `POST /api/auth/forgot-password` (wysyła recovery email)
- GET `/api/auth/callback` (wymiana PKCE code na sesję)
- Strona `/auth/reset-password` z formularzem nowego hasła
- API route `POST /api/auth/reset-password` (aktualizuje hasło)
- Link "Zapomniałeś hasła?" w `SignInForm`
- Komunikat sukcesu na stronie logowania

**Out of scope:**
- OAuth providers
- Rate limiting
- Customizacja emaila w Supabase
- Zmiana hasła dla zalogowanego użytkownika (strona "Zmień hasło" w ustawieniach)

## Architecture / Approach

Dwie nowe strony Astro + dwa nowe API routes + dwa nowe komponenty React, zgodne z istniejącym wzorcem auth. Kluczowy niestandardowy element to callback PKCE: Supabase wysyła link recovery z `?code=xxx`, który musi być wymieniony przez server-side `exchangeCodeForSession()` zanim sesja będzie dostępna. GET `/api/auth/callback` obsługuje tę wymianę i jest generyczny — może być reużyty dla OAuth.

```
/auth/signin → "Zapomniałeś hasła?" link
    ↓
/auth/forgot-password → ForgotPasswordForm → POST /api/auth/forgot-password
    ↓ (email)
Supabase wysyła link → /api/auth/callback?code=xxx&next=/auth/reset-password
    ↓ (exchangeCodeForSession → cookies)
/auth/reset-password → ResetPasswordForm → POST /api/auth/reset-password
    ↓ (updateUser)
/auth/signin?success=password-reset → zielony komunikat
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. "Forgot password" flow | Formularz email + API route + link na sign-in | Brak — wszystkie nowe pliki, zero ryzyka regresji |
| 2. PKCE callback + "Reset password" | Callback handler + formularz nowego hasła + sukces na signin | Supabase Dashboard musi mieć skonfigurowany redirect URL allowlist |

**Prerequisites:** Supabase projekt skonfigurowany (istnieje). Po implementacji: dodaj `{origin}/api/auth/callback` do "Redirect URLs" w Supabase Dashboard → Authentication → URL Configuration.

**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- Supabase Dashboard wymaga manualnego dodania redirect URL do allowlist — bez tego linki nie działają na produkcji (lokalnie jest bardziej liberalny)
- `SUPABASE_KEY` to anon key (nie service role) — `updateUser` działa w kontekście zalogowanego użytkownika przez sesję PKCE, więc nie wymaga service role

## Success Criteria (Summary)

- Użytkownik może przejść cały flow end-to-end: forgot → email → link → nowe hasło → zalogowanie
- Stare hasło przestaje działać po resecie
- Wygasłe lub użyte linki pokazują zrozumiały komunikat błędu
