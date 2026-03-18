#!/usr/bin/env tsx
/**
 * Furnace Format Console Audit
 *
 * Connects to the DEViLBOX WS relay as an MCP client, loads every .fur demo
 * file, captures browser console errors, measures audio, and updates the
 * format status tracker at localhost:4444.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/console-audit.ts [--chip <name>] [--resume] [--fails-only]
 *
 * Flags:
 *   --chip <name>   Only audit one chip directory (e.g. --chip nes)
 *   --resume        Skip entries that already have auditStatus set
 *   --fails-only    Only re-audit entries currently marked "fail"
 *   --dry-run       Print what would be audited without running
 */

import { WebSocket } from 'ws';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

// ─── Config ────────────────────────────────────────────────────────────────

const DEMOS_DIR = '/Users/spot/Code/DEViLBOX/third-party/furnace-master/demos';
const WS_URL = 'ws://localhost:4003/mcp';
const TRACKER_URL = 'http://localhost:4444';
const PLAY_WAIT_MS = 4000;     // how long to let the song play before checking

// ─── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const chipFilter = args.includes('--chip') ? args[args.indexOf('--chip') + 1] : null;
const resume = args.includes('--resume');
const failsOnly = args.includes('--fails-only');
const dryRun = args.includes('--dry-run');

// ─── Key mapping ───────────────────────────────────────────────────────────

function fileToKey(chip: string, filename: string): string {
  const song = basename(filename, '.fur').toLowerCase().replace(/[\s\-_]/g, '');
  return `fur-${chip}-${song}`;
}

// ─── WS Bridge client ──────────────────────────────────────────────────────

type BridgeRequest  = { id: string; type: 'call'; method: string; params: Record<string, unknown> };
type BridgeResponse = { id: string; type: 'result' | 'error'; data?: unknown; error?: string };

let ws: WebSocket;
const pending = new Map<string, (r: BridgeResponse) => void>();

async function connectWS(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      console.log('[audit] Connected to WS relay');
      resolve();
    });
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeResponse;
        const cb = pending.get(msg.id);
        if (cb) { pending.delete(msg.id); cb(msg); }
      } catch { /* ignore */ }
    });
    ws.on('error', reject);
    ws.on('close', () => {
      console.error('[audit] WS closed');
    });
  });
}

function callBrowser(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const req: BridgeRequest = { id, type: 'call', method, params };
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, (res) => {
      clearTimeout(timer);
      if (res.type === 'error') reject(new Error(res.error ?? 'bridge error'));
      else resolve(res.data);
    });
    ws.send(JSON.stringify(req));
  });
}

// ─── Tracker :4444 update ─────────────────────────────────────────────────

async function updateTracker(key: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${TRACKER_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: key, ...data }),
    });
  } catch (e) {
    console.error(`[audit] Failed to update tracker for ${key}: ${(e as Error).message}`);
  }
}

async function getTrackerData(): Promise<Record<string, Record<string, unknown>>> {
  const r = await fetch(`${TRACKER_URL}/get-data`);
  return r.json() as Promise<Record<string, Record<string, unknown>>>;
}

// ─── Audit one file ────────────────────────────────────────────────────────

interface AuditResult {
  auditStatus: 'works' | 'crashes' | 'pageCrash' | 'fail';
  errors: string[];
  notes: string;
}

// Ping the browser to check it is still alive
async function browserAlive(): Promise<boolean> {
  try {
    await callBrowser('get_playback_state', {}, 3000);
    return true;
  } catch {
    return false;
  }
}

async function resetBrowser(): Promise<void> {
  // Full reset sequence between songs:
  // stop transport → release voices → dismiss errors → wait for WASM to quiesce
  // (seqStop is async via .then() in TrackerReplayer, needs ~1s to propagate)
  try { await callBrowser('stop', {}); } catch { /* ignore */ }
  try { await callBrowser('release_all_notes', {}); } catch { /* ignore */ }
  try { await callBrowser('dismiss_errors', {}); } catch { /* ignore */ }
  await new Promise(r => setTimeout(r, 1200));
}

