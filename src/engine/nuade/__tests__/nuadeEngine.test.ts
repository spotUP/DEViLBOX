/**
 * NE-3: NuadeEngine (the real class) loads a tune through the real WASM loader into the real worklet, plays it, pauses,
 * stops, starts subsongs and takes the mixer's mute mask. Browser only is faked (nuadeEngineRig.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installNuadeRig, until, type Rig } from './nuadeEngineRig';
import { songBuffer } from '../../__tests__/workletHarness';
import { NuadeEngine } from '../NuadeEngine';
import { useFormatStore } from '@stores/useFormatStore';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';

describe('NE-3 NuadeEngine', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  let afterPlay: ReturnType<typeof vi.spyOn>;
  beforeAll(async () => {
    rig = installNuadeRig();
    afterPlay = vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    engine = NuadeEngine.getInstance();
    await engine.ready();
  });
  afterAll(() => { engine.dispose(); afterPlay.mockRestore(); rig.uninstall(); });

  it('loads a module on a forced player and reports it, with the subsong model fed', async () => {
    await engine.loadTune(songBuffer(MMDC), 'mmdc', 'captain.mmdc', undefined, undefined);
    await until(() => engine.loaded !== null);
    expect(engine.loaded).toMatchObject({ playerId: 'mmdc', voices: 4 });
    expect(useFormatStore.getState().nativeSubsongs?.engine).toBe('Nuade');
  });

  it('plays after play(), stops sounding after pause(), and stop() rewinds so play() starts again from the top', async () => {
    rig.render(20);
    expect(rig.render(100).peaks[0]).toBe(0); // loaded, not playing
    engine.play();
    expect(afterPlay).toHaveBeenCalled();
    expect(rig.render(400).peaks[0]).toBeGreaterThan(0.01);
    engine.pause();
    expect(rig.render(50).peaks[0]).toBe(0);
    engine.play();
    expect(rig.render(100).peaks[0]).toBeGreaterThan(0.01);
    engine.stop();
    engine.play();
    rig.posted.length = 0;
    rig.render(1);
    const first = rig.posted.find((m) => m.type === 'position') as { frame: number } | undefined;
    expect(first?.frame).toBeLessThan(2000);
  });

  it('applies the mixer mute mask: bit set = voice audible', async () => {
    engine.setMuteMask(0);
    expect(rig.render(200).peaks[0]).toBeLessThan(1e-5);
    engine.setMuteMask(0xf);
    expect(rig.render(300).peaks[0]).toBeGreaterThan(0.01);
  });

  it('starts a subsong and answers with the one started; -1 outside the range', async () => {
    expect(await engine.playSubsong(0)).toBe(0);
    expect(await engine.playSubsong(99)).toBe(-1);
  });

  it('rejects a load without a player id', async () => {
    await expect(engine.loadTune(songBuffer(MMDC), undefined)).rejects.toThrow('no player id');
  });
});
