#!/usr/bin/env npx tsx
/**
 * format-server.ts — DEViLBOX Format Status Tracker server
 *
 * Serves format-status.html on port 4444 and provides REST+SSE API:
 *   GET  /          → format-status.html
 *   GET  /get-data  → full state JSON
 *   POST /update    → { key|format, ...data } — update one entry
 *   POST /push-updates → { key: data, ... } — bulk update
 *   GET  /events    → SSE stream for live updates
 *
 * State is persisted to tools/format-state.json.
 *
 * Usage:
 *   npx tsx tools/format-server.ts
 *   npx tsx tools/format-server.ts --port 4444
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'format-state.json');
const HTML_FILE  = join(__dirname, 'format-status.html');
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] ?? '') ||
             (process.argv.includes('--port') ? parseInt(process.argv[process.argv.indexOf('--port') + 1]) : 0) ||
             4444;

// ── State ──────────────────────────────────────────────────────────────────

type State = Record<string, Record<string, unknown>>;

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as State; } catch {}
  }
  return {};
}

function saveState(state: State): void {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) {
    console.error('[server] Failed to save state:', (e as Error).message);
  }
}

let state: State = loadState();
console.log(`[server] Loaded ${Object.keys(state).length} entries from ${STATE_FILE}`);

// ── SSE clients ────────────────────────────────────────────────────────────

const sseClients = new Set<ServerResponse>();

function pushSSE(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

// ── Body parser ────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Request handler ────────────────────────────────────────────────────────

function send(res: ServerResponse, status: number, body: string, ct = 'application/json'): void {
  res.writeHead(status, {
    'Content-Type': ct,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url?.split('?')[0] ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') { send(res, 204, ''); return; }

  // ── GET / — serve HTML dashboard ──────────────────────────────────────────
  if (method === 'GET' && url === '/') {
    try {
      const html = readFileSync(HTML_FILE, 'utf-8');
      send(res, 200, html, 'text/html; charset=utf-8');
    } catch {
      send(res, 500, '{"error":"format-status.html not found"}');
    }
    return;
  }

  // ── GET /get-data ─────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/get-data') {
    send(res, 200, JSON.stringify(state));
    return;
  }

  // ── GET /events — SSE ─────────────────────────────────────────────────────
  if (method === 'GET' && url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');
    // Send current state snapshot on connect
    res.write(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── POST /update — single entry ───────────────────────────────────────────
  if (method === 'POST' && url === '/update') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as Record<string, unknown>;
      const key = (payload.key ?? payload.format) as string | undefined;
      if (!key) { send(res, 400, '{"error":"missing key or format"}'); return; }
      const data = { ...payload };
      delete data.key; delete data.format;
      state[key] = { ...(state[key] ?? {}), ...data };
      saveState(state);
      pushSSE('update', { [key]: state[key] });
      send(res, 200, JSON.stringify({ ok: true, key }));
    } catch (e) {
      send(res, 400, JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // ── POST /push-updates — bulk update ──────────────────────────────────────
  if (method === 'POST' && url === '/push-updates') {
    try {
      const body = await readBody(req);
      const updates = JSON.parse(body) as Record<string, Record<string, unknown>>;
      let changed = 0;
      for (const [key, data] of Object.entries(updates)) {
        const existing = state[key] ?? {};
        state[key] = { ...existing, ...data };
        changed++;
      }
      saveState(state);
      pushSSE('bulk-update', updates);
      send(res, 200, JSON.stringify({ ok: true, changed }));
    } catch (e) {
      send(res, 400, JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  send(res, 404, '{"error":"not found"}');
});

server.listen(PORT, () => {
  console.log(`[server] Format status tracker → http://localhost:${PORT}`);
  console.log(`[server] State file: ${STATE_FILE}`);
  console.log(`[server] ${Object.keys(state).length} entries loaded`);
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} already in use — is another instance running?`);
  } else {
    console.error('[server] Error:', e.message);
  }
  process.exit(1);
});
