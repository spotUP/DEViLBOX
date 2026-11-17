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

/**
 * Writes -> 50 Hz frames. Writes within 1 ms are one song tick; a tick lands on its nearest frame. Two ticks never
 * share a frame while the next frame is free within half a frame of error (60 Hz songs beat against 50 Hz); when
 * they must merge (above 50 Hz), the last value per register wins, except register 13: an envelope retrigger that
 * would be overwritten moves to the next tick's frame when that tick writes no retrigger of its own, else it is lost.
 * Frames stay anchored to real time: no tick ever lands more than half a frame from its exact position.
 */
export function captureToFrames(writes: readonly RegisterWrite[], sampleRate: number): AyFrame[] {
  const ay = writes.filter((w) => w.chipType === FurnaceChipType.AY && (w.port & 0x1FF) < AY_REG_COUNT);
  if (ay.length === 0) return [];
  ay.sort((a, b) => a.timestamp - b.timestamp); // stable: same-timestamp order kept
  const origin = ay[0].timestamp;
  const gap = sampleRate / 1000;
  const frames: AyFrame[] = [];
  let last = -1;
  let pend13: number | undefined; // retrigger bumped out of frame `last`
  for (let i = 0; i < ay.length;) {
    let j = i;
    while (j + 1 < ay.length && ay[j + 1].timestamp - ay[i].timestamp <= gap) j++;
    const exact = (ay[i].timestamp - origin) * ZX_FRAME_HZ / sampleRate;
    let n = Math.round(exact);
    if (n <= last) n = last + 1 - exact <= 0.5 ? last + 1 : last;
    while (frames.length <= n) frames.push([]);
    const f = frames[n];
    let own13 = false;
    for (let k = i; k <= j; k++) own13 ||= (ay[k].port & 0x1FF) === 13;
    if (pend13 !== undefined && n > last) {
      if (!own13) f[13] = pend13; // a later retrigger of this tick supersedes it
      pend13 = undefined;
    }
    for (let k = i; k <= j; k++) {
      const reg = ay[k].port & 0x1FF, v = ay[k].data & 0xFF;
      if (reg === 13 && n === last && f[13] !== undefined) pend13 = v;
      else f[reg] = v;
    }
    last = n;
    i = j + 1;
  }
  return frames; // a retrigger still pending after the last tick is dropped: the loop length stays anchored
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
  return packSongs([encoded], maxBanks).banks;
}

/** Where a song starts: index into the bank list and byte offset in that bank. */
export interface ZxSongStart { bank: number; offset: number }

/**
 * Several songs one after another in the banks, each ending with the loop frame (loop to its own start). A song may
 * start in the middle of a bank; when its first frame does not fit, its start is the bank's next-bank frame.
 */
export function packSongs(songs: ReadonlyArray<readonly Uint8Array[]>, maxBanks: number): { banks: Uint8Array[]; starts: ZxSongStart[] } {
  const banks: number[][] = [[]];
  const starts: ZxSongStart[] = [];
  const room = ZX_BANK_SIZE - 2; // the closing control frame
  for (const encoded of songs) {
    starts.push({ bank: banks.length - 1, offset: banks[banks.length - 1].length });
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
  }
  if (banks.length > maxBanks) {
    throw new Error(`The songs need ${banks.length} data banks of 16 KB but a ZX Spectrum 128 has ${maxBanks} free; shorten the song or export fewer subsongs.`);
  }
  return { banks: banks.map((b) => Uint8Array.from(b)), starts };
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
