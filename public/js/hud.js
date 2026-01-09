export function updateMoneybar(gameState) {
  console.log(`[updateMoneybar] Called with ${gameState.players?.length || 0} players`, gameState.players);

  // Hide all rows first
  for (let i = 1; i <= 8; i++) {
    const row = document.getElementById(`moneybarrow${i}`);
    if (row) row.style.display = 'none';
  }

  // Show and update rows for active players
  for (const p of gameState.players) {
    const rowNum = p.id + 1;
    const pMoney = document.getElementById(`p${rowNum}money`);
    const pName = document.getElementById(`p${rowNum}moneyname`);
    const pBar = document.getElementById(`p${rowNum}moneybar`);
    const row = document.getElementById(`moneybarrow${rowNum}`);

    if (pMoney && pName && pBar && row) {
      pMoney.textContent = p.money;
      pName.textContent = p.name;
      pBar.style.borderColor = p.color;
      row.style.display = 'table-row';
      console.log(`[updateMoneybar] Updated row ${rowNum} for ${p.name} (${p.isHuman ? 'Human' : 'AI'}): $${p.money}`);
    } else {
      console.warn(`Missing moneybar elements for player ${p.id} (${p.name})`);
    }
  }
}

export function updateQuickStats(gameState) {
  const current = gameState.players.find(p => p.id === gameState.currentPlayerId);
  if (current) {
    document.getElementById('pname').textContent = current.name;
    document.getElementById('pmoney').textContent = `$${current.money}`;
    document.getElementById('quickstats').style.borderColor = current.color;
  }
}

export function updateEventLog(gameState, limit = 15) {
  const list = document.getElementById('eventlog-list');
  if (!list || !Array.isArray(gameState.log)) return;
  const items = gameState.log.slice(-limit);
  list.innerHTML = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  // cache last state for trade UI
  try { state.lastGameState = gameState; } catch {}
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
