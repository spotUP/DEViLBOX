/**
 * NS-1 the Nuade registry descriptor and NS-2 the song / format-store fields.
 * Which engine plays, where it sits in the order, what it is loaded with, and how an edit reaches it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WASM_ENGINES, shouldActivate } from '../replayer/wasmEngineRegistry';
import { playingEngineFor } from '../replayer/NativeEngineRouting';
import { liveEditRoute } from '../replayer/liveCellEdits';
import { recordNuadePlayerCaps, resetNuadePlayerCaps } from '../nuade/nuadeEditPort';
import { NuadeCap } from '../nuade/nuadeProtocol';
import { FILE_DATA_FIELDS } from '../formatFileDataFields';
import { useFormatStore } from '@stores/useFormatStore';
import { liveTrackerSong } from '@/lib/song/liveSong';
import { normalizeSubsongs, subsongStartField } from '@/lib/tracker/nativeSubsongs';
import { getNativeEngineDataForExport, getNativeEngineMetaForExport } from '@/lib/export/exporters';
import type { TrackerSong } from '../TrackerReplayer';

const nuadeSong = (extra: Record<string, unknown> = {}): TrackerSong => ({
  format: 'MOD', name: 'x', instruments: [], patterns: [], songPositions: [],
  nuadeFileData: new Uint8Array([1, 2, 3, 4]).buffer, nuadePlayerId: 'mmdc', nuadeFileName: 'a.mmdc', nuadeSubsong: 2,
  uadeCompanionFiles: new Map([['smp.a', new ArrayBuffer(1)]]),
  ...extra,
} as unknown as TrackerSong);

describe('NS-1 Nuade descriptor', () => {
  it('sits after EaglePlayer and ahead of UADEEditable, and plays any song that carries nuadeFileData', () => {
    const keys = WASM_ENGINES.map((d) => d.key);
    expect(keys.indexOf('Nuade')).toBe(keys.indexOf('EaglePlayer') + 1);
    expect(keys.indexOf('Nuade')).toBeLessThan(keys.indexOf('UADEEditable'));
    expect(playingEngineFor(nuadeSong())).toBe('Nuade');
    // Both nuade and UADE data on the song: nuade plays.
    expect(playingEngineFor(nuadeSong({ uadeEditableFileData: new ArrayBuffer(4) }))).toBe('Nuade');
    // EaglePlayer comes first, as the plan orders them.
    expect(playingEngineFor(nuadeSong({ eaglePlayerFileData: new ArrayBuffer(4) }))).toBe('EaglePlayer');
  });

  it('loads with the player id, file name, subsong and companion files, and follows via the table', () => {
    const d = WASM_ENGINES.find((e) => e.key === 'Nuade')!;
    const s = nuadeSong();
    expect(d.getLoadArgs!(s)).toEqual(['mmdc', 'a.mmdc', 2, s.uadeCompanionFiles]);
    expect(d).toMatchObject({ synthType: 'NuadeSynth', fileDataKey: 'nuadeFileData', loadMethod: 'loadTune', supportsPause: true, supportsResume: true, needsDirectRouting: true, liveSwap: true, suppressNotes: true });
    expect(shouldActivate(d, s)).toBe(true);
  });

  it('routes grid edits by swapping the module in, and into the player\'s cells only for a player whose caps say CELL_WRITE', () => {
    resetNuadePlayerCaps();
    recordNuadePlayerCaps('mmdc', NuadeCap.StateRead);       // what the real WASM reports
    expect(liveEditRoute(nuadeSong())).toEqual({ route: 'engine-swap', engine: 'Nuade' });
    recordNuadePlayerCaps('mmdc', NuadeCap.StateRead | NuadeCap.CellWrite);   // faked: the future write API
    expect(liveEditRoute(nuadeSong())).toEqual({ route: 'grid-cell', engine: 'Nuade' });
    expect(liveEditRoute(nuadeSong({ nuadePlayerId: 'robhubbard' }))).toEqual({ route: 'engine-swap', engine: 'Nuade' });
    resetNuadePlayerCaps();
  });
});

describe('NS-2 song, format store and persistence fields', () => {
  beforeEach(() => { useFormatStore.getState().applyEditorMode({ format: 'MOD' } as unknown as TrackerSong); });

  it('nuadeFileData is a persisted file-data field, and the format store carries all four fields through a song round trip', () => {
    expect(FILE_DATA_FIELDS).toContain('nuadeFileData');
    useFormatStore.getState().applyEditorMode(nuadeSong());
    const st = useFormatStore.getState();
    expect([st.nuadePlayerId, st.nuadeFileName, st.nuadeSubsong, st.nuadeFileData?.byteLength]).toEqual(['mmdc', 'a.mmdc', 2, 4]);
    const back = liveTrackerSong();
    expect([back.nuadePlayerId, back.nuadeFileName, back.nuadeSubsong]).toEqual(['mmdc', 'a.mmdc', 2]);
    expect(playingEngineFor(back)).toBe('Nuade');
    // The next song without nuade data clears them.
    useFormatStore.getState().applyEditorMode({ format: 'MOD' } as unknown as TrackerSong);
    expect(useFormatStore.getState().nuadeFileData).toBeNull();
    expect(useFormatStore.getState().nuadePlayerId).toBeNull();
  });

  it('a saved project carries the module bytes and the player id', () => {
    useFormatStore.getState().applyEditorMode(nuadeSong());
    expect(Object.keys(getNativeEngineDataForExport() ?? {})).toContain('nuadeFileData');
    expect(getNativeEngineMetaForExport()).toMatchObject({ nuadePlayerId: 'mmdc', nuadeFileName: 'a.mmdc' });
  });

  it('reports nuade subsongs to the one subsong model, with nuadeSubsong as the start field', () => {
    const s = normalizeSubsongs('Nuade', 5, 3);
    expect(s).toMatchObject({ engine: 'Nuade', count: 5, current: 3 });
    expect(subsongStartField(s)).toEqual({ nuadeSubsong: 3 });
  });
});
