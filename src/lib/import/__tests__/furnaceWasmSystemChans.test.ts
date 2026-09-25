/**
 * "it sounds out of tune ... one instrument is broken" (2026-09-25).
 *
 * The WASM loader (the path every .dmf and .fur takes in the app) built the
 * song's native data without `systemChans` — how many of the song's channels
 * each system owns. The sequencer maps song channels to chips by those counts
 * (FurnaceSequencerSerializer) and, lacking them, fell back to each chip's
 * runtime channel count. A DefleMask Genesis song runs on a YM2612 (6) and an
 * SN76489 (4); the YM2612's dispatch reports 10, so all ten song channels went
 * to it and the four PSG parts played on FM channels. The TypeScript .fur
 * parser — the one the headless renderer uses — always set them, which is why
 * every offline check came out clean.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';

beforeAll(installFurnaceFileOpsWasm);

describe('the WASM loader\'s song data', { timeout: 60000 }, () => {
  it('says how many channels each chip of a DefleMask Genesis song owns', async () => {
    const { loadFurFileWasm } = await import('../wasm/FurnaceFileOps');
    const loaded = await loadFurFileWasm(readSong('deflemask/220hertz/Andrew_haggles.dmf'));
    expect(loaded.nativeData.systemChans).toEqual([6, 4]);
    expect(loaded.numChannels).toBe(10);
  });
});
