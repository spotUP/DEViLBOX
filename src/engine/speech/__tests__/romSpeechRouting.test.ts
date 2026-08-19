/**
 * romSpeechRouting.test.ts — typed text must stay speakable after a ROM word is picked.
 *
 * Symptom: "my written text dont play now". The Speak button gave a non-zero ROM Speech
 * selection precedence over the text field, so once a recording had been auditioned every
 * later Speak replayed that recording and the text field was dead until the list was put
 * back to "(Text-to-Speech)". Picking a word now auditions it from the list itself, and
 * Speak is only ever about the text.
 */
import { describe, it, expect } from 'vitest';
import { shouldAuditionRomSelection } from '../romSpeechRouting';

const ready = { romReady: true, restored: true };

describe('ROM Speech selection routing', () => {
  it('auditions the word the user just picked', () => {
    expect(shouldAuditionRomSelection({ ...ready, previous: 0, next: 12 })).toBe(true);
    expect(shouldAuditionRomSelection({ ...ready, previous: 12, next: 40 })).toBe(true);
  });

  it('stays silent when the same word is written again', () => {
    expect(shouldAuditionRomSelection({ ...ready, previous: 12, next: 12 })).toBe(false);
  });

  it('stays silent when the list is set back to text-to-speech', () => {
    expect(shouldAuditionRomSelection({ ...ready, previous: 12, next: 0 })).toBe(false);
  });

  it('does not blurt speech while a project is being restored', () => {
    expect(shouldAuditionRomSelection({ romReady: true, restored: false, previous: 0, next: 12 })).toBe(false);
  });

  it('waits until the ROM has reached the WASM side', () => {
    expect(shouldAuditionRomSelection({ romReady: false, restored: true, previous: 0, next: 12 })).toBe(false);
  });
});
