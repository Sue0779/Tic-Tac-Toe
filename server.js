#!/usr/bin/env node
const PORT = process.env.PORT || 55555;
const express = require("express");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.use(express.static(path.join(__dirname, "public")));
let board = Array(9).fill(null);
let someoneWon = false;
let currentPlayer = null;
let gameStarted = false;
let hasO = false;
let hasX = false;
let ranking = {};
let chatHistory = [];
let aiMode = false;
let aiRole = null;
let aiUserStarts = true;
const lines = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
function ensureRanking(nick) { if(!ranking[nick]) { ranking[nick] = {games:0, wins:0, draws:0, losses:0}; } }
function updateHumanStats(winner) {
  if(!aiMode) {
    let xSock = null, oSock = null;
    io.sockets.sockets.forEach((sock) => { if(sock.symbol==="X") xSock=sock; if(sock.symbol==="O") oSock=sock; });
    if(xSock && oSock) {
      ensureRanking(xSock.nickname);
      ensureRanking(oSock.nickname);
      ranking[xSock.nickname].games++;
      ranking[oSock.nickname].games++;
      if(winner==="R"){ ranking[xSock.nickname].draws++; ranking[oSock.nickname].draws++; }
      else if(winner==="X"){ ranking[xSock.nickname].wins++; ranking[oSock.nickname].losses++; }
      else if(winner==="O"){ ranking[oSock.nickname].wins++; ranking[xSock.nickname].losses++; }
    }
  } else {
    let humanSock = null;
    io.sockets.sockets.forEach((sock) => { if(sock.symbol!=="viewer" && sock.symbol!==aiRole) humanSock = sock; });
    if(humanSock) { ensureRanking(humanSock.nickname); ranking[humanSock.nickname].games++; if(winner==="R"){ ranking[humanSock.nickname].draws++; } else if(winner===humanSock.symbol){ ranking[humanSock.nickname].wins++; } else { ranking[humanSock.nickname].losses++; } }
  }
}
function broadcastChat(msg) { chatHistory.push(msg); io.emit("chat", msg); }
function checkWinnerLine() {
  for(let [a,b,c] of lines) { if(board[a] && board[a]===board[b] && board[b]===board[c]) return {winner: board[a], line: [a,b,c]}; }
  if(!board.includes(null)) return {winner:"R", line:null}; return {winner:"", line:null};
}
function getGameStateForMove() { let result = checkWinnerLine(); return {board, currentPlayer, winner: result.winner, winningLine: null}; }
function getGameStateForCheck() { let result = checkWinnerLine(); return {board, currentPlayer, winner: result.winner, winningLine: result.line}; }
function resetBoard() { board = Array(9).fill(null); someoneWon = false; hasO = false; hasX = false; currentPlayer = null; gameStarted = false; aiMode = false; aiRole = null; io.sockets.sockets.forEach((sock)=>{ sock.symbol = "viewer"; }); }
function resetGameForAIMode() { board = Array(9).fill(null); someoneWon = false; currentPlayer = aiUserStarts ? (aiRole==="X"?"O":"X") : aiRole; gameStarted = true; io.emit("gameState", getGameStateForMove()); aiUserStarts = !aiUserStarts; if(currentPlayer===aiRole){ setTimeout(aiMove, 999); } }
function checkPhysicalPossibility() {
  const M = board.filter(v => v===null).length;
  let xMovesLeft, oMovesLeft;
  if(currentPlayer==="X"){ xMovesLeft = Math.ceil(M/2); oMovesLeft = Math.floor(M/2); }
  else { oMovesLeft = Math.ceil(M/2); xMovesLeft = Math.floor(M/2); }
  let possibleX = 0, possibleO = 0;
  for(let [a,b,c] of lines){
    const vals = [board[a], board[b], board[c]];
    if(!vals.includes("O")){ let emptyInLine = vals.filter(v=>v===null).length; if(emptyInLine<=xMovesLeft) possibleX++; }
    if(!vals.includes("X")){ let emptyInLine = vals.filter(v=>v===null).length; if(emptyInLine<=oMovesLeft) possibleO++; }
  }
  return {possibleX, possibleO};
}
function checkWinnerLineForMinimax(customBoard) {
  for(let [a,b,c] of lines){ if(customBoard[a] && customBoard[a]===customBoard[b] && customBoard[a]===customBoard[c]) return customBoard[a]; }
  if(!customBoard.includes(null)) return "R"; return null;
}
function evaluateBoard(customBoard, player, opponent) {
  let win = checkWinnerLineForMinimax(customBoard);
  if(win===player) return 10; else if(win===opponent) return -10; else if(win==="R") return 0; return null;
}
function minimax(customBoard, depth, isMaximizing, player, opponent) {
  let score = evaluateBoard(customBoard, player, opponent);
  if(score!==null) return score;
  if(isMaximizing){
    let bestScore = -Infinity;
    for(let i=0;i<9;i++){
      if(customBoard[i]===null){
        customBoard[i]=player;
        let s = minimax(customBoard, depth+1, false, player, opponent);
        customBoard[i]=null;
        bestScore = Math.max(bestScore, s);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for(let i=0;i<9;i++){
      if(customBoard[i]===null){
        customBoard[i]=opponent;
        let s = minimax(customBoard, depth+1, true, player, opponent);
        customBoard[i]=null;
        bestScore = Math.min(bestScore, s);
      }
    }
    return bestScore;
  }
}
function bestMove(customBoard, player, opponent) {
  let bestScore = -Infinity, move = -1;
  for(let i=0;i<9;i++){
    if(customBoard[i]===null){
      customBoard[i]=player;
      let s = minimax(customBoard,0,false,player,opponent);
      customBoard[i]=null;
      if(s>bestScore){ bestScore = s; move = i; }
    }
  }
  return move;
}
function aiMove() {
  let humanSymbol = (aiRole==="X") ? "O" : "X";
  let boardCopy = board.slice();
  let validMoves = boardCopy.map((v,i)=>(v===null)?i:-1).filter(x=>x>=0);
  if(validMoves.length===0){ io.emit("chat",{symbol:"", text:"No valid moves for AI."}); return; }
  let moveIndex;
  if(Math.random()<0.05){ moveIndex = validMoves[Math.floor(Math.random()*validMoves.length)]; }
  else { moveIndex = bestMove(boardCopy, aiRole, humanSymbol); }
  if(moveIndex===-1){ io.emit("chat",{symbol:"", text:"No valid moves for AI."}); return; }
  board[moveIndex] = aiRole;
  currentPlayer = (aiRole==="X") ? "O" : "X";
  let result = checkWinnerLine();
  if(result.winner===aiRole){
    setTimeout(() => {
      io.emit("checkedResult", getGameStateForCheck());
      updateHumanStats(result.winner);
      someoneWon = true;
      if(aiMode){ setTimeout(resetGameForAIMode,3000); }
      else { setTimeout(()=>{ resetBoard(); io.emit("gameState", getGameStateForMove()); },3000); }
    }, 999);
  } else if(result.winner==="R"){
    someoneWon = true;
  } else { io.emit("gameState", getGameStateForMove()); }
}
resetBoard();
io.on("connection", (socket) => {
  console.log("connection:", socket.id);
  socket.nickname = socket.id.slice(-4);
  socket.symbol = "viewer";
  socket.emit("youAre", "viewer");
  socket.emit("chatHistory", chatHistory);
  io.emit("gameState", getGameStateForMove());
  socket.on("move", (index) => {
    if(someoneWon) return;
    if(!gameStarted && socket.symbol==="viewer" && (!(hasO && hasX))){
      if(!hasO){ socket.symbol="O"; hasO=true; }
      else if(!hasX){ socket.symbol="X"; hasX=true; }
      socket.emit("youAre", socket.symbol);
      broadcastChat({symbol:"", text:`User ${socket.nickname} joined as player ${socket.symbol}`});
      if(hasO && hasX) gameStarted=true;
      if(!currentPlayer) currentPlayer = socket.symbol;
    }
    if(socket.symbol==="viewer") return;
    if(currentPlayer && socket.symbol!==currentPlayer) return;
    if(index<0 || index>8) return;
    if(board[index]!==null) return;
    board[index] = socket.symbol;
    if(!gameStarted && (hasO && hasX)) gameStarted=true;
    currentPlayer = (socket.symbol==="X") ? "O" : "X";
    let result = checkWinnerLine();
    if(result.winner==="X" || result.winner==="O"){ updateHumanStats(result.winner); someoneWon = true; }
    else if(result.winner==="R"){ updateHumanStats("R"); someoneWon = true; }
    io.emit("gameState", getGameStateForMove());
    if(aiMode && currentPlayer===aiRole && !someoneWon){ setTimeout(aiMove,999); }
  });
  socket.on("check", () => {
    let result = checkWinnerLine();
    if(result.winner==="X" || result.winner==="O"){
      io.emit("checkedResult", getGameStateForCheck());
      if(aiMode){ setTimeout(resetGameForAIMode,3000); }
      else { updateHumanStats(result.winner); setTimeout(()=>{ resetBoard(); io.emit("gameState", getGameStateForMove()); },3000); }
    } else if(result.winner==="R"){
      io.emit("checkedResult", getGameStateForCheck());
      if(aiMode){ setTimeout(resetGameForAIMode,500); }
      else { updateHumanStats("R"); setTimeout(()=>{ resetBoard(); io.emit("gameState", getGameStateForMove()); },500); }
    } else { return; }
  });
  socket.on("reset", () => { resetBoard(); io.emit("gameState", getGameStateForMove()); });
  socket.on("chat", (txt) => {
    let trimmed = txt.trim();
    if(trimmed === "/stop"){
      aiMode = false; aiRole = null;
      broadcastChat({symbol:"", text:"AI mode deactivated."});
      resetBoard();
      io.emit("gameState", getGameStateForMove());
      return;
    }
    if(trimmed.startsWith("/")){
      if(trimmed === "/reset" || trimmed.startsWith("/o") || trimmed.startsWith("/x") || trimmed.startsWith("/n") || trimmed === "/rank" || trimmed === "/ai" || trimmed === "/stop" || trimmed === "/check" || trimmed === "/help"){
      } else { socket.emit("chat",{symbol:"", text:"Error: Unknown command"}); return; }
    }
    if(trimmed === "/help"){
      let helpText = "";
      helpText += "/help - Show command list.\n";
      helpText += "/reset - Reset game (human vs human).\n";
      helpText += "/o [nick] - Choose role O before game starts.\n";
      helpText += "/x [nick] - Choose role X before game starts.\n";
      helpText += "/n - Online users / change nick.\n";
      helpText += "/rank - Show ranking (human vs human only).\n";
      helpText += "/ai - Activate AI mode (results for human are counted).\n";
      helpText += "/stop - Deactivate AI mode.\n";
      helpText += "/check - Check game state (end match).\n";
      socket.emit("chat",{symbol:"", text:helpText});
      return;
    }
    if(trimmed === "/reset"){
      resetBoard();
      broadcastChat({symbol:"", text:`Game was reset by ${socket.nickname}`});
      io.emit("gameState", getGameStateForMove());
    } else if(trimmed.startsWith("/o")){
      if(gameStarted){ socket.emit("chat",{symbol:"", text:"Game already started, cannot change role."}); return; }
      let newNick = trimmed.slice(2).trim();
      if(newNick.length>0 && socket.nickname.toLowerCase()!==newNick.toLowerCase()){ socket.nickname = newNick; }
      io.sockets.sockets.forEach((sock)=>{
        if(sock.symbol==="O"){ sock.symbol="viewer"; hasO=false; broadcastChat({symbol:"", text:`User ${sock.nickname} lost role O`}); }
      });
      socket.symbol="O"; hasO=true; socket.emit("youAre",socket.symbol);
      if(!currentPlayer) currentPlayer=socket.symbol;
      broadcastChat({symbol:"", text:`User ${socket.nickname} joined as player O`});
    } else if(trimmed.startsWith("/x")){
      if(gameStarted){ socket.emit("chat",{symbol:"", text:"Game already started, cannot change role."}); return; }
      let newNick = trimmed.slice(2).trim();
      if(newNick.length>0 && socket.nickname.toLowerCase()!==newNick.toLowerCase()){ socket.nickname=newNick; }
      io.sockets.sockets.forEach((sock)=>{
        if(sock.symbol==="X"){ sock.symbol="viewer"; hasX=false; broadcastChat({symbol:"", text:`User ${sock.nickname} lost role X`}); }
      });
      socket.symbol="X"; hasX=true; socket.emit("youAre",socket.symbol);
      if(!currentPlayer) currentPlayer=socket.symbol;
      broadcastChat({symbol:"", text:`User ${socket.nickname} joined as player X`});
    } else if(trimmed.startsWith("/n")){
      if(trimmed === "/n"){
        let userList = [];
        io.sockets.sockets.forEach((sock)=>{
          if(sock.symbol==="X" || sock.symbol==="O"){ userList.push(`${sock.nickname} (${sock.symbol})`); }
          else { userList.push(sock.nickname); }
        });
        socket.emit("chat",{symbol:"", text:`Online users: ${userList.join(', ')}`});
      } else {
        let newNick = trimmed.slice(3).trim();
        if(newNick.length>0){ let oldNick = socket.nickname; socket.nickname=newNick; broadcastChat({symbol:"", text:`${oldNick} is now ${socket.nickname}`}); }
      }
    } else if(trimmed === "/rank"){
      let output = "";
      for(let nick in ranking){ output += `${nick}: Games: ${ranking[nick].games}, Wins: ${ranking[nick].wins}, Draws: ${ranking[nick].draws}, Losses: ${ranking[nick].losses}<br>`; }
      socket.emit("chat",{symbol:"", text: output || "No ranking data available yet."});
    } else if(trimmed === "/ai"){
      aiMode = true;
      if(board.every(cell => cell===null)){
        if(socket.symbol==="viewer"){
          socket.symbol="X"; hasX=true; socket.emit("youAre",socket.symbol);
          broadcastChat({symbol:"", text:`User ${socket.nickname} joined as player X`});
        }
        aiRole = "O"; hasO=true;
        broadcastChat({symbol:"", text:`AI mode activated. You play as ${socket.nickname} vs AI (${aiRole}).`});
        currentPlayer = aiRole; gameStarted = true;
        setTimeout(aiMove,999);
      } else {
        if(socket.symbol!=="viewer"){
          let desiredAIrole = (socket.symbol==="X") ? "O" : "X";
          io.sockets.sockets.forEach((sock)=>{
            if(sock.id!==socket.id && sock.symbol===desiredAIrole){
              sock.symbol="viewer";
              if(desiredAIrole==="X"){ hasX=false; } else { hasO=false; }
              broadcastChat({symbol:"", text:`User ${sock.nickname} lost role ${desiredAIrole}`});
            }
          });
          aiRole = desiredAIrole;
          if(aiRole==="X"){ hasX=true; } else { hasO=true; }
          broadcastChat({symbol:"", text:`AI mode activated. You play as ${socket.nickname} vs AI (${aiRole}).`});
          if(currentPlayer===aiRole){ setTimeout(aiMove,999); }
          else { socket.emit("chat",{symbol:"", text:"It's not AI's turn."}); }
        } else { socket.emit("chat",{symbol:"", text:"You must have a role to play against AI."}); }
      }
    } else if(trimmed === "/check"){
      socket.emit("check");
    } else {
      let displayName = socket.nickname;
      if(socket.symbol==="X" || socket.symbol==="O"){ displayName += ` (${socket.symbol})`; }
      broadcastChat({symbol: displayName, text: txt});
    }
  });
  socket.on("disconnect", () => { broadcastChat({symbol:"", text:`User ${socket.nickname} left the game`}); });
});
server.listen(PORT, "0.0.0.0", () => { console.log("Server started on port=", PORT); });
