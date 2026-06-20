# Homepage Hero & Topbar Auth-Aware Navigation (Polish) Implementation Plan

## Overview

After signing in, the homepage hero still shows "Zaloguj"/"Zarejestruj" buttons because they render unconditionally. This plan makes the hero auth-aware (show "Panel" + "Wyloguj" for signed-in users) and polonizes the topbar labels ("Panel", "Wyloguj", "Niezalogowany").

## Current State Analysis

- [src/components/Welcome.astro](../../../src/components/Welcome.astro) renders the homepage hero. The CTA buttons at lines 41-54 ("Zaloguj" → `/auth/signin`, "Zarejestruj" → `/auth/signup`) are rendered **unconditionally** — there is no `user` check in the frontmatter (lines 1-3). This is the reported bug.
- [src/components/Topbar.astro](../../../src/components/Topbar.astro) already gates on `Astro.locals.user`. Signed-in: shows `user.email`, "Dashboard" link (`/dashboard`), and a "Sign out" form (`POST /api/auth/signout`). Signed-out: "Not signed in" + "Zaloguj"/"Zarejestruj". Labels are English and need polonizing.
- The sign-out mechanism already exists: `<form method="POST" action="/api/auth/signout">` with a submit button (Topbar.astro lines 16-20). The hero will reuse this exact pattern.
- `Astro.locals.user` is populated by [src/middleware.ts](../../../src/middleware.ts) on every request — no new wiring needed.

## Desired End State

- **Homepage hero, signed-out:** unchanged — "Zaloguj" (purple) + "Zarejestruj" (outline).
- **Homepage hero, signed-in:** "Panel" (link to `/dashboard`, purple `bg-purple-600` style) + "Wyloguj" (outline `border-white/20` style, submits `POST /api/auth/signout`).
- **Topbar, signed-in:** "Panel" link + "Wyloguj" button (email span unchanged).
- **Topbar, signed-out:** "Niezalogowany" + "Zaloguj"/"Zarejestruj" (the two auth links unchanged).

Verify by visiting `/` signed-out (two register/login buttons) and signed-in (Panel + Wyloguj, no register/login buttons; email visible in topbar).

### Key Discoveries:

