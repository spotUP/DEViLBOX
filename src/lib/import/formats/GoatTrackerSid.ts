/**
 * A GoatTracker 2 song compiled into a PSID, opened back as a GoatTracker song.
 *
 * GoatTracker 2's packer/relocator (greloc.c, GoatTracker v2.7x by Lasse Oorni,
 * GPL) assembles player.s and appends the song data after the code, in label
 * order:
 *
 *   mt_freqtbllo/hi                 frequency table (FIRSTNOTE..lastnote)
 *   mt_songtbllo/hi                 songs*3 orderlist pointers
 *   mt_patttbllo/hi                 one pointer per used pattern
 *   mt_insad, mt_inssr, mt_inswaveptr, [mt_inspulseptr], [mt_insfiltptr],
 *   [mt_insvibparam, mt_insvibdelay], [mt_insgatetimer, mt_insfirstwave]
 *                                   one column per field, one byte per instrument
 *   mt_wavetbl/mt_notetbl, [mt_pulsetimetbl/mt_pulsespdtbl],
 *   [mt_filttimetbl/mt_filtspdtbl], [0] mt_speedlefttbl, [0] mt_speedrighttbl
 *   mt_song0..                      orderlists, three per subtune
 *   mt_patt0..                      packed patterns
 *
 * Which optional columns and tables exist, and the parameters folded into the
 * code (instrument order, fixed gatetimer / firstwave, default tempo), are
 * assembly-time conditionals, so the decoder reads them where the player code
 * references them: every table is loaded with an absolute,Y instruction whose
 * operand is the label (mostly label-1). The player is found by its SIDId
 * signature (sidid.cfg by Cadaver, "GoatTracker_V2.x").
 *
 * The packer drops what the player does not need, so the decoded song is the
 * song as it plays, not the editor file it came from: instruments are renumbered
 * by type (hard restart, no hard restart, legato) and unused ones are gone, as
 * are unused patterns and table rows (tables are compacted, pointers remapped),
 * names (empty), repeated instrument numbers on consecutive notes, and
 * zero-length subtunes. Everything that plays is kept.
 */

import { isGoatTrackerSong as isGoatTrackerSng } from './GoatTrackerDetect';

// ---------------------------------------------------------------------------
// The GoatTracker song model (the .sng file's content)
// ---------------------------------------------------------------------------

export const GT_MAX_INSTR = 64;
export const GT_TABLES = 4;
export const GT_WTBL = 0;
export const GT_PTBL = 1;
export const GT_FTBL = 2;
export const GT_STBL = 3;

/** Pattern bytes as GoatTracker stores them. */
export const GT_FIRSTNOTE = 0x60;
export const GT_REST = 0xbd;
export const GT_ENDPATT = 0xff;
/** Orderlist bytes. */
export const GT_REPEAT = 0xd0;
export const GT_TRANSDOWN = 0xe0;
export const GT_LOOPSONG = 0xff;

export interface GTInstrument {
  ad: number;
  sr: number;
  /** Table pointers: wave, pulse, filter, speed (vibrato). */
  ptr: [number, number, number, number];
  vibdelay: number;
  gatetimer: number;
  firstwave: number;
  name: string;
}

export interface GTSongData {
  name: string;
  author: string;
  copyright: string;
  /** [subtune][channel] = orderlist entries, then LOOPSONG and the restart position. */
  orderlists: number[][][];
  /** Index 1..63; index 0 unused. Missing entries are empty instruments. */
  instruments: GTInstrument[];
  /** Left and right columns of the wave, pulse, filter and speed tables. */
  tables: Array<{ left: number[]; right: number[] }>;
  /** Each pattern: rows of [note, instrument, command, data]. */
  patterns: number[][][];
}

export function emptyGTInstrument(): GTInstrument {
  return { ad: 0, sr: 0, ptr: [0, 0, 0, 0], vibdelay: 0, gatetimer: 0, firstwave: 0, name: '' };
}

function readText(b: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && b[off + i]; i++) s += String.fromCharCode(b[off + i]);
  return s;
}

function writeText(out: number[], s: string, len: number): void {
  for (let i = 0; i < len; i++) out.push(i < s.length ? s.charCodeAt(i) & 0xff : 0);
}

