Tic Tac Toe (3×3) z obsługą czatu
==================================

Opis
----
Projekt implementuje prostą grę w kółko i krzyżyk (3×3) z wykorzystaniem Node.js oraz Socket.io. Gra umożliwia rozgrywkę wieloosobową oraz posiada wbudowany czat, dzięki któremu gracze mogą się komunikować i korzystać z dodatkowych komend.

Funkcjonalności
---------------
1. Plansza 3×3 – gracze stawiają "X" lub "O" poprzez kliknięcie w pola planszy.
2. Nadawanie ról – każdy użytkownik łączy się jako obserwator (viewer) i otrzymuje domyślny, uproszczony nick (ostatnie 4 znaki identyfikatora socketu):
   - Automatyczne przydzielanie roli: Jeśli użytkownik, będący obserwatorem, kliknie w planszę, a przynajmniej jedna rola (X lub O) jest wolna, zostaje mu przydzielona ta rola.
   - Ręczne nadawanie ról: Komendy "/o [nick]" oraz "/x [nick]" umożliwiają przydzielenie roli "O" lub "X". Jeśli ktoś już posiada daną rolę, nowe żądanie przejmuje tę rolę, a poprzedni gracz staje się obserwatorem.
   - Nadawanie ról (zarówno automatyczne, jak i ręczne) jest możliwe tylko przed rozpoczęciem gry (plansza jest pusta). Po wykonaniu pierwszego ruchu, dalsze zmiany ról są blokowane.
3. Rozgrywka – gracze wykonują ruchy na planszy zgodnie z turą (serwer przełącza tury z X na O i odwrotnie). Po każdym ruchu sprawdzany jest wynik rundy (zwycięstwo lub remis).
4. Komendy czatu:
   - "/reset" – resetuje grę (czyści planszę, usuwa role – wszyscy stają się obserwatorami).
   - "/o [nick]" – przydziela rolę O użytkownikowi (opcjonalnie zmienia też nick).
   - "/x [nick]" – przydziela rolę X użytkownikowi.
   - "/n [nick]" – zmienia nick bieżącego użytkownika; broadcastowane jest zdanie: "OLD_NICK is now NEW_NICK".
   - "/u" – wysyła prywatnie listę aktualnie zalogowanych użytkowników (z rolami, jeśli są).
   - Inne komendy zaczynające się od "/" generują komunikat błędu "Error: Unknown command".
   
Wymagania
----------
- Node.js (wersja 16+)
- Socket.io (w ramach projektu)
- Przeglądarka internetowa do wyświetlania front-endu

Instalacja i Uruchomienie
-------------------------
1. Sklonuj repozytorium:
   git clone [https://github.com/Sue0779/Tic-Tac-Toe.git]
2. Przejdź do katalogu projektu i zainstaluj zależności:
   cd tic-tac-toe
   npm install
3. Uruchom serwer:
   node server.js
4. Otwórz przeglądarkę i przejdź na adres:
   http://localhost:46219

Struktura Projektu
------------------
- server.js – główny plik serwera Node.js, zawierający logikę gry i obsługę Socket.io.
- public/ – katalog z plikami statycznymi (np. index.html), które są serwowane użytkownikom.

Jak Grać
--------
1. Po uruchomieniu serwera i otwarciu strony, każdy użytkownik dołącza jako obserwator (viewer) z domyślnym nickiem (ostatnie 4 znaki socket.id).
2. Aby dołączyć do gry, użytkownik może:
   - Kliknąć w wolne pole na planszy, co automatycznie przydzieli mu wolną rolę (X lub O) – o ile gra się jeszcze nie rozpoczęła.
   - Lub użyć komend "/o [nick]" lub "/x [nick]" w oknie czatu, aby ręcznie przydzielić sobie rolę (przy czym jeśli ktoś już miał tę rolę, nowa komenda ją przejmie).
3. Po przydzieleniu ról gracze wykonują ruchy na planszy naprzemiennie.
4. Czat dostępny jest poniżej planszy – wszystkie wiadomości są wyświetlane z nickiem użytkownika (dla graczy dodatkowo z symbolem, np. "Tomek (X)").

Licencja
--------
Projekt udostępniany jest na licencji MIT.
