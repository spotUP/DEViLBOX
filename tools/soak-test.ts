#!/usr/bin/env npx tsx
/**
 * soak-test.ts — Pre-gig stability stress test for DEViLBOX
 *
 * Drives the running DEViLBOX dev server's MCP relay (port 4003) as a pure
 * WebSocket client. Walks a directory of music files, plays each one for a
 * short window, and captures health metrics over time. Designed to run
 * unattended for 2+ hours to surface memory growth, GPU stalls, and silent
 * format crashes BEFORE the live gig on April 18 2026.
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────
 *  1. DEViLBOX dev server running:        npm run dev
 *     (this starts Vite :5173, Express :3001, MCP relay :4003)
 *  2. Browser open at http://localhost:5173 — the MCP bridge auto-connects
 *  3. Click anywhere in the page to unlock the AudioContext (required!)
 *
 * ─── Usage ─────────────────────────────────────────────────────────────────
 *   npx tsx tools/soak-test.ts \
 *     --duration 2 \
 *     --module-dir third-party/furnace-master/demos \
 *     --snapshot-interval 60 \
 *     --report tools/soak-report.md
 *
 *   All flags are optional. Defaults:
 *     --duration           2 hours
 *     --module-dir         third-party/furnace-master/demos
 *     --snapshot-interval  60 seconds
 *     --play-window        25 seconds (per-module playback window)
 *     --report             tools/soak-report.md
 *     --crash-threshold    50 (exit code 1 if exceeded)
 *
 *   Send SIGINT (Ctrl-C) at any time for a clean shutdown + report write.
 *
 * ─── Exit codes ────────────────────────────────────────────────────────────
 *   0   clean finish, crash count below --crash-threshold
 *   1   crash threshold exceeded (still writes the report)
 *   2   could not connect to ws://localhost:4003/mcp
 *   3   no modules discovered in --module-dir
 *
 * ─── How to read the report ────────────────────────────────────────────────
 *   tools/soak-report.md contains:
 *     - Run header (start/end/duration/totals)
 *     - Pass / silent / crash counts
 *     - Memory time series (min/max/mean + ASCII sparkline)
 *     - Per-extension breakdown
 *     - Crash log (path + first error line per failure)
 *   Look for: rising mean memory, accelerating crash rate, format-specific
 *   silent loads. Anything > 1% silent or > 0.5% crashing is gig-blocker.
 *
 * ─── Dependencies ──────────────────────────────────────────────────────────
 *   Uses the `ws` package from the repo root node_modules. No new packages
 *   are installed. If `ws` ever moves, switch to Node 22 built-in WebSocket
 *   (the protocol used here is plain JSON over a single client connection).
 *
 * ─── Wire protocol (server/src/mcp/wsRelay.ts + protocol.ts) ───────────────
 *   Connect to ws://localhost:4003/mcp as an MCP-subprocess-style client.
 *   Send  : { id: uuid, type: 'call', method: <toolName>, params: {...} }
 *   Recv  : { id: uuid, type: 'result'|'error', data?: ..., error?: ... }
 *   The relay forwards every call to the connected browser.
 */

import { WebSocket } from 'ws';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';

// ─── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  durationHours: number;
  moduleDir: string;
  snapshotIntervalSec: number;
  playWindowSec: number;
  reportPath: string;
  crashThreshold: number;
  relayUrl: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback?: string): string | undefined => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    const eq = argv.find(a => a.startsWith(`--${name}=`));
    if (eq) return eq.split('=').slice(1).join('=');
    return fallback;
  };
  return {
    durationHours: Number(get('duration', '2')),
    moduleDir: get('module-dir', 'third-party/furnace-master/demos')!,
    snapshotIntervalSec: Number(get('snapshot-interval', '60')),
    playWindowSec: Number(get('play-window', '25')),
    reportPath: get('report', 'tools/soak-report.md')!,
    crashThreshold: Number(get('crash-threshold', '50')),
    relayUrl: get('relay', 'ws://localhost:4003/mcp')!,
  };
}

// ─── Module discovery ────────────────────────────────────────────────────────

