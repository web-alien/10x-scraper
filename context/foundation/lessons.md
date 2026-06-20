# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze zacznij od MVP ≤ 3 tygodnie

- **Context**: Faza shapingu i planowania nowego projektu
- **Problem**: MVP okazuje się za duży i projekt nie zostaje ukończony
- **Rule**: Zawsze zaczynaj od 3-tygodniowego MVP lub mniejszego. Jeśli zakres przekracza 3 tygodnie pracy po godzinach, jawnie potwierdź koszt przed przejściem dalej.
- **Applies to**: frame, plan

## Tooling/config commits mixed with feature commits

- **Context**: .claude/settings.local.json, .mcp.json, .claude/.10x-cli-manifest.json — IDE/tooling config changed during feature sessions
- **Problem**: Tooling/IDE config changes (MCP servers, Bash permissions, CLI manifest timestamps) that happen during a feature implementation session land in the feature's commit range, making scope-discipline checks noisy and future reviews harder to read.
- **Rule**: [fill in — e.g. "Commit tooling/config changes separately from feature code, using a chore: IDE config commit, before or after the feature commit."]
- **Applies to**: [fill in — e.g. "implementation, commit hygiene"]

## RLS policies — service_role bypass must be documented in migration

- **Context**: supabase/migrations/ — tables where writes go exclusively through service_role
- **Problem**: When INSERT/UPDATE/DELETE are intentionally absent from RLS policies (because service_role bypasses RLS), future developers reading the migration in Supabase dashboard or the SQL file may think the policies were forgotten rather than deliberately omitted.
- **Rule**: [fill in — e.g. "Always add a SQL comment block above the policy list stating which operations are service_role-only and why, e.g. 'service_role pomija RLS — INSERT/UPDATE/DELETE are write-path only'."]
- **Applies to**: [fill in — e.g. "supabase migrations, RLS policy design"]

## Scraper fixtures must mirror the real page DOM

- **Context**: Logika ekstrakcji scrapera (scripts/scrape.ts) i jej testy (tests/scraper.test.ts) — każda zmiana w tym, jak z selektorów wyciągane są tytuł/lead/linki ze strony źródłowej.
- **Problem**: Test z fixturem zbudowanym na założeniach (`<a><h2>…</h2></a>`) przeszedł na zielono, podczas gdy produkcyjny scrape zapisał WSZYSTKIE title/lead jako NULL — realny parkiet.com ma tytuł/lead na poziomie karty i dwa linki o tym samym URL na artykuł. Fałszywe „zielone" wypuściło regresję na produkcję.
- **Rule**: Przed zmianą ekstrakcji scrapera pobierz i obejrzyj REALNY DOM strony (fetch + inspekcja na żywo), a fixture testowy zbuduj tak, by go odwzorowywał — łącznie z kwirkami (wiele linków na element, pola na kontenerze-rodzicu). Nigdy nie asercjonuj przeciw hipotetycznemu DOM.
- **Applies to**: plan, implement, impl-review
