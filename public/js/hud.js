export function updateMoneybar(gameState) {
  for (const p of gameState.players) {
    const pMoney = document.getElementById(`p${p.id + 1}money`);
    const pName = document.getElementById(`p${p.id + 1}moneyname`);
    if (pMoney && pName) {
      pMoney.textContent = p.money;
      pName.textContent = p.name;
      document.getElementById(`p${p.id + 1}moneybar`).style.borderColor = p.color;
      document.getElementById(`moneybarrow${p.id + 1}`).style.display = 'table-row';
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
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
