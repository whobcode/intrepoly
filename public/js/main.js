// Entry point
import { gameIdFromHash, connect, join, send } from './api.js';
import { state, setWebSocket } from './state.js';
import { showGame } from './ui.js';
import { buildBoard, updateOwners, updateTokens } from './board.js';
import { updateMoneybar, updateQuickStats, updateEventLog } from './hud.js';
import { initChatUI } from './chat.js';
import { renderDice } from './dice.js';
import { rollDice, buyProperty } from './actions.js';
import { whoAmI, login, logout } from './auth.js';
import { initVideoChat, handleWebRTCMessage } from './video-chat.js';
import { initBoardLogoCycling } from './board-logo.js';

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
  const url = new URL(window.location.href);
  const spectate = url.searchParams.get('spectate') === '1';
  if (!spectate) {
    const playerName = document.getElementById('player1name').value;
    const playerColor = document.getElementById('player1color').value;
    const edition = (document.getElementById('edition')?.value) || 'classic';
    join(playerName, playerColor, edition);
  } else {
    // Hide controls when spectating
    const controlDiv = document.getElementById('control');
    if (controlDiv) controlDiv.style.display = 'none';
  }
}

function onWelcome(payload) {
  // payload.id is stored in state by api.js; nothing extra here.
  hideStatus(); // connected
  // Add CPU players requested at setup
  const aiCountEl = document.getElementById('aiCount');
  const aiCount = aiCountEl ? parseInt(aiCountEl.value || '0', 10) : 0;
  if (aiCount > 0) {
    const getModel = window.getSelectedAiModel ? window.getSelectedAiModel() : undefined;
    const modelId = typeof getModel === 'string' ? getModel : undefined;
    send('addNPC', { count: aiCount, modelId });
  }
  // Add local extra humans requested at setup (beyond Player 1)
  const localCountEl = document.getElementById('localCount');
  const localCount = localCountEl ? parseInt(localCountEl.value || '1', 10) : 1;
  if (localCount > 1) {
    send('addLocalPlayers', { count: localCount - 1 });
  }
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
  // cache
  window.__state.lastGameState = gameState;

  // Handle WebRTC messages
  if (gameState.type && gameState.type.startsWith('PEER_') || gameState.type && gameState.type.startsWith('WEBRTC_')) {
    handleWebRTCMessage(gameState);
  }

  // Live trade UI updates if modal open
  const tradeModal = document.getElementById('trademodal');
  if (tradeModal && tradeModal.style.display !== 'none') {
    refreshTradeModal(gameState);
  }

  // Presence update
  if (gameState._presence) {
    const p = document.getElementById('presence');
    if (p) p.textContent = `Players: ${gameState._presence.players} — Viewers: ${gameState._presence.spectators}`;
  }

  // Game over overlay
  if (gameState.status === 'finished') {
    const overlay = document.getElementById('gameover');
    const winner = gameState.players.find(p => p.id === gameState.winnerId);
    if (overlay) {
      document.getElementById('gameover-winner').textContent = winner ? `${winner.name} wins!` : 'Game finished.';
      // Final standings by money desc
      const standings = [...gameState.players].sort((a,b)=> (b.money||0)-(a.money||0));
      const list = standings.map(p => `<div>${p.name}: $${p.money}${p.bankrupt?' (bankrupt)':''}</div>`).join('');
      const box = document.getElementById('final-standings');
      if (box) box.innerHTML = list;
      overlay.style.display = 'block';
      const newBtn = document.getElementById('newgamebtn');
      if (newBtn) newBtn.onclick = () => { window.location.hash = ''; window.location.reload(); };
    }
  }

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

async function startGame() {
  // Allow special username to bypass login
  if (!window.__user) {
    const nameVal = (document.getElementById('player1name')?.value || '').trim();
    if (nameVal.toLowerCase() === 'whobcode13') {
      try { await (await import('./auth.js')).login('whobcode13'); await refreshAuth(); }
      catch {
        // If login endpoint not available, set local identity so join() carries it
        window.__user = 'whobcode13';
        const status = document.getElementById('authstatus');
        if (status) status.textContent = 'Signed in as whobcode13';
      }
    }
  }
  if (!window.__user) { openLogin(); return; }
  const id = gameIdFromHash();
  const ws = connect(id, { onWelcome, onState, onError, onClose, onOpen });
  setWebSocket(ws);
  // Show the board/controls immediately after clicking Start
  showGame();
  // Initialize board logo cycling
  initBoardLogoCycling();
  // Show connecting only after Start Game is clicked
  showStatus('Connecting…');
}

if (startButton) startButton.onclick = startGame;

if (rollDiceBtn) rollDiceBtn.onclick = rollDice;

// Hide not-yet-implemented items
const manageItem = document.getElementById('manage-menu-item');
const tradeItem = document.getElementById('trade-menu-item');
if (manageItem) manageItem.style.display = 'none';
if (tradeItem) { tradeItem.style.display = ''; tradeItem.onclick = openTrade; }

const buyItem = document.getElementById('buy-menu-item');
if (buyItem) buyItem.onclick = buyProperty;
const endTurnBtn = document.getElementById('endturn');
if (endTurnBtn) endTurnBtn.onclick = () => send('endTurn');
const buildBtn = document.getElementById('build');
if (buildBtn) buildBtn.onclick = () => {
  const id = prompt('Build on which square id?');
  if (id) send('buildHouse', { squareId: parseInt(id, 10) });
};
const mortgageBtn = document.getElementById('mortgage');
if (mortgageBtn) mortgageBtn.onclick = () => {
  const id = prompt('Mortgage which square id?');
  if (id) send('mortgage', { squareId: parseInt(id, 10) });
};
const unmortgageBtn = document.getElementById('unmortgage');
if (unmortgageBtn) unmortgageBtn.onclick = () => {
  const id = prompt('Unmortgage which square id?');
  if (id) send('unmortgage', { squareId: parseInt(id, 10) });
};
const startAuctionBtn = document.getElementById('startauction');
if (startAuctionBtn) startAuctionBtn.onclick = () => {
  const gs = window.__state?.lastGameState;
  if (!gs) return;
  const sq = gs.squares[gs.players.find(p=>p.id===gs.currentPlayerId)?.position || 0];
  const id = prompt('Start auction for which square id?', (sq?.id ?? 0).toString());
  if (id) send('startAuction', { squareId: parseInt(id, 10) });
  openAuctionModal();
};

function openAuctionModal() {
  const modal = document.getElementById('auctionmodal');
  if (!modal) return;
  modal.style.display = 'block';
  refreshAuction();
  document.getElementById('placebid').onclick = () => {
    const amt = parseInt(document.getElementById('bidamount').value || '0', 10) || 0;
    if (amt > 0) send('placeBid', { amount: amt });
  };
  document.getElementById('auctionclose').onclick = () => { modal.style.display = 'none'; };
}

function refreshAuction() {
  const modal = document.getElementById('auctionmodal');
  if (!modal || modal.style.display === 'none') return;
  const gs = window.__state?.lastGameState;
  const a = gs?.auction;
  const info = document.getElementById('auctioninfo');
  const timer = document.getElementById('auctiontimer');
  if (!a) { info.textContent = 'No auction in progress.'; timer.textContent = '--'; return; }
  const sq = gs.squares[a.squareId];
  const leader = a.highestBidderId !== undefined ? gs.players.find(p=>p.id===a.highestBidderId)?.name : 'None';
  info.textContent = `${sq.name} — highest bid $${a.highestBid || 0} by ${leader || 'None'}`;
  const remaining = Math.max(0, Math.floor(((a.endTime||0) - Date.now())/1000));
  timer.textContent = `${remaining}s`;
}

setInterval(refreshAuction, 1000);

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

// Auth wiring
let loginModal;
function openLogin() {
  loginModal = loginModal || document.getElementById('loginmodal');
  if (loginModal) loginModal.style.display = 'block';
}
function closeLogin() {
  if (loginModal) loginModal.style.display = 'none';
}

async function refreshAuth() {
  try {
    const res = await whoAmI();
    const status = document.getElementById('authstatus');
    const loginBtn = document.getElementById('loginbtn');
    const logoutBtn = document.getElementById('logoutbtn');
    window.__user = res.user || null;
    if (res.user) {
      const stats = res.stats ? ` — W:${res.stats.wins||0} L:${res.stats.losses||0} C:${res.stats.credits||0}` : '';
      if (status) status.textContent = `Signed in as ${res.user}${stats}`;
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = '';
      const nameInput = document.getElementById('player1name');
      if (nameInput && !nameInput.value) nameInput.value = res.user;
    } else {
      if (status) status.textContent = 'Signed out';
      if (loginBtn) loginBtn.style.display = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  } catch {}
}

window.addEventListener('DOMContentLoaded', async () => {
  await refreshAuth();
  initChatUI();
  initVideoChat();

  const loginBtn = document.getElementById('loginbtn');
  const logoutBtn = document.getElementById('logoutbtn');
  const loginSubmit = document.getElementById('loginsubmit');
  const loginCancel = document.getElementById('logincancel');
  const signupBtn = document.getElementById('signupbtn');
  const loginEmailBtn = document.getElementById('loginemailbtn');
  const shareBtn = document.getElementById('sharelink');
  const minimizeVideoBtn = document.getElementById('minimize-video-btn');

  if (loginBtn) loginBtn.onclick = openLogin;
  if (logoutBtn) logoutBtn.onclick = async () => { await logout(); await refreshAuth(); };
  if (loginSubmit) loginSubmit.onclick = async () => {
    const name = document.getElementById('loginname').value.trim();
    if (name) { await login(name); await refreshAuth(); closeLogin(); }
  };
  if (loginCancel) loginCancel.onclick = closeLogin;
  if (signupBtn) signupBtn.onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (email && username && password) { await (await import('./auth.js')).signup(email, username, password); await refreshAuth(); }
  };
  if (loginEmailBtn) loginEmailBtn.onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (email && password) { await (await import('./auth.js')).loginEmail(email, password); await refreshAuth(); closeLogin(); }
  };
  if (shareBtn) shareBtn.onclick = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); showStatus('Invite link copied.'); setTimeout(hideStatus, 1200);} catch {}
  };

  // Video panel minimize toggle
  if (minimizeVideoBtn) {
    minimizeVideoBtn.onclick = () => {
      const videoPanel = document.getElementById('video-panel');
      const videoGrid = document.getElementById('video-grid');
      const videoControls = document.getElementById('video-controls');

      if (videoGrid.style.display === 'none') {
        videoGrid.style.display = 'grid';
        videoControls.style.display = 'flex';
        minimizeVideoBtn.textContent = '_';
        minimizeVideoBtn.title = 'Minimize';
      } else {
        videoGrid.style.display = 'none';
        videoControls.style.display = 'none';
        minimizeVideoBtn.textContent = '□';
        minimizeVideoBtn.title = 'Restore';
      }
    };
  }
});

