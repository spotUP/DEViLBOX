/**
 * UI smoke test suite — drives the live DEViLBOX SPA via the MCP WebSocket
 * bridge at ws://localhost:4003/mcp. Each flow exercises a regression
 * hotspot end-to-end against the real browser + audio stack.
 *
 * Prerequisites (same as `tools/playback-smoke-test.ts`):
 *   1. `npm run dev` running (dev server + Express + MCP relay).
 *   2. A browser tab open at http://localhost:5173 with the AudioContext
 *      unlocked (click anywhere in the tab once).
 *
 * If either prerequisite is missing, the whole suite is skipped with a
 * clear message — this is intentional so `npm run test:ui-smoke` never
 * fails on a developer laptop that hasn't booted the app yet.
 *
 * Flows:
 *   01 — load real MOD fixture → play → non-silent RMS → no console errors
 *   02 — mode-switch cycle (tracker → DJ → dub → tracker): no crashes
 *
 * Scoped deliberately small. Expand with care: each additional flow adds
 * seconds to the local run.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tryConnect, sleep } from './_client';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/__tests__/fixtures');
const FIXTURE_MOD = resolve(FIXTURE_DIR, 'mortimer-twang-2118bytes.mod');

const FLOW_TIMEOUT_MS = 60000;

// Top-level await so `it.runIf` sees the connection result at collect time.
// Without this the flows skip even when the bridge is reachable.
const client = await tryConnect();
if (!client) {
  console.warn(
    '[ui-smoke] MCP bridge at ws://localhost:4003/mcp is unreachable — skipping.\n' +
    '  Start the app with `npm run dev` and open http://localhost:5173 in a browser.',
  );
}

afterAll(() => {
  client?.close();
});

function loadFixtureBase64(path: string): { filename: string; data: string } {
  const bytes = readFileSync(path);
  return { filename: path.split('/').pop()!, data: bytes.toString('base64') };
}

describe('ui-smoke — flow 01: load + play a real MOD', () => {
  it.runIf(!!client)(
    'loads the committed fixture, plays audibly, and stays error-free',
    async () => {
      const c = client!;
      // Clean slate
      try { await c.call('stop'); } catch { /* ok if nothing playing */ }
      await sleep(200);
      await c.call('clear_console_errors');

      // Load via base64 upload (what the WS bridge expects)
      const payload = loadFixtureBase64(FIXTURE_MOD);
      await c.call('load_file', {
        filename: payload.filename,
        data: payload.data,
      });
      await sleep(500);

      // Verify the song landed
      const info = await c.call<{ numChannels?: number; numPatterns?: number }>('get_song_info');
      expect(info.numChannels, 'channel count should match the MOD').toBe(4);
      expect((info.numPatterns ?? 0), 'at least one pattern expected').toBeGreaterThan(0);

      // Play and sample audio level
      await c.call('play');
      await sleep(800);
      const playback = await c.call<Record<string, unknown>>('get_playback_state').catch(() => ({}));
      const level = await c.call<{ rms?: number; rmsAvg?: number; rmsMax?: number; peak?: number; peakMax?: number; isSilent?: boolean }>('get_audio_level');
      const ctxInfo = await c.call<{ state?: string; sampleRate?: number }>('get_audio_context_info').catch(() => ({}));
      const rms = level.rms ?? level.rmsMax ?? level.rmsAvg ?? 0;
      const diag = `rms=${rms} peak=${level.peak ?? level.peakMax ?? 0} isSilent=${level.isSilent} playback=${JSON.stringify(playback)} ctx=${JSON.stringify(ctxInfo)}`;
      expect(rms, diag).toBeGreaterThan(0.0005);

      // No console errors during load+play
      const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
      const critical = (errors.entries ?? []).filter(
        (e) => e.level === 'error' && !/favicon|devtools/i.test(e.message),
      );
      expect(critical, `critical errors: ${JSON.stringify(critical)}`).toEqual([]);

      await c.call('stop');
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 07: DJ deck audio (end-to-end via pre-render pipeline)', () => {
  it.runIf(!!client)(
    'switch → DJ, load deck A (triggers pre-render), play, measure sustained audio',
    async () => {
      const c = client!;
      try { await c.call('stop'); } catch { /* ok */ }
      await sleep(200);
      await c.call('clear_console_errors');

      await c.call('dj_vj_action', { action: 'switchView', args: { view: 'dj' } });
      await sleep(400);

      const payload = loadFixtureBase64(FIXTURE_MOD);
      // Pre-render pipeline takes a few seconds for the first render —
      // larger than other flows' load budget. Includes WAV render +
      // analysis.
      await c.call('dj_vj_action', {
        action: 'loadDeck',
        args: { side: 'A', filename: payload.filename, data: payload.data },
      });
      await sleep(400);

      await c.call('dj_vj_action', { action: 'setCrossfader', args: { value: 0 } });
      await c.call('dj_vj_action', { action: 'playDeck', args: { side: 'A' } });
      await sleep(700);

      const level = await c.call<{ rmsAvg?: number; peakMax?: number; silent?: boolean }>(
        'get_audio_level', { durationMs: 800 },
      );
      const diag = `level=${JSON.stringify(level)}`;
      expect(level.silent, `DJ deck silent — pre-render / play-back path broken. ${diag}`).not.toBe(true);
      expect((level.rmsAvg ?? 0), `DJ RMS at 0, expected >0.01. ${diag}`).toBeGreaterThan(0.01);

      try { await c.call('dj_vj_action', { action: 'stopDeck', args: { side: 'A' } }); } catch { /* ok */ }
      await c.call('dj_vj_action', { action: 'switchView', args: { view: 'tracker' } });
      await sleep(200);

      const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
      const critical = (errors.entries ?? []).filter(
        (e) =>
          e.level === 'error' &&
          !/favicon|devtools|WebSocket closed/i.test(e.message),
      );
      expect(critical, `critical errors in DJ flow: ${JSON.stringify(critical)}`).toEqual([]);
    },
    // Larger timeout — pre-render adds seconds to load time.
    120000,
  );
});

