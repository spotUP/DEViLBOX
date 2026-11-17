/**
 * ZX Spectrum 128K beeper song data for public/zx/beeper.bin (own 6 voice player, see beeper.asm): the song's
 * pattern grid -> a record stream (voice frequency / duty changes, drum pieces, tone lengths in loop iterations)
 * spread over the 128K banks, plus the 1-bit drum sample data stored after the player code.
 * Each Furnace tick is simulated like zxbeeper.cpp: volume / arp / duty / pitch macros, 12xx duty, 00xy arpeggio,
 * 01/02/03 portamento, E5xx fine pitch, note-offs, speed (0Fxx), tempo (F0xx), pattern break/jump, 17xx sample drums.
 * Furnace channel k plays on player voice k. Tick lengths are kept in Z80 T-states, so the tempo never drifts.
 */
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import { cellToFile, FILE_NOTE_OFF } from '../FurnaceModuleExporter';
import { effectNotationOf } from '../../tracker/effectNotation';
import { arpNote, runMacro } from '../tad/tadSongWriter';
import type { FurnaceModuleSample } from '@/types/tracker';

/** Must match beeper.asm (ITER_T, DRUM_BYTE_T) and the 128K CPU clock; the test checks public/zx/beeper.json. */
export const BEEPER_CLOCK = 3546900;
export const BEEPER_ITER_T = 365; // 363 counted + ULA contention on the 3 OUTs, see beeper.asm
export const BEEPER_DRUM_BYTE_T = 510;
/** Voice update rate: one phase step per voice per loop iteration. */
export const BEEPER_SAMPLE_RATE = BEEPER_CLOCK / BEEPER_ITER_T;
export const BEEPER_VOICES = 6;
export const BEEPER_BANK_SIZE = 16384;
const MAX_FREQ_HZ = 4800; // below the 4886 Hz Nyquist of the voice update rate
const PIN_SLOT_T = BEEPER_ITER_T / 3; // the pin is written 3 times per iteration, each write takes 1 from the timer
// Estimated T-states between two tone runs (save, record read, restore) and per changed voice; keeps the tempo honest.
// shortcut: hand-counted estimates, upgrade by measuring the record path in an emulator trace.
// The screen slice (screen.inc `slice`: one scroller pixel row plus one bar or clock digit) runs in every record gap.
// shortcut: SLICE_T is the measured average (MAME port trace); the slice length varies a little per task.
export const BEEPER_SLICE_T = 1640;
const RECORD_T = 650 + 20 + BEEPER_SLICE_T;
// A record at least every 1/50 s keeps the bars, clock and scroller moving during held notes.
const SCREEN_ITERS = Math.floor(BEEPER_CLOCK / 50 / BEEPER_ITER_T);
const VOICE_T = 73;
const DRUM_SETUP_T = 90;
const MAX_ITERS = 65535;
const MAX_DRUM_PIECE = 255;

export interface BeeperRow {
  freq: number[]; duty: number[];
  /** Tone loop iterations after the drum piece. */
  iters: number;
  /** Drum piece: byte offset into BeeperData.drums and byte count. */
  drum?: { offset: number; bytes: number };
  /** Song time at the end of the row, in seconds. */
  end: number;
}
export interface BeeperData { rows: BeeperRow[]; drums: Uint8Array; seconds: number; drumHits: number; warnings: string[] }

/** Frequency word of the player for a pitch in Hz: phase step per loop iteration. */
function hzToWord(hz: number, warnings?: string[]): number {
  if (hz > MAX_FREQ_HZ) { warnings?.push(`A note above ${MAX_FREQ_HZ} Hz was lowered to it`); hz = MAX_FREQ_HZ; }
  return Math.max(1, Math.round(hz * 65536 / BEEPER_SAMPLE_RATE));
}

/** Frequency word for a Furnace native note (57 = A-4 = 440 Hz). */
export function beeperFreqWord(native: number, warnings?: string[]): number {
  return hzToWord(440 * Math.pow(2, (native - 57) / 12), warnings);
}

/** Furnace zxbeeper output rate (zxbeeper.cpp:318-324): NTSC colour clock / 4; clockSel 1 = PAL * 4/5 / 4. */
const FURNACE_BEEPER_RATE = 3579545 / 4;
const FURNACE_CHANNELS = 6;
const FURNACE_DEFAULT_DUTY = 64; // zxbeeper.h: DivPlatformZXBeeper::Channel::duty(64)
const LINEAR_SEMITONE = 128; // Furnace linear pitch: note << 7, E5xx and pitch macros in 1/128 semitone
/** zxbeeper.cpp: a drum bit lasts 16 output samples; a drum stops after 2048 bits. */
const DRUM_MAX_BITS = 2048;

