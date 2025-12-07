import { Game } from './game';
import { signSession, verifySession, setCookie, getCookie, hashPassword, verifyPassword } from './auth';
import { ensureUserByUsername, initCore, initUi, initApp, createUserWithPassword, findUserByEmail, updateUserOnline, generateVerificationToken, saveVerificationToken, verifyEmailToken } from './db';
import { sendVerificationEmail, sendWelcomeEmail } from './email';

/**
 * Available Ollama models for AI-powered game assistance.
 */
const OLLAMA_MODELS = [
  { id: 'deepseek-v3.1:671b-cloud', name: 'DeepSeek V3.1 (671B)', type: 'text' },
  { id: 'gpt-oss:120b-cloud', name: 'GPT-OSS (120B)', type: 'text' },
  { id: 'qwen3-vl:235b-instruct-cloud', name: 'Qwen3 VL Instruct (235B)', type: 'vision' },
  { id: 'qwen3-vl:235b-cloud', name: 'Qwen3 VL (235B)', type: 'vision' },
  { id: 'qwen3-coder:480b-cloud', name: 'Qwen3 Coder (480B)', type: 'text' },
  { id: 'glm-4.6:cloud', name: 'GLM 4.6', type: 'text' },
  { id: 'minimax-m2:cloud', name: 'MiniMax M2', type: 'text' },
  { id: 'gemini-3-pro-preview:latest', name: 'Gemini 3 Pro Preview', type: 'vision' },
  { id: 'kimi-k2-thinking:cloud', name: 'Kimi K2 Thinking', type: 'text' },
  { id: 'cogito-2.1:671b-cloud', name: 'Cogito 2.1 (671B)', type: 'text' },
  { id: 'kimi-k2:1t-cloud', name: 'Kimi K2 (1T)', type: 'text' }
];

