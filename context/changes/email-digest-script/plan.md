# Email Digest Script Implementation Plan

## Overview

Implement `scripts/send.ts` — a Node.js script that queries `articles_seen` for articles scraped in the last 24 hours that haven't been emailed yet, formats them into an HTML email grouped by source, and sends it sequentially to each address in `subscribers.json` via Resend. Running `npm run send` when no qualifying articles exist exits 0 with a log, without sending.

## Current State Analysis

`scripts/scrape.ts` is complete and writing to `articles_seen`. The table has `id, source_url, article_url, title, lead, seen_at` — but **no `digest_sent_at` column**, so there is currently no way to distinguish "already emailed" from "new". `src/lib/supabase-script.ts` is ready to reuse. No email library is installed.

## Desired End State

`npm run send` with qualifying articles:
1. Loads and validates `subscribers.json`
2. Queries `articles_seen WHERE digest_sent_at IS NULL AND seen_at > NOW()-24h`
3. Groups articles by source hostname; builds HTML email
4. Sends to each subscriber sequentially (Resend)
5. Marks all queried articles as sent (`digest_sent_at = NOW()`)
6. Logs `Wysłano: N artykułów → M subskrybentów`

`npm run send` with no qualifying articles: logs "Brak nowych artykułów w ostatnich 24h, pomijam wysyłkę." and exits 0.

### Key Discoveries

- `src/lib/supabase-script.ts:1-6` — factory ready to reuse, no changes needed
- `scripts/scrape.ts:1-40` — establishes the pattern: top-level await, `import "dotenv/config"`, `process.env` reads, Zod `.parse()`, startup guards → `process.exit(1)`
- `articles_seen` stores `source_url` (URL, not display name) — digest groups by `new URL(source_url).hostname`
- `title` and `lead` are nullable in `src/types/supabase.ts:11-37` — email formatter needs null fallback
- `cheerio`, `dotenv`, `tsx` are all in `devDependencies` — `resend` follows the same convention (scripts are not deployed to Cloudflare)
- `supabase link --project-ref hfiasswaduellpweeloc` required before `supabase db push` on fresh checkout (CLAUDE.md)

## What We're NOT Doing

- React Email templates — plain HTML, no external CSS or image resources
- `resend.batch.send` — sequential loop per subscriber for non-atomic error handling
- Personalized subject per subscriber — static subject with date + article count
- Admin opt-in/opt-out UI — `subscribers.json` is hand-edited by admin
- Cloudflare cron / scheduled invocation — `npm run send` is manual only
- Sending articles older than 24h — articles age out silently if send wasn't run that day

## Implementation Approach

Phase 1 covers all infrastructure (migration, dependencies, env vars, config files) so Phase 2 is a pure implementation of `scripts/send.ts` with no blocked moving parts. This mirrors the supabase-dedup-schema → scraper-script sequencing.

## Critical Implementation Details

**Migration prerequisite**: Run `supabase link --project-ref hfiasswaduellpweeloc` before `supabase db push` — the `.supabase/` directory is gitignored and doesn't persist across checkouts (CLAUDE.md).

**`null` check in Supabase JS v2**: Filtering `digest_sent_at IS NULL` requires `.is("digest_sent_at", null)`, not `.eq()`. Filtering `seen_at` uses `.gt("seen_at", cutoff)` where `cutoff = new Date(Date.now() - 86_400_000).toISOString()`.

**Article age-out**: Articles older than 24h with `digest_sent_at IS NULL` will never be sent and never marked — this is the chosen behavior. Add a one-line comment in the code so future maintainers understand the intentional silence.

**Mark-all-as-sent semantics**: After the subscriber loop, mark ALL queried articles as sent — regardless of per-subscriber Resend errors. Avoiding duplicate sends on the next run outweighs re-trying to the handful of subscribers who may have had a delivery failure.

---

## Phase 1: Infrastructure

### Overview

Everything the send script needs before a single line of `send.ts` is written: DB column, dependencies, env var documentation, and config files.

### Changes Required

#### 1. Supabase migration — add `digest_sent_at`

**File**: `supabase/migrations/20260528150000_add_digest_sent_at_to_articles_seen.sql`

**Intent**: Add a nullable timestamp column so the send script can distinguish articles not yet emailed from those already sent.

