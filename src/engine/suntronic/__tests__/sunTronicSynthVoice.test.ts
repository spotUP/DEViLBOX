/**
 * Regression: SunTronic native wavetable timbre generator (MEGAEFFECTS port).
 *
 * Without renderSynthTick the synth voices have no native audio — auditioning a
 * synth instrument falls through to whole-module UADE playback (the "full song
 * plays" bug). These assertions pin the two UNAMBIGUOUS synthesis types
 * (0 = linear morph, 2 = splice) exactly against the 68k algorithm, plus the
 * arp-index stepping and PRNG determinism. They fail on revert (a broken morph
 * math, wrong splice boundary, or missing arp wrap all trip an exact check).
 *
 * Sample-exact parity for the ambiguous types (1/3/else) is gated on the UADE
 * per-voice buffer oracle (Phase 2 exit) and is NOT asserted here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score, type SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
} from '../SunTronicSynthVoice';

function synth(partial: Partial<SunSynthInstrument> & { synthType: number }): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: 0, volEnvLoop: 0,
    freqEnvOff: 0, freqEnvLen: 0, freqEnvLoop: 0, freqEnvSpeed: 0,
    arpTableOff: 0, arpLen: partial.arpTable?.length ?? 1, arpLoop: 0,
    wave1Off: 0, wave2Off: 0,
    waveWordLen: partial.waveWordLen ?? ((partial.wave1?.length ?? 2) >> 1),
    wave1: new Int8Array(0), wave2: new Int8Array(0),
    arpTable: new Int8Array([0]),
    volEnv: new Int8Array([0x40]), vibDepth: new Int8Array([0]),
    ...partial,
  };
}

describe('SunTronic native wavetable generator (MEGAEFFECTS port)', () => {
  it('type 0 morph: D1=0 → out == wave1 exactly', () => {
    const wave1 = new Int8Array([10, -20, 30, -40]);
    const wave2 = new Int8Array([100, 100, 100, 100]);
    const inst = synth({ synthType: 0, waveWordLen: 2, wave1, wave2, arpTable: new Int8Array([0]) });
    const out = renderSynthTick(inst, createVoiceState(), createPrng());
    expect(Array.from(out)).toEqual([10, -20, 30, -40]);
  });

  it('type 0 morph: D1=64 → out = wave1 + ((wave2-wave1)*64 >> 7)', () => {
    // 4-byte buffer (waveWordLen 2). Padded 4th entry stays 0.
    //  i0:    0 + (100*64>>7)=6400>>7=50  → 50
    //  i1:    0 + (-60*64>>7)=-3840>>7=-30 → -30
    //  i2: -100 + (100*64>>7)=50           → -50
    //  i3:    0 + 0                         → 0
    const wave1 = new Int8Array([0, 0, -100, 0]);
    const wave2 = new Int8Array([100, -60, 0, 0]);
    const inst = synth({ synthType: 0, waveWordLen: 2, wave1, wave2, arpTable: new Int8Array([64]) });
    const out = renderSynthTick(inst, createVoiceState(), createPrng());
    expect(Array.from(out)).toEqual([50, -30, -50, 0]);
  });

  it('type 2 splice: first D1 bytes from wave2, rest from wave1[D1..]', () => {
    const wave1 = new Int8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const wave2 = new Int8Array([-1, -2, -3, -4, -5, -6, -7, -8]);
    const inst = synth({ synthType: 2, waveWordLen: 4, wave1, wave2, arpTable: new Int8Array([3]) });
    const out = renderSynthTick(inst, createVoiceState(), createPrng());
    // D1=3: out = wave2[0..2] ++ wave1[3..7 clamped to 8 samples]
    expect(Array.from(out)).toEqual([-1, -2, -3, 4, 5, 6, 7, 8]);
  });

  it('arp index advances and wraps arpLen → arpLoop', () => {
    const inst = synth({
      synthType: 2, waveWordLen: 1,
      wave1: new Int8Array([9, 9]), wave2: new Int8Array([0, 0]),
      arpTable: new Int8Array([0, 1, 2]), arpLoop: 1,
    });
    (inst as { arpLen: number }).arpLen = 3;
    const st = createVoiceState();
    const prng = createPrng();
    expect(st.arpIndex).toBe(0);
    renderSynthTick(inst, st, prng); expect(st.arpIndex).toBe(1);
    renderSynthTick(inst, st, prng); expect(st.arpIndex).toBe(2);
    renderSynthTick(inst, st, prng); expect(st.arpIndex).toBe(1); // wrapped to arpLoop
  });

  it('is deterministic for a given (inst, state, prng)', () => {
    const inst = synth({
      synthType: 1, waveWordLen: 8,
      wave1: new Int8Array(16).fill(20), wave2: new Int8Array(16).fill(-20),
      arpTable: new Int8Array([-1]), // PRNG noise
    });
    const a = renderSynthTick(inst, createVoiceState(), createPrng());
    const b = renderSynthTick(inst, createVoiceState(), createPrng());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('mule.src synth[0] (type 2): renders a full 0x40-byte buffer', () => {
    const buf = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/mule.src')));
    const score = parseSunTronicV13Score(buf);
    const s0 = score.synthInstruments[0];
    expect(s0.synthType).toBe(2);
    const out = renderSynthTick(s0, createVoiceState(), createPrng());
    expect(out.length).toBe(0x40); // waveWordLen(0x20) * 2
    // splice of real wave data: not all zero
    expect(out.some((v) => v !== 0)).toBe(true);
  });
});