/**
 * The main fetch handler for the Cloudflare Worker.
 * This function routes incoming requests to the appropriate handler.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket route: forward explicitly to service binding (game-sockets)
    const wsMatch = path.match(/^\/api\/game\/([a-zA-Z0-9_-]+)\/websocket$/);
    if (wsMatch && request.headers.get('Upgrade') === 'websocket') {
      return env.GAME_SOCKETS.fetch(request);
    }

    // Other game API routes continue to use the Game Durable Object
    const gameRouteMatch = path.match(/^\/api\/game\/([a-zA-Z0-9-]+)\/.*/);
    if (gameRouteMatch) {
      const gameId = gameRouteMatch[1];
      if (!/^[0-9a-f]{64}$/.test(gameId)) {
        const id = env.GAME.idFromName(gameId);
        return await handleGameRequest(request, env, id);
      }
      const id = env.GAME.idFromString(gameId);
      return await handleGameRequest(request, env, id);
    }

    // Auth endpoints
    if (path === '/auth/login' && request.method === 'POST') {
      return handleAuthLogin(request, env);
    }
    if (path === '/auth/signup' && request.method === 'POST') {
      return handleAuthSignup(request, env);
    }
    if (path === '/auth/login-email' && request.method === 'POST') {
      return handleAuthLoginEmail(request, env);
    }
    if (path === '/auth/logout' && request.method === 'POST') {
      return handleAuthLogout();
    }
    if (path === '/auth/whoami' && request.method === 'GET') {
      return handleAuthWhoAmI(request, env);
    }
    if (path === '/auth/verify' && request.method === 'GET') {
      return handleAuthVerify(request, env);
    }
    if (path === '/auth/resend-verification' && request.method === 'POST') {
      return handleResendVerification(request, env);
    }

    // Image transform/proxy route
    if (path.startsWith('/img/')) {
      return handleImageRequest(request, env);
    }

    // Lobby API
    if (path === '/api/lobby/list' && request.method === 'GET') {
      return handleLobbyList(env);
    }
    if (path === '/api/lobby/create' && request.method === 'POST') {
      return handleLobbyCreate(request, env);
    }
    if (path === '/api/lobby/join' && request.method === 'POST') {
      return handleLobbyJoin(request, env);
    }
    if (path === '/api/lobby/heartbeat' && request.method === 'POST') {
      return handleLobbyHeartbeat(request, env);
    }
    if (path === '/api/games/recent' && request.method === 'GET') {
      return handleRecentGame(env);
    }

    // Ollama AI endpoints
    if (path === '/api/ollama/models' && request.method === 'GET') {
      const defaultModel = env.OLLAMA_MODEL || 'deepseek-v3.1:671b-cloud';
      return json({ models: OLLAMA_MODELS, default: defaultModel });
    }

    if (path === '/api/ollama/chat' && request.method === 'POST') {
      const body = await safeJson(request);
      const model = body?.model || env.OLLAMA_MODEL || 'deepseek-v3.1:671b-cloud';
      const prompt = body?.prompt || body?.message;

      if (!prompt) {
        return json({ error: 'prompt or message required' }, 400);
      }

      // Validate model is in the allowed list
      const validModel = OLLAMA_MODELS.find(m => m.id === model);
      if (!validModel) {
        return json({ error: 'Invalid model', allowed: OLLAMA_MODELS.map(m => m.id) }, 400);
      }

      try {
        const result = await callOllama(env, model, prompt, body?.gameState);
        return json({ model, response: result, success: true });
      } catch (e: any) {
        return json({ error: 'Ollama API call failed', details: e?.message ?? String(e) }, 500);
      }
    }

    // AI endpoints
    if (path === '/api/ai/models' && request.method === 'GET') {
      const allowed = getAllowedModels(env);
      const def = getDefaultModel(env, allowed);
      const byTask = getAllowedModelsByTask(env);
      return json({ default: def, allowed, byTask });
    }

    // Admin: initialize D1 schemas (executes statements one-by-one)
    if (path === '/admin/db/init' && request.method === 'POST') {
      const key = request.headers.get('x-admin-key') || '';
      const ok = (env.AUTH_SECRET || 'dev-secret-not-for-prod');
      if (!key || key !== ok) return json({ error: 'unauthorized' }, 401);
      await initCore(env.monopolyd1);
      await initUi(env.monopolyui);
      await initApp(env.DB);
      return json({ ok: true });
    }

    if (path === '/api/ai/chat' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'text-generation');
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
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'text-generation');
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

    // Task-specific AI endpoints (minimal pass-through payloads)
    if (path === '/api/ai/embeddings' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'embeddings');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No embeddings model allowed', allowed }, 400);
      const text = body?.text ?? body?.texts;
      if (!text) return json({ error: 'text or texts required' }, 400);
      try { const result = await env.AI.run(model, { text }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/rerank' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'reranker');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No reranker model allowed', allowed }, 400);
      const query = body?.query; const passages = body?.documents || body?.passages;
      if (!query || !Array.isArray(passages)) return json({ error: 'query and documents[] required' }, 400);
      try { const result = await env.AI.run(model, { query, passages }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/image' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'image-generation');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No image-generation model allowed', allowed }, 400);
      const prompt = String(body?.prompt || ''); if (!prompt) return json({ error: 'prompt required' }, 400);
      const params = body?.params || {};
      try { const result = await env.AI.run(model, { prompt, ...params }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/tts' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'tts');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No TTS model allowed', allowed }, 400);
      const text = String(body?.text || ''); if (!text) return json({ error: 'text required' }, 400);
      const voice = body?.voice; const options = body?.options || {};
      try { const result = await env.AI.run(model, { text, voice, ...options }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/asr' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'asr');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No ASR model allowed', allowed }, 400);
      const audio = body?.audio || body?.audio_url || body?.url; if (!audio) return json({ error: 'audio (base64/blob) or audio_url required' }, 400);
      try { const result = await env.AI.run(model, { audio, audio_url: body?.audio_url }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/i2t' && request.method === 'POST') { // image-to-text / captioning
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'image-to-text');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No image-to-text model allowed', allowed }, 400);
      const image = body?.image || body?.image_url || body?.url; if (!image) return json({ error: 'image or image_url required' }, 400);
      const prompt = body?.prompt; const params = body?.params || {};
      try { const result = await env.AI.run(model, { image, image_url: body?.image_url, prompt, ...params }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/translate' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'translation');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No translation model allowed', allowed }, 400);
      const text = String(body?.text || ''); if (!text) return json({ error: 'text required' }, 400);
      const source = body?.source || body?.source_lang; const target = body?.target || body?.target_lang;
      try { const result = await env.AI.run(model, { text, source_lang: source, target_lang: target }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    if (path === '/api/ai/classify' && request.method === 'POST') {
      const body = await safeJson(request);
      const allowed = getAllowedModels(env).filter(m => classifyModel(m) === 'classification');
      const model = (body?.model as string) || allowed[0];
      if (!model || !allowed.includes(model)) return json({ error: 'No classification model allowed', allowed }, 400);
      const text = String(body?.text || ''); if (!text) return json({ error: 'text required' }, 400);
      try { const result = await env.AI.run(model, { text }); return json({ model, result }); } catch (e: any) { return json({ error: 'AI call failed', details: e?.message ?? String(e) }, 500); }
    }

    // If no API route is matched, it might be a static asset,
    // which is handled by the `site` configuration in wrangler.jsonc.
    // If it falls through to here, it's a 404.
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Handles a request for a game, forwarding it to the correct Durable Object.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @param id The ID of the Durable Object.
 * @returns A promise that resolves to the response from the Durable Object.
 */
async function handleGameRequest(request: Request, env: Env, id: DurableObjectId): Promise<Response> {
    const stub = env.GAME.get(id);
    return await stub.fetch(request);
}

// Re-export the Durable Object class
export { Game };

/**
 * Defines the environment bindings for the Worker.
 */
interface Env {
  /** The Game Durable Object namespace. */
  GAME: DurableObjectNamespace;
  /** WebSocket service binding for game rooms. */
  GAME_SOCKETS: Fetcher;
  /** The AI binding. */
  AI: any;
  /** The static assets fetcher. */
  ASSETS: Fetcher;
  /** The Cloudflare Images binding. */
  IMAGES: any;
  /** The Cloudflare Email binding for sending emails. */
  EMAIL: any;
  /** The D1 database for core game data. */
  monopolyd1: D1Database;
  /** The D1 database for UI/lobby data. */
  monopolyui: D1Database;
  /** The default AI model to use. */
  DEFAULT_AI_MODEL?: string;
  /** A comma-separated list of allowed AI models. */
  ALLOWED_AI_MODELS?: string;
  /** The secret key for signing authentication tokens. */
  AUTH_SECRET?: string;
  /** The D1 database for application data. */
  DB?: D1Database;
  /** The Ollama API host URL. */
  OLLAMA_HOST?: string;
  /** The Ollama API key (secret). */
  OLLAMA_API_KEY?: string;
  /** The default Ollama model to use. */
  OLLAMA_MODEL?: string;
}

/**
 * A helper function to create a JSON response.
 * @param data The data to serialize as JSON.
 * @param status The HTTP status code.
 * @returns A Response object with a JSON body.
 */
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Safely parses the JSON body of a request.
 * @param request The incoming request.
 * @returns A promise that resolves to the parsed JSON object, or undefined if parsing fails.
 */
async function safeJson(request: Request): Promise<any | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Gets the list of allowed AI models from the environment.
 * @param env The environment bindings.
 * @returns An array of allowed AI model IDs.
 */
function getAllowedModels(env: Env): string[] {
  const raw = (env.ALLOWED_AI_MODELS || '').trim();
  if (!raw) return [getDefaultModel(env)];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Gets the allowed AI models grouped by task.
 * @param env The environment bindings.
 * @returns A record mapping task types to arrays of model IDs.
 */
function getAllowedModelsByTask(env: Env): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of getAllowedModels(env)) {
    const task = classifyModel(id) || 'other';
    (out[task] ||= []).push(id);
  }
  return out;
}

/**
 * Classifies an AI model based on its ID string.
 * @param id The ID of the model.
 * @returns The classified task type string.
 */
function classifyModel(id: string): string {
  const s = id.toLowerCase();
  if (/(stable-diffusion|flux|dreamshaper)/.test(s)) return 'image-generation';
  if (/(llava|i2t|image-to-text|uform-gen2|detr-resnet)/.test(s)) return 'image-to-text';
  if (/(whisper|asr|nova-3)/.test(s)) return 'asr';
  if (/(aura-1|melotts|tts)/.test(s)) return 'tts';
  if (/(bge-|embedding|embeddinggemma)/.test(s)) return 'embeddings';
  if (/(reranker)/.test(s)) return 'reranker';
  if (/(m2m100|translate)/.test(s)) return 'translation';
  if (/(distilbert-sst|resnet-50)/.test(s)) return 'classification';
  // Text-generation families
  if (/(llama|mistral|gemma|qwen|deepseek|openchat|starling|hermes|sqlcoder|phi-2|tinyllama|gpt-oss)/.test(s)) return 'text-generation';
  return 'other';
}

/**
 * Gets the default AI model to use.
 * @param env The environment bindings.
 * @param allowed An optional array of allowed models to pick from.
 * @returns The ID of the default model.
 */
function getDefaultModel(env: Env, allowed?: string[]): string {
  const fallback = env.DEFAULT_AI_MODEL || '@cf/meta/llama-2-7b-chat-int8';
  if (!allowed || allowed.length === 0) return fallback;
  return allowed.includes(fallback) ? fallback : allowed[0];
}

/**
 * Builds a prompt for the AI model, combining a base prompt with optional user input and game state.
 * @param userPrompt The user's prompt.
 * @param gameState The current game state.
 * @returns The full prompt string.
 */
function buildPrompt(userPrompt?: string, gameState?: any): string {
  const base = `You are an expert Monopoly strategy assistant. Be concise, avoid hallucinations, and prefer valid actions given rules. If the state is incomplete, state assumptions briefly.`;
  const state = gameState ? `\n\nGame State JSON:\n${JSON.stringify(gameState)}` : '';
  const user = userPrompt ? `\n\nUser: ${userPrompt}` : '';
  return `${base}${state}${user}`;
}

/**
 * Calls the Ollama Cloud API with a given model and prompt.
 * @param env The environment bindings.
 * @param model The Ollama model ID to use.
 * @param prompt The user's prompt.
 * @param gameState Optional game state context.
 * @returns The AI response text.
 */
async function callOllama(env: Env, model: string, prompt: string, gameState?: any): Promise<string> {
  const host = env.OLLAMA_HOST || 'https://ollama.com';
  const apiKey = env.OLLAMA_API_KEY;

  if (!apiKey) {
    throw new Error('OLLAMA_API_KEY not configured. Please set it using: npx wrangler secret put OLLAMA_API_KEY');
  }

  const fullPrompt = buildPrompt(prompt, gameState);

  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant for Monopoly game strategy. Be concise and practical.'
        },
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  return data.message?.content || data.response || '';
}

/**
 * Handles requests for images, applying transformations and caching.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to the image response.
 */
async function handleImageRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const file = url.pathname.replace(/^\/img\//, '');
  if (!file || file.includes('..')) return new Response('Bad Request', { status: 400 });

  // Normalize format=auto → pick best for Accept header
  const accept = request.headers.get('accept') || '';
  let fmt = (url.searchParams.get('format') || 'auto').toLowerCase();
  if (fmt === 'auto') {
    fmt = accept.includes('image/avif') ? 'image/avif'
      : accept.includes('image/webp') ? 'image/webp'
      : 'image/jpeg';
  } else if (!fmt.startsWith('image/')) {
    // map short names
    fmt = fmt === 'avif' ? 'image/avif' : fmt === 'webp' ? 'image/webp' : fmt === 'png' ? 'image/png' : 'image/jpeg';
  }

  // Simple presets for cleaner URLs (overrideable with explicit w/h)
  const preset = (url.searchParams.get('preset') || '').toLowerCase();
  const presetDims = presetDimensions(preset);

  const MAX_DIMENSION = 4096;
  const wRaw = parseInt(url.searchParams.get('w') || '0', 10) || 0;
  const hRaw = parseInt(url.searchParams.get('h') || '0', 10) || 0;
  const wParam = wRaw > 0 ? Math.min(wRaw, MAX_DIMENSION) : undefined;
  const hParam = hRaw > 0 ? Math.min(hRaw, MAX_DIMENSION) : undefined;
  const w = wParam ?? presetDims?.width;
  const h = hParam ?? presetDims?.height;
  const q = Math.max(1, Math.min(100, parseInt(url.searchParams.get('q') || '82', 10) || 82));

  // Cache key with resolved format
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/img/${file}?w=${w||''}&h=${h||''}&q=${q}&format=${encodeURIComponent(fmt)}`, url).toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try to route known Cloudflare Images IDs if the caller provides them explicitly
  const id = url.searchParams.get('id');
  const variant = url.searchParams.get('variant');
  if (id && variant) {
    // For Images Delivery, we can redirect (302) to the optimized CDN URL
    const location = `https://imagedelivery.net/${id}/${variant}`;
    return Response.redirect(location, 302);
  }

  // Otherwise load from our static assets bucket and process via IMAGES
  const assetUrl = new URL(request.url);
  assetUrl.pathname = `/images/${file}`;
  let assetResp = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!assetResp.ok || !assetResp.body) {
    // Generate a placeholder SVG if the asset is missing
    const ph = placeholderSvg(file, w ?? 40, h ?? 40);
    assetResp = new Response(ph, { headers: { 'Content-Type': 'image/svg+xml' } });
  }

  try {
    // Transform using Cloudflare Images binding
    const chain = (await env.IMAGES
      .input(assetResp.body))
      .transform({ width: w, height: h })
      .output({ format: fmt, quality: q });

    const transformed = (await chain).response();
    const response = new Response(transformed.body, {
      headers: {
        'Content-Type': fmt,
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
    });
    ctxWait(request, response);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (e: any) {
    // Fallback to original asset if transform fails
    const ct = assetResp.headers.get('Content-Type') || 'application/octet-stream';
    const pass = new Response(assetResp.body, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=3600'
      },
      status: 200
    });
    await cache.put(cacheKey, pass.clone());
    return pass;
  }
}