- Sign-out form pattern to mirror: [src/components/Topbar.astro:16-20](../../../src/components/Topbar.astro#L16-L20).
- Hero button styling to mirror: purple CTA at [src/components/Welcome.astro:42-47](../../../src/components/Welcome.astro#L42-L47), outline CTA at [src/components/Welcome.astro:48-53](../../../src/components/Welcome.astro#L48-L53).
- `const { user } = Astro.locals;` is the established frontmatter pattern ([src/components/Topbar.astro:2](../../../src/components/Topbar.astro#L2)).

## What We're NOT Doing

- No changes to API routes, middleware, auth flow, or routing.
- No changes to feature cards or global styles in Welcome.astro.
- No new components or extracted helpers — edits stay inline in the two existing files.
- Not touching the still-English feature-card copy ("Authentication Ready", etc.) — out of scope for this change.

## Implementation Approach

Add a `user` check in Welcome.astro's frontmatter and wrap the hero CTA block in a `user ? (...) : (...)` conditional, reusing the existing button styles and the Topbar sign-out form pattern. Then swap three label strings in Topbar.astro. Pure presentational edits gated on existing `Astro.locals.user`.

---

## Phase 1: Auth-aware homepage hero

### Overview

Make the hero CTA buttons reflect auth state so signed-in users see "Panel" + "Wyloguj" instead of login/register.

### Changes Required:

#### 1. Homepage hero CTA

**File**: `src/components/Welcome.astro`

**Intent**: Read the current user in the frontmatter and conditionally render the hero CTA block — signed-in users get a "Panel" link and a "Wyloguj" sign-out form; signed-out users keep the existing "Zaloguj"/"Zarejestruj" buttons.

**Contract**: Add `const { user } = Astro.locals;` to the frontmatter (lines 1-3). Wrap the CTA `<div class="flex flex-col gap-4 sm:flex-row">` block (lines 41-54) in `{ user ? (...) : (...) }`. Signed-in branch: "Panel" anchor → `/dashboard` reusing the purple button classes (`bg-purple-600 ... hover:bg-purple-500`), plus "Wyloguj" as `<form method="POST" action="/api/auth/signout">` wrapping a `<button type="submit">` styled with the outline classes (`border border-white/20 ... hover:bg-white/10`). Signed-out branch: existing two anchors unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-out `/` shows "Zaloguj" + "Zarejestruj" (unchanged).
- Signed-in `/` shows "Panel" + "Wyloguj"; the login/register buttons are gone.
- "Panel" navigates to `/dashboard`; "Wyloguj" logs the user out and lands them signed-out.

**Implementation Note**: After completing this phase and `npm run lint` passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Polonize Dashboard/Sign out labels (topbar + dashboard pages)

### Overview

Translate the English nav/auth labels to Polish across every place they appear — the topbar and the dashboard pages — keeping structure and links unchanged.

### Changes Required:

#### 1. Topbar labels

**File**: `src/components/Topbar.astro`

**Intent**: Replace English UI labels with Polish ones, matching the wording chosen for the hero.

**Contract**: "Dashboard" → "Panel" (line 14); "Sign out" → "Wyloguj" (line 18); "Not signed in" → "Niezalogowany" (line 25). No structural or link changes.

#### 2. Dashboard page labels

**File**: `src/pages/dashboard.astro`

**Intent**: Polonize the dashboard page's title, heading, and sign-out button.

**Contract**: `<Layout title="Dashboard">` → `title="Panel"` (line 7); heading "Dashboard" → "Panel" (line 11); sign-out button "Sign out" → "Wyloguj" (line 28).

#### 3. Articles page back-link & title

**File**: `src/pages/dashboard/articles.astro`

**Intent**: Polonize the page title and the back-to-dashboard link to match "Panel".

**Contract**: `<Layout title="Artykuły — Dashboard">` → `title="Artykuły — Panel"` (line 29); back link "← Dashboard" → "← Panel" (line 37).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-in topbar reads "Panel" and "Wyloguj"; email still visible.
- Signed-out topbar reads "Niezalogowany"; "Zaloguj"/"Zarejestruj" links still work.
- `/dashboard` shows heading "Panel" and a "Wyloguj" button; browser tab title is "Panel".
- `/dashboard/articles` back link reads "← Panel" and returns to the dashboard.

**Implementation Note**: After completing this phase and `npm run lint` passes, pause for manual confirmation.

---

## Phase 3: Polonize dashboard copy & auth form strings

### Overview

Polonize the remaining user-facing English so the UI is consistently Polish: the dashboard's welcome/help copy and all visible strings in the auth form components (labels, placeholders, validation messages, aria-labels, submit/pending text). Code identifiers (`id`, `name`, `type`, state variables, `form.get("password")`) stay untouched.

### Changes Required:

#### 1. Dashboard copy

**File**: `src/pages/dashboard.astro`

**Intent**: Polonize the welcome line and the authenticated-only helper text.

**Contract**: "Welcome, " → "Witaj, " (line 14); "This page is only for authenticated users." → "Ta strona jest dostępna tylko dla zalogowanych użytkowników." (line 16).

#### 2. Password visibility toggle

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Polonize the accessibility label on the show/hide toggle.

**Contract**: `aria-label` "Hide password"/"Show password" → "Ukryj hasło"/"Pokaż hasło".

#### 3. Sign-in form

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Polonize labels, placeholder, validation messages, and pending text.

**Contract**: "Email is required" → "Email jest wymagany"; "Enter a valid email address" → "Podaj poprawny adres email"; "Password is required" → "Hasło jest wymagane"; label "Password" → "Hasło"; placeholder "Your password" → "Twoje hasło"; pendingText "Signing in..." → "Logowanie...". (Email label, "Zaloguj", "Zapomniałeś hasła?" already Polish.)

#### 4. Sign-up form

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Polonize labels, placeholders, validation messages, password hint, and button/pending text.

**Contract**: email/password validation messages as in §3; `Password must be at least N characters` → `Hasło musi mieć co najmniej N znaków`; "Please confirm your password" → "Potwierdź hasło"; "Passwords do not match" → "Hasła nie są zgodne"; password hint `N more character(s) needed` → `Brakuje jeszcze N znaku/znaków` (Polish plural: `znaku` for 1, else `znaków`); label "Password" → "Hasło"; placeholder "Min. 6 characters" → "Min. 6 znaków"; label "Confirm password" → "Potwierdź hasło"; placeholder "Re-enter your password" → "Powtórz hasło"; pendingText "Creating account..." → "Tworzenie konta..."; button "Create account" → "Utwórz konto".

#### 5. Forgot-password & reset-password forms

**File**: `src/components/auth/ForgotPasswordForm.tsx`, `src/components/auth/ResetPasswordForm.tsx`

**Intent**: Polonize the remaining English validation messages (visible labels/placeholders/buttons already Polish).

**Contract**: ForgotPassword: "Email is required" → "Email jest wymagany"; "Enter a valid email address" → "Podaj poprawny adres email". ResetPassword: "Password is required" → "Hasło jest wymagane"; `Password must be at least N characters` → `Hasło musi mieć co najmniej N znaków`; "Please confirm your password" → "Potwierdź hasło"; "Passwords do not match" → "Hasła nie są zgodne"; password hint Polonized as in §4.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`

#### Manual Verification:

- `/dashboard` welcome/help copy reads in Polish.
- Sign-in & sign-up forms: labels, placeholders, validation errors, and buttons all Polish; show/hide toggle has Polish aria-label.
- Forgot/reset password validation messages are Polish; password hint pluralizes correctly (1 vs many).

---

## Testing Strategy

### Manual Testing Steps:

1. Logged out, open `/` — hero shows Zaloguj/Zarejestruj; topbar shows "Niezalogowany".
2. Sign in, open `/` — hero shows Panel/Wyloguj (no login/register); topbar shows email + Panel/Wyloguj.
3. Click "Panel" in hero and topbar — both go to `/dashboard`.
4. Click "Wyloguj" in hero and topbar — both sign out and return to signed-out state.

## References

- Change identity: `context/changes/homepage-auth-nav/change.md`
- Sign-out pattern: `src/components/Topbar.astro:16-20`
- Hero button styles: `src/components/Welcome.astro:42-53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth-aware homepage hero

#### Automated

- [x] 1.1 Linting passes: `npm run lint`

#### Manual

- [x] 1.2 Signed-out `/` shows "Zaloguj" + "Zarejestruj"
- [x] 1.3 Signed-in `/` shows "Panel" + "Wyloguj"; login/register buttons gone
- [x] 1.4 "Panel" navigates to `/dashboard`; "Wyloguj" logs out

### Phase 2: Polonize Dashboard/Sign out labels (topbar + dashboard pages)

#### Automated

- [x] 2.1 Linting passes: `npm run lint`

#### Manual

- [x] 2.2 Signed-in topbar reads "Panel" and "Wyloguj"; email visible
- [x] 2.3 Signed-out topbar reads "Niezalogowany"; auth links work
- [x] 2.4 `/dashboard` shows heading "Panel" + "Wyloguj" button; tab title "Panel"
- [x] 2.5 `/dashboard/articles` back link reads "← Panel" and returns to dashboard

### Phase 3: Polonize dashboard copy & auth form strings

#### Automated

- [x] 3.1 Linting passes: `npm run lint`

#### Manual

- [x] 3.2 `/dashboard` welcome/help copy reads in Polish
- [x] 3.3 Sign-in & sign-up forms fully Polish (labels, placeholders, errors, buttons, toggle aria-label)
- [x] 3.4 Forgot/reset validation messages Polish; password hint pluralizes correctly
