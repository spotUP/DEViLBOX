/**
 * NE-5: the position follow. The worklet posts the snapshot read at the frame being heard (not the frame rendered);
 * the engine maps it onto the grid by order and row, or by tick for a reconstructed grid.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { installNuadeRig, until, type Rig } from './nuadeEngineRig';
import { songBuffer } from '../../__tests__/workletHarness';
import { NuadeEngine, type NuadePosition } from '../NuadeEngine';
import { WASMChannelOutputsEngine } from '@engine/wasm/WASMSingletonBase';

const MMDC = 'public/data/songs/formats/captain planet and the planeteers - title.mmdc';
// A grid shaped like a tracker song: 64 orders of 64 rows, 6 ticks per row.
const GRID = { initialSpeed: 6, songPositions: Array.from({ length: 64 }, (_, i) => i), patterns: Array.from({ length: 64 }, () => ({ length: 64 })) as never, restartPosition: 0 };

describe('NE-5 nuade position follow', () => {
  let rig: Rig;
  let engine: NuadeEngine;
  beforeAll(async () => {
    rig = installNuadeRig();
    vi.spyOn(WASMChannelOutputsEngine.prototype as unknown as { afterPlay(): void }, 'afterPlay').mockImplementation(() => undefined);
    engine = NuadeEngine.getInstance();
    await engine.ready();
    await engine.loadTune(songBuffer(MMDC), 'mmdc', 'captain.mmdc');
    await until(() => engine.loaded !== null);
  });
  afterAll(() => { engine.dispose(); rig.uninstall(); });

  it('follows by order and row: the grid position is the one the worklet read at the heard frame', () => {
    const seen: NuadePosition[] = [];
    const off = engine.onPositionUpdate((p) => seen.push(p));
    engine.setGrid(GRID, 'orderRow');
    engine.play();
    rig.posted.length = 0;
    rig.render(1500); // 4 s
    off();
    const posted = rig.posted.filter((m) => m.type === 'position') as unknown as { order: number; row: number; frame: number }[];
    expect(posted.length).toBeGreaterThan(8);
    expect(seen.length).toBe(posted.length);
    seen.forEach((p, i) => { expect({ songPos: p.songPos, row: p.row }).toEqual({ songPos: Math.min(posted[i]!.order, 63), row: Math.min(posted[i]!.row, 63) }); });
    // The row advances as the song plays.
    expect(new Set(seen.map((p) => `${p.songPos}:${p.row}`)).size).toBeGreaterThan(4);
    engine.stop();
  });

  it('follows by tick on a reconstructed grid: row * speed + tick through the shared tick mapping', () => {
    const seen: NuadePosition[] = [];
    const off = engine.onPositionUpdate((p) => seen.push(p));
    engine.setGrid(GRID, 'tick');
    engine.play();
    rig.posted.length = 0;
    rig.render(1500);
    off();
    // (MMDC has real orders, so its row restarts per pattern; the formula is what matters: grid_ticks players report one
    // pattern of all scanned ticks, where row * speed + tick is the absolute count.)
    const posted = rig.posted.filter((m) => m.type === 'position') as unknown as { row: number; speed: number; tick: number }[];
    expect(seen.length).toBe(posted.length);
    expect(seen.length).toBeGreaterThan(8);
    seen.forEach((p, i) => { expect(p.ticks).toBe(posted[i]!.row * Math.max(1, posted[i]!.speed) + posted[i]!.tick); });
    engine.stop();
  });

  it('reads the snapshot at the frame being heard: output latency holds the display back', () => {
    const frameAfter = (latencySeconds: number): number => {
      rig.ctx.outputLatency = latencySeconds;
      engine.stop();
      engine.play();
      rig.posted.length = 0;
      rig.render(300);
      const last = rig.posted.filter((m) => m.type === 'position').pop() as unknown as { frame: number };
      return last.frame;
    };
    const none = frameAfter(0);
    const held = frameAfter(0.25);
    expect(none - held).toBeGreaterThan(0.2 * 48000);
    expect(none - held).toBeLessThan(0.3 * 48000);
    rig.ctx.outputLatency = 0;
    engine.stop();
  });
});
