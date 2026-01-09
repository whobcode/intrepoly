// WebSocket API wrapper
import { state, setWebSocket, setPlayerId } from './state.js';
import { appendChatMessage } from './chat.js';

/**
 * Gets the game ID from the URL hash.
 * If no game ID exists, creates a new lobby and uses that ID.
 * @returns {string} The game ID
 */
export function gameIdFromHash() {
  let gameId = window.location.hash.substring(1);
  if (!gameId) {
    // Generate a friendly game ID using same format as server
    const adjectives = ['swift', 'brave', 'lucky', 'happy', 'bold', 'cool', 'wild', 'calm', 'epic', 'mega', 'super', 'ultra'];
    const nouns = ['dragon', 'tiger', 'phoenix', 'falcon', 'wolf', 'bear', 'lion', 'eagle', 'shark', 'whale', 'dolphin', 'cobra'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    gameId = `${adj}-${noun}-${num}`;
    window.location.hash = gameId;

    // Show a hint that they should share the URL
    setTimeout(() => {
      const status = document.getElementById('connstatus');
      if (status) {
        status.textContent = 'Share this URL with friends to play together!';
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 4000);
      }
    }, 1000);
  }
  return gameId;
}

/**
 * Gets the current game ID without creating a new one
 * @returns {string|null} The game ID or null if none exists
 */
export function getCurrentGameId() {
  const hash = window.location.hash.substring(1);
  return hash || null;
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
        // If state carries chat history, hydrate UI once
        try {
          const chat = message.payload?.chat;
          if (Array.isArray(chat) && chat.length) {
            window.__chatHydrated ||= false;
            if (!window.__chatHydrated) {
              for (const m of chat.slice(-100)) appendChatMessage(m);
              window.__chatHydrated = true;
            }
          }
        } catch {}
      } else if (message.type === 'CHAT_MESSAGE') {
        appendChatMessage(message.payload);
      } else if (message.type === 'PEER_JOINED' || message.type === 'PEER_LEFT' ||
                 message.type === 'EXISTING_VIDEO_PEERS' ||
                 message.type === 'WEBRTC_OFFER' || message.type === 'WEBRTC_ANSWER' ||
                 message.type === 'WEBRTC_ICE') {
        // WebRTC signaling messages - pass entire message
        onState && onState(message);
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

export function sendChat(text) {
  const ws = state.ws;
  const t = String(text || '').trim();
  if (!t || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ action: 'chat', payload: { text: t } }));
}

export function join(name, color, edition = 'classic') {
  const lowered = (name || '').toString().trim().toLowerCase();
  const user = window.__user || (lowered === 'whobcode13' ? 'whobcode13' : undefined);

  // Include player count and host status from session
  const playerCount = window.__playerCount || null;
  const isHost = window.__isHost || false;

  send('join', { name, color, edition, user, playerCount, isHost });
}
