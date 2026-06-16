# Mom Test Validation Plan

## Input Idea

Tablica „Kto nad czym pracuje" (Team Activity Digest) — read-only widok łączący zadania Jira *in-progress* z otwartymi PR-ami z Gita, keyowany osobą. Z `context/team/opportunity-map.md`. Walidujemy perspektywę **programisty (IC)** w **małym zespole (≤6 osób)**.

## Hypotheses

- **User/role**: Programista (IC) w zespole ≤6 osób; nie manager.
- **Friction**: Nie wie, kto teraz nad czym pracuje na poziomie zadań (Jira) i kodu (PR); informacje rozbite między Jirę, Git i Teams.
- **Current workaround**: Pytanie na Teams, ręczne klikanie po liście PR-ów i/lub boardzie Jiry, pamięć i nawyk.
- **Proposed solution**: Jeden read-only digest złączający dwa źródła (Jira in-progress + otwarte PR-y) per osoba.
- **Risky assumptions**:
  - Że ból IC to *złączenie Jira+Git*, a nie wąsko *latencja review PR-a* (= sygnał 3, sklasyfikowany jako Wait/no build).
  - Że istnieje konkretny moment w tygodniu, w którym IC zajrzałby do takiego widoku.
  - Że Jira board / lista PR-ów / filtr JQL są dziś niewystarczające (a nie tylko nieskonfigurowane).
  - Że przy zespole ≤6 osób problem jest realny, a nie rozwiązywalny jednym pytaniem na Teams.
- **Evidence already present**: Tylko deklaracje z mapy możliwości (3 sygnały). Brak twardych danych — żadnych metryk czasu, logów, zliczeń. Dowód jest cienki i to trzeba powiedzieć wprost.

## Critique

Mapa proponuje widok „kto nad czym pracuje" — to klasycznie narzędzie *managera* (składanie statusu zespołu). Walidujemy IC, którego ból bywa inny: kolizje na tym samym obszarze kodu, czekanie na review, „kogo zapytać". Największe ryzyko: zwalidować, że digest ładnie wygląda, podczas gdy prawdziwy ból IC to latencja review — czyli rzecz z kategorii *Wait / no build* (wystarczy Request review + CODEOWNERS + integracja Teams). Wywiad musi rozstrzygnąć, **który** ból jest realny, a nie potwierdzić digest z góry. Przy zespole ≤6 osób trzeba też uczciwie sprawdzić, czy to nie jest tarcie rozwiązywalne jednym pytaniem na Teams — koszt utrzymania narzędzia musi być niższy niż koszt bólu.

Mocny dowód „buduj": ludzie sami, bez podpowiedzi, opisują świeży przypadek, w którym musieli w głowie łączyć status zadania (Jira) z postępem kodu (PR). Słaby sygnał: nie potrafią wskazać świeżego przypadku ani kosztu, albo opisują wyłącznie „mój PR wisiał".

## Interview Guide

20–30 min, neutralne, o przeszłych zachowaniach. Przy ≤6 osobach przegadaj **wszystkich**.

**1. Rozgrzewka / kontekst**
- Opowiedz, nad czym pracowałeś w tym tygodniu — skąd wiedziałeś, czym się zająć?
- Jak często w ciągu dnia potrzebujesz wiedzieć, co robi ktoś inny z zespołu?

**2. Świeża historia**
- Opowiedz o ostatnim razie, kiedy nie wiedziałeś, kto pracuje nad czymś, co Ciebie dotyczyło. Co się wtedy stało?
  - *(follow-up)* Jak się o tym ostatecznie dowiedziałeś?
- Kiedy ostatnio okazało się, że Ty i ktoś inny ruszyliście ten sam obszar / plik? Jak to wyszło na jaw?

**3. Obecny workaround**
- Jak dziś dowiadujesz się, kto nad czym pracuje — krok po kroku? (pytasz na Teams? patrzysz w Jirę? w PR-y?)
- Gdy potrzebujesz statusu czyjegoś zadania, co konkretnie robisz?

**4. Koszt bólu**
- Ile czasu zeszło ostatnio, zanim dotarłeś do informacji, której potrzebowałeś?
- Co poszło nie tak, bo przyszła za późno? (rework, kolizja, czekanie na merge)

**5. Istniejące alternatywy**
- Zaglądasz czasem na listę otwartych PR-ów albo board w Jirze? Czego Ci tam brakuje?
- Gdy czekasz na review swojego PR-a — skąd wiesz, że ktoś go w ogóle zobaczył?
  - *(follow-up)* Co robisz, gdy wisi za długo?

**6. Sygnał decyzyjny**
- Gdyby istniał jeden widok „kto nad czym teraz pracuje" — w którym konkretnym momencie z tego tygodnia byś do niego zajrzał? *(brak takiego momentu = słaby sygnał)*
- Co musiałoby się zmienić, żebyś przestał pytać na Teams?

**7. Zamknięcie**
- Mogę podejrzeć (zanonimizowany) ostatni taki przypadek u Ciebie?
- Mogę wrócić z follow-upem za tydzień?

## Survey

Przy zespole ≤6 osób ankieta jest **opcjonalna** — rozmowa na żywo da więcej. Użyj tylko jako async-zastępnik dla kogoś, kto nie wyrobi się na spotkanie. Maks. 6 pytań.

1. *(screener)* Ile razy w ostatnim tygodniu potrzebowałeś sprawdzić, kto nad czym pracuje? `0 / 1–2 / 3–5 / codziennie` — *(0 → koniec ankiety)*
2. Jak ostatnio to sprawdziłeś? `Pytałem na Teams / Jira board / lista PR-ów / pamięć / inaczej`
3. Ile czasu Ci to zajęło ostatnio? `<2 min / 2–10 min / >10 min / nie udało się ustalić`
4. Czy w ostatnim miesiącu zdarzyła się kolizja (dwie osoby ten sam obszar) lub zbędna praca z braku widoczności? `Tak / Nie / Nie wiem` — jeśli tak, opisz krótko ostatni przypadek: ______
5. Czego brakuje Ci dziś w Jira boardzie / liście PR-ów? ______ *(otwarte)*
6. Kiedy ostatnio Twój PR czekał na review dłużej, niż powinien, bo nikt o nim nie wiedział? ______ *(otwarte; rozróżnia sygnał 3 od digestu)*

## Decision Criteria

Skala dopasowana do ~5–6 rozmów (nie procenty).

- **Proceed (buduj digest Jira+PR)**: co najmniej 3 z ~5–6 osób **bez podpowiedzi** opisują ten sam świeży workaround (pytanie na Teams / ręczne klikanie po dwóch miejscach) **oraz** wskazują konkretny moment z ostatniego tygodnia, w którym zajrzeliby do widoku łączącego zadanie z PR-em.
- **Narrow scope (zbuduj węziej)**: ból realny, ale skupiony na jednym źródle — głównie latencja review PR-a, nie złączenie Jira+Git. Wtedy celuj w sygnał 3 / sam widok PR, nie w pełny digest.
- **Do not build yet**: ludzie opisują to jako sporadyczną, drobną irytację, nie potrafią wskazać świeżego przypadku ani realnego kosztu (czasu, reworku, kolizji).
- **Try existing tool/process first**: ból realny, ale rozwiązują go istniejące mechanizmy — włączony *Request review* + `CODEOWNERS` + oficjalna integracja Git↔Teams, albo poprawnie skonfigurowany board / filtr JQL w Jirze. Przy ≤6 osobach to bardzo prawdopodobny wynik — sprawdź go zanim cokolwiek zbudujesz.
