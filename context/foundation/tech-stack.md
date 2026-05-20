---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-scraper
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

10x-scraper to aplikacja webowa z TypeScript end-to-end, budowana solo w 3 tygodnie po godzinach. Starter `10x-astro-starter` (Astro 6 + React + TypeScript + Supabase + Cloudflare) dopasowuje się do tej skali z trzech powodów: po pierwsze, Supabase dostarcza od razu bazę PostgreSQL do przechowywania stanu deduplication i listy subskrybentów — bez osobnego setupu ORM; po drugie, TypeScript z Zod na granicach i konwencje Astro minimalizują tarcie przy pracy z agentem AI; po trzecie, Cloudflare Pages jako target deployment to najprostsza droga do pierwszego deployu z tym starterem. MVP jest skryptowy (brak UI w v2), ale infrastruktura Supabase + Cloudflare obsłuży panel admina gdy dojdzie do v2 — nie będzie potrzeby migracji stacku.
