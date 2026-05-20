## 10xScraper - MVP

### Główny problem
Przeglądanie stron internetowych w celu przeczytania najnowszych artykułów jest czasochłonnye, w związku z tym chcę stworzyć aplikację, która przegląda zadane strony i poprzez scraping HTML sprawdza strony i pobiera tytuły oraz treści najnowszych artykułów, które następnie za pomocą LLM zmienia w krótkie podsumowanie. Następnie raz dziennie wysyła zasubskrybowanych użytkownikom listę najnowszych artykułów na maile.

### Najmniejszy zestaw funkcjonalności
- Podanie adresów URL serwisów do sprawdzenia oraz zestawu tagów jako identyfikatorów i klass, dzięki którym skrypt będzie wiedział, który element na stronie to tytuł, a który to lead lub link do pełnej treści artykułu
- Panel, w którym po zalogowaniu administrator jest w stanie dodać, edytować, usuwać adresy serwisów, które mają być sprawdzane
- Sprawdzenie, który artykuł z danej strony jest ostatni, aby nie dublować pobierania kolejnych artykułów
- edytowalna lista subskrybentów mailingu
- przyciski służące do uruchomienia scrapingu i wysyłania maili

### Co NIE wchodzi w zakres MVP
- możliwość samodzielnego zapisywania się i wypisywania się z listy mailingowej subskrybentów
- dodawanie tagów do artykułów
- dodawanie grafik do wysyłanych artykuów
- dodawanie załączników do wysyłanych artykułów
- możliwość wyboru serwisów z których użytkownik chce dostawać informacje

### Kryteria sukcesu
- Poprawne pobieranie 90% artykułów ze strony
- poprawne wysłanie mailingu do subskrybentów
- działające elementy edycyjne w panelu admina