// New client-side logic to connect to the WebSocket backend

// --- Global Variables ---
let ws;
let player_id; // The ID assigned by the server for this client

// --- UI Elements ---
const setupDiv = document.getElementById('setup');
const boardDiv = document.getElementById('board');
const controlDiv = document.getElementById('control');
const moneyBarDiv = document.getElementById('moneybar');
const rollDiceBtn = document.getElementById('nextbutton');

function showGame() {
    setupDiv.style.display = 'none';
    boardDiv.style.display = 'block';
    controlDiv.style.display = 'block';
    moneyBarDiv.style.display = 'block';
}

function connectWebSocket() {
    // Generate a random game ID or get from URL
    let gameId = window.location.hash.substring(1);
    if (!gameId) {
        gameId = 'game-' + Math.random().toString(36).substr(2, 9);
        window.location.hash = gameId;
    }

    const wsUrl = `ws://${window.location.host}/api/game/${gameId}/websocket`;
    console.log(`Connecting to ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to WebSocket server.');
        const playerName = document.getElementById('player1name').value;
        const playerColor = document.getElementById('player1color').value;

        // For simplicity, we'll just handle one human player for now.
        // The setup screen needs a redesign for a multiplayer-first approach.
        ws.send(JSON.stringify({
            action: 'join',
            payload: { name: playerName, color: playerColor }
        }));
        showGame();
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        if (message.type === 'WELCOME') {
            player_id = message.payload.id;
            console.log(`Assigned player ID: ${player_id}`);
        } else if (message.type === 'GAME_STATE_UPDATE') {
            updateUI(message.payload);
        } else if (message.error) {
            console.error('Server error:', message.error);
            alert(`Error: ${message.error}`);
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server.');
        alert('Connection lost. Please refresh to reconnect.');
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        alert('An error occurred with the connection.');
    };
}

function updateUI(gameState) {
    // TODO: Implement the logic to render the entire game state
    console.log('Updating UI with new game state:', gameState);

    // Example: Update player money
    for (const player of gameState.players) {
        const pMoney = document.getElementById(`p${player.id + 1}money`);
        const pName = document.getElementById(`p${player.id + 1}moneyname`);
        if (pMoney && pName) {
            pMoney.textContent = player.money;
            pName.textContent = player.name;
            document.getElementById(`p${player.id + 1}moneybar`).style.borderColor = player.color;
            document.getElementById(`moneybarrow${player.id + 1}`).style.display = 'table-row';
        }
    }

    // Update player positions
    // (This is a simplified version of updatePosition() from monopoly.js)
    document.querySelectorAll('.cell-position-holder').forEach(el => el.innerHTML = '');
    for (const player of gameState.players) {
        const cell = document.getElementById(`cell${player.position}positionholder`);
        if (cell) {
            const token = document.createElement('div');
            token.className = 'cell-position';
            token.title = player.name;
            token.style.backgroundColor = player.color;
            cell.appendChild(token);
        }
    }

    // Update whose turn it is
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    if (currentPlayer) {
        document.getElementById('pname').textContent = currentPlayer.name;
        document.getElementById('pmoney').textContent = `$${currentPlayer.money}`;
        document.getElementById('quickstats').style.borderColor = currentPlayer.color;
    }

    // Enable/disable roll button based on whose turn it is
    if (player_id !== undefined) {
        rollDiceBtn.disabled = (gameState.currentPlayerId !== player_id);
    } else {
        rollDiceBtn.disabled = true; // Disable until we have an ID
    }
}

// --- Event Listeners ---
// Find the "Start Game" button and override its click handler
const startButton = document.querySelector('#setup input[value="Start Game"]');
if (startButton) {
    startButton.onclick = connectWebSocket;
}

rollDiceBtn.onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'rollDice' }));
    }
};

// Hide elements that are not yet implemented on the server
document.getElementById('manage-menu-item').style.display = 'none';
document.getElementById('trade-menu-item').style.display = 'none';
document.getElementById('buy-menu-item').onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'buyProperty' }));
    }
};
