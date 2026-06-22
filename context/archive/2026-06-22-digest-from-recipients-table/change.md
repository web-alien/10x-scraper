---
change_id: digest-from-recipients-table
title: Codzienny digest czyta odbiorców z tabeli mailing_recipients zamiast subscribers.json
status: archived
created: 2026-06-22
updated: 2026-06-22
archived_at: 2026-06-22T11:17:40Z
---

## Notes

przerobić scripts/send.ts, by czytał odbiorców z tabeli mailing_recipients (status=active) zamiast z subscribers.json; usunąć rozjazd dwóch źródeł prawdy (F4 z impl-review mailing-recipients)

Pochodzenie: F4 z [[]] context/changes/mailing-recipients/reviews/impl-review.md — panel pisze do tabeli, a wysyłka (scripts/send.ts) wciąż czyta subscribers.json / GitHub Secret SUBSCRIBERS_JSON. Po tej zmianie tabela staje się jedynym źródłem prawdy. Do rozważenia: czy zostawić subscribers.json jako fallback, oraz czy daily-digest.yml nadal potrzebuje sekretu SUBSCRIBERS_JSON.
