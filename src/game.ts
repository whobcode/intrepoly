import { GameState, WebSocketMessage, Player, Square, Card } from './types';
import { squares as squareData, chanceCards as chanceCardData, communityChestCards as communityChestCardData } from './board';

/**
 * Shuffles an array in place.
 * @param array The array to shuffle.
 */
function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * The main Game Durable Object class.
 * This class manages the state and logic for a single game of Monopoly.
 */
export class Game implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[] = [];
  gameState?: GameState;
  playerIds: Map<WebSocket, number> = new Map();

  /**
   * Creates a new Game instance.
   * @param state The Durable Object state.
   * @param env The environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Initializes the game state, either by loading from storage or creating a new game.
   * @returns A promise that resolves when the game is initialized.
   */
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
        chat: [],
      };
    }
  }

  /**
   * Handles incoming HTTP requests to the Durable Object.
   * This is used for both WebSocket upgrades and fetching the current game state.
   * @param request The incoming request.
   * @returns A promise that resolves to a Response.
   */
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

  /**
   * Handles a new WebSocket session.
   * @param ws The WebSocket connection.
   */
  handleSession(ws: WebSocket) {
    this.sessions.push(ws);

    ws.addEventListener('message', async (msg) => {
      try {
        const message: WebSocketMessage = JSON.parse(msg.data as string);

        if (message.action === 'join') {
            await this.addPlayer(ws, message.payload.name, message.payload.color, message.payload.user, message.payload.email);
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

  /**
   * Adds a new player to the game.
   * @param ws The WebSocket connection of the player.
   * @param name The name of the player.
   * @param color The color of the player's token.
   * @param user The authenticated username, if available.
   * @param email The authenticated email, if available.
   * @returns A promise that resolves when the player has been added.
   */
  async addPlayer(ws: WebSocket, name: string, color: string, user?: string, email?: string): Promise<void> {
    if (!this.gameState) {
        return;
    }

    if (this.gameState.players.length >= 8) {
        ws.send(JSON.stringify({ error: 'Game is full.'}));
        return;
    }

    // If this user already has a player, reattach
    if (user) {
      const existing = this.gameState.players.find(p => p.user === user);
      if (existing) {
        this.playerIds.set(ws, existing.id);
        ws.send(JSON.stringify({ type: 'WELCOME', payload: { id: existing.id } }));
        return;
      }
    }

    const newPlayer: Player = {
        id: this.gameState.players.length,
        name: this.uniqueName(name || `Player ${this.gameState.players.length + 1}`),
        color: color || 'blue',
        money: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        communityChestJailCard: false,
        chanceJailCard: false,
        isHuman: true,
        bankrupt: false,
        user,
        email,
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

  /**
   * Generates a unique name for a player.
   * @param base The base name to use.
   * @returns A unique name.
   */
  uniqueName(base: string): string {
    if (!this.gameState) return base;
    let name = base;
    let i = 2;
    const taken = new Set(this.gameState.players.map(p => p.name.toLowerCase()));
    while (taken.has(name.toLowerCase())) {
      name = `${base} ${i++}`;
    }
    return name;
  }

  /**
   * Updates the game state in storage and broadcasts it to all connected clients.
   * @returns A promise that resolves when the update is complete.
   */
  async updateAndBroadcast(): Promise<void> {
      if (!this.gameState) return;
      await this.checkEndGame();
      await this.checkAuctionDeadline();
      await this.state.storage.put('gameState', this.gameState);
      await this.saveSnapshot();
      const presence = {
        players: this.playerIds.size,
        spectators: Math.max(0, this.sessions.length - this.playerIds.size),
        connections: this.sessions.length,
      };
      const payload: any = { ...this.gameState, _presence: presence };
      this.broadcast({ type: 'GAME_STATE_UPDATE', payload });
  }

  /**
   * Broadcasts a message to all connected WebSocket sessions.
   * @param message The message to broadcast.
   */
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

  /**
   * Dispatches a game action based on a WebSocket message.
   * @param playerId The ID of the player performing the action.
   * @param message The WebSocket message containing the action and payload.
   * @returns A promise that resolves when the action has been processed.
   */
  async dispatchAction(playerId: number, message: WebSocketMessage) {
    if (!this.gameState) return;
    const localMode = (this.gameState as any).localMode === true;
    const actorId = localMode ? this.gameState.currentPlayerId : playerId;
    const isTurn = this.gameState.currentPlayerId === actorId;

    switch (message.action) {
      case 'rollDice':
        if (isTurn) await this.rollDice(actorId);
        break;
      case 'buyProperty':
        if (isTurn) await this.buyProperty(actorId);
        break;
      case 'endTurn':
        if (isTurn) await this.nextTurn();
        break;
      case 'giveMoney':
        await this.giveMoney(actorId, message.payload?.toPlayerId, message.payload?.amount);
        break;
      case 'transferProperty':
        await this.transferProperty(actorId, message.payload?.squareId, message.payload?.toPlayerId);
        break;
      case 'addNPC':
        await this.addNpc(message.payload?.count || 1, message.payload?.modelId);
        break;
      case 'ping':
        // no-op heartbeat
        break;
      case 'addLocalPlayers':
        await this.addLocalPlayers(message.payload?.count || 0);
        break;
      case 'chat':
        await this.receiveChat(actorId, message.payload?.text);
        // Chat is broadcast separately without forcing a full state update
        return;
      case 'buildHouse':
        if (isTurn) await this.buildHouse(actorId, message.payload?.squareId);
        break;
      case 'sellHouse':
        if (isTurn) await this.sellHouse(actorId, message.payload?.squareId);
        break;
      case 'mortgage':
        if (isTurn) await this.mortgage(actorId, message.payload?.squareId);
        break;
      case 'unmortgage':
        if (isTurn) await this.unmortgage(actorId, message.payload?.squareId);
        break;
      case 'proposeTrade':
        await this.proposeTrade(actorId, message.payload);
        break;
      case 'acceptTrade':
        await this.acceptTrade(actorId);
        break;
      case 'rejectTrade':
        await this.rejectTrade(actorId);
        break;
      case 'startAuction':
        await this.startAuction(message.payload?.squareId);
        break;
      case 'placeBid':
        await this.placeBid(actorId, message.payload?.amount);
        break;
      default:
        console.log(`Unknown action: ${message.action}`);
    }

    await this.updateAndBroadcast();
  }

  /**
   * Handles an incoming chat message.
   * @param playerId The ID of the player who sent the message.
   * @param text The content of the chat message.
   * @returns A promise that resolves when the message has been processed.
   */
  async receiveChat(playerId: number, text: string) {
    if (!this.gameState) return;
    const t = String(text || '').trim();
    if (!t) return;
    const maxLen = 500;
    const clean = t.slice(0, maxLen);
    const p = this.gameState.players.find(pp => pp.id === playerId);
    const name = p?.name || `P${playerId}`;
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, playerId, name, text: clean, ts: Date.now() };
    this.gameState.chat = this.gameState.chat || [];
    this.gameState.chat.push(msg);
    // keep last 200
    if (this.gameState.chat.length > 200) this.gameState.chat = this.gameState.chat.slice(-200);
    // persist without full broadcast
    await this.state.storage.put('gameState', this.gameState);
    this.broadcast({ type: 'CHAT_MESSAGE', payload: msg });

    // Trigger AI banter on command or occasionally
    const explicit = /^\s*\/ai\b|@ai\b/i.test(t);
    const now = Date.now();
    const nextOk = (this.gameState.chatAiNextTs || 0) <= now;
    const randomChance = Math.random() < 0.2; // 20% chance on any chat
    if (explicit || (nextOk && randomChance)) {
      // set cooldown ~30s
      this.gameState.chatAiNextTs = now + 30_000;
      // fire and forget; don't await to keep chat snappy
      this.aiBanter(t).catch(() => {});
    }
  }

  /**
   * Picks an AI player to speak.
   * @returns An object with the ID, name, and model ID of the AI speaker.
   */
  private pickAiSpeaker(): { id?: number; name: string; modelId?: string } {
    if (!this.gameState) return { name: 'AI' };
    const npcs = this.gameState.players.filter(p => !p.isHuman);
    if (npcs.length > 0) {
      const who = npcs[Math.floor(Math.random() * npcs.length)];
      return { id: who.id, name: who.name, modelId: who.modelId };
    }
    return { name: 'Table AI' };
  }

  /**
   * Gets the default AI model from the environment.
   * @returns The default AI model ID.
   */
  private defaultModel(): string {
    // Prefer env.DEFAULT_AI_MODEL when available
    try {
      // @ts-ignore
      const m = (this.env as any).DEFAULT_AI_MODEL;
      return m || '@cf/meta/llama-2-7b-chat-int8';
    } catch {
      return '@cf/meta/llama-2-7b-chat-int8';
    }
  }

  /**
   * Generates and broadcasts a witty AI banter message.
   * @param triggerText The text that triggered the banter.
   */
  private async aiBanter(triggerText: string) {
    if (!this.gameState || !this.env?.AI) return;
    const speaker = this.pickAiSpeaker();
    const recent = (this.gameState.chat || []).slice(-8)
      .map(m => `${m.name}: ${m.text}`)
      .join('\n');
    const table = this.gameState.players.map(p => `${p.name}($${p.money}${p.bankrupt?' bankrupt':''})`).join(', ');
    const context = `Players: ${table}\nTurn: ${this.gameState.turn}`;
    const prompt = [
      'You are a witty, lightly-profane but friendly Monopoly table banter bot.',
      'Keep messages short (max 2 sentences). No slurs, hate, harassment, or explicit sexual content.',
      'Use casual tone; react to the table context and recent chat. If asked a direct question, answer succinctly.',
      'If giving advice, keep it playful and non-binding.',
      '',
      'Recent chat:',
      recent || '(no recent chat)',
      '',
      'Trigger from player:',
      triggerText,
      '',
      'Context:',
      context,
      '',
      'Your single reply:'
    ].join('\n');
    const model = speaker.modelId || this.defaultModel();
    let text = '';
    try {
      const res = await this.env.AI.run(model, { prompt });
      text = String((res && (res.response || res.result || res.output || res))).trim();
    } catch {
      text = "Alright, alright — keep the dice rolling.";
    }
    if (!text) return;
    // Trim long responses
    if (text.length > 300) text = text.slice(0, 300);
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, playerId: speaker.id, name: speaker.name, text, ts: Date.now() };
    this.gameState.chat = this.gameState.chat || [];
    this.gameState.chat.push(msg);
    if (this.gameState.chat.length > 200) this.gameState.chat = this.gameState.chat.slice(-200);
    await this.state.storage.put('gameState', this.gameState);
    this.broadcast({ type: 'CHAT_MESSAGE', payload: msg });
  }

  /**
   * Simulates rolling the dice for a player.
   * @param playerId The ID of the player rolling the dice.
   * @returns A promise that resolves when the dice roll and its consequences are handled.
   */
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

  /**
   * Moves a player on the board.
   * @param playerId The ID of the player to move.
   * @param amount The number of squares to move.
   * @returns A promise that resolves when the player has been moved and the landing action is handled.
   */
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

  /**
   * Handles the action when a player lands on a square.
   * @param playerId The ID of the player.
   * @param squareId The ID of the square the player landed on.
   * @returns A promise that resolves when the landing action is complete.
   */
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

  /**
   * Makes a player pay a certain amount of money.
   * @param player The player who is paying.
   * @param amount The amount of money to pay.
   * @param recipient The player who is receiving the money, if any.
   * @returns A promise that resolves when the payment is complete.
   */
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

  /**
   * Checks if the game has ended and updates the game state accordingly.
   * @returns A promise that resolves when the check is complete.
   */
  async checkEndGame() {
    if (!this.gameState) return;
    if (this.gameState.status === 'finished') return;
    const alive = this.gameState.players.filter(p => !p.bankrupt);
    if (alive.length <= 1 && this.gameState.players.length > 0) {
      const winner = alive[0] || this.gameState.players[0];
      this.gameState.status = 'finished';
      this.gameState.winnerId = winner.id;
      this.gameState.log.push(`${winner.name} wins the game!`);
      try {
        // Update stats in D1 if available
        // @ts-ignore
        const env: Env = this.env as any;
        // @ts-ignore
        if (env && env.monopolyd1) {
          for (const p of this.gameState.players) {
            const col = p.id === winner.id ? 'wins' : 'losses';
            await env.monopolyd1.prepare(`UPDATE users SET ${col} = COALESCE(${col},0)+1 WHERE username=?`)
              .bind(p.name).run();
          }
        }
      } catch (e) {
        // ignore in case D1 not bound in this env
      }
    }
  }

  /**
   * Makes a player pay rent to the owner of a square.
   * @param player The player paying rent.
   * @param square The square on which rent is being paid.
   * @returns A promise that resolves when the rent is paid.
   */
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

  /**
   * Sends a player to jail.
   * @param playerId The ID of the player to send to jail.
   */
  goToJail(playerId: number) {
      if (!this.gameState) return;
      const player = this.gameState.players.find(p => p.id === playerId);
      if (!player) return;

      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
  }

  /**
   * Advances the game to the next player's turn.
   * @returns A promise that resolves when the turn is advanced.
   */
  async nextTurn() {
      if (!this.gameState) return;
      this.gameState.currentPlayerId = (this.gameState.currentPlayerId + 1) % this.gameState.players.length;
      this.gameState.turn++;
      this.gameState.log.push(`It's now ${this.gameState.players[this.gameState.currentPlayerId].name}'s turn.`);

      // If next player is NPC, take a simple automatic turn
      const p = this.gameState.players[this.gameState.currentPlayerId];
      if (p && !p.isHuman) {
        await this.aiTakeTurn(p.id);
      }
  }

  /**
   * Draws a card from the specified deck for a player.
   * @param player The player drawing the card.
   * @param deckType The type of deck to draw from ('chance' or 'community-chest').
   * @returns A promise that resolves when the card has been drawn and its action executed.
   */
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

  /**
   * Executes the action of a drawn card.
   * @param player The player who drew the card.
   * @param card The card that was drawn.
   * @param deckType The type of deck the card came from.
   * @returns A promise that resolves when the card's action is complete.
   */
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

  /**
   * Allows a player to buy the property they are currently on.
   * @param playerId The ID of the player buying the property.
   * @returns A promise that resolves when the purchase is complete.
   */
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

  /**
   * Gives a specified amount of money from one player to another.
   * @param fromId The ID of the player giving money.
   * @param toId The ID of the player receiving money.
   * @param amount The amount of money to transfer.
   * @returns A promise that resolves when the transfer is complete.
   */
  async giveMoney(fromId: number, toId: number, amount: number) {
    if (!this.gameState) return;
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    const from = this.gameState.players.find(p => p.id === fromId);
    const to = this.gameState.players.find(p => p.id === toId);
    if (!from || !to || amount <= 0) return;
    if (from.money < amount) {
      this.gameState.log.push(`${from.name} tried to give $${amount} but cannot afford it.`);
      return;
    }
    from.money -= amount;
    to.money += amount;
    this.gameState.log.push(`${from.name} gave $${amount} to ${to.name}.`);
  }

  /**
   * Transfers a property from one player to another.
   * @param fromId The ID of the player giving the property.
   * @param squareId The ID of the square being transferred.
   * @param toId The ID of the player receiving the property.
   * @returns A promise that resolves when the transfer is complete.
   */
  async transferProperty(fromId: number, squareId: number, toId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    const from = this.gameState.players.find(p => p.id === fromId);
    const to = this.gameState.players.find(p => p.id === toId);
    if (!sq || !from || !to) return;
    if (sq.ownerId !== fromId) {
      this.gameState.log.push(`${from.name} does not own ${sq.name}.`);
      return;
    }
    sq.ownerId = toId;
    this.gameState.log.push(`${from.name} transferred ${sq.name} to ${to.name}.`);
  }

  /**
   * Adds one or more non-player characters (NPCs) to the game.
   * @param count The number of NPCs to add.
   * @param modelId The AI model to use for these NPCs.
   * @returns A promise that resolves when the NPCs have been added.
   */
  async addNpc(count: number, modelId?: string) {
    if (!this.gameState) return;
    for (let i = 0; i < count; i++) {
      const id = this.gameState.players.length;
      const npc: Player = {
        id,
        name: `CPU ${id + 1}`,
        color: ['Aqua','Fuchsia','Gray','Lime','Maroon','Navy','Olive','Teal'][id % 8].toLowerCase(),
        money: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        communityChestJailCard: false,
        chanceJailCard: false,
        isHuman: false,
        bankrupt: false,
        modelId,
      };
      this.gameState.players.push(npc);
      this.gameState.log.push(`${npc.name} has joined the game.`);
    }
  }

  /**
   * Simulates a turn for an AI player.
   * @param playerId The ID of the AI player.
   * @returns A promise that resolves when the AI has taken its turn.
   */
  async aiTakeTurn(playerId: number) {
    if (!this.gameState) return;
    // Very simple heuristic: roll, buy if can afford, otherwise end turn
    await this.rollDice(playerId);
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;
    const sq = this.gameState.squares[player.position];
    if ((sq.type === 'property' || sq.type === 'railroad' || sq.type === 'utility') && sq.ownerId === undefined) {
      if (player.money >= (sq.price ?? 0)) {
        await this.buyProperty(playerId);
      }
    }
    // nextTurn is called by rollDice path for non-doubles; nothing else to do here
  }

  /**
   * Adds local players for hot-seat mode.
   * @param count The number of local players to add.
   * @returns A promise that resolves when the players have been added.
   */
  async addLocalPlayers(count: number) {
    if (!this.gameState) return;
    (this.gameState as any).localMode = true;
    for (let i = 0; i < count; i++) {
      const id = this.gameState.players.length;
      const p: Player = {
        id,
        name: `Local ${id + 1}`,
        color: ['orange','purple','red','silver','black','green'][id % 6],
        money: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        communityChestJailCard: false,
        chanceJailCard: false,
        isHuman: true,
        bankrupt: false,
      };
      this.gameState.players.push(p);
      this.gameState.log.push(`${p.name} (local) joined.`);
    }
  }

  /**
   * Builds a house on a property.
   * @param playerId The ID of the player building the house.
   * @param squareId The ID of the square to build on.
   * @returns A promise that resolves when the house is built.
   */
  async buildHouse(playerId: number, squareId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!sq || !player || sq.type !== 'property') return;
    if (sq.ownerId !== playerId || sq.mortgaged) return;
    const groupSquares = this.gameState.squares.filter(s => s.group === sq.group);
    if (!groupSquares.every(s => s.ownerId === playerId)) return;
    if (sq.houses >= 5) return;
    const cost = sq.houseCost || 0;
    if (player.money < cost) return;
    player.money -= cost;
    sq.houses += 1;
    this.gameState.log.push(`${player.name} built on ${sq.name}. (${sq.houses === 5 ? 'Hotel' : 'House ' + sq.houses})`);
  }

  /**
   * Sells a house from a property.
   * @param playerId The ID of the player selling the house.
   * @param squareId The ID of the square to sell from.
   * @returns A promise that resolves when the house is sold.
   */
  async sellHouse(playerId: number, squareId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!sq || !player || sq.type !== 'property') return;
    if (sq.ownerId !== playerId) return;
    if (sq.houses <= 0) return;
    const refund = Math.floor((sq.houseCost || 0) / 2);
    player.money += refund;
    sq.houses -= 1;
    this.gameState.log.push(`${player.name} sold building on ${sq.name}.`);
  }

  /**
   * Mortgages a property.
   * @param playerId The ID of the player mortgaging the property.
   * @param squareId The ID of the square to mortgage.
   * @returns A promise that resolves when the property is mortgaged.
   */
  async mortgage(playerId: number, squareId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!sq || !player) return;
    if (sq.ownerId !== playerId || sq.mortgaged || (sq.houses||0) > 0) return;
    const value = Math.floor((sq.price || 0) / 2);
    player.money += value;
    sq.mortgaged = true;
    this.gameState.log.push(`${player.name} mortgaged ${sq.name} for $${value}.`);
  }

  /**
   * Unmortgages a property.
   * @param playerId The ID of the player unmortgaging the property.
   * @param squareId The ID of the square to unmortgage.
   * @returns A promise that resolves when the property is unmortgaged.
   */
  async unmortgage(playerId: number, squareId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!sq || !player) return;
    if (sq.ownerId !== playerId || !sq.mortgaged) return;
    const cost = Math.ceil((sq.price || 0) * 0.55);
    if (player.money < cost) return;
    player.money -= cost;
    sq.mortgaged = false;
    this.gameState.log.push(`${player.name} unmortgaged ${sq.name} for $${cost}.`);
  }

  /**
   * Proposes a trade between two players.
   * @param initiatorId The ID of the player proposing the trade.
   * @param payload The details of the trade proposal.
   * @returns A promise that resolves when the trade is proposed.
   */
  async proposeTrade(initiatorId: number, payload: any) {
    if (!this.gameState) return;
    const recipientId = Number(payload?.recipientId);
    if (recipientId === undefined) return;
    this.gameState.trade = {
      initiatorId,
      recipientId,
      offer: {
        money: Math.max(0, Number(payload?.offer?.money) || 0),
        properties: Array.isArray(payload?.offer?.properties) ? payload.offer.properties : [],
        jailCards: Math.max(0, Number(payload?.offer?.jailCards) || 0),
      },
      request: {
        money: Math.max(0, Number(payload?.request?.money) || 0),
        properties: Array.isArray(payload?.request?.properties) ? payload.request.properties : [],
        jailCards: Math.max(0, Number(payload?.request?.jailCards) || 0),
      },
    };
    this.gameState.log.push(`Trade proposed by Player ${initiatorId} to Player ${recipientId}.`);
  }

  /**
   * Accepts a proposed trade.
   * @param actorId The ID of the player accepting the trade (must be the recipient).
   * @returns A promise that resolves when the trade is completed.
   */
  async acceptTrade(actorId: number) {
    if (!this.gameState || !this.gameState.trade) return;
    const t = this.gameState.trade;
    if (actorId !== t.recipientId) return;
    const from = this.gameState.players.find(p => p.id === t.initiatorId)!;
    const to = this.gameState.players.find(p => p.id === t.recipientId)!;
    from.money -= t.offer.money; to.money += t.offer.money;
    to.money -= t.request.money; from.money += t.request.money;
    for (const pid of t.offer.properties) {
      const sq = this.gameState.squares.find(s => s.id === pid); if (sq && sq.ownerId === from.id) sq.ownerId = to.id;
    }
    for (const pid of t.request.properties) {
      const sq = this.gameState.squares.find(s => s.id === pid); if (sq && sq.ownerId === to.id) sq.ownerId = from.id;
    }
    this.gameState.trade = undefined;
    this.gameState.log.push(`Trade completed between ${from.name} and ${to.name}.`);
  }

  /**
   * Rejects a proposed trade.
   * @param actorId The ID of the player rejecting the trade (must be the recipient).
   * @returns A promise that resolves when the trade is rejected.
   */
  async rejectTrade(actorId: number) {
    if (!this.gameState || !this.gameState.trade) return;
    const t = this.gameState.trade;
    if (actorId !== t.recipientId) return;
    this.gameState.trade = undefined;
    this.gameState.log.push(`Trade rejected.`);
  }

  /**
   * Starts an auction for a property.
   * @param squareId The ID of the square to be auctioned.
   * @returns A promise that resolves when the auction is started.
   */
  async startAuction(squareId: number) {
    if (!this.gameState) return;
    const sq = this.gameState.squares.find(s => s.id === squareId);
    if (!sq || sq.ownerId !== undefined) return;
    this.gameState.auction = { squareId, bids: [], highestBid: 0, currentPlayerId: 0, endTime: Date.now() + 30000 } as any;
    this.gameState.log.push(`Auction started for ${sq.name}.`);
  }

  /**
   * Places a bid in an ongoing auction.
   * @param playerId The ID of the player placing the bid.
   * @param amount The amount of the bid.
   * @returns A promise that resolves when the bid is placed.
   */
  async placeBid(playerId: number, amount: number) {
    if (!this.gameState || !this.gameState.auction) return;
    const bid = Math.max(0, Math.floor(Number(amount) || 0));
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player || player.money < bid) return;
    this.gameState.auction.bids.push({ playerId, amount: bid });
    if (bid > this.gameState.auction.highestBid) {
      this.gameState.auction.highestBid = bid;
      this.gameState.auction.highestBidderId = playerId;
      this.gameState.log.push(`${player.name} bid $${bid}.`);
    }
  }

  /**
   * Checks if the auction deadline has been reached and resolves the auction.
   * @returns A promise that resolves when the check is complete.
   */
  async checkAuctionDeadline() {
    if (!this.gameState || !this.gameState.auction) return;
    const a: any = this.gameState.auction;
    if (Date.now() >= (a.endTime || 0)) {
      const sq = this.gameState.squares.find(s => s.id === a.squareId);
      if (!sq) { this.gameState.auction = undefined; return; }
      const winnerId = a.highestBidderId;
      const bid = a.highestBid || 0;
      if (winnerId !== undefined) {
        const winner = this.gameState.players.find(p => p.id === winnerId);
        if (winner && winner.money >= bid) {
          winner.money -= bid;
          sq.ownerId = winnerId;
          this.gameState.log.push(`${winner.name} won the auction for ${sq.name} at $${bid}.`);
        } else {
          this.gameState.log.push(`Auction for ${sq?.name} ended with no valid winner.`);
        }
      } else {
        this.gameState.log.push(`Auction for ${sq?.name} ended with no bids.`);
      }
      this.gameState.auction = undefined;
    }
  }

  /**
   * Saves a lightweight snapshot of the game state to the database.
   * @returns A promise that resolves when the snapshot is saved.
   */
  async saveSnapshot() {
    // Persist lightweight snapshot for reconnect/analytics
    try {
      // @ts-ignore
      const env: Env = this.env as any;
      // @ts-ignore
      if (env && env.monopolyd1 && this.gameState) {
        await env.monopolyd1.prepare('INSERT OR REPLACE INTO games (id, owner_user_id, state_json, status, updated_at) VALUES (?, NULL, ?, ?, datetime("now"))')
          .bind(this.gameState.gameId, JSON.stringify({
            id: this.gameState.gameId,
            players: this.gameState.players.map(p => ({ id: p.id, name: p.name, money: p.money, bankrupt: p.bankrupt })),
            currentPlayerId: this.gameState.currentPlayerId,
            status: this.gameState.status || 'open',
            winnerId: this.gameState.winnerId,
            turn: this.gameState.turn,
          }), this.gameState.status || 'open').run();
      }
    } catch {}
  }
}

interface Env {
    AI: any;
    monopolyd1: D1Database;
}