/**
 * Furnace's zxbeeper duty is a fixed pin pulse of `duty` output samples per phase wrap (zxbeeper.cpp:67). The player
 * adds the duty to a pulse timer counted in pin writes, so the duty becomes a count of pin write slots.
 */
export function beeperDutyUnits(furnaceDuty: number): number {
  if (furnaceDuty <= 0) return 0;
  return Math.min(255, Math.max(1, Math.round(furnaceDuty / FURNACE_BEEPER_RATE * BEEPER_CLOCK / PIN_SLOT_T)));
}

/** zxbeeper.cpp sample bit: data8[pos] > 0 (16-bit samples: the high byte). MSB first, at most 2048 bits. */
function drumBits(s: FurnaceModuleSample): Uint8Array {
  const n = Math.min(s.data.length, DRUM_MAX_BITS);
  const out = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    const v = s.data[i];
    const on = s.data instanceof Int16Array ? (v >> 8) > 0 : s.data instanceof Uint8Array ? v > 128 : v > 0;
    if (on) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
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

export type BeeperSong = FurnaceModuleSong & { furnaceSamples?: FurnaceModuleSample[] };

export function songToBeeperRows(song: BeeperSong): BeeperData {
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

  // Drum samples: packed 1-bit data, one blob, offsets per Furnace sample index.
  const samples = song.furnaceSamples ?? [];
  const drumAt = new Map<number, { offset: number; bytes: number }>();
  const blob: number[] = [];
  const drumOf = (i: number) => {
    if (!drumAt.has(i)) {
      const bits = drumBits(samples[i]);
      drumAt.set(i, { offset: blob.length, bytes: bits.length });
      blob.push(...bits);
    }
    return drumAt.get(i)!;
  };
  let drum: { offset: number; bytes: number; pos: number } | null = null;
  let drumHits = 0;

  const freq = new Array<number>(BEEPER_VOICES).fill(0);
  const duty = new Array<number>(BEEPER_VOICES).fill(0);
  const rows: BeeperRow[] = [];
  let targetT = 0; // exact song time in T-states; each record is sized to the difference, so the tempo never drifts
  let doneT = 0;

  /** One Furnace tick: macros (zxbeeper.cpp:80-121), portamento, channel k -> voice k. */
  const tick = () => {
    chans.forEach((c, v) => {
      let hzOut = 0;
      if (c.note >= 0) {
        const t = c.tk++;
        const vol = macroOf(c.ins, 0);
        // outVol = (vol & 1) * MIN(1, macro value) (zxbeeper.cpp:94): any value above 0 sounds, not only odd ones.
        if (vol && vol.had[t]) c.on = vol.seq[t] > 0;
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
        if (c.on) {
          const am = macroOf(c.ins, 1);
          let semis = c.cur / LINEAR_SEMITONE;
          if (am) semis += arpNote(c.note, am.seq[t]) - c.note;
          if (c.arpFx) semis += [0, c.arpFx[0], c.arpFx[1]][t % 3];
          semis += (c.fine + c.pitch2) / LINEAR_SEMITONE;
          hzOut = 440 * Math.pow(2, (semis - 60 - 57) / 12);
        }
      }
      // A silent voice keeps its frequency (no phase jump) and gets duty 0, so its wraps add nothing.
      if (hzOut > 0) { freq[v] = hzToWord(hzOut, warnings); duty[v] = beeperDutyUnits(c.duty); } else duty[v] = 0;
    });
    targetT += BEEPER_CLOCK / hz;
    const prev = rows[rows.length - 1];
    const changes = prev ? freq.filter((f, v) => f !== prev.freq[v] || duty[v] !== prev.duty[v]).length : BEEPER_VOICES;
    let avail = targetT - doneT;
    const more = Math.max(0, Math.round(avail / BEEPER_ITER_T));
    if (!drum && prev && changes === 0 && prev.iters + more <= SCREEN_ITERS) {
      const iters = more;
      prev.iters += iters; doneT += iters * BEEPER_ITER_T; prev.end = targetT / BEEPER_CLOCK;
      return;
    }
    avail -= RECORD_T + changes * VOICE_T;
    let piece: BeeperRow['drum'];
    if (drum) {
      avail -= DRUM_SETUP_T;
      const bytes = Math.min(drum.bytes - drum.pos, MAX_DRUM_PIECE, Math.max(1, Math.floor((avail - BEEPER_ITER_T) / BEEPER_DRUM_BYTE_T)));
      piece = { offset: drum.offset + drum.pos, bytes };
      drum.pos += bytes; avail -= bytes * BEEPER_DRUM_BYTE_T;
      doneT += DRUM_SETUP_T + bytes * BEEPER_DRUM_BYTE_T;
      if (drum.pos >= drum.bytes) drum = null; // sample end: the tone voices resume
    }
    const iters = Math.min(MAX_ITERS, Math.max(1, Math.round(avail / BEEPER_ITER_T)));
    doneT += RECORD_T + changes * VOICE_T + iters * BEEPER_ITER_T;
    rows.push({ freq: [...freq], duty: [...duty], iters, drum: piece, end: targetT / BEEPER_CLOCK });
  };

  let order = 0;
  let guard = 0;
  while (order < song.songPositions.length && guard++ < 4096) {
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
          else if (type === 0x17) {
            // zxbeeper.cpp:212-218: 17xx starts sample xx from its start; a value past the last sample stops the drum.
            if (val < samples.length && samples[val].data.length > 0) { drum = { ...drumOf(val), pos: 0 }; drumHits++; } else drum = null;
          } else dropped.add(`effect ${type.toString(16).toUpperCase().padStart(2, '0')}xx`);
        }
        if (c.target >= 0 && c.slide === 0) c.target = -1;
        if (!rowArp && effectNotationOf(chan.channelMeta) === 'tracker') c.arpFx = null; // tracker 00xy lasts one row
      });
      const ticks = speeds[speedPhase++ & 1];
      for (let t = 0; t < ticks; t++) tick();
      if (jump >= 0 || breakRow >= 0) break;
    }
    if (jump >= 0) {
      if (jump <= order) { if (jump !== 0) warnings.push(`The song loops back to order ${jump}; the beeper player loops to the start`); break; }
      order = jump;
    } else order++;
  }
  if (dropped.size) warnings.push(`Dropped, the beeper player cannot play: ${[...dropped].join(', ')}`);
  if (rows.length === 0) throw new Error('The song has no notes.');
  // The phases advance only inside the tone loop; the record gaps (screen slice included) would flatten every note.
  // Scale all frequency words by tone time / loop time so the average pitch is exact. Drum time is excluded: no tone sounds then.
  const loopT = rows.reduce((t, r) => t + r.iters * BEEPER_ITER_T, 0);
  const drumT = rows.reduce((t, r) => t + (r.drum ? r.drum.bytes * BEEPER_DRUM_BYTE_T + DRUM_SETUP_T : 0), 0);
  const pitchFactor = loopT > 0 ? Math.max(1, (targetT - drumT) / loopT) : 1;
  for (const r of rows) r.freq = r.freq.map((f) => Math.min(0xFFFF, Math.round(f * pitchFactor)));
  return { rows, drums: Uint8Array.from(blob), seconds: targetT / BEEPER_CLOCK, drumHits, warnings: [...new Set(warnings)] };
}

