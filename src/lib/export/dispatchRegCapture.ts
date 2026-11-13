/**
 * Dispatch register-write capture: pure conversion of the raw (address, value)
 * pairs that `furnace_dispatch_reg_writes` returns into the `RegisterWrite`
 * log entries `VGMExporter` consumes. No AudioWorklet needed, so it is
 * unit-testable.
 */
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import { FurnaceDispatchPlatform } from '../../engine/furnace-dispatch/platforms';
import type { RegisterWrite, VGMDataBlock } from './VGMExporter';

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
export const VGM_MAPPED_PLATFORMS: readonly number[] = [
  FurnaceDispatchPlatform.YM2610_FULL,
  FurnaceDispatchPlatform.YM2610_FULL_EXT,
  FurnaceDispatchPlatform.YM2610_CRAP,
  FurnaceDispatchPlatform.YM2610_CRAP_EXT,
];

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

/** VGM wait commands count samples at this fixed rate. */
export const VGM_SAMPLE_RATE = 44100;

/**
 * Turn a dispatch capture into the 12-byte-per-entry log `parseRegisterLog`
 * reads (timestamp u32, chipType u8, port u32 at +5, data u8, 2 pad), with the
 * timestamps converted from the worklet sample rate to the VGM rate of 44100.
 * Going through the log keeps the one export path (`exportChipMusic`) for both
 * capture sources. The VGM length is the last write's time; no loop is derived.
 */
export function dispatchCaptureToLog(writes: readonly RegisterWrite[], workletRate: number): Uint8Array {
  const out = new Uint8Array(writes.length * 12);
  const view = new DataView(out.buffer);
  // The capture clock runs from Record, the song starts later: time zero is the first write.
  const origin = writes.reduce((m, w) => Math.min(m, w.timestamp), Infinity);
  writes.forEach((w, i) => {
    const o = i * 12;
    view.setUint32(o, Math.round((w.timestamp - origin) * VGM_SAMPLE_RATE / workletRate), true);
    view.setUint8(o + 4, w.chipType);
    view.setUint32(o + 5, w.port, true);
    view.setUint8(o + 9, w.data);
  });
  return out;
}

/** One chip sample ROM as the worklet reads it (YM2610: index 0 ADPCM-A, 1 ADPCM-B). */
export interface DispatchSampleRom {
  index: number;
  capacity: number;
  bytes: Uint8Array;
}

/**
 * VGM ROM data blocks for a YM2610 chip's sample ROMs, as Furnace's VGM export
 * writes them (vgmOps.cpp: type 0x82 ADPCM-A, 0x83 ADPCM-B, ROM size = chip
 * capacity, the used bytes at address 0 -- the addresses renderSamples gave the
 * samples, which the chip registers point to).
 */
export function ym2610RomBlocks(roms: readonly DispatchSampleRom[]): VGMDataBlock[] {
  const out: VGMDataBlock[] = [];
  for (const r of roms) {
    if (r.bytes.length === 0 || (r.index !== 0 && r.index !== 1)) continue;
    out.push({ type: r.index === 0 ? 0x82 : 0x83, romSize: r.capacity, startAddress: 0, bytes: r.bytes });
  }
  return out;
}
