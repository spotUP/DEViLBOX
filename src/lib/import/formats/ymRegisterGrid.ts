/**
 * ymRegisterGrid.ts - a tracker grid from YM2149 / AY register frames.
 *
 * A compiled player (SNDH 68000 code) has no pattern data to read; what it
 * leaves is the PSG registers it writes. One snapshot per 1/50 s frame becomes
 * one row: the tone period of each channel gives the note, the amplitude
 * register the volume column. Rows run at speed 1 / 125 BPM (50 rows a
 * second), so the grid scrolls in time with the engine.
 */
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import { midiToXMNote } from '@/lib/xmConversions';

/** The Atari ST/STE YM2149 clock: the 8.010613 MHz oscillator / 4. */
export const ATARI_ST_YM_CLOCK = 8010613 / 4;

/** YM/AY 12-bit tone period -> XM note (1-96), 0 when silent or out of range. */
export function ymPeriodToNote(period: number, clock: number): number {
  if (period <= 0) return 0;
  const freq = clock / (16 * period);
  if (freq < 16 || freq > 16000) return 0;
  return midiToXMNote(Math.round(12 * Math.log2(freq / 440) + 69));
}

const NOTE_OFF = 97;
/** XM volume column: 0x10 + 0..64 sets the volume. */
const VOL_SET = 0x10;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export interface YmGridOptions {
  clock: number;
  rowsPerPattern?: number;
  /** Channel name prefix: 'YM' -> 'YM A', 'YM B', 'YM C'. */
  channelPrefix?: string;
  /** Rows the grid spans when longer than the frames (the rest stay empty). */
  totalRows?: number;
}

/**
 * Patterns of `rowsPerPattern` rows from `frames` (16 registers each),
 * channel N on instrument N + 1, spanning `totalRows` rows when that is more
 * than the frames. An empty frame list gives one empty pattern.
 */
export function ymFramesToPatterns(frames: readonly Uint8Array[], opts: YmGridOptions): Pattern[] {
  const rowsPer = opts.rowsPerPattern ?? 64;
  const prefix = opts.channelPrefix ?? 'YM';
  const count = Math.max(1, Math.ceil(Math.max(frames.length, opts.totalRows ?? 0) / rowsPer));
  const patterns: Pattern[] = Array.from({ length: count }, (_, p) => ({
    id: `p${p}`, name: `Pattern ${p + 1}`, length: rowsPer,
    channels: Array.from({ length: 3 }, (_, c): ChannelData => ({
      id: `ch${c}`, name: `${prefix} ${String.fromCharCode(65 + c)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rowsPer }, emptyCell),
    })),
  }));

  const lastNote = [0, 0, 0];
  const lastVol = [-1, -1, -1];
  frames.forEach((f, i) => {
    const pat = patterns[Math.floor(i / rowsPer)];
    const row = i % rowsPer;
    const mixer = f[7] ?? 0xff;
    for (let c = 0; c < 3; c++) {
      const period = ((f[c * 2 + 1] & 0x0f) << 8) | f[c * 2];
      const level = f[8 + c] ?? 0;
      // Bit 4 hands the channel to the envelope generator: count it as full.
      const amp = level & 0x10 ? 15 : level & 0x0f;
      const toneOn = !((mixer >> c) & 1);
      const note = toneOn && amp > 0 ? ymPeriodToNote(period, opts.clock) : 0;
      const cell = pat.channels[c].rows[row];
      // A new pattern repeats the sounding note so each pattern reads alone.
      if (note !== lastNote[c] || (row === 0 && note > 0)) {
        if (note > 0) { cell.note = note; cell.instrument = c + 1; }
        else if (lastNote[c] > 0) cell.note = NOTE_OFF;
        lastNote[c] = note;
      }
      if (amp !== lastVol[c] && note > 0) {
        cell.volume = VOL_SET + Math.round((amp / 15) * 64);
        lastVol[c] = amp;
      } else if (note === 0) {
        lastVol[c] = -1;
      }
    }
  });
  return patterns;
}
