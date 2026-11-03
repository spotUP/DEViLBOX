/**
 * Position-less Nuade players (no position hook, no row grid, e.g. Tim Follin) must still report where they are.
 * The framework clock (nuade-wasm/patches/0001) runs one tick per row for them, so the worklet posts an absolute tick
 * count that the tick follow maps onto the grid. Before the patch every message was row 0, order 0, speed 0.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installNuadeRig, until, type Rig } from './nuadeEngineRig';
import { songBuffer } from '../../__tests__/workletHarness';
import { NuadeEngine, type NuadePosition } from '../NuadeEngine';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';

const TF = 'public/data/songs/formats/follin_smallest.tf';
// The DEViLBOX Tim Follin grid: one row per 50 Hz tick, speed 1.
const GRID = { initialSpeed: 1, songPositions: [0], patterns: [{ length: 100000 }] as never, restartPosition: 0 };

describe('nuade position-less player (timfollin)', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    engine = NuadeEngine.getInstance();
    await engine.ready();
    await engine.loadTune(songBuffer(TF), 'timfollin', 'follin_smallest.tf');
    await until(() => engine.loaded !== null);
  });
  afterAll(() => { engine.dispose(); rig.uninstall(); });

  it('reports a moving tick count through the real worklet and engine position path', () => {
    const seen: NuadePosition[] = [];
    const off = engine.onPositionUpdate((p) => seen.push(p));
    engine.setGrid(GRID, 'tick');
    engine.play();
    rig.posted.length = 0;
    rig.render(1500); // 4 s
    off();
    const posted = rig.posted.filter((m) => m.type === 'position') as unknown as { row: number; speed: number; tick: number }[];
    // Sentinel: the handler ran for every posted message, and the worklet posted many (not the single all-zero one).
    expect(posted.length).toBeGreaterThan(20);
    expect(seen.length).toBe(posted.length);
    const last = seen[seen.length - 1]!;
    expect(last.row).toBeGreaterThan(100); // ~200 ticks in 4 s at 50 Hz
    expect(new Set(seen.map((p) => p.row)).size).toBeGreaterThan(20);
    engine.stop();
  });
});
