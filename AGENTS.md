# Repository Guidelines

10xScraper is an Astro 6 SSR web app (React 19 islands, Tailwind 4, Supabase auth, shadcn/ui) deployed to Cloudflare Workers. See @CLAUDE.md for full architecture, auth-flow details, and environment setup.

## Hard Rules

- Never concatenate Tailwind classes manually — use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for all conditional or merged class strings.
- API routes must export `const prerender = false`; omitting it silently breaks routing under the Cloudflare runtime.
- Use Astro components for static content and layout; add React only when client-side interactivity is required.
- No Next.js directives (`"use client"`, `"use server"`) in React files — Astro's island architecture handles hydration.
- Every new Supabase table requires RLS enabled with granular per-operation, per-role policies. See @supabase/migrations/ for the `YYYYMMDDHHmmss_short_description.sql` naming convention.
- Do not modify `context/` — it holds bootstrap chain artifacts (PRD, tech-stack hand-off, plans).
- Never commit `.env` or `.dev.vars` — both are gitignored and hold live secrets.

## Project Structure

Source lives in `src/`: pages and API routes under `src/pages/`, layout templates in `src/layouts/`, shadcn/ui components in `src/components/ui/`, React hooks in `src/components/hooks/`, shared utilities in `src/lib/` (extracted business logic in `src/lib/services/`), and shared types in `src/types/` (`domain.ts` for handcrafted entities/DTOs, `supabase.ts` for auto-generated DB types). Auth middleware lives at `src/middleware.ts` and enforces `PROTECTED_ROUTES`. Database migrations in `supabase/migrations/`.

Path alias `@/*` maps to `src/*` — always use it instead of relative imports.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build; requires `SUPABASE_URL` and `SUPABASE_KEY` in environment
- `npm run test` — Vitest, run all tests once (CI-safe)
- `npm run test:watch` — Vitest in watch mode (local dev)
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npx wrangler deploy` — deploy to Cloudflare Pages/Workers (requires wrangler auth)

## Coding Style

TypeScript strict mode (`strictTypeChecked` + `stylisticTypeChecked`). API route handler exports are uppercase (`GET`, `POST`); validate all input with zod. New shadcn/ui components: `npx shadcn@latest add [name]` (lands in `src/components/ui/`, "new-york" variant). Prettier: 2-space indent, 120-char line, double quotes, trailing commas, semicolons.

## Testing

Vitest (see @vitest.config.ts). Tests live in `tests/**/*.test.ts` with the `@/*` path alias wired. Run a single file with `npx vitest run tests/path/to/file.test.ts`. CI gate: `npm run lint` + `npm run build` on every push to `master`. Pre-commit (husky + lint-staged): ESLint fix on `*.{ts,tsx,astro}`, Prettier on `*.{json,css,md}`.

## Commit & Pull Request Guidelines

Conventional Commits with scope: `feat(<scope>):`, `fix(<scope>):`, `chore(<scope>):`, `docs(<scope>):`. CI workflow is at @.github/workflows/ci.yml; the build step requires `SUPABASE_URL` and `SUPABASE_KEY` as GitHub repository secrets.

## Security & Configuration

`SUPABASE_URL` and `SUPABASE_KEY` are server-only secrets declared via `astro:env/server` (see @astro.config.mjs). For local Node dev copy `.env.example` → `.env`; for Cloudflare workerd local dev use `.dev.vars`.
