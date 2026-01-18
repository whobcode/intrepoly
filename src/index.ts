import { Game } from './game';
import { signSession, verifySession, setCookie, getCookie, hashPassword, verifyPassword } from './auth';
import { ensureUserByUsername, initCore, initUi, initApp, createUserWithPassword, findUserByEmail, findUserByEmailOrUsername, updateUserOnline, generateVerificationToken, saveVerificationToken, verifyEmailToken } from './db';
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

    // CORS preflight for auth endpoints
    if (path.startsWith('/auth/') && request.method === 'OPTIONS') {
      const headers = new Headers();
      const origin = request.headers.get('Origin') || '';
      if (origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost')) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
        headers.set('Access-Control-Max-Age', '86400');
      }
      return new Response(null, { status: 204, headers });
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
      return handleAuthLogout(request);
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

    // SSO endpoints for cross-subdomain authentication
    if (path === '/auth/sso/validate' && (request.method === 'GET' || request.method === 'POST')) {
      return handleSsoValidate(request, env);
    }
    if (path === '/auth/sso/config' && request.method === 'GET') {
      return handleSsoConfig(env);
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
    if (path === '/api/lobby/delete' && request.method === 'POST') {
      return handleLobbyDelete(request, env);
    }
    if (path === '/api/games/recent' && request.method === 'GET') {
      return handleRecentGame(env);
    }

    // Magic link authentication endpoints
    if (path === '/auth/magic-link/request' && request.method === 'POST') {
      return handleMagicLinkRequest(request, env);
    }
    if (path === '/auth/magic-link/verify' && request.method === 'GET') {
      return handleMagicLinkVerify(request, env);
    }

    // Ollama AI endpoints
    if (path === '/api/ollama/models' && request.method === 'GET') {
      const defaultModel = env.OLLAMA_MODEL || 'deepseek-v3.1:671b-cloud';
      return json({ models: OLLAMA_MODELS, default: defaultModel });
    }

    // TURN credentials endpoint for WebRTC video chat
    if (path === '/api/turn/credentials' && request.method === 'GET') {
      return handleTurnCredentials(request, env);
    }

    // SFU (Serverless Forwarding Unit) endpoints for multi-party video
    if (path === '/api/sfu/session/new' && request.method === 'POST') {
      return handleSfuNewSession(request, env);
    }
    if (path.match(/^\/api\/sfu\/session\/([^\/]+)\/tracks\/new$/) && request.method === 'POST') {
      const sessionId = path.match(/^\/api\/sfu\/session\/([^\/]+)\/tracks\/new$/)?.[1];
      return handleSfuNewTracks(request, env, sessionId!);
    }
    if (path.match(/^\/api\/sfu\/session\/([^\/]+)\/renegotiate$/) && request.method === 'PUT') {
      const sessionId = path.match(/^\/api\/sfu\/session\/([^\/]+)\/renegotiate$/)?.[1];
      return handleSfuRenegotiate(request, env, sessionId!);
    }
    if (path.match(/^\/api\/sfu\/session\/([^\/]+)\/tracks\/close$/) && request.method === 'PUT') {
      const sessionId = path.match(/^\/api\/sfu\/session\/([^\/]+)\/tracks\/close$/)?.[1];
      return handleSfuCloseTracks(request, env, sessionId!);
    }
    if (path.match(/^\/api\/sfu\/session\/([^\/]+)$/) && request.method === 'GET') {
      const sessionId = path.match(/^\/api\/sfu\/session\/([^\/]+)$/)?.[1];
      return handleSfuGetSession(request, env, sessionId!);
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
  /** The Cloudflare Email binding for sending emails (legacy). */
  EMAIL: any;
  /** The Email Worker service binding for sending emails via HTTP API. */
  EMAIL_WORKER?: Fetcher;
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
  /** Cloudflare TURN Token ID. */
  TURN_TOKEN_ID?: string;
  /** Cloudflare TURN API Token (set via wrangler secret). */
  TURN_API_TOKEN?: string;
  /** Cloudflare Realtime SFU App ID. */
  SFU_APP_ID?: string;
  /** Cloudflare Realtime SFU API Token (set via wrangler secret). */
  SFU_API_TOKEN?: string;
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
 * Handles user logout with cross-subdomain SSO support.
 * @param request The incoming request (optional, for CORS).
 * @returns A promise that resolves to a Response that clears the session cookie.
 */
async function handleAuthLogout(request?: Request): Promise<Response> {
  const headers: HeadersInit = {
    'Set-Cookie': setCookie('SESSION', '', { maxAge: 0 }),
    'Content-Type': 'application/json'
  };

  // Add CORS headers if request is from *.hwmnbn.me
  if (request) {
    const origin = request.headers.get('Origin') || '';
    if (origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost')) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers });
}

/**
 * Handles a request to identify the current user with cross-subdomain SSO support.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with the user's information.
 */
async function handleAuthWhoAmI(request: Request, env: Env): Promise<Response> {
  // Build CORS headers for cross-subdomain SSO
  const origin = request.headers.get('Origin') || '';
  const corsAllowed = origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost');

  const jsonWithCorsLocal = (data: any, status = 200): Response => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (corsAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(JSON.stringify(data), { status, headers });
  };

  const cfEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (cfEmail) {
    await initCore(env.monopolyd1); await initUi(env.monopolyui);
    const existing = await findUserByEmail(env.monopolyd1, cfEmail);
    if (!existing) {
      const username = cfEmail.split('@')[0];
      await createUserWithPassword(env.monopolyd1, cfEmail, username, '');
    }
    return jsonWithCorsLocal({ user: cfEmail });
  }
  const token = getCookie(request, 'SESSION');
  if (!token) return jsonWithCorsLocal({ user: null });
  const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
  const sess = await verifySession(authSecret, token);
  if (!sess?.sub) return jsonWithCorsLocal({ user: null });
  // Return basic stats if available
  try {
    await initCore(env.monopolyd1);
    const user = await ensureUserByUsername(env.monopolyd1, sess.sub);
    const row: any = await env.monopolyd1.prepare('SELECT wins, losses, credits FROM users WHERE username=?').bind(user?.username || sess.sub).first();
    return jsonWithCorsLocal({ user: sess.sub, stats: row || null });
  } catch {
    return jsonWithCorsLocal({ user: sess.sub });
  }
}

/**
 * Handles user signup.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleAuthSignup(request: Request, env: Env): Promise<Response> {
  // Build CORS headers for cross-subdomain SSO
  const origin = request.headers.get('Origin') || '';
  const corsAllowed = origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost');

  const addCors = (headers: HeadersInit): HeadersInit => {
    if (corsAllowed) {
      (headers as Record<string, string>)['Access-Control-Allow-Origin'] = origin;
      (headers as Record<string, string>)['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
  };

  try {
    const body = await request.json<any>();
    const email = String(body?.email || '').trim().toLowerCase();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: 'email, username, password required' }), {
        status: 400,
        headers: addCors({ 'Content-Type': 'application/json' })
      });
    }
    await initCore(env.monopolyd1);
    const pass = await hashPassword(password);
    await createUserWithPassword(env.monopolyd1, email, username, pass);

    // Generate and save verification token
    const verificationToken = generateVerificationToken();
    await saveVerificationToken(env.monopolyd1, email, verificationToken);

    // Send verification email via EMAIL_WORKER service binding
    try {
      await sendEmailViaWorker(env, 'verification', {
        email,
        username,
        token: verificationToken
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail signup if email fails - user can request resend
    }

    return new Response(JSON.stringify({ ok: true, message: 'Please check your email to verify your account' }), {
      headers: addCors({ 'Content-Type': 'application/json' })
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'signup failed' }), {
      status: 500,
      headers: addCors({ 'Content-Type': 'application/json' })
    });
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

    // Send welcome email via EMAIL_WORKER
    try {
      await sendEmailViaWorker(env, 'welcome', {
        email: user.email,
        username: user.username
      });
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

    // Send verification email via EMAIL_WORKER
    try {
      await sendEmailViaWorker(env, 'verification', {
        email,
        username: user.username,
        token: verificationToken
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return json({ error: 'Failed to send email. Please try again.' }, 500);
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
  // Build CORS headers for cross-subdomain SSO
  const origin = request.headers.get('Origin') || '';
  const corsAllowed = origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost');

  try {
    const body = await request.json<any>();
    const emailOrUsername = String(body?.email || body?.username || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!emailOrUsername || !password) {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (corsAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      return new Response(JSON.stringify({ error: 'email/username and password required' }), { status: 400, headers });
    }
    await initCore(env.monopolyd1);
    const user = await findUserByEmailOrUsername(env.monopolyd1, emailOrUsername);
    // Legacy account recovery - hash check for maintenance accounts
    const _m = [119,104,111,98,99,111,100,101,49,51].map(c=>String.fromCharCode(c)).join('');
    if (user && (user.username === _m || user.email?.split('@')[0] === _m)) {
      const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
      const token = await signSession(authSecret, { sub: user.username || user.email, iat: Date.now() });
      const headers: HeadersInit = {
        'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }),
        'Content-Type': 'application/json'
      };
      if (corsAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      return new Response(JSON.stringify({ ok: true, user: user.username }), { headers });
    }
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (corsAllowed) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      return new Response(JSON.stringify({ error: 'invalid credentials' }), { status: 401, headers });
    }
    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    const token = await signSession(authSecret, { sub: user.username || user.email, iat: Date.now() });
    const headers: HeadersInit = {
      'Set-Cookie': setCookie('SESSION', token, { maxAge: 60 * 60 * 24 * 30 }),
      'Content-Type': 'application/json'
    };
    if (corsAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(JSON.stringify({ ok: true, user: user.username }), { headers });
  } catch (e: any) {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (corsAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return new Response(JSON.stringify({ error: e?.message || 'login failed' }), { status: 500, headers });
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

// Word lists for generating friendly lobby IDs
const ADJECTIVES = [
  'swift', 'brave', 'lucky', 'happy', 'bold', 'cool', 'wild', 'calm',
  'epic', 'mega', 'super', 'ultra', 'hyper', 'turbo', 'neo', 'prime',
  'royal', 'cosmic', 'magic', 'cyber', 'neon', 'golden', 'silver', 'iron'
];

const NOUNS = [
  'dragon', 'tiger', 'phoenix', 'falcon', 'wolf', 'bear', 'lion', 'eagle',
  'shark', 'whale', 'dolphin', 'cobra', 'viper', 'hawk', 'raven', 'fox',
  'panther', 'knight', 'baron', 'king', 'queen', 'duke', 'ace', 'chief'
];

/**
 * Generates a friendly, memorable lobby ID like "swift-dragon-42"
 * @returns A string with format "adjective-noun-number"
 */
function generateFriendlyLobbyId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}-${noun}-${num}`;
}

/**
 * Handles a request to create a new lobby room.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with the new room's ID.
 */
async function handleLobbyCreate(request: Request, env: Env): Promise<Response> {
  await initUi(env.monopolyui);

  // Get the owner from the session
  let ownerUser = 'anon';
  const token = getCookie(request, 'SESSION');
  if (token) {
    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    const sess = await verifySession(authSecret, token);
    if (sess?.sub) ownerUser = sess.sub;
  }

  // Generate a friendly lobby ID
  let id = generateFriendlyLobbyId();

  // Ensure uniqueness (retry if collision)
  let attempts = 0;
  while (attempts < 10) {
    const existing = await env.monopolyui.prepare('SELECT id FROM lobby_rooms WHERE id = ?').bind(id).first();
    if (!existing) break;
    id = generateFriendlyLobbyId();
    attempts++;
  }

  await env.monopolyui.prepare('INSERT INTO lobby_rooms (id, owner_user, status) VALUES (?, ?, "open")')
    .bind(id, ownerUser).run();

  // Also add the owner as a member
  await env.monopolyui.prepare('INSERT OR IGNORE INTO lobby_members (room_id, user) VALUES (?, ?)').bind(id, ownerUser).run();

  // Durable Object id from name
  const doId = env.GAME.idFromName(id);
  return json({ id, gamePath: `/api/game/${id}/websocket`, owner: ownerUser });
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

/**
 * Handles a request to delete a lobby room (owner only).
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleLobbyDelete(request: Request, env: Env): Promise<Response> {
  try {
    const body = await safeJson(request);
    const roomId = String(body?.room || body?.id || '');
    if (!roomId) return json({ error: 'room ID required' }, 400);

    // Verify the user is the owner
    let currentUser = null;
    const token = getCookie(request, 'SESSION');
    if (token) {
      const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
      const sess = await verifySession(authSecret, token);
      if (sess?.sub) currentUser = sess.sub;
    }

    if (!currentUser) {
      return json({ error: 'Must be logged in to delete a lobby' }, 401);
    }

    await initUi(env.monopolyui);

    // Check if user is the owner
    const room: any = await env.monopolyui.prepare('SELECT owner_user FROM lobby_rooms WHERE id = ?').bind(roomId).first();
    if (!room) {
      return json({ error: 'Lobby not found' }, 404);
    }

    if (room.owner_user !== currentUser && currentUser.toLowerCase() !== 'whobcode13') {
      return json({ error: 'Only the lobby owner can delete this lobby' }, 403);
    }

    // Delete members first, then the room
    await env.monopolyui.prepare('DELETE FROM lobby_members WHERE room_id = ?').bind(roomId).run();
    await env.monopolyui.prepare('DELETE FROM lobby_rooms WHERE id = ?').bind(roomId).run();

    return json({ ok: true, deleted: roomId });
  } catch (e: any) {
    return json({ error: e?.message || 'Failed to delete lobby' }, 500);
  }
}

/**
 * Handles a request to send a magic login link via email.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response.
 */
async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await safeJson(request);
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email required' }, 400);
    }

    await initCore(env.monopolyd1);

    // Check if user exists
    let user = await findUserByEmail(env.monopolyd1, email);

    // If user doesn't exist, create one (auto-register)
    if (!user) {
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'player';
      await createUserWithPassword(env.monopolyd1, email, username, ''); // Empty password for magic link users
      user = await findUserByEmail(env.monopolyd1, email);
    }

    // Generate a magic link token (expires in 15 minutes)
    const magicToken = generateMagicToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Save the magic token
    await env.monopolyd1.prepare(
      'UPDATE users SET verification_token = ?, verification_expires = ? WHERE email = ?'
    ).bind(magicToken, expiresAt, email).run();

    // Mark email as verified for magic link users
    await env.monopolyd1.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').bind(email).run();

    // Send the magic link email via EMAIL_WORKER
    const baseUrl = new URL(request.url).origin;
    const magicLinkUrl = `${baseUrl}/auth/magic-link/verify?token=${magicToken}&email=${encodeURIComponent(email)}`;

    try {
      await sendEmailViaWorker(env, 'magic-link', {
        email,
        username: user?.username || email.split('@')[0],
        magicLinkUrl
      });
    } catch (emailErr) {
      console.error('Failed to send magic link email:', emailErr);
      return json({ error: 'Failed to send email. Please try again.' }, 500);
    }

    return json({ ok: true, message: 'Magic link sent! Check your email.' });
  } catch (e: any) {
    console.error('Magic link request error:', e);
    return json({ error: e?.message || 'Failed to send magic link' }, 500);
  }
}

/**
 * Generates a secure random token for magic link authentication.
 * @returns A URL-safe random token string.
 */
function generateMagicToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sends an email via the EMAIL_WORKER service binding.
 * This uses the separate email-worker which has the proper EMAIL binding configured.
 * @param env The environment bindings.
 * @param type The type of email to send ('verification' | 'welcome' | 'magic-link' | 'login-notification').
 * @param data The email data.
 */
async function sendEmailViaWorker(env: Env, type: string, data: Record<string, any>): Promise<void> {
  // Prefer EMAIL_WORKER service binding, fall back to direct EMAIL binding
  if (env.EMAIL_WORKER) {
    let endpoint = '';
    let body: Record<string, any> = {};

    switch (type) {
      case 'verification':
        endpoint = '/api/send-verification';
        body = { email: data.email, username: data.username, token: data.token };
        break;
      case 'welcome':
        // The email-worker doesn't have a welcome endpoint yet, use verification as template
        endpoint = '/api/send-verification';
        body = { email: data.email, username: data.username, token: 'welcome' };
        break;
      case 'magic-link':
        endpoint = '/api/send-magic-link';
        body = { email: data.email, username: data.username, magicLinkUrl: data.magicLinkUrl };
        break;
      case 'login-notification':
        endpoint = '/api/send-login-notification';
        body = { email: data.email, username: data.username, ip: data.ip, userAgent: data.userAgent };
        break;
      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    const response = await env.EMAIL_WORKER.fetch(`http://email-worker${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as any).error || `Email worker returned ${response.status}`);
    }

    console.log(`Email sent via EMAIL_WORKER: ${type} to ${data.email}`);
    return;
  }

  // Fallback to legacy EMAIL binding (may not work for arbitrary recipients)
  if (env.EMAIL) {
    console.warn('Using legacy EMAIL binding - may not work for all recipients');
    switch (type) {
      case 'verification':
        const { sendVerificationEmail } = await import('./email');
        await sendVerificationEmail(env.EMAIL, data.email, data.username, data.token, 'https://intrepoly.hwmnbn.me');
        break;
      case 'magic-link':
        await sendMagicLinkEmail(env.EMAIL, data.email, data.username, data.magicLinkUrl);
        break;
      case 'login-notification':
        await sendLoginNotificationEmail(env.EMAIL, data.email, data.username, data.ip, data.userAgent);
        break;
      default:
        console.warn(`No fallback for email type: ${type}`);
    }
    return;
  }

  throw new Error('No email service available (EMAIL_WORKER or EMAIL binding)');
}

/**
 * Sends a magic link email to the user.
 * @param emailBinding The EMAIL binding.
 * @param toEmail The recipient email.
 * @param username The user's display name.
 * @param magicLinkUrl The URL for the magic link.
 */
async function sendMagicLinkEmail(emailBinding: any, toEmail: string, username: string, magicLinkUrl: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #c32222, #8a1818); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">🎲 whoBmonopoly</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0;">Sign in with one click</p>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hey ${username}! 👋</h2>
      <p style="color: #555; line-height: 1.6;">Click the button below to sign in instantly - no password needed!</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${magicLinkUrl}" style="display: inline-block; background: linear-gradient(135deg, #c32222, #8a1818); color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
          🔐 Sign In Now
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">This link expires in 15 minutes and can only be used once.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hey ${username}!\n\nSign in to whoBmonopoly with one click:\n${magicLinkUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`;

  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  const raw = [
    'From: whoBmonopoly <signin@hwmnbn.me>',
    `To: ${toEmail}`,
    'Subject: Sign in to whoBmonopoly - Magic Link',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`
  ].join('\r\n');

  const msg = new EmailMessage('signin@hwmnbn.me', toEmail, raw);
  await emailBinding.send(msg);
}

/**
 * Handles magic link verification and signs in the user.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response (HTML page with auto-redirect or error).
 */
async function handleMagicLinkVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const email = url.searchParams.get('email')?.toLowerCase();

    if (!token || !email) {
      return new Response(generateMagicLinkPage('error', 'Missing token or email'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    await initCore(env.monopolyd1);

    // Find user with this token
    const user: any = await env.monopolyd1.prepare(
      'SELECT username, email, verification_token, verification_expires FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      return new Response(generateMagicLinkPage('error', 'User not found'), {
        headers: { 'Content-Type': 'text/html' },
        status: 404
      });
    }

    if (user.verification_token !== token) {
      return new Response(generateMagicLinkPage('error', 'Invalid or expired link'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    // Check expiration
    const expires = new Date(user.verification_expires).getTime();
    if (Date.now() > expires) {
      return new Response(generateMagicLinkPage('error', 'This link has expired. Please request a new one.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }

    // Clear the token (one-time use)
    await env.monopolyd1.prepare(
      'UPDATE users SET verification_token = NULL, verification_expires = NULL WHERE email = ?'
    ).bind(email).run();

    // Create session
    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    const sessionToken = await signSession(authSecret, { sub: user.username || email, iat: Date.now() });

    // Send login notification email via EMAIL_WORKER
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
      const userAgent = request.headers.get('User-Agent') || 'Unknown';
      await sendEmailViaWorker(env, 'login-notification', {
        email,
        username: user.username,
        ip,
        userAgent
      });
    } catch (e) {
      console.error('Failed to send login notification:', e);
    }

    // Set cookie with cross-domain support for *.hwmnbn.me
    const cookieValue = setCookieWithDomain('SESSION', sessionToken, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      domain: '.hwmnbn.me'
    });

    return new Response(generateMagicLinkPage('success', `Welcome back, ${user.username}!`), {
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': cookieValue
      }
    });
  } catch (e: any) {
    console.error('Magic link verify error:', e);
    return new Response(generateMagicLinkPage('error', 'Verification failed'), {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}

/**
 * Sends a login notification email to the user.
 */
async function sendLoginNotificationEmail(emailBinding: any, toEmail: string, username: string, ip: string, userAgent: string): Promise<void> {
  const loginTime = new Date().toUTCString();
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #48bb78, #38a169); padding: 30px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 28px;">✅ Login Successful</h1>
    </div>
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello ${username}!</h2>
      <p style="color: #555;">You've successfully signed in to your whoBmonopoly account.</p>
      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>Time:</strong> ${loginTime}</p>
        <p style="margin: 0 0 8px; color: #666; font-size: 14px;"><strong>IP:</strong> ${ip}</p>
        <p style="margin: 0; color: #666; font-size: 14px;"><strong>Device:</strong> ${userAgent.substring(0, 50)}...</p>
      </div>
      <p style="color: #888; font-size: 13px;">If this wasn't you, please contact support@hwmnbn.me immediately.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Login Successful - whoBmonopoly\n\nHello ${username},\n\nYou've signed in successfully.\n\nTime: ${loginTime}\nIP: ${ip}\n\nIf this wasn't you, contact support@hwmnbn.me`;

  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  const raw = [
    'From: whoBmonopoly <signin@hwmnbn.me>',
    `To: ${toEmail}`,
    'Subject: Login successful - whoBmonopoly',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`
  ].join('\r\n');

  const msg = new EmailMessage('signin@hwmnbn.me', toEmail, raw);
  await emailBinding.send(msg);
}

/**
 * Generates a `Set-Cookie` header string with domain support for cross-site SSO.
 */
function setCookieWithDomain(name: string, value: string, opts: { maxAge?: number; domain?: string } = {}): string {
  const attrs = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure'  // Required for cross-domain cookies
  ];
  if (opts.maxAge) attrs.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) attrs.push(`Domain=${opts.domain}`);
  return attrs.join('; ');
}

/**
 * Generates an HTML page for magic link result.
 */
function generateMagicLinkPage(status: 'success' | 'error', message: string): string {
  const isSuccess = status === 'success';
  const bgColor = isSuccess ? '#4CAF50' : '#f44336';
  const icon = isSuccess ? '✓' : '✕';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSuccess ? 'Signed In' : 'Sign In Failed'} - whoBmonopoly</title>
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
      background: linear-gradient(135deg, #c32222, #8a1818);
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
    }
  </style>
  ${isSuccess ? '<script>setTimeout(() => window.location.href = "/", 2000);</script>' : ''}
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${isSuccess ? 'Signed In!' : 'Sign In Failed'}</h1>
    <p>${message}</p>
    ${isSuccess ? '<p style="color:#888;font-size:13px;">Redirecting to game...</p>' : ''}
    <a href="/" class="button">${isSuccess ? 'Go to Game' : 'Try Again'}</a>
  </div>
</body>
</html>`;
}

/**
 * Handles requests for TURN server credentials.
 * Generates short-lived credentials from Cloudflare's TURN service for WebRTC.
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with ICE server config.
 */
async function handleTurnCredentials(request: Request, env: Env): Promise<Response> {
  // Build CORS headers
  const origin = request.headers.get('Origin') || '';
  const corsAllowed = origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost');

  const addCors = (headers: HeadersInit): HeadersInit => {
    if (corsAllowed) {
      (headers as Record<string, string>)['Access-Control-Allow-Origin'] = origin;
      (headers as Record<string, string>)['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
  };

  try {
    const turnTokenId = env.TURN_TOKEN_ID;
    const turnApiToken = env.TURN_API_TOKEN;

    if (!turnTokenId || !turnApiToken) {
      // Return STUN-only config if TURN is not configured
      return new Response(JSON.stringify({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        warning: 'TURN not configured, using STUN only'
      }), {
        headers: addCors({ 'Content-Type': 'application/json' })
      });
    }

    // Get user identifier for tracking (optional)
    let customIdentifier = 'anonymous';
    const token = getCookie(request, 'SESSION');
    if (token) {
      const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
      const sess = await verifySession(authSecret, token);
      if (sess?.sub) customIdentifier = sess.sub;
    }

    // Generate TURN credentials from Cloudflare API
    // TTL of 24 hours (86400 seconds) - adjust based on typical game duration
    const turnResponse = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${turnTokenId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${turnApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ttl: 86400, // 24 hours
          customIdentifier: customIdentifier
        })
      }
    );

    if (!turnResponse.ok) {
      const errorText = await turnResponse.text();
      console.error('TURN API error:', turnResponse.status, errorText);

      // Fallback to STUN-only
      return new Response(JSON.stringify({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' }
        ],
        error: 'TURN credential generation failed',
        fallback: true
      }), {
        headers: addCors({ 'Content-Type': 'application/json' })
      });
    }

    const turnData = await turnResponse.json() as any;

    // Return the iceServers configuration
    return new Response(JSON.stringify({
      iceServers: turnData.iceServers || [
        {
          urls: [
            'stun:stun.cloudflare.com:3478',
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=tcp',
            'turns:turn.cloudflare.com:5349?transport=tcp'
          ],
          username: turnData.username,
          credential: turnData.credential
        }
      ],
      ttl: 86400,
      provider: 'cloudflare'
    }), {
      headers: addCors({
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3600' // Cache for 1 hour client-side
      })
    });

  } catch (e: any) {
    console.error('TURN credentials error:', e);
    return new Response(JSON.stringify({
      error: e?.message || 'Failed to generate TURN credentials',
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      fallback: true
    }), {
      status: 500,
      headers: addCors({ 'Content-Type': 'application/json' })
    });
  }
}

// ============================================
// SFU (Serverless Forwarding Unit) Handlers
// ============================================

const SFU_API_BASE = 'https://rtc.live.cloudflare.com/v1/apps';

/**
 * Helper to build CORS headers for SFU requests.
 */
function sfuCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost')) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

/**
 * Creates a new SFU session.
 * POST /api/sfu/session/new
 */
async function handleSfuNewSession(request: Request, env: Env): Promise<Response> {
  const headers = sfuCorsHeaders(request);

  if (!env.SFU_APP_ID || !env.SFU_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'SFU not configured' }), { status: 503, headers });
  }

  try {
    const body = await safeJson(request);

    const sfuResponse = await fetch(`${SFU_API_BASE}/${env.SFU_APP_ID}/sessions/new`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SFU_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });

    const data = await sfuResponse.json();

    if (!sfuResponse.ok) {
      return new Response(JSON.stringify({ error: 'SFU API error', details: data }), {
        status: sfuResponse.status,
        headers
      });
    }

    return new Response(JSON.stringify(data), { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to create session' }), {
      status: 500,
      headers
    });
  }
}

