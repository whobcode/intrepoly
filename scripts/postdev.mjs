#!/usr/bin/env node
// Expose the local dev server on :444 via Cloudflare Tunnel, ngrok, or localtunnel
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pExecFile = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes('=') ? a.replace(/^--?/, '').split('=') : [a.replace(/^--?/, ''), process.argv[++i]];
    args.set(k, v);
  }
  return args;
}

async function hasBinary(bin) {
  try {
    await pExecFile(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return true;
  } catch { return false; }
}

async function startCloudflare(port) {
  // Prefer a named tunnel if TUNNEL_NAME and credentials exist; otherwise quick tunnel
  const name = process.env.TUNNEL_NAME;
  const baseArgs = ['tunnel', '--url', `http://127.0.0.1:${port}`];
  const args = name ? ['tunnel', 'run', name] : baseArgs;
  const child = exec('cloudflared ' + args.join(' '));
  pipe(child);
}

function exec(cmd) {
  const child = require('node:child_process').spawn(cmd, { shell: true, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  return child;
}

function pipe(child) {
  child.stdout && child.stdout.pipe(process.stdout);
  child.stderr && child.stderr.pipe(process.stderr);
}

async function startNgrok(port) {
  try {
    const ng = await import('ngrok');
    const url = await ng.default.connect({ addr: port, proto: 'http' });
    console.log('ngrok URL:', url);
  } catch (e) {
    console.error('ngrok not available. Install devDependency "ngrok" or set provider=localtunnel.');
    process.exit(1);
  }
}

async function startLocalTunnel(port) {
  try {
    const lt = await import('localtunnel');
    const tunnel = await lt.default({ port, host: process.env.LT_HOST, subdomain: process.env.LT_SUBDOMAIN });
    console.log('localtunnel URL:', tunnel.url);
    tunnel.on('close', () => process.exit(0));
  } catch (e) {
    console.error('localtunnel not available. Install devDependency "localtunnel".');
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs();
  const port = parseInt(process.env.PORT || args.get('port') || '444', 10);
  const provider = (process.env.TUNNEL_PROVIDER || args.get('provider') || 'auto').toLowerCase();

  if (provider === 'cloudflare' || provider === 'cf') {
    if (!(await hasBinary('cloudflared'))) {
      console.error('cloudflared binary not found in PATH. Install cloudflared or use provider=ngrok/localtunnel.');
      process.exit(1);
    }
    return startCloudflare(port);
  }

  if (provider === 'ngrok') return startNgrok(port);
  if (provider === 'localtunnel' || provider === 'lt') return startLocalTunnel(port);

  // auto
  if (await hasBinary('cloudflared')) return startCloudflare(port);
  try { await import('ngrok'); return startNgrok(port); } catch {}
  return startLocalTunnel(port);
}

main().catch((e) => { console.error(e); process.exit(1); });

