# Password Reset Implementation Plan

## Overview

Dodaj kompletny flow resetu hasła: link "Zapomniałeś hasła?" na stronie logowania → email recovery → wymiana tokenu PKCE → formularz nowego hasła → powrót na logowanie z komunikatem sukcesu.

## Current State Analysis

Aplikacja ma strony `signin`, `signup`, `confirm-email` i odpowiadające API routes. Brak jakiegokolwiek flow resetu hasła. Auth używa `@supabase/ssr` z `createServerClient` — co oznacza PKCE flow. Linki recovery od Supabase przychodzą z `?code=xxx` w query params (nie hash fragment). Helper `createClient` w `src/lib/supabase.ts` tworzy server-side client.

### Key Discoveries:

- Pattern auth: Astro page + React form component (`client:load`) + API route (POST) — stosuj dla obu nowych stron
- PKCE flow: Supabase wysyła `?code=xxx`, wymaga `exchangeCodeForSession(code)` zanim sesja istnieje — potrzebny dedykowany GET callback handler
- Błędy: przekazywane przez query params (`?error=message`) — ta sama konwencja dla spójności
- Min. długość hasła: `MIN_PASSWORD_LENGTH = 6` w `src/components/auth/SignUpForm.tsx:8` — reużyj tej samej stałej
- `ServerError` i `FormField` komponenty w `src/components/auth/` — reużyj w nowych formularzach

## Desired End State

Użytkownicy mogą:
1. Kliknąć "Zapomniałeś hasła?" na stronie logowania (poniżej pola hasła)
2. Wpisać email i otrzymać link recovery na skrzynkę
3. Kliknąć link w emailu i trafić na formularz nowego hasła
4. Ustawić nowe hasło (min. 6 znaków, potwierdzone) i zostać przekierowanym na logowanie z zielonym komunikatem sukcesu

## What We're NOT Doing

- Dostawcy OAuth (Google, GitHub)
- Zmiana hasła przez admina dla innego użytkownika
- Rate limiting na endpoincie forgot-password
- Customizacja szablonu emaila recovery (Supabase Dashboard)
- Supabase redirect URL allowlist — użytkownik konfiguruje to ręcznie w Supabase Dashboard

## Implementation Approach

Dwie fazy zgodne z istniejącymi wzorcami auth. Jedyna nieoczywista część to callback PKCE w Fazie 2: link recovery od Supabase trafia na `/api/auth/callback?code=xxx&next=/auth/reset-password`, gdzie kod jest wymieniany na sesję zapisaną w cookies. Strona reset-password znajduje użytkownika przez `context.locals.user` ustawiony przez middleware.

## Critical Implementation Details

**PKCE code flow:** `resetPasswordForEmail` musi ustawiać `redirectTo` na `${context.url.origin}/api/auth/callback?next=/auth/reset-password`. Endpoint callback wywołuje `supabase.auth.exchangeCodeForSession(code)` — to ustawia sesję w cookies. Bez tego kroku `/auth/reset-password` nie ma sesji i natychmiast przekierowuje.

**Session guard na reset-password:** Po callbacku sesja jest w cookies i `context.locals.user` jest ustawiony przez middleware. Jeśli użytkownik trafi na `/auth/reset-password` bez ważnej sesji (link wygasł, już użyty, bezpośrednia nawigacja), strona przekierowuje na `/auth/forgot-password?error=link-expired`.

**User enumeration:** API route forgot-password zawsze przekierowuje na `?sent=true` niezależnie od tego czy email istnieje w bazie — zapobiega wyliczaniu kont użytkowników.

---

## Phase 1: "Forgot password" flow

### Overview

Nowa strona forgot-password + API route oraz link "Zapomniałeś hasła?" w istniejącym formularzu logowania.

### Changes Required:

#### 1. ForgotPasswordForm component

**File**: `src/components/auth/ForgotPasswordForm.tsx`

**Intent**: Formularz React z jednym polem email, POST-submitujący do `/api/auth/forgot-password`. Wzorzec identyczny jak `SignInForm.tsx`.

**Contract**: Przyjmuje `serverError?: string | null` prop. Waliduje email przy submit (ten sam regex co w SignInForm). Renderuje `FormField` z ikoną `Mail`, `ServerError` i `SubmitButton` z `pendingText="Wysyłanie..."` i ikoną `Send` z lucide-react.

#### 2. Forgot password page

**File**: `src/pages/auth/forgot-password.astro`

**Intent**: Renderuje `ForgotPasswordForm` w trybie normalnym; pokazuje komunikat potwierdzenia gdy `?sent=true` (analogicznie do `confirm-email.astro`). Czyta `?error` i przekazuje do formularza.

