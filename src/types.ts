/**
 * Represents a player in the game.
 */
export interface Player {
  /** The unique identifier for the player. */
  id: number;
  /** The name of the player. */
  name: string;
  /** The color of the player's token. */
  color: string;
  /** The player's current position on the board (square ID). */
  position: number;
  /** The amount of money the player has. */
  money: number;
  /** Whether the player is currently in jail. */
  inJail: boolean;
  /** The number of turns the player has spent in jail. */
  jailTurns: number;
  /** Whether the player has a "Get Out of Jail Free" card from the Community Chest deck. */
  communityChestJailCard: boolean;
  /** Whether the player has a "Get Out of Jail Free" card from the Chance deck. */
  chanceJailCard: boolean;
  /** Whether the player is a human or an AI. */
  isHuman: boolean;
  /** Whether the player is bankrupt. */
  bankrupt: boolean;
  /** The ID of the player to whom this player is indebted, if any. */
  creditor?: number;
  /** The authenticated username of the player, if available. */
  user?: string;
  /** The authenticated email of the player, if available. */
  email?: string;
  /** The Workers AI model ID to use for this player if they are an NPC. */
  modelId?: string;
}

/**
 * Represents a square on the game board.
 */
export interface Square {
  /** The unique identifier for the square (0-39). */
  id: number;
  /** The name of the square. */
  name: string;
  /** The type of the square. */
  type: 'property' | 'railroad' | 'utility' | 'go' | 'jail' | 'free-parking' | 'go-to-jail' | 'chance' | 'community-chest' | 'tax';
  /** The purchase price of the property. */
  price?: number;
  /** An array of rent values, indexed by the number of houses. */
  rent?: number[];
  /** The color group of the property. */
  group?: 'brown' | 'light-blue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'dark-blue' | 'railroad' | 'utility';
  /** The cost to build a house on this property. */
  houseCost?: number;
  /** The ID of the player who owns this square. */
  ownerId?: number;
  /** The number of houses built on this property (5 represents a hotel). */
  houses: number;
  /** Whether the property is currently mortgaged. */
  mortgaged: boolean;
}

/**
 * Represents a Chance or Community Chest card.
 */
export interface Card {
  /** The unique identifier for the card. */
  id: number;
  /** The deck the card belongs to. */
  deck: 'chance' | 'community-chest';
  /** The text displayed on the card. */
  text: string;
  /** The action associated with the card. */
  action: string;
  /** The value associated with the action (e.g., amount of money, position on the board). */
  value?: any;
}

/**
 * Represents the entire state of a game session.
 */
export interface GameState {
  /** The unique identifier for the game. */
  gameId: string;
  /** An array of players in the game. */
  players: Player[];
  /** An array of the squares on the board. */
  squares: Square[];
  /** An array of card indices representing the shuffled Chance deck. */
  chanceDeck: number[];
  /** An array of card indices representing the shuffled Community Chest deck. */
  communityChestDeck: number[];
  /** The ID of the player whose turn it is. */
  currentPlayerId: number;
  /** The result of the last dice roll. */
  dice: [number, number];
  /** The number of consecutive doubles rolled by the current player. */
  doublesCount: number;
  /** The current turn number. */
  turn: number;
  /** The current state of the turn's lifecycle. */
  turnState?: 'rolling' | 'acting' | 'ended' | 'LandedOnUnownedProperty' | 'AuctionInProgress';
  /** A log of events that have occurred in the game. */
  log: string[];
  /** An array of chat messages. */
  chat?: { id: string; playerId?: number; name: string; text: string; ts: number }[];
  /** The timestamp until which the AI is blocked from sending chat messages. */
  chatAiNextTs?: number;
  /** The current status of the game. */
  status?: 'open' | 'finished';
  /** The ID of the winning player, if the game is finished. */
  winnerId?: number;
  /** The state of the current auction, if any. */
  auction?: {
    squareId: number;
    bids: { playerId: number; amount: number }[];
    highestBid: number;
    highestBidderId?: number;
    currentPlayerId: number;
    propertyToAuction?: Square;
  };
  /** The state of the current trade proposal, if any. */
  trade?: {
    initiatorId: number;
    recipientId: number;
    offer: {
      money: number;
      properties: number[];
      jailCards: number;
    };
    request: {
      money: number;
      properties: number[];
      jailCards: number;
    };
  };
}

/**
 * Represents a message sent over the WebSocket connection.
 */
export interface WebSocketMessage {
  /** The type of action to be performed. */
  action: string;
  /** The data associated with the action. */
  payload?: any;
}