/** Read a GTS5 .sng (GoatTracker 2.7x; gsong.c loadsong). Null for anything else. */
export function parseGoatTrackerSng(b: Uint8Array): GTSongData | null {
  if (b.length < 4 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'GTS5') return null;
  let p = 4;
  const u8 = (): number => {
    if (p >= b.length) throw new Error('truncated .sng');
    return b[p++];
  };
  try {
    const name = readText(b, p, 32); p += 32;
    const author = readText(b, p, 32); p += 32;
    const copyright = readText(b, p, 32); p += 32;
    const songs = u8();
    const orderlists: number[][][] = [];
    for (let s = 0; s < songs; s++) {
      const chans: number[][] = [];
      for (let c = 0; c < 3; c++) {
        const len = u8();
        const ol: number[] = [];
        for (let i = 0; i <= len; i++) ol.push(u8());
        chans.push(ol);
      }
      orderlists.push(chans);
    }
    const instruments: GTInstrument[] = [emptyGTInstrument()];
    const ninstr = u8();
    for (let i = 1; i <= ninstr; i++) {
      const ad = u8(), sr = u8();
      const ptr: [number, number, number, number] = [u8(), u8(), u8(), u8()];
      const vibdelay = u8(), gatetimer = u8(), firstwave = u8();
      const iname = readText(b, p, 16); p += 16;
      instruments.push({ ad, sr, ptr, vibdelay, gatetimer, firstwave, name: iname });
    }
    const tables: GTSongData['tables'] = [];
    for (let t = 0; t < GT_TABLES; t++) {
      const len = u8();
      const left = Array.from(b.subarray(p, p + len)); p += len;
      const right = Array.from(b.subarray(p, p + len)); p += len;
      tables.push({ left, right });
    }
    const npatt = u8();
    const patterns: number[][][] = [];
    for (let i = 0; i < npatt; i++) {
      const len = u8();
      const rows: number[][] = [];
      for (let r = 0; r < len; r++) rows.push([u8(), u8(), u8(), u8()]);
      // The last row is the end mark.
      if (rows.length && rows[rows.length - 1][0] === GT_ENDPATT) rows.pop();
      patterns.push(rows);
    }
    return { name, author, copyright, orderlists, instruments, tables, patterns };
  } catch {
    return null;
  }
}

/** Write a GTS5 .sng (gsong.c savesong). */
export function writeGoatTrackerSng(song: GTSongData, settings?: GTPlaySettings): Uint8Array {
  const out: number[] = [0x47, 0x54, 0x53, 0x35];
  writeText(out, song.name, 32);
  writeText(out, song.author, 32);
  writeText(out, song.copyright, 32);
  out.push(song.orderlists.length);
  for (const chans of song.orderlists) {
    for (const ol of chans) {
      out.push(ol.length - 1);
      out.push(...ol);
    }
  }
  let highest = 0;
  song.instruments.forEach((ins, i) => {
    if (i && ins && (ins.ad || ins.sr || ins.ptr.some((v) => v) || ins.vibdelay)) highest = i;
  });
  out.push(highest);
  for (let i = 1; i <= highest; i++) {
    const ins = song.instruments[i] ?? emptyGTInstrument();
    out.push(ins.ad, ins.sr, ...ins.ptr, ins.vibdelay, ins.gatetimer, ins.firstwave);
    writeText(out, ins.name, 16);
  }
  for (let t = 0; t < GT_TABLES; t++) {
    const { left, right } = song.tables[t] ?? { left: [], right: [] };
    out.push(left.length, ...left, ...right);
  }
  out.push(song.patterns.length);
  for (const rows of song.patterns) {
    out.push(rows.length + 1);
    for (const r of rows) out.push(r[0], r[1], r[2], r[3]);
    out.push(GT_ENDPATT, 0, 0, 0);
  }
  if (settings) {
    // GTUltra's editor settings (gsong.c savesong): the engine reads them back
    // on load, which is how a multispeed or 25 Hz song reaches its tick rate.
    const le32 = (v: number): number[] => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    out.push(0x1f, 0, 0, 0, settings.ntsc ? 1 : 0, 0, ...le32(settings.adparam), ...le32(settings.multiplier), ...le32(3), 0);
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// PSID -> C64 memory
// ---------------------------------------------------------------------------

interface SidImage {
  mem: Uint8Array;
  load: number;
  end: number;
  name: string;
  author: string;
  copyright: string;
}

function loadSidImage(file: Uint8Array): SidImage | null {
  if (file.length < 0x7c) return null;
  const magic = String.fromCharCode(file[0], file[1], file[2], file[3]);
  if (magic !== 'PSID' && magic !== 'RSID') return null;
  const dataOffset = (file[6] << 8) | file[7];
  let load = (file[8] << 8) | file[9];
  let data = file.subarray(dataOffset);
  if (load === 0) {
    if (data.length < 2) return null;
    load = data[0] | (data[1] << 8);
    data = data.subarray(2);
  }
  if (load + data.length > 0x10000) return null;
  const mem = new Uint8Array(0x10000);
  mem.set(data, load);
  return {
    mem, load, end: load + data.length,
    name: readText(file, 0x16, 32), author: readText(file, 0x36, 32), copyright: readText(file, 0x56, 32),
  };
}

// ---------------------------------------------------------------------------
// Code scanning
// ---------------------------------------------------------------------------

/** Byte pattern, null = any byte. */
type Sig = Array<number | null>;

function sig(s: string): Sig {
  return s.split(' ').map((t) => (t === '??' ? null : parseInt(t, 16)));
}

function matchAt(mem: Uint8Array, at: number, p: Sig): boolean {
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (v !== null && mem[at + i] !== v) return false;
  }
  return true;
}

function findAll(mem: Uint8Array, from: number, to: number, p: Sig): number[] {
  const hits: number[] = [];
  for (let a = from; a + p.length <= to; a++) if (matchAt(mem, a, p)) hits.push(a);
  return hits;
}

const w16 = (mem: Uint8Array, a: number): number => mem[a] | (mem[a + 1] << 8);

/** SIDId "GoatTracker_V2.x" (sidid.cfg): the sequencer reading the song table. */
const GT2_SEQUENCER = sig('BD ?? ?? D0 ?? BC ?? ?? B9 ?? ?? 85 ?? B9 ?? ?? 85 ?? BC ?? ?? B1 ?? C9 FF 90');
/** SIDId "GT_V2.x_2SID": the six-channel GoatTracker stereo player. */
const GT2_2SID = sig('8A A2 53 9D ?? ?? CA 10 FA 8D 15 D4 8D');
/** mt_getnewnote: ldy chnpattnum,x / lda patttbllo,y / sta / lda patttblhi,y / sta / ldy chnpattptr,x / lda (zp),y */
const GT2_NEWNOTE = sig('BC ?? ?? B9 ?? ?? 85 ?? B9 ?? ?? 85 ?? BC ?? ?? B1');

/** Opcodes with absolute,Y addressing: the player's table reads. */
const ABS_Y = new Set([0x19, 0x39, 0x59, 0x79, 0x99, 0xb9, 0xbe, 0xd9, 0xf9]);

export interface GT2SidLayout {
  songs: number;
  patterns: number;
  instruments: number;
  /** Optional instrument columns / tables present in this build. */
  hasPulse: boolean;
  hasFilter: boolean;
  hasInstrVib: boolean;
  fixedParams: boolean;
  noWaveDelay: boolean;
  simplePulse: boolean;
  speedZero: boolean;
  tableSizes: [number, number, number, number];
  firstNoHr: number;
  firstLegato: number;
  defaultTempo: number;
  /** Speed multiplier the SID was packed with (1 = 50/60 Hz, 0 = 25 Hz). A GoatTracker 2 .sng does not store it; GTUltra's settings block does. */
  multiplier: number;
  /** Packed for NTSC (PSID clock flag). */
  ntsc: boolean;
  /** Hard restart ADSR as GoatTracker's -A option: attack/decay in the high byte, sustain/release in the low; 0 when the build has no hard restart. */
  adparam: number;
}

/** What GTUltra's .sng settings block (ID 0x1f, gsong.c) carries that a plain GoatTracker 2 .sng does not. */
export interface GTPlaySettings {
  multiplier: number;
  ntsc: boolean;
  adparam: number;
}

export interface GT2SidDecode {
  song: GTSongData;
  layout: GT2SidLayout;
}

class DecodeError extends Error {}
function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new DecodeError(what);
}

