---
project: 10xScraper
deployed_at: 2026-05-22
platform: Cloudflare Workers
environment: production
---

## Deployed URL

https://10x-scraper.okres123.workers.dev

## Deploy Commands Used

```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npm run build
npx wrangler deploy
```

## Secrets Configured

| Secret | Status |
|--------|--------|
| SUPABASE_URL | ✅ set |
| SUPABASE_KEY | ✅ set |

## Resources Provisioned by Cloudflare

| Binding | Resource | ID |
|---------|----------|----|
| SESSION | KV Namespace | 9cbecf1c85104644996a9eb36ad87657 |
| IMAGES | Cloudflare Images | auto |
| ASSETS | Static assets | ./dist/client |

## Current Version

`689938fd-dbc2-47fe-bd0c-f3db25f0eeab`

## Rollback

```bash
npx wrangler rollback 689938fd-dbc2-47fe-bd0c-f3db25f0eeab
```

## Logs

```bash
npx wrangler tail
npx wrangler tail --status=error
```

## Notes

- `wrangler.jsonc` zmieniono: `name: "10x-astro-starter"` → `name: "10x-scraper"`
- Projekt używa Workers + Assets (nie Pages) — deploy przez `wrangler deploy`
- KV Namespace `10x-scraper-session` auto-sprowizjonowany przez Cloudflare
- CI auto-deploy nie jest jeszcze skonfigurowany — przyszły krok
