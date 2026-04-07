#!/usr/bin/env npx tsx
/**
 * Playback Smoke Test — regression harness for the TrackerReplayer refactor.
 *
 * Loads a battery of representative songs across all major format families,
 * plays each for a few seconds, and asserts:
 *   - No console errors during load/playback
 *   - Audio level is non-silent (RMS > threshold)
 *   - Song info reports the expected format
 *
 * Run BEFORE and AFTER each refactor phase to verify nothing regressed.
 *
 * Usage:
 *   1. Start the dev server: `npm run dev` (from project root)
 *   2. Open DEViLBOX in a browser, click anywhere to unlock the AudioContext
 *   3. Run: `npx tsx tools/playback-smoke-test.ts`
 *
 * The script connects to the MCP WebSocket relay (ws://localhost:4003/mcp),
 * drives the running browser via bridge calls, and reports a pass/fail summary.
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

// ── Configuration ──────────────────────────────────────────────────────────

const WS_URL = process.env.MCP_BRIDGE_URL ?? 'ws://localhost:4003/mcp';
const API_BASE = process.env.DEVILBOX_API ?? 'http://localhost:3001';
const PLAY_DURATION_MS = 3000;
const SILENCE_THRESHOLD_RMS = 0.001;
const PER_TEST_TIMEOUT_MS = 60000;
const DOWNLOAD_TIMEOUT_MS = 30000;

interface TestCase {
  name: string;
  family: string;
  loader: 'modland' | 'hvsc' | 'fur';
  path: string;
  /** Subset of editorMode the loaded file should report (substring match) */
  expectedEditorMode?: string;
  /** Allow this test to be silent (some loop-based formats may not report level reliably) */
  allowSilent?: boolean;
}

const TESTS: TestCase[] = [
  // ── PC tracker formats (libopenmpt path) ──
  { name: 'Captain - Space Debris',           family: 'MOD',  loader: 'modland', path: 'pub/modules/Protracker/Captain/space debris.mod', expectedEditorMode: 'classic' },
  { name: 'Skaven - Bookworm',                family: 'IT',   loader: 'modland', path: 'pub/modules/Impulsetracker/Skaven/bookworm.it', expectedEditorMode: 'classic' },
  { name: 'Skaven - Catch That Goblin',       family: 'S3M',  loader: 'modland', path: 'pub/modules/Screamtracker 3/Skaven/catch that goblin!!.s3m', expectedEditorMode: 'classic' },
  // ── Hively / AHX (HVL engine) ──
  { name: 'AceMan - Hexplosion',              family: 'HVL',  loader: 'modland', path: 'pub/modules/HivelyTracker/AceMan/hexplosion.hvl', expectedEditorMode: 'hively' },
  // ── UADE Amiga formats ──
  { name: 'Future Composer - Blaizer',        family: 'FC',   loader: 'modland', path: 'pub/modules/Future Composer 1.4/Blaizer/horizon v2.fc' },
  { name: 'TFMX - Turrican Aliens',           family: 'TFMX', loader: 'modland', path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens' },
  { name: 'JamCracker - bartmanintro',        family: 'JAM',  loader: 'modland', path: 'pub/modules/JamCracker/Ape/bartmanintro.jam' },
  // ── C64 SID ──
  { name: 'Hubbard - Commando',               family: 'SID',  loader: 'hvsc',    path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid' },
];

// ── WebSocket bridge client ────────────────────────────────────────────────

class MCPBridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (resp: { type: string; data?: unknown; error?: string }) => void>();
  private connectPromise: Promise<void>;

  constructor(url: string) {
    this.connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => this.handleMessage(data.toString()));
      this.ws.on('close', () => {
        for (const [, fn] of this.pending) {
          fn({ type: 'error', error: 'Connection closed' });
        }
        this.pending.clear();
      });
    });
  }

  ready(): Promise<void> { return this.connectPromise; }

  private handleMessage(text: string): void {
    let msg: { id: string; type: string; data?: unknown; error?: string };
    try { msg = JSON.parse(text); } catch { return; }
    const fn = this.pending.get(msg.id);
    if (fn) {
      this.pending.delete(msg.id);
      fn(msg);
    }
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Bridge not connected'));
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`call('${method}') timed out after ${PER_TEST_TIMEOUT_MS}ms`));
      }, PER_TEST_TIMEOUT_MS);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        if (resp.type === 'error') reject(new Error(resp.error ?? 'unknown'));
        else resolve(resp.data as T);
      });
      this.ws!.send(JSON.stringify({ id, type: 'call', method, params }));
    });
  }

  close(): void { this.ws?.close(); }
}

