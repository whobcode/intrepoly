// Board build + token/owner updates
import { state, markBoardBuilt } from './state.js';
import { groupColor } from './icons.js';

export function buildBoard(squares) {
  if (state.boardBuilt) return;
  for (let i = 0; i < squares.length; i++) {
    const s = squares[i];
    const cell = document.getElementById(`cell${i}`);
    if (!cell) continue;

    cell.innerHTML = '';
    const anchor = document.createElement('div');
    anchor.id = `cell${i}anchor`;
    anchor.className = 'cell-anchor';
    cell.appendChild(anchor);

    const holder = document.createElement('div');
    holder.id = `cell${i}positionholder`;
    holder.className = 'cell-position-holder';
    anchor.appendChild(holder);

    const name = document.createElement('div');
    name.id = `cell${i}name`;
    name.className = 'cell-name';
    name.textContent = s.name;
    anchor.appendChild(name);

    if (s.type === 'property' || s.type === 'railroad' || s.type === 'utility') {
      const owner = document.createElement('div');
      owner.id = `cell${i}owner`;
      owner.className = 'cell-owner';
      anchor.appendChild(owner);
    }

    // Property color bands
    if (s.type === 'property') {
      const band = document.createElement('div');
      band.className = 'cell-color-band';
      band.style.backgroundColor = groupColor(s.group);
      // Place based on board edge
      if (cell.classList.contains('board-top')) {
        band.classList.add('band-horizontal');
        band.style.top = '0';
        band.style.left = '0';
      } else if (cell.classList.contains('board-bottom')) {
        band.classList.add('band-horizontal');
        band.style.bottom = '0';
        band.style.left = '0';
      } else if (cell.classList.contains('board-left')) {
        band.classList.add('band-vertical');
        band.style.left = '0';
        band.style.top = '0';
      } else if (cell.classList.contains('board-right')) {
        band.classList.add('band-vertical');
        band.style.right = '0';
        band.style.top = '0';
      }
      anchor.appendChild(band);
    }

    // Icons for special squares (and utilities/railroads)
    const asset = assetForSquare(s.type);
    if (asset) {
      const center = document.createElement('div');
      center.className = 'cell-center';
      const img = document.createElement('img');
      img.src = `images/${asset}`;
      img.alt = s.name;
      center.appendChild(img);
      anchor.appendChild(center);
    }
  }
  markBoardBuilt();
}

function assetForSquare(type) {
  switch (type) {
    case 'go': return 'board_go.svg';
    case 'jail': return 'board_jail.svg';
    case 'free-parking': return 'board_free_parking.svg';
    case 'go-to-jail': return 'board_go_to_jail.svg';
    case 'railroad': return 'board_railroad.svg';
    case 'utility': return 'board_electric.svg';
    case 'chance': return 'board_chance.svg';
    case 'community-chest': return 'board_community_chest.svg';
    case 'tax': return 'board_tax.svg';
    default: return null;
  }
}

export function updateOwners(gameState) {
  if (!state.boardBuilt) return;
  for (const sq of gameState.squares) {
    const ownerEl = document.getElementById(`cell${sq.id}owner`);
    if (!ownerEl) continue;
    if (sq.ownerId === undefined) {
      ownerEl.style.display = 'none';
    } else {
      ownerEl.style.display = 'block';
      const owner = gameState.players.find(p => p.id === sq.ownerId);
      ownerEl.style.backgroundColor = owner ? owner.color : '#000';
      ownerEl.title = owner ? owner.name : '';
    }
  }
}

export function updateTokens(gameState) {
  document.querySelectorAll('.cell-position-holder').forEach(el => el.innerHTML = '');
  for (const p of gameState.players) {
    const cell = document.getElementById(`cell${p.position}positionholder`);
    if (cell) {
      const token = document.createElement('div');
      token.className = 'cell-position';
      token.title = p.name;
      token.style.backgroundColor = p.color;
      cell.appendChild(token);
    }
  }
}
