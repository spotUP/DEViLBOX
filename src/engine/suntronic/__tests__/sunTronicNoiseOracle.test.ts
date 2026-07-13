/**
 * Wave-buffer oracle regression (SunTronic MEGAEFFECTS type-1 PRNG noise).
 *
 * Background (Phase 0, 2026-07-13): the type-1 noise path (CALC5/6, d1 == -1) in
 * `renderSynthTick` (SunTronicSynthVoice.ts) was validated against a real UADE
 * chip-RAM noise buffer captured by the P5 wave-buffer oracle
 * (tools/suntronic-re/p5-wavebuffer-oracle.ts) from mule.src.
 *
 * The oracle caught two transcription bugs in the middle-square PRNG:
 *   1. the square was shifted right by 8; it must be >>> 4.
 *   2. the output word was written AFTER stepping; it must be written BEFORE
 *      (out[0] == the incoming seed).
 * Recovered recurrence:  d0_next = ((d0*d0) >>> 4 & 0xffff) ^ 0xac91.
 *
 * This test seeds the native PRNG with the captured buffer's own first word
 * (0x6d77) and asserts the native noise voice regenerates the exact 128-byte UADE
 * buffer — no wasm needed at test time. Only the WITHIN-buffer recurrence is
 * pinned (the per-tick seed carry is a separate unverified concern; feeding the
 * known seed isolates the recurrence, which is the part that sets the timbre).
 *
 * Fails on revert: restore >>> 8, or step-then-write, and the regenerated buffer
 * diverges from the golden → this test fails.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
} from '@/engine/suntronic/SunTronicSynthVoice';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, 'sunTronicNoiseOracle.golden.json');

interface Golden {
  synthType: number;
  seed: number;
  bufferHex: string;
}

const hexOf = (b: Int8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
  return s;
};

/** Minimal type-1 noise instrument: arp D1 == -1 selects the PRNG path; noise
 *  ignores wave data, so only waveWordLen (buffer size) matters. */
function noiseInstrument(waveWordLen: number): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: 0, volEnvLoop: 0,
    freqEnvOff: 0, freqEnvLen: 0, freqEnvLoop: 0, freqEnvSpeed: 0,
    arpTableOff: 0, arpLen: 1, arpLoop: 0,
    wave1Off: 0, wave2Off: 0,
    waveWordLen,
    synthType: 1,
    wave1: new Int8Array(waveWordLen * 2),
    wave2: new Int8Array(waveWordLen * 2),
    arpTable: new Int8Array([-1]),
    volEnv: new Int8Array([0x40]),
    vibDepth: new Int8Array([0]),
  };
}

describe('SunTronic MEGAEFFECTS wave-buffer oracle (type-1 PRNG noise)', () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
  const bytes = golden.bufferHex.length >> 1;
  const inst = noiseInstrument(bytes >> 1);

  it('golden is a non-trivial noise buffer (guards against an empty-pass)', () => {
    expect(bytes).toBeGreaterThanOrEqual(64);
    expect(new Set(golden.bufferHex.match(/../g)!).size).toBeGreaterThan(4);
  });

  it('native noise regenerates the exact UADE chip-RAM buffer from the recovered seed', () => {
    const prng = createPrng();
    prng.value = golden.seed;
    const out = renderSynthTick(inst, createVoiceState(), prng);
    expect(
      hexOf(out),
      `native noise does not match the UADE buffer — the middle-square must be ` +
        `(d0*d0)>>>4 ^ 0xac91 with the word written before stepping ` +
        `(SunTronicSynthVoice.ts renderType1 d1===-1).`,
    ).toBe(golden.bufferHex);
  });
});