**Contract**: Dwa tryby renderowania kontrolowane przez query param `sent`. Gdy `sent=true`: statyczna karta z nagłówkiem "Sprawdź swoją skrzynkę", opisem "Jeśli konto istnieje, wysłaliśmy link recovery na podany adres email." i linkiem powrotu do logowania. Gdy `sent` nie ma: renderuje `<ForgotPasswordForm serverError={error} client:load />`. Wrapper div identyczny z `signin.astro`.

#### 3. Forgot password API route

**File**: `src/pages/api/auth/forgot-password.ts`

**Intent**: Odbiera email, wywołuje API Supabase recovery, przekierowuje na stan potwierdzenia. Używa dynamicznego origin żeby działało lokalnie i na produkcji.

**Contract**: `POST` handler. Czyta `email` z form data. Wywołuje `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${context.url.origin}/api/auth/callback?next=/auth/reset-password\` })`. Na sukces i na błąd Supabase (w tym nieistniejący email): redirect do `/auth/forgot-password?sent=true` — zapobiega user enumeration. Wyjątek: gdy Supabase nie jest skonfigurowany (`!supabase`) redirect do `/auth/forgot-password?error=<encoded message>`.

#### 4. Add "Zapomniałeś hasła?" link to SignInForm

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Dodaj mały link pod polem hasła prowadzący do `/auth/forgot-password`.

