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

export interface MaxTraxSample {
  number: number;
  tune: number;
  volume: number;
  octaves: number;
  attackLen: number;
  sustainLen: number;
  attackCount: number;
  releaseCount: number;
  attack: { duration: number; volume: number }[];
  release: { duration: number; volume: number }[];
  /** First-octave PCM (attack + sustain), raw 8-bit signed bytes. */
  pcm: Uint8Array;
}

/**
 * Decode the sample bank from tailRaw into playable PCM (for building Sampler instruments).
 * Layout (big-endian): u16 numSamples, then per sample a 20-byte DiskSample header
 * (Number, Tune, Volume, Octaves, AttackLength L, SustainLength L, AttackCount, ReleaseCount),
 * AttackCount*4 + ReleaseCount*4 envelope bytes, then per octave (attack+sustain) PCM where
 * both lengths DOUBLE each octave. We keep the first (lowest) octave for the sampler.
 */
export function decodeMaxTraxSamples(data: MaxTraxData): MaxTraxSample[] {
  const b = data.tailRaw;
  if (b.length < 2) return [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const numSamples = dv.getUint16(p); p += 2;
  const out: MaxTraxSample[] = [];
  for (let s = 0; s < numSamples; s++) {
    if (p + 20 > b.length) break;
    const number = dv.getUint16(p);
    const tune = dv.getInt16(p + 2);
    const volume = dv.getUint16(p + 4);
    const octaves = dv.getUint16(p + 6);
    const attackLen = dv.getUint32(p + 8);
    const sustainLen = dv.getUint32(p + 12);
    const attackCount = dv.getUint16(p + 16);
    const releaseCount = dv.getUint16(p + 18);
    p += 20;
    const attack: { duration: number; volume: number }[] = [];
    for (let i = 0; i < attackCount; i++) {
      attack.push({ duration: dv.getUint16(p), volume: dv.getUint16(p + 2) });
      p += 4;
    }
    const release: { duration: number; volume: number }[] = [];
    for (let i = 0; i < releaseCount; i++) {
      release.push({ duration: dv.getUint16(p), volume: dv.getUint16(p + 2) });
      p += 4;
    }
    // First octave PCM = attackLen + sustainLen bytes (raw signed 8-bit, as stored).
    const firstLen = attackLen + sustainLen;
    const pcm = b.slice(p, Math.min(p + firstLen, b.length));
    // Advance past all octaves: (atk+sus)*(2^octaves - 1).
    p += firstLen * (Math.pow(2, octaves) - 1);
    out.push({ number, tune, volume, octaves, attackLen, sustainLen, attackCount, releaseCount, attack, release, pcm });
  }
  return out;
}

/** Byte offsets/counts for one sample inside `tailRaw`. Single source for
 *  both the store's in-place mutations and the live-edit byte-slice extractor. */
export interface MaxTraxSampleByteLayout {
  headerBase: number;
  envBase: number;
  pcmBase: number;
  pcmSize: number;
  sampleEnd: number;
  attackCount: number;
  releaseCount: number;
  attackLen: number;
  sustainLen: number;
  octaves: number;
}

/**
 * Walk `tailRaw` (u16 numSamples, then per-sample header+env+PCM) to the byte
 * layout of one sample. PCM total = firstLen*(2^octaves - 1), firstLen =
 * attackLen+sustainLen (per-octave lengths double). Returns null if the index
 * is out of range or the buffer is truncated.
 */
export function locateMaxTraxSampleInTailRaw(
  tail: Uint8Array,
  sampleIndex: number,
): MaxTraxSampleByteLayout | null {
  if (tail.length < 2) return null;
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const numSamples = dv.getUint16(0);
  if (sampleIndex >= numSamples) return null;
  let p = 2; // skip numSamples
  for (let s = 0; s <= sampleIndex; s++) {
    if (p + 20 > tail.length) return null;
    const ac = dv.getUint16(p + 16);
    const rc = dv.getUint16(p + 18);
    const al = dv.getUint32(p + 8);
    const sl = dv.getUint32(p + 12);
    const oc = dv.getUint16(p + 6);
    const firstLen = al + sl;
    const envBytes = (ac + rc) * 4;
    const pcmSize = firstLen > 0 ? firstLen * (Math.pow(2, oc) - 1) : 0;
    if (s === sampleIndex) {
      return {
        headerBase: p,
        envBase: p + 20,
        pcmBase: p + 20 + envBytes,
        pcmSize,
        sampleEnd: p + 20 + envBytes + pcmSize,
        attackCount: ac,
        releaseCount: rc,
        attackLen: al,
        sustainLen: sl,
        octaves: oc,
      };
    }
    p += 20 + envBytes + pcmSize;
  }
  return null;
}

/**
 * Extract a copy of the `tailRaw` bytes for one sample: the exact
 * `[headerBase, sampleEnd)` slice (20-byte header + env array + per-octave
 * PCM, big-endian). This is the byte contract consumed by the WASM
 * `maxtrax_reload_patch` live-edit path — identical bytes to what
 * `encodeMaxTrax` writes for this sample. Returns null on bad index.
 */
export function extractSampleDsampleSlice(
  data: MaxTraxData,
  sampleIndex: number,
): Uint8Array | null {
  const loc = locateMaxTraxSampleInTailRaw(data.tailRaw, sampleIndex);
  if (!loc) return null;
  return data.tailRaw.slice(loc.headerBase, loc.sampleEnd);
}

/**
 * Bytes to feed the WASM replayer on load: the edited store if present (single source of
 * truth, symmetric with export), else the original file bytes.
 */
export function resolveMaxTraxLoadBytes(
  data: MaxTraxData | null,
  rawFileData: ArrayBuffer | Uint8Array | null | undefined,
): ArrayBuffer | undefined {
  if (data) {
    const enc = encodeMaxTrax(data);
    return enc.slice().buffer; // exact-length ArrayBuffer copy
  }
  if (!rawFileData) return undefined;
  return rawFileData instanceof Uint8Array ? rawFileData.slice().buffer : rawFileData;
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