**Contract**:
```sql
-- digest_sent_at: NULL = artykuł nie był jeszcze wysłany w digestcie.
-- INSERT/UPDATE/DELETE na articles_seen są wyłącznie przez service_role (pomija RLS) — brak explicit policy jest intencjonalny.
ALTER TABLE articles_seen ADD COLUMN digest_sent_at timestamptz;
```

#### 2. Apply migration and regenerate TypeScript types

**Files**: (migration applied via CLI), `src/types/supabase.ts` (overwrite)

**Intent**: Push the new column to Supabase and regenerate the auto-typed schema so `digest_sent_at` is available in TypeScript.

**Contract**:
```
npx supabase db push
supabase gen types typescript --project-id hfiasswaduellpweeloc > src/types/supabase.ts
```

#### 3. Install `resend` to devDependencies

**File**: `package.json`

**Intent**: Add Resend SDK consistent with the project convention (`cheerio`, `dotenv`, `tsx` — all script-only runtime libs are in devDependencies).

**Contract**: `npm install --save-dev resend`

#### 4. Add `send` npm script

**File**: `package.json` (scripts section)

**Intent**: Expose the digest script as `npm run send`, mirroring `npm run scrape`.

**Contract**: Add `"send": "tsx scripts/send.ts"` alongside the existing `"scrape"` entry.

#### 5. Update `.env.example`

**File**: `.env.example`

**Intent**: Document the two new required env vars so any developer setting up the project knows what to obtain.

**Contract**: Append two lines after the existing Supabase vars:
```
# Email digest script
RESEND_API_KEY=###
RESEND_FROM_EMAIL=###
```

#### 6. Create `subscribers.json` and `subscribers.example.json`

**Files**: `subscribers.json` (root), `subscribers.example.json` (root)

**Intent**: `subscribers.json` is the live admin-managed list of recipient email addresses. `subscribers.example.json` documents the format for onboarding.

