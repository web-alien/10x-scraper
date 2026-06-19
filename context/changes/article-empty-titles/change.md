---
change_id: article-empty-titles
title: Fix empty article titles (scraper title-link pairing + null convention)
status: implemented
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Część artykułów na `/dashboard/articles` ma pusty tytuł (puste, klikalne wiersze; problem też w
digeście e-mail). Przyczyna dwuczęściowa:

1. Scraper paruje tytuł z linkiem po globalnym indeksie (`$(titleSelector).eq(index)` w
   `scripts/scrape.ts:36`). Selektor linku matchuje więcej elementów niż selektor tytułu (część
   `.contentLink` nie ma `h2`) → indeks się rozjeżdża i daje `title = ""`.
2. Konwencja pustej wartości: scraper zapisuje `""`, a kolumna `title` jest `string | null`. Oba
   konsumenty (`ArticlesTable.tsx:103`, `send.ts:58`) robią `title ?? article_url` — fallback działa
   tylko dla `null`, więc `""` renderuje się jako pusto.

Kierunek naprawy (do dopięcia w /10x-plan): scraper wyciąga tytuł względem konkretnego linku i
zapisuje `null` zamiast `""`; migracja backfill `UPDATE articles_seen SET title = NULL WHERE title = ''`;
UI/digest najpewniej bez zmian (fallback już jest).

Ścieżka 10x (lekka): /10x-new → /10x-plan → /10x-tdd → /verify.
Reguły: nic nie commituję/pushuję/deployuję bez wyraźnej zgody; backfill rusza produkcyjną bazę → osobne „tak”.