/**
 * Record stream of beeper.asm split over 16K banks (at most `maxBanks`). `drumBase` = address of the drum blob.
 * Each bank ends with #80 (next bank), the last with #81 (loop to the start); #82 ticks the clock once per song second. The first record sets every voice.
 */
export function encodeBeeperMusic(rows: readonly BeeperRow[], drumBase: number, maxBanks: number): { banks: Uint8Array[]; seconds: number; truncated: boolean } {
  const banks: Uint8Array[] = [];
  let bank = new Uint8Array(BEEPER_BANK_SIZE);
  let at = 0;
  let prev: BeeperRow | null = null;
  let seconds = 0;
  let truncated = false;
  let second = 0;
  let start = 0;
  for (const row of rows) {
    const rec: number[] = [];
    // #82 = one more second of song for the clock (about 80 T, inside the timing slack).
    for (; start >= second + 1; second++) rec.push(0x82);
    const head = rec.length;
    rec.push(0);
    for (let v = 0; v < BEEPER_VOICES; v++) {
      if (prev && prev.freq[v] === row.freq[v] && prev.duty[v] === row.duty[v]) continue;
      rec[head] |= 1 << v;
      rec.push(row.freq[v] & 255, row.freq[v] >> 8, row.duty[v]);
    }
    if (row.drum) { rec[head] |= 0x40; const p = drumBase + row.drum.offset; rec.push(p & 255, p >> 8, row.drum.bytes); }
    rec.push(row.iters & 255, row.iters >> 8);
    if (at + rec.length + 1 > BEEPER_BANK_SIZE) {
      if (banks.length + 1 >= maxBanks) { truncated = true; break; }
      bank[at] = 0x80; banks.push(bank.subarray(0, at + 1));
      bank = new Uint8Array(BEEPER_BANK_SIZE); at = 0;
    }
    bank.set(rec, at); at += rec.length;
    prev = row; seconds = row.end; start = row.end;
  }
  bank[at] = 0x81; banks.push(bank.subarray(0, at + 1));
  return { banks, seconds, truncated };
}