/**
 * Decode a GoatTracker-2-compiled PSID into GoatTracker song data. Null when
 * the file is not a GoatTracker 2 (3-channel) build or its layout cannot be
 * read back unambiguously; the reason is in `whyNot` for diagnostics.
 */
export function decodeGoatTracker2Sid(file: Uint8Array, whyNot?: (reason: string) => void): GT2SidDecode | null {
  try {
    return decode(file);
  } catch (e) {
    if (e instanceof DecodeError) { whyNot?.(e.message); return null; }
    throw e;
  }
}

function decode(file: Uint8Array): GT2SidDecode {
  const img = loadSidImage(file);
  need(img, 'not a PSID/RSID');
  const { mem, load, end } = img;
  need(findAll(mem, load, end, GT2_2SID).length === 0, 'GoatTracker stereo (2SID) build');

  // --- song table, from the sequencer -------------------------------------
  const seq = findAll(mem, load, end, GT2_SEQUENCER);
  need(seq.length === 1, `GoatTracker 2 sequencer found ${seq.length} times`);
  const songLo = w16(mem, seq[0] + 9);
  const songHi = w16(mem, seq[0] + 14);
  const songSlots = songHi - songLo;
  need(songSlots > 0 && songSlots % 3 === 0 && songLo > seq[0] && songHi + songSlots <= end, 'song table');
  const songs = songSlots / 3;
  // The player code ends where mt_freqtbllo starts: two tables in front of the
  // song table, lo then hi, a semitone apart note to note.
  const code = { from: load, to: songLo - 2 * frequencyTableLength(mem, songLo) };

  // --- pattern table, from the note fetch ---------------------------------
  const pattLo = songHi + songSlots;
  const nn = findAll(mem, code.from, code.to, GT2_NEWNOTE).filter((a) => w16(mem, a + 4) === pattLo);
  need(nn.length === 1, 'pattern table reference');
  const pattHi = w16(mem, nn[0] + 9);
  const patterns = pattHi - pattLo;
  need(patterns > 0 && patterns <= 208, 'pattern count');
  const ins = pattHi + patterns;

  // Every absolute,Y operand in the code: the table labels the player reads.
  const refs = new Map<number, number[]>();
  for (let a = code.from; a + 3 <= code.to; a++) {
    if (!ABS_Y.has(mem[a])) continue;
    const op = w16(mem, a + 1);
    const list = refs.get(op);
    if (list) list.push(a); else refs.set(op, [a]);
  }
  const refAt = (op: number): number[] => refs.get(op) ?? [];

  // --- instruments ---------------------------------------------------------
  // Each table's start is read as "lda label,y / cmp #$ff" (the jump check of
  // the wave, pulse and filter steps); the first one after the instruments is
  // the wave table, so the instrument columns fill [ins, waveTbl).
  const tableStarts = findAll(mem, code.from, code.to, sig('B9 ?? ?? C9 FF'))
    .map((a) => w16(mem, a + 1)).filter((t) => t > ins && t <= end).sort((x, y) => x - y);
  need(tableStarts.length > 0, 'wave table reference');
  const waveTbl = tableStarts[0];
  const isLoad = (op: number): boolean => refAt(op).some((a) => mem[a] === 0xb9);
  const loadFollowedBy = (op: number, p: Sig): boolean =>
    refAt(op).some((a) => mem[a] === 0xb9 && matchAt(mem, a + 3, p));

  // FIXEDPARAMS: the gate-off check compares with an immediate instead of the
  // channel's gatetimer, right before mt_getnewnote.
  const toNewNote = (a: number, len: number): boolean => a + len + ((mem[a + len - 1] << 24) >> 24) === nn[0];
  const gateImm = findAll(mem, code.from, code.to, sig('BD ?? ?? C9 ?? F0 ??')).filter((a) => toNewNote(a, 7));
  const gateVar = findAll(mem, code.from, code.to, sig('BD ?? ?? DD ?? ?? F0 ??')).filter((a) => toNewNote(a, 8));
  need(gateImm.length + gateVar.length >= 1 && !(gateImm.length && gateVar.length), 'gate timer check');
  const notFixed = gateVar.length > 0;

  // Columns: ad, sr, wave, [pulse], [filter], [vibparam, vibdelay], [gatetimer, firstwave].
  // (mt_wavetbl-2 is read too, by the wave command check: not an instrument column.)
  const insReads = [...refs.keys()].filter((op) => op >= ins - 1 && op < waveTbl - 2 && isLoad(op));
  const fits: Array<{ I: number; p: boolean; f: boolean; v: boolean }> = [];
  for (let ncols = 3; ncols <= 9; ncols++) {
    if ((waveTbl - ins) % ncols) continue;
    const I = (waveTbl - ins) / ncols;
    if (I < 1 || I > 63) continue;
    const extra = ncols - 3 - (notFixed ? 2 : 0);
    if (extra < 0 || extra > 4) continue;
    const col = (k: number): number => ins - 1 + k * I;
    if (!isLoad(col(0)) || !isLoad(col(1)) || !isLoad(col(2))) continue;
    // Every read inside the instrument block must be a column start.
    if (insReads.some((op) => (op - (ins - 1)) % I !== 0)) continue;
    // lda mt_inspulseptr-1,y / beq / sta chnpulseptr,x ; lda mt_insfiltptr-1,y / beq / sta mt_filtstep+1
    const pulseAt3 = loadFollowedBy(col(3), sig('F0 ?? 9D'));
    const filtAt3 = loadFollowedBy(col(3), sig('F0 ?? 8D'));
    const filtAt4 = loadFollowedBy(col(4), sig('F0 ?? 8D'));
    let p = false, f = false, v = false;
    if (extra === 1) { p = pulseAt3; f = filtAt3; }
    else if (extra === 2) { if (pulseAt3 && filtAt4) { p = true; f = true; } else v = true; }
    else if (extra === 3) { v = true; p = pulseAt3; f = filtAt3; }
    else if (extra === 4) { p = true; f = true; v = true; }
    if (+p + +f + 2 * +v !== extra) continue;
    const vibdelay = 3 + +p + +f + 1;
    if (v && !isLoad(col(vibdelay))) continue;
    if (notFixed && (!isLoad(col(vibdelay + (v ? 1 : -1))) || !isLoad(col(vibdelay + (v ? 2 : 0))))) continue;
    fits.push({ I, p, f, v });
  }
  need(fits.length === 1, `instrument columns: ${fits.length} layouts fit ${JSON.stringify(fits)}`);
  const { I, p: hasPulse, f: hasFilter, v: hasInstrVib } = fits[0];
  const column = (k: number): Uint8Array => mem.subarray(ins + k * I, ins + (k + 1) * I);
  const waveRead = refAt(waveTbl - 1).filter((a) => mem[a] === 0xb9);
  need(waveRead.length >= 1, 'wave table reference');
  // cmp #$10 / bcs: delays 1-15 exist; beq: they do not.
  const noWaveDelay = !waveRead.some((a) => matchAt(mem, a + 3, sig('C9 10 B0')));
  const has = (op: number): boolean => refAt(op).length > 0;

  const songPtr = (i: number): number => mem[songLo + i] | (mem[songHi + i] << 8);
  const orderStart = songPtr(0);
  need(orderStart > waveTbl && orderStart <= end, 'orderlist start');

  // The wave, pulse and filter steps each read their table's start with
  // "lda label,y / cmp #$ff" (tableStarts); the speed table, last, has none.
  const steps = tableStarts.filter((t) => t < orderStart);
  need(steps.length === 1 + +hasPulse + +hasFilter, `step tables: ${steps.length}`);
  const halves = steps.slice(1).map((t, i) => (t - steps[i]) / 2);
  need(halves.every((n) => Number.isInteger(n) && n >= 0), 'step table sizes');
  // The last step table and the speed table share what is left.
  const lastStart = steps[steps.length - 1];
  type Sizes = [number, number, boolean];
  const solutions: Sizes[] = [];
  for (let L = 0; L <= 255; L++) {
    const afterL = lastStart + 2 * L;
    if (!has(lastStart + L - 1)) continue;   // lda <right side>-1,y
    const rest = orderStart - afterL;
    if (rest === 0) { solutions.push([L, 0, false]); continue; }
    if (rest > 0 && rest % 2 === 0) {
      // A zero entry in front of each side of the speed table.
      const S = rest / 2 - 1;
      const left = afterL + 1, right = left + S + 1;
      if (S >= 0 && S <= 255 && has(left - 1) && has(right - 1)) solutions.push([L, S, true]);
    }
  }
  // More than one split fits: keep the one that explains every table read in
  // the code (player.s reads each table at label-1, the step tables also at
  // label, the wave and note tables also at label-2).
  if (solutions.length > 1) {
    const tableReads = [...refs.keys()].filter((op) => op >= waveTbl - 2 && op < orderStart);
    const explained = solutions.filter(([L, S, z]) => {
      const sizesOf = [...halves, L];
      const labels: number[] = [];
      steps.forEach((t, i) => {
        const right = t + sizesOf[i];
        labels.push(t - 1, t, right - 1);
        if (i === 0) labels.push(t - 2, right - 2);
      });
      if (z) {
        const left = lastStart + 2 * L + 1;
        labels.push(left - 1, left + S);
      }
      return tableReads.every((op) => labels.includes(op));
    });
    solutions.splice(0, solutions.length, ...explained);
  }
  need(solutions.length === 1, `table layout: ${JSON.stringify(solutions)}`);
  const sizes = [...halves, solutions[0][0]];
  const W = sizes[0];
  const Pn = hasPulse ? sizes[1] : 0;
  const F = hasFilter ? sizes[1 + +hasPulse] : 0;
  const [, Sp, speedZero] = solutions[0];

  const noteTbl = waveTbl + W;
  const pulseTime = noteTbl + W, pulseSpd = pulseTime + Pn;
  const filtTime = pulseSpd + Pn, filtSpd = filtTime + F;
  const speedLeft = filtSpd + F + (speedZero ? 1 : 0);
  const speedRight = speedLeft + Sp + (speedZero ? 1 : 0);

  // simplepulse: the pulse "set" step reads one byte for both halves.
  const simplePulse = hasPulse && Pn > 0 && isSimplePulse(mem, refAt, pulseTime, pulseSpd);

  // --- parameters folded into the code -------------------------------------
  // Hard restart (player.s mt_normalnote): lda #SRPARAM / sta <where the
  // instrument's sr goes> / lda #ADPARAM / sta <where its ad goes>. The two
  // stores are read from the instrument load (lda mt_inssr-1,y / sta ..).
  const storeAfter = (op: number): number[] | null => {
    for (const a of refAt(op)) {
      if (mem[a] !== 0xb9) continue;
      const o = mem[a + 3];
      if (o === 0x9d || o === 0x8d) return [o, mem[a + 4], mem[a + 5]];
      if (o === 0x95) return [o, mem[a + 4]];
    }
    return null;
  };
  const srStore = storeAfter(ins - 1 + I), adStore = storeAfter(ins - 1);
  need(srStore && adStore, 'sr/ad stores');
  const hrBlock: Sig = [0xa9, null, ...srStore, 0xa9, null, ...adStore];
  const hrAt = findAll(mem, code.from, code.to, hrBlock);
  need(hrAt.length <= 1, 'hard restart write');
  // lda chninstr,x / cmp #FIRSTNOHRINSTR / bcs (mt_nohr_legato: cmp #FIRSTLEGATOINSTR / bcc / bcs | mt_skiphr)
  const branchTo = (a: number, len: number): number => a + len + ((mem[a + len - 1] << 24) >> 24);
  const legatoAt = (a: number): boolean => matchAt(mem, branchTo(a, 7), sig('C9 ?? 90 ?? B0 ??'));
  const nohrCmp = findAll(mem, code.from, code.to, sig('BD ?? ?? C9 ?? B0 ??'))
    .filter((a) => (hrAt.length && hrAt[0] === a + 7) || legatoAt(a));
  need(nohrCmp.length <= 1, 'instrument order compare');
  // Speed multiplier: a multispeed build starts with the CIA timer setup
  // (greloc.c speedcode: ldx #lo / stx $dc04 / ldx #hi / stx $dc05) in front of
  // the player; 0 is the half-speed (25 Hz) setting.
  const multiplier = speedMultiplier(file, mem, load);
  const ntsc = (file[0x77] & 0x0c) === 0x08;
  // lda #SRPARAM (hrAt+1) ... lda #ADPARAM (after the sr store).
  const adparam = hrAt.length ? (mem[hrAt[0] + 3 + srStore.length] << 8) | mem[hrAt[0] + 1] : 0;
  let firstNoHr: number;
  let firstLegato = 0xff;
  if (nohrCmp.length) {
    firstNoHr = mem[nohrCmp[0] + 4];
    if (legatoAt(nohrCmp[0])) firstLegato = mem[branchTo(nohrCmp[0], 7) + 1];
    // greloc.c counts one extra no-hard-restart instrument for multispeed
    // stability after numbering the instruments, so the compare is one higher.
    if (multiplier > 1 && firstLegato !== 0xff) firstLegato--;
  } else {
    // One kind only: hard restart instruments if the player has the write.
    firstNoHr = hrAt.length ? 0xff : 1;
  }

  // mt_defaulttempo: lda #DEFAULTTEMPO / sta chntempo,x / lda #1 / sta / sta / jmp
  const tempo = findAll(mem, code.from, code.to, sig('A9 ?? 9D ?? ?? A9 01 9D ?? ?? 9D ?? ?? 4C'));
  need(tempo.length === 1, 'default tempo');
  const defaultTempo = mem[tempo[0] + 1];

  let fixedGate = 0, fixedFirst = 0;
  if (!notFixed) {
    // cmp #GATETIMERPARAM / beq mt_getnewnote
    fixedGate = mem[gateImm[0] + 4];
    // lda #FIRSTWAVEPARAM / sta chnwave,x / (lda #$ff / sta chngate,x | inc chngate,x),
    // chnwave being the store the wave table step makes
    const chnWave = waveStore(mem, waveRead);
    const all = [...findAll(mem, code.from, code.to, sig('A9 ?? 9D ?? ?? A9 FF 9D')),
      ...findAll(mem, code.from, code.to, sig('A9 ?? 9D ?? ?? FE'))];
    const fw = all.length === 1 ? all : all.filter((a) => w16(mem, a + 3) === chnWave);
    need(fw.length === 1, 'fixed firstwave');
    fixedFirst = mem[fw[0] + 1];
  }

  // --- instruments back to editor form -------------------------------------
  const colIdx = { pulse: 3, filt: 3 + +hasPulse, vibparam: 3 + +hasPulse + +hasFilter };
  const vibdelayIdx = colIdx.vibparam + 1;
  const gateIdx = colIdx.vibparam + 2 * +hasInstrVib;
  const instrumentsOut: GTInstrument[] = [emptyGTInstrument()];
  for (let i = 0; i < I; i++) {
    const n = i + 1;
    const vibparam = hasInstrVib ? column(colIdx.vibparam)[i] : 0;
    const vibd = hasInstrVib ? column(vibdelayIdx)[i] : 0;
    const typeBits = n >= firstLegato ? 0x40 : n >= firstNoHr ? 0x80 : 0;
    instrumentsOut.push({
      ad: column(0)[i],
      sr: column(1)[i],
      ptr: [
        column(2)[i],
        hasPulse ? column(colIdx.pulse)[i] : 0,
        hasFilter ? column(colIdx.filt)[i] : 0,
        vibparam,
      ],
      vibdelay: vibparam || vibd ? vibd + 1 : 0,
      gatetimer: (notFixed ? column(gateIdx)[i] : fixedGate) | typeBits,
      firstwave: notFixed ? column(gateIdx + 1)[i] : fixedFirst,
      name: '',
    });
  }
  // The default tempo rides on instrument 63 (greloc.c: ad >= 2, no wave
  // pointer); without it the packer uses multiplier*6-1 (5 at 25 Hz).
  if (defaultTempo !== (multiplier ? multiplier * 6 - 1 : 5) && I < 63) {
    while (instrumentsOut.length < 63) instrumentsOut.push(emptyGTInstrument());
    instrumentsOut.push({ ...emptyGTInstrument(), ad: defaultTempo + 1 });
  }

  // --- tables back to editor form ------------------------------------------
  const wl = Array.from(mem.subarray(waveTbl, waveTbl + W));
  const wr = Array.from(mem.subarray(noteTbl, noteTbl + W));
  const waveLeft = wl.map((v) => unpackWaveLeft(v, noWaveDelay));
  const waveRight = wr.map((v, i) => {
    const l = waveLeft[i];
    if (l === 0xff) return v;                // jump target (already compacted)
    if (l >= 0xf0) return v;                 // wavetable command parameter
    return v ^ 0x80;                         // note: high bit reversed for the player
  });
  const tables: GTSongData['tables'] = [
    { left: waveLeft, right: waveRight },
    { left: [], right: [] },
    { left: [], right: [] },
    { left: Array.from(mem.subarray(speedLeft, speedLeft + Sp)), right: Array.from(mem.subarray(speedRight, speedRight + Sp)) },
  ];
  if (hasPulse) {
    const pl = Array.from(mem.subarray(pulseTime, pulseTime + Pn));
    const pr = Array.from(mem.subarray(pulseSpd, pulseSpd + Pn));
    const left: number[] = [], right: number[] = [];
    for (let i = 0; i < Pn; i++) {
      const [l, r] = simplePulse ? unpackSimplePulse(pl[i], pr[i]) : [pl[i], pr[i]];
      left.push(l); right.push(r);
    }
    tables[GT_PTBL] = { left, right };
  }
  if (hasFilter) {
    const fl = Array.from(mem.subarray(filtTime, filtTime + F));
    tables[GT_FTBL] = {
      left: fl.map((v) => (v !== 0xff && v > 0x80 ? ((v & 0x38) << 1) | 0x80 : v)),
      right: Array.from(mem.subarray(filtSpd, filtSpd + F)),
    };
  }

  // --- orderlists ----------------------------------------------------------
  const orderlists: number[][][] = [];
  let orderEnd = orderStart;
  for (let s = 0; s < songs; s++) {
    const chans: number[][] = [];
    for (let c = 0; c < 3; c++) {
      let a = songPtr(s * 3 + c);
      need(a >= orderStart && a < end, 'orderlist pointer');
      const raw: number[] = [];
      while (mem[a] !== GT_LOOPSONG) {
        need(a < end && raw.length < 256, 'orderlist end');
        raw.push(mem[a++]);
      }
      const restart = mem[a + 1];
      orderEnd = Math.max(orderEnd, a + 2);
      // The packer writes "pattern, repeat" for the editor's "repeat, pattern".
      const ol: number[] = [];
      for (let i = 0; i < raw.length; i++) {
        const v = raw[i];
        if (v >= GT_REPEAT && v < GT_TRANSDOWN && ol.length && ol[ol.length - 1] < GT_REPEAT) {
          const patt = ol.pop() as number;
          ol.push(v, patt);
        } else ol.push(v);
      }
      ol.push(GT_LOOPSONG, restart);
      chans.push(ol);
    }
    orderlists.push(chans);
  }

  // --- patterns ------------------------------------------------------------
  const pattPtr = (i: number): number => mem[pattLo + i] | (mem[pattHi + i] << 8);
  need(pattPtr(0) === orderEnd, 'patterns follow the orderlists');
  const patternsOut: number[][][] = [];
  for (let i = 0; i < patterns; i++) {
    const start = pattPtr(i);
    const limit = i + 1 < patterns ? pattPtr(i + 1) : end;
    patternsOut.push(unpackPattern(mem, start, Math.min(limit, start + 256)));
  }

  const song: GTSongData = {
    name: img.name, author: img.author, copyright: img.copyright,
    orderlists, instruments: instrumentsOut, tables, patterns: patternsOut,
  };
  checkSong(song, I);
  return {
    song,
    layout: {
      songs, patterns, instruments: I, hasPulse, hasFilter, hasInstrVib, fixedParams: !notFixed,
      noWaveDelay, simplePulse, speedZero, tableSizes: [W, Pn, F, Sp], firstNoHr, firstLegato, defaultTempo, multiplier, ntsc, adparam,
    },
  };
}

