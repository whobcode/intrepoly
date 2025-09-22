// Action helpers
import { send } from './api.js';

export function rollDice() {
  send('rollDice');
}

export function buyProperty() {
  send('buyProperty');
}

