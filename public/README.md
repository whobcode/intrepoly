# Monopoly

This is a web-based implementation of the classic board game Monopoly. This project includes the original client-side version of the game, as well as a new, server-based version built on Cloudflare Workers.

## Table of Contents

- [Monopoly](#monopoly)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Original Client-Side Version](#original-client-side-version)
    - [How to Play](#how-to-play)
  - [Cloudflare Workers Version](#cloudflare-workers-version)
    - [Architecture](#architecture)
    - [Setup and Deployment](#setup-and-deployment)
  - [Future Improvements](#future-improvements)

## Project Overview

This project provides a fully-featured Monopoly game that can be played in a web browser. It includes all the standard features of the game, such as:

*   Buying, selling, and trading properties
*   Building houses and hotels
*   Drawing Chance and Community Chest cards
*   Auctions
*   Jail
*   Bankruptcy

The game supports 2-8 players, and players can be either human or computer-controlled.

## Original Client-Side Version

The original version of the game is implemented entirely in client-side JavaScript, HTML, and CSS. All game logic and state are managed in the browser.

### How to Play

1.  Open the `index.html` file in a web browser.
2.  Select the number of players and configure each player's name, color, and AI status.
3.  Click "Start Game" to begin.

The game board and controls are displayed on the screen. Players can roll the dice, buy properties, manage their assets, and trade with other players.

## Cloudflare Workers Version

The new version of the game is built on Cloudflare's serverless platform, providing a more robust and scalable architecture.

### Architecture

The Cloudflare Workers version of the game uses the following resources:

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
