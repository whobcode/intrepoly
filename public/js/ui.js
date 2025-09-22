// Simple UI helpers

export function showGame() {
  const setupDiv = document.getElementById('setup');
  const boardDiv = document.getElementById('board');
  const boardWrap = document.getElementById('boardwrap');
  const controlDiv = document.getElementById('control');
  const moneyBarDiv = document.getElementById('moneybar');
  if (setupDiv) setupDiv.style.display = 'none';
  if (boardDiv) boardDiv.style.display = 'block';
  if (boardWrap) boardWrap.style.display = 'flex';
  if (controlDiv) controlDiv.style.display = 'block';
  if (moneyBarDiv) moneyBarDiv.style.display = 'block';
}
