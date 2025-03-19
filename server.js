#!/usr/bin/env node
/**
 * Tic Tac Toe (3x3) – Finalna wersja
 *
 * Funkcjonalności:
 *  - Gra działa na Node.js + Socket.io.
 *  - Użytkownicy mają domyślnie uproszczone nicki (ostatnie 4 znaki socket.id).
 *  - Nadawanie ról (X lub O) jest możliwe tylko wtedy, gdy nie ma kompletnego zestawu graczy.
 *    • Auto-nadanie roli przez kliknięcie: Jeśli użytkownik jest obserwatorem
 *      i przynajmniej jedna rola (X lub O) jest wolna – przydzielamy tę rolę.
 *    • Ręczne nadawanie ról (/o [nick] dla O, /x [nick] dla X) przejmuje daną rolę,
 *      nawet jeśli ktoś już ją miał (wtedy poprzedni gracz traci ją).
 *  - Po rozpoczęciu gry (pierwszy ruch wykonany) dalsze nadawanie ról (auto lub ręczne)
 *    jest blokowane, gdy obie role są przydzielone.
 *  - Pozostałe komendy: /n nick (zmiana nicku), /u (lista online), /reset (reset gry).
 *  - Jeśli użytkownik wpisze dowolne polecenie zaczynające się od "/" które nie jest rozpoznawane,
 *    otrzymuje błąd.
 *
 * Uruchomienie: node server.js
 */

const PORT = 46219;
const express = require("express");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serwowanie plików statycznych z katalogu "public"
app.use(express.static(path.join(__dirname, "public")));

/** STAN GRY */
let board = Array(9).fill(null);
let someoneWon = false;
let currentPlayer = null; // ustalany po wykonaniu ruchu (pierwszy ruch)
let gameStarted = false;  // gra rozpoczyna się po pierwszym ruchu

// Flagi przydziału ról – działają przed uzyskaniem kompletnego zestawu
let hasO = false;
let hasX = false;

// Wzorce zwycięstwa
const lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

// Funkcja sprawdzająca zwycięstwo
function checkWinnerLine() {
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (!board.includes(null)) {
    return { winner: "R", line: null };
  }
  return { winner: "", line: null };
}

/**
 * resetBoard:
 *  - Czyści planszę,
 *  - Resetuje flagi przydziału ról, stan rundy oraz gameStarted,
 *  - Ustawia wszystkich podłączonych użytkowników jako "viewer".
 */
function resetBoard() {
  console.log("RESET rundy -> plansza wyczyszczona, nikt nie ma X/O");
  board = Array(9).fill(null);
  someoneWon = false;
  hasO = false;
  hasX = false;
  currentPlayer = null;
  gameStarted = false;
  io.sockets.sockets.forEach((sock) => {
    sock.symbol = "viewer";
  });
}

// Funkcja zwracająca aktualny stan gry
function getGameState() {
  return { board, currentPlayer };
}

// Inicjujemy rundę
resetBoard();

