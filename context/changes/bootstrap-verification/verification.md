---
bootstrapped_at: 2026-05-18T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-scraper
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

10x-scraper to aplikacja webowa z TypeScript end-to-end, budowana solo w 3 tygodnie po godzinach. Starter `10x-astro-starter` (Astro 6 + React + TypeScript + Supabase + Cloudflare) dopasowuje się do tej skali z trzech powodów: po pierwsze, Supabase dostarcza od razu bazę PostgreSQL do przechowywania stanu deduplication i listy subskrybentów — bez osobnego setupu ORM; po drugie, TypeScript z Zod na granicach i konwencje Astro minimalizują tarcie przy pracy z agentem AI; po trzecie, Cloudflare Pages jako target deployment to najprostsza droga do pierwszego deployu z tym starterem. MVP jest skryptowy (brak UI w v2), ale infrastruktura Supabase + Cloudflare obsłuży panel admina gdy dojdzie do v2 — nie będzie potrzeby migracji stacku.

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes                                           |
| ----------- | ------------------------------------------------------------ | -------- | ----------------------------------------------- |
| npm package | not run — cmd_template uses git clone, not create-* CLI     | n/a      | starter is git-cloned, no npm package to check  |
| GitHub repo | not run — gh CLI unavailable in this environment            | n/a      | WARN-AND-CONTINUE; repo freshness unverified    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 (excluding node_modules — moved via fresh npm install due to Windows file-lock on node_modules directory)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (cwd CLAUDE.md preserved; scaffold copy sidecared)
**.gitignore handling**: moved silently (absent in cwd before scaffold)
**.bootstrap-scaffold cleanup**: deleted

**Note (Windows)**: `node_modules/` could not be moved due to Windows file-lock; workaround — ran `npm install` fresh in cwd after moving `package.json` and `package-lock.json`. Result identical to a direct move.

## Post-scaffold audit

**Tool**: `npm audit`
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished by npm audit at this detail level

#### HIGH findings

- **devalue** (5.6.3 – 5.8.0) — GHSA-77vg-94rm-hx3p — DoS via sparse array deserialization
  Fix: `npm audit fix` (non-breaking)

#### MODERATE findings

- **ws** (8.0.0 – 8.20.0) — GHSA-58qx-3vcg-4xpx — Uninitialized memory disclosure
  Via: `@supabase/realtime-js`, `wrangler`, `@cloudflare/vite-plugin`, `@astrojs/cloudflare`
  Fix: `npm audit fix --force` (breaking — would downgrade `@astrojs/cloudflare`)
- **yaml** (2.0.0 – 2.8.2) — GHSA-48c2-rrv3-qjmp — Stack Overflow via deeply nested YAML
  Via: `yaml-language-server`
  Fix: `npm audit fix --force` (breaking)
- Additional moderate: `miniflare`, `wrangler`, `@cloudflare/vite-plugin`, `@astrojs/cloudflare` (all ws-dependent chain)

**Recommendation**: Run `npm audit fix` to address the HIGH finding (devalue). The MODERATE findings are in dev/toolchain dependencies (wrangler, cloudflare vite plugin) — review risk tolerance before running `--force`.

## Hints recorded but not acted on

| Hint                    | Value          |
| ----------------------- | -------------- |
| bootstrapper_confidence | first-class    |
| quality_override        | false          |
| path_taken              | standard       |
| self_check_answers      | null           |
| team_size               | solo           |
| deployment_target       | cloudflare-pages |
| ci_provider             | github-actions |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | false          |
| has_payments            | false          |
| has_realtime            | false          |
| has_ai                  | false          |
| has_background_jobs     | false          |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the scaffold shipped its own CLAUDE.md; diff it against your existing `CLAUDE.md` to see if there is anything worth merging.
- Run `npm audit fix` to address the 1 HIGH finding (devalue).
- MODERATE findings (ws, yaml) are in dev/toolchain deps — review before `npm audit fix --force`.