/** Notes in mt_freqtbllo/hi right before `songLo` (greloc.c: firstnote..lastnote). */
function frequencyTableLength(mem: Uint8Array, songLo: number): number {
  for (let n = 96; n >= 2; n--) {
    const lo = songLo - 2 * n, hi = songLo - n;
    let ok = true;
    for (let i = 0; i + 1 < n && ok; i++) {
      const a = mem[lo + i] | (mem[hi + i] << 8), b = mem[lo + i + 1] | (mem[hi + i + 1] << 8);
      const r = b / a;
      ok = a > 0 && r > 1.05 && r < 1.07;
    }
    if (ok) return n;
  }
  return 0;
}

/** greloc.c speedcode in front of the player of a multispeed PSID; 1 when absent. */
function speedMultiplier(file: Uint8Array, mem: Uint8Array, load: number): number {
  if (!matchAt(mem, load, sig('A2 ?? 8E 04 DC A2 ?? 8E 05 DC'))) return 1;
  const value = mem[load + 1] | (mem[load + 6] << 8);
  if (!value) return 1;
  const ntsc = (file[0x77] & 0x0c) === 0x08;
  const base = ntsc ? 0x42c6 : 0x4cc7;
  if (Math.abs(value - base * 2) <= 1) return 0;
  return Math.max(1, Math.round(base / value));
}