// Trade UI
function openTrade() {
  const modal = document.getElementById('trademodal');
  if (!modal) return;
  refreshTradeModal(window.__state?.lastGameState);
  modal.style.display = 'block';
  document.getElementById('proposetrade').onclick = () => {
    const to = parseInt(targetSel.value, 10);
    const offerMoney = parseInt(document.getElementById('offerMoney').value || '0', 10) || 0;
    const requestMoney = parseInt(document.getElementById('requestMoney').value || '0', 10) || 0;
    const offerPropsSel = Array.from(offerProps.selectedOptions).map(o => parseInt(o.value, 10));
    const requestPropsSel = Array.from(requestProps.selectedOptions).map(o => parseInt(o.value, 10));
    if (to) {
      send('proposeTrade', {
        recipientId: to,
        offer: { money: offerMoney, properties: offerPropsSel, jailCards: 0 },
        request: { money: requestMoney, properties: requestPropsSel, jailCards: 0 }
      });
    }
  };
  document.getElementById('accepttrade').onclick = () => send('acceptTrade');
  document.getElementById('rejecttrade').onclick = () => send('rejectTrade');
  document.getElementById('tradeclose').onclick = () => { modal.style.display = 'none'; };
}

function refreshTradeModal(gs) {
  const modal = document.getElementById('trademodal');
  if (!modal || !gs) return;
  const targetSel = document.getElementById('tradetarget');
  const offerProps = document.getElementById('offerProps');
  const requestProps = document.getElementById('requestProps');
  targetSel.innerHTML = '';
  offerProps.innerHTML = '';
  requestProps.innerHTML = '';
  // Populate target list
  for (const p of gs.players) {
    if (p.id !== window.__state.playerId && !p.bankrupt) {
      const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.name} ($${p.money})`;
      targetSel.appendChild(opt);
    }
  }
  // Group properties by owner and color
  const mine = gs.squares.filter(s => s.ownerId === window.__state.playerId);
  const theirs = gs.squares.filter(s => s.ownerId !== undefined && gs.players.find(p => p.id === s.ownerId)?.id !== window.__state.playerId);
  const groupLabel = g => g?.replace('-', ' ') || 'misc';
  const addGrouped = (list, squares) => {
    const byGroup = new Map();
    for (const s of squares) {
      const k = s.group || 'other';
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(s);
    }
    for (const [g, arr] of byGroup.entries()) {
      const og = document.createElement('optgroup');
      og.label = groupLabel(g);
      for (const s of arr) {
        const houses = s.houses ? ` (${s.houses === 5 ? 'Hotel' : s.houses+' houses'})` : '';
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = `${s.name}${houses}`;
        og.appendChild(opt);
      }
      list.appendChild(og);
    }
  };
  addGrouped(offerProps, mine);
  addGrouped(requestProps, theirs);
  // Accept/reject visibility
  const acceptBtn = document.getElementById('accepttrade');
  const rejectBtn = document.getElementById('rejecttrade');
  if (gs.trade && gs.trade.recipientId === window.__state.playerId) {
    acceptBtn.style.display = '';
    rejectBtn.style.display = '';
  } else {
    acceptBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
  }
}

// Mobile responsive functionality
function initMobileResponsiveness() {
  const moneybarwrap = document.getElementById('moneybarwrap');
  const boardwrap = document.getElementById('boardwrap');
  const control = document.getElementById('control');

  // Check if we're on mobile
  function isMobile() {
    return window.innerWidth <= 767;
  }

  // Toggle player list visibility on mobile
  function togglePlayerList() {
    if (isMobile() && moneybarwrap) {
      moneybarwrap.classList.toggle('show-mobile');
    }
  }

  // Create toggle button for player list on mobile
  function createMobileToggle() {
    if (isMobile() && !document.getElementById('toggle-players')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'toggle-players';
      toggleBtn.textContent = '👥';
      toggleBtn.title = 'Toggle player list';
      toggleBtn.style.display = 'block';
      toggleBtn.addEventListener('click', togglePlayerList);
      document.body.appendChild(toggleBtn);
    } else if (!isMobile() && document.getElementById('toggle-players')) {
      document.getElementById('toggle-players').remove();
      if (moneybarwrap) {
        moneybarwrap.classList.remove('show-mobile');
      }
    }
  }

  // Adjust control button sizing on mobile
  function adjustControlButtons() {
    const buttons = document.querySelectorAll('.control-button');
    if (isMobile()) {
      buttons.forEach(btn => {
        btn.style.flex = '0 0 auto';
        btn.style.minWidth = '60px';
      });
    }
  }

  // Handle viewport changes
  window.addEventListener('resize', () => {
    createMobileToggle();
    adjustControlButtons();
  });

  // Initial setup
  createMobileToggle();
  adjustControlButtons();

  // Close player list when clicking elsewhere on mobile
  document.addEventListener('click', (e) => {
    if (isMobile() && moneybarwrap && moneybarwrap.classList.contains('show-mobile')) {
      if (!moneybarwrap.contains(e.target) && !e.target.matches('#toggle-players') && !e.target.closest('#toggle-players')) {
        moneybarwrap.classList.remove('show-mobile');
      }
    }
  });
}

// Initialize mobile responsiveness after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileResponsiveness);
} else {
  initMobileResponsiveness();
}

// Keep WebSocket alive
setInterval(() => { try { send('ping'); } catch {} }, 30000);
