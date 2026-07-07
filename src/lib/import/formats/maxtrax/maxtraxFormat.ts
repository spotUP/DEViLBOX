/**
 * maxtraxFormat.ts — MaxTrax (MXTX) binary codec: lossless parse <-> encode.
 *
 * MaxTrax (Talin/Joe Pearce, 1991) is a MIDI-like event format, NOT a tracker grid: each
 * "score" is a sequence of 6-byte events. This module parses the editable part (the scores)
 * and preserves everything else (header, microtonal table, sample bank, any trailing data)
 * verbatim, so re-encoding an unedited module is byte-identical.
 *
 * File layout (big-endian), verified byte-exact against the real fixtures in
 * public/data/songs/maxtrax/ and the UADE loader (max.asm:2804+, driver.i structs):
 *   0    'MXTX'
 *   4    u16 tempo
 *   6    u16 flags        (bit15 = microtonal table present)
 *   [8   256-byte microtonal table, only if flags bit15]
 *   N    u16 numScores
 *   per score: u32 numEvents, then numEvents * 6-byte CookedEvent
 *   after scores: u16 numSamples, then the sample bank (kept raw here)
 *
 * CookedEvent (6 bytes): command(u8), data(u8), startTime(u16), stopTime(u16).
 * Reference: third-party/uade-3.05/amigasrc/players/max_trax/{max.asm,driver.i}
 */

export interface MaxTraxEvent {
  command: number; // 0x00-0x7F note; 0x80 tempo; 0xA0 special; 0xB0 CC; 0xC0 prog; 0xE0 bend; 0xFF end
  data: number;
  startTime: number;
  stopTime: number;
}

export interface MaxTraxScore {
  events: MaxTraxEvent[];
}

export interface MaxTraxData {
  tempo: number;
  flags: number;
  /** Bytes 0..numScores-count inclusive (magic, tempo, flags, optional microtonal, numScores). */
  headerRaw: Uint8Array;
  scores: MaxTraxScore[];
  /** numSamples + sample bank + any trailing bytes, preserved verbatim for byte-exact export. */
  tailRaw: Uint8Array;
}

const EVENT_SIZE = 6;

export function isMaxTraxFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return b.length >= 10 && b[0] === 0x4d && b[1] === 0x58 && b[2] === 0x54 && b[3] === 0x58; // 'MXTX'
}

export function parseMaxTrax(buffer: ArrayBuffer | Uint8Array): MaxTraxData {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!isMaxTraxFormat(b)) throw new Error('Not a MaxTrax (MXTX) file');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  const tempo = dv.getUint16(4);
  const flags = dv.getUint16(6);
  let p = 8;
  if (flags & 0x8000) p += 256; // microtonal table

  const numScores = dv.getUint16(p);
  p += 2;
  const headerRaw = b.slice(0, p); // through the numScores word

  const scores: MaxTraxScore[] = [];
  for (let s = 0; s < numScores; s++) {
    const numEvents = dv.getUint32(p);
    p += 4;
    const events: MaxTraxEvent[] = new Array(numEvents);
    for (let e = 0; e < numEvents; e++) {
      const o = p + e * EVENT_SIZE;
      events[e] = {
        command: b[o],
        data: b[o + 1],
        startTime: dv.getUint16(o + 2),
        stopTime: dv.getUint16(o + 4),
      };
    }
    p += numEvents * EVENT_SIZE;
    scores.push({ events });
  }

  const tailRaw = b.slice(p); // numSamples + sample bank + any trailing data
  return { tempo, flags, headerRaw, scores, tailRaw };
}

export function encodeMaxTrax(data: MaxTraxData): Uint8Array {
  let size = data.headerRaw.length + data.tailRaw.length;
  for (const score of data.scores) size += 4 + score.events.length * EVENT_SIZE;

  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  out.set(data.headerRaw, p);
  p += data.headerRaw.length;

  for (const score of data.scores) {
    dv.setUint32(p, score.events.length);
    p += 4;
    for (const ev of score.events) {
      out[p] = ev.command & 0xff;
      out[p + 1] = ev.data & 0xff;
      dv.setUint16(p + 2, ev.startTime & 0xffff);
      dv.setUint16(p + 4, ev.stopTime & 0xffff);
      p += EVENT_SIZE;
    }
  }

  out.set(data.tailRaw, p);
  return out;
}