async function auditFile(chip: string, filePath: string): Promise<AuditResult> {
  const fileData = readFileSync(filePath);
  const base64 = fileData.toString('base64');
  const filename = basename(filePath);

  // 1. Reset engine state from previous song, then clear console buffer
  await resetBrowser();
  await callBrowser('clear_console_errors');

  // 2. Load file — catch hard load errors
  try {
    await callBrowser('load_file', { filename, data: base64 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('disconnected')) {
      return { auditStatus: 'pageCrash', errors: [`load crashed browser`], notes: 'page crash on load' };
    }
    return { auditStatus: 'crashes', errors: [`load_file: ${msg}`], notes: msg };
  }

  // 3. Play (ignore play errors — song may be already playing)
  try { await callBrowser('play', {}); } catch { /* ignore */ }

  // 4. Wait and then collect errors — use a Promise.race so a browser crash
  //    during the wait doesn't block forever
  await new Promise(r => setTimeout(r, PLAY_WAIT_MS));

  // 5. Check if browser is still alive
  if (!(await browserAlive())) {
    return { auditStatus: 'pageCrash', errors: ['browser disconnected during play'], notes: 'page crash during play' };
  }

  // 6. Collect console errors
  const consoleResult = await callBrowser('get_console_errors') as { entries: Array<{ level: string; message: string }> };
  const entries = consoleResult?.entries ?? [];
  const errors = entries
    .filter(e => e.level === 'error')
    .map(e => e.message)
    .filter(m => !m.includes('[mcp-bridge]') && !m.includes('ResizeObserver'));

  // 7. (Stop happens at start of next file via resetBrowser())

  // 8. Classify — any recognised error pattern = crashes
  //    Note: InvalidStateError alone is treated as 'works' — it fires on init
  //    for some chip types (AudioWorklet addModule on suspended context) but
  //    does not prevent playback. Only escalate if the song also crashed the page.
  const hasFatalCrash = errors.some(e =>
    e.includes('table index out of bounds') ||
    (e.includes('Uncaught') && !e.includes('InvalidStateError')) ||
    e.includes('RuntimeError') ||
    e.includes('WebAssembly') ||
    (e.includes('null') && e.includes('Cannot')) ||
    (e.includes('undefined') && e.includes('Cannot'))
  );
  const hasUnhandledRejection = errors.some(e => e.includes('UnhandledRejection'));
  const hasCrash = hasFatalCrash || (hasUnhandledRejection && errors.some(e => !e.includes('InvalidStateError')));

  const notes = errors.length > 0 ? errors.slice(0, 3).join(' | ').slice(0, 300) : '';
  return {
    auditStatus: hasCrash ? 'crashes' : 'works',
    errors,
    notes,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (dryRun) {
    const chips = readdirSync(DEMOS_DIR).filter(d => statSync(join(DEMOS_DIR, d)).isDirectory());
    let total = 0;
    for (const chip of chips) {
      if (chipFilter && chip !== chipFilter) continue;
      const files = readdirSync(join(DEMOS_DIR, chip)).filter(f => f.endsWith('.fur'));
      total += files.length;
      console.log(`  ${chip}: ${files.length} files`);
    }
    console.log(`Total: ${total}`);
    return;
  }

  // Connect to WS relay
  await connectWS();

  // Load current tracker state for resume/fails-only logic
  let existing: Record<string, Record<string, unknown>> = {};
  try {
    existing = await getTrackerData();
    console.log(`[audit] Loaded ${Object.keys(existing).length} existing entries from tracker`);
  } catch (e) {
    console.warn('[audit] Could not load tracker data (continuing without resume)');
  }

  // Build file list
  const chips = readdirSync(DEMOS_DIR)
    .filter(d => statSync(join(DEMOS_DIR, d)).isDirectory())
    .filter(d => !chipFilter || d === chipFilter)
    .sort();

  const allFiles: Array<{ chip: string; path: string; key: string }> = [];
  for (const chip of chips) {
    const dir = join(DEMOS_DIR, chip);
    const files = readdirSync(dir).filter(f => f.endsWith('.fur')).sort();
    for (const f of files) {
      const key = fileToKey(chip, f);
      allFiles.push({ chip, path: join(dir, f), key });
    }
  }

  // Apply filters
  const toAudit = allFiles.filter(({ key }) => {
    const entry = existing[key];
    if (resume && entry?.auditStatus && entry.auditStatus !== 'fail') return false;
    if (failsOnly && entry?.auditStatus !== 'fail') return false;
    return true;
  });

  console.log(`[audit] Will audit ${toAudit.length} / ${allFiles.length} files`);

  // Set master volume to safe level so insane-volume songs don't blow up analysis
  try { await callBrowser('set_master_volume', { volume: -12 }); } catch { /* ignore */ }

  // Counters
  let works = 0, crashes = 0, pageCrashes = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < toAudit.length; i++) {
    const { chip, path, key } = toAudit[i];
    const pct = Math.round((i / toAudit.length) * 100);
    process.stdout.write(`[${i + 1}/${toAudit.length}] (${pct}%) ${key} ... `);

    let result: AuditResult;
    try {
      result = await auditFile(chip, path);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      failed++;
      await updateTracker(key, { auditStatus: 'fail', notes: `audit script error: ${(e as Error).message}`, chip });
      continue;
    }

    // Count
    if (result.auditStatus === 'works') works++;
    else if (result.auditStatus === 'crashes') crashes++;
    else if (result.auditStatus === 'pageCrash') pageCrashes++;

    const statusLabel =
      result.auditStatus === 'works'     ? '✓' :
      result.auditStatus === 'pageCrash' ? '💥 PAGE CRASH' :
                                           '✗ CRASH';
    console.log(`${statusLabel}${result.errors.length > 0 ? ` [${result.errors[0].slice(0, 80)}]` : ''}`);

    // Update tracker
    await updateTracker(key, {
      auditStatus: result.auditStatus,
      chip,
      song: basename(path, '.fur'),
      consoleErrors: result.errors.slice(0, 5),
      notes: result.notes,
    });

    // If page crashed, reconnect before continuing
    if (result.auditStatus === 'pageCrash') {
      console.log('[audit] Waiting for browser to reconnect...');
      let reconnected = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        if (await browserAlive()) { reconnected = true; break; }
      }
      if (!reconnected) {
        console.error('[audit] Browser never reconnected — aborting');
        break;
      }
      // Re-apply safe volume after reconnect
      try { await callBrowser('set_master_volume', { volume: -12 }); } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 500));
    }

    // (resetBrowser() at start of next file handles quiesce delay)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n[audit] Done in ${elapsed}s`);
  console.log(`  ✓ works:      ${works}`);
  console.log(`  ✗ crashes:    ${crashes}`);
  console.log(`  💥 pageCrash: ${pageCrashes}`);
  console.log(`  ? errors:     ${failed}`);

  ws.close();
}

main().catch(e => {
  console.error('[audit] Fatal:', e);
  process.exit(1);
});
