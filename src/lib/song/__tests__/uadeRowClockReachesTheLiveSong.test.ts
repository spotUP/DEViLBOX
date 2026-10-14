/**
 * The clock a UADE grid is followed by reaches the song the replayer plays.
 *
 * A parser (Rob Hubbard, Sound Master, ...) or the scan marks its grid as counted in player interrupts
 * (uadePlayerTickGrid) or from a CIA tick (uadeFirstTick); the playhead follow (UADEEngine.subscribeToCoordinator) and the
 * row preview read it from the song. The format store did not keep either, so the live song the replayer plays carried
 * neither and the follow fell back to the first CIA tick it saw - which never moves for an interrupt player - and the row
 * preview could not name a row at all.
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { liveTrackerSong } from '../liveSong';
import { uadeEditableLoadArgs, uadeRowClock } from '@/engine/uade/uadeLoadArgs';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';

describe('the UADE row clock on the live song', () => {
  it('a player-interrupt grid and a scanned CIA grid survive from the parsed song to the live one, and a new song forgets them', () => {
    const store = useFormatStore.getState();
    store.applyEditorMode({ format: 'UADE', uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: 'skateordie.rh', uadePlayerTickGrid: true } as never);
    expect(liveTrackerSong().uadePlayerTickGrid).toBe(true);
    expect(uadeRowClock(liveTrackerSong())).toEqual({ kind: 'player' });

    useFormatStore.getState().applyEditorMode({ format: 'UADE', uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: 'x.mod', uadeFirstTick: 12 } as never);
    expect(liveTrackerSong().uadePlayerTickGrid).toBeUndefined();
    expect(liveTrackerSong().uadeFirstTick).toBe(12);
    expect(uadeRowClock(liveTrackerSong())).toEqual({ kind: 'cia', firstTick: 12 });

    useFormatStore.getState().applyEditorMode({ format: 'UADE', uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: 'y.mod' } as never);
    expect(uadeRowClock(liveTrackerSong())).toEqual({ kind: 'frames' });
  });

  it('UADE is loaded with the song\'s own name, subsong and companions: what loadTune used to read from the store', () => {
    const companions = new Map([['smpl.x', new ArrayBuffer(2)]]);
    useFormatStore.getState().applyEditorMode({
      format: 'UADE', uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: 'mdat.x', uadeCompanionFiles: companions,
      uadeEditableSubsongs: { count: 3, speeds: [6, 6, 6], orders: [[0], [0], [0]], start: 2, first: 1 },
    } as never);
    const live = liveTrackerSong();
    expect(uadeEditableLoadArgs(live)).toEqual(['mdat.x', 3, true, companions]);
    const desc = WASM_ENGINES.find((d) => d.key === 'UADEEditable')!;
    expect(desc.getLoadArgs?.(live)).toEqual(['mdat.x', 3, true, companions]);
    // A song without a name keeps loadTune's own fallback (the format store).
    expect(desc.getLoadArgs?.({ ...live, uadeEditableFileName: undefined })).toEqual([]);
  });
});
