/**
 * DigitalSonixChromeModule.ts - the Digital Sonix & Chrome (DSC.*) module as
 * the player reads it, every byte accounted for, and its exact inverse.
 *
 * Reversed from the replayer in
 * third-party/uade-3.05/amigasrc/players/wanted_team/DigitalSonixChrome_v1.asm
 * (Init, lbC005400 row step, lbC005936 voice trigger, InstallSamples, Audio0-3).
 * Full write-up: thoughts/shared/research/2026-10-06_digitalsonixchrome-format.md
 *
 * File (big-endian):
 *   +0   word   tempo       speed = (tempo/2 + 1500) / tempo  (ticks per row, 50 Hz)
 *   +2   byte   nRecords    instrument records (18 bytes each)
 *   +3   byte   nEntries    song entries (6 bytes each), the last one all zero
 *   +4   long   pcmSize     bytes of sample data at the end of the file
 *   +8   long   trackLen    rows per track; the track block is 4 * trackLen bytes
 *   +12  nEntries * 6       entries: long firstRow, byte repeats, byte rows
 *                           (repeats 0 ends a subsong; the player relocates
 *                           firstRow by the track block's address)
 *   ...  4 * trackLen       tracks: voice v's byte for row i at v*trackLen + i;
 *                           0..nRecords-1 triggers that record, 0xFF = nothing
 *   ...  nRecords * 18      records: word period, long length, long loopStart,
 *                           word repeats, long pcmOffset, byte volume, byte pad
 *   ...  pcmSize            8-bit signed PCM
 */

/** One 6-byte song entry: rows [firstRow, firstRow + rows) of all four tracks, played `repeats` times. */
export interface DscEntry {
  firstRow: number;
  /** 0 ends the subsong (the player loops to the subsong's first entry). */
  repeats: number;
  rows: number;
}

/** One 18-byte record: a sample at a fixed period. A track byte names a record, so the record IS the note. */
export interface DscRecord {
  /** AUDxPER written when the record triggers. */
  period: number;
  /** Bytes played from pcmOffset. */
  length: number;
  /** Byte offset of the repeat part within the sample. */
  loopStart: number;
  /** How many times the repeat part [loopStart, length) plays after the first pass (0 = one-shot). */
  repeats: number;
  /** Offset into the PCM block. */
  pcmOffset: number;
  /** AUDxVOL (the player masks it with $7F). */
  volume: number;
  /** Byte 17: never read by the player. */
  pad: number;
}

