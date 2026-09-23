/**
 * "are you sure the app can't know which layer is active? sounds weird that it
 * shouldn't be able to? gap in our implementation?" (2026-09-24).
 *
 * It was a gap. A control carries a different note on each layer — `echoThrow`
 * is note 32 on Layer A and 72 on Layer B — and the lamps lit both, on the
 * claim that the device never says which layer is showing.
 *
 * The device does say. The LAYER buttons send a PROGRAM CHANGE, which the
 * layout descriptors have recorded all along ("program change, not note") and
 * `MIDIManager` already decodes. Nothing listened.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  noteLayerProgram,
  getActiveLayer,
  resetActiveLayer,
  notesOnActiveLayer,
} from '../xtouchLayer';

beforeEach(resetActiveLayer);

describe('knowing which layer is in front of the performer', () => {
  it('starts out genuinely unknown', () => {
    // Nothing reports the layer at connection time, and guessing 'A' would be
    // wrong for anyone who left the device on B.
    expect(getActiveLayer()).toBeNull();
  });

  it('learns the layer from the program change the LAYER buttons send', () => {
    noteLayerProgram(0);
    expect(getActiveLayer()).toBe('A');
    noteLayerProgram(1);
    expect(getActiveLayer()).toBe('B');
  });

  it('ignores a program change that is not a layer', () => {
    noteLayerProgram(0);
    noteLayerProgram(47);          // some other device, or a preset recall
    expect(getActiveLayer()).toBe('A');
  });
});

describe('which of a control’s notes to light', () => {
  it('lights both while the layer is unknown', () => {
    // A lamp on the layer you cannot see is harmless; a control that looks
    // dead is not.
    expect(notesOnActiveLayer([32, 72])).toEqual([32, 72]);
  });

  it('lights the lower note on Layer A and the higher on Layer B', () => {
    // The second bank is laid out above the first.
    noteLayerProgram(0);
    expect(notesOnActiveLayer([32, 72])).toEqual([32]);
    noteLayerProgram(1);
    expect(notesOnActiveLayer([32, 72])).toEqual([72]);
  });

  it('leaves a control that exists on one layer only alone', () => {
    noteLayerProgram(1);
    expect(notesOnActiveLayer([40])).toEqual([40]);
  });
});
