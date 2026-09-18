import { describe, it, expect } from 'vitest';
import { findCallToAnswer, responseRow } from '../callResponse';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';
import type { ChannelEventSource } from '../musicalEvents';

/** A melodic phrase on channel 1: four onsets, then silence from row 12. */
const PHRASE: ChannelEventSource = {
  channel: 1,
  onsets: [{ row: 0 }, { row: 2 }, { row: 4 }, { row: 6 }],
};

const OPTS = { gapRows: 4, minCallLength: 2, windowRows: 8 };

describe('findCallToAnswer', () => {
  it('finds nothing while the call is still sounding', () => {
    expect(findCallToAnswer([PHRASE], 4, OPTS)).toBeNull();
    expect(findCallToAnswer([PHRASE], 6, OPTS)).toBeNull();
  });

  it('finds nothing inside the gap itself — the call is still decaying', () => {
    expect(findCallToAnswer([PHRASE], 8, OPTS)).toBeNull();
  });

  it('opens a window once the gap has passed', () => {
    const call = findCallToAnswer([PHRASE], 11, OPTS);
    expect(call).not.toBeNull();
    expect(call?.channel).toBe(1);
    expect(call?.callEndRow).toBe(6);
    expect(call?.callLength).toBe(4);
    expect(call?.windowStartRow).toBe(10);
    expect(call?.windowEndRow).toBe(18);
  });

  it('closes the window when the caller starts again', () => {
    const source: ChannelEventSource = {
      channel: 1,
      onsets: [...PHRASE.onsets, { row: 14 }],
    };
    const call = findCallToAnswer([source], 11, OPTS);
    expect(call?.windowEndRow).toBe(14);          // not the full 8 rows
    expect(findCallToAnswer([source], 15, OPTS)).toBeNull();  // caller is back
  });

  it('closes the window after it has run its length', () => {
    expect(findCallToAnswer([PHRASE], 19, OPTS)).toBeNull();
  });

  it('ignores a stray single hit — one note is not a phrase', () => {
    const single: ChannelEventSource = { channel: 2, onsets: [{ row: 0 }] };
    expect(findCallToAnswer([single], 6, OPTS)).toBeNull();
  });

  it('answers whichever voice spoke most recently', () => {
    const early: ChannelEventSource = { channel: 1, onsets: [{ row: 0 }, { row: 2 }] };
    const late: ChannelEventSource = { channel: 3, onsets: [{ row: 8 }, { row: 10 }] };
    const call = findCallToAnswer([early, late], 15, OPTS);
    expect(call?.channel).toBe(3);
  });

  it('does not treat a drum pattern as a phrase awaiting an answer', () => {
    const drums = buildMusicalChannelProfile(
      { channel: 0 },
      { instrumentFamily: 'drums', musicalFunction: 'groove' },
    );
    const source: ChannelEventSource = { ...PHRASE, channel: 0, profile: drums };
    expect(findCallToAnswer([source], 11, OPTS)).toBeNull();
  });

  it('treats a melodic channel as a caller', () => {
    const horn = buildMusicalChannelProfile(
      { channel: 1 },
      { instrumentFamily: 'horn', musicalFunction: 'melody' },
    );
    expect(findCallToAnswer([{ ...PHRASE, profile: horn }], 11, OPTS)?.channel).toBe(1);
  });

  it('follows the grid it is handed rather than assuming one', () => {
    // Twice the gap: the same phrase is not yet answerable at row 11.
    expect(findCallToAnswer([PHRASE], 11, { ...OPTS, gapRows: 8 })).toBeNull();
    expect(findCallToAnswer([PHRASE], 15, { ...OPTS, gapRows: 8 })?.callEndRow).toBe(6);
  });
});

describe('responseRow', () => {
  it('lands inside the window, past its opening', () => {
    const call = findCallToAnswer([PHRASE], 11, OPTS)!;
    const row = responseRow(call);
    expect(row).toBeGreaterThan(call.windowStartRow);
    expect(row).toBeLessThan(call.windowEndRow);
  });

  it('stays clear of the caller returning', () => {
    const source: ChannelEventSource = { channel: 1, onsets: [...PHRASE.onsets, { row: 13 }] };
    const call = findCallToAnswer([source], 11, OPTS)!;
    expect(responseRow(call)).toBeLessThan(13);
  });
});
