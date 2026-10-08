/**
 * GoatTracker 1.x SIDs -> GoatTracker 1 song (.sng, "GTS!").
 *
 * The GoatTracker 1 packer (goattrk.c relocator() + packpattern(), v1.53) writes
 * [player][instruments][wave][notes][songtable][patterntable][filters][orderlists]
 * [patterns]. The player image is the unrelocated player1.bin with a known set of
 * bytes rewritten (see goatTracker1Player.ts), so a SID is read back only when its
 * player is that image: every fixed byte equal, every relocated operand consistent.
 * The table addresses then come from the operands the packer rewrote ($40xx..$47xx
 * in the source image) - no offset is guessed - and the whole data block must tile
 * out exactly to the end of the file. Anything else (another GoatTracker 1 revision,
 * a patched player, stereo builds, a layout that does not tile) is rejected and
 * stays a SID.
 *
 * The result is a GTS! file, the format GoatTracker 1 saved and the GTUltra engine
 * already loads (gsong.c, "Goattracker 1.xx import"), so the engine does the
 * conversion into its own tables; nothing is converted twice.
 *
 * What the packer does not keep (and so the song comes back without): instrument
 * names, the low nibble of the pulse limits, the lowest bit of pulse speed and
 * initial pulse (carries the hard-restart flag instead), instrument numbers that
 * repeat the previous row's, filters above the highest one used, orderlist and
 * pattern slack. Song, author and copyright text come from the PSID header.
 *
 * Detection: SIDId "GoatTracker_V1.x" (github.com/cadaver/sidid, sidid.cfg):
 *   BC ?? ?? B1 ?? C8 C9 60 90 ?? C9 C0 B0 ?? E9 5F
 * (the pattern reader: LDY, LDA (zp),y, INY, CMP #$60 / #$C0 for repeat and packed
 * rest). Its sub-entries GT_V1.4_2SID / GT_V1.5_2SID are the stereo builds.
 */

import { gt153Player1, OPCODE_LENGTH, HARD_RESTART_SLOT, PLAYER1_SIZE } from './goatTracker1Player';

/** sidid.cfg, "GoatTracker_V1.x". */
const GT1_SIDID: Array<number | null> = [
  0xbc, null, null, 0xb1, null, 0xc8, 0xc9, 0x60, 0x90, null, 0xc9, 0xc0, 0xb0, null, 0xe9, 0x5f,
];
/** sidid.cfg, "(GT_V1.4_2SID)" and "(GT_V1.5_2SID)": GoatTracker 1 stereo. */
const GT1_2SID: Array<Array<number>> = [
  [0xb0, 0x06, 0x9d, 0x06, 0xd4, 0x4c],
  [0x8d, 0x18, 0xd4, 0xa0, 0x00, 0xd0, 0x0c, 0xa9],
];

export interface PsidImage {
  mem: Uint8Array;
  load: number;
  end: number;
  name: string;
  author: string;
  copyright: string;
}

export interface GT1PlaySettings {
  /** 1 = normal; 2 = 2x etc. (the packer's /S option). */
  multiplier: number;
  ntsc: boolean;
  /** Hard restart attack/decay in the high byte, sustain/release in the low byte (/A option). */
  adparam: number;
  /** Hard restart length in frames, 1 or 2 (/R option). */
  hardRestartFrames: number;
}

export interface GT1SidDecode {
  /** The GTS! (GoatTracker 1) song file. */
  sng: Uint8Array;
  settings: GT1PlaySettings;
  songs: number;
  patterns: number;
  instruments: number;
}

class Reject extends Error {}
function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Reject(what);
}

function findBytes(mem: Uint8Array, from: number, to: number, p: ReadonlyArray<number | null>): boolean {
  for (let a = from; a + p.length <= to; a++) {
    let ok = true;
    for (let i = 0; i < p.length && ok; i++) if (p[i] !== null && mem[a + i] !== p[i]) ok = false;
    if (ok) return true;
  }
  return false;
}

/** True when the SIDId GoatTracker_V1.x signature is present. */
export function hasGoatTracker1Signature(img: PsidImage): boolean {
  return findBytes(img.mem, img.load, img.end, GT1_SIDID);
}

export function decodeGoatTracker1Sid(
  file: Uint8Array, img: PsidImage, whyNot?: (reason: string) => void,
): GT1SidDecode | null {
  try {
    return decode(file, img);
  } catch (e) {
    if (e instanceof Reject) { whyNot?.(e.message); return null; }
    throw e;
  }
}

const w16 = (m: Uint8Array, a: number): number => m[a] | (m[a + 1] << 8);

interface PlayerMatch {
  markers: Map<number, number>;
  hr: number[];
}

