// Simple local WebSocket game server for development
// - Listens on ws://localhost:9999
// - Path: /api/game/:id/websocket
// - Protocol mirrors the Worker Durable Object server: WELCOME + GAME_STATE_UPDATE

/* eslint-disable no-console */
const http = require('http');
const { WebSocketServer } = require('ws');

// ---- Game data (ported from src/board.ts) ----
const squaresData = [
  { name: 'GO', type: 'go', houses: 0, mortgaged: false },
  { name: 'Mediterranean Avenue', type: 'property', price: 60, rent: [2,10,30,90,160,250], group: 'brown', houseCost: 50, houses: 0, mortgaged: false },
  { name: 'Community Chest', type: 'community-chest', houses: 0, mortgaged: false },
  { name: 'Baltic Avenue', type: 'property', price: 60, rent: [4,20,60,180,320,450], group: 'brown', houseCost: 50, houses: 0, mortgaged: false },
  { name: 'Income Tax', type: 'tax', houses: 0, mortgaged: false },
  { name: 'Reading Railroad', type: 'railroad', price: 200, rent: [25,50,100,200], group: 'railroad', houses: 0, mortgaged: false },
  { name: 'Oriental Avenue', type: 'property', price: 100, rent: [6,30,90,270,400,550], group: 'light-blue', houseCost: 50, houses: 0, mortgaged: false },
  { name: 'Chance', type: 'chance', houses: 0, mortgaged: false },
  { name: 'Vermont Avenue', type: 'property', price: 100, rent: [6,30,90,270,400,550], group: 'light-blue', houseCost: 50, houses: 0, mortgaged: false },
  { name: 'Connecticut Avenue', type: 'property', price: 120, rent: [8,40,100,300,450,600], group: 'light-blue', houseCost: 50, houses: 0, mortgaged: false },
  { name: 'Just Visiting', type: 'jail', houses: 0, mortgaged: false },
  { name: 'St. Charles Place', type: 'property', price: 140, rent: [10,50,150,450,625,750], group: 'pink', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'Electric Company', type: 'utility', price: 150, group: 'utility', houses: 0, mortgaged: false },
  { name: 'States Avenue', type: 'property', price: 140, rent: [10,50,150,450,625,750], group: 'pink', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'Virginia Avenue', type: 'property', price: 160, rent: [12,60,180,500,700,900], group: 'pink', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'Pennsylvania Railroad', type: 'railroad', price: 200, rent: [25,50,100,200], group: 'railroad', houses: 0, mortgaged: false },
  { name: 'St. James Place', type: 'property', price: 180, rent: [14,70,200,550,750,950], group: 'orange', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'Community Chest', type: 'community-chest', houses: 0, mortgaged: false },
  { name: 'Tennessee Avenue', type: 'property', price: 180, rent: [14,70,200,550,750,950], group: 'orange', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'New York Avenue', type: 'property', price: 200, rent: [16,80,220,600,800,1000], group: 'orange', houseCost: 100, houses: 0, mortgaged: false },
  { name: 'Free Parking', type: 'free-parking', houses: 0, mortgaged: false },
  { name: 'Kentucky Avenue', type: 'property', price: 220, rent: [18,90,250,700,875,1050], group: 'red', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'Chance', type: 'chance', houses: 0, mortgaged: false },
  { name: 'Indiana Avenue', type: 'property', price: 220, rent: [18,90,250,700,875,1050], group: 'red', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'Illinois Avenue', type: 'property', price: 240, rent: [20,100,300,750,925,1100], group: 'red', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'B. & O. Railroad', type: 'railroad', price: 200, rent: [25,50,100,200], group: 'railroad', houses: 0, mortgaged: false },
  { name: 'Atlantic Avenue', type: 'property', price: 260, rent: [22,110,330,800,975,1150], group: 'yellow', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'Ventnor Avenue', type: 'property', price: 260, rent: [22,110,330,800,975,1150], group: 'yellow', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'Water Works', type: 'utility', price: 150, group: 'utility', houses: 0, mortgaged: false },
  { name: 'Marvin Gardens', type: 'property', price: 280, rent: [24,120,360,850,1025,1200], group: 'yellow', houseCost: 150, houses: 0, mortgaged: false },
  { name: 'Go To Jail', type: 'go-to-jail', houses: 0, mortgaged: false },
  { name: 'Pacific Avenue', type: 'property', price: 300, rent: [26,130,390,900,1100,1275], group: 'green', houseCost: 200, houses: 0, mortgaged: false },
  { name: 'North Carolina Avenue', type: 'property', price: 300, rent: [26,130,390,900,1100,1275], group: 'green', houseCost: 200, houses: 0, mortgaged: false },
  { name: 'Community Chest', type: 'community-chest', houses: 0, mortgaged: false },
  { name: 'Pennsylvania Avenue', type: 'property', price: 320, rent: [28,150,450,1000,1200,1400], group: 'green', houseCost: 200, houses: 0, mortgaged: false },
  { name: 'Short Line', type: 'railroad', price: 200, rent: [25,50,100,200], group: 'railroad', houses: 0, mortgaged: false },
  { name: 'Chance', type: 'chance', houses: 0, mortgaged: false },
  { name: 'Park Place', type: 'property', price: 350, rent: [35,175,500,1100,1300,1500], group: 'dark-blue', houseCost: 200, houses: 0, mortgaged: false },
  { name: 'Luxury Tax', type: 'tax', houses: 0, mortgaged: false },
  { name: 'Boardwalk', type: 'property', price: 400, rent: [50,200,600,1400,1700,2000], group: 'dark-blue', houseCost: 200, houses: 0, mortgaged: false },
];