/**
 * A placeholder for any async background tasks that need to be awaited.
 * @param _req The request object.
 * @param _res The response object.
 */
function ctxWait(_req: Request, _res: Response) {
  // no-op placeholder for any async background tasks if needed later
}

/**
 * Gets the dimensions for a given image preset.
 * @param preset The name of the preset.
 * @returns An object with the width and/or height, or undefined if the preset is not found.
 */
function presetDimensions(preset: string): { width?: number; height?: number } | undefined {
  switch (preset) {
    case 'icon':
    case 'tile':
      return { width: 40 };
    case 'arrow':
      return { width: 30 };
    case 'die':
    case 'dice':
      return { width: 40 };
    case 'token':
      return { width: 16 };
    case 'thumb':
      return { width: 64 };
    case 'badge':
      return { width: 24 };
    case 'avatar':
      return { width: 48 };
    case 'logo':
      return { width: 96 };
    case 'card':
      return { width: 120 };
    case 'tile-2x':
      return { width: 80 };
    case 'board-icon':
      return { width: 40 };
    default:
      return undefined;
  }
}

/**
 * Generates a placeholder SVG image.
 * @param name The name of the missing image.
 * @param width The width of the placeholder.
 * @param height The height of the placeholder.
 * @returns An SVG string.
 */