/** The channel wave variable the wave table step stores to: sta mt_chnwave,x after lda mt_wavetbl-1,y. */
function waveStore(mem: Uint8Array, waveRead: number[]): number {
  for (const a of waveRead) {
    for (let b = a + 3; b < a + 32; b++) if (mem[b] === 0x9d) return w16(mem, b + 1);
  }
  return -1;
}

/**
 * SIMPLEPULSE (player.s mt_setpulse): the full form stores the pulse high byte
 * from mt_pulsetimetbl before reading mt_pulsespdtbl; the simple form reads
 * mt_pulsespdtbl straight away and writes one byte to both halves.
 */
function isSimplePulse(mem: Uint8Array, refAt: (op: number) => number[], pulseTime: number, pulseSpd: number): boolean {
  for (const a of refAt(pulseTime - 1)) {
    if (mem[a] !== 0xb9) continue;
    let b = a + 3;
    if (mem[b] === 0x10) b += 2;                  // bpl mt_newpulsemod
    if (mem[b] === 0xb9 && w16(mem, b + 1) === pulseSpd - 1) return true;
    if (mem[b] === 0x9d || mem[b] === 0x95) return false;
  }
  throw new DecodeError('pulse step');
}

/** Wavetable left column, playroutine form back to editor form (greloc.c WTBL). */
function unpackWaveLeft(v: number, noWaveDelay: boolean): number {
  if (v >= 0xf0) return v;                       // command or jump
  if (noWaveDelay) {
    if (v >= 0x01 && v <= 0x0f) return 0xe0 | v; // inaudible waveform
    return v;
  }
  if (v <= 0x0f) return v;                       // delay (or 0)
  if (v <= 0x1f) return 0xe0 | (v & 0x0f);       // inaudible waveform
  return v - 0x10;                               // waveform
}

