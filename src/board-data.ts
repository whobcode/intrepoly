/**
 * Core board data for Monopoly game
 * This file contains all the square definitions, card definitions, and game data
 */

// Player type definition
export interface Player {
  id: number;
  name: string;
  color: string;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  communityChestJailCard: boolean;
  chanceJailCard: boolean;
  isHuman: boolean;
  bankrupt: boolean;
  user?: string;
  email?: string;
  modelId?: string;
}

// WebSocket message type
export interface WebSocketMessage {
  action: string;
  payload?: any;
}

// Game state type
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
  turnState?: 'rolling' | 'acting' | 'ended' | 'LandedOnUnownedProperty' | 'AuctionInProgress';
  log: string[];
  chat?: Array<{
    id: string;
    playerId?: number;
    name: string;
    text: string;
    ts: number;
  }>;
  chatAiNextTs?: number;
  status?: 'open' | 'finished';
  winnerId?: number;
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
  auction?: {
    squareId: number;
    propertyToAuction: Square;
    bids: Array<{ playerId: number; amount: number }>;
    highestBid: number;
    highestBidderId?: number;
    currentPlayerId: number;
    endTime: number;
  };
}

// Type definitions
export type SquareType =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'chance'
  | 'community-chest'
  | 'tax'
  | 'go-to-jail'
  | 'jail'
  | 'free-parking';

export type PropertyGroup =
  | 'brown'
  | 'light-blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark-blue'
  | 'railroad'
  | 'utility';

export type CardAction =
  | 'collect'
  | 'pay'
  | 'collect-from-all'
  | 'pay-all'
  | 'advance'
  | 'go-to-jail'
  | 'get-out-of-jail-free';

export interface Square {
  id: number;
  name: string;
  type: SquareType;
  price?: number;
  rent?: number[];
  houseCost?: number;
  group?: PropertyGroup;
  ownerId?: number;
  houses?: number;
  mortgaged?: boolean;
}

export interface Card {
  id: number;
  deck: 'chance' | 'community-chest';
  text: string;
  action: CardAction;
  value: number;
}

/**
 * All 40 squares on the Monopoly board
 */
