# Articles Dashboard Implementation Plan

## Overview

Add a protected read-only page at `/dashboard/articles` showing the `articles_seen` table with client-side column sorting. Astro SSR handles data fetching; a React island (ArticlesTable) handles interactivity. shadcn/ui Table provides the UI primitives.

## Current State Analysis

`src/pages/dashboard.astro` is a 27-line stub showing user email and sign-out — no Supabase queries. Middleware (`src/middleware.ts:4`) protects `startsWith("/dashboard")`, so `/dashboard/articles` is automatically covered without any auth changes. `articles_seen` has 7 columns with `"authenticated can select"` RLS policy already in place — zero new migrations. `createClient(requestHeaders, cookies)` in `src/lib/supabase.ts` is the SSR client factory; not yet used for data queries in any `.astro` page. No table component exists; shadcn is set up in "new-york" style — `npx shadcn@latest add table` is the install path. `src/lib/services/` directory does not exist.

## Desired End State

Admin logs in, sees `/dashboard` with a link to artykuły. Clicks through to `/dashboard/articles` — a full-width table loads with up to 50 articles: Tytuł (clickable link), Źródło (hostname), Zebrany (date), Status (Nowy / Wysłano + date). Clicking a column header sorts rows on the client without page reload. If the DB query fails, an inline error banner appears above the empty table slot. Unauthenticated access redirects to sign-in.

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]` with `startsWith` → `/dashboard/articles` auto-protected
- `src/lib/supabase.ts:5` — `createClient(requestHeaders, cookies)` returns `SupabaseClient | null` — always null-check before use
- `scripts/send.ts:39` — only existing query against `articles_seen`; dashboard SELECT must also include `seen_at` and `digest_sent_at` (send.ts omits them)
- `src/types/supabase.ts` — `Tables<"articles_seen">` extracts the full Row type (all 7 columns)
- `src/components/ui/table.tsx` — does not yet exist; `npx shadcn@latest add table` creates it
- `src/lib/services/` — directory does not exist; `articles.ts` will be its first file
- `src/components/Banner.astro` — exists with error/info/warning variants; use for inline error display

## What We're NOT Doing

- Pagination — hard limit 50 rows, no infinite scroll
- Mutations — read-only view, no delete/archive/resend actions
- Real-time updates — no Supabase subscriptions or polling
- Filtering by status — sorting only; no "show only new" filter
- Auth changes — middleware already handles `/dashboard/articles`
- `lead` column in the table — stored in DB but not shown (URL + title is enough for navigation)

## Implementation Approach

Phase 1 builds the UI component in isolation: install shadcn table primitives, create `ArticlesTable.tsx` accepting typed props. Component type-checks via `npm run build` without needing a mounted page.

Phase 2 wires data to the component: service function for the query, Astro page that fetches and passes articles as props to the React island, and a navigation link on the existing dashboard.

## Critical Implementation Details

**No `"use client"` directive in `ArticlesTable.tsx`.** React islands in Astro are activated via `client:load` at the import site in the `.astro` page — not via `"use client"` inside the component. Using `"use client"` is a Next.js convention explicitly banned in this project (CLAUDE.md).

**`createClient` returns `null` when env vars are missing.** Always guard: `if (!supabase) { fetchError = "..." }` before calling `fetchArticles`. Show `Banner.astro` with the error string — do not redirect on this path (user is already authenticated).

---

## Phase 1: shadcn Table + React ArticlesTable Component

### Overview

Install shadcn table primitives and create the React island component. The component is self-contained: it accepts typed articles props, sorts on the client, and renders the table. Build passes with no manual page mounting required.

### Changes Required

#### 1. Install shadcn table

**Command**: `npx shadcn@latest add table`

**Intent**: Generate the shadcn Table primitives in "new-york" style, consistent with the project's existing shadcn components (`src/components/ui/button.tsx`).

**Contract**: After the command, `src/components/ui/table.tsx` exists and exports `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`. No manual edits to the generated file.

#### 2. Create `src/components/ArticlesTable.tsx`

**File**: `src/components/ArticlesTable.tsx`

**Intent**: React component that receives articles as props and renders a sortable table using shadcn primitives. Clicking a column header cycles ascending → descending; clicking a different header resets direction to ascending for the new column. Default sort: `seen_at` descending. Empty-state text when the array is empty.

**Contract**:
```typescript
import type { Tables } from "@/types/supabase";

type Article = Tables<"articles_seen">;
type SortColumn = "title" | "source_url" | "seen_at" | "digest_sent_at";

