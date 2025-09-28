#!/usr/bin/env node
// Post-deploy/dev DB initializer: calls /admin/db/init with x-admin-key
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

async function readAuthSecret() {
  // Try env first
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Fallback: read from wrangler.jsonc vars
  try {
    const txt = await readFile(resolve(here, '..', 'wrangler.jsonc'), 'utf8');
    const match = txt.match(/"AUTH_SECRET"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  return undefined;
}

async function inferUrl() {
  try {
    const txt = await readFile(resolve(here, '..', 'wrangler.jsonc'), 'utf8');
    // Find a route with custom_domain true
    const routeRegex = /\{\s*\"pattern\"\s*:\s*\"([^\"]+)\"\s*,\s*\"custom_domain\"\s*:\s*true\s*\}/g;
    const m = routeRegex.exec(txt);
    if (m && m[1]) {
      const host = m[1].replace(/\/$/, '');
      if (!/^https?:\/\//.test(host)) return 'https://' + host;
      return host;
    }
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

async function main() {
  const args = parseArgs();
  let url = (args.get('url') || process.env.INIT_URL || '').replace(/\/$/, '');
  if (!url) {
    url = await inferUrl() || '';
  }
  if (!url) { console.error('Missing --url and unable to infer from wrangler.jsonc routes'); process.exit(1); }
  const key = await readAuthSecret();
  if (!key) { console.error('Missing AUTH_SECRET (set env AUTH_SECRET or define in wrangler.jsonc vars)'); process.exit(1); }
  const resp = await fetch(url + '/admin/db/init', { method: 'POST', headers: { 'x-admin-key': key } });
  const body = await resp.text();
  if (!resp.ok) {
    console.error('DB init failed', resp.status, body);
    process.exit(1);
  }
  console.log('DB init ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
