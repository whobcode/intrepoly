import { Game } from './game';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Regex to match game API routes, e.g., /api/game/some-id/websocket
    const gameRouteMatch = path.match(/^\/api\/game\/([a-zA-Z0-9-]+)\/.*/);

    if (gameRouteMatch) {
      const gameId = gameRouteMatch[1];

      // Ensure the ID is a valid hex string for a Durable Object ID
      if (!/^[0-9a-f]{64}$/.test(gameId)) {
          // If not, let's create a new ID based on the name.
          // This allows for human-readable game URLs.
          const id = env.GAME.idFromName(gameId);
          return await handleGameRequest(request, env, id);
      }

      const id = env.GAME.idFromString(gameId);
      return await handleGameRequest(request, env, id);
    }

    // Placeholder for AI endpoint
    if (path.startsWith('/api/ai')) {
      return new Response(JSON.stringify({ response: 'AI is thinking...' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If no API route is matched, it might be a static asset,
    // which is handled by the `site` configuration in wrangler.jsonc.
    // If it falls through to here, it's a 404.
    return new Response('Not Found', { status: 404 });
  },
};

async function handleGameRequest(request: Request, env: Env, id: DurableObjectId): Promise<Response> {
    const stub = env.GAME.get(id);
    return await stub.fetch(request);
}

// Re-export the Durable Object class
export { Game };

// Define the Env interface for bindings
interface Env {
  GAME: DurableObjectNamespace;
  AI: any;
}
