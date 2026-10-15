/**
 * DX7 firmware pitch: the real VDX7 firmware (public/dx7 WASM + stock v1.8 ROM) must sound MIDI notes at equal
 * temperament (A4 = 440 Hz). Regression: the bridge numbered keys from MIDI 34 instead of 36, so every note sounded
 * two semitones sharp (MIDI 69 rendered ~494 Hz).
 */
import { describe as baseDescribe, it, expect, beforeAll } from 'vitest';
import { HAS_DX7_ROM, startDX7, initVoice, type DX7Rig } from './dx7Harness';

let rig: DX7Rig;
// The firmware ROM is not in the repo: without it these tests skip (they run on a machine that has it).
const describe = HAS_DX7_ROM ? baseDescribe : baseDescribe.skip;
beforeAll(async () => { if (HAS_DX7_ROM) rig = await startDX7(); }, 60000);

const SR = 48000;
const hzOfNote = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** Fundamental of a clean tone from interpolated rising zero crossings over the whole window. */
function fundamental(a: Float32Array): number {
  const xs: number[] = [];
  for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 && a[i] >= 0) xs.push(i - 1 + -a[i - 1] / (a[i] - a[i - 1]));
  return ((xs.length - 1) * SR) / (xs[xs.length - 1] - xs[0]);
}
const cents = (hz: number, ref: number): number => 1200 * Math.log2(hz / ref);

async function measure(note: number): Promise<number> {
  await rig.send({ type: 'noteOn', note, velocity: 127 }); rig.run(150);
  const hz = fundamental(rig.run(300));
  await rig.send({ type: 'allNotesOff' }); rig.run(400);
  return hz;
}

describe('DX7 firmware pitch is equal temperament', () => {
  const voices: Array<[string, (v: Uint8Array) => void]> = [
    ['default voice (transpose C3 = 24)', () => {}],
    ['voice with transpose C2 = 12', (v) => { v[144] = 12; }],
    ['voice with transpose C4 = 36', (v) => { v[144] = 36; }],
  ];
  for (const [label, tweak] of voices) {
    it(`${label}: MIDI 36, 57, 69, 81 sound within 10 cents of A4 = 440 Hz`, async () => {
      const v = initVoice(); tweak(v);
      await rig.loadVoice(v);
      const shift = v[144] - 24; // transpose parameter moves the pitch by (transpose - 24) semitones
      const report: string[] = [];
      for (const note of [36, 57, 69, 81]) {
        const hz = await measure(note);
        const want = hzOfNote(note + shift);
        report.push(`${note}: ${hz.toFixed(2)} Hz (want ${want.toFixed(2)}, ${cents(hz, want).toFixed(1)} cents)`);
        expect(Math.abs(cents(hz, want)), report.join('; ')).toBeLessThan(10);
      }
      console.log(`[dx7 pitch] ${label}: ${report.join('; ')}`);
    }, 60000);
  }

  it('MIDI 57 sounds exactly one octave below MIDI 69 and middle C (60, transpose 24) is 261.63 Hz', async () => {
    await rig.loadVoice(initVoice());
    const a3 = await measure(57); const a4 = await measure(69); const c4 = await measure(60);
    expect(Math.abs(cents(a4 / a3, 2))).toBeLessThan(2);
    expect(Math.abs(cents(c4, 261.63))).toBeLessThan(10);
  }, 60000);
});
