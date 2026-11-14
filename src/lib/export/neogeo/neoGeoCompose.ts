/**
 * Compose Neo Geo (YM2610, extended FM) songs in code and check them against what ngdevkit's
 * furtool converts for the nullsound driver.
 *
 * NeoGeoSongBuilder fills a FurnaceModuleSong for exportFurnaceModule (extendedFm, 17 channels).
 * lintNeoGeoSong rejects what furtool crashes on or drops silently, per channel kind. The rules
 * come from furtool.py (ngdevkit 0.5+202611061802); keep them in step when the driver grows.
 */
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern, TrackerCell, ChannelData } from '@/types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import { xmVolToFurnace } from '@/lib/import/furnaceEditorCells';

/** Channel index of each voice in the extended-FM chip (0xa6). */
export const NEO = {
  FM1: 0, OP1: 1, OP2: 2, OP3: 3, OP4: 4, FM3: 5, FM4: 6,
  SSG1: 7, SSG2: 8, SSG3: 9, A1: 10, A2: 11, A3: 12, A4: 13, A5: 14, A6: 15, B: 16,
} as const;
export const NEO_CHANNELS = 17;
const CHANNEL_NAMES = ['FM 1', 'FM 2 OP1', 'FM 2 OP2', 'FM 2 OP3', 'FM 2 OP4', 'FM 3', 'FM 4',
  'SSG 1', 'SSG 2', 'SSG 3', 'ADPCM-A 1', 'ADPCM-A 2', 'ADPCM-A 3', 'ADPCM-A 4', 'ADPCM-A 5', 'ADPCM-A 6', 'ADPCM-B'];

export type NeoChannelKind = 'fm' | 'op' | 'ssg' | 'adpcmA' | 'adpcmB';
export function neoChannelKind(ch: number): NeoChannelKind {
  if (ch >= 1 && ch <= 4) return 'op';
  if (ch >= 7 && ch <= 9) return 'ssg';
  if (ch >= 10 && ch <= 15) return 'adpcmA';
  if (ch === 16) return 'adpcmB';
  return 'fm';
}

/** Instrument types in the Furnace file. */
export const INS_FM = 1, INS_SSG = 6, INS_ADPCM_A = 37, INS_ADPCM_B = 38;

/** Volume range of each channel kind, as furtool clamps it. */
const VOL_MAX: Record<NeoChannelKind, number> = { fm: 0x7f, op: 0x7f, ssg: 0x0f, adpcmA: 0x1f, adpcmB: 0xff };

// Effects furtool converts (furtool.py fx table). Everything else is fatal or dropped.
const FX_ANY = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0x08, 0x09, 0x0a, 0x0b, 0x0d, 0x0f, 0x80, 0xff,
  0xe0, 0xe1, 0xe2, 0xe5, 0xe6, 0xe8, 0xe9, 0xea, 0xec, 0xed]);
const FX_FM_ONLY = new Set([0x12, 0x13, 0x14, 0x15]);
// FM 2 operator channels: furtool's op-channel table has only these (others raise KeyError).
const FX_OP = new Set([0x03, 0x04, 0x0a, 0xea, 0xed]);
// SSG macros furtool reads: vol 0, arp 1, wave 3, envelope shape 6, envelope num 7 / den 8.
const SSG_MACROS = new Set([0, 1, 3, 6, 7, 8]);