**Contract**: Przekaż `hint={<a href="/auth/forgot-password" className="text-xs text-purple-300 hover:underline">Zapomniałeś hasła?</a>}` jako prop `hint` do `FormField` pola password (poniżej inputu, w miejscu gdzie pojawia się hint o długości hasła). Link renderuje się tylko gdy nie ma błędu walidacji hasła — właściwość `hint` w `FormField` jest wyświetlana tylko gdy `error` jest undefined.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` kompiluje się pomyślnie (TypeScript clean)

#### Manual Verification:

- Link "Zapomniałeś hasła?" widoczny na `/auth/signin` poniżej pola hasła
- `/auth/forgot-password` renderuje formularz email
- Podanie nieprawidłowego emaila pokazuje błąd walidacji bez wysyłania requestu
- Podanie prawidłowego emaila pokazuje stan "Sprawdź swoją skrzynkę"
- W Supabase Logs widać próbę wysłania recovery emaila

**Implementation Note**: Po ukończeniu tej fazy i przejściu automated verification, zatrzymaj się na manualną weryfikację przed przejściem do Fazy 2.

---

## Phase 2: PKCE callback + "Reset password" flow

### Overview

Handler callbacku wymienia kod recovery na sesję. Strona i API route reset-password umożliwiają ustawienie nowego hasła. Strona logowania zyskuje komunikat sukcesu.

### Changes Required:

#### 1. PKCE callback API route

**File**: `src/pages/api/auth/callback.ts`

**Intent**: Generyczny GET handler wymieniający kod Supabase na sesję. Przekierowuje na `next` przy sukcesie, na `/auth/forgot-password?error=link-expired` przy błędzie.

**Contract**: `GET` handler. Czyta `code` i `next` z query params. Jeśli `code` istnieje: wywołuje `supabase.auth.exchangeCodeForSession(code)`. Przy błędzie lub braku kodu: redirect do `/auth/forgot-password?error=${encodeURIComponent("Link jest nieprawidłowy lub wygasł")}`. Przy sukcesie: redirect do `next ?? "/"`.

#### 2. ResetPasswordForm component

**File**: `src/components/auth/ResetPasswordForm.tsx`

**Intent**: Formularz React z polami nowe hasło i potwierdzenie hasła. Ten sam wzorzec walidacji co `SignUpForm.tsx` — `MIN_PASSWORD_LENGTH = 6`, confirm musi pasować. Submit do `/api/auth/reset-password`.

**Contract**: Przyjmuje `serverError?: string | null` prop. Waliduje: hasło ≥ 6 znaków, potwierdzenie musi pasować. Używa `FormField` z ikoną `Lock` i `PasswordToggle` dla obu pól, `ServerError`, `SubmitButton` z `pendingText="Zapisywanie..."` i ikoną `KeyRound` z lucide-react.

#### 3. Reset password page

**File**: `src/pages/auth/reset-password.astro`

**Intent**: Strona chroniona sesją, pokazuje formularz nowego hasła. Przekierowuje gdy brak ważnej sesji.

**Contract**: Czyta `Astro.locals.user`. Jeśli `null`: redirect do `/auth/forgot-password?error=${encodeURIComponent("Link jest nieprawidłowy lub wygasł")}`. Jeśli user istnieje: renderuje `<ResetPasswordForm serverError={error} client:load />`. Czyta `error` z query params. Wrapper div identyczny z `signin.astro`.

#### 4. Reset password API route

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Odbiera nowe hasło, wywołuje Supabase `updateUser`, przekierowuje na logowanie z sukcesem.

**Contract**: `POST` handler. Czyta `password` z form data. Wywołuje `supabase.auth.updateUser({ password })`. Przy sukcesie: redirect do `/auth/signin?success=password-reset`. Przy błędzie Supabase: redirect do `/auth/reset-password?error=<encoded message>`. Gdy brak sesji (supabase null): redirect do `/auth/forgot-password?error=<encoded message>`.

#### 5. Sign-in page — success message

**File**: `src/pages/auth/signin.astro`

**Intent**: Czyta `?success` query param i przekazuje do `SignInForm` żeby wyświetlić zielone potwierdzenie.

**Contract**: Dodaj `const success = Astro.url.searchParams.get("success");` obok istniejącego `error`. Przekaż `serverSuccess={success}` jako prop do `<SignInForm>`.

#### 6. SignInForm — success state

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Wyświetl zielony komunikat sukcesu gdy prop `serverSuccess` jest ustawiony.

**Contract**: Dodaj `serverSuccess?: string | null` do interfejsu `Props`. Gdy truthy, renderuj zielony komunikat nad przyciskiem submit. Dla wartości `password-reset`: "Hasło zostało zmienione. Możesz się zalogować." Styl analogiczny do `ServerError` ale z kolorem zielonym (`text-green-300`, ikona `CheckCircle` z lucide-react).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi bez błędów
- `npm run build` kompiluje się pomyślnie (TypeScript clean)

#### Manual Verification:

- Kliknięcie linku recovery z emaila wymienia kod i przekierowuje na `/auth/reset-password`
- `/auth/reset-password` bez ważnej sesji przekierowuje na `/auth/forgot-password?error=...`
- Formularz resetu waliduje: za krótkie hasło → błąd, niezgodne potwierdzenie → błąd
- Udany reset przekierowuje na `/auth/signin` z zielonym komunikatem "Hasło zostało zmienione"
- Stare hasło nie działa po resecie
- Nowe hasło loguje poprawnie
- Użyty lub wygasły link pokazuje błąd na `/auth/forgot-password`

**Implementation Note**: Po ukończeniu tej fazy zatrzymaj się na kompletną manualną weryfikację całego flow end-to-end.

---

## Testing Strategy

### Manual Testing Steps:

1. Wejdź na `/auth/signin` — link "Zapomniałeś hasła?" widoczny poniżej pola hasła
2. Kliknij link → `/auth/forgot-password` z formularzem email
3. Wpisz nieprawidłowy email → błąd walidacji, brak requestu do serwera
4. Wpisz prawidłowy email → strona "Sprawdź swoją skrzynkę"
5. Kliknij link recovery z emaila → trafisz na `/auth/reset-password`
6. Spróbuj hasła < 6 znaków → błąd walidacji
7. Spróbuj niezgodnego potwierdzenia → błąd walidacji
8. Podaj prawidłowe hasła → redirect na `/auth/signin` z zielonym komunikatem
9. Zaloguj starym hasłem → błąd logowania
10. Zaloguj nowym hasłem → sukces
11. Kliknij ponownie ten sam link recovery → błąd "Link wygasł"

## References

- `src/lib/supabase.ts` — `createClient` server helper
- `src/components/auth/SignUpForm.tsx` — wzorzec walidacji hasła do reużycia
- `src/components/auth/SignInForm.tsx` — wzorzec formularza do naśladowania
- `src/pages/auth/confirm-email.astro` — wzorzec statycznej karty potwierdzenia

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: "Forgot password" flow

#### Automated

- [x] 1.1 `npm run lint` przechodzi bez błędów — dc171e5
- [x] 1.2 `npm run build` kompiluje się pomyślnie — dc171e5

#### Manual

- [x] 1.3 Link "Zapomniałeś hasła?" widoczny na sign-in poniżej pola hasła — dc171e5
- [x] 1.4 /auth/forgot-password renderuje formularz email — dc171e5
- [x] 1.5 Nieprawidłowy email pokazuje błąd walidacji — dc171e5
- [x] 1.6 Prawidłowy email pokazuje stan "Sprawdź swoją skrzynkę" — dc171e5

### Phase 2: PKCE callback + "Reset password" flow

#### Automated

- [x] 2.1 `npm run lint` przechodzi bez błędów — 7d74079
- [x] 2.2 `npm run build` kompiluje się pomyślnie — 7d74079

#### Manual

- [x] 2.3 Link recovery z emaila przekierowuje na /auth/reset-password — 7d74079
- [x] 2.4 /auth/reset-password bez sesji przekierowuje na /auth/forgot-password — 7d74079
- [x] 2.5 Formularz resetu waliduje długość hasła i zgodność potwierdzenia — 7d74079
- [x] 2.6 Udany reset pokazuje zielony komunikat na /auth/signin — 7d74079
- [x] 2.7 Stare hasło nie działa, nowe hasło loguje poprawnie — 7d74079
- [x] 2.8 Użyty/wygasły link pokazuje błąd na /auth/forgot-password — 7d74079
