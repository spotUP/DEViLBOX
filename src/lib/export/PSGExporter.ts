/**
 * PSG (Bulba AY dump) and TAYM exporters for AY/YM register captures.
 * Frames come from the ZX capture path (captureToFrames): 50 Hz, reg 13 present only on an envelope retrigger.
 *
 * PSG: "PSG" 1A, 12 zero bytes, then per frame: (reg,value)* FF; runs of empty frames are FE n (n*4 frames); no FD
 * end marker is needed by players but is not written either (EOF ends the stream).
 * TAYM: header "TAYM" u16 version=1, u16 headerSize=16, u32 flags, u32 chunk bytes; chunks tag+u32 len+payload.
 */
import { type RegisterWrite } from './VGMExporter';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import { AY_REG_COUNT, captureToFrames, type AyFrame } from './zx/zxAyStream';

export interface PSGExportOptions {
  title?: string;
}

export function canExportPSG(writes: RegisterWrite[]): boolean {
  return writes.some((w) => w.chipType === FurnaceChipType.AY);
}

/** Delta encode; register 13 is written on every retrigger even when the shape is unchanged. */
export function encodePsg(frames: readonly AyFrame[]): Uint8Array {
  const out: number[] = [0x50, 0x53, 0x47, 0x1A, ...new Array<number>(12).fill(0)];
  const cur: Array<number | undefined> = new Array(AY_REG_COUNT).fill(0);
  let empty = 0;
  const flushEmpty = () => {
    while (empty >= 4) {
      const n = Math.min(255, Math.floor(empty / 4));
      out.push(0xFE, n);
      empty -= n * 4;
    }
    while (empty > 0) { out.push(0xFF); empty--; }
  };
  for (const f of frames) {
    const pairs: number[] = [];
    for (let r = 0; r < AY_REG_COUNT; r++) {
      const v = f[r];
      if (v === undefined || (v === cur[r] && r !== 13)) continue;
      pairs.push(r, v);
      cur[r] = v;
    }
    if (pairs.length === 0) { empty++; continue; }
    flushEmpty();
    out.push(...pairs, 0xFF);
  }
  flushEmpty();
  return Uint8Array.from(out);
}

function chunk(tag: string, payload: Uint8Array): Uint8Array {
  const b = new Uint8Array(8 + payload.length);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < 4; i++) b[i] = tag.charCodeAt(i);
  dv.setUint32(4, payload.length, true);
  b.set(payload, 8);
  return b;
}

/** TAYM with TRAK, CHIP (one AY) and PSG0; the timer/modulation pools stay empty. */
export function encodeTaym(psg: Uint8Array, title = ''): Uint8Array {
  const trak = new TextEncoder().encode(title);
  const chip = Uint8Array.from([1]); // chip type 1 = AY
  const empties = ['TIMR', 'MODS', 'ACTN', 'LANE', 'TLAN', 'VU08', 'VU16', 'VU32'].map((t) => chunk(t, new Uint8Array(0)));
  const chunks = [chunk('TRAK', trak), chunk('CHIP', chip), ...empties, chunk('PSG0', psg)];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(16 + total);
  const dv = new DataView(out.buffer);
  out.set([0x54, 0x41, 0x59, 0x4D], 0);
  dv.setUint16(4, 1, true);
  dv.setUint16(6, 16, true);
  dv.setUint32(12, total, true);
  let o = 16;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function exportToPSG(writes: RegisterWrite[], _opts: PSGExportOptions = {}): Uint8Array {
  return encodePsg(captureToFrames(writes, 44100));
}

export function exportToTAYM(writes: RegisterWrite[], opts: PSGExportOptions = {}): Uint8Array {
  return encodeTaym(exportToPSG(writes), opts.title ?? '');
}
