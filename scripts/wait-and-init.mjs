#!/usr/bin/env node
// Wait until dev server responds, then call /admin/db/init
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

async function readAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  try {
    const txt = await readFile(resolve(here, '..', 'wrangler.jsonc'), 'utf8');
    const match = txt.match(/"AUTH_SECRET"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  return undefined;
}

function parseArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes('=') ? a.replace(/^--?/, '').split('=') : [a.replace(/^--?/, ''), process.argv[++i]];
    args.set(k, v);
  }
  return args;
}

async function waitFor(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url + '/auth/whoami');
      if (r.ok) return true;
    } catch {}
    await delay(500);
  }
  return false;
}

async function main() {
  const args = parseArgs();
  const base = (args.get('url') || process.env.INIT_URL || 'http://127.0.0.1:444').replace(/\/$/, '');
  const ok = await waitFor(base, 120000);
  if (!ok) { console.error('Dev server did not become ready in time:', base); process.exit(1); }
  const key = await readAuthSecret();
  if (!key) { console.error('Missing AUTH_SECRET for init'); process.exit(1); }
  const resp = await fetch(base + '/admin/db/init', { method: 'POST', headers: { 'x-admin-key': key } });
  const body = await resp.text();
  if (!resp.ok) {
    console.error('DB init failed', resp.status, body);
    process.exit(1);
  }
  console.log('DB init ok (dev)');
}

main().catch((e) => { console.error(e); process.exit(1); });

