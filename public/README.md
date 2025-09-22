# whoBmonopoly

This is a modern, server-driven take on the classic board game, built on Cloudflare Workers with a modular ES module client.

## Table of Contents

- [whoBmonopoly](#whobmonopoly)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Original Client-Side Version](#original-client-side-version)
    - [How to Play](#how-to-play)
  - [Cloudflare Workers Version](#cloudflare-workers-version)
    - [Architecture](#architecture)
    - [Setup and Deployment](#setup-and-deployment)
  - [Future Improvements](#future-improvements)

## Project Overview

This project provides a playable board game in the browser with:

*   Buying, selling, and trading properties
*   Building houses and hotels
*   Drawing Chance and Community Chest cards
*   Auctions
*   Jail
*   Bankruptcy

The game supports 2-8 players, and players can be either human or computer-controlled.

## Client

The legacy client has been removed. The new client lives under `public/js/` and uses standard ES modules:

- `js/main.js` — entry point that wires UI to the backend
- `js/api.js` — WebSocket connection and messaging
- `js/state.js` — minimal client-side state
- `js/render.js` — DOM construction and UI updates

## Cloudflare Worker

### Architecture

The app uses the following resources:

*   **Cloudflare Worker**: The main entry point for the application. It serves the static assets (HTML, CSS, and client-side JavaScript) and handles API requests from the client.
*   **Durable Objects**: Each game instance is managed by a `Game` Durable Object. The Durable Object stores the game state and exposes methods for interacting with the game, ensuring consistency and transactional updates.
*   **WebSockets**: Real-time updates are provided using WebSockets. The `Game` Durable Object manages WebSocket connections and broadcasts game state changes to all connected clients.
*   **Workers AI**: The simple AI from the original version is replaced with a more sophisticated AI powered by Cloudflare Workers AI.
*   **D1**: Cloudflare's serverless SQL database is used to store user accounts, game history, and leaderboards (future improvement).

### Setup and Deployment

1.  Install the Cloudflare CLI, [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
2.  Clone the repository.
3.  Run `npm install` to install the dependencies.
4.  Run `wrangler dev` to start a local development server.
5.  Run `wrangler deploy` to deploy the application to your Cloudflare account.

## Future Improvements

*   **User Accounts**: Implement a user account system using D1 to allow players to save their game progress and track their stats.
*   **Leaderboards**: Create a leaderboard to rank players based on their wins and other metrics.
*   **Improved UI/UX**: Enhance the user interface and experience with a more modern design and animations.
