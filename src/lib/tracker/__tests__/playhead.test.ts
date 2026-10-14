import { describe, it, expect } from 'vitest';
import { rewindPlayhead, resumePointAfterReload, tuneIdentity } from '../playhead';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useFormatStore } from '@stores/useFormatStore';
import { switchSubsong } from '../subsongSwitch';
import { readFileSync } from 'node:fs';

describe('a subsong switch plays the new tune from its start', () => {
  it('puts the stores at song position 0, row 0 after the old tune had played on', () => {
    useTrackerStore.getState().setCurrentPosition(7);
    useTransportStore.getState().setCurrentRow(33);
    rewindPlayhead();
    expect(useTrackerStore.getState().currentPositionIndex).toBe(0);
    expect(useTransportStore.getState().currentRow).toBe(0);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(0);
  });

  it('a reload onto another tune resumes at the start, not at the old tune position', () => {
    expect(resumePointAfterReload('native:0', 'native:1', 21, 15)).toEqual({ songPos: 0, row: 0 });
  });

  it('a reload of the same tune (an edit) keeps the position, also 1 s after a switch', () => {
    rewindPlayhead();
    expect(resumePointAfterReload('native:1', 'native:1', 21, 15)).toEqual({ songPos: 21, row: 15 });
  });

  it('a song without subsongs keeps the position across a reload', () => {
    expect(resumePointAfterReload(null, null, 21, 15)).toEqual({ songPos: 21, row: 15 });
  });

  it('switchSubsong (a native engine subsong, stopped) leaves the playhead at the start and the loaded tune identity moves to the new subsong', async () => {
    useFormatStore.getState().reportNativeSubsongs({ engine: 'Nuade', count: 3, current: 0 } as never);
    useTrackerStore.getState().setCurrentPosition(7);
    useTransportStore.getState().setCurrentRow(33);
    await switchSubsong(1);
    expect(useTrackerStore.getState().currentPositionIndex).toBe(0);
    expect(useTransportStore.getState().currentRow).toBe(0);
    expect(tuneIdentity(useFormatStore.getState())).toBe('native:1');
  });

  it('the playback reload resumes through resumePointAfterReload', () => {
    const src = readFileSync('src/hooks/audio/usePatternPlayback.ts', 'utf8');
    expect(src).toContain('resumePointAfterReload(prevTune');
  });
});
