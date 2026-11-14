/**
 * Small song-spec helpers for ProTracker MOD composing: chip waveforms as 8-bit signed PCM,
 * a pattern grid addressed by note name and effect text, and the hand-over to the repo's
 * MOD exporter (src/lib/export/modExport.ts) as a TrackerSong.
 */
import type { TrackerSong } from '@engine/TrackerReplayer';

export interface ChipSample { name: string; pcm: Int8Array; volume: number; loop: boolean }
interface Cell { note: number; instrument: number; volume: number; effTyp: number; eff: number }

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A-2' / 'A#2' in ProTracker naming to the repo's note number (C-1 = 13, C-2 = 25 = period 428). */
export function note(name: string): number {
  const semi = SEMITONE[name[0]] + (name[1] === '#' ? 1 : 0);
  const n = 13 + (Number(name[2]) - 1) * 12 + semi;
  if (!(n >= 13 && n <= 48)) throw new Error(`note ${name} is outside ProTracker's C-1..B-3`);
  return n;
}

export const pulse = (len: number, duty: number, amp = 100): Int8Array =>
  Int8Array.from({ length: len }, (_, i) => (i < len * duty ? amp : -amp));
export const saw = (len: number, amp = 100): Int8Array =>
  Int8Array.from({ length: len }, (_, i) => Math.round(-amp + (2 * amp * i) / (len - 1)));
export const triangle = (len: number, amp = 110): Int8Array =>
  Int8Array.from({ length: len }, (_, i) => Math.round(amp * (1 - 4 * Math.abs(i / len - 0.5))));

/** Decaying white noise from a fixed-seed generator (same bytes every build); `tone` mixes in a sine body. */
export function noiseBurst(len: number, decay: number, highPass: boolean, tone = 0): Int8Array {
  let seed = 0x1234567;
  let prev = 0;
  const out = new Int8Array(len);
  for (let i = 2; i < len; i++) { // first word stays 0: ProTracker replays it on one-shot samples
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const white = ((seed >>> 16) & 0xff) / 127.5 - 1;
    const v = highPass ? (white - prev) / 2 : white;
    prev = white;
    const body = tone ? Math.sin((2 * Math.PI * i) / tone) * 0.6 : 0;
    out[i] = Math.round(120 * Math.exp(-i / decay) * Math.max(-1, Math.min(1, v * (tone ? 0.7 : 1) + body)));
  }
  return out;
}

/** Sine with a falling pitch (cycle length grows from `fromLen` to `toLen` samples) and a decay. */
export function kick(len: number, fromLen: number, toLen: number): Int8Array {
  const out = new Int8Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const cycle = toLen + (fromLen - toLen) * Math.exp(-i / (len / 6));
    phase += (2 * Math.PI) / cycle;
    out[i] = i < 2 ? 0 : Math.round(125 * Math.exp(-i / (len / 2.5)) * Math.sin(phase));
  }
  return out;
}

export class Pattern {
  readonly cells: Cell[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 })));

  /** fx is three hex digits, effect then parameter ('C20', '037'); '' leaves the effect as it is. */
  put(channel: number, row: number, noteName: string, instrument: number, fx = ''): this {
    const cell = this.cells[channel][row];
    if (noteName) { cell.note = note(noteName); cell.instrument = instrument; }
    if (fx) {
      if (!/^[0-9A-F]{3}$/.test(fx)) throw new Error(`bad effect "${fx}"`);
      cell.effTyp = parseInt(fx[0], 16);
      cell.eff = parseInt(fx.slice(1), 16);
    }
    return this;
  }
  clear(channel: number, row: number): this {
    this.cells[channel][row] = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
    return this;
  }
}

export interface ModSongSpec { title: string; samples: ChipSample[]; patterns: Pattern[]; order: number[] }

/** 8-bit PCM as the 16-bit WAV the exporter decodes an instrument's sample from. */
function wav16(pcm: Int8Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buf);
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => view.setInt16(44 + i * 2, v << 8, true));
  return buf;
}

export function toTrackerSong(spec: ModSongSpec): TrackerSong {
  return {
    name: spec.title,
    numChannels: 4,
    songPositions: spec.order,
    patterns: spec.patterns.map((p) => ({ length: 64, channels: p.cells.map((rows) => ({ rows })) })),
    instruments: spec.samples.map((s, i) => ({
      id: i + 1,
      name: s.name,
      type: 'sample',
      sample: { audioBuffer: wav16(s.pcm), loopStart: 0, loopEnd: s.loop ? s.pcm.length : 0 },
      metadata: { modPlayback: { defaultVolume: s.volume, finetune: 0 } },
    })),
  } as unknown as TrackerSong; // only the fields exportSongToMOD reads
}