/** Pulse table under SIMPLEPULSE, back to editor form (greloc.c PTBL). */
function unpackSimplePulse(l: number, r: number): [number, number] {
  if (l === 0xff) return [l, r];                 // jump
  if (l >= 0x80) return [0x80 | (r & 0x0f), r & 0xf0];
  // modulation step: speed was (r>>4, sign-extended, minus one when negative), nybble-swapped
  const s = ((r & 0x0f) << 4) | (r >> 4);
  const speed = s >= 0xf0 ? ((s + 1) & 0x0f) | 0x08 : s & 0x0f;
  return [l, (speed & 0x0f) << 4];
}

/** One packed pattern back to rows (greloc.c packpattern, reversed). */
function unpackPattern(mem: Uint8Array, start: number, limit: number): number[][] {
  const rows: number[][] = [];
  let cmd = 0, data = 0;
  let a = start;
  while (a < limit && rows.length < 128) {
    let v = mem[a++];
    if (v === 0x00) break;                       // end mark
    let instr = 0;
    if (v < 0x40) { instr = v; v = mem[a++]; }   // instrument change, then FX or note
    if (v >= 0xc0) {                             // packed rest: 2..64 rows
      const n = 0x100 - v;
      for (let i = 0; i < n; i++) rows.push([GT_REST, 0, cmd, data]);
      continue;
    }
    if (v >= 0x50 && v < 0x60) {                 // rest with a new command
      cmd = v - 0x50;
      data = cmd ? mem[a++] : 0;
      rows.push([GT_REST, instr, cmd, data]);
      continue;
    }
    if (v >= 0x40 && v < 0x50) {                 // new command, then the note
      cmd = v - 0x40;
      data = cmd ? mem[a++] : 0;
      v = mem[a++];
    }
    rows.push([v, instr, cmd, data]);
  }
  return rows.map((r) => [r[0], r[1], r[2], restoreTempo(r[2], r[3])]);
}