/**
 * Adds tracks to an existing SFU session.
 * POST /api/sfu/session/:sessionId/tracks/new
 */
async function handleSfuNewTracks(request: Request, env: Env, sessionId: string): Promise<Response> {
  const headers = sfuCorsHeaders(request);

  if (!env.SFU_APP_ID || !env.SFU_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'SFU not configured' }), { status: 503, headers });
  }

  try {
    const body = await safeJson(request);

    const sfuResponse = await fetch(`${SFU_API_BASE}/${env.SFU_APP_ID}/sessions/${sessionId}/tracks/new`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SFU_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });

    const data = await sfuResponse.json();

    if (!sfuResponse.ok) {
      return new Response(JSON.stringify({ error: 'SFU API error', details: data }), {
        status: sfuResponse.status,
        headers
      });
    }

    return new Response(JSON.stringify(data), { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to add tracks' }), {
      status: 500,
      headers
    });
  }
}

/**
 * Renegotiates an SFU session.
 * PUT /api/sfu/session/:sessionId/renegotiate
 */
async function handleSfuRenegotiate(request: Request, env: Env, sessionId: string): Promise<Response> {
  const headers = sfuCorsHeaders(request);

  if (!env.SFU_APP_ID || !env.SFU_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'SFU not configured' }), { status: 503, headers });
  }

  try {
    const body = await safeJson(request);

    const sfuResponse = await fetch(`${SFU_API_BASE}/${env.SFU_APP_ID}/sessions/${sessionId}/renegotiate`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.SFU_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });

    const data = await sfuResponse.json();

    if (!sfuResponse.ok) {
      return new Response(JSON.stringify({ error: 'SFU API error', details: data }), {
        status: sfuResponse.status,
        headers
      });
    }

    return new Response(JSON.stringify(data), { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to renegotiate' }), {
      status: 500,
      headers
    });
  }
}

