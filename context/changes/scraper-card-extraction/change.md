---
change_id: scraper-card-extraction
title: Fix scraper regression — extract title/lead from the article card (.content--block)
status: implemented
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

Regresja wprowadzona przez zmianę `article-empty-titles`: po deployu dzisiejszy scrape zapisał WSZYSTKIE
`title` i `lead` jako NULL. Przyczyna potwierdzona na żywym DOM parkiet.com (fetch + cheerio):

- Artykuł = karta `.content--block` z JEDNYM `h2` i JEDNYM `.teaser--lead` na poziomie karty oraz DWOMA
  `.contentLink` o TYM SAMYM URL (link-miniaturka bez `h2` + link-tytuł z `h2`).
- `relativeSelector` wyciąga title/lead WEWNĄTRZ pojedynczego linku (`$(el).find(...)`):
  - lead: selektor `.content--block .teaser--lead` nie zaczyna się od `articleLink`, nie jest skracany,
    `find` w obrębie linku nic nie znajduje → null.
  - title: link-miniaturka (bez `h2`, pierwszy w DOM) → null, trafia pierwszy do upsertu; link-tytuł ma
    ten sam URL → `ignoreDuplicates` go odrzuca → „null wygrywa".
- Test dał fałszywe zielone: fixture miał `<a><h2>…</h2></a>` bez duplikatów — nie odwzorowywał realnego DOM.

Naprawa (decyzje użytkownika): ekstrakcja title/lead z poziomu KARTY (`closest(container)`, kontener
wyprowadzony ze wspólnego prefiksu selektorów), W KODZIE — bez zmiany `sources.json`/sekretu `SOURCES_JSON`.
Dane: dzisiejsze null-owe wiersze zostawić (utwardzenie z Fazy 2 i tak pokazuje URL; przyszłe scrapy poprawne).

Diagnoza + szkic planu: plik planu `~/.claude/plans/…-zany-fog.md`. Następuje po `article-empty-titles`
(commity 0b3b2d2/baf3d56/a1efdef/9b8ec81/1b8c4e0, deploy b33c48f1).
