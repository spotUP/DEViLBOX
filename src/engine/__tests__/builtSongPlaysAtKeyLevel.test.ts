/**
 * A Sampler note in the pattern of a song DEViLBOX builds plays at the level
 * the same note plays on a key (reported 2026-10-21: the pattern was "very
 * silent", 12.5 dB under the keyboard). The key renders through ToneEngine
 * (renderKeys), the pattern through libopenmpt playing the module
 * createModuleForSong builds, the way the song plays in the app.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_CELL, type TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import { renderKeys, rms, SR } from './uadeKeyHarness';

const ROOT = resolve(__dirname, '../../..');
const cell = (over: Partial<TrackerCell> = {}): TrackerCell => ({ ...EMPTY_CELL, ...over });
const dbToGain = (db: number) => Math.pow(10, db / 20);

/** One second of a 16-bit square wave at +/-12000, as a mono WAV. */
function squareWav(frames: number, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + frames * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + frames * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) v.setInt16(44 + i * 2, (i >> 6) & 1 ? 12000 : -12000, true);
  return buf;
}

const sampler = (volume: number): InstrumentConfig => ({
  id: 1, name: 'square', synthType: 'Sampler', volume,
  sample: { audioBuffer: squareWav(44100, 44100), baseNote: 'C3', sampleRate: 44100, loop: false, loopStart: 0, loopEnd: 0 },
} as unknown as InstrumentConfig);

async function keyLevel(volume: number): Promise<number> {
  const out = await renderKeys(sampler(volume), [{ note: 'C3', at: 0.05 }], 0.6);
  return rms(out, SR * 0.1 | 0, SR * 0.5 | 0);
}

/** Build the module of a one-note song (C3 on row 0) and render it with libopenmpt. */
async function patternLevel(volume: number): Promise<number> {
  const empty = () => Array.from({ length: 16 }, () => cell());
  const rows = empty();
  rows[0] = cell({ note: 37, instrument: 1 });
  const song = {
    numChannels: 4,
    patterns: [{ length: 16, channels: [{ rows }, { rows: empty() }, { rows: empty() }, { rows: empty() }] }],
    songPositions: [0],
    instruments: [sampler(volume)],
  };
  const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
  const data = await bridge.createModuleForSong(song as never, () => false);
  expect(data).toBeTruthy();
  // @ts-expect-error -- untyped Emscripten worklet build
  const factory = (await import('../../../public/chiptune3/libopenmpt.worklet.js')).default as () => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = await factory();
  const bytes = new Uint8Array(data!);
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const h = m._openmpt_module_create_from_memory2(ptr, bytes.length, 0, 0, 0, 0, 0, 0, 0);
  const L = m._malloc(4 * 4096), R = m._malloc(4 * 4096);
  const out = new Float32Array(SR);
  let n = 0;
  while (n < SR * 0.6) {
    const k = m._openmpt_module_read_float_stereo(h, SR, 4096, L, R) as number;
    if (!k) break;
    out.set(new Float32Array(m.HEAPU8.buffer, L, k).subarray(0, Math.min(k, SR - n)), n);
    n += k;
  }
  m._openmpt_module_destroy(h);
  return rms(out, SR * 0.05 | 0, SR * 0.45 | 0);
}

describe('a Sampler note in a built song plays at its key level', () => {
  beforeAll(() => {
    const wasmBinary = readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.wasm'));
    (0, eval)(readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.js'), 'utf8') + '\n;globalThis.__osl = createOpenMPTSoundlib;');
    const real = (globalThis as unknown as { __osl: (o: object) => Promise<unknown> }).__osl;
    (globalThis as unknown as Record<string, unknown>).createOpenMPTSoundlib = (o: object) => real({ ...o, wasmBinary });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
  });

  it.each([0, -12])('matches the key within 1 dB at instrument volume %i dB', async (volume) => {
    const key = await keyLevel(volume);
    const pattern = await patternLevel(volume);
    expect(Math.abs(20 * Math.log10(pattern / key))).toBeLessThan(1);
  }, 120000);

  it('carries the Sampler normalization offset the app registers', async () => {
    const key = await keyLevel(-12); // renderKeys runs without the synth registry: offset 0
    await import('@engine/registry/builtin');
    const { instrumentOffsetDb } = await import('@engine/factories/volumeNormalization');
    const offset = instrumentOffsetDb('Sampler');
    expect(offset).toBeGreaterThan(0);
    const pattern = await patternLevel(-12);
    expect(Math.abs(20 * Math.log10(pattern / (key * dbToGain(offset))))).toBeLessThan(1);
  }, 120000);
});
