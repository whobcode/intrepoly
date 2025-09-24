// Client-side state container
export const state = {
  ws: null,
  playerId: undefined,
  boardBuilt: false,
  lastGameState: undefined,
};

export function setWebSocket(ws) {
  state.ws = ws;
}

export function setPlayerId(id) {
  state.playerId = id;
}

export function markBoardBuilt() {
  state.boardBuilt = true;
}