export const squares: Omit<Square, 'id'>[] = [
  // Position 0
  {
    name: 'GO',
    type: 'go',
  },
  // Position 1
  {
    name: 'Mediterranean Avenue',
    type: 'property',
    price: 60,
    rent: [2, 10, 30, 90, 160, 250],
    houseCost: 50,
    group: 'brown',
  },
  // Position 2
  {
    name: 'Community Chest',
    type: 'community-chest',
  },
  // Position 3
  {
    name: 'Baltic Avenue',
    type: 'property',
    price: 60,
    rent: [4, 20, 60, 180, 320, 450],
    houseCost: 50,
    group: 'brown',
  },
  // Position 4
  {
    name: 'Income Tax',
    type: 'tax',
  },
  // Position 5
  {
    name: 'Reading Railroad',
    type: 'railroad',
    price: 200,
    group: 'railroad',
  },
  // Position 6
  {
    name: 'Oriental Avenue',
    type: 'property',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    group: 'light-blue',
  },
  // Position 7
  {
    name: 'Chance',
    type: 'chance',
  },
  // Position 8
  {
    name: 'Vermont Avenue',
    type: 'property',
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    group: 'light-blue',
  },
  // Position 9
  {
    name: 'Connecticut Avenue',
    type: 'property',
    price: 120,
    rent: [8, 40, 100, 300, 450, 600],
    houseCost: 50,
    group: 'light-blue',
  },
  // Position 10
  {
    name: 'Jail',
    type: 'jail',
  },
  // Position 11
  {
    name: 'St. Charles Place',
    type: 'property',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    group: 'pink',
  },
  // Position 12
  {
    name: 'Electric Company',
    type: 'utility',
    price: 150,
    group: 'utility',
  },
  // Position 13
  {
    name: 'States Avenue',
    type: 'property',
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
    group: 'pink',
  },
  // Position 14
  {
    name: 'Virginia Avenue',
    type: 'property',
    price: 160,
    rent: [12, 60, 180, 500, 700, 900],
    houseCost: 100,
    group: 'pink',
  },
  // Position 15
  {
    name: 'Pennsylvania Railroad',
    type: 'railroad',
    price: 200,
    group: 'railroad',
  },
  // Position 16
  {
    name: 'St. James Place',
    type: 'property',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    group: 'orange',
  },
  // Position 17
  {
    name: 'Community Chest',
    type: 'community-chest',
  },
  // Position 18
  {
    name: 'Tennessee Avenue',
    type: 'property',
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
    group: 'orange',
  },
  // Position 19
  {
    name: 'New York Avenue',
    type: 'property',
    price: 200,
    rent: [16, 80, 220, 600, 800, 1000],
    houseCost: 100,
    group: 'orange',
  },
  // Position 20
  {
    name: 'Free Parking',
    type: 'free-parking',
  },
  // Position 21
  {
    name: 'Kentucky Avenue',
    type: 'property',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    group: 'red',
  },
  // Position 22
  {
    name: 'Chance',
    type: 'chance',
  },
  // Position 23
  {
    name: 'Indiana Avenue',
    type: 'property',
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
    group: 'red',
  },
  // Position 24
  {
    name: 'Illinois Avenue',
    type: 'property',
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
    houseCost: 150,
    group: 'red',
  },
  // Position 25
  {
    name: 'B. & O. Railroad',
    type: 'railroad',
    price: 200,
    group: 'railroad',
  },
  // Position 26
  {
    name: 'Atlantic Avenue',
    type: 'property',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    group: 'yellow',
  },
  // Position 27
  {
    name: 'Ventnor Avenue',
    type: 'property',
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    group: 'yellow',
  },
  // Position 28
  {
    name: 'Water Works',
    type: 'utility',
    price: 150,
    group: 'utility',
  },
  // Position 29
  {
    name: 'Marvin Gardens',
    type: 'property',
    price: 280,
    rent: [24, 120, 360, 850, 1025, 1200],
    houseCost: 150,
    group: 'yellow',
  },
  // Position 30
  {
    name: 'Go To Jail',
    type: 'go-to-jail',
  },
  // Position 31
  {
    name: 'Pacific Avenue',
    type: 'property',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    group: 'green',
  },
  // Position 32
  {
    name: 'North Carolina Avenue',
    type: 'property',
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
    group: 'green',
  },
  // Position 33
  {
    name: 'Community Chest',
    type: 'community-chest',
  },
  // Position 34
  {
    name: 'Pennsylvania Avenue',
    type: 'property',
    price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400],
    houseCost: 200,
    group: 'green',
  },
  // Position 35
  {
    name: 'Short Line',
    type: 'railroad',
    price: 200,
    group: 'railroad',
  },
  // Position 36
  {
    name: 'Chance',
    type: 'chance',
  },
  // Position 37
  {
    name: 'Park Place',
    type: 'property',
    price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500],
    houseCost: 200,
    group: 'dark-blue',
  },
  // Position 38
  {
    name: 'Luxury Tax',
    type: 'tax',
  },
  // Position 39
  {
    name: 'Boardwalk',
    type: 'property',
    price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000],
    houseCost: 200,
    group: 'dark-blue',
  },
];

/**
 * Chance cards
 */
