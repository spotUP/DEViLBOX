/**
 * The row preview's view of nuade: a private NuadeDriver (a second module instance in the row-preview worker, or the
 * Node one in tests) behind RowRenderAdapter. It makes the same nw_* calls as public/nuade/Nuade.worklet.js: open with
 * the companion files, start the subsong, render in 128-frame quanta with the voice buffers and pans.
 */
import { NuadeDriver } from '@engine/nuade/nuadeDriver';
import type { NuadeModule } from '@engine/nuade/nuadeModule';
import type { PlayerPosition, RowChunk } from '../rowClip';
import type { RowRenderAdapter } from '../rowPreviewStream';

/** The arguments Nuade's registry descriptor loads with (wasmEngineRegistry getLoadArgs): player, file name, subsong, companions. */
export type NuadeLoadArgs = [playerId?: string, fileName?: string, subsong?: number, companions?: Map<string, ArrayBuffer>];

export class NuadeRowAdapter implements RowRenderAdapter {
  private readonly driver: NuadeDriver;
  private subsong = 0;
  readonly sampleRate: number;

  constructor(driver: NuadeDriver) {
    this.driver = driver;
    this.sampleRate = driver.sampleRate;
  }

  open(data: Uint8Array, args: unknown[]): void {
    const [playerId, fileName, subsong, companions] = args as NuadeLoadArgs;
    if (!playerId) throw new Error('NuadeRowAdapter: no player id');
    const d = this.driver;
    d.reinit();
    d.clearFiles();
    for (const [name, bytes] of companions ?? []) d.addFile(name, new Uint8Array(bytes));
    d.open(data, fileName || playerId, playerId);
    // The worklet's rule: the asked subsong when it exists, else the file's default.
    this.subsong = typeof subsong === 'number' && subsong >= 0 && subsong < d.subsongCount ? subsong : d.defaultSubsong;
    if (!d.start(this.subsong)) throw new Error(`nuade start failed for subsong ${this.subsong}`);
  }

  restart(): void { this.driver.start(this.subsong); }

  advanceSilent(frame: number): number {
    this.driver.seek(frame);
    return Math.round(this.driver.position);
  }

  renderChunk(frames: number, mask: number): RowChunk {
    const d = this.driver;
    d.setMuteMask(mask | 0);
    const r = d.render(frames, true);
    return { frames: r.frames, stereo: r.stereo, voices: r.voices, pans: Float32Array.from(d.pans()), flags: r.flags };
  }

  positionAt(frame: number): PlayerPosition | null {
    const s = this.driver.snapshot(frame);
    return s ? { order: s.order, pattern: s.pattern, row: s.row, tick: s.tick, speed: s.speed } : null;
  }
}

/** An adapter over a freshly loaded Nuade module (the row-preview worker's: its own instance, not the audio worklet's). */
export function createNuadeRowAdapter(m: NuadeModule, sampleRate: number): NuadeRowAdapter {
  return new NuadeRowAdapter(NuadeDriver.fromModule(m, sampleRate));
}