const SUPPORTED_EXT = new Set([
  '.fur', '.mod', '.xm', '.it', '.s3m', '.sid', '.sng', '.mptm',
  '.hvl', '.ahx', '.psm', '.mtm', '.669', '.dbm', '.okt', '.med',
  '.amf', '.imf', '.stm', '.ult', '.dsm', '.far', '.mt2',
]);
// Multi-file Amiga formats (prefix-based):
const PREFIX_PATTERNS = ['mdat.', 'hip7.', 'hip.', 'cust.', 'sng.'];

function isSupported(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (SUPPORTED_EXT.has(extname(lower))) return true;
  return PREFIX_PATTERNS.some(p => lower.startsWith(p));
}

async function walkDir(dir: string, out: string[] = []): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = await stat(full); } catch { continue; }
    if (st.isDirectory()) {
      // Skip well-known noise dirs
      if (name === 'node_modules' || name.startsWith('.')) continue;
      await walkDir(full, out);
    } else if (st.isFile() && isSupported(name)) {
      out.push(full);
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── MCP relay client ────────────────────────────────────────────────────────

interface BridgeRequest {
  id: string;
  type: 'call';
  method: string;
  params: Record<string, unknown>;
}
interface BridgeResponse {
  id: string;
  type: 'result' | 'error';
  data?: unknown;
  error?: string;
}

class RelayClient {
  private ws: WebSocket;
  private pending = new Map<string, (r: BridgeResponse) => void>();
  private timeoutMs = 60_000;

  constructor(private url: string) {
    this.ws = null as unknown as WebSocket;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const onOpen = () => {
        this.ws.off('error', onErr);
        this.ws.on('message', (data: Buffer) => this.onMessage(data));
        this.ws.on('close', () => this.onClose());
        resolve();
      };
      const onErr = (err: Error) => {
        this.ws.off('open', onOpen);
        reject(err);
      };
      this.ws.once('open', onOpen);
      this.ws.once('error', onErr);
    });
  }

  private onMessage(data: Buffer): void {
    let msg: BridgeResponse;
    try { msg = JSON.parse(data.toString()) as BridgeResponse; } catch { return; }
    const r = this.pending.get(msg.id);
    if (r) {
      this.pending.delete(msg.id);
      r(msg);
    }
  }

  private onClose(): void {
    for (const [id, r] of this.pending) {
      r({ id, type: 'error', error: 'WebSocket closed' });
    }
    this.pending.clear();
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket not open (state=${this.ws.readyState})`));
        return;
      }
      const id = randomUUID();
      const req: BridgeRequest = { id, type: 'call', method, params };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`'${method}' timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        if (resp.type === 'error') reject(new Error(resp.error ?? 'unknown error'));
        else resolve(resp.data);
      });
      this.ws.send(JSON.stringify(req));
    });
  }

  close(): void {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

// ─── Result tracking ─────────────────────────────────────────────────────────

interface PlayResult {
  path: string;
  ext: string;
  status: 'pass' | 'silent' | 'crash' | 'load-error';
  errorCount: number;
  firstError?: string;
  rms?: number;
  durationMs: number;
  timestamp: number;
}

interface MemorySnapshot {
  timestamp: number;
  data: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function pickNumber(obj: unknown, ...keys: string[]): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object') {
      const nested = pickNumber(v, ...keys);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function extractHeapBytes(snap: unknown): number | undefined {
  // Try common shapes from get_monitoring_data / performance.memory
  return pickNumber(snap, 'usedJSHeapSize', 'jsHeapUsed', 'heapUsed', 'memory');
}

function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const blocks = ' ▁▂▃▄▅▆▇█';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => blocks[Math.min(8, Math.floor(((v - min) / range) * 8))]).join('');
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function playOne(client: RelayClient, path: string, playWindowMs: number): Promise<PlayResult> {
  const t0 = Date.now();
  const ext = extname(path).toLowerCase() || '(noext)';
  const result: PlayResult = {
    path,
    ext,
    status: 'pass',
    errorCount: 0,
    durationMs: 0,
    timestamp: t0,
  };

  try {
    await client.call('clear_console_errors');

    // Read file ourselves and send via load_file (the path-based MCP wrapper
    // lives in the MCP subprocess, not in the relay protocol).
    const fileData = await readFile(path);
    const b64 = fileData.toString('base64');
    await client.call('load_file', {
      filename: basename(path),
      data: b64,
    });
    await client.call('play', {});

    await sleep(playWindowMs);

    const errors = await client.call('get_console_errors') as { entries?: Array<{ level: string; message: string }> };
    const level = await client.call('get_audio_level', { durationMs: 1000 }) as { isSilent?: boolean; rmsAvg?: number };

    const errs = errors?.entries ?? [];
    const fatal = errs.filter(e => e.level === 'error');
    result.errorCount = errs.length;
    result.rms = level?.rmsAvg;

    if (fatal.length > 0) {
      result.status = 'crash';
      result.firstError = fatal[0].message.slice(0, 200);
    } else if (level?.isSilent === true) {
      result.status = 'silent';
    }

    try { await client.call('stop'); } catch { /* ignore */ }
  } catch (e) {
    result.status = 'load-error';
    result.firstError = (e as Error).message.slice(0, 200);
  }

  result.durationMs = Date.now() - t0;
  return result;
}

async function snapshotMemory(client: RelayClient): Promise<MemorySnapshot | null> {
  try {
    const data = await client.call('get_monitoring_data');
    return { timestamp: Date.now(), data };
  } catch {
    return null;
  }
}

// ─── Report writer ───────────────────────────────────────────────────────────

function writeReport(
  args: Args,
  startTs: number,
  endTs: number,
  results: PlayResult[],
  snapshots: MemorySnapshot[],
): string {
  const total = results.length;
  const pass = results.filter(r => r.status === 'pass').length;
  const silent = results.filter(r => r.status === 'silent').length;
  const crashed = results.filter(r => r.status === 'crash').length;
  const loadErr = results.filter(r => r.status === 'load-error').length;

  // Per-extension breakdown
  const byExt = new Map<string, { total: number; pass: number; silent: number; crash: number; loadErr: number }>();
  for (const r of results) {
    const b = byExt.get(r.ext) ?? { total: 0, pass: 0, silent: 0, crash: 0, loadErr: 0 };
    b.total++;
    if (r.status === 'pass') b.pass++;
    else if (r.status === 'silent') b.silent++;
    else if (r.status === 'crash') b.crash++;
    else if (r.status === 'load-error') b.loadErr++;
    byExt.set(r.ext, b);
  }

  // Memory series
  const heapSeries: number[] = [];
  for (const s of snapshots) {
    const bytes = extractHeapBytes(s.data);
    if (bytes !== undefined) heapSeries.push(bytes);
  }
  const heapMin = heapSeries.length ? Math.min(...heapSeries) : 0;
  const heapMax = heapSeries.length ? Math.max(...heapSeries) : 0;
  const heapMean = heapSeries.length ? heapSeries.reduce((a, b) => a + b, 0) / heapSeries.length : 0;
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + ' MB';

  const lines: string[] = [];
  lines.push('# DEViLBOX Soak Test Report');
  lines.push('');
  lines.push(`- **Start**: ${new Date(startTs).toISOString()}`);
  lines.push(`- **End**:   ${new Date(endTs).toISOString()}`);
  lines.push(`- **Duration**: ${fmtDuration(endTs - startTs)} (target ${args.durationHours}h)`);
  lines.push(`- **Module dir**: \`${args.moduleDir}\``);
  lines.push(`- **Play window**: ${args.playWindowSec}s per module`);
  lines.push(`- **Snapshot interval**: ${args.snapshotIntervalSec}s`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total played: **${total}**`);
  lines.push(`- Pass:        **${pass}** (${total ? ((pass / total) * 100).toFixed(1) : '0.0'}%)`);
  lines.push(`- Silent:      **${silent}** (${total ? ((silent / total) * 100).toFixed(1) : '0.0'}%)`);
  lines.push(`- Crash:       **${crashed}** (${total ? ((crashed / total) * 100).toFixed(1) : '0.0'}%)`);
  lines.push(`- Load error:  **${loadErr}** (${total ? ((loadErr / total) * 100).toFixed(1) : '0.0'}%)`);
  lines.push('');
  lines.push('## Memory time series');
  lines.push('');
  if (heapSeries.length > 0) {
    lines.push(`- Samples: ${heapSeries.length}`);
    lines.push(`- Heap min:  ${mb(heapMin)}`);
    lines.push(`- Heap max:  ${mb(heapMax)}`);
    lines.push(`- Heap mean: ${mb(heapMean)}`);
    lines.push(`- Drift (max - min): ${mb(heapMax - heapMin)}`);
    lines.push('');
    lines.push('```');
    lines.push(sparkline(heapSeries));
    lines.push('```');
  } else {
    lines.push('_No usable heap snapshots collected (get_monitoring_data returned no recognized field)._');
  }
  lines.push('');
  lines.push('## Per-format breakdown');
  lines.push('');
  lines.push('| Ext | Total | Pass | Silent | Crash | LoadErr |');
  lines.push('|-----|------:|-----:|-------:|------:|--------:|');
  const exts = [...byExt.keys()].sort();
  for (const ext of exts) {
    const b = byExt.get(ext)!;
    lines.push(`| ${ext} | ${b.total} | ${b.pass} | ${b.silent} | ${b.crash} | ${b.loadErr} |`);
  }
  lines.push('');
  lines.push('## Crash log');
  lines.push('');
  const failures = results.filter(r => r.status === 'crash' || r.status === 'load-error');
  if (failures.length === 0) {
    lines.push('_No crashes._');
  } else {
    for (const f of failures) {
      lines.push(`- **${f.status}** \`${f.path}\``);
      if (f.firstError) lines.push(`  - ${f.firstError}`);
    }
  }
  lines.push('');
  lines.push('## Silent log');
  lines.push('');
  const silents = results.filter(r => r.status === 'silent');
  if (silents.length === 0) {
    lines.push('_No silent loads._');
  } else {
    for (const f of silents) {
      lines.push(`- \`${f.path}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('[soak] config:', args);

  const moduleDir = resolve(args.moduleDir);
  console.log(`[soak] discovering modules in ${moduleDir} ...`);
  const modules = await walkDir(moduleDir);
  if (modules.length === 0) {
    console.error(`[soak] no supported modules found under ${moduleDir}`);
    process.exit(3);
  }
  shuffle(modules);
  console.log(`[soak] discovered ${modules.length} modules`);

  const client = new RelayClient(args.relayUrl);
  try {
    await client.connect();
    console.log(`[soak] connected to ${args.relayUrl}`);
  } catch (e) {
    console.error(`[soak] failed to connect to ${args.relayUrl}: ${(e as Error).message}`);
    console.error('[soak] is the dev server running and is the browser open?');
    process.exit(2);
  }

  const startTs = Date.now();
  const endTs = startTs + args.durationHours * 3600_000;
  const results: PlayResult[] = [];
  const snapshots: MemorySnapshot[] = [];
  let stopRequested = false;

  process.on('SIGINT', () => {
    console.log('\n[soak] SIGINT received — finishing current module then writing report');
    stopRequested = true;
  });

  // Snapshot timer (independent of play loop)
  let lastSnapshot = 0;
  const snapshotIntervalMs = args.snapshotIntervalSec * 1000;
  const playWindowMs = args.playWindowSec * 1000;

  let i = 0;
  while (!stopRequested && Date.now() < endTs) {
    const modulePath = modules[i % modules.length];
    i++;

    if (Date.now() - lastSnapshot >= snapshotIntervalMs) {
      const snap = await snapshotMemory(client);
      if (snap) snapshots.push(snap);
      lastSnapshot = Date.now();
    }

    const result = await playOne(client, modulePath, playWindowMs);
    results.push(result);

    const elapsed = Date.now() - startTs;
    const remaining = endTs - Date.now();
    const tag = result.status === 'pass' ? 'OK    ' :
                result.status === 'silent' ? 'SILENT' :
                result.status === 'crash' ? 'CRASH ' : 'LOADER';
    console.log(
      `[soak ${fmtDuration(elapsed)}/${fmtDuration(args.durationHours * 3600_000)}] ` +
      `#${results.length} ${tag} ${basename(modulePath)} ` +
      `(remaining ${fmtDuration(remaining)})`
    );
  }

  // Final memory snapshot
  const final = await snapshotMemory(client);
  if (final) snapshots.push(final);

  client.close();

  const finalEndTs = Date.now();
  const report = writeReport(args, startTs, finalEndTs, results, snapshots);
  await writeFile(resolve(args.reportPath), report, 'utf8');
  console.log(`[soak] report written: ${resolve(args.reportPath)}`);

  const crashes = results.filter(r => r.status === 'crash' || r.status === 'load-error').length;
  if (crashes > args.crashThreshold) {
    console.error(`[soak] crash threshold exceeded: ${crashes} > ${args.crashThreshold}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[soak] fatal:', e);
  process.exit(1);
});