// ── Test runner ────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  family: string;
  status: 'pass' | 'fail' | 'skip';
  rmsAvg?: number;
  rmsMax?: number;
  errorCount?: number;
  reason?: string;
  durationMs: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Download a file from the Express API and return base64 + filename */
async function downloadFile(loader: 'modland' | 'hvsc', path: string): Promise<{ filename: string; base64: string }> {
  const endpoint = loader === 'modland'
    ? `${API_BASE}/api/modland/download?path=${encodeURIComponent(path)}`
    : `${API_BASE}/api/hvsc/download?path=${encodeURIComponent(path)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(endpoint, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const filename = path.split('/').pop() ?? 'download';
    return { filename, base64: buf.toString('base64') };
  } finally {
    clearTimeout(timer);
  }
}

async function runTest(client: MCPBridgeClient, test: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    // 1. Clean slate
    await client.call('clear_console_errors');

    // 2. Load — download via Express API, then send to browser via load_file
    if (test.loader === 'modland' || test.loader === 'hvsc') {
      const { filename, base64 } = await downloadFile(test.loader, test.path);
      await client.call('load_file', { filename, data: base64 });
      await client.call('play', { mode: 'song' });
    } else if (test.loader === 'fur') {
      await client.call('play_fur', { path: test.path });
    }

    // 3. Wait for audio output (best-effort)
    try {
      await client.call('wait_for_audio', { thresholdRms: SILENCE_THRESHOLD_RMS, timeoutMs: 5000 });
    } catch { /* fall through to level check */ }

    // 4. Let it play
    await sleep(PLAY_DURATION_MS);

    // 5. Measure
    const level = await client.call<{ rmsAvg: number; rmsMax: number; isSilent: boolean }>(
      'get_audio_level',
      { durationMs: 1000 },
    );

    // 6. Check console errors
    const errs = await client.call<{ entries: Array<{ level: string; message: string }> }>('get_console_errors');
    const critical = errs.entries.filter((e) =>
      e.level === 'error' &&
      // Filter out known-noise warnings that aren't real failures
      !e.message.includes('Failed to load resource') &&
      !e.message.includes('AudioContext was not allowed'),
    );

    // 7. Verify editorMode (if expected)
    let editorModeOk = true;
    if (test.expectedEditorMode) {
      const songInfo = await client.call<{ editorMode: string }>('get_song_info');
      editorModeOk = songInfo.editorMode === test.expectedEditorMode;
    }

    // 8. Stop
    await client.call('stop');

    const durationMs = Date.now() - start;

    // 9. Verdict
    const isSilent = level.isSilent && !test.allowSilent;
    if (isSilent) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: 'silent (rmsAvg < threshold)',
        durationMs,
      };
    }
    if (critical.length > 0) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `${critical.length} console error(s): ${critical[0].message.slice(0, 80)}`,
        durationMs,
      };
    }
    if (!editorModeOk) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `editorMode mismatch (expected ${test.expectedEditorMode})`,
        durationMs,
      };
    }
    return {
      name: test.name, family: test.family, status: 'pass',
      rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
      errorCount: critical.length,
      durationMs,
    };
  } catch (err) {
    try { await client.call('stop'); } catch { /* best-effort cleanup */ }
    return {
      name: test.name, family: test.family, status: 'fail',
      reason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('▶ DEViLBOX playback smoke test');
  console.log(`  Bridge: ${WS_URL}`);
  console.log(`  Tests:  ${TESTS.length}`);
  console.log('');

  const client = new MCPBridgeClient(WS_URL);
  try {
    await client.ready();
  } catch (err) {
    console.error(`✗ Failed to connect to MCP bridge at ${WS_URL}`);
    console.error('  Make sure the dev server is running (npm run dev) and DEViLBOX is open in a browser.');
    console.error(`  Error: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  const results: TestResult[] = [];
  for (const test of TESTS) {
    process.stdout.write(`  [${test.family.padEnd(5)}] ${test.name.padEnd(40)} `);
    const result = await runTest(client, test);
    results.push(result);
    const dt = `${(result.durationMs / 1000).toFixed(1)}s`;
    if (result.status === 'pass') {
      const rms = result.rmsAvg?.toFixed(4) ?? '?';
      console.log(`✓ pass (rms ${rms}, ${dt})`);
    } else if (result.status === 'skip') {
      console.log(`○ skip (${result.reason}, ${dt})`);
    } else {
      console.log(`✗ fail (${result.reason}, ${dt})`);
    }
  }

  client.close();

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  console.log('');
  console.log('── Summary ─────────────────');
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.log('');
    console.log('  Failures:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`    ✗ [${r.family}] ${r.name} — ${r.reason}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
