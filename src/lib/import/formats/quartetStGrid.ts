/**
 * Quartet ST (qts.* / modland *.4v): read-only tracker grid decoded from the song's four voice streams,
 * plus real sampler instruments from the companion SMP.<song> / SMP.set file.
 *
 * Every byte meaning below is read from the UADE player
 * third-party/uade-3.05/amigasrc/players/wanted_team/QuartetST/Quartet ST_v1.asm:
 *
 * - Song header, 16 bytes. Word +4 is the row step (all durations are multiples of it, same as Quartet PSG).
 *   Word +14 is the player speed (`move.w 14(A0)` in InitSound): non-zero = interrupt rate in Hz,
 *   zero = 200 Hz. Play (lbC00DB86 dispatcher) runs one tick per interrupt.
 * - Four voice streams back to back: voice 0 at +16, each next one right after the previous voice's 'F'
 *   record (lbC00DDB8 / lbC00DE0A).
 * - 12-byte records, command word first:
 *     'P' +2 duration, +4 frequency long: note with retrigger, plays the current sample.
 *     'R' +2 duration: rest.
 *     'S' +2 duration, +4 target long, +8 rate long: slide to target, no retrigger (lbC00DB44).
 *     'V' +8 long: byte offset into the 20-long sample table (sample = value / 4), no time (lbC00DD72).
 *     'l' loop start; 'L' +8 word count, body runs count + 1 times (lbC00DC52); 'F' back to stream start.
 * - Pitch: Paula period = 3579545 / (freq >> 3) (lbC00DE66), so the grid note is periodToGridNote(period).
 * - No per-note volume: only the global left/right volume.
 *
 * SMP file (lbC00DD72 / sample init): byte 1 - 1 = sample count; names are 7-byte entries from offset 2;
 * 20 offset longs at 0x8E (relative to the SMP start, 0 = none). Each sample has an 8-byte header at that
 * offset: word +0 loop length in bytes (negative = no loop, loop start = length - loop length),
 * word +4 length in bytes, word +6 'WT' once converted. PCM follows, unsigned (the player subtracts 0x80).
 */
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { createSamplerInstrument } from './AmigaUtils';

export const QUARTET_ST_ROWS_PER_PATTERN = 64;
export const QUARTET_ST_VOICES = 4;
const REC = 12;
const MAX_ROWS = 200000;
const MAX_STEPS = 2000000;
const SAMPLE_SLOTS = 20;
/** Paula clock the player divides by (0x369E99, lbC00DE66). */
const PAULA_CLOCK = 0x369e99;
/** Sample rate that makes the grid's C-2 (period 428) play a sample at its stored pitch. */
const GRID_SAMPLE_RATE = 8363;

const CMD = { P: 0x50, R: 0x52, S: 0x53, V: 0x56, LOOP_START: 0x6c, LOOP_END: 0x4c, F: 0x46 } as const;

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const s16 = (b: Uint8Array, o: number): number => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Player frequency long to grid note (period = 3579545 / (freq >> 3)). */
export function quartetStFreqToNote(freq: number): number {
  const div = freq >>> 3;
  if (div <= 0 || div > 0xffff) return 0;
  return periodToGridNote(Math.floor(PAULA_CLOCK / div));
}

/** Voice stream spans: voice 0 at +16, each next voice right after the previous 'F'. */
export function quartetStVoiceSpans(buf: Uint8Array): Array<{ start: number; end: number }> | null {
  const spans: Array<{ start: number; end: number }> = [];
  let p = 16;
  for (let v = 0; v < QUARTET_ST_VOICES; v++) {
    const start = p;
    while (p + REC <= buf.length && u16(buf, p) !== CMD.F) p += REC;
    if (p + REC > buf.length) return null;
    p += REC;
    spans.push({ start, end: p });
  }
  return spans;
}

export interface QuartetStGrid {
  patterns: Pattern[];
  /** ticks per row (song header word +4) */
  step: number;
  /** player interrupt rate in Hz (header word +14, 0 = 200) */
  tickHz: number;
  rows: number;
  /** ticks of the longest voice pass */
  ticks: number;
  /** sample slots (0-based) the song selects with V */
  usedSamples: number[];
}

