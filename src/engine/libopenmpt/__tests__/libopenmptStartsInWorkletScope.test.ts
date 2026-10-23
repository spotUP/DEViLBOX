// @vitest-environment node
/**
 * A song saved with a TR-707 synth, loaded again, did not play, and a plain
 * XM played silent too (reported 2026-10-23). The chiptune3 worklet logged
 * "Cannot read properties of undefined (reading 'stackSave')" on every
 * message: the libopenmpt factory had thrown during start-up, so the
 * worklet never got its wasm instance.
 *
 * The emscripten 4.0.16 -Oz rebuild assumed TextDecoder exists
 * (TEXTDECODER=2) and called `new TextDecoder` unguarded. Chrome's
 * AudioWorkletGlobalScope has no TextDecoder, TextEncoder or URL. The
 * factory must start with those globals missing, the way the tracker
 * worklet runs it.
 */
import { describe, it, expect, afterEach } from 'vitest';

type Factory = (o: Record<string, unknown>) => Promise<{ stackSave: () => number; _malloc: (n: number) => number }>;

const WORKLET_SCOPE_MISSING = ['TextDecoder', 'TextEncoder', 'URL'] as const;
const g = globalThis as Record<string, unknown>;
const saved = new Map<string, unknown>();

afterEach(() => {
  for (const [k, v] of saved) g[k] = v;
  saved.clear();
});

describe('libopenmpt in an AudioWorkletGlobalScope', () => {
  it.each(['libopenmpt.worklet.js', 'libopenmpt.render.js'])(
    '%s starts without TextDecoder, TextEncoder or URL',
    async (file) => {
      const path: string = `../../../../public/chiptune3/${file}`;
      const factory = (await import(/* @vite-ignore */ path)).default as Factory;
      for (const k of WORKLET_SCOPE_MISSING) { saved.set(k, g[k]); g[k] = undefined; }
      const wasm = await factory({ print: () => {}, printErr: () => {} });
      for (const [k, v] of saved) g[k] = v;
      saved.clear();
      expect(typeof wasm.stackSave).toBe('function');
      expect(wasm._malloc(16)).toBeGreaterThan(0);
    },
  );
});
