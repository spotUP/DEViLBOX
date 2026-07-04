/**
 * Cinter4 imported instruments synthesize from the VERBATIM stored words.
 *
 * Regression for wrong-pitch-on-import: the synth used to re-derive pitch/decay
 * from a lossy words→params→words round-trip that also GUESSED the version, and
 * the parser read the pitch words as signed int16 (so the top octave, where a v4
 * pitch word exceeds 32767, read as negative and collapsed to "none"). The Amiga
 * replayer (cinter4.c CinterMakeInstruments) never does that — it feeds the 9
 * stored words straight into the synth. These tests pin that: the words the voice
 * renders from must equal the words stored in the `.cinter4` file, byte-exact.
 *
 * Source of truth for the stored words is `decodeCinter4Music` (the lossless tick
 * decoder), which is independent of the instrument-building path under test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { decodeCinter4Music } from '@/lib/import/formats/cinter4Music';
import { parseCinter4File } from '@/lib/import/formats/Cinter4Parser';
import {
  readCinter4InstrumentParams,
  cinter4EffectiveWords,
} from '@/engine/cinter4/cinter4Instrument';
import {
  renderCinter4SampleFromWords,
  renderCinter4Sample,
} from '@/engine/cinter4/cinter4SynthCore';
import type { Cinter4SynthWords } from '@/lib/import/formats/cinter4Params';

const FX = resolve(__dirname, '../../../lib/export/__tests__/fixtures/cinter4');
const read = (name: string) => new Uint8Array(readFileSync(resolve(FX, name)));

// The 9 synth words in file order; in an instHeader they follow [length, replen].
const WORD_ORDER: (keyof Cinter4SynthWords)[] = [
  'mpitch', 'mod', 'bpitch', 'attack', 'dist', 'decay',
  'mpitchdecay', 'moddecay', 'bpitchdecay',
];

const FILE = 'JazzCat-Automatic.golden.cinter4';

describe('Cinter4 imported instruments render from the verbatim stored words', () => {
  const bytes = read(FILE);
  const decoded = decodeCinter4Music(bytes)!;
  const song = parseCinter4File(bytes, FILE)!;

  // Generated instruments, in file order, that actually have sample data.
  const genHeaders = decoded.instHeaders.filter((h) => !h.isRaw && h.words[0] > 0);
  const genInsts = song.instruments.filter((inst) => {
    const cp = readCinter4InstrumentParams(inst);
    return cp && cp.lengthWords > 0;
  });

  it('imports the same number of generated instruments as the file holds', () => {
    expect(genInsts.length).toBe(genHeaders.length);
    expect(genInsts.length).toBeGreaterThan(0);
  });

  it('preserves every stored synth word byte-exact (no lossy params round-trip)', () => {
    let sawHighPitch = false;
    genInsts.forEach((inst, i) => {
      const cp = readCinter4InstrumentParams(inst)!;
      const w = cinter4EffectiveWords(cp);
      const stored = genHeaders[i].words; // [length, replen, ...9 synth words]
      WORD_ORDER.forEach((key, j) => {
        expect(w[key]).toBe(stored[2 + j] & 0xffff);
      });
      if (w.mpitch > 0x7fff || w.bpitch > 0x7fff) sawHighPitch = true;
    });
    // The signed-read bug only bit the top octave — prove the fixture exercises it,
    // so this test would have caught it (a negative signed read collapses to 0).
    expect(sawHighPitch).toBe(true);
  });

  it('renders a different (correct) waveform than the lossy params round-trip for at least one instrument', () => {
    // At least one JazzCat instrument has a word the params round-trip cannot
    // reproduce (e.g. mod > 100, or an off-grid pitch/decay). The verbatim-words
    // render is the Amiga-correct one; the old params path diverged.
    const diverged = genInsts.some((inst) => {
      const cp = readCinter4InstrumentParams(inst)!;
      const len = Math.min(cp.lengthWords * 2, 4000);
      const verbatim = renderCinter4SampleFromWords(cinter4EffectiveWords(cp), len, null);
      const roundtrip = renderCinter4Sample(cp.params, len, null, cp.version);
      return !verbatim.every((v, k) => v === roundtrip[k]);
    });
    expect(diverged).toBe(true);
  });
});
