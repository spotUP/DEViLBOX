/**
 * ZX Spectrum 48K beeper song data for public/zx/beeper.bin (the utz quattropic engine, see beeper.asm):
 * the song's pattern grid -> a sequence word list plus 8-word rows (duty, 4 frequency words, row length).
 * Notes, note-offs, speed (0Fxx), tempo (F0xx), pattern break/jump, pulse width (12xx) and arpeggio (arp macro, 00xy)
 * are played; everything else is dropped with a warning. Row lengths are real time on the 16 ms beeper unit grid, so
 * any tick rate plays at the right tempo (resampled); an arpeggio makes one row per tick.
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

export function songToBeeperRows(song: FurnaceModuleSong, maxBytes: number): BeeperData {
  const warnings: string[] = [];
  const insIndex = new Map(song.instruments.map((i, n) => [i.id, n] as const));
  const dropped = new Set<string>();
  const startHz = song.hz ?? song.initialBPM * 2 / 5;
  let hz = startHz;
  let speeds = [song.initialSpeed, song.speed2 ?? song.initialSpeed];
  let speedPhase = 0;
  const freq = new Array<number>(BEEPER_VOICES).fill(0);
  const base = new Array<number>(BEEPER_VOICES).fill(-1); // file note of the sounding voice, -1 = silent
  const insOf = new Array<number>(BEEPER_VOICES).fill(-1);
  const tk = new Array<number>(BEEPER_VOICES).fill(0); // ticks since note-on
  const arpFx = new Array<[number, number] | null>(BEEPER_VOICES).fill(null);
  const arpSeqs = new Map<number, { seq: number[]; moving: boolean } | null>();
  const arpOf = (ins: number) => {
    if (!arpSeqs.has(ins)) {
      const m = song.instruments[ins]?.furnace?.macros?.find((x) => x.code === 1 && x.data.length > 0 && !x.mode);
      const seq = m ? runMacro({ ...m, loop: m.loop < 0 ? 255 : m.loop, release: m.release < 0 ? 255 : m.release }, m.data, 512, Infinity) : null;
      arpSeqs.set(ins, seq && { seq, moving: seq.some((v) => v !== seq[0]) });
    }
    return arpSeqs.get(ins) ?? null;
  };
  /** Frequency word of voice v at its tick t: arp macro (from note-on), then 00xy on top. */
  const pitchAt = (v: number, t: number) => {
    if (base[v] < 0) return 0;
    const a = arpOf(insOf[v]);
    let n = a ? arpNote(base[v], a.seq[Math.min(t, a.seq.length - 1)]) : base[v];
    const fx = arpFx[v];
    if (fx) n += [0, fx[0], fx[1]][t % 3];
    return beeperFreqWord(n - 60, warnings);
  };
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
        if (ch >= BEEPER_VOICES) {
          if (fc.note >= 0) dropped.add(`channel ${ch + 1} notes`);
          return;
        }
        if (fc.ins >= 0) insOf[ch] = fc.ins;
        if (fc.note >= FILE_NOTE_OFF) base[ch] = -1;
        else if (fc.note >= 0) { base[ch] = fc.note; tk[ch] = 0; }
        let rowArp = false;
        for (const { type, val } of fc.fx) {
          if (type < 0) continue;
          if (type === 0) { arpFx[ch] = val ? [val >> 4, val & 15] : null; rowArp = true; continue; }
          if (type === 0x12) duty[ch] = val;
          else if (type === 0x0f && val > 0) speeds = [val, val];
          else if (type === 0xf0 && val > 0) hz = val * 2 / 5;
          else if (type === 0x0b) jump = val;
          else if (type === 0x0d) breakRow = r;
          else dropped.add(`effect ${type.toString(16).toUpperCase().padStart(2, '0')}xx`);
        }
        if (!rowArp && effectNotationOf(chan.channelMeta) === 'tracker') arpFx[ch] = null; // tracker 00xy lasts one row
      });
      const ticks = speeds[speedPhase++ & 1];
      const step = (n: number) => {
        timeMs += n * 1000 / hz;
        const units = Math.round(timeMs / BEEPER_UNIT_MS) - emitted;
        emitted += units;
        if (units > 0) emit(units);
      };
      const moving = base.some((b, v) => b >= 0 && (arpFx[v] || arpOf(insOf[v])?.moving));
      if (moving) {
        for (let t = 0; t < ticks; t++) {
          for (let v = 0; v < BEEPER_VOICES; v++) freq[v] = pitchAt(v, tk[v]++);
          step(1);
        }
      } else {
        for (let v = 0; v < BEEPER_VOICES; v++) { freq[v] = pitchAt(v, tk[v]); tk[v] += ticks; }
        step(ticks);
      }
      if (rows.length > maxRows) { truncated = true; break walk; }
      if (jump >= 0 || breakRow >= 0) break;
    }
    if (jump >= 0) {
      if (jump <= order) { if (jump !== 0) warnings.push(`The song loops back to order ${jump}; the beeper player loops to the start`); break; }
      order = jump;
    } else order++;
  }
  if (Math.abs(startHz - 50) > 0.01) warnings.push(`The song ticks at ${startHz.toFixed(2)} Hz; the tape keeps its real-time tempo, resampled to the 16 ms beeper row grid`);
  if (truncated) {
    rows.length = maxRows;
    warnings.push(`The song is longer than the 48K memory holds: it was cut after ${Math.floor(rows.reduce((n, x) => n + x.units, 0) * BEEPER_UNIT_MS / 1000)} s`);
  }
  if (dropped.size) warnings.push(`Dropped, the beeper player cannot play: ${[...dropped].join(', ')}`);
  if (rows.length === 0) throw new Error('The song has no notes in its first four channels.');

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
