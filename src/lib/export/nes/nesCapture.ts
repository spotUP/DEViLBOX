/**
 * NES-family capture: pure conversion of raw dispatch batches (what `furnace_dispatch_reg_writes` returns) into
 * tagged events for the NES native player. Kept apart from `batchesToRegisterWrites`: that one masks the address
 * to 9 bits and drops platforms without a VGM mapping, and the NES dispatches also emit control events.
 *
 * Address facts (Furnace platform/*.cpp, counted in thoughts/shared/plans/2026-11-17-nes-native-player.md, R3):
 * the dispatch addresses are chip-internal register numbers for VRC7 (OPLL 0x00-0x35), N163 (RAM 0x00-0x7f) and
 * 5B (AY 0x00-0x0f), real bus addresses for 2A03, VRC6, MMC5 and FDS. Control events use 0xffff0000 | (channel << 8)
 * | kind and arrive as negative int32 (worklet posts Int32Array), so they are read with `>>> 0`.
 */
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import type { DispatchRegBatch } from '../dispatchRegCapture';

export type NesChip = 'nes' | 'vrc6' | 'vrc7' | 'fds' | 'mmc5' | 'n163' | 's5b';

/** Low byte of a control pseudo-address. 3 is unused by every NES-family dispatch. */
export const NES_CONTROL = { DAC_SAMPLE: 0, DAC_RATE: 1, SAMPLE_STOP: 2, DPCM_BANK: 4 } as const;

export type NesEvent =
  /** A chip register write; the player replays these per tick. */
  | { kind: 'write'; chip: NesChip; sample: number; addr: number; value: number }
  /** A write that belongs to a raw sample stream ($4011, VRC6 digital mode): keeps its own sample position. */
  | { kind: 'pcm'; chip: NesChip; sample: number; addr: number; value: number }
  /** Furnace bookkeeping, never a register write. `channel` is the VRC6 channel (0 for 2A03 and MMC5). */
  | { kind: 'control'; chip: NesChip; sample: number; control: number; channel: number; value: number };

export interface NesCapture {
  events: NesEvent[];
  /** Worklet sample rate of `sample`. */
  sampleRate: number;
  /** The song's real Furnace tick rate in Hz (Phase 6 needs it). */
  tickRateHz: number;
}

/** Platform id -> chip tag. NES_VRC7 (9) and NES_FDS (10) are compound ids: their sub-chips are not mapped here. */
export function nesChipOfPlatform(platformType: number, sunsoft = false): NesChip | null {
  switch (platformType) {
    case FurnaceDispatchPlatform.NES: return 'nes';
    case FurnaceDispatchPlatform.VRC6: return 'vrc6';
    case FurnaceDispatchPlatform.VRC7: return 'vrc7';
    case FurnaceDispatchPlatform.FDS: return 'fds';
    case FurnaceDispatchPlatform.MMC5: return 'mmc5';
    case FurnaceDispatchPlatform.N163: return 'n163';
    // AY8910 is the 5B only when the system has the Sunsoft flag; the batch does not carry it.
    case FurnaceDispatchPlatform.AY8910: return sunsoft ? 's5b' : null;
    default: return null;
  }
}

/** Digital-mode write: 2A03 $4011 (DAC), VRC6 pulse register 0 with bit 7 set (its mode bit; normal writes keep it clear). */
function isPcmWrite(chip: NesChip, addr: number, value: number): boolean {
  if (chip === 'nes') return addr === 0x4011;
  if (chip === 'vrc6') return (addr === 0x9000 || addr === 0xA000) && (value & 0x80) !== 0;
  return false;
}

export function batchesToNesEvents(batches: readonly DispatchRegBatch[], opts: { sunsoft?: boolean } = {}): NesEvent[] {
  const out: NesEvent[] = [];
  for (const b of batches) {
    const chip = nesChipOfPlatform(b.platformType, opts.sunsoft);
    if (chip === null) continue;
    for (let i = 0; i + 1 < b.pairs.length; i += 2) {
      const addr = b.pairs[i] >>> 0;
      const value = b.pairs[i + 1];
      if (addr >>> 16 === 0xffff) {
        out.push({ kind: 'control', chip, sample: b.sample, control: addr & 0xff, channel: (addr >>> 8) & 0xff, value });
      } else {
        const v = value & 0xff;
        out.push({ kind: isPcmWrite(chip, addr, v) ? 'pcm' : 'write', chip, sample: b.sample, addr, value: v });
      }
    }
  }
  return out;
}

export function nesCaptureFromBatches(batches: readonly DispatchRegBatch[], sampleRate: number, tickRateHz: number, opts: { sunsoft?: boolean } = {}): NesCapture {
  return { events: batchesToNesEvents(batches, opts), sampleRate, tickRateHz };
}
