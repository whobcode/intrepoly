// Simple UI helpers

export function showGame() {
  const setupDiv = document.getElementById('setup');
  const boardDiv = document.getElementById('board');
  const boardWrap = document.getElementById('boardwrap');
  const controlDiv = document.getElementById('control');
  const moneyBarDiv = document.getElementById('moneybar');
  const leftSidebar = document.getElementById('left-sidebar');
  const gamestats = document.getElementById('gamestats');
  if (setupDiv) setupDiv.style.display = 'none';
  if (boardDiv) boardDiv.style.display = 'block';
  if (boardWrap) boardWrap.style.display = 'flex';
  if (controlDiv) controlDiv.style.display = 'block';
  if (moneyBarDiv) moneyBarDiv.style.display = 'block';
  if (leftSidebar) leftSidebar.style.display = 'block';
  if (gamestats) gamestats.style.display = 'block';
}

export function hideGame() {
  const setupDiv = document.getElementById('setup');
  const boardDiv = document.getElementById('board');
  const boardWrap = document.getElementById('boardwrap');
  const controlDiv = document.getElementById('control');
  const moneyBarDiv = document.getElementById('moneybar');
  const leftSidebar = document.getElementById('left-sidebar');
  const gamestats = document.getElementById('gamestats');
  const videoPanel = document.getElementById('video-panel');
  if (setupDiv) setupDiv.style.display = 'block';
  if (boardDiv) boardDiv.style.display = 'none';
  if (boardWrap) boardWrap.style.display = 'none';
  if (controlDiv) controlDiv.style.display = 'none';
  if (moneyBarDiv) moneyBarDiv.style.display = 'none';
  if (leftSidebar) leftSidebar.style.display = 'none';
  if (gamestats) gamestats.style.display = 'none';
  if (videoPanel) videoPanel.style.display = 'none';
}

export function updateGameStats(gameState) {
  if (!gameState) return;

  const turnEl = document.getElementById('stat-turn');
  const currentPlayerEl = document.getElementById('stat-current-player');
  const phaseEl = document.getElementById('stat-phase');
  const lastRollEl = document.getElementById('stat-last-roll');
  const bankerMsgEl = document.getElementById('banker-message');

  if (turnEl) turnEl.textContent = gameState.turn || 1;

  if (currentPlayerEl && gameState.players) {
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    currentPlayerEl.textContent = currentPlayer ? currentPlayer.name : '-';
    if (currentPlayer) {
      currentPlayerEl.style.color = currentPlayer.color || 'inherit';
    }
  }

  if (phaseEl) {
    const phase = gameState.turnState || 'waiting';
    const phaseLabels = {
      'rolling': '🎲 Rolling',
      'moving': '🚶 Moving',
      'buying': '🏠 Buying',
      'paying': '💰 Paying',
      'auctioning': '🔨 Auction',
      'trading': '🤝 Trading',
      'end': '✅ End Turn',
      'waiting': '⏳ Waiting'
    };
    phaseEl.textContent = phaseLabels[phase] || phase;
  }

  if (lastRollEl) {
    const dice = gameState.lastDice || gameState.dice;
    if (dice && dice[0] && dice[1]) {
      lastRollEl.textContent = `${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}`;
    }
  }

  // Update banker message based on game state
  if (bankerMsgEl) {
    const log = gameState.log || [];
    const lastLog = log[log.length - 1];
    if (lastLog) {
      bankerMsgEl.textContent = lastLog;
    }
  }
}