/** Table operand markers in the source image: high byte of the "virtual" address. */
const MARK_INSTR = 0x40;
const MARK_WAVE = 0x41;
const MARK_NOTE = 0x42;
const MARK_SONGLO = 0x43;
const MARK_SONGHI = 0x44;
const MARK_PATTLO = 0x45;
const MARK_PATTHI = 0x46;
const MARK_FILTER = 0x47;

/** Walk the source image exactly as relocator() does and compare it with the SID's copy at `base`. */
function matchPlayer(mem: Uint8Array, base: number): PlayerMatch {
  const tpl = gt153Player1();
  need(base + tpl.length <= 0x10000, 'player past end of memory');
  const markers = new Map<number, number>();
  const hr: number[] = [];
  const delta = (base - 0x1000) & 0xffff;
  const covered = new Uint8Array(tpl.length);
  let c = 0;
  for (;;) {
    if (c === 16) c = 64; // author text and its neighbours, not code
    const op = tpl[c];
    if (op === 0x00 || op === 0x01) break;
    const len = OPCODE_LENGTH[op];
    need(len, `source player opcode ${op.toString(16)}`);
    for (let i = 0; i < len; i++) covered[c + i] = 1;
    const at = base + c;
    if (op === HARD_RESTART_SLOT) {
      need(hr.length < 4, 'too many hard restart slots');
      const want = hr.length === 1 ? 0xc9 : 0xa9;
      need(mem[at] === want, 'hard restart slot opcode');
      hr.push(mem[at + 1]);
    } else {
      need(mem[at] === op, `player code differs at +${c.toString(16)}`);
      if (len === 3) {
        const hi = tpl[c + 2];
        const src = tpl[c + 1] | (hi << 8);
        const got = w16(mem, at + 1);
        if (hi >= MARK_INSTR && hi <= MARK_FILTER) {
          // got = tableBase + (src - hi*256): the base the packer used
          const base0 = (got - (src - (hi << 8))) & 0xffff;
          const seen = markers.get(hi);
          need(seen === undefined || seen === base0, `table operand $${hi.toString(16)}xx disagrees`);
          markers.set(hi, base0);
        } else if (hi === 0xd4) {
          need(got === src, 'SID register operand');
        } else {
          need(((got - src) & 0xffff) === delta, `code operand differs at +${c.toString(16)}`);
        }
      } else {
        for (let i = 1; i < len; i++) need(mem[at + i] === tpl[c + i], `player operand differs at +${(c + i).toString(16)}`);
      }
    }
    c += len;
  }
  need(hr.length === 4, 'hard restart slots');
  // Data part of the image (tables, variables) and the bytes between $10 and $1F.
  for (let i = 0; i < tpl.length; i++) {
    if (covered[i] || (i >= 0x20 && i < 0x40)) continue;
    need(mem[base + i] === tpl[i], `player data differs at +${i.toString(16)}`);
  }
  need(markers.size === 8, 'not every table is referenced');
  return { markers, hr };
}

function swapNybbles(v: number): number {
  return ((v << 4) | (v >> 4)) & 0xff;
}

interface Row { note: number; cmd: number; data: number }

/** goattrk.c packpattern(), undone. Returns rows, or throws Reject. */
function unpackPattern(mem: Uint8Array, start: number, limit: number): { rows: Row[]; next: number } {
  const rows: Row[] = [];
  let p = start;
  let cmd = -1, data = -1;
  for (;;) {
    need(p < limit, 'pattern runs past the end');
    const b = mem[p++];
    if (b === 0xff) break;
    if (b < 0x60) {
      need(p + 2 <= limit, 'pattern runs past the end');
      cmd = mem[p++]; data = mem[p++];
      rows.push({ note: b, cmd, data });
    } else if (b < 0xc0) {
      need(cmd >= 0, 'repeat row without a previous row');
      rows.push({ note: b - 0x60, cmd, data });
    } else {
      need(cmd >= 0, 'packed rest without a previous row');
      const n = 256 - b;
      for (let i = 0; i < n; i++) rows.push({ note: 0x5f, cmd, data });
    }
    need(rows.length <= 80, 'pattern longer than 80 rows');
  }
  return { rows, next: p };
}

/** Undo the packer's per-command byte transforms. */
function restoreData(cmd: number, data: number): number {
  switch (cmd & 7) {
    case 0: // arpeggio: bit 7 toggled when non-zero
      need(data !== 0x80, 'arpeggio parameter');
      return data ? data ^ 0x80 : 0;
    case 4: return swapNybbles(data);
    case 5: need((data & 3) === 0, 'filter parameter'); return data >> 2;
    case 7: {
      // tempo: values 3.. were lowered by one (bit 7 is "all channels"); 2 and 3 play the same
      if (data >= 0xef) return data;
      need(data !== 0x7f && data !== 0xee, 'tempo parameter');
      return (data & 0x7f) >= 2 ? data + 1 : data;
    }
    default: return data;
  }
}

