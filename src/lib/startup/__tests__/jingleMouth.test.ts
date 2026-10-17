/**
 * Startup jingle: the pattern grid is a pair of lips saying "DEViLBOX ready".
 * Owner asks (2026-10-17): lips shaped by visemes and the live level; cursor
 * on row 8 so the editor centres the mouth; lips shut when silent; grid and
 * cursor restored when the jingle ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let level = 200;
const analyser = {
  frequencyBinCount: 128,
  fftSize: 256,
  getByteFrequencyData: (b: Uint8Array) => { b.fill(level); },
  getByteTimeDomainData: (b: Uint8Array) => { b.fill(128 + level / 4); },
};
vi.mock('@engine/jingle/JingleEngine', () => ({ getJingleEngine: () => ({ getAnalyser: () => analyser }), AUDIBLE_FLOOR_DB: -40 }));
// The jingle plays before the audio engine exists: parking the cursor must not build the replayer.
vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('AudioBuffer is not defined'); },
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  injectMouthPatterns,
  teardownMouthPatterns,
  JINGLE_CHANNEL_COUNT,
  JINGLE_VISEMES,
  MOUTH_CENTER_ROW,
  lipProfile,
  visemeAt,
} from '@engine/jingle/JinglePatterns';

const MIDDLE = Math.floor(JINGLE_CHANNEL_COUNT / 2);
const LAST = JINGLE_CHANNEL_COUNT - 1;
import { AUDIBLE_FLOOR_DB } from '@engine/jingle/JingleEngine';

const litRowsOf = (channel: number) =>
  useTrackerStore.getState().patterns[0]!.channels[channel]!.rows
    .map((r, i) => (r.note !== 0 ? i : -1))
    .filter((i) => i >= 0);
const litRows = () => litRowsOf(0).length;
/** How many channels have at least one lit cell (every lip channel while a vowel sounds). */
const litColumns = () =>
  useTrackerStore.getState().patterns[0]!.channels.filter((ch) => ch.rows.some((r) => r.note !== 0)).length;
const cursorRow = () => useCursorStore.getState().cursor.rowIndex;

