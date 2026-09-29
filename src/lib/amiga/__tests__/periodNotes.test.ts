/**
 * One Amiga naming: ProTracker's. The same period is the same note on every
 * load path, and a note written back gives its period.
 */
import { describe, it, expect } from 'vitest';
import { periodToNote, noteToPeriod, AMIGA_PERIODS } from '../periodNotes';

describe('Amiga period <-> note (ProTracker naming)', () => {
  it('names periods as ProTracker does', () => {
    expect(periodToNote(856)).toBe(13);  // C-1
    expect(periodToNote(428)).toBe(25);  // C-2
    expect(periodToNote(214)).toBe(37);  // C-3
    expect(periodToNote(113)).toBe(48);  // B-3
  });
  it('every table note round-trips', () => {
    AMIGA_PERIODS.forEach((p, i) => {
      expect(periodToNote(p)).toBe(i + 1);
      expect(noteToPeriod(i + 1)).toBe(p);
    });
  });
  it('an off-table period takes the nearest note', () => {
    expect(periodToNote(430)).toBe(25);
    expect(periodToNote(571)).toBe(20);
  });
  it('no period / no note is 0', () => {
    expect(periodToNote(0)).toBe(0);
    expect(noteToPeriod(0)).toBe(0);
    expect(noteToPeriod(97)).toBe(0);
  });
  it('a finetune takes the finetuned table', () => {
    expect(noteToPeriod(25, 0)).toBe(428);
    expect(noteToPeriod(25, 1)).not.toBe(428);
  });
});

import { periodToPtNote } from '../periodNotes';

describe('periodToPtNote (ProTracker three octaves)', () => {
  it('reads within C-1..B-3, clamping outside', () => {
    expect(periodToPtNote(856)).toBe(13);
    expect(periodToPtNote(113)).toBe(48);
    expect(periodToPtNote(1712)).toBe(13);
    expect(periodToPtNote(28)).toBe(48);
    expect(periodToPtNote(0)).toBe(0);
  });
});

import { cellPeriod } from '../periodNotes';

describe('cellPeriod', () => {
  it('keeps a stored period that still names the note (off-table / finetuned)', () => {
    expect(cellPeriod({ note: 25, period: 430 })).toBe(430);
  });
  it('an edited note drops the stale period: the note decides', () => {
    // Imported as C-2 (428), then typed over with C-3.
    expect(cellPeriod({ note: 37, period: 428 })).toBe(214);
  });
  it('a cell without a period plays its note', () => {
    expect(cellPeriod({ note: 13 })).toBe(856);
    expect(cellPeriod({ note: 0, period: 428 })).toBe(0);
  });
});

describe('cellPeriod with a clamped reader', () => {
  it('a period below C-1 read as C-1 by a ProTracker-range parser is kept', () => {
    expect(cellPeriod({ note: 13, period: 900 })).toBe(900);
  });
});
