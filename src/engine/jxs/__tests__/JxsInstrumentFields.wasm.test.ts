/**
 * Every JayTrax instrument-editor field moves the rendered output of a note on that instrument, or carries a
 * written exemption below. Rendering is the real WASM replayer's single-note preview (the keyboard voice).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readJxsInstrument, writeJxsInstrument, type JxsEdit } from '@/lib/import/formats/jxsInstrument';
import { loadJxsWasm, renderNote, differs } from './jxsWasmHarness';

const root = path.resolve(__dirname, '../../../..');
const FILE = path.join(root, 'public/data/songs/formats/jbells.jxs');
const RAMP = Int16Array.from({ length: 256 }, (_, k) => k * 120);
const SQUARE = Int16Array.from({ length: 256 }, (_, k) => (k < 128 ? 20000 : -20000));
let m: any;
let bytes: Uint8Array;
let base: Float32Array;
let id = 0;

beforeAll(async () => {
  m = await loadJxsWasm();
  bytes = new Uint8Array(fs.readFileSync(FILE));
  // The first instrument that is audible and plays its own wave (sample instruments ignore the wave table).
  let best = -1;
  for (let i = 1; i <= 12 && best < 0; i++) {
    const inst = readJxsInstrument(bytes, i - 1);
    if (!inst) break;
    const r = renderNote(m, bytes, i);
    if (!r.some((v) => Math.abs(v) > 0.001)) continue;
    const probe = writeJxsInstrument(bytes, i - 1, { waves: { [inst.wave]: SQUARE } });
    if (differs(r, renderNote(m, probe, i))) best = i;
  }
  id = best;
  base = renderNote(m, bytes, id);
});

/** Envelope source 7 (wave number 6: the engine counts from 1, 0 is off) carries a ramp so every envelope has something to read. */
/** Pitch envelope source 6 (wave number 5): small steps, since the pitch is the table frequency minus the wave value. */
const PENV = { waves: { 5: Int16Array.from({ length: 256 }, (_, k) => k * 4) } };
const ENV = { waves: { 6: RAMP } };

/** field -> [baseline edit (or none), edit]; the render of the edit must differ from the baseline's. */
type Build = (i: NonNullable<ReturnType<typeof readJxsInstrument>>) => [JxsEdit | null, JxsEdit];
const CASES: Array<[string, Build]> = [
  ['volume', (i) => [null, { volume: i.volume > 100 ? 40 : 256 }]],
  ['wave', (i) => [null, { wave: (i.wave + 2) % 16, waves: { [(i.wave + 2) % 16]: SQUARE } }]],
  ['wavelen', (i) => [null, { wavelen: i.wavelen === 1 ? 4 : 1 }]],
  ['volwave', () => [null, { ...ENV, volwave: 7 }]],
  ['volspeed', () => [{ ...ENV, volwave: 7, volspeed: 1 }, { ...ENV, volwave: 7, volspeed: 9 }]],
  ['volloop', () => [{ ...ENV, volwave: 7, volspeed: 20, volloop: 255 }, { ...ENV, volwave: 7, volspeed: 20, volloop: 40 }]],
  ['pitchwave', () => [null, { ...PENV, pitchwave: 6, pitchspeed: 9 }]],
  ['pitchspeed', () => [{ ...PENV, pitchwave: 6, pitchspeed: 2 }, { ...PENV, pitchwave: 6, pitchspeed: 12 }]],
  ['pitchloop', () => [{ ...PENV, pitchwave: 6, pitchspeed: 20, pitchloop: 255 }, { ...PENV, pitchwave: 6, pitchspeed: 20, pitchloop: 40 }]],
  ['pitchdelay', () => [{ ...PENV, pitchwave: 6, pitchspeed: 9, pitchdelay: 0 }, { ...PENV, pitchwave: 6, pitchspeed: 9, pitchdelay: 10 }]],
  ['panwave', () => [null, { ...ENV, panwave: 7, panspeed: 9 }]],
  ['panspeed', () => [{ ...ENV, panwave: 7, panspeed: 2 }, { ...ENV, panwave: 7, panspeed: 12 }]],
  ['panloop', () => [{ ...ENV, panwave: 7, panspeed: 20, panloop: 255 }, { ...ENV, panwave: 7, panspeed: 20, panloop: 40 }]],
  ['arp', (i) => [null, { arp: (i.arp + 1) % 16, arpeggio: Object.fromEntries(Array.from({ length: 256 }, (_, k) => [k, (k % 16) * 2])) }]],
  ['arpeggio table', () => [{ arp: 0 }, { arp: 0, arpeggio: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [k, 7 + k])) }]],
  ['wave data', (i) => [null, { waves: { [i.wave]: SQUARE } }]],
  ['slot type', (i) => [null, { slots: { 0: { type: 12, dest: i.wave, src1: i.wave, var1: 40, var2: 10 } } }]],
];

describe('JXS instrument fields move the rendered note', () => {
  it('the fixture instrument is audible', () => {
    expect(id).toBeGreaterThan(0);
    expect(base.some((v) => Math.abs(v) > 0.001)).toBe(true);
  });

  for (const [name, build] of CASES) {
    it(`${name} changes the render`, () => {
      const inst = readJxsInstrument(bytes, id - 1)!;
      const [pre, edit] = build(inst);
      const from = pre ? writeJxsInstrument(bytes, id - 1, pre) : bytes;
      const out = writeJxsInstrument(from, id - 1, edit);
      expect(out).not.toBe(from);
      expect(differs(pre ? renderNote(m, from, id) : base, renderNote(m, out, id))).toBe(true);
    });
  }

  /**
   * EXEMPTIONS (no render change is expected, by design):
   * - name: a label only, the replayer never reads it.
   * - slot "Clear state on every note" (reset) and "Restore on every note" (resetwave): act at the next strike
   *   of an already-modified wave; a fresh preview voice starts from the file so there is nothing to restore.
   * - oscflag: selects which parameter the oscillator drives, read only when the slot's osc is non-zero.
   * - sample fields (sharing, loops, bidi, start, loop, end): exist only in version 3457 files that carry a
   *   sample; the fixture instrument is a wavetable one. Covered by the round-trip test.
   */
  /**
   * Finetune moves the table frequency by up to 15/192 octave, but the oscillator step is truncated to a whole
   * number of samples per frame, so only some notes change. Some note in the range must.
   */
  it('finetune changes the render on some note', () => {
    const out = writeJxsInstrument(bytes, id - 1, { finetune: 15 });
    expect(out).not.toBe(bytes);
    let heard = false;
    for (let note = 1; note <= 60 && !heard; note++) heard = differs(renderNote(m, bytes, id, note), renderNote(m, out, id, note));
    expect(heard).toBe(true);
  });

  it('name is not heard', () => {
    const out = writeJxsInstrument(bytes, id - 1, { name: 'Other Name' });
    expect(differs(base, renderNote(m, out, id))).toBe(false);
  });
});
