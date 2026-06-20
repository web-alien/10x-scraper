---
change_id: homepage-auth-nav
title: Homepage hero and topbar reflect auth state, in Polish
status: implemented
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

Po zalogowaniu strona główna (hero w Welcome.astro) nadal pokazuje przyciski Zaloguj/Zarejestruj — mają być warunkowe: dla zalogowanych "Panel" (link do /dashboard) + "Wyloguj" (form POST /api/auth/signout), dla niezalogowanych bez zmian. Dodatkowo polonizacja górnej belki (Topbar.astro): "Dashboard" → "Panel", "Sign out" → "Wyloguj", "Not signed in" → "Niezalogowany".
