/**
 * The subsong model and the one subsong switch.
 *
 * Whole-song engines (game-music-emu, ASAP, PSG play) had no subsong control
 * and the scope view could not leave the track it opened on; the FT2 toolbar
 * had no previous / next subsong for any format (owner, 2026-10-05).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  nextSubsong, previousSubsong, subsongLabel, subsongStartField, normalizeSubsongs,
} from '@/lib/tracker/nativeSubsongs';
import { subsongStatus, stepTarget, switchSubsong } from '@/lib/tracker/subsongSwitch';
import { useFormatStore } from '@stores/useFormatStore';
import { useTransportStore } from '@stores/useTransportStore';

describe('the whole-song subsong model', () => {
  it('steps inside the file and stops at either end', () => {
    const s = normalizeSubsongs('Gme', 3, 1);
    expect(nextSubsong(s)).toBe(2);
    expect(previousSubsong(s)).toBe(0);
    expect(nextSubsong({ ...s, current: 2 })).toBeNull(); // last: the song ends
    expect(previousSubsong({ ...s, current: 0 })).toBeNull();
    expect(nextSubsong(null)).toBeNull();
  });

  it('keeps an engine report inside the file', () => {
    expect(normalizeSubsongs('Asap', 0, 5)).toEqual({ engine: 'Asap', count: 1, current: 0, names: [''] });
    expect(normalizeSubsongs('Gme', 4, 9, ['a']).current).toBe(3);
    expect(normalizeSubsongs('Gme', 2, 0, ['Title', 'Ending']).names).toEqual(['Title', 'Ending']);
  });

  it('names a subsong by its file name where it has one', () => {
    const s = normalizeSubsongs('Gme', 2, 0, ['Title', '  ']);
    expect(subsongLabel(s, 0)).toBe('1. Title');
    expect(subsongLabel(s, 1)).toBe('Subsong 2');
  });

  it("writes the engine's own start field, in the engine's counting", () => {
    expect(subsongStartField(normalizeSubsongs('Gme', 5, 3))).toEqual({ gmeTrack: 3 });
    expect(subsongStartField(normalizeSubsongs('Psgplay', 5, 3))).toEqual({ sndhSubtune: 4 }); // PSG play counts from 1
    expect(subsongStartField(normalizeSubsongs('Asap', 5, 3))).toEqual({ asapSong: 3 });
  });

  it('the store keeps the report and the start field follows it', () => {
    useFormatStore.getState().reportNativeSubsongs(normalizeSubsongs('Gme', 64, 40));
    expect(useFormatStore.getState().nativeSubsongs).toMatchObject({ engine: 'Gme', count: 64, current: 40 });
    expect(useFormatStore.getState().gmeTrack).toBe(40);
  });
});

describe('the one subsong switch', () => {
  const none = {
    furnaceSubsongs: null, furnaceActiveSubsong: 0, uadeEditableSubsongs: null, uadeEditableCurrentSubsong: 0,
    sidMetadata: null, activisionProSubsongCount: 0, activisionProCurrentSubsong: 0, nativeSubsongs: null,
  };

  beforeEach(() => { useFormatStore.setState(none); });

  it('finds the subsongs of every format that has them', () => {
    expect(subsongStatus(none)).toBeNull();
    expect(subsongStatus({ ...none, uadeEditableSubsongs: { count: 4, speeds: [] }, uadeEditableCurrentSubsong: 2 }))
      .toEqual({ source: 'uade', count: 4, current: 2 });
    expect(subsongStatus({ ...none, activisionProSubsongCount: 3, activisionProCurrentSubsong: 1 }))
      .toEqual({ source: 'activisionPro', count: 3, current: 1 });
    expect(subsongStatus({ ...none, nativeSubsongs: normalizeSubsongs('Psgplay', 7, 6) }))
      .toEqual({ source: 'native', count: 7, current: 6 });
  });

  it('previous and next stay inside the song', () => {
    const s = { source: 'native' as const, count: 3, current: 0 };
    expect(stepTarget(s, -1)).toBeNull();
    expect(stepTarget(s, 1)).toBe(1);
    expect(stepTarget({ ...s, current: 2 }, 1)).toBeNull();
    expect(stepTarget(null, 1)).toBeNull();
  });

  it('a whole-song subsong picked while stopped is where play starts', async () => {
    useTransportStore.setState({ isPlaying: false } as never);
    useFormatStore.getState().reportNativeSubsongs(normalizeSubsongs('Psgplay', 5, 0));
    await switchSubsong(3);
    expect(useFormatStore.getState().nativeSubsongs?.current).toBe(3);
    expect(useFormatStore.getState().sndhSubtune).toBe(4);
    await switchSubsong(9); // out of range: nothing moves
    expect(useFormatStore.getState().nativeSubsongs?.current).toBe(3);
  });
});
