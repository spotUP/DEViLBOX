import { describe, it, expect, beforeEach } from 'vitest';
import { rewindPlayhead, reloadResumePoint } from '../playhead';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useFormatStore } from '@stores/useFormatStore';
import { switchSubsong } from '../subsongSwitch';
import { readFileSync } from 'node:fs';

describe('a subsong switch plays the new tune from its start', () => {
  beforeEach(() => {
    reloadResumePoint(0, 0); // drop any pending rewind
  });

  it('puts the stores at song position 0, row 0 after the old tune had played on', () => {
    useTrackerStore.getState().setCurrentPosition(7);
    useTransportStore.getState().setCurrentRow(33);
    rewindPlayhead();
    expect(useTrackerStore.getState().currentPositionIndex).toBe(0);
    expect(useTransportStore.getState().currentRow).toBe(0);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(0);
  });

  it('makes the playback reload resume at the start instead of the old tune position, once', () => {
    rewindPlayhead();
    expect(reloadResumePoint(21, 15)).toEqual({ songPos: 0, row: 0 });
    expect(reloadResumePoint(21, 15)).toEqual({ songPos: 21, row: 15 });
  });

  it('keeps the position across an ordinary structural reload', () => {
    expect(reloadResumePoint(21, 15)).toEqual({ songPos: 21, row: 15 });
  });

  it('switchSubsong (a native engine subsong, stopped) leaves the playhead at the start and asks the reload to start there', async () => {
    useFormatStore.getState().reportNativeSubsongs({ engine: 'Nuade', count: 3, current: 0 } as never);
    useTrackerStore.getState().setCurrentPosition(7);
    useTransportStore.getState().setCurrentRow(33);
    await switchSubsong(1);
    expect(useTrackerStore.getState().currentPositionIndex).toBe(0);
    expect(useTransportStore.getState().currentRow).toBe(0);
    expect(reloadResumePoint(21, 15)).toEqual({ songPos: 0, row: 0 });
  });

  it('the playback reload resumes through reloadResumePoint', () => {
    const src = readFileSync('src/hooks/audio/usePatternPlayback.ts', 'utf8');
    expect(src).toContain('reloadResumePoint(currentSongPos, currentRow)');
  });
});
