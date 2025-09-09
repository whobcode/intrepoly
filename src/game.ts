import { GameState, WebSocketMessage, Player, Square, Card } from './types';
import { squares as squareData, chanceCards as chanceCardData, communityChestCards as communityChestCardData } from './board';

// Helper function to shuffle an array
function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export class Game implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[] = [];
  gameState?: GameState;
  playerIds: Map<WebSocket, number> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async initialize(): Promise<void> {
    this.gameState = await this.state.storage.get<GameState>('gameState');
    if (!this.gameState) {
      console.log('Initializing new game state...');

      const squares = squareData.map((s, i) => ({ ...s, id: i }));

      const chanceDeck = Array.from({ length: chanceCardData.length }, (_, i) => i);
      shuffle(chanceDeck);

      const communityChestDeck = Array.from({ length: communityChestCardData.length }, (_, i) => i);
      shuffle(communityChestDeck);

      this.gameState = {
        gameId: this.state.id.toString(),
        players: [],
        squares: squares,
        chanceDeck: chanceDeck,
        communityChestDeck: communityChestDeck,
        currentPlayerId: 0,
        dice: [0, 0],
        doublesCount: 0,
        turn: 0,
        log: ['Game created! Waiting for players...'],
      };
    }
  }

  async fetch(request: Request) {
    if (!this.gameState) {
      await this.initialize();
    }

    const url = new URL(request.url);
    if (url.pathname.endsWith('/websocket')) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const { 0: client, 1: server } = webSocketPair;

      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response(JSON.stringify(this.gameState, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  handleSession(ws: WebSocket) {
    this.sessions.push(ws);

    ws.addEventListener('message', async (msg) => {
      try {
        const message: WebSocketMessage = JSON.parse(msg.data as string);

        if (message.action === 'join') {
            await this.addPlayer(ws, message.payload.name, message.payload.color);
        } else {
            const playerId = this.playerIds.get(ws);
            if (playerId === undefined) {
                ws.send(JSON.stringify({ error: 'Player not joined.' }));
                return;
            }
            await this.dispatchAction(playerId, message);
        }

      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    const closeOrErrorHandler = () => {
      const playerId = this.playerIds.get(ws);
      if (playerId !== undefined) {
          // Handle player disconnect logic if needed (e.g., mark as inactive)
          console.log(`Player ${playerId} disconnected.`);
          this.playerIds.delete(ws);
      }
      this.sessions = this.sessions.filter((session) => session !== ws);
    };

    ws.addEventListener('close', closeOrErrorHandler);
    ws.addEventListener('error', closeOrErrorHandler);

  }

  async addPlayer(ws: WebSocket, name: string, color: string): Promise<void> {
    if (!this.gameState) {
        return;
    }

    if (this.gameState.players.length >= 8) {
        ws.send(JSON.stringify({ error: 'Game is full.'}));
        return;
    }

    const newPlayer: Player = {
        id: this.gameState.players.length,
        name: name || `Player ${this.gameState.players.length + 1}`,
        color: color || 'blue',
        money: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        communityChestJailCard: false,
        chanceJailCard: false,
        isHuman: true,
        bankrupt: false,
    };

    this.gameState.players.push(newPlayer);
    this.playerIds.set(ws, newPlayer.id);

    // Send a welcome message to the new player with their ID
    ws.send(JSON.stringify({ type: 'WELCOME', payload: { id: newPlayer.id } }));

    // If this is the first player, make them the current player
    if (this.gameState.players.length === 1) {
        this.gameState.currentPlayerId = newPlayer.id;
    }

    this.gameState.log.push(`${newPlayer.name} has joined the game.`);

    await this.updateAndBroadcast();
  }

  async updateAndBroadcast(): Promise<void> {
      if (!this.gameState) return;
      await this.state.storage.put('gameState', this.gameState);
      this.broadcast({ type: 'GAME_STATE_UPDATE', payload: this.gameState });
  }

  broadcast(message: any) {
    const serializedMessage = JSON.stringify(message);
    this.sessions.forEach((session) => {
      try {
        if (session.readyState === WebSocket.OPEN) {
            session.send(serializedMessage);
        }
      } catch (err) {
        console.error('Error broadcasting message to session:', err);
        // Clean up broken session
        const playerId = this.playerIds.get(session);
        if (playerId !== undefined) {
            this.playerIds.delete(session);
        }
        this.sessions = this.sessions.filter(s => s !== session);
      }
    });
  }

  async dispatchAction(playerId: number, message: WebSocketMessage) {
    if (!this.gameState || this.gameState.currentPlayerId !== playerId) {
      // It's not this player's turn, or game state is missing
      return;
    }

    switch (message.action) {
      case 'rollDice':
        await this.rollDice(playerId);
        break;
      case 'buyProperty':
        await this.buyProperty(playerId);
        break;
      // Add other cases like 'endTurn', etc.
      default:
        console.log(`Unknown action: ${message.action}`);
    }

    await this.updateAndBroadcast();
  }

  async rollDice(playerId: number) {
    if (!this.gameState) return;

    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    this.gameState.dice = [die1, die2];
    this.gameState.log.push(`${player.name} rolled a ${die1} and a ${die2}.`);

    const isDoubles = die1 === die2;

    if (player.inJail) {
        if (isDoubles) {
            player.inJail = false;
            this.gameState.log.push(`${player.name} rolled doubles and got out of jail!`);
            await this.movePlayer(playerId, die1 + die2);
        } else {
            player.jailTurns++;
            if (player.jailTurns >= 3) {
                // Force payment to get out
                player.money -= 50;
                player.inJail = false;
                this.gameState.log.push(`${player.name} paid $50 to get out of jail.`);
                await this.movePlayer(playerId, die1 + die2);
            } else {
                this.gameState.log.push(`${player.name} remains in jail.`);
                await this.nextTurn();
            }
        }
    } else { // Not in jail
        if (isDoubles) {
            this.gameState.doublesCount++;
            if (this.gameState.doublesCount >= 3) {
                this.gameState.log.push(`${player.name} rolled doubles three times and is sent to jail!`);
                this.goToJail(playerId);
                this.gameState.doublesCount = 0;
                await this.nextTurn();
            } else {
                await this.movePlayer(playerId, die1 + die2);
            }
        } else {
            this.gameState.doublesCount = 0;
            await this.movePlayer(playerId, die1 + die2);
            await this.nextTurn();
        }
    }
  }

  async movePlayer(playerId: number, amount: number) {
      if (!this.gameState) return;
      const player = this.gameState.players.find(p => p.id === playerId);
      if (!player) return;

      const oldPosition = player.position;
      player.position = (oldPosition + amount) % 40;

      if (player.position < oldPosition) {
          player.money += 200;
          this.gameState.log.push(`${player.name} passed GO and collected $200.`);
      }

      this.gameState.log.push(`${player.name} moved to ${this.gameState.squares[player.position].name}.`);
      await this.landOnSquare(playerId, player.position);
  }

  async landOnSquare(playerId: number, squareId: number) {
      if (!this.gameState) return;
      const player = this.gameState.players.find(p => p.id === playerId);
      const square = this.gameState.squares.find(s => s.id === squareId);
      if (!player || !square) return;

      switch(square.type) {
          case 'property':
          case 'railroad':
          case 'utility':
              if (square.ownerId === undefined) {
                  this.gameState.log.push(`${player.name} can buy ${square.name} for $${square.price}.`);
                  // In a real implementation, we'd wait for a 'buy' action from the client.
              } else if (square.ownerId !== playerId && !square.mortgaged) {
                  await this.payRent(player, square);
              }
              break;
          case 'tax':
              const taxAmount = square.name === 'Luxury Tax' ? 100 : 200;
              this.gameState.log.push(`${player.name} paid $${taxAmount} in taxes.`);
              await this.pay(player, taxAmount);
              break;
          case 'go-to-jail':
              this.gameState.log.push(`${player.name} is sent to jail!`);
              this.goToJail(playerId);
              await this.nextTurn();
              break;
          case 'chance':
              this.gameState.log.push(`${player.name} landed on Chance.`);
              await this.drawCard(player, 'chance');
              break;
          case 'community-chest':
              this.gameState.log.push(`${player.name} landed on Community Chest.`);
              await this.drawCard(player, 'community-chest');
              break;
          case 'go':
          case 'jail':
          case 'free-parking':
              // No action needed
              break;
      }
  }

  async pay(player: Player, amount: number, recipient?: Player) {
      if (!this.gameState) return;

      player.money -= amount;

      if (recipient) {
          recipient.money += amount;
      }

      if (player.money < 0) {
          // TODO: Handle bankruptcy
          this.gameState.log.push(`${player.name} has gone bankrupt!`);
          player.bankrupt = true;
      }
  }

  async payRent(player: Player, square: Square) {
    if (!this.gameState || square.ownerId === undefined) return;

    const owner = this.gameState.players.find(p => p.id === square.ownerId);
    if (!owner) return;

    let rent = 0;
    if (square.type === 'property' && square.rent) {
        // Simplified rent calculation
        rent = square.rent[square.houses];
    } else if (square.type === 'railroad') {
        const ownedRailroads = this.gameState.squares.filter(s => s.type === 'railroad' && s.ownerId === owner.id).length;
        rent = 25 * Math.pow(2, ownedRailroads - 1);
    } else if (square.type === 'utility') {
        const ownedUtilities = this.gameState.squares.filter(s => s.type === 'utility' && s.ownerId === owner.id).length;
        const diceRoll = this.gameState.dice[0] + this.gameState.dice[1];
        rent = diceRoll * (ownedUtilities === 1 ? 4 : 10);
    }

    this.gameState.log.push(`${player.name} pays $${rent} rent to ${owner.name}.`);
    await this.pay(player, rent, owner);
  }

  goToJail(playerId: number) {
      if (!this.gameState) return;
      const player = this.gameState.players.find(p => p.id === playerId);
      if (!player) return;

      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
  }

  async nextTurn() {
      if (!this.gameState) return;
      this.gameState.currentPlayerId = (this.gameState.currentPlayerId + 1) % this.gameState.players.length;
      this.gameState.turn++;
      this.gameState.log.push(`It's now ${this.gameState.players[this.gameState.currentPlayerId].name}'s turn.`);
  }

  async drawCard(player: Player, deckType: 'chance' | 'community-chest') {
    if (!this.gameState) return;

    const deck = deckType === 'chance' ? this.gameState.chanceDeck : this.gameState.communityChestDeck;
    const cardData = deckType === 'chance' ? chanceCardData : communityChestCardData;

    if (deck.length === 0) {
        // Reshuffle
        const newDeck = Array.from({ length: cardData.length }, (_, i) => i);
        shuffle(newDeck);
        if (deckType === 'chance') this.gameState.chanceDeck = newDeck;
        else this.gameState.communityChestDeck = newDeck;
    }

    const cardIndex = deck.shift()!;
    const card = cardData[cardIndex];
    this.gameState.log.push(`${player.name} drew: "${card.text}"`);

    // Put card back at the bottom of the deck unless it's a keeper
    if (card.action !== 'get-out-of-jail-free') {
        deck.push(cardIndex);
    }

    await this.executeCardAction(player, card, deckType);
  }

  async executeCardAction(player: Player, card: Omit<Card, 'id' | 'deck'>, deckType: 'chance' | 'community-chest') {
      if (!this.gameState) return;

      switch(card.action) {
          case 'collect':
              player.money += card.value;
              break;
          case 'pay':
              await this.pay(player, card.value);
              break;
          case 'collect-from-all':
              for (const p of this.gameState.players) {
                  if (p.id !== player.id) {
                      await this.pay(p, card.value, player);
                  }
              }
              break;
          case 'pay-all':
              for (const p of this.gameState.players) {
                  if (p.id !== player.id) {
                      await this.pay(player, card.value, p);
                  }
              }
              break;
          case 'advance':
              const amount = (card.value - player.position + 40) % 40;
              await this.movePlayer(player.id, amount);
              break;
          case 'go-to-jail':
              this.goToJail(player.id);
              await this.nextTurn();
              break;
          case 'get-out-of-jail-free':
              if (deckType === 'chance') player.chanceJailCard = true;
              else player.communityChestJailCard = true;
              break;
          // Other cases can be added here
          default:
              this.gameState.log.push(`Card action '${card.action}' not yet implemented.`);
      }
  }
  async buyProperty(playerId: number) {
    if (!this.gameState) return;
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const square = this.gameState.squares[player.position];
    if ((square.type === 'property' || square.type === 'railroad' || square.type === 'utility') && square.ownerId === undefined) {
      if (player.money >= (square.price ?? 0)) {
        await this.pay(player, square.price ?? 0);
        square.ownerId = playerId;
        this.gameState.log.push(`${player.name} bought ${square.name} for $${square.price}.`);
      } else {
        this.gameState.log.push(`${player.name} cannot afford to buy ${square.name}.`);
        // TODO: Trigger auction
      }
    }
  }
}

interface Env {
    AI: any;
}
