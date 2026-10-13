/**
 * dj_load_file: the MCP tool puts a file on a DJ deck through the file
 * browser's own load (parseDeckFile + loadFileToDeck -> loadRenderToDeck ->
 * engine.loadAudioToDeck). One reachability test: a real corpus module goes
 * in through the bridge handler, and the deck engine's load is called with
 * the deck and the file name. Also: dj_get_state reports channelScopeCount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadAudioToDeck = vi.fn(async () => ({ duration: 1 }));
const loadOrEnqueue = vi.fn(async () => ({ wavData: new ArrayBuffer(8), analysis: undefined }));

vi.mock('../../../engine/dj/DJEngine', () => ({ getDJEngine: () => ({ loadAudioToDeck }) }));
vi.mock('../../../engine/dj/DJPipeline', () => ({
  getDJPipeline: () => ({ loadOrEnqueue, applyAnalysisToDeck: vi.fn() }),
  analysisFromCachedAudio: vi.fn(),
}));

// The module parse needs a browser AudioContext; the bytes stay the real file's.
const openDeckTrack = vi.fn(async (_src: { name: string; bytes: ArrayBuffer }) => ({ song: { name: 'Cream', format: 'MOD' } }));
vi.mock('../../../lib/song/openSong', () => ({ openDeckTrack: (src: { name: string; bytes: ArrayBuffer }) => openDeckTrack(src) }));
vi.mock('../../../engine/dj/DJBeatDetector', () => ({ detectBPM: () => ({ bpm: 125 }), estimateSongDuration: () => 1 }));

import { djLoadFile, getDJState } from '../djHandlers';
import { useDJStore } from '../../../stores/useDJStore';

const MOD = resolve(__dirname, '../../../../public/data/songs/amigaklang/JosSs-Cream.mod');

describe('dj_load_file reaches the DJ deck loader', () => {
  beforeEach(() => { loadAudioToDeck.mockClear(); loadOrEnqueue.mockClear(); });

  it('renders a real module and loads it onto the named deck', async () => {
    const data = readFileSync(MOD).toString('base64');
    const res = await djLoadFile({ deck: 'B', filename: 'JosSs-Cream.mod', data });
    expect(res.error).toBeUndefined();
    expect(openDeckTrack.mock.calls[0][0].bytes.byteLength).toBe(readFileSync(MOD).byteLength);
    expect(loadOrEnqueue).toHaveBeenCalledTimes(1);
    expect(loadOrEnqueue.mock.calls[0]).toEqual(expect.arrayContaining(['JosSs-Cream.mod', 'B']));
    expect(loadAudioToDeck).toHaveBeenCalledTimes(1);
    expect((loadAudioToDeck.mock.calls[0] as unknown[]).slice(0, 3).filter((a) => typeof a === 'string'))
      .toEqual(['B', 'JosSs-Cream.mod']);
    expect(res).toMatchObject({ ok: true, deck: 'B' });
  });

  it('rejects a bad deck and reports channelScopeCount per deck', async () => {
    expect((await djLoadFile({ deck: 'Z', filename: 'x.mod', data: 'AA==' })).error).toBeDefined();
    useDJStore.getState().setDeckState('C', { channelScopeCount: 4 });
    const decks = getDJState().decks as Record<string, { channelScopeCount: number }>;
    expect(decks.C.channelScopeCount).toBe(4);
  });
});
