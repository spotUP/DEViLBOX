/**
 * Wave-buffer oracle regression (SunTronic MEGAEFFECTS type-2 splice).
 *
 * Background (Phase 0, 2026-07-13): the native timbre generator
 * `renderSynthTick` (SunTronicSynthVoice.ts) was validated against a UADE
 * chip-RAM wave-buffer oracle (tools/suntronic-re/p5-wavebuffer-oracle.ts). The
 * oracle read the real per-tick synth wave buffer UADE writes to Amiga chip RAM
 * (via the Paula AUDxLC:LEN write-log + read_memory) and diffed it against the
 * native output.
 *
 * It caught an INVERTED splice: the original type-2 (CALC7) transcription put the
 * head from wave2 and the tail from wave1; UADE proves the head is wave1 and the
 * tail is wave2. After the fix, native reproduces every type-2 wave buffer UADE
 * emitted for mule.src byte-exact.
 *
 * This test re-derives the native buffers from the committed mule.src fixture and
 * asserts each golden UADE buffer (captured once, committed as JSON) is
 * reproduced — no wasm needed at test time.
 *
 * Fails on revert: swap the wave1/wave2 roles back in `renderSynthTick` case 2 and
 * the native buffers no longer match the golden → this test fails.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
} from '@/engine/suntronic/SunTronicSynthVoice';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const MULE = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes/mule.src');
const GOLDEN = resolve(HERE, 'sunTronicWaveBufferOracle.golden.json');

interface Golden {
  synthType: number;
  buffersHex: string[];
}

const hexOf = (b: Int8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
  return s;
};

/** All distinct buffers native MEGAEFFECTS emits for an instrument across 2 arp cycles. */
function nativeBufferSet(
  inst: ReturnType<typeof parseSunTronicV13Score>['synthInstruments'][number],
): Set<string> {
  const out = new Set<string>();
  const state = createVoiceState();
  const prng = createPrng();
  const ticks = Math.max(1, inst.arpLen) * 2 + 4;
  for (let t = 0; t < ticks; t++) out.add(hexOf(renderSynthTick(inst, state, prng)));
  return out;
}

describe('SunTronic MEGAEFFECTS wave-buffer oracle (type-2 splice)', () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(MULE)));
  const t2 = score.synthInstruments.find((i) => i.synthType === golden.synthType);

  it('mule.src has a type-2 synth instrument', () => {
    expect(t2, 'no type-2 synth instrument found in mule.src').toBeTruthy();
  });

  it('golden set is non-trivial (guards against an empty-pass)', () => {
    expect(golden.buffersHex.length).toBeGreaterThanOrEqual(8);
  });

  it('native MEGAEFFECTS reproduces every UADE type-2 wave buffer byte-exact', () => {
    const native = nativeBufferSet(t2!);
    const missing = golden.buffersHex.filter((h) => !native.has(h));
    expect(
      missing,
      `${missing.length}/${golden.buffersHex.length} UADE type-2 wave buffers are NOT ` +
        `reproduced by the native splice. The head must be wave1 and the tail wave2 ` +
        `(SunTronicSynthVoice.ts case 2). First missing: ${missing[0]?.slice(0, 48)}...`,
    ).toEqual([]);
  });
});
