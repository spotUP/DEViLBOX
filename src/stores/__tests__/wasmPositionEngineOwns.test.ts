/**
 * An engine that reports its own playback position owns the editor's
 * position; the tracker scheduler's guess does not overwrite it.
 *
 * Both wrote useWasmPositionStore for engine-played songs: the engine at its
 * real speed, the scheduler at the song's nominal tempo. On
 * ghostbattle_gameover.hip7 they alternated (engine row 31 at 2.0 s,
 * scheduler row 23), and the pattern editor jumped between rows and patterns.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useWasmPositionStore } from '../useWasmPositionStore';

const frame = () => new Promise((r) => setTimeout(r, 40));

describe('the playback position', () => {
  beforeEach(() => useWasmPositionStore.getState().clear());

  it('follows the scheduler while no engine reports', async () => {
    useWasmPositionStore.getState().setSchedulerPosition(7, 2);
    await frame();
    expect(useWasmPositionStore.getState()).toMatchObject({ active: true, row: 7, songPos: 2 });
  });

  it('stays with the engine once it reports, until cleared', async () => {
    const s = useWasmPositionStore.getState();
    s.setPosition(31, 0);
    s.setSchedulerPosition(23, 0);
    await frame();
    expect(useWasmPositionStore.getState().row).toBe(31);

    s.setSchedulerPosition(24, 0);
    await frame();
    expect(useWasmPositionStore.getState().row).toBe(31);

    s.clear();
    s.setSchedulerPosition(5, 1);
    await frame();
    expect(useWasmPositionStore.getState()).toMatchObject({ row: 5, songPos: 1 });
  });
});
