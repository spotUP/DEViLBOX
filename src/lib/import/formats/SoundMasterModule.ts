/**
 * SoundMasterModule.ts - a Sound Master module (Michiel Soede, 1991-94) as the
 * replayer it carries reads it, and the exact inverse.
 *
 * A Sound Master module is its own replayer: a BRA.W jump table (init, play,
 * fade, ...) and the 68k player, its variables (A3 = the LEA $xxxx(PC),A3
 * every entry starts with), then the song. Two song layouts exist, told
 * apart by the code that reads them:
 *
 *   'offsets' (Sound Master 1.x .sm, Sound Master II v3 .sm3): a header right
 *     before the song data - speed, pattern length in bytes, restart and end
 *     position, filter, then seven longs from the data start (block table,
 *     instruments, arpeggio table, wave table, patterns, sample data from the
 *     sample table, sample table) and a pad word. The data: 8-byte positions,
 *     8-byte blocks, 16-byte instruments, the two tables, the patterns, 10-byte
 *     sample slots, sample data.
 *   'fixed' (Sound Master II v1 .smpro): fixed-size tables at fixed distances
 *     from A3 - positions as 7 columns of 64 bytes (+64 unused), blocks as 4
 *     pattern columns and 4 transpose columns of 256, 64 instruments of 14
 *     bytes, the 256-byte arpeggio and wave tables, the patterns (their size is
 *     a long in the variables), 32 sample slots as four columns, sample data.
 *
 * Every table address comes from the instruction that reads it (the
 * displacements in the player's own code, found by the instruction words
 * around them, the way the Wanted Team eagleplayer finds its patch points);
 * a module whose code does not have them is refused.
 *
 * Research: thoughts/shared/research/2026-10-06_sound-master-format.md
 */

export type SoundMasterLayout = 'offsets' | 'fixed';

/** One song position: a run of blocks with a transpose, a fade and a per-voice instrument offset. */
export interface SmPosition {
  /** First block (byte 0 / column 0). */
  first: number;
  /** Last block, inclusive (byte 1 / column 1). */
  last: number;
  /** Transpose added to every note of the position (signed byte). */
  transpose: number;
  /** Volume: 0..$7F sets every voice's volume, bit 7 starts a fade (bit 6 in/out, bit 5 from 0/64, bits 0-4 speed). */
  fade: number;
  /** Per voice: added to the instrument number; bit 7 also keeps the voice out of the fade. */
  voices: number[];
}

/** One block: per voice the pattern it plays and that pattern's transpose. */
export interface SmBlock {
  patterns: number[];
  transposes: number[];
}

/** A sample slot (offsets: 10-byte record; fixed: one entry of each of the four columns). */
export interface SmSampleSlot {
  /** Offset of the sample from the sample data (signed; built-in slots point into the player). */
  offset: number;
  /** Length in words. */
  length: number;
  /** Loop start, bytes from the sample start. */
  repeatOffset: number;
  /** Loop length in words. */
  repeatLength: number;
}

export interface SoundMasterModule {
  layout: SoundMasterLayout;
  /** A3: the player's variable base, a file offset. */
  vars: number;
  /** The player: jump table, code and variables, verbatim (for 'fixed' it also holds the song header, written back from the fields below). */
  player: Uint8Array;
  /** Ticks per row (50 Hz play calls). */
  speed: number;
  /** Bytes per pattern (2 per row). */
  patternLength: number;
  /** First position played (and the one the song loops to). */
  start: number;
  /** One past the last position played. */
  end: number;
  /** 0 = audio filter on (CIA-A PRA bit 1 cleared then set). */
  filter: number;
  /** The pad word after the header ('offsets'). */
  headerPad: number;
  positions: SmPosition[];
  /** 'fixed': the 64 bytes after the seven position columns. */
  positionTail: Uint8Array;
  blocks: SmBlock[];
  /** 16 bytes ('offsets') or 14 bytes ('fixed') each. */
  instruments: Uint8Array[];
  arpeggio: Uint8Array;
  wave: Uint8Array;
  /** `patternLength` bytes each: rows of [note, info]. */
  patterns: Uint8Array[];
  samples: SmSampleSlot[];
  sampleData: Uint8Array;
}