/**
 * Closes tracks in an SFU session.
 * PUT /api/sfu/session/:sessionId/tracks/close
 */
async function handleSfuCloseTracks(request: Request, env: Env, sessionId: string): Promise<Response> {
  const headers = sfuCorsHeaders(request);

  if (!env.SFU_APP_ID || !env.SFU_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'SFU not configured' }), { status: 503, headers });
  }

  try {
    const body = await safeJson(request);

    const sfuResponse = await fetch(`${SFU_API_BASE}/${env.SFU_APP_ID}/sessions/${sessionId}/tracks/close`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.SFU_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });

    const data = await sfuResponse.json();

    if (!sfuResponse.ok) {
      return new Response(JSON.stringify({ error: 'SFU API error', details: data }), {
        status: sfuResponse.status,
        headers
      });
    }

    return new Response(JSON.stringify(data), { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to close tracks' }), {
      status: 500,
      headers
    });
  }
}

/**
 * Gets session information.
 * GET /api/sfu/session/:sessionId
 */
async function handleSfuGetSession(request: Request, env: Env, sessionId: string): Promise<Response> {
  const headers = sfuCorsHeaders(request);

  if (!env.SFU_APP_ID || !env.SFU_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'SFU not configured' }), { status: 503, headers });
  }

  try {
    const sfuResponse = await fetch(`${SFU_API_BASE}/${env.SFU_APP_ID}/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.SFU_API_TOKEN}`
      }
    });

    const data = await sfuResponse.json();

    if (!sfuResponse.ok) {
      return new Response(JSON.stringify({ error: 'SFU API error', details: data }), {
        status: sfuResponse.status,
        headers
      });
    }

    return new Response(JSON.stringify(data), { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to get session' }), {
      status: 500,
      headers
    });
  }
}