/** 'C-4' / 'F#5' / 'Bb3' / 'OFF' / 'REL' -> editor note (C-4 = 49, off = 97, release = 255). */
export function noteNumber(name: string): number {
  if (name === 'OFF' || name === '===') return 97;
  if (name === 'REL') return 255;
  const m = /^([A-G])([-#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const n = Number(m[3]) * 12 + base + acc + 1;
  if (n < 1 || n > 96) throw new Error(`Note "${name}" is out of range`);
  return n;
}

/** Editor volume column (0x10-0x50) that writes Furnace volume `v`, or -1 when no column value does. */
export function xmVolumeFor(v: number): number {
  for (let x = 0x10; x <= 0x50; x++) if (xmVolToFurnace(x) === v) return x;
  return -1;
}

export interface NeoHit {
  /** Note name ('C-5', 'OFF') or editor note number. */
  note?: string | number;
  /** Instrument id from addInstrument. */
  ins?: number;
  /** Furnace volume in the channel's own range (FM 0-127, SSG 0-15, ADPCM-B 0-255). */
  vol?: number;
  /** Furnace effects [code, value], up to 8. */
  fx?: Array<[number, number]>;
}

function emptyChannel(i: number, rows: number): ChannelData {
  return {
    id: `neo${i}`, name: CHANNEL_NAMES[i], rows: Array.from({ length: rows }, () => ({ ...EMPTY_CELL })),
    muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
    channelMeta: { effectNotation: 'furnace' },
  } as ChannelData;
}

export class NeoGeoPattern {
  readonly pattern: Pattern;
  readonly problems: string[];
  constructor(pattern: Pattern, problems: string[]) { this.pattern = pattern; this.problems = problems; }

  put(ch: number, row: number, hit: NeoHit): this {
    const cell: TrackerCell = { ...this.pattern.channels[ch].rows[row] };
    if (hit.note !== undefined) cell.note = typeof hit.note === 'number' ? hit.note : noteNumber(hit.note);
    if (hit.ins !== undefined) cell.instrument = hit.ins;
    if (hit.vol !== undefined) {
      const x = xmVolumeFor(hit.vol);
      if (x < 0) this.problems.push(`${this.pattern.id} ${CHANNEL_NAMES[ch]} row ${row}: volume ${hit.vol} has no exact editor value`);
      else cell.volume = x;
    }
    const c = cell as unknown as Record<string, number>;
    let slot = 1;
    for (const [t, v] of hit.fx ?? []) {
      // Same effect code already on the cell: replace its value instead of stacking a second copy.
      const same = [1, 2, 3, 4, 5, 6, 7, 8].find((i) => (i === 1 ? cell.effTyp : c[`effTyp${i}`]) === t && t !== 0);
      if (same) { if (same === 1) cell.eff = v; else c[`eff${same}`] = v; continue; }
      while (slot <= 8 && (slot === 1 ? cell.effTyp || cell.eff : c[`effTyp${slot}`] || c[`eff${slot}`])) slot++;
      if (slot > 8) throw new Error(`${this.pattern.id} ${CHANNEL_NAMES[ch]} row ${row}: more than 8 effects`);
      if (slot === 1) { cell.effTyp = t; cell.eff = v; } else { c[`effTyp${slot}`] = t; c[`eff${slot}`] = v; }
    }
    this.pattern.channels[ch].rows[row] = cell;
    return this;
  }

  /** Same notes at row offsets: [[row, hit], ...]. */
  seq(ch: number, hits: Array<[number, NeoHit]>): this {
    for (const [row, hit] of hits) this.put(ch, row, hit);
    return this;
  }
}

export class NeoGeoSongBuilder {
  readonly instruments: InstrumentConfig[] = [];
  readonly patterns: Pattern[] = [];
  readonly order: number[] = [];
  readonly problems: string[] = [];

  readonly name: string;
  readonly speed: number;
  readonly rows: number;
  constructor(name: string, speed: number, rows: number) { this.name = name; this.speed = speed; this.rows = rows; }

  addInstrument(name: string, furnace: FurnaceConfig): number {
    const id = this.instruments.length + 1;
    this.instruments.push({ id, name, type: 'synth', synthType: 'FurnaceOPNB', furnace } as unknown as InstrumentConfig);
    return id;
  }

  /** New empty pattern; `from` copies another pattern's cells first. */
  pattern(from?: NeoGeoPattern): NeoGeoPattern {
    const id = `p${this.patterns.length}`;
    const p: Pattern = { id, name: id, length: this.rows, channels: Array.from({ length: NEO_CHANNELS }, (_, i) => emptyChannel(i, this.rows)) };
    if (from) p.channels.forEach((c, i) => { c.rows = from.pattern.channels[i].rows.map((r) => ({ ...r })); });
    this.patterns.push(p);
    return new NeoGeoPattern(p, this.problems);
  }

  indexOf(p: NeoGeoPattern): number {
    return this.patterns.indexOf(p.pattern);
  }

  build(): FurnaceModuleSong {
    return {
      name: this.name, patterns: this.patterns, instruments: this.instruments, songPositions: this.order,
      initialSpeed: this.speed, initialBPM: 150, hz: 60, extendedFm: true,
    };
  }
}

function cellFx(cell: TrackerCell): Array<[number, number]> {
  const c = cell as unknown as Record<string, number | undefined>;
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= 8; i++) {
    const t = (i === 1 ? cell.effTyp : c[`effTyp${i}`]) ?? 0;
    const v = (i === 1 ? cell.eff : c[`eff${i}`]) ?? 0;
    if (t || v) out.push([t, v]);
  }
  return out;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

function lintInstrument(inst: InstrumentConfig, out: string[]): void {
  const f = inst.furnace as FurnaceConfig;
  const label = `Instrument ${inst.id} "${inst.name}"`;
  const type = f.divInsType ?? INS_FM;
  const macros = f.macros ?? [];
  if (type === INS_FM) {
    if (macros.length || (f.opMacros ?? []).some((m) => m && Object.keys(m).length)) out.push(`${label}: FM macros are dropped by furtool`);
    if ((f.operators ?? []).length !== 4) out.push(`${label}: an FM patch needs 4 operators`);
    return;
  }
  if (type === INS_SSG) {
    const loops = new Set<number>();
    for (const m of macros) {
      const code = m.code ?? -1;
      if (!SSG_MACROS.has(code)) out.push(`${label}: SSG macro ${code} is not converted (pitch/phase reset crash furtool, noise freq is not supported)`);
      if (m.mode !== 0) out.push(`${label}: macro ${code} must be a sequence (mode 0)`);
      if (m.release >= 0) out.push(`${label}: macro ${code} has a release point`);
      if (m.delay || (m.speed ?? 1) !== 1) out.push(`${label}: macro ${code} has delay or speed`);
      if (m.data.some((v) => v < 0 || v > 255)) out.push(`${label}: macro ${code} has a value outside 0-255`);
      if (m.loop >= 0) loops.add(m.loop);
    }
    if (loops.size > 1) out.push(`${label}: macros loop at different steps (${[...loops].join(', ')}); furtool keeps one loop for all`);
    return;
  }
  if (type === INS_ADPCM_B) {
    const ok = macros.length === 0 || (macros.length === 1 && macros[0].code === 1 && macros[0].data.length === 1);
    if (!ok) out.push(`${label}: ADPCM-B takes no macros except a one-step arpeggio`);
    if (!f.userSample) out.push(`${label}: ADPCM-B instrument has no sample`);
    return;
  }
  out.push(`${label}: instrument type ${type} is not for music (ADPCM-A is reserved for sound effects)`);
}

/**
 * Everything in `song` that furtool would crash on or drop, as readable lines. Empty = clean.
 * Expects the extended-FM channel layout (NEO).
 */
export function lintNeoGeoSong(song: FurnaceModuleSong): string[] {
  const out: string[] = [];
  const byId = new Map(song.instruments.map((i) => [i.id, i]));
  song.instruments.forEach((i) => lintInstrument(i, out));
  const opPatches = new Set<string>();

  song.patterns.forEach((p, pi) => {
    p.channels.forEach((chan, ch) => {
      const kind = neoChannelKind(ch);
      chan.rows.forEach((cell, row) => {
        const where = `Pattern ${pi} ${CHANNEL_NAMES[ch]} row ${row}`;
        const used = cell.note > 0 || cell.instrument > 0 || !!cell.volume || cellFx(cell).length > 0;
        if (!used) return;
        if (kind === 'adpcmA') { out.push(`${where}: ADPCM-A is reserved for sound effects`); return; }
        if (cell.volume) {
          const v = xmVolToFurnace(cell.volume);
          if (v > VOL_MAX[kind]) out.push(`${where}: volume ${v} is above the ${kind} maximum ${VOL_MAX[kind]}`);
        }
        const inst = cell.instrument > 0 ? byId.get(cell.instrument) : undefined;
        if (cell.instrument > 0 && !inst) out.push(`${where}: instrument ${cell.instrument} does not exist`);
        if (inst) {
          const f = inst.furnace as FurnaceConfig;
          const t = f.divInsType ?? INS_FM;
          const want = kind === 'ssg' ? INS_SSG : kind === 'adpcmB' ? INS_ADPCM_B : INS_FM;
          if (t !== want) out.push(`${where}: instrument "${inst.name}" (type ${t}) does not fit a ${kind} channel`);
          if (kind === 'op') opPatches.add(`alg ${f.algorithm} fb ${f.feedback}`);
        }
        for (const [t, v] of cellFx(cell)) {
          const fx = `${hex(t)}${hex(v)}`;
          if (kind === 'op') {
            if (!FX_OP.has(t)) out.push(`${where}: effect ${fx} crashes furtool on an FM 2 operator channel (only 03, 04, 0A, EA, ED)`);
            continue;
          }
          if (FX_FM_ONLY.has(t)) { if (kind !== 'fm') out.push(`${where}: effect ${fx} works on FM channels only`); continue; }
          if (!FX_ANY.has(t)) { out.push(`${where}: effect ${fx} is not supported by furtool`); continue; }
          if ((t === 0x08 || t === 0x80) && kind === 'ssg') out.push(`${where}: SSG has no panning (${fx})`);
          // Furnace 00xy runs until 0000, and an editor cell stores 0000 as an empty effect, so nothing can stop it.
          if (t === 0x00) out.push(`${where}: arpeggio ${fx} never stops (0000 cannot be written); use an arp macro or notes`);
          if (t === 0xe5 && kind === 'adpcmB') out.push(`${where}: ADPCM-B has no fine pitch (${fx})`);
        }
      });
    });
  });
  if (opPatches.size > 1) out.push(`FM 2 operator channels use different algorithm/feedback (${[...opPatches].join('; ')}); the chip has one per channel`);

  const last = song.patterns[song.songPositions[song.songPositions.length - 1]];
  const loops = last?.channels.some((c) => c.rows.some((r) => cellFx(r).some(([t]) => t === 0x0b)));
  if (!loops) out.push('The last pattern in the order has no 0B jump: the song will not loop');
  return out;
}

/** ADPCM-B samples in the song and their V ROM bytes (4-bit ADPCM, 256-byte blocks). */
export function adpcmBSampleBytes(song: FurnaceModuleSong): Array<{ name: string; samples: number; bytes: number }> {
  const seen = new Set<Int16Array>();
  const out: Array<{ name: string; samples: number; bytes: number }> = [];
  for (const i of song.instruments) {
    const f = i.furnace as FurnaceConfig;
    if (f.divInsType !== INS_ADPCM_B || !f.userSample || seen.has(f.userSample.data)) continue;
    seen.add(f.userSample.data);
    const n = f.userSample.data.length;
    out.push({ name: f.userSample.name, samples: n, bytes: Math.ceil(Math.ceil(n / 2) / 256) * 256 });
  }
  return out;
}

/** First `seconds` of `data`, last `fadeMs` faded to zero (no click at the cut). */
export function trimWithFade(data: Int16Array, rate: number, seconds: number, fadeMs: number): Int16Array {
  const n = Math.min(data.length, Math.round(seconds * rate));
  const fade = Math.min(n, Math.round(fadeMs * rate / 1000));
  const out = data.slice(0, n);
  for (let i = 0; i < fade; i++) out[n - fade + i] = Math.round(out[n - fade + i] * (1 - (i + 1) / fade));
  return out;
}

/** Windowed-sinc resample (low-passed at the lower Nyquist); even length for ADPCM. */
export function resample(data: Int16Array, from: number, to: number, gain = 1): Int16Array {
  const ratio = from / to;
  const cutoff = Math.min(1, to / from);
  const taps = 16;
  let len = Math.floor(data.length / ratio);
  if (len % 2) len++;
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i * ratio;
    const c = Math.floor(pos);
    let acc = 0;
    for (let k = c - taps + 1; k <= c + taps; k++) {
      if (k < 0 || k >= data.length) continue;
      const x = pos - k;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x * cutoff) / (Math.PI * x * cutoff);
      const win = 0.5 + 0.5 * Math.cos(Math.PI * x / taps);
      acc += data[k] * sinc * win * cutoff;
    }
    out[i] = Math.max(-32768, Math.min(32767, Math.round(acc * gain)));
  }
  return out;
}

/** Mono PCM16 samples and rate from a 16-bit PCM WAV file (stereo is mixed down). */
export function readWavPcm16(bytes: Uint8Array): { data: Int16Array; rate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let rate = 0, channels = 0, bits = 0;
  for (let o = 12; o + 8 <= bytes.length; o += 8 + v.getUint32(o + 4, true) + (v.getUint32(o + 4, true) & 1)) {
    const size = v.getUint32(o + 4, true);
    if (tag(o) === 'fmt ') {
      if (v.getUint16(o + 8, true) !== 1) throw new Error('WAV is not plain PCM');
      channels = v.getUint16(o + 10, true); rate = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true);
    } else if (tag(o) === 'data') {
      if (bits !== 16 || !channels) throw new Error('WAV must be 16-bit PCM');
      const frames = Math.floor(size / 2 / channels);
      const data = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += v.getInt16(o + 8 + (i * channels + c) * 2, true);
        data[i] = Math.round(s / channels);
      }
      return { data, rate };
    }
  }
  throw new Error('WAV has no data chunk');
}