/** Where things are, as the player addresses them (derived; not part of the encoding). */
export interface SmAddresses {
  /** File offset of pattern 0. */
  patterns: number;
  /** File offset of instrument 0. */
  instruments: number;
  /** File offset of the sample data. */
  sampleData: number;
  /** The player's period table (index = note index; 'offsets' starts at index 18). */
  periods: number[];
  /** Index of periods[0] in note-index terms (0 'fixed', 18 'offsets'). */
  periodBase: number;
}

// ── byte helpers ────────────────────────────────────────────────────────────

const u16 = (b: Uint8Array, o: number): number => ((b[o] << 8) | b[o + 1]) >>> 0;
const s16 = (b: Uint8Array, o: number): number => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const s32 = (b: Uint8Array, o: number): number => u32(b, o) | 0;
const put16 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >>> 8) & 0xff; b[o + 1] = v & 0xff; };
const put32 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };

/** First even offset in [from, to) where `words` match (null = any word); -1 when absent. */
function findWords(b: Uint8Array, words: Array<number | null>, from = 0, to = b.length): number {
  const end = Math.min(to, b.length) - words.length * 2;
  for (let o = from & ~1; o <= end; o += 2) {
    let ok = true;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w !== null && u16(b, o + i * 2) !== w) { ok = false; break; }
    }
    if (ok) return o;
  }
  return -1;
}

/** The displacement word `index` of the instruction sequence `words` in the player; throws when the player has no such code. */
function disp(b: Uint8Array, codeEnd: number, words: Array<number | null>, index: number, what: string): number {
  const at = findWords(b, words, 0, codeEnd);
  if (at < 0) throw new Error(`Sound Master: the player has no ${what} code`);
  return s16(b, at + index * 2);
}

// ── the player ──────────────────────────────────────────────────────────────

interface Located {
  layout: SoundMasterLayout;
  vars: number;
  // 'offsets': A3 displacement of the header (speed byte) and the data
  header: number;
  data: number;
  // 'fixed': A3 displacements
  posDisp: number;
  blkDisp: number;
  insDisp: number;
  arpDisp: number;
  waveDisp: number;
  patDisp: number;
  fields: { speed: number; patLen: number; start: number; end: number; filter: number; patSize: number };
  periodsAt: number;
  periodCount: number;
}

/**
 * Find the song the player reads: A3 from the play routine (the entry at +4:
 * `lea $dff000,a6; moveq #3,d7; lea xxxx(pc),a3`), then the displacements of
 * the instructions that read each table.
 */
