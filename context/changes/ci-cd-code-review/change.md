---
change_id: ci-cd-code-review
title: AI code review as a CI/CD gate (M5L3)
status: in-progress
created: 2026-06-17
updated: 2026-06-17
archived_at: null
---

## Notes

Rozwinięcie agenta code review z M5L2 w bramkę CI/CD na pull requestach.
Kryteria review dopasowane do stacku (Astro SSR / React 19 / Supabase / Cloudflare),
eval porównujący modele (promptfoo, haiku 4.5 vs sonnet 4.6) jako regression gate,
oraz pipeline na PR (composite action + workflow) z komentarzem i labelem jako side-effect.
