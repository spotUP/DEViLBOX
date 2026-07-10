// src/lib/maxtrax/__tests__/maxtraxDerive.test.ts
import { describe, it, expect } from 'vitest';
import { deriveGrid } from '@/lib/maxtrax/maxtraxGrid';
import type { MaxTraxScore } from '@/lib/import/formats/maxtrax/maxtraxFormat';

// Two overlapping notes on channel 1 (poly=2 -> two voice columns), one on ch2,
// plus a tempo (global) event. startTime is a DELTA; note stopTime is a DURATION.
const score: MaxTraxScore = { events: [
  { command: 0x3c, data: 0x11, startTime: 0,  stopTime: 48 }, // ch1 C, abs tick 0, ends 48
  { command: 0x40, data: 0x11, startTime: 12, stopTime: 48 }, // ch1 E, abs tick 12 (overlaps), ends 60
  { command: 0x80, data: 0x00, startTime: 12, stopTime: 100 },// tempo, abs tick 24 (global)
  { command: 0x43, data: 0x12, startTime: 0,  stopTime: 24 }, // ch2 G, abs tick 24, ends 48
] };

describe('deriveGrid', () => {
  const g = deriveGrid(score, 24);

  it('allocates one voice column per channel plus extra for overlap', () => {
    // ch1 needs 2 voices (overlap), ch2 needs 1 -> 3 columns total.
    expect(g.columns.length).toBe(3);
    expect(g.columns.filter(c => c.channel === 1).length).toBe(2);
    expect(g.columns.filter(c => c.channel === 2).length).toBe(1);
  });

  it('places note-on at floor(absTick/TPR) with the tick remainder as offset', () => {
    const eCell = g.noteCells.find(c => c.eventIndex === 1 && c.kind === 'noteOn')!;
    expect(eCell.row).toBe(0);      // abs tick 12 -> row 0
    expect(eCell.offset).toBe(12);  // 12 % 24
    expect(eCell.pitch).toBe(0x40);
    expect(eCell.velocity).toBe(1); // data 0x11 hi-nibble
    expect(eCell.channel).toBe(1);
  });

  it('derives a note-off cell at (absTick+duration) in the same column', () => {
    const on = g.noteCells.find(c => c.eventIndex === 1 && c.kind === 'noteOn')!;
    const off = g.noteCells.find(c => c.eventIndex === 1 && c.kind === 'noteOff')!;
    expect(off.column).toBe(on.column);
    expect(off.row).toBe(Math.floor((12 + 48) / 24)); // abs 60 -> row 2
    expect(off.offset).toBe((12 + 48) % 24);           // 12
  });

  it('routes tempo (no channel) to a global effect cell', () => {
    const fx = g.effectCells.find(c => c.eventIndex === 2)!;
    expect(fx.channel).toBe('global');
    expect(fx.command).toBe(0x80);
    expect(fx.row).toBe(1); // abs tick 24 -> row 1
  });
});