function locate(b: Uint8Array): Located {
  if (b.length < 16 || u16(b, 0) !== 0x6000 || u16(b, 4) !== 0x6000) throw new Error('Sound Master: no jump table');
  const play = 6 + s16(b, 6);
  if (play < 0 || play + 12 > b.length
    || u32(b, play) !== 0x4df900df || u16(b, play + 4) !== 0xf000 || u16(b, play + 6) !== 0x7e03 || u16(b, play + 8) !== 0x47fa) {
    throw new Error('Sound Master: the play entry is not the Sound Master player');
  }
  const vars = play + 10 + s16(b, play + 10);
  // The code (and the variables) end before A3 + $100 in every version.
  const codeEnd = Math.min(b.length, vars);

  // The note period: `asl.b #1,d0; lea table(pc),a0; move.w (a0,d0.l),d0`.
  const per = findWords(b, [0xe300, 0x41fa, 0x0008, 0x3030, 0x0800], 0, codeEnd);
  if (per < 0) throw new Error('Sound Master: the player has no period table');
  const periodsAt = per + 4 + 8;

  // 'offsets': `lea data(a3),a0; adda.l blocks(a3),a0; adda.l (a5),a0;
  // move.b (a0,d1.l),d0; move.b 1(a0,d1.l),$31(a5)` - the block read.
  const blockRead = findWords(b, [0x41eb, null, 0xd1eb, null, 0xd1ed, 0x0000, 0x1030, 0x1800, 0x1b70, 0x1801, 0x0031], 0, codeEnd);
  if (blockRead >= 0) {
    const data = s16(b, blockRead + 2);
    const blocksField = s16(b, blockRead + 6);
    // `move.b speed(a3),-9(a3)`: the speed byte heads the header.
    const header = disp(b, codeEnd, [0x176b, null, 0xfff7], 1, 'speed');
    // `move.b patLen(a3),d1; mulu.w d0,d1; lea data(a3),a0; adda.l patterns(a3),a0`
    const patLen = disp(b, codeEnd, [0x122b, null, 0xc2c0, 0x41eb, null, 0xd1eb, null, 0xd288], 1, 'pattern length');
    const patField = disp(b, codeEnd, [0x122b, null, 0xc2c0, 0x41eb, null, 0xd1eb, null, 0xd288], 6, 'pattern');
    // The note limit `cmpi.b #$2e,d0` before the table read.
    const limitAt = findWords(b, [0x0200, 0x003f, 0x0c00], per - 24, per);
    const periodCount = limitAt >= 0 ? u16(b, limitAt + 6) : 0;
    if (data !== header + 0x23 || blocksField !== header + 5 || patLen !== header + 1 || patField !== header + 5 + 16 || periodCount !== 46) {
      throw new Error('Sound Master: unknown header layout');
    }
    return {
      layout: 'offsets', vars, header, data,
      posDisp: 0, blkDisp: 0, insDisp: 0, arpDisp: 0, waveDisp: 0, patDisp: 0,
      fields: { speed: header, patLen: header + 1, start: header + 2, end: header + 3, filter: header + 4, patSize: 0 },
      periodsAt, periodCount,
    };
  }

  // 'fixed': `lea blocks(a3),a0; adda.l (a5),a0; move.b (a0,d1.l),d0; adda.l #$400,a0`.
  const blkDisp = disp(b, codeEnd, [0x41eb, null, 0xd1ed, 0x0000, 0x1030, 0x1800, 0xd1fc, 0x0000, 0x0400], 1, 'block');
  // `lea positions(a3),a0; lea cur(a3),a1; moveq #2,d4; move.b (a0,d3.l),(a1)+`
  const posDisp = disp(b, codeEnd, [0x41eb, null, 0x43eb, null, 0x7802, 0x12f0, 0x3800], 1, 'position');
  // `move.b patLen(a3),d1; mulu.w d0,d1; lea patterns(a3),a0; add.l a0,d1; move.l d1,$16(a5)`
  const patLen = disp(b, codeEnd, [0x122b, null, 0xc2c0, 0x41eb, null, 0xd288, 0x2b41, 0x0016], 1, 'pattern length');
  const patDisp = disp(b, codeEnd, [0x122b, null, 0xc2c0, 0x41eb, null, 0xd288, 0x2b41, 0x0016], 4, 'pattern');
  // `mulu.w #14,d0; lea instruments(a3),a4`
  const insDisp = disp(b, codeEnd, [0xc0fc, 0x000e, 0x49eb, null], 3, 'instrument');
  const arpDisp = disp(b, codeEnd, [0x45eb, null, 0x1232, 0x0800], 1, 'arpeggio');
  const waveDisp = disp(b, codeEnd, [0x43eb, null, 0x1031, 0x0800], 1, 'wave');
  // `move.b speed(a3),curSpeed(a3); bclr #1,$bfe001`
  const speed = disp(b, codeEnd, [0x176b, null, null, 0x08b9, 0x0001, 0x00bf, 0xe001], 1, 'speed');
  const start = disp(b, codeEnd, [0x162b, null, 0x1743, 0xfffb], 1, 'start position');
  const end = disp(b, codeEnd, [0xb62b, null, 0x6616, 0x162b], 1, 'end position');
  const filter = disp(b, codeEnd, [0x4a2b, null, 0x6608, 0x08f9, 0x0001, 0x00bf, 0xe001], 1, 'filter');
  // `lea lengths(a3),a0; adda.l patSize(a3),a0; move.w (a0,d0.l),$a4(a6)`
  const lenDisp = disp(b, codeEnd, [0x41eb, null, 0xd1eb, null, 0x3d70, 0x0800, 0x00a4], 1, 'sample length');
  const patSize = disp(b, codeEnd, [0x41eb, null, 0xd1eb, null, 0x3d70, 0x0800, 0x00a4], 3, 'pattern size');
  if (blkDisp !== posDisp + 0x200 || insDisp !== blkDisp + 0x800 || arpDisp !== insDisp + 64 * 14
    || waveDisp !== arpDisp + 256 || patDisp !== waveDisp + 256 || lenDisp !== patDisp + 0x80) {
    throw new Error('Sound Master: unknown fixed table layout');
  }
  return {
    layout: 'fixed', vars, header: 0, data: 0,
    posDisp, blkDisp, insDisp, arpDisp, waveDisp, patDisp,
    fields: { speed, patLen, start, end, filter, patSize },
    periodsAt, periodCount: 64,
  };
}

