/**
 * Wave-buffer oracle regression (SunTronic MEGAEFFECTS else-branch smooth
 * feedback — CALC13/14).
 *
 * Background (Gate 1, 2026-07-14): the type-else feedback integrator in
 * `renderSynthTick`/`renderSmooth` (SunTronicSynthVoice.ts) was reverse-engineered
 * byte-exact from the LOADED replayer. The real loop lives at 0x26dc8 (store at
 * 0x26e36); it was captured with PC-filtered register capture
 * (uade_wasm_arm_capture_pc) and disassembled with capstone. The earlier
 * transcription had THREE bugs, all fixed here and pinned by this golden:
 *   1. the coefficient was `×0xC000` — must be `×fbDepth` ($1e byte = top byte of
 *      the wave2 chip pointer, hence always 0 → d3v inert).
 *   2. the recurrence used `LSL.W #1` — must be `swap; rol.l #1` (`swapRol1`).
 *   3. the seed/param derivation (divisor, 0x26·extw term, in-place A4 source).
 *
 * Fixtures (tools/suntronic-re/p7v-emit-calc14-golden.ts) capture the first CALC14
 * fire in each corpus module that runs it; each is a full 32/64-byte real UADE
 * chip-RAM buffer with its live d2v/d3v coefficients and feedback seed. The kernel
 * test pins the verified math directly; the wiring test drives the whole
 * `renderSynthTick` dispatch (d2v derivation from the arp value + feedback-source
 * plumbing) to the same bytes. No wasm at test time.
 *
 * Fails on revert: restore ×0xC000, or `<<1` for the rotate, or the wrong param
 * derivation, and the regenerated buffers diverge from the golden → this fails.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';
import {
  calc14Kernel,
  renderSynthTick,
  createVoiceState,
  createPrng,
} from '@/engine/suntronic/SunTronicSynthVoice';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(HERE, 'sunTronicSmoothOracle.golden.json');

interface Fixture {
  name: string;
  byteLen: number;
  d2v: number;
  d3v: number;
  arpD1: number;
  seedLast: number;
  seedPrev: number;
  wave1Hex: string;
  outHex: string;
}
interface Golden {
  note: string;
  fixtures: Fixture[];
}

const hexOf = (b: Int8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
  return s;
};
const hexToI8 = (h: string): Int8Array => {
  const b = new Int8Array(h.length >> 1);
  for (let i = 0; i < b.length; i++) b[i] = (parseInt(h.substr(i * 2, 2), 16) << 24) >> 24;
  return b;
};

/** Minimal type-else (smooth feedback) instrument driven by a single arp value.
 *  wave2Off = 0 → fbDepth byte 0 → d3v 0 (the chip-pointer reality). */
function smoothInstrument(f: Fixture): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: 0, volEnvLoop: 0,
    freqEnvOff: 0, freqEnvLen: 0, freqEnvLoop: 0, freqEnvSpeed: 0,
    arpTableOff: 0, arpLen: 1, arpLoop: 0,
    wave1Off: 0, wave2Off: 0,
    waveWordLen: f.byteLen >> 1,
    synthType: 4, // any non-{0,1,2,3} → CALC14 else-branch
    wave1: hexToI8(f.wave1Hex),
    wave2: new Int8Array(f.byteLen),
    arpTable: new Int8Array([(f.arpD1 << 24) >> 24]),
    volEnv: new Int8Array([0x40]),
    vibDepth: new Int8Array([0]),
  };
}

describe('SunTronic MEGAEFFECTS wave-buffer oracle (else-branch smooth feedback, CALC14)', () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;

  it('golden carries multiple full-length fixtures across distinct coefficient regimes', () => {
    expect(golden.fixtures.length).toBeGreaterThanOrEqual(3);
    for (const f of golden.fixtures) {
      expect(f.byteLen).toBeGreaterThanOrEqual(16);
      expect(f.outHex.length >> 1).toBe(f.byteLen);
      expect(f.arpD1).toBeGreaterThanOrEqual(0); // derivation must be reversible
    }
    expect(new Set(golden.fixtures.map((f) => f.d2v)).size).toBeGreaterThanOrEqual(3);
  });

  for (const f of golden.fixtures) {
    it(`calc14Kernel reproduces ${f.name} byte-exact (byteLen=${f.byteLen}, d2v=0x${f.d2v.toString(16)})`, () => {
      const out = calc14Kernel(f.seedLast, f.seedPrev, hexToI8(f.wave1Hex), f.d2v, f.d3v, f.byteLen);
      expect(
        hexOf(out),
        `CALC14 kernel diverged for ${f.name} — coefficient must be ×fbDepth (not ` +
          `×0xC000) and the recurrence must use swap;rol.l#1 (not <<1).`,
      ).toBe(f.outHex);
    });

    it(`renderSynthTick wiring reproduces ${f.name} byte-exact (arp d1=${f.arpD1})`, () => {
      const inst = smoothInstrument(f);
      const state = createVoiceState();
      // Prime the feedback: latched, play buffer's tail = the captured seed.
      state.feedbackLatched = true;
      const prev = new Int8Array(f.byteLen);
      prev[f.byteLen - 1] = (f.seedLast << 24) >> 24;
      prev[f.byteLen - 2] = (f.seedPrev << 24) >> 24;
      state.playBuffer = prev;
      const out = renderSynthTick(inst, state, createPrng());
      expect(
        hexOf(out),
        `renderSynthTick else-branch wiring diverged for ${f.name} — check the d2v ` +
          `derivation ((0xfffe0/((d1&0xff)+0x20)) - 0x26·extw(d1)) and the A4 seed.`,
      ).toBe(f.outHex);
    });
  }
});
