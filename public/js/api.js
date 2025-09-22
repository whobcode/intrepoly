// WebSocket API wrapper
import { state, setWebSocket, setPlayerId } from './state.js';

export function gameIdFromHash() {
  let gameId = window.location.hash.substring(1);
  if (!gameId) {
    gameId = 'game-' + Math.random().toString(36).slice(2, 11);
    window.location.hash = gameId;
  }
  return gameId;
}

function getWsOrigin() {
  try {
    const url = new URL(window.location.href);
    const qs = url.searchParams.get('ws');
    if (qs) {
      // Persist override for reloads
      window.localStorage.setItem('WS_ORIGIN', qs);
      return qs.replace(/\/$/, '');
    }
    const stored = window.localStorage.getItem('WS_ORIGIN');
    if (stored) return stored.replace(/\/$/, '');
  } catch {}
  return window.location.origin.replace(/^http/, 'ws');
}

export function connect(gameId, { onWelcome, onState, onError, onClose, onOpen } = {}) {
  const wsBase = getWsOrigin();
  const wsUrl = `${wsBase}/api/game/${gameId}/websocket`;
  const ws = new WebSocket(wsUrl);
  setWebSocket(ws);

  ws.onopen = () => {
    onOpen && onOpen();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'WELCOME') {
        setPlayerId(message.payload.id);
        onWelcome && onWelcome(message.payload);
      } else if (message.type === 'GAME_STATE_UPDATE') {
        onState && onState(message.payload);
      } else if (message.error) {
        onError && onError(message.error);
      }
    } catch (e) {
      console.error('Invalid WS message', e);
    }
  };

  ws.onclose = () => onClose && onClose();
  ws.onerror = (err) => onError && onError(err);

  return ws;
}

export function getWebSocket() {
  return state.ws;
}

export function send(action, payload = {}) {
  const ws = state.ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action, payload }));
  }
}

export function join(name, color, edition = 'classic') {
  send('join', { name, color, edition });
}
