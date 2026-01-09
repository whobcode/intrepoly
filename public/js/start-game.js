// Start Game logic
import { send } from './api.js';

let gameStarted = false;

export function initStartGame() {
  const startBtn = document.getElementById('start-game-btn');
  const modal = document.getElementById('player-count-modal');
  const select4Btn = document.getElementById('select-4-players');
  const select8Btn = document.getElementById('select-8-players');
  const cancelBtn = document.getElementById('cancel-start-game');

  if (!startBtn || !modal) {
    console.warn('Start game elements not found');
    return;
  }

  // Show modal when Start Game is clicked
  startBtn.addEventListener('click', () => {
    if (gameStarted) {
      alert('Game has already been started!');
      return;
    }
    modal.style.display = 'block';
  });

  // Handle 4 players selection
  select4Btn.addEventListener('click', () => {
    startGameWithPlayers(4);
    modal.style.display = 'none';
  });

  // Handle 8 players selection
  select8Btn.addEventListener('click', () => {
    startGameWithPlayers(8);
    modal.style.display = 'none';
  });

  // Handle cancel
  cancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close modal on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

function startGameWithPlayers(playerCount) {
  console.log(`Starting game with ${playerCount} players`);

  // Send message to server to start game and fill with AI
  send('start-game', { totalPlayers: playerCount });

  gameStarted = true;

  // Hide the start button
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.style.display = 'none';
  }

  // Show success message
  const log = document.getElementById('eventlog');
  if (log) {
    const message = document.createElement('div');
    message.textContent = `🎮 Game starting with ${playerCount} players! AI agents joining...`;
    message.style.color = '#28a745';
    message.style.fontWeight = 'bold';
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }
}

export function isGameStarted() {
  return gameStarted;
}

export function hideStartButton() {
  gameStarted = true;
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.style.display = 'none';
  }
}