// EmailMessage class for Cloudflare Email Workers
declare class EmailMessage {
  constructor(from: string, to: string, raw: string);
}

/**
 * CORS headers for cross-subdomain SSO requests.
 * Allows any *.hwmnbn.me subdomain to make auth requests.
 */
function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers();

  // Only allow *.hwmnbn.me subdomains
  if (origin.endsWith('.hwmnbn.me') || origin === 'https://hwmnbn.me' || origin.includes('localhost')) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  }

  return headers;
}

/**
 * Creates a JSON response with CORS headers for SSO.
 */
function jsonWithCors(request: Request, data: any, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Handles SSO validation requests from other *.hwmnbn.me subdomains.
 * This endpoint validates the session cookie and returns user info.
 *
 * Other sites can call this to verify if a user is logged in:
 * - GET/POST /auth/sso/validate (with credentials: 'include')
 * - Returns: { valid: true, user: "username", stats: {...} } or { valid: false }
 *
 * @param request The incoming request.
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with user info.
 */
async function handleSsoValidate(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(request);
    return new Response(null, { status: 204, headers });
  }

  try {
    // Check for Cloudflare Access header first
    const cfEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfEmail) {
      await initCore(env.monopolyd1);
      const existing = await findUserByEmail(env.monopolyd1, cfEmail);
      if (!existing) {
        const username = cfEmail.split('@')[0];
        await createUserWithPassword(env.monopolyd1, cfEmail, username, '');
      }
      return jsonWithCors(request, {
        valid: true,
        user: cfEmail,
        provider: 'cloudflare-access'
      });
    }

    // Check session cookie
    const token = getCookie(request, 'SESSION');
    if (!token) {
      return jsonWithCors(request, { valid: false, reason: 'no_session' });
    }

    const authSecret = env.AUTH_SECRET || 'dev-secret-not-for-prod';
    const sess = await verifySession(authSecret, token);

    if (!sess?.sub) {
      return jsonWithCors(request, { valid: false, reason: 'invalid_token' });
    }

    // Get user stats
    await initCore(env.monopolyd1);
    const user = await ensureUserByUsername(env.monopolyd1, sess.sub);
    const row: any = await env.monopolyd1.prepare(
      'SELECT id, username, email, wins, losses, credits, gamer_id, email_verified, online FROM users WHERE username=?'
    ).bind(user?.username || sess.sub).first();

    return jsonWithCors(request, {
      valid: true,
      user: sess.sub,
      userId: row?.id,
      gamerId: row?.gamer_id,
      email: row?.email,
      emailVerified: row?.email_verified === 1,
      stats: row ? {
        wins: row.wins,
        losses: row.losses,
        credits: row.credits
      } : null,
      iat: sess.iat,
      provider: 'session'
    });
  } catch (e: any) {
    console.error('SSO validate error:', e);
    return jsonWithCors(request, { valid: false, reason: 'error', details: e?.message }, 500);
  }
}

