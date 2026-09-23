import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecordSpinning, resolveVinylLevel, VINYL_SPIN_HOLD_MS } from '../vinylLevel';

/**
 * "the vinyl noise keep playing when i stop the song" (2026-09-23).
 *
 * The vinyl chain is post-master and makes its own surface noise, so nothing
 * upstream stops it. A stopped record makes no noise: the record turns while
 * the transport runs, and for a short hold after programme was last heard
 * (the DJ decks and the pads have no tracker transport).
 */
describe('isRecordSpinning', () => {
  it('turns while the transport plays, whatever the programme is doing', () => {
    expect(isRecordSpinning(true, Infinity)).toBe(true);
    expect(isRecordSpinning(true, 0)).toBe(true);
  });

  it('keeps turning through the hold after the programme goes quiet', () => {
    expect(isRecordSpinning(false, 0)).toBe(true);
    expect(isRecordSpinning(false, VINYL_SPIN_HOLD_MS - 1)).toBe(true);
  });

  it('stops once the transport is off and the hold has passed — the reported case', () => {
    expect(isRecordSpinning(false, VINYL_SPIN_HOLD_MS)).toBe(false);
    expect(isRecordSpinning(false, 60_000)).toBe(false);
  });

  it('is stopped when no programme was ever heard', () => {
    expect(isRecordSpinning(false, Infinity)).toBe(false);
    expect(isRecordSpinning(false, NaN)).toBe(false);
  });
});

describe('resolveVinylLevel with the record stopped', () => {
  it('resolves to silence while the record is not turning, keeping the user level for later', () => {
    expect(resolveVinylLevel(true, 7, false)).toBe(0);
    expect(resolveVinylLevel(true, 7, true)).toBe(7);
  });

  it('a stopped bus is still silence regardless', () => {
    expect(resolveVinylLevel(false, 7, true)).toBe(0);
  });
});

describe('the bus feeds the rule from its trim watch', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/engine/dub/DubBus.ts'), 'utf-8');

  it('re-resolves the vinyl level from the spinning flag', () => {
    expect(SRC).toContain('resolveVinylLevel(this.enabled, this._desiredVinylLevel, this._vinylSpinning)');
  });

  it('asks every watch tick, from the transport and the programme', () => {
    const watch = SRC.slice(SRC.indexOf('private _startTrimWatch(): void {'), SRC.indexOf('private _stopTrimWatch(): void {'));
    expect(watch).toContain('this._watchRecordSpinning(programme, Date.now());');
    const rule = SRC.slice(SRC.indexOf('private _watchRecordSpinning('), SRC.indexOf('private _returnRms(): number {'));
    expect(rule).toContain('useTransportStore.getState().isPlaying');
    expect(rule).toContain('programme.rms > VINYL_PROGRAMME_FLOOR_RMS');
  });
});
