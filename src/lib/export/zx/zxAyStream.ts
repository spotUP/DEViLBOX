/**
 * ZX Spectrum 128 AY register stream: capture log -> 50 Hz frames -> delta stream -> 16 KB banks.
 * Format is read by public/zx/player.asm (see its header). Pure functions, no engine needed.
 */
import type { RegisterWrite } from '../VGMExporter';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';

export const ZX_FRAME_HZ = 50;
export const AY_REG_COUNT = 14;
export const ZX_BANK_SIZE = 16384;
export const ZX_CTRL_NEXT_BANK = 0xFF;
export const ZX_CTRL_LOOP = 0xFE;

/** One 50 Hz tick: the registers written in it (last write wins; reg 13 counts as written even if unchanged). */
export type AyFrame = Array<number | undefined>;

export function captureToFrames(writes: readonly RegisterWrite[], sampleRate: number): AyFrame[] {
  const ay = writes.filter((w) => w.chipType === FurnaceChipType.AY && (w.port & 0x1FF) < AY_REG_COUNT);
  if (ay.length === 0) return [];
  const origin = ay.reduce((m, w) => Math.min(m, w.timestamp), Infinity);
  const frames: AyFrame[] = [];
  for (const w of ay) {
    const n = Math.round((w.timestamp - origin) * ZX_FRAME_HZ / sampleRate);
    while (frames.length <= n) frames.push([]);
    frames[n][w.port & 0x1FF] = w.data & 0xFF;
  }
  return frames;
}

/** Delta-encode: a register is sent when its value differs from the chip's current one (reg 13 whenever written). */
export function encodeFrames(frames: readonly AyFrame[]): Uint8Array[] {
  const cur: Array<number | undefined> = new Array(AY_REG_COUNT).fill(0); // the player mutes to 0
  return frames.map((f) => {
    let m0 = 0, m1 = 0;
    const vals: number[] = [];
    for (let r = 0; r < AY_REG_COUNT; r++) {
      const v = f[r];
      if (v === undefined || (v === cur[r] && r !== 13)) continue;
      if (r < 8) m0 |= 1 << r; else m1 |= 1 << (r - 8);
      vals.push(v);
      cur[r] = v;
    }
    return Uint8Array.from([m0, m1, ...vals]);
  });
}

/** Banks of exactly the used length. A frame never straddles banks; each bank ends in a control frame. */
export function packBanks(encoded: readonly Uint8Array[], maxBanks: number): Uint8Array[] {
  const banks: number[][] = [[]];
  const room = ZX_BANK_SIZE - 2; // the closing control frame
  for (const f of encoded) {
    let b = banks[banks.length - 1];
    if (b.length + f.length > room) {
      b.push(0, ZX_CTRL_NEXT_BANK);
      b = [];
      banks.push(b);
    }
    b.push(...f);
  }
  banks[banks.length - 1].push(0, ZX_CTRL_LOOP);
  if (banks.length > maxBanks) {
    throw new Error(`The song needs ${banks.length} data banks of 16 KB but a ZX Spectrum 128 has ${maxBanks} free; shorten the song.`);
  }
  return banks.map((b) => Uint8Array.from(b));
}

/** Test/reference decoder: banks -> per-frame register writes, following control frames; stops at the loop frame. */
export function decodeBanks(banks: readonly Uint8Array[]): Array<Map<number, number>> {
  const out: Array<Map<number, number>> = [];
  for (const bank of banks) {
    let p = 0;
    while (p < bank.length) {
      const m0 = bank[p++], m1 = bank[p++];
      if (m1 === ZX_CTRL_NEXT_BANK) break;
      if (m1 === ZX_CTRL_LOOP) return out;
      const f = new Map<number, number>();
      for (let r = 0; r < AY_REG_COUNT; r++) {
        if (r < 8 ? (m0 >> r) & 1 : (m1 >> (r - 8)) & 1) f.set(r, bank[p++]);
      }
      out.push(f);
    }
  }
  return out;
}