function slice(b: Uint8Array, from: number, to: number): Uint8Array {
  if (from < 0 || to > b.length || to < from) throw new Error(`Sound Master: section ${from}..${to} is outside the file`);
  return b.slice(from, to);
}

// ── decode ──────────────────────────────────────────────────────────────────

/** Decode a Sound Master module; throws for a module whose player is not one this knows. */
export function decodeSoundMasterModule(buf: Uint8Array): SoundMasterModule {
  const L = locate(buf);
  const V = L.vars;
  if (L.layout === 'offsets') {
    const h = V + L.header;
    const data = V + L.data;
    const off = Array.from({ length: 7 }, (_, i) => u32(buf, h + 5 + i * 4));
    const [blk, ins, arp, wav, pat, sdr, si] = off;
    const patLen = buf[h + 1];
    if (!(blk % 8 === 0 && blk <= ins && (ins - blk) % 8 === 0 && ins <= arp && (arp - ins) % 16 === 0
      && arp <= wav && wav <= pat && patLen > 0 && pat <= si && (si - pat) % patLen === 0 && sdr % 10 === 0
      && data + si + sdr <= buf.length)) {
      throw new Error('Sound Master: the header offsets are not in table order');
    }
    const positions: SmPosition[] = [];
    for (let o = data; o < data + blk; o += 8) {
      positions.push({ first: buf[o], last: buf[o + 1], transpose: buf[o + 2], fade: buf[o + 3], voices: [buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]] });
    }
    const blocks: SmBlock[] = [];
    for (let o = data + blk; o < data + ins; o += 8) {
      blocks.push({ patterns: [buf[o], buf[o + 2], buf[o + 4], buf[o + 6]], transposes: [buf[o + 1], buf[o + 3], buf[o + 5], buf[o + 7]] });
    }
    const instruments: Uint8Array[] = [];
    for (let o = data + ins; o < data + arp; o += 16) instruments.push(slice(buf, o, o + 16));
    const patterns: Uint8Array[] = [];
    for (let o = data + pat; o < data + si; o += patLen) patterns.push(slice(buf, o, o + patLen));
    const samples: SmSampleSlot[] = [];
    for (let o = data + si; o < data + si + sdr; o += 10) {
      samples.push({ offset: s32(buf, o), length: u16(buf, o + 4), repeatOffset: u16(buf, o + 6), repeatLength: u16(buf, o + 8) });
    }
    return {
      layout: 'offsets', vars: V,
      player: slice(buf, 0, h),
      speed: buf[h], patternLength: patLen, start: buf[h + 2], end: buf[h + 3], filter: buf[h + 4],
      headerPad: u16(buf, h + 33),
      positions, positionTail: new Uint8Array(0), blocks, instruments,
      arpeggio: slice(buf, data + arp, data + wav),
      wave: slice(buf, data + wav, data + pat),
      patterns, samples,
      sampleData: slice(buf, data + si + sdr, buf.length),
    };
  }

  const F = L.fields;
  const patLen = buf[V + F.patLen];
  const patSize = u32(buf, V + F.patSize);
  const posAt = V + L.posDisp;
  const positions: SmPosition[] = Array.from({ length: 64 }, (_, p) => ({
    first: buf[posAt + p], last: buf[posAt + 64 + p], transpose: buf[posAt + 128 + p], fade: buf[posAt + 192 + p],
    voices: [0, 1, 2, 3].map((v) => buf[posAt + 256 + v * 64 + p]),
  }));
  const blkAt = V + L.blkDisp;
  const blocks: SmBlock[] = Array.from({ length: 256 }, (_, k) => ({
    patterns: [0, 1, 2, 3].map((v) => buf[blkAt + v * 256 + k]),
    transposes: [0, 1, 2, 3].map((v) => buf[blkAt + 0x400 + v * 256 + k]),
  }));
  const insAt = V + L.insDisp;
  const instruments = Array.from({ length: 64 }, (_, i) => slice(buf, insAt + i * 14, insAt + i * 14 + 14));
  const patAt = V + L.patDisp;
  if (!(patLen > 0 && patSize % patLen === 0 && patAt + patSize + 0x140 <= buf.length)) throw new Error('Sound Master: patterns run past the file');
  const patterns = Array.from({ length: patSize / patLen }, (_, p) => slice(buf, patAt + p * patLen, patAt + p * patLen + patLen));
  const st = patAt + patSize;
  const samples: SmSampleSlot[] = Array.from({ length: 32 }, (_, s) => ({
    offset: s32(buf, st + s * 4), length: u16(buf, st + 0x80 + s * 2),
    repeatOffset: u16(buf, st + 0xc0 + s * 2), repeatLength: u16(buf, st + 0x100 + s * 2),
  }));
  return {
    layout: 'fixed', vars: V,
    player: slice(buf, 0, posAt),
    speed: buf[V + F.speed], patternLength: patLen, start: buf[V + F.start], end: buf[V + F.end], filter: buf[V + F.filter],
    headerPad: 0,
    positions, positionTail: slice(buf, posAt + 448, posAt + 512), blocks, instruments,
    arpeggio: slice(buf, V + L.arpDisp, V + L.arpDisp + 256),
    wave: slice(buf, V + L.waveDisp, V + L.waveDisp + 256),
    patterns, samples,
    sampleData: slice(buf, st + 0x140, buf.length),
  };
}