**Contract**:
- `subscribers.example.json`: `["jan@example.com", "anna@example.com"]`
- `subscribers.json`: seed with at least one real address for local testing (e.g. the admin's email)
- Note: `subscribers.json` contains email addresses — consider whether to add it to `.gitignore` before committing (admin decision; the example file is always safe to commit)

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push`
- `src/types/supabase.ts` contains `digest_sent_at` field after regen
- `npm run build` passes (Astro SSR, no TypeScript errors introduced)
- `npm run lint` passes

#### Manual Verification

- `digest_sent_at` column visible in Supabase dashboard → Table Editor → articles_seen
- `resend` appears in `package.json` devDependencies
- Running `npm run send` (with missing `.env` vars) exits with `console.error` message and code 1 — confirms startup guard will work once Phase 2 is done

**Implementation Note**: After all automated checks pass, confirm manual items before proceeding to Phase 2.

---

## Phase 2: `scripts/send.ts` Implementation

### Overview

Implement the complete digest send script. The entire file follows `scripts/scrape.ts` structural conventions.

### Changes Required

#### 1. Create `scripts/send.ts`

**File**: `scripts/send.ts`

**Intent**: Implement the digest send script end-to-end: validate env vars and subscriber list, query unsent articles from the last 24h, build HTML grouped by source hostname, send to each subscriber via Resend, mark articles as sent, log stats.

**Contract** — structural outline (implementer writes the code):

```
1.  import "dotenv/config"                              // first line, loads .env
2.  import { readFileSync } from "fs"
    import { createScriptClient } from "@/lib/supabase-script"
    import { Resend } from "resend"
    import { z } from "zod"

3.  const SubscribersSchema = z.array(z.email())
    type Subscribers = z.infer<typeof SubscribersSchema>

4.  Startup guards (same pattern as scrape.ts lines 21-27):
    - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL
    - any missing → console.error + process.exit(1)

5.  Load subscribers.json (same pattern as sources.json):
    - readFileSync("subscribers.json", "utf-8") → JSON.parse → SubscribersSchema.parse()
    - try/catch → console.error + process.exit(1)

6.  const supabase = createScriptClient(supabaseUrl, serviceRoleKey)
    const resend = new Resend(resendApiKey)

7.  console.log("Digest starting…")

8.  Query articles_seen:
    const cutoff = new Date(Date.now() - 86_400_000).toISOString()
    .from("articles_seen")
    .select("id, source_url, article_url, title, lead")
    .is("digest_sent_at", null)
    .gt("seen_at", cutoff)
    .order("seen_at", { ascending: true })
    → { data: articles, error } — on error: console.error + process.exit(1)

9.  Early exit if articles.length === 0:
    console.log("Brak nowych artykułów w ostatnich 24h, pomijam wysyłkę.")
    // implicit exit 0

10. Build HTML:
    - Group articles by new URL(article.source_url).hostname using Map<string, article[]>
    - Subject: `Digest — ${articles.length} nowych artykułów — ${new Date().toLocaleDateString("pl-PL")}`
    - HTML: <h1>subject</h1> + per source group: <h2>hostname</h2> + per article:
      <p><strong><a href="article_url">title || article_url</a></strong></p>
      <p>lead || ""</p>      // empty string if lead is null — no element rendered

11. Sequential send loop:
    for (const email of subscribers) {
      const { data, error } = await resend.emails.send({
        from: resendFromEmail,
        to: [email],
        subject,
        html,
      })
      if (error) console.error(`${email}: Resend error:`, error.message)
      else console.log(`${email}: wysłano (id: ${data.id})`)
    }

12. Mark as sent (regardless of per-subscriber Resend errors):
    await supabase
      .from("articles_seen")
      .update({ digest_sent_at: new Date().toISOString() })
      .in("id", articles.map(a => a.id))
    // log error if update fails, but do not exit — articles are considered "sent"

13. console.log(`---`)
    console.log(`Wysłano: ${articles.length} artykułów → ${subscribers.length} subskrybentów`)
```

### Success Criteria

#### Automated Verification

- `npm run build` passes (no TypeScript errors in `scripts/send.ts`)
- `npm run lint` passes

#### Manual Verification

- `npm run send` sends email to all addresses in `subscribers.json` when qualifying articles exist
- Received email shows correct format: H2 per source hostname, bold title as clickable link, lead text below each title
- `digest_sent_at` is populated (not NULL) in Supabase dashboard for the sent article rows
- Second `npm run send` run immediately after: logs "Brak nowych artykułów" — no duplicate email sent
- `npm run send` with `subscribers.json` = `[]`: exits gracefully (no articles to send, or sends 0 emails), no crash
- `npm run send` with missing `RESEND_API_KEY` in `.env`: exits with `console.error` and code 1

**Implementation Note**: After automated checks pass, run the actual send to a real inbox to verify email rendering before marking this change complete.

---

## Testing Strategy

### Manual Testing Steps

1. Obtain Resend API key from [resend.com/api-keys](https://resend.com/api-keys)
2. Fill `.env`: `RESEND_API_KEY=re_...`, `RESEND_FROM_EMAIL=onboarding@resend.dev` (or verified address)
3. Add your email to `subscribers.json`: `["your@email.com"]`
4. Ensure `articles_seen` has rows with `digest_sent_at IS NULL AND seen_at > NOW()-24h` (run `npm run scrape` or insert a test row via Supabase dashboard)
5. Run `npm run send` — verify email arrives in inbox
6. Run `npm run send` again — verify "Brak nowych artykułów" log and no duplicate email
7. Check Supabase dashboard: `digest_sent_at` populated for the test rows

## References

- Research: `context/changes/email-digest-script/research.md`
- Template script: `scripts/scrape.ts`
- Supabase client factory: `src/lib/supabase-script.ts`
- DB schema: `supabase/migrations/20260526000000_create_articles_seen.sql`
- Resend Node.js docs: https://resend.com/docs/send-with-nodejs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastructure

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` — 8d1edb9
- [x] 1.2 `src/types/supabase.ts` contains `digest_sent_at` after regen — 8d1edb9
- [x] 1.3 `npm run build` passes — 8d1edb9
- [ ] 1.4 `npm run lint` passes

#### Manual

- [x] 1.5 `digest_sent_at` column visible in Supabase dashboard — 8d1edb9
- [x] 1.6 `resend` in `package.json` devDependencies — 8d1edb9
- [x] 1.7 `npm run send` exits with error on missing env keys (startup guard confirmed) — 8d1edb9

### Phase 2: scripts/send.ts implementation

#### Automated

- [x] 2.1 `npm run build` passes (no TypeScript errors)
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Email received with correct format (H2 per source, bold title link, lead text)
- [x] 2.4 `digest_sent_at` updated in Supabase after send
- [x] 2.5 Second run logs "Brak nowych artykułów" — no duplicate email
- [x] 2.6 Empty `subscribers.json` exits gracefully, no crash
- [x] 2.7 Missing `RESEND_API_KEY` exits with `console.error` and code 1