describe('ui-smoke — flow 08: oscilloscope store flushes on stop', () => {
  it.runIf(!!client)(
    'per-channel scope data is cleared when playback stops (no stale ring pollution)',
    async () => {
      const c = client!;
      try { await c.call('stop'); } catch { /* ok */ }
      await sleep(200);

      const payload = loadFixtureBase64(FIXTURE_MOD);
      await c.call('load_file', { filename: payload.filename, data: payload.data });
      await sleep(400);
      await c.call('play');
      await sleep(800);

      const during = await c.call<{ isActive?: boolean; hasData?: boolean }>('get_oscilloscope_info');
      expect(during.isActive, `during play: ${JSON.stringify(during)}`).toBe(true);
      expect(during.hasData,  `during play: ${JSON.stringify(during)}`).toBe(true);

      await c.call('stop');
      await sleep(500);

      // Stale ring data must be flushed on stop — without this the
      // visualizer keeps redrawing the last captured samples, producing
      // phantom spikes at render-block boundaries on all channels.
      const afterStop = await c.call<{ isActive?: boolean; hasData?: boolean }>('get_oscilloscope_info');
      expect(afterStop.isActive, `500 ms after stop: ${JSON.stringify(afterStop)}`).toBe(false);
      expect(afterStop.hasData,  `500 ms after stop: ${JSON.stringify(afterStop)}`).toBe(false);
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 06: Furnace playback stays within gain limits', () => {
  // Upstream Furnace demo used by tools/furnace-audit/lockstep.test.ts.
  // Small, deterministic, inside the committed submodule.
  const FURNACE_FIXTURE = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../third-party/furnace-master/demos/ay8910/vibe_zone.fur',
  );

  // Existential skip: the submodule may not be initialised on a fresh clone.
  const furnaceAvailable = (() => {
    try { readFileSync(FURNACE_FIXTURE); return true; } catch { return false; }
  })();

  it.runIf(!!client && furnaceAvailable)(
    'Furnace AY-3-8910 fixture peaks below the clipping threshold',
    async () => {
      const c = client!;
      try { await c.call('stop'); } catch { /* ok */ }
      await sleep(200);
      await c.call('clear_console_errors');

      const bytes = readFileSync(FURNACE_FIXTURE);
      await c.call('load_file', {
        filename: 'vibe_zone.fur',
        data: bytes.toString('base64'),
      });
      await sleep(500);
      await c.call('play');
      await sleep(1500);

      // Thresholds:
      //   peakMax <  4.0  — hard ceiling. Normal audio peaks at or below 1.0;
      //                    up to ~2.0 is a reasonable pre-limiter overshoot.
      //                    >4.0 is unambiguously clipping / gain-staging bug.
      //   rmsAvg  <  1.5  — sustained RMS above unity is also broken; a
      //                    Furnace chiptune in normal bounds stays <0.5.
      const level = await c.call<{
        rmsAvg?: number; rmsMax?: number; peakMax?: number; silent?: boolean;
      }>('get_audio_level', { durationMs: 1500 });

      const rmsAvg = level.rmsAvg ?? 0;
      const peakMax = level.peakMax ?? 0;
      const diag = `level=${JSON.stringify(level)}`;
      expect(level.silent, diag).not.toBe(true);
      expect(peakMax, `peak gate: ${diag}`).toBeLessThan(4);
      expect(rmsAvg, `rms gate: ${diag}`).toBeLessThan(1.5);

      try { await c.call('stop'); } catch { /* ok */ }
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 05: dub bus enable → fire move → disable', () => {
  it.runIf(!!client)(
    'dub bus can be toggled and a dub move fires without unhandled rejections',
    async () => {
      const c = client!;
      try { await c.call('stop'); } catch { /* ok */ }
      await sleep(200);
      await c.call('clear_console_errors');

      const payload = loadFixtureBase64(FIXTURE_MOD);
      await c.call('load_file', { filename: payload.filename, data: payload.data });
      await sleep(300);

      const trace: string[] = [];
      const step = async (label: string, fn: () => Promise<unknown>): Promise<unknown> => {
        try {
          const r = await fn();
          trace.push(`${label}: ok`);
          return r;
        } catch (e) {
          trace.push(`${label}: THROW ${(e as Error).message}`);
          throw new Error(`step "${label}" failed: ${(e as Error).message}\nTrace:\n${trace.join('\n')}`);
        }
      };

      const before = await step('get_dub_bus_state (before)', () => c.call('get_dub_bus_state'));
      expect(before).toBeDefined();

      await step('set_dub_bus_enabled(true)', () => c.call('set_dub_bus_enabled', { enabled: true }));
      await sleep(150);
      await step('fire_dub_move', () => c.call('fire_dub_move', { moveId: 'echoThrow', channelId: 0 }));
      await sleep(400);

      const during = await step('get_dub_bus_state (during)', () => c.call('get_dub_bus_state')) as { hasBus?: boolean };
      expect(during.hasBus, `hasBus during: ${JSON.stringify(during)}\nTrace:\n${trace.join('\n')}`).toBe(true);

      await step('set_dub_bus_enabled(false)', () => c.call('set_dub_bus_enabled', { enabled: false }));
      await sleep(100);

      // Surface any unhandled rejections captured by the dev-mode probe at
      // src/main.tsx:104-147 — the distinctive `[unhandledrejection]` prefix
      // carries type / name / reason and a full stack (synthetic if the
      // rejection reason wasn't an Error).
      const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
      const entries = errors.entries ?? [];
      const rejections = entries.filter((e) => /\[unhandledrejection\]/.test(e.message));
      const otherCritical = entries.filter(
        (e) =>
          e.level === 'error' &&
          !/favicon|devtools|WebSocket closed|\[unhandledrejection\]/i.test(e.message),
      );
      const diag = rejections.length
        ? `captured ${rejections.length} unhandled rejection(s):\n${rejections.map((r) => r.message).join('\n---\n')}`
        : otherCritical.length
          ? `other critical errors: ${JSON.stringify(otherCritical)}`
          : '';
      expect(rejections.length, diag).toBe(0);
      expect(otherCritical, diag).toEqual([]);
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 04: reload the same MOD twice (state cleanup)', () => {
  it.runIf(!!client)(
    'loads, plays, stops, reloads, plays again — no crash, no leak, still audible',
    async () => {
      const c = client!;
      const payload = loadFixtureBase64(FIXTURE_MOD);

      for (const pass of ['first', 'second'] as const) {
        try { await c.call('stop'); } catch { /* ok */ }
        await sleep(200);
        await c.call('clear_console_errors');
        await c.call('load_file', { filename: payload.filename, data: payload.data });
        await sleep(400);

        const info = await c.call<{ numChannels?: number }>('get_song_info');
        expect(info.numChannels, `pass=${pass} channels=${info.numChannels}`).toBe(4);

        await c.call('play');
        await sleep(800);
        const level = await c.call<{ rms?: number; rmsMax?: number }>('get_audio_level', { durationMs: 800 });
        const rms = level.rms ?? level.rmsMax ?? 0;
        expect(rms, `pass=${pass} rms=${rms}`).toBeGreaterThan(0.0005);

        const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
        const critical = (errors.entries ?? []).filter(
          (e) => e.level === 'error' && !/favicon|devtools|WebSocket closed/i.test(e.message),
        );
        expect(critical, `pass=${pass} critical: ${JSON.stringify(critical)}`).toEqual([]);
      }

      try { await c.call('stop'); } catch { /* ok */ }
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 03: MOD decode exposes patterns + instruments', () => {
  it.runIf(!!client)(
    'loaded MOD has at least one instrument and a non-empty pattern',
    async () => {
      const c = client!;
      try { await c.call('stop'); } catch { /* ok */ }
      await sleep(200);
      await c.call('clear_console_errors');

      const payload = loadFixtureBase64(FIXTURE_MOD);
      await c.call('load_file', { filename: payload.filename, data: payload.data });
      await sleep(500);

      // Instruments list must come back populated — guards against the
      // "parser decoded the header but lost the sample table" class of bug.
      const instruments = await c.call<unknown[]>('get_instruments_list');
      expect(Array.isArray(instruments), `instruments was ${typeof instruments}`).toBe(true);
      expect((instruments as unknown[]).length).toBeGreaterThan(0);

      // Pattern 0 must exist and have rows — guards against empty-pattern
      // regressions in MODParser.
      const p0 = await c.call<{ numRows?: number; rows?: unknown[] }>('get_pattern', { patternIndex: 0 });
      const rowCount = p0.numRows ?? (p0.rows?.length ?? 0);
      expect(rowCount, `pattern 0 rows: ${JSON.stringify(p0).slice(0, 200)}`).toBeGreaterThan(0);

      const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
      const critical = (errors.entries ?? []).filter(
        (e) => e.level === 'error' && !/favicon|devtools|WebSocket closed/i.test(e.message),
      );
      expect(critical, `critical errors: ${JSON.stringify(critical)}`).toEqual([]);
    },
    FLOW_TIMEOUT_MS,
  );
});

describe('ui-smoke — flow 02: view-switch cycle', () => {
  it.runIf(!!client)(
    'cycles tracker → DJ → VJ → tracker without throwing errors',
    async () => {
      const c = client!;
      // Stop anything playing so view switches see a quiescent stack.
      try { await c.call('stop'); } catch { /* ok */ }
      await c.call('clear_console_errors');

      for (const view of ['dj', 'vj', 'tracker'] as const) {
        await c.call('set_active_view', { view });
        await sleep(400);
      }

      const errors = await c.call<{ entries?: Array<{ level: string; message: string }> }>('get_console_errors');
      const critical = (errors.entries ?? []).filter(
        (e) =>
          e.level === 'error' &&
          !/favicon|devtools/i.test(e.message) &&
          !/WebSocket closed/i.test(e.message),
      );
      expect(critical, `critical errors during view switches: ${JSON.stringify(critical)}`).toEqual([]);
    },
    FLOW_TIMEOUT_MS,
  );
});