export interface DscModule {
  tempo: number;
  entries: DscEntry[];
  /** Rows per track (header long +8). */
  trackLen: number;
  /** Four tracks, `trackLen` bytes each. */
  tracks: [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  records: DscRecord[];
  pcm: Uint8Array;
}

/** Track byte for "no new note on this row". */
export const DSC_EMPTY = 0xff;
export const DSC_HEADER_SIZE = 12;
export const DSC_ENTRY_SIZE = 6;
export const DSC_RECORD_SIZE = 18;

function u16(b: Uint8Array, o: number): number { return (b[o] << 8) | b[o + 1]; }
function u32(b: Uint8Array, o: number): number { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function w16(b: Uint8Array, o: number, v: number): void { b[o] = (v >>> 8) & 0xff; b[o + 1] = v & 0xff; }
function w32(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff;
}

/** File offsets of each section, from the header alone. */
export function dscSections(bytes: Uint8Array): { entriesOff: number; tracksOff: number; recordsOff: number; pcmOff: number; trackLen: number } {
  const nRecords = bytes[2];
  const nEntries = bytes[3];
  const trackLen = u32(bytes, 8);
  const entriesOff = DSC_HEADER_SIZE;
  const tracksOff = entriesOff + nEntries * DSC_ENTRY_SIZE;
  const recordsOff = tracksOff + 4 * trackLen;
  const pcmOff = recordsOff + nRecords * DSC_RECORD_SIZE;
  return { entriesOff, tracksOff, recordsOff, pcmOff, trackLen };
}

/** Speed (ticks per row) as InstallSamples computes it: signed divides, (tempo/2 + $5DC) / tempo. */
export function dscSpeed(tempo: number): number {
  if (tempo <= 0) return 6;
  return Math.max(1, Math.trunc((Math.trunc(tempo / 2) + 1500) / tempo));
}

/** Read the whole module. Throws when a section runs past the end of the file. */
export function decodeDscModule(bytes: Uint8Array): DscModule {
  if (bytes.length < DSC_HEADER_SIZE) throw new Error('DSC: file shorter than its header');
  const { entriesOff, tracksOff, recordsOff, pcmOff, trackLen } = dscSections(bytes);
  const pcmSize = u32(bytes, 4);
  if (pcmOff + pcmSize > bytes.length) throw new Error('DSC: sections run past the end of the file');

  const entries: DscEntry[] = [];
  for (let i = 0; i < bytes[3]; i++) {
    const o = entriesOff + i * DSC_ENTRY_SIZE;
    entries.push({ firstRow: u32(bytes, o), repeats: bytes[o + 4], rows: bytes[o + 5] });
  }
  const tracks = [0, 1, 2, 3].map((v) => bytes.slice(tracksOff + v * trackLen, tracksOff + (v + 1) * trackLen)) as DscModule['tracks'];
  const records: DscRecord[] = [];
  for (let i = 0; i < bytes[2]; i++) {
    const o = recordsOff + i * DSC_RECORD_SIZE;
    records.push({
      period: u16(bytes, o), length: u32(bytes, o + 2), loopStart: u32(bytes, o + 6),
      repeats: u16(bytes, o + 10), pcmOffset: u32(bytes, o + 12), volume: bytes[o + 16], pad: bytes[o + 17],
    });
  }
  return { tempo: u16(bytes, 0), entries, trackLen, tracks, records, pcm: bytes.slice(pcmOff, pcmOff + pcmSize) };
}

/** Write the module back. The exact inverse of decodeDscModule for every file it accepts. */
export function encodeDscModule(m: DscModule): Uint8Array {
  const size = DSC_HEADER_SIZE + m.entries.length * DSC_ENTRY_SIZE + 4 * m.trackLen
    + m.records.length * DSC_RECORD_SIZE + m.pcm.length;
  const out = new Uint8Array(size);
  w16(out, 0, m.tempo);
  out[2] = m.records.length;
  out[3] = m.entries.length;
  w32(out, 4, m.pcm.length);
  w32(out, 8, m.trackLen);
  let o = DSC_HEADER_SIZE;
  for (const e of m.entries) {
    w32(out, o, e.firstRow); out[o + 4] = e.repeats; out[o + 5] = e.rows;
    o += DSC_ENTRY_SIZE;
  }
  for (const t of m.tracks) { out.set(t.subarray(0, m.trackLen), o); o += m.trackLen; }
  for (const r of m.records) {
    w16(out, o, r.period); w32(out, o + 2, r.length); w32(out, o + 6, r.loopStart);
    w16(out, o + 10, r.repeats); w32(out, o + 12, r.pcmOffset); out[o + 16] = r.volume; out[o + 17] = r.pad;
    o += DSC_RECORD_SIZE;
  }
  out.set(m.pcm, o);
  return out;
}

/**
 * Subsongs as the player numbers them (InitPlayer's SubCheck): one per entry
 * whose repeats byte is 0, so the trailing all-zero entry counts and the last
 * subsong of a file can be empty.
 */
export function dscSubsongCount(m: DscModule): number {
  return m.entries.filter((e) => e.repeats === 0).length;
}

/** The entry subsong `n` starts at, as Init walks it for dtg_SndNum: just after the n-th repeats-0 entry. */
export function dscSubsongStart(m: DscModule, n: number): number {
  let idx = 0;
  for (let k = 0; k < n; k++) {
    while (idx < m.entries.length && m.entries[idx].repeats !== 0) idx++;
    idx++;
  }
  return Math.min(idx, m.entries.length);
}

/** The entries one subsong plays, in order, up to (not including) its terminator. */
export function dscSubsongEntries(m: DscModule, n: number): DscEntry[] {
  const out: DscEntry[] = [];
  for (let i = dscSubsongStart(m, n); i < m.entries.length && m.entries[i].repeats !== 0; i++) out.push(m.entries[i]);
  return out;
}
