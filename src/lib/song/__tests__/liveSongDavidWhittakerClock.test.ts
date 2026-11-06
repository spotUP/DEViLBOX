/**
 * apb.dw: the David Whittaker engine reported no play position, Play Pattern did not seek and the pattern loop did nothing
 * in the app, though the engine tests passed. The engine maps its played ticks onto the grid with the parser's row clock
 * (TrackerSong.davidWhittakerClock), which the registry hands to loadTune / swapModule through getLoadArgs(song). The
 * song playback loads is the live song rebuilt from the stores (liveTrackerSong), and the format store did not hold the
 * clock, so the engine got `undefined`, kept `_clock` null and dropped every playTick (MCP get_playhead_offset: 0 log
 * entries, clock false). Invariant: every field an engine's getLoadArgs reads survives the store round trip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { liveTrackerSong } from '../liveSong';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

describe('David Whittaker row clock reaches the engine through the live song', { timeout: 60_000 }, () => {
  it('apb.dw: the clock the parser walked is the clock getLoadArgs hands the engine', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs/formats/apb.dw'));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const song = await parseDavidWhittakerFile(ab, 'apb.dw');
    const parsed = song.davidWhittakerClock;
    expect(parsed?.speedChanges.length ?? 0).toBeGreaterThan(0);

    useTrackerStore.setState({ patterns: song.patterns, patternOrder: song.songPositions } as never);
    useFormatStore.getState().applyEditorMode(song as never);
    const live = liveTrackerSong();
    expect(live.davidWhittakerClock).toEqual(parsed);

    const desc = WASM_ENGINES.find((d) => d.key === 'DavidWhittakerReplayer')!;
    const args = desc.getLoadArgs!(live) as [number, { speedChanges: unknown[]; passTicks: number } | undefined];
    expect(args[1]?.speedChanges.length ?? 0).toBeGreaterThan(0);
    expect(args[1]?.passTicks).toBe(parsed!.passTicks);
  });
});
