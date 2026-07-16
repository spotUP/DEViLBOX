/**
 * Regression: native SunTronic playback went silent (~3s of UADE, then dead)
 * because `sunTronicSongFileData` was stripped on the way to the engine.
 *
 * The parser attaches `sunTronicSongFileData` (+ `sunTronicCompanionPcm`) to the
 * imported song when the SunTronic engine pref is 'native'. But the song is
 * round-tripped through `useFormatStore` before `usePatternPlayback` rebuilds
 * the engine song — and `useFormatStore.applyEditorMode` only copies an explicit
 * per-field allowlist. The field had no slot, so it was dropped: the engine's
 * `song.sunTronicSongFileData` came back `undefined`, `shouldActivate` returned
 * false for the SunTronicSong descriptor, and the generic UADE-editable wildcard
 * (which shares the same song) claimed audio instead — dying ~3s in.
 *
 * This test asserts `applyEditorMode` preserves BOTH SunTronic fields (and that
 * the reset path clears them). Reverting the useFormatStore wiring leaves the
 * store slots at null → this fails.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '../useFormatStore';

function makeSong(overrides: Record<string, unknown> = {}): any {
  return {
    format: 'MOD',
    editorMode: 'classic',
    linearPeriods: false,
    instruments: [],
    ...overrides,
  };
}

describe('useFormatStore — SunTronic native-engine field wiring', () => {
  beforeEach(() => {
    // Clear any residue from a prior test's applyEditorMode.
    useFormatStore.getState().applyEditorMode(makeSong());
  });

  it('applyEditorMode preserves sunTronicSongFileData and sunTronicCompanionPcm', () => {
    const moduleBytes = new ArrayBuffer(7616);
    const companions = [
      { name: 'instr/Sax.x', data: new Uint8Array([1, 2, 3]) },
      { name: 'instr/Bass.x', data: new ArrayBuffer(4) },
    ];

    useFormatStore.getState().applyEditorMode(
      makeSong({ sunTronicSongFileData: moduleBytes, sunTronicCompanionPcm: companions }),
    );

    const s = useFormatStore.getState();
    expect(s.sunTronicSongFileData, 'module bytes must survive the store').toBe(moduleBytes);
    expect(s.sunTronicCompanionPcm, 'companion PCM must survive the store').toBe(companions);
  });

  it('default store state exposes the SunTronic slots (null, not undefined)', () => {
    // Undefined would mean the interface field is missing entirely — the exact
    // shape that let the field silently vanish.
    useFormatStore.getState().applyEditorMode(makeSong());
    const s = useFormatStore.getState();
    expect(s.sunTronicSongFileData).toBeNull();
    expect(s.sunTronicCompanionPcm).toBeNull();
  });
});