describe('startup jingle: the pattern grid animates from the jingle analyser', () => {
  beforeEach(() => {
    level = 200;
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => { teardownMouthPatterns(); useEditorStore.getState().setActiveBehavior('fasttracker2'); vi.useRealTimers(); });

  it('lights pattern rows while the jingle plays and restores the grid at the end', () => {
    const before = litRows();
    injectMouthPatterns();
    expect(useTrackerStore.getState().patterns[0]!.channels.length).toBeGreaterThanOrEqual(JINGLE_CHANNEL_COUNT);
    vi.advanceTimersByTime(300);
    expect(litRows()).toBeGreaterThan(before); // driver ran and wrote cells (sentinel)
    teardownMouthPatterns();
    expect(litRows()).toBe(before);
  });

  it('shows all 12 lip channels under the ProTracker scheme, whose 4-channel cap stops user edits', () => {
    useEditorStore.getState().setActiveBehavior('protracker');
    injectMouthPatterns();
    const names = useTrackerStore.getState().patterns[0]!.channels.map(ch => ch.name);
    expect(names.length).toBe(JINGLE_CHANNEL_COUNT);
    expect(names[0]).toBe('Left');
    expect(names[LAST]).toBe('Right');
    vi.advanceTimersByTime(900);
    expect(litColumns()).toBe(JINGLE_CHANNEL_COUNT); // every lip channel lit, not only the first 4
    teardownMouthPatterns();
    teardownMouthPatterns(); // onended and the stop path both call it: a second call must not strip channels
    expect(useTrackerStore.getState().patterns[0]!.channels.length).toBe(4);
  });

  it('forces fit-all-channels on while the lips show (no scrollbar) and puts the setting back', () => {
    useSettingsStore.getState().setFitAllChannelsTracker(false);
    injectMouthPatterns();
    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(true);
    teardownMouthPatterns();
    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(false);
    useSettingsStore.getState().setFitAllChannelsTracker(true);
  });

  it('parks the cursor on row 8 while the jingle plays and puts it back at the end (JMA-1)', () => {
    useCursorStore.getState().moveCursorToRow(3);
    injectMouthPatterns();
    expect(cursorRow()).toBe(MOUTH_CENTER_ROW);
    vi.advanceTimersByTime(300);
    expect(cursorRow()).toBe(MOUTH_CENTER_ROW);
    teardownMouthPatterns();
    expect(cursorRow()).toBe(3);
  });

  it('draws two lips around row 8 that open with the viseme, corners stay shut (JMA-2)', () => {
    injectMouthPatterns();
    // 3.5 s into the jingle is the A of READY: the widest viseme.
    vi.advanceTimersByTime(3500);
    expect(visemeAt(3.5).open).toBe(1);
    const lips = litRowsOf(MIDDLE);
    expect(lips).toHaveLength(2);
    const [upper, lower] = lips as [number, number];
    expect(MOUTH_CENTER_ROW - upper).toBe(lower - MOUTH_CENTER_ROW); // symmetric around row 8
    expect(MOUTH_CENTER_ROW - upper).toBeGreaterThanOrEqual(4);
    // The lip curve: every channel towards a corner opens no more than its inner neighbour,
    // and the channel next to the corner opens less than the middle.
    for (let ch = MIDDLE; ch > 1; ch--) {
      expect(litRowsOf(ch - 1)[0]!).toBeGreaterThanOrEqual(litRowsOf(ch)[0]!);
    }
    expect(litRowsOf(1)[0]!).toBeGreaterThan(upper);
    expect(litRowsOf(0)).toEqual([MOUTH_CENTER_ROW]);
    expect(litRowsOf(LAST)).toEqual([MOUTH_CENTER_ROW]);
  });

  it('closes the lips on the B of BOX even at full level (JMA-2)', () => {
    injectMouthPatterns();
    vi.advanceTimersByTime(2050);
    expect(visemeAt(2.05).label).toBe('B');
    for (let ch = 0; ch < JINGLE_CHANNEL_COUNT; ch++) expect(litRowsOf(ch)).toEqual([MOUTH_CENTER_ROW]);
  });

  it('shuts the lips while the signal is silent, even mid-syllable (JMA-3)', () => {
    injectMouthPatterns();
    vi.advanceTimersByTime(3500);
    expect(litRowsOf(MIDDLE)).toHaveLength(2);
    level = 0; // analyser reads 128 = digital silence
    vi.advanceTimersByTime(100);
    for (let ch = 0; ch < JINGLE_CHANNEL_COUNT; ch++) expect(litRowsOf(ch)).toEqual([MOUTH_CENTER_ROW]);
  });

  it('lip curve is 0 at the corners, 1 in the middle, flatter for a wide viseme', () => {
    expect(JINGLE_CHANNEL_COUNT).toBeGreaterThanOrEqual(12); // high-resolution mouth
    expect(lipProfile(0, 1)).toBe(0);
    expect(lipProfile(LAST, 0)).toBe(0);
    expect(lipProfile(MIDDLE, 0.5)).toBeGreaterThan(0.95);
    expect(lipProfile(1, 1)).toBeGreaterThan(lipProfile(1, 0)); // EE opens the edges more than O
    expect(lipProfile(2, 0.5)).toBeGreaterThan(lipProfile(1, 0.5));
  });

  it('viseme table is contiguous from 0 to the audible end measured at -40 dBFS', () => {
    expect(AUDIBLE_FLOOR_DB).toBe(-40);
    expect(JINGLE_VISEMES[0]!.start).toBe(0);
    for (let i = 1; i < JINGLE_VISEMES.length; i++) {
      expect(JINGLE_VISEMES[i]!.start).toBe(JINGLE_VISEMES[i - 1]!.end);
    }
    expect(JINGLE_VISEMES[JINGLE_VISEMES.length - 1]!.end).toBeCloseTo(6.09, 2);
    expect(visemeAt(99).open).toBe(0); // after the table: shut
  });
});
