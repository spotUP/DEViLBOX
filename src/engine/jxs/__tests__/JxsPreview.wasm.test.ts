/**
 * The JayTrax keyboard voice at the replayer: jxs_preview_* plays ONE instrument of the loaded module on a
 * second, frozen copy (voice 0), through the replayer's own strike/instrument/effects. Owner report: JayTrax
 * instruments did not play from the computer keyboard (no single-note path existed in the WASM).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { jxsNoteForKey } from '../JxsSynth';
import { loadJxsWasm, renderNote } from './jxsWasmHarness';

const root = path.resolve(__dirname, '../../../..');

async function loadModule(): Promise<any> {
  const js = fs.readFileSync(path.join(root, 'public/jxs/Jxs.js'), 'utf8')
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."');
  const factory = new Function(js + '\nreturn createJxs;')();
  return factory({ wasmBinary: fs.readFileSync(path.join(root, 'public/jxs/Jxs.wasm')) });
}

function peakOf(m: any, out: number, blocks: number): number {
  let peak = 0;
  for (let b = 0; b < blocks; b++) {
    expect(m._jxs_preview_render(out, 128)).toBe(128);
    for (let k = 0; k < 256; k++) peak = Math.max(peak, Math.abs(m.HEAPF32[(out >> 2) + k]));
  }
  return peak;
}

describe('JXS single-note preview (keyboard voice)', () => {
  it('a note of an instrument sounds, a stop silences it, and the song is never started', async () => {
    const m = await loadModule();
    const bytes = fs.readFileSync(path.join(root, 'public/data/songs/formats/popcorn.jxs'));
    const ptr = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, ptr);
    const out = m._malloc(128 * 8);

    expect(m._jxs_preview_open(ptr, bytes.length)).toBe(1);
    // Nothing sounds before a key.
    expect(peakOf(m, out, 40)).toBe(0);

    // Some instrument of the module sounds from a key (instruments differ; at least one is audible).
    const audible: number[] = [];
    for (let instrument = 1; instrument <= 12; instrument++) {
      m._jxs_preview_note(instrument, 37);
      if (peakOf(m, out, 80) > 0.001) audible.push(instrument);
      m._jxs_preview_stop();
    }
    expect(audible.length).toBeGreaterThanOrEqual(1);

    // Key up: silence once the buffer drains.
    m._jxs_preview_note(audible[0], 37);
    const held = peakOf(m, out, 40);
    expect(held).toBeGreaterThan(0.001);
    m._jxs_preview_stop();
    peakOf(m, out, 20); // the mixer's look-ahead drains
    expect(peakOf(m, out, 40)).toBeLessThan(held * 0.01);

    // The preview copy is separate from the song: no song is open, the song export has no state.
    expect(m._jxs_render(out, 128)).toBeLessThanOrEqual(0);
    m._jxs_preview_close();
  });

  it('an out-of-range instrument is ignored (stays silent)', async () => {
    const m = await loadModule();
    const bytes = fs.readFileSync(path.join(root, 'public/data/songs/formats/popcorn.jxs'));
    const ptr = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, ptr);
    const out = m._malloc(128 * 8);
    expect(m._jxs_preview_open(ptr, bytes.length)).toBe(1);
    m._jxs_preview_note(0, 37);
    m._jxs_preview_note(9999, 37);
    expect(peakOf(m, out, 40)).toBe(0);
    m._jxs_preview_close();
  });

  it('the keyboard key for C-2 plays the same sound as raw note 72, not a very low octave', async () => {
    const m = await loadJxsWasm();
    const bytes = new Uint8Array(fs.readFileSync(path.join(root, 'public/data/songs/formats/popcorn.jxs')));
    let instrument = 0, direct: Float32Array = new Float32Array(0);
    for (let i = 1; i <= 12 && !direct.some((v) => v !== 0); i++) { instrument = i; direct = renderNote(m, bytes, i, 72); }
    const key = renderNote(m, bytes, instrument, jxsNoteForKey(36));
    expect(direct.some((v) => v !== 0)).toBe(true);
    expect(Array.from(key)).toEqual(Array.from(direct));
  });
});
