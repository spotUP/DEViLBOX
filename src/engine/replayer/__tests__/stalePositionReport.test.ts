/**
 * An AmigaKlang .mod played with an empty, frozen pattern editor: the AHX song
 * loaded before it had played on the Hively engine, whose position callback
 * outlived the song. After stopNativeEngines() cleared the position store, a
 * late report from the stopped engine marked it active again, and the editor
 * followed that frozen position (row 8 of pattern 0) through the next songs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { reportEnginePosition, clearRunningEngineKeys } from '../NativeEngineRouting';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';

describe('engine position reports', () => {
  beforeEach(() => {
    clearRunningEngineKeys();
    useWasmPositionStore.getState().clear();
  });

  it('ignores a report from an engine that is no longer playing (the editor does not freeze)', async () => {
    reportEnginePosition('Hively', 8, 0);
    // Store writes are coalesced to the next animation frame.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const s = useWasmPositionStore.getState();
    expect(s.active).toBe(false);
    expect(s.row).toBe(0);
  });
});