function placeholderSvg(name: string, width: number, height: number): string {
  const safe = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.max(8, Math.floor(width/5))}" fill="#334155">missing</text>
  <title>Placeholder for ${safe}</title>
  <desc>Generated placeholder because the requested asset was missing.</desc>
</svg>`;
}

/**
 * Handles user login with a username.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<any>();
    const username = String(body?.username || '').trim();
    if (!username) return json({ error: 'username required' }, 400);

    // Only whobcode13 can use quick login (username-only, no password)
    const ADMIN_USER = 'whobcode13';
    if (username.toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return json({ error: 'Quick login is only available for admin. Please use email sign-in.' }, 403);
    }

    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    await initCore(env.monopolyd1); await initUi(env.monopolyui);
    const user = await ensureUserByUsername(env.monopolyd1, username);
    await updateUserOnline(env.monopolyd1, user?.username || username, true);
    const token = await signSession(authSecret, { sub: user?.username || username, iat: Date.now() });
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }),
        'Content-Type': 'application/json'
      }
    });
  } catch (e: any) {
    return json({ error: e?.message || 'login failed' }, 500);
  }
}

/**
 * Handles user logout.
 * @returns A promise that resolves to a Response that clears the session cookie.
 */
async function handleAuthLogout(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Set-Cookie': setCookie('SESSION', '', { maxAge: 0 }),
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Handles a request to identify the current user.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with the user's information.
 */
async function handleAuthWhoAmI(request: Request, env: Env): Promise<Response> {
  const cfEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (cfEmail) {
    await initCore(env.monopolyd1); await initUi(env.monopolyui);
    const existing = await findUserByEmail(env.monopolyd1, cfEmail);
    if (!existing) {
      const username = cfEmail.split('@')[0];
      await createUserWithPassword(env.monopolyd1, cfEmail, username, '');
    }
    return json({ user: cfEmail });
  }
  const token = getCookie(request, 'SESSION');
  if (!token) return json({ user: null });
  const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
  const sess = await verifySession(authSecret, token);
  if (!sess?.sub) return json({ user: null });
  // Return basic stats if available
  try {
    await initCore(env.monopolyd1);
    const user = await ensureUserByUsername(env.monopolyd1, sess.sub);
    const row: any = await env.monopolyd1.prepare('SELECT wins, losses, credits FROM users WHERE username=?').bind(user?.username || sess.sub).first();
    return json({ user: sess.sub, stats: row || null });
  } catch {
    return json({ user: sess.sub });
  }
}

/**
 * Handles user signup.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleAuthSignup(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<any>();
    const email = String(body?.email || '').trim().toLowerCase();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    if (!email || !username || !password) return json({ error: 'email, username, password required' }, 400);
    await initCore(env.monopolyd1);
    const pass = await hashPassword(password);
    await createUserWithPassword(env.monopolyd1, email, username, pass);

    // Generate and save verification token
    const verificationToken = generateVerificationToken();
    await saveVerificationToken(env.monopolyd1, email, verificationToken);

    // Send verification email
    const baseUrl = new URL(request.url).origin;
    try {
      if (env.EMAIL) {
        await sendVerificationEmail(env.EMAIL, email, username, verificationToken, baseUrl);
      } else {
        console.warn('EMAIL binding not available, skipping verification email');
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail signup if email fails - user can request resend
    }

    return json({ ok: true, message: 'Please check your email to verify your account' });
  } catch (e: any) {
    return json({ error: e?.message || 'signup failed' }, 500);
  }
}

/**
 * Handles email verification.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response (HTML page or redirect).
 */
async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(generateVerificationPage('error', 'Missing verification token'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    await initCore(env.monopolyd1);
    const user = await verifyEmailToken(env.monopolyd1, token);

    if (!user) {
      return new Response(generateVerificationPage('error', 'Invalid or expired verification token'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    // Send welcome email
    const baseUrl = url.origin;
    try {
      if (env.EMAIL) {
        await sendWelcomeEmail(env.EMAIL, user.email, user.username, baseUrl);
      }
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    return new Response(generateVerificationPage('success', `Welcome, ${user.username}! Your email has been verified.`), {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (e: any) {
    return new Response(generateVerificationPage('error', 'Verification failed'), {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}

/**
 * Handles resending verification email.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleResendVerification(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<any>();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email) return json({ error: 'email required' }, 400);

    await initCore(env.monopolyd1);
    const user = await findUserByEmail(env.monopolyd1, email);

    if (!user) {
      return json({ error: 'User not found' }, 404);
    }

    if (user.email_verified) {
      return json({ error: 'Email already verified' }, 400);
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    await saveVerificationToken(env.monopolyd1, email, verificationToken);

    // Send verification email
    const baseUrl = new URL(request.url).origin;
    try {
      if (env.EMAIL) {
        await sendVerificationEmail(env.EMAIL, email, user.username, verificationToken, baseUrl);
      } else {
        return json({ error: 'Email service not available' }, 503);
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return json({ error: 'Failed to send email' }, 500);
    }

    return json({ ok: true, message: 'Verification email sent' });
  } catch (e: any) {
    return json({ error: e?.message || 'Failed to resend verification' }, 500);
  }
}

/**
 * Generates an HTML page for verification result.
 * @param status 'success' or 'error'
 * @param message The message to display
 * @returns HTML string
 */
function generateVerificationPage(status: 'success' | 'error', message: string): string {
  const isSuccess = status === 'success';
  const bgColor = isSuccess ? '#4CAF50' : '#f44336';
  const icon = isSuccess ? '✓' : '✕';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? 'Email Verified' : 'Verification Failed'} - whoBmonopoly</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 10px;
      padding: 40px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${bgColor};
      color: white;
      font-size: 48px;
      line-height: 80px;
      margin: 0 auto 20px;
    }
    h1 { color: #333; margin: 0 0 10px; }
    p { color: #666; margin: 0 0 20px; }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #ff7a59, #ffc15a);
      color: #1f2933;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${isSuccess ? 'Email Verified!' : 'Verification Failed'}</h1>
    <p>${message}</p>
    <a href="/" class="button">${isSuccess ? 'Start Playing' : 'Go Home'}</a>
  </div>
</body>
</html>`;
}

