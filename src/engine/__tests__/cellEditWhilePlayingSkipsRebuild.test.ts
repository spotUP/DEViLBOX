/**
 * Editing a cell while a libopenmpt song plays writes the cell into the
 * running modules instead of rebuilding them (the rebuild stalled the audio
 * thread on every keystroke).
 *
 * Driven through the real tracker store action, the real bridge and the real
 * soundlib wasm; only the audio engine is a recorder. The recorder is the
 * sentinel: the edit must arrive as one applyEdits cell op, and the debounced
 * serialize must refresh the stored bytes (updateBuffer), never hotReload.
 * A sample edit is not an in-place op and must still rebuild (hotReload).
 * Fails on revert: the bridge then sends hotReload and never applyEdits.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_CELL, type TrackerCell } from '@/types/tracker';

const ROOT = resolve(__dirname, '../../..');

const engine = vi.hoisted(() => ({
  applyEdits: [] as number[][],
  hotReload: 0,
  updateBuffer: 0,
}));

vi.mock('@engine/libopenmpt/LibopenmptEngine', () => {
  const instance = {
    applyEdits: (ops: Int32Array) => { engine.applyEdits.push(Array.from(ops)); },
    hotReload: () => { engine.hotReload++; },
    updateBuffer: () => { engine.updateBuffer++; },
  };
  return { LibopenmptEngine: { hasInstance: () => true, getInstance: () => instance } };
});

const cell = (over: Partial<TrackerCell> = {}): TrackerCell => ({ ...EMPTY_CELL, ...over });

describe('a cell edit while playing', () => {
  beforeAll(() => {
    const wasmBinary = readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.wasm'));
    (0, eval)(readFileSync(resolve(ROOT, 'public/openmpt/OpenMPTSoundlib.js'), 'utf8') + '\n;globalThis.__osl = createOpenMPTSoundlib;');
    const real = (globalThis as unknown as { __osl: (o: object) => Promise<unknown> }).__osl;
    (globalThis as unknown as Record<string, unknown>).createOpenMPTSoundlib = (o: object) => real({ ...o, wasmBinary });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
  });

  it('reaches the playing modules as a cell op and does not rebuild them', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => cell());
    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    const built = await bridge.createModuleForSong({
      numChannels: 2,
      patterns: [{ length: 16, channels: [{ rows: rows(16) }, { rows: rows(16) }] }],
      songPositions: [0], initialSpeed: 6, initialBPM: 125,
    }, () => false);
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const imported = await parseWithOpenMPT(built!, 'song.xm');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    useTrackerStore.getState().loadPatterns(imported.patterns);
    useTrackerStore.getState().setPatternOrder(imported.songPositions);

    useTrackerStore.getState().setCell(1, 3, { note: 49, instrument: 1 }, 0);
    await vi.waitFor(() => expect(engine.applyEdits.length).toBe(1));
    // [OP_CELL, pattern, row, channel, note, instrument, ...]
    expect(engine.applyEdits[0].slice(0, 5)).toEqual([1, 0, 3, 1, expect.any(Number)]);
    expect(engine.applyEdits[0][4]).toBeGreaterThan(0);
    expect(engine.hotReload, 'no rebuild at the keystroke').toBe(0);

    await bridge.flush();
    expect(engine.hotReload, 'the debounced save does not rebuild').toBe(0);
    expect(engine.updateBuffer, 'it refreshes the stored bytes').toBe(1);

    // Not an in-place op: a sample edit still rebuilds.
    await bridge.syncSampleEdit(1, { loop: false } as never, { loop: true, data: false });
    await bridge.flush();
    expect(engine.hotReload).toBe(1);
  }, 60000);
});