// ---- Helpers ----
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function createInitialState(gameId) {
  const squares = squaresData.map((s, i) => ({ ...s, id: i }));
  const chanceDeck = Array.from({ length: 16 }, (_, i) => i);
  const communityDeck = Array.from({ length: 16 }, (_, i) => i);
  shuffle(chanceDeck);
  shuffle(communityDeck);
  return {
    gameId,
    players: [],
    squares,
    chanceDeck,
    communityChestDeck: communityDeck,
    currentPlayerId: 0,
    dice: [0, 0],
    doublesCount: 0,
    turn: 0,
    log: ['Game created! Waiting for players...'],
    chat: [],
  };
}

// ---- In-memory game registry ----
const games = new Map(); // id -> { state, sockets:Set, nextId }

function getGame(id) {
  if (!games.has(id)) {
    games.set(id, { state: createInitialState(id), sockets: new Set(), nextId: 0 });
  }
  return games.get(id);
}

function broadcast(game, message) {
  const payload = JSON.stringify(message);
  for (const ws of game.sockets) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(payload); } catch {}
    }
  }
}

function pay(game, player, amount, recipient) {
  player.money -= amount;
  if (recipient) recipient.money += amount;
  if (player.money < 0) {
    player.bankrupt = true;
    game.state.log.push(`${player.name} has gone bankrupt!`);
  }
}

function payRent(game, player, square) {
  const owner = game.state.players.find(p => p.id === square.ownerId);
  if (!owner) return;
  let rent = 0;
  if (square.type === 'property' && square.rent) rent = square.rent[square.houses];
  else if (square.type === 'railroad') {
    const owned = game.state.squares.filter(s => s.type === 'railroad' && s.ownerId === owner.id).length;
    rent = 25 * Math.pow(2, owned - 1);
  } else if (square.type === 'utility') {
    const owned = game.state.squares.filter(s => s.type === 'utility' && s.ownerId === owner.id).length;
    const diceRoll = game.state.dice[0] + game.state.dice[1];
    rent = diceRoll * (owned === 1 ? 4 : 10);
  }
  game.state.log.push(`${player.name} pays $${rent} rent to ${owner.name}.`);
  pay(game, player, rent, owner);
}

function goToJail(game, player) {
  player.position = 10;
  player.inJail = true;
  player.jailTurns = 0;
}

function nextTurn(game) {
  game.state.currentPlayerId = (game.state.currentPlayerId + 1) % game.state.players.length;
  game.state.turn++;
  game.state.log.push(`It's now ${game.state.players[game.state.currentPlayerId].name}'s turn.`);
}

function movePlayer(game, player, amount) {
  const old = player.position;
  player.position = (old + amount) % 40;
  if (player.position < old) {
    player.money += 200;
    game.state.log.push(`${player.name} passed GO and collected $200.`);
  }
  game.state.log.push(`${player.name} moved to ${game.state.squares[player.position].name}.`);
  const square = game.state.squares[player.position];
  switch (square.type) {
    case 'property':
    case 'railroad':
    case 'utility':
      if (square.ownerId === undefined) {
        game.state.log.push(`${player.name} can buy ${square.name} for $${square.price}.`);
      } else if (square.ownerId !== player.id && !square.mortgaged) {
        payRent(game, player, square);
      }
      break;
    case 'tax': {
      const taxAmount = square.name === 'Luxury Tax' ? 100 : 200;
      game.state.log.push(`${player.name} paid $${taxAmount} in taxes.`);
      pay(game, player, taxAmount);
      break;
    }
    case 'go-to-jail':
      game.state.log.push(`${player.name} is sent to jail!`);
      goToJail(game, player);
      nextTurn(game);
      break;
    default:
      break;
  }
}