/**
 * Everything the decode produced points where it can: orderlists at patterns,
 * pattern rows at notes and instruments, instruments and table jumps into the
 * tables. A build this decoder misreads fails here and stays a SID.
 */
function checkSong(song: GTSongData, instruments: number): void {
  const npatt = song.patterns.length;
  for (const chans of song.orderlists) {
    for (const ol of chans) {
      const body = ol.slice(0, -2);
      need(body.some((v) => v < GT_REPEAT), 'orderlist without a pattern');
      need(body.every((v) => v >= GT_REPEAT || v < npatt), 'orderlist pattern number');
      need(ol[ol.length - 1] < body.length, 'orderlist restart position');
    }
  }
  for (const rows of song.patterns) {
    need(rows.length > 0 && rows.length <= 128, 'pattern length');
    for (const [note, instr, cmd] of rows) {
      need(note >= GT_FIRSTNOTE && note <= 0xbf, 'pattern note');
      need(instr <= instruments && cmd <= 0x0f, 'pattern instrument or command');
    }
  }
  const len = song.tables.map((t) => t.left.length);
  for (let i = 1; i <= instruments; i++) {
    const ins = song.instruments[i];
    need(ins.ptr.every((p, t) => p <= len[t]), 'instrument table pointer');
  }
  for (let t = 0; t < GT_STBL; t++) {
    const { left, right } = song.tables[t];
    left.forEach((l, i) => need(l !== 0xff || right[i] <= len[t], 'table jump'));
  }
}

/** The packer lowers tempo values 3 and up by one; 2 and 3 play the same. */
function restoreTempo(cmd: number, data: number): number {
  if (cmd !== 0x0f) return data;
  return (data & 0x7f) >= 2 ? data + 1 : data;
}

/**
 * The GoatTracker song a file opens as, or null: a GoatTracker .sng as it is,
 * a GoatTracker-2-compiled .sid decoded back to one. THE rule the open path
 * (classifySong, the GoatTracker branch) uses for both.
 */
export function goatTrackerSongBytes(filename: string, bytes: Uint8Array): Uint8Array | null {
  const name = filename.toLowerCase();
  if (name.endsWith('.sng')) return isGoatTrackerSng(bytes) ? bytes : null;
  if (name.endsWith('.sid')) {
    const decoded = decodeGoatTracker2Sid(bytes);
    return decoded ? writeGoatTrackerSng(decoded.song, decoded.layout) : null;
  }
  return null;
}