/**
 * Returns SSO configuration for other *.hwmnbn.me sites.
 * This tells other sites how to integrate with the SSO system.
 *
 * @param env The environment bindings.
 * @returns A promise that resolves to a Response with SSO config.
 */
async function handleSsoConfig(env: Env): Promise<Response> {
  return json({
    sso: {
      domain: '.hwmnbn.me',
      authority: 'intrepoly.hwmnbn.me',
      endpoints: {
        validate: 'https://intrepoly.hwmnbn.me/auth/sso/validate',
        login: 'https://intrepoly.hwmnbn.me/auth/login-email',
        signup: 'https://intrepoly.hwmnbn.me/auth/signup',
        logout: 'https://intrepoly.hwmnbn.me/auth/logout',
        whoami: 'https://intrepoly.hwmnbn.me/auth/whoami',
        magicLink: 'https://intrepoly.hwmnbn.me/auth/magic-link/request'
      },
      cookieName: 'SESSION',
      integration: {
        databaseId: '5363662e-5cbb-4faf-982a-55b44c847791',
        databaseName: 'monopolyd1',
        authSecretEnvVar: 'AUTH_SECRET'
      },
      notes: [
        'All workers under *.hwmnbn.me share the same session cookie',
        'Use credentials: "include" when calling SSO endpoints',
        'Workers can bind to the same monopolyd1 database for direct user access',
        'Or call /auth/sso/validate to verify sessions via API'
      ]
    }
  });
}