io.on("connection", (socket) => {
  console.log("connection:", socket.id);
  
  // Domyślny nick: ostatnie 4 znaki socket.id
  socket.nickname = socket.id.slice(-4);
  socket.symbol = "viewer";
  socket.emit("youAre", "viewer");
  
  io.emit("chat", { symbol: "", text: `User ${socket.nickname} joined the game` });
  io.emit("gameState", getGameState());
  
  // Obsługa ruchu – automatyczne przydzielenie roli przez kliknięcie, gdy rola jest wolna
  socket.on("move", (index) => {
    if (someoneWon) return;
    
    // Auto-nadanie roli tylko, jeśli nie ma kompletnego zestawu graczy
    if (socket.symbol === "viewer" && (!(hasO && hasX))) {
      if (!hasO) {
        socket.symbol = "O";
        hasO = true;
      } else if (!hasX) {
        socket.symbol = "X";
        hasX = true;
      }
      socket.emit("youAre", socket.symbol);
      io.emit("chat", { symbol: "", text: `User ${socket.nickname} joined as player ${socket.symbol}` });
      if (!currentPlayer) currentPlayer = socket.symbol;
    }
    
    if (socket.symbol === "viewer") return;
    // Jeśli gra już się rozpoczęła i ruch nie należy do aktualnego gracza
    if (currentPlayer && socket.symbol !== currentPlayer) return;
    if (index < 0 || index > 8) return;
    if (board[index] !== null) return;
    
    board[index] = socket.symbol;
    if (!gameStarted) gameStarted = true;
    currentPlayer = (socket.symbol === "X") ? "O" : "X";
    const { winner } = checkWinnerLine();
    if (winner === "X" || winner === "O" || winner === "R") {
      someoneWon = true;
    }
    io.emit("gameState", getGameState());
  });
  
  // Obsługa "check" – sprawdzenie wyniku rundy
  socket.on("check", () => {
    const { winner, line } = checkWinnerLine();
    if (winner === "X" || winner === "O") {
      io.emit("chat", { symbol: "", text: `Player ${winner} wins!` });
    } else if (winner === "R") {
      io.emit("chat", { symbol: "", text: `Draw!` });
    }
    io.emit("checkedResult", { board, currentPlayer, winner, winningLine: line });
  });
  
  // Komenda /reset – reset gry
  socket.on("reset", () => {
    resetBoard();
    io.emit("gameState", getGameState());
  });
  
  // Obsługa wiadomości czatu
  socket.on("chat", (txt) => {
    let trimmed = txt.trim();
    
    // Jeśli wiadomość zaczyna się od "/" ale nie jest rozpoznawanym poleceniem, zwróć błąd
    if (trimmed.startsWith("/")) {
      if (
        trimmed === "/reset" ||
        trimmed.startsWith("/o") ||
        trimmed.startsWith("/x") ||
        trimmed.startsWith("/n ") ||
        trimmed === "/u"
      ) {
        // Polecenia rozpoznane – obsłużone poniżej
      } else {
        socket.emit("chat", { symbol: "", text: "Error: Unknown command" });
        return;
      }
    }
    
    if (trimmed === "/reset") {
      console.log(`Game reset on /reset command by ${socket.nickname}`);
      resetBoard();
      io.emit("chat", { symbol: "", text: `Game was reset by user ${socket.nickname}` });
      io.emit("gameState", getGameState());
    }
    // Ręczne nadanie roli – /o [nick] dla roli O
    else if (trimmed.startsWith("/o")) {
      if (gameStarted) {
        socket.emit("chat", { symbol: "", text: "Game already started, cannot change role." });
        return;
      }
      let newNick = trimmed.slice(2).trim();
      if (newNick.length > 0 && socket.nickname.toLowerCase() !== newNick.toLowerCase()) {
        socket.nickname = newNick;
      }
      // Przejmujemy rolę O – przejmujemy od poprzedniego gracza, jeśli taka była
      io.sockets.sockets.forEach((sock) => {
        if (sock.symbol === "O") {
          sock.symbol = "viewer";
          hasO = false;
          io.emit("chat", { symbol: "", text: `User ${sock.nickname} lost role O` });
        }
      });
      socket.symbol = "O";
      hasO = true;
      socket.emit("youAre", socket.symbol);
      io.emit("chat", { symbol: "", text: `User ${socket.nickname} joined as player O` });
      if (!currentPlayer) currentPlayer = socket.symbol;
    }
    // /x [nick] – ręczne nadanie roli X
    else if (trimmed.startsWith("/x")) {
      if (gameStarted) {
        socket.emit("chat", { symbol: "", text: "Game already started, cannot change role." });
        return;
      }
      let newNick = trimmed.slice(2).trim();
      if (newNick.length > 0 && socket.nickname.toLowerCase() !== newNick.toLowerCase()) {
        socket.nickname = newNick;
      }
      io.sockets.sockets.forEach((sock) => {
        if (sock.symbol === "X") {
          sock.symbol = "viewer";
          hasX = false;
          io.emit("chat", { symbol: "", text: `User ${sock.nickname} lost role X` });
        }
      });
      socket.symbol = "X";
      hasX = true;
      socket.emit("youAre", socket.symbol);
      io.emit("chat", { symbol: "", text: `User ${socket.nickname} joined as player X` });
      if (!currentPlayer) currentPlayer = socket.symbol;
    }
    // /n [nick] – zmiana nicku
    else if (trimmed.startsWith("/n ")) {
      let newNick = trimmed.slice(3).trim();
      if (newNick.length > 0) {
        let oldNick = socket.nickname;
        socket.nickname = newNick;
        io.emit("chat", { symbol: "", text: `${oldNick} is now ${socket.nickname}` });
      }
    }
    // /u – lista online użytkowników (prywatnie)
    else if (trimmed === "/u") {
      let userList = [];
      io.sockets.sockets.forEach((sock) => {
        if (sock.symbol === "X" || sock.symbol === "O") {
          userList.push(`${sock.nickname} (${sock.symbol})`);
        } else {
          userList.push(sock.nickname);
        }
      });
      socket.emit("chat", { symbol: "", text: `Online users: ${userList.join(', ')}` });
    }
    // Zwykła wiadomość czatu
    else {
      let displayName = socket.nickname;
      if (socket.symbol === "X" || socket.symbol === "O") {
        displayName += ` (${socket.symbol})`;
      }
      io.emit("chat", { symbol: displayName, text: txt });
    }
  });
  
  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id, "symbol was", socket.symbol);
    io.emit("chat", { symbol: "", text: `User ${socket.nickname} left the game` });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server started on port=", PORT);
});