export function buildQuartetStGrid(buf: Uint8Array, sourceFile: string): QuartetStGrid | null {
  if (buf.length < 16 + REC * QUARTET_ST_VOICES) return null;
  const spans = quartetStVoiceSpans(buf);
  if (!spans) return null;
  const step = Math.max(1, u16(buf, 4));
  const speed = u16(buf, 14);
  const tickHz = speed > 0 ? speed : 200;
  const timelines: TrackerCell[][] = spans.map(() => []);
  const curSample: Array<number | null> = spans.map(() => null);
  const used = new Set<number>();

  // One pass of a voice stream from tick t0; returns the tick it ends on.
  const runPass = (v: number, t0: number): number => {
    const { start, end } = spans[v];
    const loops: Array<{ at: number; done: number }> = [];
    let t = t0, p = start, steps = 0;
    while (p + REC <= end && steps++ < MAX_STEPS && t / step < MAX_ROWS) {
      const cmd = u16(buf, p);
      if (cmd === CMD.F) break;
      if (cmd === CMD.LOOP_START) { loops.push({ at: p + REC, done: 0 }); p += REC; continue; }
      if (cmd === CMD.LOOP_END) {
        const top = loops[loops.length - 1];
        if (top && top.done < u16(buf, p + 8)) { top.done++; p = top.at; continue; }
        loops.pop(); p += REC; continue;
      }
      if (cmd === CMD.V) {
        const slot = Math.floor(u32(buf, p + 8) / 4);
        curSample[v] = slot < SAMPLE_SLOTS ? slot : null;
        p += REC; continue;
      }
      if (cmd === CMD.P || cmd === CMD.S) {
        const row = Math.floor(t / step);
        const line = timelines[v];
        while (line.length <= row) line.push(emptyCell());
        if (!line[row].note) {
          const slot = curSample[v];
          if (slot !== null) used.add(slot);
          line[row] = {
            ...emptyCell(),
            note: quartetStFreqToNote(u32(buf, p + 4)),
            instrument: slot === null ? 0 : slot + 1,
            effTyp: cmd === CMD.S ? 3 : 0,
          };
        }
      }
      if (cmd === CMD.P || cmd === CMD.S || cmd === CMD.R) t += u16(buf, p + 2);
      p += REC;
    }
    return t;
  };

  // A voice without any P is replaced by the player's built-in silent stream (lbC00D97C): it never sets the length.
  const hasNote = spans.map(s => {
    for (let p = s.start; p + REC <= s.end; p += REC) if (u16(buf, p) === CMD.P) return true;
    return false;
  });
  const passLen = spans.map((_, v) => (hasNote[v] ? runPass(v, 0) : 0));
  const ticks = Math.max(step, ...passLen);
  // 'F' restarts the voice's own stream, so shorter voices repeat until the longest pass is full
  spans.forEach((_, v) => {
    let t = passLen[v];
    while (passLen[v] > 0 && t < ticks) { const e = runPass(v, t); if (e <= t) break; t = e; }
  });

  const rows = Math.min(MAX_ROWS, Math.ceil(ticks / step));
  const numPatterns = Math.max(1, Math.ceil(rows / QUARTET_ST_ROWS_PER_PATTERN));
  const usedSamples = [...used].sort((a, b) => a - b);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: QUARTET_ST_ROWS_PER_PATTERN,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: QUARTET_ST_ROWS_PER_PATTERN }, (_, r) => {
        const at = p * QUARTET_ST_ROWS_PER_PATTERN + r;
        return at < rows ? { ...(line[at] ?? emptyCell()) } : emptyCell();
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: QUARTET_ST_VOICES, originalPatternCount: numPatterns,
      originalInstrumentCount: Math.max(1, usedSamples.length),
    },
  }));
  return { patterns, step, tickHz, rows, ticks, usedSamples };
}

export interface QuartetStSample {
  slot: number;
  name: string;
  /** signed 8-bit PCM */
  pcm: Uint8Array;
  loopStart: number;
  loopEnd: number;
}

/** Samples of an SMP file (slots 0 .. byte1 - 2); slots without data are left out. */
export function readQuartetStSamples(smp: Uint8Array): QuartetStSample[] {
  if (smp.length < 0x8e + SAMPLE_SLOTS * 4) return [];
  const count = Math.min(SAMPLE_SLOTS, Math.max(0, smp[1] - 1));
  const out: QuartetStSample[] = [];
  for (let slot = 0; slot < count; slot++) {
    const off = u32(smp, 0x8e + slot * 4);
    if (off === 0 || off & 1 || off >= 0x80000000 || off + 8 > smp.length) continue;
    const len = Math.min(u16(smp, off + 4) & ~1, smp.length - off - 8);
    if (len <= 0) continue;
    const converted = smp[off + 6] === 0x57 && smp[off + 7] === 0x54; // 'WT': already signed
    const pcm = smp.slice(off + 8, off + 8 + len);
    if (!converted) for (let i = 0; i < pcm.length; i++) pcm[i] ^= 0x80;
    const loopLen = s16(smp, off);
    const loopStart = loopLen > 0 && loopLen <= len ? len - loopLen : 0;
    const loopEnd = loopLen > 0 && loopLen <= len ? len : 0;
    const raw = String.fromCharCode(...smp.subarray(2 + slot * 7, 2 + slot * 7 + 7));
    const name = raw.replace(/[^\x20-\x7e]/g, '').trim() || `Sample ${slot + 1}`;
    out.push({ slot, name, pcm, loopStart, loopEnd });
  }
  return out;
}

/**
 * Instruments for the grid: instrument number = sample slot + 1. Real samples when the SMP file is
 * given; otherwise empty named placeholders so the grid's instrument numbers still resolve.
 */
export function buildQuartetStInstruments(grid: QuartetStGrid, smp: Uint8Array | null): InstrumentConfig[] {
  const samples = smp ? readQuartetStSamples(smp) : [];
  const bySlot = new Map(samples.map(s => [s.slot, s]));
  const slots = new Set<number>([...samples.map(s => s.slot), ...grid.usedSamples]);
  return [...slots].sort((a, b) => a - b).map(slot => {
    const s = bySlot.get(slot);
    return s
      ? createSamplerInstrument(slot + 1, s.name, s.pcm, 64, GRID_SAMPLE_RATE, s.loopStart, s.loopEnd)
      : createSamplerInstrument(slot + 1, `Sample ${slot + 1}`, new Uint8Array(2), 64, GRID_SAMPLE_RATE, 0, 0);
  });
}
