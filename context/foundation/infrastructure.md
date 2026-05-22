---
project: 10xScraper
researched_at: 2026-05-22
recommended_platform: Cloudflare Workers + Pages
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: JavaScript/TypeScript
  framework: Astro 6 SSR
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external, PostgreSQL)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

Tech stack (`10x-astro-starter`) jest zbudowany wokół Cloudflare od początku — `@astrojs/cloudflare` adapter, `wrangler.jsonc` w repo, Cron Triggers dla schedulowanych zadań. Wszystkie 5 kryteriów agent-friendly zaliczone na Pass, w tym GA MCP server (2500+ endpoints). Dla scrapingu I/O-bound (HTTP fetch dominuje nad CPU) darmowy tier jest wystarczający; przy cięższym parsowaniu Paid ($5/mo) podnosi limit CPU do 5 minut.

## Platform Comparison

### Scoring Matrix

| Platforma | CLI-first | Managed/Serverless | Agent docs | Stable API | MCP/Integration | Suma |
|---|---|---|---|---|---|---|
| **Cloudflare** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **5/5** |
| Fly.io | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial | 4.5/5 |
| Railway | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ❌ Fail | 4/5 |
| Render | ⚠️ Partial | ✅ Pass | ⚠️ Partial | ⚠️ Partial | ❌ Fail | 2.5/5 |
| ~~Netlify~~ | — | odfiltrowany (Q1: persistent conn) | — | — | — | — |
| ~~Vercel~~ | — | odfiltrowany (Q1: persistent conn) | — | — | — | — |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Jedyna platforma z 5/5. `wrangler` CLI pokrywa pełny cykl operacyjny (deploy, rollback, log tail). Dokumentacja dostępna jako `llms.txt` na `developers.cloudflare.com/workers/llms.txt`. MCP server GA (2026-05) z dostępem do Workers, KV, R2, DNS i Zero Trust. Free tier: 100k requestów/dzień, Cron Triggers gratis. Paid: $5/mo, CPU limit 5 min. Dla I/O-bound scrapingu (czas fetch nie liczy się do CPU) free tier często wystarcza. Stack projektu jest już do Cloudflare dostosowany.

#### 2. Fly.io

Silna alternatywa dla długich procesów — Firecracker microVMs bez serverless CPU walls, `flyctl` solidny CLI, docs na GitHubie (markerb/MDX). Brak darmowego tieru (od 2024), ~$2-15/mo. GitHub Actions GA. MCP: emerging (Fly Machines API), nie tak dojrzały jak Cloudflare. Dobry wybór gdyby CPU limity Workers okazały się problemem.

#### 3. Railway

Najłatwiejszy onboarding: push do GitHuba → auto-deploy z SSL. $5/mo Hobby + $5 kredytów użycia. Cron GA (minimum co 5 minut), HTTP timeout 15 min. Brak MCP. Node.js pełny (brak polyfill problemów). Odpowiedni gdyby Cloudflare Workers runtime stwarzał problemy z kompatybilnością bibliotek.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Słabości

1. **CPU limit free tier = 30 ms per request** — parsowanie HTML przez `cheerio` lub podobne biblioteki kosztuje CPU; przy wielu źródłach free tier może być za mały bez ostrzeżenia.
2. **Workers runtime ≠ pełny Node.js** — nie wszystkie Node.js API dostępne w workerd; biblioteki z `fs`, `child_process`, `node:crypto` mogą wymagać polyfillów lub podmian.
3. **Vendor lock-in** — Durable Objects, KV, Queues to Cloudflare-specific API; migracja na inną platformę wymagałaby przepisania warstwy infrastrukturalnej.
4. **Paid tier wymagany przy cięższym CPU** — $5/mo to mało, ale przejście z free do paid może zaskoczyć gdy projekt rośnie.
5. **Cron Triggers ±30s opóźnienie** — jeśli pojawi się potrzeba precyzyjnego timingu wysyłki maili, Workers Cron nie gwarantuje dokładności.

### Pre-Mortem — Jak To Mogło Się Posypać

Przez pierwsze dwa tygodnie wszystko działało — mały ruch, dwa źródła scrapowane I/O-bound, mieściło się w limitach. W trzecim tygodniu dodano 8 źródeł i zaczął się ciężki parsing. Workers na free tierze zaczęły zwracać błędy 1015 (CPU exceeded). Po przejściu na Paid okazało się że jedna z bibliotek scrapingowych używa Node.js Buffer.alloc() przez polyfill niestabilny w workerd — ciche błędy parsowania na co trzeciej stronie. Debugowanie zajęło tydzień: `wrangler tail` logował zdarzenia z opóźnieniem i trudno było skorelować które URL powodowały błąd. Problem rozwiązano, ale kosztowało to połowę 3-tygodniowego MVP.

### Unknown Unknowns