function rollDice(game, player) {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  game.state.dice = [d1, d2];
  game.state.log.push(`${player.name} rolled a ${d1} and a ${d2}.`);
  const doubles = d1 === d2;
  if (player.inJail) {
    if (doubles) {
      player.inJail = false;
      game.state.log.push(`${player.name} rolled doubles and got out of jail!`);
      movePlayer(game, player, d1 + d2);
    } else {
      player.jailTurns = (player.jailTurns || 0) + 1;
      if (player.jailTurns >= 3) {
        pay(game, player, 50);
        player.inJail = false;
        game.state.log.push(`${player.name} paid $50 to get out of jail.`);
        movePlayer(game, player, d1 + d2);
      } else {
        game.state.log.push(`${player.name} remains in jail.`);
        nextTurn(game);
      }
    }
  } else {
    if (doubles) {
      game.state.doublesCount++;
      if (game.state.doublesCount >= 3) {
        game.state.log.push(`${player.name} rolled doubles three times and is sent to jail!`);
        goToJail(game, player);
        game.state.doublesCount = 0;
        nextTurn(game);
      } else {
        movePlayer(game, player, d1 + d2);
      }
    } else {
      game.state.doublesCount = 0;
      movePlayer(game, player, d1 + d2);
      nextTurn(game);
    }
  }
}

function buyProperty(game, player) {
  const square = game.state.squares[player.position];
  if ((square.type === 'property' || square.type === 'railroad' || square.type === 'utility') && square.ownerId === undefined) {
    const price = square.price || 0;
    if (player.money >= price) {
      pay(game, player, price);
      square.ownerId = player.id;
      game.state.log.push(`${player.name} bought ${square.name} for $${price}.`);
    } else {
      game.state.log.push(`${player.name} cannot afford to buy ${square.name}.`);
    }
  }
}

// ---- Server wiring ----
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Local WebSocket game server running. Connect via /api/game/:id/websocket');
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request, gameId) => {
  const game = getGame(gameId);
  game.sockets.add(ws);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.action === 'join') {
      const id = game.nextId++;
      const name = (msg.payload && msg.payload.name) || `Player ${id + 1}`;
      const color = (msg.payload && msg.payload.color) || 'blue';
      const p = { id, name, color, money: 1500, position: 0, inJail: false, jailTurns: 0, communityChestJailCard: false, chanceJailCard: false, isHuman: true, bankrupt: false };
      game.state.players.push(p);
      if (game.state.players.length === 1) game.state.currentPlayerId = p.id;
      ws.send(JSON.stringify({ type: 'WELCOME', payload: { id } }));
      try { ws._playerId = id; } catch {}
      game.state.log.push(`${name} has joined the game.`);
      broadcast(game, { type: 'GAME_STATE_UPDATE', payload: game.state });
      return;
    }

    const actorId = ws._playerId;
    const currentId = game.state.currentPlayerId;
    const player = game.state.players.find(p => p.id === actorId);
    if (!player) return;

    switch (msg.action) {
      case 'rollDice':
        if (actorId === currentId) rollDice(game, player);
        break;
      case 'buyProperty':
        if (actorId === currentId) buyProperty(game, player);
        break;
      case 'chat': {
        const text = String(msg?.payload?.text || '').trim();
        if (!text) break;
        const payload = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, playerId: player.id, name: player.name, text: text.slice(0,500), ts: Date.now() };
        game.state.chat.push(payload);
        if (game.state.chat.length > 200) game.state.chat = game.state.chat.slice(-200);
        broadcast(game, { type: 'CHAT_MESSAGE', payload });
        // simple local banter stub for dev if user types /ai or @ai
        if (/^\s*\/ai\b|@ai\b/i.test(text)) {
          const quips = [
            "Spicy take: buy the damn railroad.",
            "Risk it. Worst case, you sleep on Baltic.",
            "That roll was cursed — try again, champ.",
            "Money talks, mortgaged deeds mumble.",
            "I’d bid, but I’m just code with taste."
          ];
          const ai = { id: `${Date.now()}-ai`, name: 'Table AI', text: quips[Math.floor(Math.random()*quips.length)], ts: Date.now() };
          game.state.chat.push(ai);
          broadcast(game, { type: 'CHAT_MESSAGE', payload: ai });
        }
        return; // do not send full state broadcast here
      }
      default:
        break;
    }
    broadcast(game, { type: 'GAME_STATE_UPDATE', payload: game.state });
  });

  ws.on('close', () => {
    game.sockets.delete(ws);
  });
});

server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/api\/game\/([a-zA-Z0-9-]+)\/websocket$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const gameId = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, gameId);
    });
  } catch {
    socket.destroy();
  }
});

const PORT = Number(process.env.WS_PORT || process.env.PORT || 9999);
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set WS_PORT to a free port, e.g. WS_PORT=9901`);
  }
  throw err;
});
server.listen(PORT, () => {
  console.log(`Local WS server listening on ws://localhost:${PORT}`);
});
