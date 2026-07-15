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
    sampleData: new Int8Array(0), sampleZero: 0,
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

  it('type 2 splice: first D1 bytes from wave1, rest from wave2[D1..]', () => {
    // Head=wave1, tail=wave2 — corrected 2026-07-13 against the UADE chip-RAM
    // wave-buffer oracle (P5); the earlier transcription had the roles inverted.
    const wave1 = new Int8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const wave2 = new Int8Array([-1, -2, -3, -4, -5, -6, -7, -8]);
    const inst = synth({ synthType: 2, waveWordLen: 4, wave1, wave2, arpTable: new Int8Array([3]) });
    const out = renderSynthTick(inst, createVoiceState(), createPrng());
    // D1=3: out = wave1[0..2] ++ wave2[3..7] (seamless splice — tail keeps phase).
    expect(Array.from(out)).toEqual([1, 2, 3, -4, -5, -6, -7, -8]);
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

  it('type 6 resonator: reproduces the gliders lead play buffer byte-exact', () => {
    // The type-6 damped-resonator generator (@0x26e6c) GENERATES its wave — no
    // stored samples. Golden = the live UADE chip-RAM play buffer for the gliders
    // lead voice (arp=127, generation sweep phase 23131), captured byte-exact via
    // tools/suntronic-re/probe-t6-brute.ts (16/16 settled buffers matched 128/128).
    // Params packed into the record's wave1/wave2 u32 fields:
    //   wave1Off = (p1a<<16)|p1c = (0<<16)|15000 = 15000  (s16 sweep deltas)
    //   wave2Off = (p1e<<24)|(p1f<<16)|(p20<<8) = 0xff00ff00  (damp/cntTarget/scale)
    // resonPhase pre-set to 8131 so this tick sweeps +p1c(15000) → phase 23131.
    const GOLDEN =
      '1a140c01f6eaded4cac2bdbab9babdc3c9d0d8e4f10010202f3c464e5254524e473f352a20160c05' +
      'fffbf9f9fbff040b121920262c313436363533302c27221d1915120f0e0d0d0e101316191c1f2224' +
      '2628282828272523211f1d1b1918171616161718191a1c1d1e202122222222222221201f1e1d1c1b' +
      '1b1a1a1a1a1a1b1b';
    const inst = synth({
      synthType: 6, waveWordLen: 64,
      wave1Off: 15000, wave2Off: 0xff00ff00,
      arpTable: new Int8Array([127]),
    });
    const st = createVoiceState();
    st.resonPhase = 8131;
    const out = renderSynthTick(inst, st, createPrng());
    expect(out.length).toBe(128);
    const hex = Array.from(out).map((v) => (v & 0xff).toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(GOLDEN);
  });

  it('type 5 stored sample: scans the analgestic2 sample by 2*arp byte-exact', () => {
    // Handler @0x26f2e plays a stored PCM sample at *(record+0x1a) + 2*arp, length
    // record+0x22 words — NOT a generated wave. The analgestic2 type-5 record at
    // 0x15c0 (wwl=16, wave1Off=0x27d1) scans a 0x7f→0x81 transition; the arp value
    // slides the 32-byte window 2 bytes deeper each step. This golden is the arp=3
    // window, confirmed byte-exact against the live UADE chip-RAM play buffer
    // (tools/suntronic-re/verify-t5-all.ts: 189/228 windows matched, 0 mismatches).
    // Fails on revert: dropping case 5 to the renderSmooth default produces an
    // integrator wave, not this sample slice.
    const buf = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/analgestic2.src')));
    const score = parseSunTronicV13Score(buf);
    const inst = score.synthInstruments.find((s) => s.recordOff === 0x15c0);
    expect(inst?.synthType).toBe(5);
    const st = createVoiceState();
    const prng = createPrng();
    let out = renderSynthTick(inst!, st, prng); // arp 1
    out = renderSynthTick(inst!, st, prng); // arp 2
    out = renderSynthTick(inst!, st, prng); // arp 3
    const hex = Array.from(out).map((v) => (v & 0xff).toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f818181818181');
  });

  it('type 3 resample: reproduces the ox.src record byte-exact vs UADE chip-RAM', () => {
    // Handler @0x26d96 (CALC10-12) — a two-segment rate-scaled resample of wave1
    // driven by D1=arp. Golden = the live UADE chip-RAM play buffer for ox.src
    // type-3 record 0x15e2 at arp value 61, captured byte-exact via the P5
    // wave-buffer oracle (tools/suntronic-re/t3-golden.ts: both ox.src type-3
    // records matched at d1=61, 0 contradictions). renderType3 is a pure function
    // of (wave1, byteLen, D1) — no feedback state — so forcing arpTable=[61]
    // selects d1=61 on the first tick. Fails on revert: any drift in the segment
    // split, step fixed-point (0x8000/div), or index accumulator changes a byte.
    const buf = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes/ox.src')));
    const score = parseSunTronicV13Score(buf);
    const rec = score.synthInstruments.find((s) => s.recordOff === 0x15e2);
    expect(rec?.synthType).toBe(3);
    const inst: SunSynthInstrument = { ...rec!, arpTable: new Int8Array([61]), arpLen: 1, arpLoop: 0 };
    const out = renderSynthTick(inst, createVoiceState(), createPrng());
    const hex = Array.from(out).map((v) => (v & 0xff).toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(
      '7f5a00a681a6005a7f5a00a681a6005a7f5a00a681a6005a7f5a00a681a6005a' +
      '7f5a00a681a6005a7f5a0081a6005a7f5a00a681a6005a7f5a00a681a6005a00',
    );
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
