/**
 * oscilloscopeMixin.test.ts — the worklet scope buffer must carry real audio
 * in every slot.
 *
 * An AudioWorklet render quantum is 128 samples; the scope buffer is 256. The
 * old mixin copied one quantum into slots 0-127 and zero-filled 128-255 on
 * every send, so the right half of every MAME oscilloscope was hardwired to a
 * flat line at silence. The mixin must accumulate across quanta and send only
 * full buffers.
 *
 * The mixin is inlined in every committed worklet (they share one
 * AudioWorkletGlobalScope; first definition wins), so this test extracts the
 * block from the TMS5220 worklet and also asserts every other worklet carries
 * the identical copy — a stale inline in ANY file can win the race.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MAME_DIR = join(process.cwd(), 'public/mame');

function extractMixin(source: string): string | null {
  const start = source.indexOf('globalThis.OscilloscopeMixin = {');
  if (start < 0) return null;
  const end = source.indexOf('};', start);
  return source.slice(start, end + 2);
}

/**
 * The mixin the browser ACTUALLY runs. mame-wasm-loader loads
 * mame-worklet-init.js BEFORE any chip worklet, so its definition wins and
 * every chip's inline copy is skipped by the `if (!globalThis.Oscilloscope-
 * Mixin)` guard. Fixing only the 32 inline fallbacks changed nothing on
 * screen — this loads the authoritative file.
 */
function loadMixin(file = 'mame-worklet-init.js'): {
  init: (p: object) => void;
  capture: (p: object, buf: Float32Array) => void;
} {
  const source = readFileSync(join(MAME_DIR, file), 'utf8');
  const block = extractMixin(source);
  expect(block, `${file} defines no OscilloscopeMixin`).not.toBeNull();
  const holder: { OscilloscopeMixin?: object } = {};
  // eslint-disable-next-line no-new-func
  new Function('globalThis', block!)(holder);
  return holder.OscilloscopeMixin as ReturnType<typeof loadMixin>;
}

interface ScopePort { postMessage: (msg: { type: string; buffer: ArrayBuffer }) => void }
interface ScopeProc {
  oscEnabled: boolean;
  port: ScopePort;
  [key: string]: unknown;
}

describe('worklet OscilloscopeMixin', () => {
  it.each(['mame-worklet-init.js', 'TMS5220.worklet.js'])(
    '%s accumulates 128-sample quanta into a full 256-sample buffer', (file) => {
    const mixin = loadMixin(file);
    const posted: Float32Array[] = [];
    const p: ScopeProc = { oscEnabled: false, port: { postMessage: (m) => posted.push(new Float32Array(m.buffer)) } };
    mixin.init(p);
    p.oscEnabled = true;

    // Feed distinct quanta: quantum q is filled with value q+1.
    for (let q = 0; q < 8; q++) {
      mixin.capture(p, new Float32Array(128).fill(q + 1));
    }

    expect(posted.length).toBeGreaterThan(0);
    const buf = posted[0];
    expect(buf.length).toBe(256);
    // Every slot carries real audio — the old zero-fill fails here.
    expect(buf.every((v) => v !== 0)).toBe(true);
    // And the two halves come from CONSECUTIVE quanta, not one quantum + junk.
    expect(buf[255]).toBe(buf[0] + 1);
  });

  it('sends nothing while disabled', () => {
    const mixin = loadMixin();
    const posted: unknown[] = [];
    const p: ScopeProc = { oscEnabled: false, port: { postMessage: (m) => posted.push(m) } };
    mixin.init(p);
    for (let q = 0; q < 12; q++) mixin.capture(p, new Float32Array(128).fill(1));
    expect(posted.length).toBe(0);
  });

  it('the loader-served mixin and the inline fallbacks agree on accumulation', () => {
    // Not textually identical (the init file is the documented long form), but
    // both must accumulate rather than zero-pad.
    for (const file of ['mame-worklet-init.js', 'TMS5220.worklet.js']) {
      const block = extractMixin(readFileSync(join(MAME_DIR, file), 'utf8'))!;
      expect(block, `${file} still zero-pads the scope buffer`).not.toMatch(/= 0;\s*\n\s*}\s*\n\s*\/\/ Send/);
      expect(block, `${file} does not accumulate`).toContain('oscFill');
    }
  });

  it('every worklet inlines the identical mixin', () => {
    const reference = extractMixin(readFileSync(join(MAME_DIR, 'TMS5220.worklet.js'), 'utf8'));
    for (const file of readdirSync(MAME_DIR).filter((f) => f.endsWith('.worklet.js'))) {
      const block = extractMixin(readFileSync(join(MAME_DIR, file), 'utf8'));
      if (block === null) continue; // MAMEChips.worklet.js consumes without defining
      expect(block, file).toBe(reference);
    }
  });
});
