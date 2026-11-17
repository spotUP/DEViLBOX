/**
 * Game Boy native player, Phase 1: Furnace GB dispatch register capture -> CPU bus writes.
 *
 * Furnace's GB dispatch (third-party/furnace-master/src/engine/platform/gb.cpp, SameBoy APU)
 * dumps `rWrite(a, v)` with `a` = APU register offset 0x10-0x3f, so the bus address is
 * `0xFF00 | a` (NR10 $FF10 ... NR51 $FF25, wave RAM $FF30-$FF3F). NR50 ($FF24) and NR52
 * ($FF26) are never written by the dispatch: the player sets them at boot.
 *
 * Pseudo-addresses `0xffff____` (none emitted by the GB dispatch today) are kept as control
 * events so they never reach the bus. Same shape as `nes/nesCapture.ts`.
 */
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import type { DispatchRegBatch } from '../dispatchRegCapture';

export type GbEvent =
  | { kind: 'write'; sample: number; addr: number; value: number }
  | { kind: 'control'; sample: number; control: number; channel: number; value: number };

export interface GbCapture {
  events: GbEvent[];
  /** Worklet sample rate of `sample`. */
  sampleRate: number;
  /** Song tick rate in Hz (Furnace default for GB is the 59.7275 Hz VBlank). */
  tickRateHz: number;
}

/** GB dispatch batches -> bus writes in capture order; batches of other chips are ignored. */
export function batchesToGbEvents(batches: readonly DispatchRegBatch[]): GbEvent[] {
  const out: GbEvent[] = [];
  for (const b of batches) {
    if (b.platformType !== FurnaceDispatchPlatform.GB) continue;
    for (let i = 0; i + 1 < b.pairs.length; i += 2) {
      const addr = b.pairs[i] >>> 0;
      const value = b.pairs[i + 1];
      if (addr >>> 16 === 0xffff) {
        out.push({ kind: 'control', sample: b.sample, control: addr & 0xff, channel: (addr >>> 8) & 0xff, value });
      } else {
        out.push({ kind: 'write', sample: b.sample, addr: 0xff00 | (addr & 0xff), value: value & 0xff });
      }
    }
  }
  return out;
}

export function gbCaptureFromBatches(batches: readonly DispatchRegBatch[], sampleRate: number, tickRateHz: number): GbCapture {
  return { events: batchesToGbEvents(batches), sampleRate, tickRateHz };
}
