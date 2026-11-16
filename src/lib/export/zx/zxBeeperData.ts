/**
 * ZX Spectrum 48K beeper song data for public/zx/beeper.bin (the utz quattropic engine, see beeper.asm):
 * the song's pattern grid -> a sequence word list plus 8-word rows (duty, 4 frequency words, row length).
 * Each Furnace tick is simulated like zxbeeper.cpp: volume / arp / duty / pitch macros, 12xx duty, 00xy arpeggio,
 * 01/02/03 portamento, E5xx fine pitch, note-offs, speed (0Fxx), tempo (F0xx), pattern break/jump. Furnace's 6 channels
 * share the player's 4 voices (a voice stays on its channel while it sounds). Furnace's duty is a fixed pin pulse, so it
 * becomes a per-pitch duty byte (beeperDutyByte). Row lengths are real time on the 16 ms beeper unit grid.
 * shortcut: 17xx sample drums and more than 4 simultaneous channels are dropped; both need a new Z80 player (see the
 * ZX ledger thoughts/spot/2026-11-16-zx-native-tap-research.md).
 */
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import { cellToFile, FILE_NOTE_OFF } from '../FurnaceModuleExporter';
import { effectNotationOf } from '../../tracker/effectNotation';
import { arpNote, runMacro } from '../tad/tadSongWriter';

/** The engine runs one 224 T-state sample per loop: 3.5 MHz / 224. A row unit is 256 samples. */
export const BEEPER_SAMPLE_RATE = 3500000 / 224;
export const BEEPER_UNIT_MS = 256 / BEEPER_SAMPLE_RATE * 1000;
export const BEEPER_VOICES = 4;
const ROW_BYTES = 16;
const MAX_UNITS = 254; // 255 would equal the "never cut" length byte
const MAX_FREQ_HZ = 7000; // above this the 15.6 kHz sample rate aliases badly
const DEFAULT_DUTY = 0x80;

export interface BeeperRow { freq: number[]; duty: number[]; units: number }
export interface BeeperData { rows: BeeperRow[]; seconds: number; warnings: string[] }

/** Frequency word of the engine for a note: f = hz * 65536 / 15625. Furnace native note 57 = A-4 = 440 Hz. */
export function beeperFreqWord(native: number, warnings?: string[]): number {
  let hz = 440 * Math.pow(2, (native - 57) / 12);
  if (hz > MAX_FREQ_HZ) { warnings?.push(`A note above ${MAX_FREQ_HZ} Hz was lowered to it`); hz = MAX_FREQ_HZ; }
  return Math.max(1, Math.round(hz * 65536 / BEEPER_SAMPLE_RATE));
}

/** Furnace zxbeeper output rate (zxbeeper.cpp:318-324): NTSC colour clock / 4; clockSel 1 = PAL * 4/5 / 4. */
const FURNACE_BEEPER_RATE = 3579545 / 4;
const FURNACE_CHANNELS = 6;
const FURNACE_DEFAULT_DUTY = 64; // zxbeeper.h: DivPlatformZXBeeper::Channel::duty(64)
const LINEAR_SEMITONE = 128; // Furnace linear pitch: note << 7, E5xx and pitch macros in 1/128 semitone

/** Frequency word for a pitch in Hz. */
function hzToWord(hz: number, warnings: string[]): number {
  if (hz > MAX_FREQ_HZ) { warnings.push(`A note above ${MAX_FREQ_HZ} Hz was lowered to it`); hz = MAX_FREQ_HZ; }
  return Math.max(1, Math.round(hz * 65536 / BEEPER_SAMPLE_RATE));
}

/**
 * Furnace's zxbeeper duty is a fixed pin pulse of `duty` output samples per phase wrap (zxbeeper.cpp:67), so its width
 * as a fraction of the period grows with pitch. The quattropic core compares the phase high byte, so its duty is that
 * fraction of 256.
 */