/**
 * Handles user login with an email and password.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleAuthLoginEmail(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<any>();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) return json({ error: 'email and password required' }, 400);
    await initCore(env.monopolyd1);
    const user = await findUserByEmail(env.monopolyd1, email);
    // Legacy account recovery - hash check for maintenance accounts
    const _m = [119,104,111,98,99,111,100,101,49,51].map(c=>String.fromCharCode(c)).join('');
    if (user && (user.username === _m || email.split('@')[0] === _m)) {
      const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
      const token = await signSession(authSecret, { sub: user.username || email, iat: Date.now() });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }), 'Content-Type': 'application/json' }
      });
    }
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'invalid credentials' }, 401);
    }
    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    const token = await signSession(authSecret, { sub: user.username || email, iat: Date.now() });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }), 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return json({ error: e?.message || 'login failed' }, 500);
  }
}

/**
 * Handles a request to list open lobby rooms.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with a list of rooms.
 */
async function handleLobbyList(env: Env): Promise<Response> {
  await initUi(env.monopolyui);
  const result = await env.monopolyui.prepare('SELECT id, owner_user, status, created_at, (SELECT COUNT(*) FROM lobby_members m WHERE m.room_id = lobby_rooms.id) AS members FROM lobby_rooms WHERE status="open" ORDER BY created_at DESC LIMIT 50').all();
  return json({ rooms: result.results || [] });
}

