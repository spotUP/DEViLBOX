/**
 * Regression: Sonix companion/support files must never be treated as standalone songs.
 *
 * Dropping a Sonix song folder includes `.tech` driver routines (FORM/MIDI/SampledSound/
 * Synthesis.tech). Before the fix, `.tech` was not in `isCompanionOnly`, so the folder's
 * main-file search could pick e.g. `MIDI.tech` (which sorts before the `.smus` in the
 * flattened file list) and route it to UADE — "could not play: MIDI.tech (ret=-1)".
 */
import { describe, it, expect } from 'vitest';
import { isCompanionOnly } from '../GlobalDragDropHandler';

describe('isCompanionOnly — Sonix companion/support files', () => {
  it('treats .tech driver routines as companions (not main songs)', () => {
    for (const f of ['MIDI.tech', 'FORM.tech', 'SampledSound.tech', 'Synthesis.tech']) {
      expect(isCompanionOnly(f)).toBe(true);
    }
  });

  it('still treats .instr and .ss instrument files as companions', () => {
    expect(isCompanionOnly('Banjo.instr')).toBe(true);
    expect(isCompanionOnly('AcousticGuitar.ss')).toBe(true);
    expect(isCompanionOnly('MIDIPatch.Instr')).toBe(true); // case-insensitive
  });

  it('does NOT treat real song modules as companions', () => {
    for (const f of ['Dancing on MARS.-=%3ePB.smus', 'song.snx', 'tune.tiny', 'mod.foo']) {
      expect(isCompanionOnly(f)).toBe(false);
    }
  });
});
