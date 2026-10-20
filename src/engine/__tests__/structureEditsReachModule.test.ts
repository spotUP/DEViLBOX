/**
 * Patterns, channels and order entries added after the module exists play
 * (reported 2026-10-20: edits made after the first play did not sound).
 *
 * libopenmpt plays the OpenMPT soundlib module. Cell edits reached it, but a
 * pattern added, a channel added or an order entry changed never did, and a
 * structural edit during playback reloaded the song, which reset the bridge
 * and played the original import bytes: every earlier edit was lost too.
 * The tracker store now pushes structural edits to the module, and the bridge
 * owns the song buffers it stands for, so a reload of the same song keeps it.
 *
 * Driven through the real tracker store actions, measured on the module the
 * player receives, parsed back by the real soundlib. Fails on revert: without
 * the store subscription the parsed module keeps 1 pattern and 2 channels.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_CELL, type TrackerCell } from '@/types/tracker';

const ROOT = resolve(__dirname, '../../..');

const cell = (over: Partial<TrackerCell> = {}): TrackerCell => ({ ...EMPTY_CELL, ...over });

describe('structural edits reach the libopenmpt module', () => {
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

  it('an imported song keeps its edits and plays an added pattern, channel and order entry', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => cell());
    const ch0 = rows(16);
    ch0[0] = cell({ note: 49, instrument: 1 });
    const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
    const built = await bridge.createModuleForSong({
      numChannels: 2,
      patterns: [{ length: 16, channels: [{ rows: ch0 }, { rows: rows(16) }] }],
      songPositions: [0],
    }, () => false);

    // Import it: the song's bytes are the module's own from here on.
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const imported = await parseWithOpenMPT(built!, 'song.xm');
    expect(bridge.ownsSongData(imported.libopenmptFileData)).toBe(true);
    expect(bridge.ownsSongData(built!.slice(0))).toBe(false);

    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const store = useTrackerStore.getState();
    store.loadPatterns(imported.patterns);
    store.setPatternOrder(imported.songPositions);
    expect(bridge.hasEdits()).toBe(false);

    store.addPattern(32);
    // Two channels: XM stores an even channel count.
    useTrackerStore.getState().addChannel();
    useTrackerStore.getState().addChannel();
    useTrackerStore.getState().setCell(2, 4, { note: 61, instrument: 1, effTyp: 13, eff: 0x00 }, 1);
    useTrackerStore.getState().setPatternOrder([0, 1, 0]);
    await vi.waitFor(() => expect(bridge.hasEdits()).toBe(true));

    // A reload of the same song (what a structural edit during playback does)
    // still finds the module holding it, edits included.
    expect(bridge.ownsSongData(imported.libopenmptFileData)).toBe(true);
    const data = await bridge.serialize();
    const back = await parseWithOpenMPT(data!, 'edited.xm');
    expect(back.patterns.length).toBe(2);
    expect(back.patterns[1].length).toBe(32);
    expect(back.patterns[0].channels.length).toBe(4);
    expect(back.songPositions).toEqual([0, 1, 0]);
    expect(back.patterns[0].channels[0].rows[0]).toMatchObject({ note: 49, instrument: 1 });
    expect(back.patterns[1].channels[2].rows[4]).toMatchObject({ note: 61, instrument: 1, effTyp: 13, eff: 0x00 });
  }, 60000);
});
