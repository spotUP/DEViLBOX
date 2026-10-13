/**
 * The audio node of NuadeEngine has exactly the loaded song's voice count: outputs = 1 main + 4 isolation slots + one dub
 * send per voice. Each declared output costs audio-thread time whether connected or not (channelOutputsSizedByVoices.test.ts),
 * and nuade's players differ (2 to 8 voices), so a fixed 8-voice node wasted up to 4 outputs on a 4-voice song.
 *
 * The real engine, the real worklet and WASM (nuadeEngineRig.ts); the voice count it compares with is read from the
 * worklet's own moduleLoaded (nw_voice_count after nw_open), not from the engine under test.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installNuadeRig, until, type Rig } from './nuadeEngineRig';
import { songBuffer } from '../../__tests__/workletHarness';
import { NuadeEngine } from '../NuadeEngine';
import { NUADE_NODE_VOICES } from '../nuadeProtocol';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';
import { registerChannelMeterSink } from '@engine/tone/channelMeterFeed';

const SONGS: Array<[string, string, string]> = [
  ['mmdc', 'public/data/songs/formats/captain planet and the planeteers - title.mmdc', 'a.mmdc'],
  ['oktalyzer', 'public/data/songs/formats/45.okta', '45.okta'],
  ['digmug', 'public/data/songs/formats/cockwise.mug', 'cockwise.mug'],
];

describe('NuadeEngine node is sized by the loaded song', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    engine = NuadeEngine.getInstance();
    await engine.ready();
  });
  afterAll(() => { engine.dispose(); registerChannelMeterSink(null); rig.uninstall(); });

  it('a song of 4, 6 and 7 voices, then 4 again: each load leaves a node of 1 + 4 + its voices outputs, and it still plays', async () => {
    expect(rig.nodeOptions.at(-1)?.numberOfOutputs).toBe(1 + 4 + NUADE_NODE_VOICES); // before any song: the corpus maximum
    const counts: number[] = [];
    for (const [player, path, name] of [...SONGS, SONGS[0]!]) {
      await engine.loadTune(songBuffer(path), player, name);
      await until(() => engine.loaded !== null && engine.loaded.playerId === player);
      const voices = engine.loaded!.voices; // the worklet's own count
      counts.push(voices);
      expect(rig.nodeOptions.at(-1)?.numberOfOutputs, `${player}: ${voices} voices`).toBe(1 + 4 + voices);
      expect(engine.nodeVoices).toBe(voices);
      engine.play();
      const out = rig.render(1500, 1 + 4 + voices);
      expect(out.peaks[0], `${player} plays on the resized node`).toBeGreaterThan(0.01);
      engine.stop();
    }
    expect(counts).toEqual([4, 6, 7, 4]);
  }, 60_000);

  it('keeps the mute mask across a resize', async () => {
    engine.setMuteMask(0b0000);
    await engine.loadTune(songBuffer(SONGS[1]![1]), 'oktalyzer', '45.okta'); // 6 voices: a resize from 4
    await until(() => engine.loaded !== null && engine.loaded.playerId === 'oktalyzer');
    engine.play();
    expect(rig.render(800, 11).peaks[0]).toBeLessThan(1e-6); // everything muted still
    engine.setMuteMask(0b111111);
    expect(rig.render(800, 11).peaks[0]).toBeGreaterThan(0.01);
    engine.stop();
  }, 60_000);
});
