// Action helpers
import { send } from './api.js';

export function rollDice() {
  send('rollDice');
}

export function buyProperty() {
  send('buyProperty');
}

export function endTurn() {
  send('endTurn');
}

export function addLocalPlayers(count) {
  send('addLocalPlayers', { count });
}

export function buildHouse(squareId) {
  send('buildHouse', { squareId });
}

export function mortgage(squareId) {
  send('mortgage', { squareId });
}

export function unmortgage(squareId) {
  send('unmortgage', { squareId });
}
