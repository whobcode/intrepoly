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

    // Add click handler to show property info
    cell.addEventListener('click', () => showPropertyInfo(i));
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

    // Property color - color the entire cell
    if (s.type === 'property') {
      const color = groupColor(s.group);
      cell.style.backgroundColor = color;
      cell.setAttribute('data-band-color', color);
    }

    // Icons for special squares (and utilities/railroads)
    const asset = assetForSquare(s);
    if (asset) {
      const center = document.createElement('div');
      center.className = 'cell-center';
      const img = document.createElement('img');
      img.src = `https://raw.githubusercontent.com/whobcode/intrepimages/main/board/${asset}`;
      img.alt = `${s.name} — board square icon`;
      img.title = `Board icon for ${s.name}`;
      center.appendChild(img);
      anchor.appendChild(center);
    }
  }
  markBoardBuilt();
}

function assetForSquare(square) {
  switch (square.type) {
    case 'go': return 'board_go.svg';
    case 'jail': return 'board_jail.svg';
    case 'free-parking': return 'board_free_parking.svg';
    case 'go-to-jail': return 'board_go_to_jail.svg';
    case 'railroad': return 'board_railroad.svg';
    case 'utility':
        if (square.name === 'Water Works') {
            return 'board_water.svg';
        }
        return 'board_electric.svg';
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

// Show property info modal when a cell is clicked
function showPropertyInfo(squareId) {
  const gs = window.__state?.lastGameState;
  if (!gs || !gs.squares) return;

  const sq = gs.squares[squareId];
  if (!sq) return;

  const modal = document.getElementById('propertymodal');
  if (!modal) return;

  const header = document.getElementById('property-header');
  const nameEl = document.getElementById('property-name');
  const typeEl = document.getElementById('property-type');
  const priceSection = document.getElementById('property-price-section');
  const priceEl = document.getElementById('property-price');
  const rentSection = document.getElementById('property-rent-section');
  const rentList = document.getElementById('property-rent-list');
  const houseCostEl = document.getElementById('property-house-cost');
  const mortgageEl = document.getElementById('property-mortgage');
  const ownerEl = document.getElementById('property-owner');
  const housesEl = document.getElementById('property-houses');
  const currentRentEl = document.getElementById('property-current-rent');
  const mortgagedEl = document.getElementById('property-mortgaged');
  const squareIdEl = document.getElementById('property-square-id');

  // Set name
  nameEl.textContent = sq.name;

  // Set header color based on property group
  const color = groupColor(sq.group) || '#333';
  header.style.backgroundColor = color;

  // Set type label
  const typeLabels = {
    'go': '🎯 Start Square',
    'property': '🏠 Property',
    'railroad': '🚂 Railroad',
    'utility': '💡 Utility',
    'chance': '❓ Chance',
    'community-chest': '📦 Community Chest',
    'tax': '💰 Tax',
    'go-to-jail': '🚔 Go To Jail',
    'jail': '🔒 Jail / Just Visiting',
    'free-parking': '🅿️ Free Parking'
  };
  typeEl.textContent = typeLabels[sq.type] || sq.type;

  // Show/hide sections based on type
  const isProperty = sq.type === 'property';
  const isRailroad = sq.type === 'railroad';
  const isUtility = sq.type === 'utility';
  const isPurchasable = isProperty || isRailroad || isUtility;

  priceSection.style.display = isPurchasable ? 'block' : 'none';
  rentSection.style.display = isPurchasable ? 'block' : 'none';
  houseCostEl.style.display = isProperty ? 'block' : 'none';
  mortgageEl.style.display = isPurchasable ? 'block' : 'none';

  if (isPurchasable) {
    priceEl.textContent = sq.price || 0;
    mortgageEl.textContent = `Mortgage Value: $${Math.floor((sq.price || 0) / 2)}`;
  }

  // Build rent list
  rentList.innerHTML = '';
  if (isProperty && sq.rent) {
    const rentLabels = ['Base Rent', '1 House', '2 Houses', '3 Houses', '4 Houses', 'Hotel'];
    sq.rent.forEach((r, idx) => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.innerHTML = `<span>${rentLabels[idx]}:</span><span>$${r}</span>`;
      rentList.appendChild(div);
    });
  } else if (isRailroad) {
    const railroadRents = [
      { label: '1 Railroad owned', rent: 25 },
      { label: '2 Railroads owned', rent: 50 },
      { label: '3 Railroads owned', rent: 100 },
      { label: '4 Railroads owned', rent: 200 }
    ];
    railroadRents.forEach(r => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.innerHTML = `<span>${r.label}:</span><span>$${r.rent}</span>`;
      rentList.appendChild(div);
    });
  } else if (isUtility) {
    rentList.innerHTML = `
      <div>If one Utility owned: 4× dice roll</div>
      <div>If both Utilities owned: 10× dice roll</div>
    `;
  }

  // House cost
  if (isProperty) {
    houseCostEl.innerHTML = `<strong>House Cost:</strong> $${sq.houseCost || 0} each`;
  }

  // Current status
  const owner = sq.ownerId !== undefined ? gs.players.find(p => p.id === sq.ownerId) : null;
  ownerEl.innerHTML = owner
    ? `<strong>Owner:</strong> <span style="color:${owner.color}">${owner.name}</span>`
    : '<strong>Owner:</strong> Unowned';

  if (isProperty) {
    const houses = sq.houses || 0;
    if (houses === 5) {
      housesEl.innerHTML = '<strong>Buildings:</strong> 🏨 Hotel';
    } else if (houses > 0) {
      housesEl.innerHTML = `<strong>Buildings:</strong> ${'🏠'.repeat(houses)} (${houses} house${houses > 1 ? 's' : ''})`;
    } else {
      housesEl.innerHTML = '<strong>Buildings:</strong> None';
    }
    housesEl.style.display = 'block';

    // Calculate current rent
    if (owner && sq.rent) {
      const currentRent = sq.rent[houses] || sq.rent[0];
      currentRentEl.innerHTML = `<strong>Current Rent:</strong> $${currentRent}`;
      currentRentEl.style.display = 'block';
    } else {
      currentRentEl.style.display = 'none';
    }
  } else {
    housesEl.style.display = 'none';
    currentRentEl.style.display = 'none';
  }

  // Mortgaged status
  if (sq.mortgaged) {
    mortgagedEl.textContent = '⚠️ MORTGAGED';
    mortgagedEl.style.display = 'block';
  } else {
    mortgagedEl.style.display = 'none';
  }

  // Square ID
  squareIdEl.textContent = `Square ID: ${squareId}`;

  // Show modal
  modal.style.display = 'block';

  // Close button handler
  document.getElementById('propertymodal-close').onclick = () => {
    modal.style.display = 'none';
  };

  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
}
