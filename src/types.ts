export interface Player {
  id: number;
  name: string;
  color: string;
  position: number;
  money: number;
  inJail: boolean;
  jailTurns: number;
  communityChestJailCard: boolean;
  chanceJailCard: boolean;
  isHuman: boolean;
  bankrupt: boolean;
  creditor?: number; // Player ID of the creditor
  user?: string; // authenticated username
  email?: string; // authenticated email if available
  modelId?: string; // Workers AI model id (for NPCs)
}

export interface Square {
  id: number;
  name: string;
  type: 'property' | 'railroad' | 'utility' | 'go' | 'jail' | 'free-parking' | 'go-to-jail' | 'chance' | 'community-chest' | 'tax';
  price?: number;
  rent?: number[];
  group?: 'brown' | 'light-blue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'dark-blue' | 'railroad' | 'utility';
  houseCost?: number;
  ownerId?: number;
  houses: number;
  mortgaged: boolean;
}

export interface Card {
  id: number;
  deck: 'chance' | 'community-chest';
  text: string;
  action: string; // e.g., 'advance', 'pay', 'collect', 'get-out-of-jail-free'
  value?: any; // Can be a position, amount, etc.
}

export interface GameState {
  gameId: string;
  players: Player[];
  squares: Square[];
  chanceDeck: number[];
  communityChestDeck: number[];
  currentPlayerId: number;
  dice: [number, number];
  doublesCount: number;
  turn: number;
  log: string[];
  chat?: { id: string; playerId?: number; name: string; text: string; ts: number }[];
  chatAiNextTs?: number;
  status?: 'open' | 'finished';
  winnerId?: number;
  auction?: {
    squareId: number;
    bids: { playerId: number; amount: number }[];
    highestBid: number;
    highestBidderId?: number;
    currentPlayerId: number;
  };
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

export interface WebSocketMessage {
  action: string;
  payload?: any;
}