export const chanceCards: Omit<Card, 'id' | 'deck'>[] = [
  {
    text: 'Advance to GO. Collect $200.',
    action: 'advance',
    value: 0,
  },
  {
    text: 'Advance to Illinois Avenue. If you pass GO, collect $200.',
    action: 'advance',
    value: 24,
  },
  {
    text: 'Advance to St. Charles Place. If you pass GO, collect $200.',
    action: 'advance',
    value: 11,
  },
  {
    text: 'Advance token to nearest Utility. If unowned, you may buy it from the Bank. If owned, throw dice and pay owner a total ten times the amount thrown.',
    action: 'collect',
    value: 0, // Special handling needed
  },
  {
    text: 'Advance token to the nearest Railroad and pay owner twice the rental to which he/she is otherwise entitled. If Railroad is unowned, you may buy it from the Bank.',
    action: 'collect',
    value: 0, // Special handling needed
  },
  {
    text: 'Bank pays you dividend of $50.',
    action: 'collect',
    value: 50,
  },
  {
    text: 'Get Out of Jail Free. This card may be kept until needed or sold.',
    action: 'get-out-of-jail-free',
    value: 0,
  },
  {
    text: 'Go Back 3 Spaces.',
    action: 'collect',
    value: -3, // Special handling needed
  },
  {
    text: 'Go to Jail. Go directly to Jail. Do not pass GO, do not collect $200.',
    action: 'go-to-jail',
    value: 0,
  },
  {
    text: 'Make general repairs on all your property. For each house pay $25. For each hotel $100.',
    action: 'collect',
    value: 0, // Special handling needed
  },
  {
    text: 'Pay poor tax of $15.',
    action: 'pay',
    value: 15,
  },
  {
    text: 'Take a trip to Reading Railroad. If you pass GO, collect $200.',
    action: 'advance',
    value: 5,
  },
  {
    text: 'Take a walk on the Boardwalk. Advance token to Boardwalk.',
    action: 'advance',
    value: 39,
  },
  {
    text: 'You have been elected Chairman of the Board. Pay each player $50.',
    action: 'pay-all',
    value: 50,
  },
  {
    text: 'Your building loan matures. Collect $150.',
    action: 'collect',
    value: 150,
  },
  {
    text: 'You have won a crossword competition. Collect $100.',
    action: 'collect',
    value: 100,
  },
];

/**
 * Community Chest cards
 */
export const communityChestCards: Omit<Card, 'id' | 'deck'>[] = [
  {
    text: 'Advance to GO. Collect $200.',
    action: 'advance',
    value: 0,
  },
  {
    text: 'Bank error in your favor. Collect $200.',
    action: 'collect',
    value: 200,
  },
  {
    text: "Doctor's fees. Pay $50.",
    action: 'pay',
    value: 50,
  },
  {
    text: 'From sale of stock you get $50.',
    action: 'collect',
    value: 50,
  },
  {
    text: 'Get Out of Jail Free. This card may be kept until needed or sold.',
    action: 'get-out-of-jail-free',
    value: 0,
  },
  {
    text: 'Go to Jail. Go directly to jail. Do not pass GO, do not collect $200.',
    action: 'go-to-jail',
    value: 0,
  },
  {
    text: 'Grand Opera Night. Collect $50 from every player for opening night seats.',
    action: 'collect-from-all',
    value: 50,
  },
  {
    text: 'Holiday Fund matures. Receive $100.',
    action: 'collect',
    value: 100,
  },
  {
    text: 'Income tax refund. Collect $20.',
    action: 'collect',
    value: 20,
  },
  {
    text: 'It is your birthday. Collect $10 from every player.',
    action: 'collect-from-all',
    value: 10,
  },
  {
    text: 'Life insurance matures. Collect $100.',
    action: 'collect',
    value: 100,
  },
  {
    text: 'Pay hospital fees of $100.',
    action: 'pay',
    value: 100,
  },
  {
    text: 'Pay school fees of $150.',
    action: 'pay',
    value: 150,
  },
  {
    text: 'Receive $25 consultancy fee.',
    action: 'collect',
    value: 25,
  },
  {
    text: 'You are assessed for street repairs. $40 per house. $115 per hotel.',
    action: 'collect',
    value: 0, // Special handling needed
  },
  {
    text: 'You have won second prize in a beauty contest. Collect $10.',
    action: 'collect',
    value: 10,
  },
  {
    text: 'You inherit $100.',
    action: 'collect',
    value: 100,
  },
];
