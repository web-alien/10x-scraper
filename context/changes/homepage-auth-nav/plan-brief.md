# Homepage Hero & Topbar Auth-Aware Navigation (Polish) — Plan Brief

> Full plan: `context/changes/homepage-auth-nav/plan.md`

## What & Why

After signing in, the homepage hero still shows "Zaloguj"/"Zarejestruj" because those buttons render unconditionally. We make the hero auth-aware (signed-in users see "Panel" + "Wyloguj") and polonize the topbar labels.

## Starting Point

`Welcome.astro` renders the hero CTA buttons with no `user` check (the bug). `Topbar.astro` already gates on `Astro.locals.user` but uses English labels ("Dashboard", "Sign out", "Not signed in"). The sign-out form (`POST /api/auth/signout`) already exists in the topbar.

## Desired End State

Signed-out homepage: unchanged (Zaloguj/Zarejestruj). Signed-in homepage: "Panel" (→ `/dashboard`) + "Wyloguj" (sign-out form), no login/register buttons. Topbar in Polish in both states.

## Key Decisions Made

| Decision                  | Choice                          | Why (1 sentence)                                      |
| ------------------------- | ------------------------------- | ---------------------------------------------------- |
| Label for dashboard       | "Panel" (not "Dashboard")       | User chose full polonization.                        |
| Signed-in hero buttons    | "Panel" + "Wyloguj"             | User wants logout reachable from the hero too.       |
| Sign-out implementation   | Reuse topbar's `POST` form      | Pattern already exists; no new endpoint needed.      |
| Scope of polonization     | Only topbar nav strings         | Feature-card copy left as-is — out of scope.         |

## Scope

**In scope:** conditional hero CTAs in `Welcome.astro`; three label swaps in `Topbar.astro`.

**Out of scope:** API/middleware/auth-flow changes, feature-card copy, new components/helpers.

## Architecture / Approach

Add `const { user } = Astro.locals;` to `Welcome.astro` frontmatter and wrap the hero CTA block in `{ user ? (...) : (...) }`, reusing existing button styles and the topbar sign-out form. Swap three strings in `Topbar.astro`. Pure presentational edits over existing auth state.

## Phases at a Glance

| Phase                          | What it delivers                          | Key risk                              |
| ------------------------------ | ----------------------------------------- | ------------------------------------- |
| 1. Auth-aware homepage hero    | Hero reflects auth state (Panel/Wyloguj)  | Mismatched button styling vs existing |
| 2. Polonize topbar labels      | Topbar fully in Polish                    | None material — string swaps          |

**Prerequisites:** none — `Astro.locals.user` already populated by middleware.
**Estimated effort:** ~1 session, 2 small phases.

## Open Risks & Assumptions

- Assumes "Panel" is the agreed Polish term for the dashboard link (confirmed by user).
- No automated UI tests cover this; verification is `npm run lint` + manual.

## Success Criteria (Summary)

- Signed-in homepage no longer shows login/register buttons.
- Signed-in users can reach the dashboard and sign out from the hero.
- Topbar reads "Panel"/"Wyloguj"/"Niezalogowany" depending on auth state.
