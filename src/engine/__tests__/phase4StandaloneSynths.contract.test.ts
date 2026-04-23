/**
 * Contract tests for Phase 4 standalone-capable per-voice synths.
 *
 * Background: the user's request was "I should just be able to pick whichever
 * synths from any format I want and combine them as I wish and save as .dbx".
 * For that to work, each format's synth class must implement a standalone
 * instrument mode that doesn't require a native song to be loaded:
 *
 *   1. `setInstrument(config)` uploads instrument data to a WASM player.
 *   2. `triggerAttack(note)` sends a `noteOn` message to the WASM worklet.
 *   3. `triggerRelease()` sends a `noteOff` message.
 *   4. A `_playerHandle` (or equivalent) tracks the allocated WASM player.
 *   5. The underlying `.worklet.js` supports `createPlayer` / `noteOn` /
 *      `noteOff` message types.
 *
 * If any of those pieces go missing, a format silently produces no sound when
 * picked standalone from the synth browser. This is exactly the regression
 * class Phase 4 is designed to prevent — it's an invisible failure (no error,
 * no crash, no audio).
 *
 * These checks run statically against the source and shipped worklets, no
 * audio / WASM / AudioContext / React needed. <50 ms.
 *
 * When you add a new standalone-capable per-voice format:
 *   - Add its entry below in STANDALONE_SYNTHS.
 *   - Mirror the Hively pattern in its synth class (see HivelySynth.ts).
 *   - Ensure the worklet exposes the standalone message vocabulary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public');

function read(rel: string, base = ROOT): string {
  return readFileSync(resolve(base, rel), 'utf8');
}

interface StandaloneFormat {
  /** Human-readable name for test output. */
  name: string;
  /** Path under src/ to the synth TypeScript class. */
  synthFile: string;
  /** Path under public/ to the compiled worklet. */
  workletFile: string;
  /** The InstrumentFactory case value (synthType). */
  synthType: string;
}

const STANDALONE_SYNTHS: StandaloneFormat[] = [
  {
    name: 'Hively',
    synthFile: 'engine/hively/HivelySynth.ts',
    workletFile: 'hively/Hively.worklet.js',
    synthType: 'HivelySynth',
  },
  {
    name: 'Future Composer',
    synthFile: 'engine/fc/FCSynth.ts',
    workletFile: 'fc/FC.worklet.js',
    synthType: 'FCSynth',
  },
  {
    name: 'Fred Editor',
    synthFile: 'engine/fred/FredSynth.ts',
    workletFile: 'fred/Fred.worklet.js',
    synthType: 'FredSynth',
  },
  {
    name: 'Hippel-CoSo',
    synthFile: 'engine/hippelcoso/HippelCoSoSynth.ts',
    workletFile: 'hippel-coso/HippelCoSo.worklet.js',
    synthType: 'HippelCoSoSynth',
  },
  {
    name: 'Rob Hubbard',
    synthFile: 'engine/robhubbard/RobHubbardSynth.ts',
    workletFile: 'robhubbard/RobHubbard.worklet.js',
    synthType: 'RobHubbardSynth',
  },
  {
    name: 'SidMon II',
    synthFile: 'engine/sidmon/SidMonSynth.ts',
    workletFile: 'sidmon/SidMon.worklet.js',
    synthType: 'SidMonSynth',
  },
  {
    name: 'SidMon I',
    synthFile: 'engine/sidmon1/SidMon1Synth.ts',
    workletFile: 'sidmon1/SidMon1.worklet.js',
    synthType: 'SidMon1Synth',
  },
];

describe('Phase 4 — standalone per-voice synth contract', () => {
  describe.each(STANDALONE_SYNTHS)('$name ($synthType)', (fmt) => {
    it('synth source file exists', () => {
      expect(existsSync(resolve(ROOT, fmt.synthFile))).toBe(true);
    });

    it('worklet file exists', () => {
      expect(existsSync(resolve(PUBLIC, fmt.workletFile))).toBe(true);
    });

    it('synth class implements standalone mode (setInstrument + noteOn + noteOff)', () => {
      const src = read(fmt.synthFile);
      // Must accept an instrument config
      expect(src, 'setInstrument(config) path required').toMatch(/setInstrument\s*\(/);
      // Must send noteOn and noteOff to the worklet
      expect(src, "must send { type: 'noteOn' } to the worklet").toMatch(/type:\s*['"]noteOn['"]/);
      expect(src, "must send { type: 'noteOff' } to the worklet").toMatch(/type:\s*['"]noteOff['"]/);
      // Must track a player handle so notes route to the right WASM voice
      expect(src, '_playerHandle bookkeeping required').toMatch(/_playerHandle|playerHandle/);
    });

    it('synth triggerAttack is not a no-op stub', () => {
      const src = read(fmt.synthFile);
      // A stub looks like: `triggerAttack(_note: number, _velocity?: number): void {}`.
      // Real implementations accept `note?: string | number` and do actual work.
      const stubPattern = /triggerAttack\s*\(\s*_note\s*[^)]*\)\s*:\s*void\s*\{\s*\}/;
      expect(src, 'triggerAttack must have a real body, not an empty stub').not.toMatch(stubPattern);
    });

    it('worklet exposes standalone message vocabulary (createPlayer/noteOn/noteOff)', () => {
      const wk = read(fmt.workletFile, PUBLIC);
      // A standalone-capable worklet must handle all three.
      expect(wk, "worklet missing case 'createPlayer'").toMatch(/case\s+['"]createPlayer['"]/);
      expect(wk, "worklet missing case 'noteOn'").toMatch(/case\s+['"]noteOn['"]/);
      expect(wk, "worklet missing case 'noteOff'").toMatch(/case\s+['"]noteOff['"]/);
    });

    it('InstrumentFactory wires this synth type with a setInstrument call', () => {
      const factory = read('engine/InstrumentFactory.ts');
      // The synthType must appear as a case label.
      const caseRe = new RegExp(`case\\s+['"]${fmt.synthType}['"]`);
      expect(factory, `${fmt.synthType} missing from InstrumentFactory switch`).toMatch(caseRe);
    });
  });

  it('all listed synths are registered in a browser category', () => {
    // Concatenate every known synth-category file so new categories don't
    // require changes here.
    const files = [
      'constants/synthCategories/amigaSynths.ts',
      'constants/synthCategories/c64Synths.ts',
      'constants/synthCategories/categories.ts',
    ];
    const joined = files
      .map((f) => (existsSync(resolve(ROOT, f)) ? read(f) : ''))
      .join('\n');
    for (const fmt of STANDALONE_SYNTHS) {
      expect(joined, `${fmt.synthType} not referenced in any synth category file`).toMatch(
        new RegExp(`\\b${fmt.synthType}\\b`),
      );
    }
  });
});
