/**
 * AI Agent for Monopoly
 * This module provides AI players that can make autonomous decisions in the game.
 */

import { GameState, Player } from './types';

export interface AIDecision {
  action: string;
  reasoning?: string;
}

/**
 * AI Agent class that makes decisions for computer-controlled players
 */
export class MonopolyAI {
  private playerId: number;
  private difficulty: 'easy' | 'medium' | 'hard';
  private personality: string;

  constructor(playerId: number, difficulty: 'easy' | 'medium' | 'hard' = 'medium', personality?: string) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.personality = personality || this.generatePersonality();
  }

  private generatePersonality(): string {
    const personalities = [
      'aggressive investor',
      'conservative saver',
      'strategic monopolist',
      'opportunistic trader',
      'risk-taking entrepreneur',
      'calculated planner'
    ];
    return personalities[Math.floor(Math.random() * personalities.length)];
  }

  /**
   * Decides whether to buy a property
   */
  shouldBuyProperty(gameState: GameState, property: any): boolean {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player) return false;

    const price = property.price || 0;

    // Don't buy if we can't afford it
    if (player.money < price) return false;

    // Calculate reserves needed
    const reserveAmount = this.getReserveAmount(gameState, player);

    switch (this.difficulty) {
      case 'easy':
        // Easy AI: Buy if we have 2x the price
        return player.money >= price * 2;

      case 'medium':
        // Medium AI: Buy if we have enough reserves
        return player.money - price >= reserveAmount;

      case 'hard':
        // Hard AI: Strategic buying based on property value
        return this.shouldBuyStrategic(gameState, player, property, price, reserveAmount);
    }
  }

  private shouldBuyStrategic(gameState: GameState, player: Player, property: any, price: number, reserveAmount: number): boolean {
    // Check if we have enough money after purchase
    if (player.money - price < reserveAmount) return false;

    // Priority 1: Complete color groups
    if (property.type === 'property' && property.group) {
      const groupProperties = gameState.squares.filter(s =>
        s.type === 'property' && s.group === property.group
      );
      const ownedInGroup = groupProperties.filter(s => s.ownerId === this.playerId).length;
      const totalInGroup = groupProperties.length;

      // High priority if we already own some in the group
      if (ownedInGroup > 0 && ownedInGroup < totalInGroup) {
        return true;
      }
    }

    // Priority 2: Railroads are good investments
    if (property.type === 'railroad') {
      const railroadsOwned = gameState.squares.filter(s =>
        s.type === 'railroad' && s.ownerId === this.playerId
      ).length;
      return railroadsOwned < 3; // Buy up to 3 railroads
    }

    // Priority 3: Utilities if cheap
    if (property.type === 'utility') {
      return player.money > price * 3;
    }

    // Default: buy if price is reasonable
    return price < 300 || player.money > price * 2.5;
  }

  private getReserveAmount(gameState: GameState, player: Player): number {
    // Calculate how much money to keep in reserve
    const propertiesOwned = gameState.squares.filter(s => s.ownerId === this.playerId).length;
    const baseReserve = 200;

    switch (this.difficulty) {
      case 'easy':
        return baseReserve;
      case 'medium':
        return baseReserve + (propertiesOwned * 50);
      case 'hard':
        return baseReserve + (propertiesOwned * 100);
    }
  }

  /**
   * Decides whether to build houses
   */
  shouldBuildHouses(gameState: GameState): { squareId: number; count: number } | null {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player || player.money < 300) return null;

    // Find monopolies (complete color groups)
    const monopolies = this.findMonopolies(gameState);
    if (monopolies.length === 0) return null;

    // Sort by priority (cheaper colors first for balanced growth)
    monopolies.sort((a, b) => {
      const avgPriceA = a.properties.reduce((sum, p) => sum + (p.price || 0), 0) / a.properties.length;
      const avgPriceB = b.properties.reduce((sum, p) => sum + (p.price || 0), 0) / b.properties.length;
      return avgPriceA - avgPriceB;
    });

    for (const monopoly of monopolies) {
      // Find property in this monopoly with fewest houses
      const buildTarget = monopoly.properties.reduce((min, p) =>
        (p.houses || 0) < (min.houses || 0) ? p : min
      );

      const houseCost = buildTarget.houseCost || 50;

      if (player.money >= houseCost + this.getReserveAmount(gameState, player)) {
        return { squareId: buildTarget.id, count: 1 };
      }
    }

    return null;
  }

  private findMonopolies(gameState: GameState): Array<{ group: string; properties: any[] }> {
    const monopolies: Array<{ group: string; properties: any[] }> = [];
    const groups = new Set<string>();

    // Find all color groups
    gameState.squares.forEach(s => {
      if (s.type === 'property' && s.group) {
        groups.add(s.group);
      }
    });

    // Check which groups are complete monopolies
    groups.forEach(group => {
      const groupProperties = gameState.squares.filter(s =>
        s.type === 'property' && s.group === group
      );
      const allOwnedByPlayer = groupProperties.every(s => s.ownerId === this.playerId);

      if (allOwnedByPlayer) {
        monopolies.push({ group, properties: groupProperties });
      }
    });

    return monopolies;
  }

  /**
   * Decides on auction bid
   */
  getAuctionBid(gameState: GameState, property: any, currentBid: number): number {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player) return 0;

    const propertyValue = property.price || 0;
    const maxBid = Math.floor(player.money * 0.7); // Don't spend more than 70% of money

    switch (this.difficulty) {
      case 'easy':
        // Easy AI: Bid conservatively, up to 60% of property value
        const easyMax = Math.min(Math.floor(propertyValue * 0.6), maxBid);
        return currentBid < easyMax ? currentBid + 10 : 0;

      case 'medium':
        // Medium AI: Bid up to 80% of property value
        const mediumMax = Math.min(Math.floor(propertyValue * 0.8), maxBid);
        return currentBid < mediumMax ? currentBid + 20 : 0;

      case 'hard':
        // Hard AI: Bid strategically
        return this.getStrategicBid(gameState, player, property, propertyValue, currentBid, maxBid);
    }
  }

  private getStrategicBid(gameState: GameState, player: Player, property: any, propertyValue: number, currentBid: number, maxBid: number): number {
    // Willing to pay more for strategic properties
    let multiplier = 0.9;

    // Increase bid for color group completion
    if (property.type === 'property' && property.group) {
      const groupProperties = gameState.squares.filter(s =>
        s.type === 'property' && s.group === property.group
      );
      const ownedInGroup = groupProperties.filter(s => s.ownerId === this.playerId).length;

      if (ownedInGroup > 0) {
        multiplier = 1.2; // Pay 20% over value to complete group
      }
    }

    const strategicMax = Math.min(Math.floor(propertyValue * multiplier), maxBid);

    if (currentBid < strategicMax) {
      // Bid in increments of 30
      return currentBid + 30;
    }

    return 0;
  }

  /**
   * Decides whether to pay to get out of jail
   */
  shouldPayJailFine(gameState: GameState): boolean {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player) return false;

    const jailFine = 50;

    // Always pay if we have monopolies to develop
    const monopolies = this.findMonopolies(gameState);
    if (monopolies.length > 0 && player.money > 500) {
      return true;
    }

    switch (this.difficulty) {
      case 'easy':
        // Easy AI: Only pay if lots of money
        return player.money > 800;

      case 'medium':
        // Medium AI: Pay if we can afford it and on turn 2+
        return player.money > 300 && (player.jailTurns || 0) >= 2;

      case 'hard':
        // Hard AI: Strategic decision
        return player.money > 400 && (player.jailTurns || 0) >= 1;
    }
  }

  /**
   * Decides whether to use a Get Out of Jail Free card
   */
  shouldUseJailCard(gameState: GameState): boolean {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player || !player.getOutOfJailFreeCards || player.getOutOfJailFreeCards === 0) return false;

    // Save jail cards unless we need to get out
    const monopolies = this.findMonopolies(gameState);

    switch (this.difficulty) {
      case 'easy':
        return (player.jailTurns || 0) >= 3;

      case 'medium':
        return (player.jailTurns || 0) >= 2 || monopolies.length > 0;

      case 'hard':
        return monopolies.length > 0 || (player.jailTurns || 0) >= 2;
    }
  }

  /**
   * Make an autonomous turn decision
   */
  async makeDecision(gameState: GameState, turnState: string): Promise<AIDecision> {
    const player = gameState.players.find(p => p.id === this.playerId);
    if (!player) {
      return { action: 'wait' };
    }

    switch (turnState) {
      case 'rolling':
        return { action: 'roll', reasoning: 'Rolling dice to move' };

      case 'LandedOnUnownedProperty':
        const square = gameState.squares[player.position];
        const shouldBuy = this.shouldBuyProperty(gameState, square);
        return {
          action: shouldBuy ? 'buy' : 'decline',
          reasoning: shouldBuy ? `Buying ${square.name}` : `Declining ${square.name}`
        };

      case 'InJail':
        if (this.shouldUseJailCard(gameState)) {
          return { action: 'use-jail-card', reasoning: 'Using Get Out of Jail Free card' };
        }
        if (this.shouldPayJailFine(gameState)) {
          return { action: 'pay-jail-fine', reasoning: 'Paying $50 to exit jail' };
        }
        return { action: 'roll', reasoning: 'Attempting to roll doubles' };

      default:
        return { action: 'wait' };
    }
  }

  getPersonality(): string {
    return this.personality;
  }

  getDifficulty(): string {
    return this.difficulty;
  }
}

/**
 * Creates AI players to fill empty slots
 */
export function createAIPlayers(existingPlayerCount: number, maxPlayers: number = 8): Array<{ name: string; color: string; difficulty: 'easy' | 'medium' | 'hard' }> {
  const aiPlayers: Array<{ name: string; color: string; difficulty: 'easy' | 'medium' | 'hard' }> = [];

  const aiNames = [
    'AI Rockefeller', 'AI Carnegie', 'AI Vanderbilt', 'AI Morgan',
    'AI Gates', 'AI Buffett', 'AI Bezos', 'AI Musk'
  ];

  const aiColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];

  const difficulties: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];

  const spotsToFill = maxPlayers - existingPlayerCount;

  for (let i = 0; i < spotsToFill; i++) {
    const difficulty = difficulties[i % difficulties.length];
    aiPlayers.push({
      name: aiNames[existingPlayerCount + i] || `AI Player ${i + 1}`,
      color: aiColors[existingPlayerCount + i] || '#' + Math.floor(Math.random()*16777215).toString(16),
      difficulty
    });
  }

  return aiPlayers;
}
