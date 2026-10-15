/**
 * DX7 firmware key presses: ONE key press sounds ONE note. Real VDX7 firmware (public/dx7 WASM + stock v1.8 ROM) through
 * the real worklet; the messages are exactly what DX7Synth.triggerAttack / triggerRelease post. Regressions:
 *  - a key-down of a key that was still down (a lost key-up, a double trigger) took a second voice and the one key-up
 *    released only one of them, so the note stayed stuck and sounded twice;
 *  - velocities above 127 indexed past the bridge's 128-entry velocity table: 200 and 255 sounded nothing.
 * Skipped without the copyrighted ROM (public/roms/dx7/DX7-V1-8.OBJ).
 */
import { describe as baseDescribe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HAS_DX7_ROM, startDX7, initVoice, type DX7Rig } from './dx7Harness';

const describe = HAS_DX7_ROM ? baseDescribe : baseDescribe.skip;
let rig: DX7Rig;
beforeAll(async () => { if (HAS_DX7_ROM) rig = await startDX7(); }, 60000);

const SR = 48000;
const hzOfNote = (n: number): number => 440 * 2 ** ((n - 69) / 12);
const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Voices whose key is down (any operator without key-off). */
const keyedVoices = (): number[] => rig.envelopeState().flatMap((v, i) => (v.some(o => !o.keyoff) ? [i] : []));

function rms(a: Float32Array): number {
  let s = 0;
  for (const x of a) s += x * x;
  return Math.sqrt(s / a.length);
}
/** Fundamental of a clean tone from interpolated rising zero crossings. */
function fundamental(a: Float32Array): number {
  const xs: number[] = [];
  for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 && a[i] >= 0) xs.push(i - 1 + -a[i - 1] / (a[i] - a[i - 1]));
  return ((xs.length - 1) * SR) / (xs[xs.length - 1] - xs[0]);
}
const cents = (hz: number, ref: number): number => 1200 * Math.log2(hz / ref);

async function press(note: number, velocity = 100): Promise<void> {
  await rig.send({ type: 'noteOn', note, velocity });
  rig.run(200);
}
/** What a key-up does: the note-off, then the release tail runs out. */
async function release(note: number): Promise<void> {
  await rig.send({ type: 'noteOff', note });
  rig.run(800);
}
async function reset(): Promise<void> {
  await rig.send({ type: 'allNotesOff' });
  rig.run(600);
}

describe('DX7 firmware: one key press, one note', () => {
  it('a single key on a plain voice keys exactly one voice, at the key\'s pitch, for the whole range', async () => {
    await rig.loadVoice(initVoice());
    for (const note of [36, 48, 60, 69, 84, 96]) {
      await press(note);
      expect(keyedVoices(), `note ${note}`).toHaveLength(1);
      const hz = fundamental(rig.run(300));
      expect(Math.abs(cents(hz, hzOfNote(note))), `note ${note}: ${hz.toFixed(1)} Hz`).toBeLessThan(10);
      await release(note);
      expect(keyedVoices(), `note ${note} after key-up`).toHaveLength(0);
      await reset();
    }
  }, 60000);

  it('a single key keys one voice on library voices (bank load + program change path as DX7Synth.loadPatchBank)', async () => {
    const raw = new Uint8Array(readFileSync(resolve(__dirname, '../../../../public/roms/dx7/Patches/rom1a.syx')));
    await rig.send({ type: 'loadSysex', data: ab(raw) });
    rig.run(37); // the 100 ms DX7Synth waits before selecting the voice
    for (const program of [0, 5, 9, 17, 31]) {
      await rig.send({ type: 'programChange', program });
      rig.run(60);
      expect(keyedVoices(), `program ${program} before any key`).toHaveLength(0);
      await press(60);
      expect(keyedVoices(), `program ${program}`).toHaveLength(1);
      await release(60);
      expect(keyedVoices(), `program ${program} after key-up`).toHaveLength(0);
      await reset();
    }
  }, 120000);

  it('a key pressed again while it is still down (lost key-up, double trigger) does not stack a second note: one key-up silences it', async () => {
    await rig.loadVoice(initVoice());
    await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
    await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
    rig.run(200);
    expect(keyedVoices()).toHaveLength(1);
    await release(60);
    expect(keyedVoices(), 'voices still keyed after the single key-up').toHaveLength(0);
    expect(rms(rig.run(300)), 'level after the key-up').toBeLessThan(1e-3);
    await reset();
  }, 60000);

  it('velocity above 127 plays like 127 (it read past the velocity table: 200 and 255 were silent)', async () => {
    await rig.loadVoice(initVoice());
    await press(60, 127);
    const full = rms(rig.run(300));
    await release(60); await reset();
    expect(full).toBeGreaterThan(0.005);
    for (const velocity of [128, 200, 255]) {
      await press(60, velocity);
      const a = rig.run(300);
      expect(rms(a), `velocity ${velocity}`).toBeCloseTo(full, 3);
      expect(Math.abs(cents(fundamental(a), hzOfNote(60)))).toBeLessThan(10);
      await release(60); await reset();
    }
  }, 60000);

  it('keys outside the 61-key range (MIDI 36..96) key nothing instead of being fed to the firmware', async () => {
    await rig.loadVoice(initVoice());
    for (const note of [20, 35, 97, 108, 127]) {
      await rig.send({ type: 'noteOn', note, velocity: 100 });
      rig.run(200);
      expect(keyedVoices(), `note ${note}`).toHaveLength(0);
      expect(rms(rig.run(200)), `note ${note}`).toBeLessThan(1e-4);
      await rig.send({ type: 'noteOff', note });
    }
  }, 60000);
});
