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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MCPBridgeClient, tryConnect, sleep } from './_client';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/__tests__/fixtures');
const FIXTURE_MOD = resolve(FIXTURE_DIR, 'mortimer-twang-2118bytes.mod');

const FLOW_TIMEOUT_MS = 60000;

let client: MCPBridgeClient | null = null;

beforeAll(async () => {
  client = await tryConnect();
  if (!client) {
    console.warn(
      '[ui-smoke] MCP bridge at ws://localhost:4003/mcp is unreachable — skipping.\n' +
      '  Start the app with `npm run dev` and open http://localhost:5173 in a browser.',
    );
  }
});

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
      await sleep(1500);
      const level = await c.call<{ rms?: number; peak?: number; isSilent?: boolean }>('get_audio_level');
      expect(level.isSilent, `level was ${JSON.stringify(level)}`).not.toBe(true);
      expect((level.rms ?? 0)).toBeGreaterThan(0.0005);

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