interface Props {
  articles: Article[];
}
export default function ArticlesTable({ articles }: Props)
```
Four columns and their data sources:
- **Tytuł** — `<a href={article_url} target="_blank" rel="noopener noreferrer">` with text `title ?? article_url`
- **Źródło** — `new URL(source_url).hostname`
- **Zebrany** — `new Date(seen_at).toLocaleDateString("pl-PL")`
- **Status** — `digest_sent_at ? "Wysłano " + toLocaleDateString("pl-PL") : "Nowy"`

Sort state managed with `useState` (`sortColumn`, `sortDirection`); sorted list produced via `useMemo` to avoid re-sorting on every render.

### Success Criteria

#### Automated Verification

- `npm run build` passes — `ArticlesTable.tsx` type-checks with no TypeScript errors
- `npm run lint` passes — no ESLint violations in the new file

---

## Phase 2: Service + Astro Page + Navigation

### Overview

Create the service function for the DB query, the Astro page that fetches data and mounts the React island, and a navigation link from the existing dashboard stub.

### Changes Required

#### 1. Create `src/lib/services/articles.ts`

**File**: `src/lib/services/articles.ts`

**Intent**: Export a single `fetchArticles` function encapsulating the `articles_seen` SELECT. Keeps the Astro page frontmatter thin and the query testable in isolation.

**Contract**:
```typescript
export async function fetchArticles(supabase: SupabaseClient)
```
Selects columns: `id, source_url, article_url, title, lead, seen_at, digest_sent_at`. Order: `seen_at` descending. Limit: 50. Returns the raw `{ data, error }` from Supabase — the caller owns error handling.

#### 2. Create `src/pages/dashboard/articles.astro`

**File**: `src/pages/dashboard/articles.astro`

**Intent**: Protected SSR page. Creates the Supabase client, fetches articles via the service, handles null client and query errors inline with a banner, and mounts the React island with articles as props.

**Contract**: Frontmatter flow:
1. `const supabase = createClient(Astro.request.headers, Astro.cookies)` — null-checked
2. `const { data: articles, error } = await fetchArticles(supabase)` — error-checked
3. `let fetchError: string | null = null` — set on null client or query error; `articles` defaults to `[]`
4. Template: `Banner.astro` above the table (rendered only when `fetchError` is set), then `<ArticlesTable articles={articles} client:load />`

Page title: "Artykuły — Dashboard". Uses the existing `Layout.astro` wrapper.

#### 3. Update `src/pages/dashboard.astro`

**File**: `src/pages/dashboard.astro`

**Intent**: Add a navigation link to `/dashboard/articles` so the admin can reach the new page from the existing dashboard.

**Contract**: Add an `<a href="/dashboard/articles">` element inside the existing glass-morphism card, below `<p class="mt-2 text-sm ...">` and above the sign-out `<form>`. Style matching existing ghost button: `border border-white/20 bg-white/10 rounded-lg px-4 py-2 text-sm hover:bg-white/20 transition-colors`.

### Success Criteria

#### Automated Verification

- `npm run build` passes — full app type-checks with no errors

#### Manual Verification

- Navigate to `/dashboard` — link to artykuły is visible inside the card and clickable
- Follow link to `/dashboard/articles` — page loads, table renders with real articles (or empty state if DB is empty)
- Table shows four columns with correct data: Tytuł as link, Źródło as hostname, Zebrany as date, Status as "Nowy"/"Wysłano"
- Click column header → rows re-sort; click same header again → direction reverses
- Click article title → new tab opens to the correct `article_url`
- Article with non-null `digest_sent_at` shows "Wysłano DD.MM.YYYY"
- Sign out, navigate directly to `/dashboard/articles` → redirect to `/auth/signin`

---

## Testing Strategy

### Manual Testing Steps

1. `npm run dev` — start local dev server
2. Sign in → verify link to artykuły appears on `/dashboard`
3. Click link → verify `/dashboard/articles` loads with ≤50 rows
4. Click each column header (Tytuł, Źródło, Zebrany, Status) — verify sort; click again — verify direction reversal
5. Click an article title → verify new tab, correct URL
6. Find a row with non-null `digest_sent_at` in the table — verify Status shows "Wysłano" (check Supabase dashboard for a sent article if needed)
7. Sign out → navigate directly to `/dashboard/articles` → verify redirect to sign-in

## References

- Research: `context/changes/articles-dashboard/research.md`
- Roadmap slice: `context/foundation/roadmap.md` S-04
- SSR client: `src/lib/supabase.ts:5`
- Reference query: `scripts/send.ts:39`
- Schema migrations: `supabase/migrations/20260526000000_create_articles_seen.sql`
- Existing dashboard stub: `src/pages/dashboard.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: shadcn Table + React ArticlesTable Component

#### Automated

- [ ] 1.1 `npm run build` passes — ArticlesTable type-checks
- [ ] 1.2 `npm run lint` passes

### Phase 2: Service + Astro Page + Navigation

#### Automated

- [ ] 2.1 `npm run build` passes — full app builds

#### Manual

- [ ] 2.2 `/dashboard` shows link to artykuły — visible and clickable
- [ ] 2.3 `/dashboard/articles` loads — table renders with real articles
- [ ] 2.4 Column header click → rows re-sort; same header again → direction reverses
- [ ] 2.5 Article title link opens correct URL in new tab
- [ ] 2.6 Status column shows "Nowy" for null `digest_sent_at`, "Wysłano" + date for non-null
- [ ] 2.7 Unauthenticated access to `/dashboard/articles` → redirect to `/auth/signin`
