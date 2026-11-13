/**
 * NATIVE-ROUTING-LOAD-ERROR: NuadeEngine.loadTune resolved as soon as it had posted the module to the worklet, so a
 * module the player refused (MMDC, 2026-11) still counted as loaded: the routing called play() and logged
 * "loaded & playing" over silence. The load promise now settles on the worklet's answer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installNuadeRig, type Rig } from './nuadeEngineRig';
import { NuadeEngine } from '../NuadeEngine';

describe('a native engine that rejects the song does not report loaded & playing', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  beforeAll(async () => {
    rig = installNuadeRig();
    engine = NuadeEngine.getInstance();
    await engine.ready();
  });
  afterAll(() => { engine.dispose(); rig.uninstall(); });

  it('NuadeEngine.loadTune rejects with the worklet error when the player refuses the module', async () => {
    const garbage = new Uint8Array(64).fill(0x7f).buffer;
    await expect(engine.loadTune(garbage, 'mmdc', 'broken.mmdc', undefined, undefined)).rejects.toThrow();
    expect(engine.loaded).toBeNull();
  });
});