// ── encode ──────────────────────────────────────────────────────────────────

/** The module as bytes: the exact inverse of decodeSoundMasterModule. */
export function encodeSoundMasterModule(m: SoundMasterModule): Uint8Array {
  const patBytes = m.patterns.length * m.patternLength;
  if (m.layout === 'offsets') {
    const blk = m.positions.length * 8;
    const ins = blk + m.blocks.length * 8;
    const arp = ins + m.instruments.length * 16;
    const wav = arp + m.arpeggio.length;
    const pat = wav + m.wave.length;
    const si = pat + patBytes;
    const sdr = m.samples.length * 10;
    const size = m.player.length + 0x23 + si + sdr + m.sampleData.length;
    const out = new Uint8Array(size);
    out.set(m.player, 0);
    let o = m.player.length;
    out[o] = m.speed; out[o + 1] = m.patternLength; out[o + 2] = m.start; out[o + 3] = m.end; out[o + 4] = m.filter;
    [blk, ins, arp, wav, pat, sdr, si].forEach((v, i) => put32(out, o + 5 + i * 4, v));
    put16(out, o + 33, m.headerPad);
    o += 0x23;
    for (const p of m.positions) { out.set([p.first, p.last, p.transpose, p.fade, ...p.voices], o); o += 8; }
    for (const k of m.blocks) {
      for (let v = 0; v < 4; v++) { out[o + v * 2] = k.patterns[v]; out[o + v * 2 + 1] = k.transposes[v]; }
      o += 8;
    }
    for (const i of m.instruments) { out.set(i, o); o += 16; }
    out.set(m.arpeggio, o); o += m.arpeggio.length;
    out.set(m.wave, o); o += m.wave.length;
    for (const p of m.patterns) { out.set(p, o); o += m.patternLength; }
    for (const s of m.samples) {
      put32(out, o, s.offset); put16(out, o + 4, s.length); put16(out, o + 6, s.repeatOffset); put16(out, o + 8, s.repeatLength);
      o += 10;
    }
    out.set(m.sampleData, o);
    return out;
  }

  const L = locate(m.player);
  const V = m.vars;
  const size = m.player.length + 512 + 0x800 + 64 * 14 + 512 + patBytes + 0x140 + m.sampleData.length;
  const out = new Uint8Array(size);
  out.set(m.player, 0);
  out[V + L.fields.speed] = m.speed;
  out[V + L.fields.patLen] = m.patternLength;
  out[V + L.fields.start] = m.start;
  out[V + L.fields.end] = m.end;
  out[V + L.fields.filter] = m.filter;
  put32(out, V + L.fields.patSize, patBytes);
  let o = m.player.length;
  m.positions.forEach((p, i) => {
    out[o + i] = p.first; out[o + 64 + i] = p.last; out[o + 128 + i] = p.transpose; out[o + 192 + i] = p.fade;
    for (let v = 0; v < 4; v++) out[o + 256 + v * 64 + i] = p.voices[v];
  });
  out.set(m.positionTail, o + 448);
  o += 512;
  m.blocks.forEach((k, i) => {
    for (let v = 0; v < 4; v++) { out[o + v * 256 + i] = k.patterns[v]; out[o + 0x400 + v * 256 + i] = k.transposes[v]; }
  });
  o += 0x800;
  for (const i of m.instruments) { out.set(i, o); o += 14; }
  out.set(m.arpeggio, o); o += 256;
  out.set(m.wave, o); o += 256;
  for (const p of m.patterns) { out.set(p, o); o += m.patternLength; }
  m.samples.forEach((s, i) => {
    put32(out, o + i * 4, s.offset); put16(out, o + 0x80 + i * 2, s.length);
    put16(out, o + 0xc0 + i * 2, s.repeatOffset); put16(out, o + 0x100 + i * 2, s.repeatLength);
  });
  o += 0x140;
  out.set(m.sampleData, o);
  return out;
}

// ── addresses the player uses ───────────────────────────────────────────────

/** File offsets of the patterns, instruments and sample data, and the player's period table. */
export function soundMasterAddresses(m: SoundMasterModule): SmAddresses {
  const L = locate(m.player);
  const periodsAt = L.periodsAt;
  const periods = Array.from({ length: L.periodCount }, (_, i) => u16(m.player, periodsAt + i * 2));
  if (m.layout === 'offsets') {
    const data = m.player.length + 0x23;
    const ins = data + m.positions.length * 8 + m.blocks.length * 8;
    const pat = ins + m.instruments.length * 16 + m.arpeggio.length + m.wave.length;
    return {
      patterns: pat, instruments: ins,
      sampleData: pat + m.patterns.length * m.patternLength + m.samples.length * 10,
      periods, periodBase: 18,
    };
  }
  const ins = m.player.length + 512 + 0x800;
  const pat = ins + 64 * 14 + 512;
  return { patterns: pat, instruments: ins, sampleData: pat + m.patterns.length * m.patternLength + 0x140, periods, periodBase: 0 };
}
