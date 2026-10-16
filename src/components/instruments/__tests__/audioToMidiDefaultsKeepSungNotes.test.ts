import { describe, it, expect, vi } from 'vitest';

// The modal module imports the TF.js model loader; detection here needs only
// the model OUTPUT, so the loader is stubbed.
vi.mock('../../../lib/voice/basicPitchModel', () => ({
  evaluateBuffer: vi.fn(),
  resampleToMono22050: vi.fn(),
}));

import { DEFAULT_SETTINGS } from '../AudioToMidiModal';
import { modelOutputToNotes } from '../../../lib/voice/pitchNotes';
import { sungTakeModelOutput, SUNG_TAKE_PITCHES } from '../../../lib/voice/__tests__/sungTakeFixture';

describe('Audio to MIDI default detection settings', () => {
  it('keep every note of a sung take, as the modal runs detection (polyphonic)', () => {
    // The modal's own 0.55 / 0.45 defaults returned none of these notes.
    const notes = modelOutputToNotes(sungTakeModelOutput(), DEFAULT_SETTINGS, false);
    expect(notes.map((n) => n.pitchMidi).sort((a, b) => b - a)).toEqual(SUNG_TAKE_PITCHES);
  });
});
