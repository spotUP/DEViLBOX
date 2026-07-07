/**
 * Regression: format-mode block-selection transpose. The global transposeSelection command
 * writes the TrackerStore view, which never reaches a format's WASM state; the format editor
 * now transposes note cells through onFormatCellChange using this rule. It must skip empty and
 * note-off/special cells and clamp to the playable range.
 */
import { describe, it, expect } from 'vitest';
import { transposeFormatNote, FORMAT_NOTE_MAX } from '../formatTranspose';

describe('transposeFormatNote', () => {
  it('shifts a playable note by the given semitones', () => {
    expect(transposeFormatNote(60, 1)).toBe(61);
    expect(transposeFormatNote(60, -1)).toBe(59);
    expect(transposeFormatNote(60, 12)).toBe(72);
    expect(transposeFormatNote(60, -12)).toBe(48);
  });

  it('leaves empty cells untouched', () => {
    expect(transposeFormatNote(0, 1)).toBeNull();
    expect(transposeFormatNote(0, -12)).toBeNull();
  });

  it('leaves note-off / special rows (>= 0xBD) untouched', () => {
    expect(transposeFormatNote(0xbd, 1)).toBeNull();
    expect(transposeFormatNote(0xff, -1)).toBeNull();
  });

  it('clamps to the playable range', () => {
    expect(transposeFormatNote(1, -12)).toBeNull(); // already at min → clamp no-op
    expect(transposeFormatNote(2, -12)).toBe(1);
    expect(transposeFormatNote(FORMAT_NOTE_MAX, 12)).toBeNull(); // already at max → clamp no-op
    expect(transposeFormatNote(FORMAT_NOTE_MAX - 5, 12)).toBe(FORMAT_NOTE_MAX);
  });

  it('returns null for a no-op shift', () => {
    expect(transposeFormatNote(60, 0)).toBeNull();
  });
});
