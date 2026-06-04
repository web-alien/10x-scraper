---
change_id: test-plan-refresh-2026-06-04
title: Refresh test-plan auth exclusion scope after password-reset customisation
status: implementing
created: 2026-06-04
updated: 2026-06-04
archived_at: null
---

## Notes

Zaktualizuj §7 auth exclusion i opcjonalnie §2 risk map w context/foundation/test-plan.md. Zmiany od 2026-06-01: dodano password-reset flow (middleware redirect guard + PKCE exchangeCodeForSession mają własną logikę — nie są pure pass-through do Supabase). §7 mówi 're-evaluate if auth customised' — warunek spełniony. Zakres: (1) zaktualizuj §7 żeby jawnie wyłączyć form UI i Supabase API calls ale carve-out middleware guard + callback; (2) rozważ dodanie Risk #7 (auth session guard failure) do §2; (3) fazy rollout §3 bez zmian. Nie edytuj test-plan.md bezpośrednio — zrób to przez plan.md tej zmiany.
