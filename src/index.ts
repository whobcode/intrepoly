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

    // AI endpoints
    if (path === '/api/ai/models' && request.method === 'GET') {
      const allowed = getAllowedModels(env);
      const def = getDefaultModel(env, allowed);
      return json({ default: def, allowed });
    }

    if (path === '/api/ai/chat' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env);
      const model = (body?.model as string) || getDefaultModel(env, allowed);
      if (!allowed.includes(model)) {
        return json({ error: 'Model not allowed', allowed }, 400);
      }
      const prompt = buildPrompt(body?.prompt, body?.gameState);
      try {
        const result = await env.AI.run(model, { prompt });
        return json({ model, result });
      } catch (e: any) {
        return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500);
      }
    }

    if (path === '/api/ai/suggest-move' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env);
      const model = (body?.model as string) || getDefaultModel(env, allowed);
      if (!allowed.includes(model)) {
        return json({ error: 'Model not allowed', allowed }, 400);
      }
      const prompt = buildPrompt(
        'Given the Monopoly game state JSON below, propose the best next action for the current player. Respond ONLY as minified JSON: {"action":"<one of: rollDice,buyProperty,endTurn,trade,build,sell,mortgage,pay,unmortgage>","reason":"short explanation"}.',
        body?.gameState
      );
      try {
        const result = await env.AI.run(model, { prompt });
        return json({ model, result });
      } catch (e: any) {
        return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500);
      }
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
  DEFAULT_AI_MODEL?: string;
  ALLOWED_AI_MODELS?: string;
}

// Helpers
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function safeJson(request: Request): Promise<any | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function getAllowedModels(env: Env): string[] {
  const raw = (env.ALLOWED_AI_MODELS || '').trim();
  if (!raw) return [getDefaultModel(env)];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function getDefaultModel(env: Env, allowed?: string[]): string {
  const fallback = env.DEFAULT_AI_MODEL || '@cf/meta/llama-2-7b-chat-int8';
  if (!allowed || allowed.length === 0) return fallback;
  return allowed.includes(fallback) ? fallback : allowed[0];
}

function buildPrompt(userPrompt?: string, gameState?: any): string {
  const base = `You are an expert Monopoly strategy assistant. Be concise, avoid hallucinations, and prefer valid actions given rules. If the state is incomplete, state assumptions briefly.`;
  const state = gameState ? `\n\nGame State JSON:\n${JSON.stringify(gameState)}` : '';
  const user = userPrompt ? `\n\nUser: ${userPrompt}` : '';
  return `${base}${state}${user}`;
}
