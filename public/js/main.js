// Entry point
import { gameIdFromHash, connect, join } from './api.js';
import { state, setWebSocket } from './state.js';
import { showGame } from './ui.js';
import { buildBoard, updateOwners, updateTokens } from './board.js';
import { updateMoneybar, updateQuickStats, updateEventLog } from './hud.js';
import { renderDice } from './dice.js';
import { rollDice, buyProperty } from './actions.js';

// Expose state for debugging
window.__state = state;

const rollDiceBtn = document.getElementById('nextbutton');
const startButton = document.getElementById('startbutton');

function ensureConnStatus() {
  let el = document.getElementById('connstatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'connstatus';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

function showStatus(msg) {
  const el = ensureConnStatus();
  el.textContent = msg;
  el.style.display = 'block';
}

function hideStatus() {
  const el = ensureConnStatus();
  el.style.display = 'none';
}

function onOpen() {
  const playerName = document.getElementById('player1name').value;
  const playerColor = document.getElementById('player1color').value;
  const edition = (document.getElementById('edition')?.value) || 'classic';
  join(playerName, playerColor, edition);
}

function onWelcome(payload) {
  // payload.id is stored in state by api.js; nothing extra here.
  hideStatus(); // connected
}

function onState(gameState) {
  if (!state.boardBuilt && Array.isArray(gameState.squares) && gameState.squares.length === 40) {
    buildBoard(gameState.squares);
  }
  updateMoneybar(gameState);
  renderDice(gameState.dice);
  updateQuickStats(gameState);
  updateOwners(gameState);
  updateTokens(gameState);
  updateEventLog(gameState);

  // Enable roll button for current player
  const rollDiceBtn = document.getElementById('nextbutton');
  if (state.playerId !== undefined) {
    rollDiceBtn.disabled = (gameState.currentPlayerId !== state.playerId);
  } else {
    rollDiceBtn.disabled = true;
  }

  // If this is the first state we received after Start, ensure status is hidden
  hideStatus();
}

function onError(err) {
  console.error('Server error:', err);
  showStatus(`Connection error. ${err?.message || ''}`.trim());
}

function onClose() {
  console.log('Disconnected from WebSocket server.');
  showStatus('Connection lost.');
}

function startGame() {
  const id = gameIdFromHash();
  const ws = connect(id, { onWelcome, onState, onError, onClose, onOpen });
  setWebSocket(ws);
  // Show the board/controls immediately after clicking Start
  showGame();
  // Show connecting only after Start Game is clicked
  showStatus('Connecting…');
}

if (startButton) startButton.onclick = startGame;

if (rollDiceBtn) rollDiceBtn.onclick = rollDice;

// Hide not-yet-implemented items
const manageItem = document.getElementById('manage-menu-item');
const tradeItem = document.getElementById('trade-menu-item');
if (manageItem) manageItem.style.display = 'none';
if (tradeItem) tradeItem.style.display = 'none';

const buyItem = document.getElementById('buy-menu-item');
if (buyItem) buyItem.onclick = buyProperty;

// View Log toggle
const viewLogBtn = document.getElementById('viewlog');
if (viewLogBtn) {
  viewLogBtn.onclick = () => {
    const panel = document.getElementById('eventlog');
    if (!panel) return;
    const isShown = panel.style.display !== 'none';
    panel.style.display = isShown ? 'none' : 'block';
    viewLogBtn.value = isShown ? 'View Log' : 'Hide Log';
  };
}