function decode(file: Uint8Array, img: PsidImage): GT1SidDecode {
  const { mem, load, end } = img;
  need(hasGoatTracker1Signature(img), 'no GoatTracker_V1.x signature');
  for (const p of GT1_2SID) need(!findBytes(mem, load, end, p), 'GoatTracker 1 stereo build');

  const init = (file[10] << 8) | file[11];
  const play = (file[12] << 8) | file[13];
  const base = (play - 3) & 0xffff;
  need(base >= load && (init === base || init === base - 10), 'init/play addresses');
  const { markers, hr } = matchPlayer(mem, base);

  // --- play settings the packer put in the code and the PSID header ------------
  // PSID flags (low byte at $77): bits 2-3 are the clock when the header names one;
  // the packer itself writes a bare $02 for an NTSC build and leaves the clock bits clear.
  const clock = file[0x77] & 0x0c;
  let ntsc = clock === 0x08 || (clock === 0 && (file[0x77] & 0x02) !== 0);
  let multiplier = 1;
  if (init === base - 10) {
    // goattrk.c speedcode: LDX #lo / STX $DC04 / LDX #hi / STX $DC05, value = timer / multiplier
    const code = [0xa2, null, 0x8e, 0x04, 0xdc, 0xa2, null, 0x8e, 0x05, 0xdc];
    need(code.every((v, i) => v === null || mem[init + i] === v), 'multispeed prefix');
    const value = mem[init + 1] | (mem[init + 6] << 8);
    const candidates: Array<{ m: number; ntsc: boolean }> = [];
    for (let m = 2; m <= 32; m++) {
      if (Math.floor(0x4cc7 / m) === value) candidates.push({ m, ntsc: false });
      if (Math.floor(0x4025 / m) === value) candidates.push({ m, ntsc: true });
    }
    need(candidates.length === 1, 'multispeed timer value');
    multiplier = candidates[0].m;
    ntsc = candidates[0].ntsc;
  }
  // slot 0: lda #(2m+1) or (2m+2); slot 1: cmp #(2m-1) or (2m)
  const hardRestartFrames = hr[0] % 2 === 0 ? 2 : 1;
  need(hr[0] === multiplier * 2 + hardRestartFrames && hr[1] === hr[0] - 2, 'hard restart slots disagree with the speed');
  const adparam = (hr[2] << 8) | hr[3];

  // --- layout from the relocated operands ---------------------------------------
  const instrAdr = markers.get(MARK_INSTR)! + 8;
  const waveAdr = markers.get(MARK_WAVE)! + 1;
  const noteAdr = markers.get(MARK_NOTE)! + 1;
  const songLoAdr = markers.get(MARK_SONGLO)!;
  const songHiAdr = markers.get(MARK_SONGHI)!;
  const pattLoAdr = markers.get(MARK_PATTLO)!;
  const pattHiAdr = markers.get(MARK_PATTHI)!;
  const filtAdr = markers.get(MARK_FILTER)!;

  need(instrAdr === base + PLAYER1_SIZE, 'instruments do not follow the player');
  const instrBytes = waveAdr - instrAdr;
  need(instrBytes > 0 && instrBytes % 8 === 0 && instrBytes / 8 <= 31, 'instrument table size');
  const instruments = instrBytes / 8;
  const waveRows = noteAdr - waveAdr;
  need(waveRows > 0 && waveRows <= 512, 'wave table size');
  need(songLoAdr === noteAdr + waveRows, 'song table does not follow the wave table');
  const songSlots = songHiAdr - songLoAdr;
  need(songSlots > 0 && songSlots % 3 === 0 && songSlots / 3 <= 32, 'song table size');
  const songs = songSlots / 3;
  need(pattLoAdr === songLoAdr + songSlots * 2, 'pattern table does not follow the song table');
  const patterns = pattHiAdr - pattLoAdr;
  need(patterns > 0 && patterns <= 208, 'pattern table size');
  need(filtAdr === pattLoAdr + patterns * 2, 'filter table does not follow the pattern table');
  const firstSong = mem[songLoAdr] | (mem[songHiAdr] << 8);
  const filtBytes = firstSong - filtAdr;
  // getfilteramount() counts the highest "set filter" parameter as written (up to 255) and the
  // packer copies that many 4-byte entries from the 64-entry editor table, so a song with
  // parameters above 63 carries up to 256 entries of which only the first 64 are the song's.
  // The player and the editor both use parameter & 63 (the stored byte is parameter * 4, 8-bit).
  need(filtBytes > 0 && filtBytes % 4 === 0 && filtBytes <= 1024, `filter table size ${filtBytes}`);
  need(firstSong < end, 'orderlists outside the file');

  // --- orderlists -----------------------------------------------------------------
  const orderlists: number[][][] = [];
  let at = firstSong;
  for (let s = 0; s < songs; s++) {
    const chans: number[][] = [];
    for (let c = 0; c < 3; c++) {
      const slot = s * 3 + c;
      need((mem[songLoAdr + slot] | (mem[songHiAdr + slot] << 8)) === at, 'orderlists are not contiguous');
      const list: number[] = [];
      for (;;) {
        need(at < end && list.length < 255, 'orderlist runs past the end');
        const v = mem[at++];
        list.push(v);
        if (v === 0xff) break;
        if (v < 0xd0) need(v < patterns, 'orderlist pattern out of range');
      }
      need(at < end, 'orderlist restart byte');
      list.push(mem[at++]);
      need(list.length >= 3, 'empty orderlist');
      chans.push(list);
    }
    orderlists.push(chans);
  }

  // --- patterns -------------------------------------------------------------------
  const patts: Row[][] = [];
  for (let i = 0; i < patterns; i++) {
    need((mem[pattLoAdr + i] | (mem[pattHiAdr + i] << 8)) === at, 'patterns are not contiguous');
    const { rows, next } = unpackPattern(mem, at, end);
    at = next;
    patts.push(rows);
  }
  need(at === end, `data left over after the last pattern (${end - at} bytes)`);

  // --- instruments and wave table ---------------------------------------------------
  const filters = Math.min(filtBytes / 4, 64);
  const waveLeft = (i: number): number => mem[waveAdr + i];
  const waveRight = (i: number): number => mem[noteAdr + i];
  type Instr = { raw: number[]; wave: number[] };
  const instr: Instr[] = [];
  for (let i = 0; i < instruments; i++) {
    const raw = Array.from(mem.subarray(instrAdr + i * 8, instrAdr + i * 8 + 8));
    need(raw[6] % 4 === 0 && raw[6] / 4 < filters, 'instrument filter number');
    const start = raw[7] - 1;
    need(start >= 0 && start < waveRows, 'instrument wave pointer');
    const wave: number[] = [];
    let r = start;
    for (;;) {
      need(r < waveRows, 'wave table not terminated');
      wave.push(waveLeft(r), waveRight(r));
      if (waveLeft(r) === 0xff) break;
      r++;
    }
    instr.push({ raw, wave });
  }
  for (const rows of patts) {
    for (const row of rows) {
      need(row.note <= 0x5f, 'note out of range');
      need((row.cmd >> 3) <= instruments, 'pattern uses an instrument that was not stored');
      if ((row.cmd & 7) === 5) need(row.data % 4 === 0 && row.data / 4 < filters, 'pattern filter number');
    }
  }

  // --- GTS! -------------------------------------------------------------------------
  const out: number[] = [0x47, 0x54, 0x53, 0x21];
  const text = (s: string): void => {
    for (let i = 0; i < 32; i++) out.push(i < s.length ? s.charCodeAt(i) & 0xff : 0);
  };
  text(img.name); text(img.author); text(img.copyright);
  out.push(songs);
  for (const chans of orderlists) {
    for (const list of chans) { out.push(list.length - 1); out.push(...list); }
  }
  for (let i = 1; i <= 31; i++) {
    if (i <= instruments) {
      const { raw, wave } = instr[i - 1];
      const pulse = (swapNybbles(raw[2]) & 0xfe) | (raw[3] & 1);
      out.push(raw[0], raw[1], pulse, raw[3] & 0xfe, raw[4] << 4, raw[5] << 4, raw[6] >> 2, wave.length);
      for (let k = 0; k < 16; k++) out.push(0); // the packer does not store instrument names
      out.push(...wave);
    } else {
      out.push(0, 0, 0, 0, 0, 0, 0, 4);
      for (let k = 0; k < 16; k++) out.push(0);
      out.push(0, 0, 0xff, 0);
    }
  }
  out.push(patterns);
  for (const rows of patts) {
    out.push(rows.length * 3 + 3);
    let carried = 0;
    for (const row of rows) {
      const instrument = row.cmd >> 3;
      const shown = instrument !== carried ? instrument : 0;
      carried = instrument;
      out.push(row.note, (shown << 3) | (row.cmd & 7), restoreData(row.cmd, row.data));
    }
    out.push(0xff, 0, 0);
  }
  for (let c = 0; c < 64; c++) {
    for (let k = 0; k < 4; k++) {
      if (c >= filters) { out.push(0); continue; }
      const v = mem[filtAdr + c * 4 + k];
      if (c === 0 && k >= 2) out.push((v + 1) & 0xff);
      else if (c > 0 && k === 3) { need(v % 4 === 0, 'filter next step'); out.push(v >> 2); }
      else out.push(v);
    }
  }
  return {
    sng: new Uint8Array(out),
    settings: { multiplier, ntsc, adparam, hardRestartFrames },
    songs, patterns, instruments,
  };
}
