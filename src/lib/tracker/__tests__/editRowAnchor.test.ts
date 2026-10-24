import { describe, it, expect } from 'vitest';
import { editRowTop } from '../editRowAnchor';

const ROW_H = 24;
const centred = (h: number, rowH: number) => Math.floor(h / 2) - rowH / 2;

describe('editRowTop', () => {
  it('equals the centred formula when the reference height is the height', () => {
    for (const h of [100, 301, 600, 1079]) {
      expect(editRowTop(h, ROW_H)).toBe(centred(h, ROW_H));
      expect(editRowTop(h, ROW_H, h)).toBe(centred(h, ROW_H));
    }
  });

  it('keeps the deck-closed position while the deck leaves the row on screen', () => {
    // 600 px grid, deck takes 200: the row stays where 600 put it.
    expect(editRowTop(400, ROW_H, 600)).toBe(centred(600, ROW_H));
  });

  it('pins the row to the bottom edge once the deck reaches it', () => {
    expect(editRowTop(200, ROW_H, 600)).toBe(200 - ROW_H);
    expect(editRowTop(60, ROW_H, 1000)).toBe(60 - ROW_H);
  });
});
