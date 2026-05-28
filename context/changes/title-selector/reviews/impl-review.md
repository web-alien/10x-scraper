<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Osobny selektor tytułu w sources.json

- **Plan**: C:\Users\tjane\.claude\plans\chcia-bym-wprowadzi-kolejn-zmian-polished-bumblebee.md
- **Scope**: pełna zmiana (brak formalnego change-id — zaimplementowano bez /10x-new)
- **Date**: 2026-05-28
- **Verdict**: APPROVED
- **Findings**: 0 critical  2 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Pusty tytuł bez ostrzeżenia gdy selektor nie trafia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/scrape.ts:69–71
- **Detail**: Jeśli `source.selectors.title` jest zdefiniowany ale selektor CSS nie trafi w żaden element (literówka, zmiana struktury HTML), każdy artykuł zostanie zapisany z `title: ""` bez żadnego sygnału błędu. `lead` ma identyczne zachowanie — to odziedziczony wzorzec, nie regresja. Jednak pusty tytuł jest bardziej mylący niż pusty lead.
- **Fix**: Dodaj guard przed `articles.push` który loguje ostrzeżenie (lub skip) gdy skonfigurowany selektor tytułu zwraca pusty string.
- **Decision**: FIXED (console.warn dla title i lead gdy skonfigurowany selektor zwraca pusty string)

### F2 — Założenie o kolejności i liczbie elementów (.eq(index))

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: scripts/scrape.ts:69–71 (i analogicznie lead:85)
- **Detail**: `.eq(index)` zakłada, że `$(source.selectors.title)` zwraca elementy w tej samej kolejności i liczbie co `$(source.selectors.articleLink)`. Jeśli na stronie brakuje tytułu dla jednego artykułu lub tytuły są w kontenerze który renderuje inne węzły, wszystkie kolejne tytuły/leady będą przesunięte. Zmiana nie pogarsza sytuacji (lead ma ten sam problem), ale title rozszerza obszar podatności na przesunięcie.
- **Fix A ⭐ Recommended**: Udokumentować założenie w `sources.json` (README lub pole `notes`).
  - Strength: Minimalna zmiana; zero ryzyka regresji.
  - Tradeoff: Założenie nadal istnieje w kodzie.
  - Confidence: HIGH — to ograniczenie projektowe, nie błąd.
  - Blind spot: Parkiet może zmienić strukturę HTML w przyszłości.
- **Fix B**: Zmienić na `$(el).closest(".content--block").find(titleSel)` żeby selektor działał w kontekście bieżącego elementu linku.
  - Strength: Eliminuje problem przesunięcia.
  - Tradeoff: Wymaga zbadania struktury DOM każdego źródła.
  - Confidence: MED — zależy od HTML Parkietu, nie zweryfikowano.
  - Blind spot: Nie sprawdzono faktycznej struktury DOM.
- **Decision**: SKIPPED — .eq(index) działa dla Parkietu, Fix B wymaga weryfikacji DOM której nie przeprowadzono

### F3 — Pattern consistency z lead: PASS

- **Severity**: OBSERVATION
- **Location**: scripts/scrape.ts:69-71 vs 82-83
- **Detail**: Nowy `title` używa dokładnie tego samego wzorca `.eq(index).text().trim()` co istniejący `lead`. Spójność pełna.
- **Decision**: SKIPPED

### F4 — Bezpieczeństwo: brak zagrożeń

- **Severity**: OBSERVATION
- **Location**: scripts/scrape.ts:7–17, 69–71
- **Detail**: Selektor CSS z `sources.json` przechodzi przez Zod (`z.string()`) i jest przekazywany do Cheerio — brak vectora SQL/shell injection.
- **Decision**: SKIPPED
