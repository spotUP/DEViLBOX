/**
 * Dispatch register-write capture: pure conversion of the raw (address, value)
 * pairs that `furnace_dispatch_reg_writes` returns into the `RegisterWrite`
 * log entries `VGMExporter` consumes. No AudioWorklet needed, so it is
 * unit-testable.
 */
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import { FurnaceDispatchPlatform } from '../../engine/furnace-dispatch/platforms';
import type { RegisterWrite } from './VGMExporter';

/**
 * One drained batch as the worklet posts it. `pairs` is a flat
 * [addr0, val0, addr1, val1, ...]; `sample` is the tick's position in samples
 * since capture start (worklet sample rate).
 */
export interface DispatchRegBatch {
  platformType: number;
  sample: number;
  pairs: Int32Array | number[];
}

/**
 * VGM chip type for a dispatch platform, or null when the exporter has no
 * mapping yet (only the YM2610 family so far).
 */
export function vgmChipTypeOfPlatform(platformType: number): number | null {
  switch (platformType) {
    case FurnaceDispatchPlatform.YM2610_FULL:
    case FurnaceDispatchPlatform.YM2610_FULL_EXT:
    case FurnaceDispatchPlatform.YM2610_CRAP:
    case FurnaceDispatchPlatform.YM2610_CRAP_EXT:
      return FurnaceChipType.OPNB;
    default:
      return null;
  }
}

/**
 * Convert drained batches into exporter log entries. The dispatch address
 * carries the port: 0x100 and above is port 1 (VGMExporter splits on that), so
 * the address passes through unchanged in `port`; the value is masked to a byte.
 * Batches of a platform with no VGM mapping are dropped.
 */
export function batchesToRegisterWrites(batches: readonly DispatchRegBatch[]): RegisterWrite[] {
  const out: RegisterWrite[] = [];
  for (const b of batches) {
    const chipType = vgmChipTypeOfPlatform(b.platformType);
    if (chipType === null) continue;
    for (let i = 0; i + 1 < b.pairs.length; i += 2) {
      out.push({
        timestamp: b.sample,
        chipType,
        port: b.pairs[i] & 0x1FF,
        data: b.pairs[i + 1] & 0xFF,
      });
    }
  }
  return out;
}
