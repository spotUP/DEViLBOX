/**
 * Regression: Sonix Synthesis/MIDI `.instr` instruments must be typed as SonixSynth at
 * import, not left as silent PCM Sampler placeholders.
 *
 * Before the fix, IffSmusParser captured the companion `.instr` but never inspected it, so
 * every instrument fell through to a Sampler placeholder — a Sonix song's synth voices
 * "defaulted to pcm" until the WASM param bridge upgraded them on play. `isSonixSynthInstr`
 * detects the synth headers so the parser can tag them SonixSynth up front.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isSonixSynthInstr } from '../formats/IffSmusParser';

const INSTR_DIR = path.resolve(
  __dirname, '../../../../public/data/songs/sonix-smus/ACE II/Instruments',
);
const read = (name: string) => new Uint8Array(fs.readFileSync(path.join(INSTR_DIR, name)));
const haveFixtures = fs.existsSync(INSTR_DIR);

describe.skipIf(!haveFixtures)('isSonixSynthInstr — Sonix instrument classification', () => {
  it('classifies Synthesis .instr files as synth', () => {
    for (const f of ['Ace2-2.instr', 'Ace2leed.instr', 'Monty1.instr']) {
      expect(isSonixSynthInstr(read(f))).toBe(true);
    }
  });

  it('classifies SampledSound .instr files as NOT synth (they are samples)', () => {
    for (const f of ['deeptrumpet1.instr', 'hidrum1.instr', 'longbase2.instr']) {
      expect(isSonixSynthInstr(read(f))).toBe(false);
    }
  });

  it('classifies a zero-header buffer and a MIDI-header buffer as synth', () => {
    expect(isSonixSynthInstr(new Uint8Array(64))).toBe(true); // zero header
    const midi = new Uint8Array(84);
    midi.set([0x4d, 0x49, 0x44, 0x49]); // "MIDI"
    expect(isSonixSynthInstr(midi)).toBe(true);
  });
});