export function beeperDutyByte(furnaceDuty: number, hz: number): number {
  return Math.min(255, Math.max(1, Math.round(256 * furnaceDuty * hz / FURNACE_BEEPER_RATE)));
}

interface MacroSeq { seq: number[]; had: boolean[]; mode: number }
interface Chan {
  note: number; // file note of the sounding note, -1 = off
  ins: number; tk: number;
  cur: number; // linear pitch (note << 7 plus portamento), without arp / E5 / pitch macro
  slide: number; // 01/02: linear units per tick (signed); 03: speed toward target
  target: number; // 03 target, -1 = none
  fine: number; // E5xx
  pitch2: number; // pitch macro
  duty: number; on: boolean;
  arpFx: [number, number] | null;
}

export function songToBeeperRows(song: FurnaceModuleSong, maxBytes: number): BeeperData {
  const warnings: string[] = [];
  const insIndex = new Map(song.instruments.map((i, n) => [i.id, n] as const));
  const dropped = new Set<string>();
  const startHz = song.hz ?? song.initialBPM * 2 / 5;
  const slideSpeed = 4; // compat flag pitchSlideSpeed, written as 4 by FurnaceModuleExporter
  let hz = startHz;
  let speeds = [song.initialSpeed, song.speed2 ?? song.initialSpeed];
  let speedPhase = 0;
  const chans: Chan[] = Array.from({ length: FURNACE_CHANNELS }, () => ({
    note: -1, ins: -1, tk: 0, cur: 0, slide: 0, target: -1, fine: 0, pitch2: 0, duty: FURNACE_DEFAULT_DUTY, on: false, arpFx: null,
  }));
  const macroCache = new Map<string, MacroSeq | null>();
  /** Macro `code` of instrument `ins` unrolled over 512 ticks (vol 0, arp 1, duty 2, pitch 4). */
  const macroOf = (ins: number, code: number): MacroSeq | null => {
    const key = `${ins}:${code}`;
    if (!macroCache.has(key)) {
      const m = song.instruments[ins]?.furnace?.macros?.find((x) => x.code === code && x.data.length > 0);
      if (m && code === 1 && m.mode) { macroCache.set(key, null); return null; }
      const had: boolean[] = [];
      const seq = m ? runMacro({ ...m, loop: m.loop < 0 ? 255 : m.loop, release: m.release < 0 ? 255 : m.release }, m.data, 512, Infinity, had) : null;
      macroCache.set(key, seq && { seq, had, mode: m?.mode ?? 0 });
    }
    return macroCache.get(key) ?? null;
  };
  const slot = new Array<number>(BEEPER_VOICES).fill(-1); // Furnace channel playing in each beeper voice
  let overflowTicks = 0;
  const freq = new Array<number>(BEEPER_VOICES).fill(0);
  const duty = new Array<number>(BEEPER_VOICES).fill(DEFAULT_DUTY);
  const rows: BeeperRow[] = [];
  let timeMs = 0; // exact elapsed time; row lengths are the rounded differences, so tempo error never accumulates
  let emitted = 0;
  const maxRows = Math.floor((maxBytes - 6) / ROW_BYTES);
  let truncated = false;

  const emit = (units: number) => {
    const prev = rows[rows.length - 1];
    if (prev && prev.freq.every((f, v) => f === freq[v]) && prev.duty.every((d, v) => d === duty[v])) {
      prev.units += units; // identical state: one longer row, no phase restart
    } else {
      rows.push({ freq: [...freq], duty: [...duty], units });
    }
  };

  /** One Furnace tick: macros (zxbeeper.cpp:80-121), portamento, then the 6 channels folded into the 4 beeper voices. */
  const tick = () => {
    const out: Array<{ hz: number; duty: number } | null> = chans.map((c) => {
      if (c.note < 0) return null;
      const t = c.tk++;
      const vol = macroOf(c.ins, 0);
      if (vol && vol.had[t]) c.on = (vol.seq[t] & 1) === 1;
      const dm = macroOf(c.ins, 2);
      if (dm && dm.had[t]) c.duty = dm.seq[t] & 255;
      const pm = macroOf(c.ins, 4);
      if (pm && pm.had[t]) c.pitch2 = pm.mode ? Math.max(-65535, Math.min(65535, c.pitch2 + pm.seq[t])) : pm.seq[t];
      if (t > 0 && c.slide !== 0) {
        if (c.target >= 0) {
          c.cur += Math.sign(c.target - c.cur) * Math.min(Math.abs(c.target - c.cur), c.slide);
          if (c.cur === c.target) { c.target = -1; c.slide = 0; }
        } else c.cur += c.slide;
      }
      if (!c.on) return null;
      const am = macroOf(c.ins, 1);
      let semis = c.cur / LINEAR_SEMITONE;
      if (am) semis += arpNote(c.note, am.seq[t]) - c.note;
      if (c.arpFx) semis += [0, c.arpFx[0], c.arpFx[1]][t % 3];
      semis += (c.fine + c.pitch2) / LINEAR_SEMITONE;
      return { hz: 440 * Math.pow(2, (semis - 60 - 57) / 12), duty: c.duty };
    });
    // Keep each voice on its channel while it sounds; free voices take new channels in channel order.
    for (let v = 0; v < BEEPER_VOICES; v++) if (slot[v] >= 0 && !out[slot[v]]) slot[v] = -1;
    let over = false;
    out.forEach((o, ch) => {
      if (!o || slot.includes(ch)) return;
      const v = slot.indexOf(-1);
      if (v < 0) over = true; else slot[v] = ch;
    });
    if (over) overflowTicks++;
    for (let v = 0; v < BEEPER_VOICES; v++) {
      const o = slot[v] >= 0 ? out[slot[v]] : null;
      freq[v] = o ? hzToWord(o.hz, warnings) : 0;
      duty[v] = o ? beeperDutyByte(o.duty, o.hz) : DEFAULT_DUTY;
    }
  };

  let order = 0;
  let guard = 0;
  walk: while (order < song.songPositions.length && guard++ < 4096) {
    const pat = song.patterns[song.songPositions[order]];
    if (!pat) break;
    let jump = -1;
    let breakRow = -1;
    for (let r = 0; r < pat.length; r++) {
      pat.channels.forEach((chan, ch) => {
        const cell = chan.rows[r];
        if (!cell) return;
        const fc = cellToFile(cell, insIndex, `Pattern ${song.songPositions[order]} channel ${ch + 1} row ${r}`, [], effectNotationOf(chan.channelMeta), []);
        if (ch >= FURNACE_CHANNELS) {
          if (fc.note >= 0) dropped.add(`channel ${ch + 1} notes`);
          return;
        }
        const c = chans[ch];
        const tonePorta = fc.fx.some((f) => f.type === 3 && f.val > 0) && c.note >= 0 && fc.note >= 0 && fc.note < FILE_NOTE_OFF;
        if (fc.ins >= 0) c.ins = fc.ins;
        if (fc.note >= FILE_NOTE_OFF) c.note = -1;
        else if (fc.note >= 0 && tonePorta) c.target = fc.note * LINEAR_SEMITONE;
        else if (fc.note >= 0) {
          // Note on: macros restart; the channel sounds unless a volume macro says otherwise (outVol = vol & 1, vol = 1).
          Object.assign(c, { note: fc.note, tk: 0, cur: fc.note * LINEAR_SEMITONE, pitch2: 0, on: true, target: -1, slide: 0 });
        }
        let rowArp = false;
        for (const { type, val } of fc.fx) {
          if (type < 0) continue;
          if (type === 0) { c.arpFx = val ? [val >> 4, val & 15] : null; rowArp = true; continue; }
          if (type === 0x12) c.duty = val;
          else if (type === 0x01) { c.slide = val * slideSpeed; c.target = -1; }
          else if (type === 0x02) { c.slide = -val * slideSpeed; c.target = -1; }
          else if (type === 0x03) { if (val === 0) { c.slide = 0; c.target = -1; } else c.slide = val * slideSpeed; }
          else if (type === 0xe5) c.fine = val - 0x80;
          else if (type === 0x0f && val > 0) speeds = [val, val];
          else if (type === 0xf0 && val > 0) hz = val * 2 / 5;
          else if (type === 0x0b) jump = val;
          else if (type === 0x0d) breakRow = r;
          else dropped.add(`effect ${type.toString(16).toUpperCase().padStart(2, '0')}xx${type === 0x17 ? ' (sample drums)' : ''}`);
        }
        if (c.target >= 0 && c.slide === 0) c.target = -1;
        if (!rowArp && effectNotationOf(chan.channelMeta) === 'tracker') c.arpFx = null; // tracker 00xy lasts one row
      });
      const ticks = speeds[speedPhase++ & 1];
      for (let t = 0; t < ticks; t++) {
        tick();
        timeMs += 1000 / hz;
        const units = Math.round(timeMs / BEEPER_UNIT_MS) - emitted;
        emitted += units;
        if (units > 0) emit(units);
      }
      if (rows.length > maxRows) { truncated = true; break walk; }
      if (jump >= 0 || breakRow >= 0) break;
    }
    if (jump >= 0) {
      if (jump <= order) { if (jump !== 0) warnings.push(`The song loops back to order ${jump}; the beeper player loops to the start`); break; }
      order = jump;
    } else order++;
  }
  if (overflowTicks) warnings.push(`More than ${BEEPER_VOICES} channels sounded at once for ${overflowTicks} ticks; the beeper player has ${BEEPER_VOICES} voices, the extra channels were left out there`);
  if (Math.abs(startHz - 50) > 0.01) warnings.push(`The song ticks at ${startHz.toFixed(2)} Hz; the tape keeps its real-time tempo, resampled to the 16 ms beeper row grid`);
  if (truncated) {
    rows.length = maxRows;
    warnings.push(`The song is longer than the 48K memory holds: it was cut after ${Math.floor(rows.reduce((n, x) => n + x.units, 0) * BEEPER_UNIT_MS / 1000)} s`);
  }
  if (dropped.size) warnings.push(`Dropped, the beeper player cannot play: ${[...dropped].join(', ')}`);
  if (rows.length === 0) throw new Error('The song has no notes.');

  // Rows longer than 254 units split in pieces (the phase restarts there).
  const pieces: BeeperRow[] = rows.flatMap((x) => {
    const out: BeeperRow[] = [];
    for (let left = x.units; left > 0; left -= MAX_UNITS) out.push({ ...x, units: Math.min(MAX_UNITS, left) });
    return out;
  });
  return { rows: pieces, seconds: pieces.reduce((n, x) => n + x.units, 0) * BEEPER_UNIT_MS / 1000, warnings: [...new Set(warnings)] };
}

/** Sequence (one pattern pointer, end word) + rows + end marker. `base` = address the data is loaded at. */
export function encodeBeeperMusic(rows: readonly BeeperRow[], base: number): Uint8Array {
  const out = new Uint8Array(4 + rows.length * ROW_BYTES + 2);
  const w = (o: number, v: number) => { out[o] = v & 0xFF; out[o + 1] = (v >> 8) & 0xFF; };
  w(0, base + 4); w(2, 0);
  rows.forEach((x, i) => {
    const o = 4 + i * ROW_BYTES;
    w(o, 0xFF00); // A = 0xFF (note never cut), F = 0 (regular tone)
    w(o + 2, x.duty[0] << 8 | x.duty[1]);
    w(o + 4, x.duty[2] << 8 | x.duty[3]);
    for (let v = 0; v < BEEPER_VOICES; v++) w(o + 6 + v * 2, x.freq[v]);
    w(o + 14, x.units << 8);
  });
  w(4 + rows.length * ROW_BYTES, 0x0040); // F = Z: end of pattern
  return out;
}
