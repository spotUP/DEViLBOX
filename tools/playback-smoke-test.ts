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
  /**
   * True for engine-driven formats with no tracker pattern data (SID, etc.).
   * Skips the noteCells check — these formats are 6502/68k code that runs
   * directly on an emulated chip; there are no pattern rows to inspect.
   */
  engineDriven?: boolean;
  /** Companion file paths (e.g. TFMX smpl.* alongside mdat.*) */
  companionPaths?: string[];
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
  { name: 'JamCracker - bartmanintro',        family: 'JAM',  loader: 'modland', path: 'pub/modules/JamCracker/Ape/bartmanintro.jam' },
  // ── C64 SID ──
  // SID is engine-driven (6502 code on emulated CPU + SID chip) — no tracker
  // pattern data, so skip the pattern check.
  { name: 'Hubbard - Commando',               family: 'SID',  loader: 'hvsc',    path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid', engineDriven: true },
  // ── TFMX (needs companion smpl file) ──
  { name: 'TFMX - Turrican Aliens',           family: 'TFMX', loader: 'modland', path: 'pub/modules/TFMX/Chris Huelsbeck/mdat.turrican aliens', companionPaths: ['pub/modules/TFMX/Chris Huelsbeck/smpl.turrican aliens'] },
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

interface SongInfoResp {
  editorMode?: string;
  numChannels?: number;
  numPatterns?: number;
  patternLength?: number;
  bpm?: number;
}
interface PatternStatsResp {
  patternIndex?: number;
  totalCells?: number;
  noteCells?: number;
  effectCells?: number;
  noteDensity?: number;
  uniqueNotes?: number;
  error?: string;
}

async function runTest(client: MCPBridgeClient, test: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    // 1. Clean slate — clear console and remove any master effects that could
    //    trigger format-compatibility dialogs during native-format loads.
    await client.call('clear_console_errors');
    try {
      const audioState = await client.call<{ masterEffects?: { id: string }[] }>('get_audio_state');
      if (audioState?.masterEffects?.length) {
        for (const fx of audioState.masterEffects) {
          await client.call('remove_master_effect', { effectId: fx.id });
        }
      }
    } catch { /* audio state read may fail on first call */ }

    // 2. Load — download via Express API, then send to browser via load_file
    if (test.loader === 'modland' || test.loader === 'hvsc') {
      const { filename, base64 } = await downloadFile(test.loader, test.path);

      // Download companion files (e.g. TFMX smpl.* alongside mdat.*)
      let companionFiles: Record<string, string> | undefined;
      if (test.companionPaths?.length) {
        companionFiles = {};
        for (const cp of test.companionPaths) {
          const companion = await downloadFile(test.loader, cp);
          companionFiles[companion.filename] = companion.base64;
        }
      }

      await client.call('load_file', { filename, data: base64, ...(companionFiles ? { companionFiles } : {}) });
    } else if (test.loader === 'fur') {
      await client.call('play_fur', { path: test.path });
    }

    // 3. Verify the song actually loaded with pattern data BEFORE play()
    // This catches "loaded but no patterns" failures (the bartmanintro bug)
    // that audio-level checks miss when the engine plays silence.
    const songInfo = await client.call<SongInfoResp>('get_song_info');
    if (!songInfo || (songInfo.numPatterns ?? 0) <= 0) {
      await client.call('stop').catch(() => {});
      return {
        name: test.name, family: test.family, status: 'fail',
        reason: `no patterns loaded (numPatterns=${songInfo?.numPatterns ?? 'undefined'})`,
        durationMs: Date.now() - start,
      };
    }
    if ((songInfo.numChannels ?? 0) <= 0) {
      await client.call('stop').catch(() => {});
      return {
        name: test.name, family: test.family, status: 'fail',
        reason: `no channels loaded (numChannels=${songInfo.numChannels ?? 'undefined'})`,
        durationMs: Date.now() - start,
      };
    }

    // Verify pattern 0 has actual notes — not just empty rows. The
    // bartmanintro symptom: song loads with patterns and channels declared,
    // but every cell is empty so playback is silent. Fail-fast on this.
    // Skipped for engine-driven formats (SID, etc.) that have no pattern data.
    if (!test.engineDriven) {
      let noteCells = 0;
      try {
        const stats = await client.call<PatternStatsResp>('get_pattern_stats', { patternIndex: 0 });
        noteCells = stats.noteCells ?? 0;
      } catch {
        // get_pattern_stats unavailable — fall through; audio level check is
        // the last line of defence.
      }
      if (noteCells === 0) {
        await client.call('stop').catch(() => {});
        return {
          name: test.name, family: test.family, status: 'fail',
          reason: 'pattern 0 has no note cells (load decoded but pattern data is empty)',
          durationMs: Date.now() - start,
        };
      }
    }

    // 4. Now play
    if (test.loader === 'modland' || test.loader === 'hvsc') {
      await client.call('play', { mode: 'song' });
    }
    // (fur loader already started playback inside play_fur)

    // 5. Wait for audio output (best-effort)
    try {
      await client.call('wait_for_audio', { thresholdRms: SILENCE_THRESHOLD_RMS, timeoutMs: 5000 });
    } catch { /* fall through to level check */ }

    // 6. Let it play
    await sleep(PLAY_DURATION_MS);

    // 7. Measure
    const level = await client.call<{ rmsAvg: number; rmsMax: number; isSilent: boolean }>(
      'get_audio_level',
      { durationMs: 1000 },
    );

    // 8. Check console errors
    const errs = await client.call<{ entries: Array<{ level: string; message: string }> }>('get_console_errors');
    const critical = errs.entries.filter((e) =>
      e.level === 'error' &&
      // Filter out known-noise warnings that aren't real failures
      !e.message.includes('Failed to load resource') &&
      !e.message.includes('AudioContext was not allowed'),
    );

    // 9. Verify editorMode (if expected)
    let editorModeOk = true;
    if (test.expectedEditorMode && songInfo.editorMode) {
      editorModeOk = songInfo.editorMode === test.expectedEditorMode;
    }

    // 10. Stop
    await client.call('stop');

    const durationMs = Date.now() - start;

    // 11. Verdict — STRICT: trust rmsAvg/rmsMax directly, don't rely on the
    // tool's isSilent flag (which has historically been too lenient).
    const audibleByOurThreshold = (level.rmsAvg ?? 0) >= SILENCE_THRESHOLD_RMS
      || (level.rmsMax ?? 0) >= SILENCE_THRESHOLD_RMS * 4;
    if (!audibleByOurThreshold && !test.allowSilent) {
      return {
        name: test.name, family: test.family, status: 'fail',
        rmsAvg: level.rmsAvg, rmsMax: level.rmsMax,
        errorCount: critical.length,
        reason: `silent (rmsAvg=${level.rmsAvg.toFixed(6)}, rmsMax=${level.rmsMax.toFixed(6)}, threshold=${SILENCE_THRESHOLD_RMS})`,
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
        reason: `editorMode mismatch (expected ${test.expectedEditorMode}, got ${songInfo.editorMode})`,
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
    // Brief pause between tests to let AudioContext and WASM settle
    if (results.length > 0) await sleep(2000);
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