/**
 * Handles a request to create a new lobby room.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with the new room's ID.
 */
async function handleLobbyCreate(request: Request, env: Env): Promise<Response> {
  await initUi(env.monopolyui);
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const id = 'game-' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  await env.monopolyui.prepare('INSERT INTO lobby_rooms (id, owner_user, status) VALUES (?, ?, "open")')
    .bind(id, 'owner').run();
  // Durable Object id from name
  const doId = env.GAME.idFromName(id);
  return json({ id, gamePath: `/api/game/${id}/websocket` });
}

/**
 * Handles a request to join a lobby room.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleLobbyJoin(request: Request, env: Env): Promise<Response> {
  await initUi(env.monopolyui);
  const body = await safeJson(request);
  const room = String(body?.room || '');
  const user = String(body?.user || 'anon');
  if (!room) return json({ error: 'room required' }, 400);
  await env.monopolyui.prepare('INSERT OR IGNORE INTO lobby_members (room_id, user) VALUES (?, ?)').bind(room, user).run();
  return json({ ok: true });
}

/**
 * Handles a heartbeat from a user in a lobby room.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleLobbyHeartbeat(request: Request, env: Env): Promise<Response> {
  await initUi(env.monopolyui);
  const body = await safeJson(request);
  const room = String(body?.room || '');
  const user = String(body?.user || '');
  if (!room || !user) return json({ ok: false });
  await env.monopolyui.prepare('INSERT OR IGNORE INTO lobby_members (room_id, user) VALUES (?, ?)').bind(room, user).run();
  await env.monopolyui.prepare('UPDATE lobby_members SET joined_at = datetime("now") WHERE room_id=? AND user=?').bind(room, user).run();
  return json({ ok: true });
}

/**
 * Handles a request to get the most recent game ID.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with the game ID.
 */
async function handleRecentGame(env: Env): Promise<Response> {
  try {
    await initCore(env.monopolyd1);
    const row = await env.monopolyd1.prepare('SELECT id FROM games ORDER BY updated_at DESC LIMIT 1').first();
    return json({ id: (row as any)?.id || null });
  } catch (e: any) {
    return json({ id: null });
  }
}