1. **`astro dev` uruchamia workerd od Astro 6** — `npm run dev` already używa workerd runtime lokalnie; tutoriale opisujące osobno `wrangler dev` są przestarzałe dla tej wersji.
2. **Sekrety Pages vs Workers konfiguruje się różnie** — `SUPABASE_URL` i `SUPABASE_KEY` ustawia się inaczej dla Pages (`wrangler pages secret put`) niż dla Workers (`wrangler secret put`); pomylenie jest częste.
3. **Email przez HTTP API, nie SMTP** — Workers nie mają dostępu do SMTP; wymagany Resend, Mailgun lub SendGrid przez HTTP. `nodemailer` z SMTP nie zadziała bez obejść.
4. **KV ma eventual consistency** — stan deduplication w KV może mieć race condition przy równoległym uruchomieniu scrapera dwa razy; Durable Objects rozwiązuje to, ale to extra konfiguracja.
5. **`wrangler.jsonc` vs `wrangler.toml`** — oficjalne przykłady Cloudflare często pokazują `.toml`; starter używa `.jsonc`. Składnia dla Cron Triggers i KV namespace różni się między formatami.

## Operational Story

- **Preview deploys**: Cloudflare Pages tworzy unikalne preview URL dla każdego brancha i PR automatycznie. Preview URLs są publiczne (brak ochrony na free tier) — rozważ Cloudflare Access dla wrażliwych środowisk. Fork PRs nie tworzą preview deployments ze względów bezpieczeństwa.
- **Secrets**: sekrety (`SUPABASE_URL`, `SUPABASE_KEY`) żyją w Cloudflare Pages dashboard → Settings → Environment Variables lub przez `wrangler pages secret put`. Odczyt tylko przez platformę; rotacja przez `wrangler pages secret put` + nowy deploy.
- **Rollback**: `wrangler rollback [VERSION_ID]` lub przez Cloudflare dashboard → Workers → Deployments. Czas rewertu: ~30 sekund. Uwaga: migracje bazy danych Supabase nie rollbackują automatycznie — to operacja czysto aplikacyjna.
- **Approval**: deploy do produkcji (`wrangler deploy --env production`) może wykonać agent. Operacje wymagające człowieka: usunięcie projektu, rotacja kluczy API Cloudflare, zmiany DNS, billing. Nigdy nie dawaj agentowi tokenu z dostępem do billing lub DNS.
- **Logs**: `wrangler tail` streamuje logi produkcyjne w czasie rzeczywistym; `wrangler tail --status=error` filtruje tylko błędy. Cloudflare MCP server (`cloudflare/mcp-server-cloudflare-workers`) daje dostęp do logów przez structured tools.

## Risk Register

| Ryzyko | Źródło | Prawdopodobieństwo | Wpływ | Mitigacja |
|---|---|---|---|---|
| CPU limit free tier przekroczony przy cięższym parsowaniu | Devil's advocate | Średnie | Średni | Monitoruj CPU usage; przejdź na Paid ($5/mo) przy pierwszym błędzie 1015 |
| Biblioteka scrapingowa niezgodna z workerd runtime | Devil's advocate | Niskie-Średnie | Wysoki | Przetestuj `cheerio` + `fetch` lokalnie przez `npm run dev` (workerd) przed deploymentem |
| Vendor lock-in blokuje migrację | Devil's advocate | Niskie | Średni | Izoluj logikę scrapingu za interfejsem — Cloudflare-specific w osobnej warstwie |
| Sekrety skonfigurowane dla Pages zamiast Workers lub vice versa | Unknown unknowns | Średnie | Wysoki | Używaj `wrangler pages secret put` dla Pages deploymentów; sprawdź w `wrangler.jsonc` typ projektu |
| Email przez SMTP nie działa w workerd | Unknown unknowns | Wysokie (jeśli nodemailer) | Wysoki | Zintegruj Resend lub Mailgun API (HTTP) zamiast SMTP; dodaj do konfiguracji w pierwszym sprincie |
| KV race condition dla stanu deduplication | Unknown unknowns | Niskie (manual trigger MVP) | Niski | Acceptable dla MVP z ręcznym triggerem; rozważ Durable Objects w v2 dla automatycznego crona |
| Cron opóźnienie ±30s przy precyzyjnej wysyłce | Research finding | Niskie (brak wymagania precyzji) | Niski | Zaakceptowane w MVP; nie blokuje |

## Getting Started

1. **Zaloguj się do Cloudflare** i stwórz projekt Pages: `npx wrangler login` → `npx wrangler pages project create 10x-scraper`
2. **Podłącz repo GitHub**: Cloudflare Pages dashboard → stwórz nowy projekt → podłącz `web-alien/10x-scraper` → branch: `master`
3. **Ustaw sekrety**: `npx wrangler pages secret put SUPABASE_URL` i `npx wrangler pages secret put SUPABASE_KEY` (wklej wartości z `.env`)
4. **Pierwszy deploy**: `npm run build` lokalnie aby sprawdzić czy build przechodzi, potem push do `master` — Pages auto-deployuje
5. **Weryfikacja**: sprawdź URL preview w Cloudflare dashboard; `npx wrangler tail` do streamowania logów produkcyjnych

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions już skonfigurowane w `.github/workflows/ci.yml`)
- Production-scale architecture (multi-region, HA, DR)
