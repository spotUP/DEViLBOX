/**
 * "Afterburn Run" - stage-1 theme for a side-scrolling shoot-'em-up (Neo Geo, YM2610 extended FM, furtool palette).
 * D minor. 60 Hz, rows alternate 7 and 6 ticks (0F07 / 0F06 on every row) = 6.5 ticks per 16th = 138.5 BPM.
 * 16 rows per bar, 32-row patterns (2 bars), 36 bars = 62.4 s per pass.
 * Orders: 0-1 intro, 2-5 A (theme), 6-9 B (lift), 10-13 A' (theme + counter-melody + SSG double),
 * 14-15 bridge (half-time, bells), 16-17 build, then 0B02 back to A.
 * Plan and sound-design notes: thoughts/spot/2026-11-13-compare-fable-notes.md
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import type { FurnaceConfig, FurnaceOperatorConfig, FurnaceMacro } from '@/types/instrument';
import {
  NEO, NeoGeoSongBuilder, NeoGeoPattern, INS_SSG, INS_ADPCM_B, noteNumber,
  readWavPcm16, trimWithFade, resample,
} from '@/lib/export/neogeo/neoGeoCompose';

const OPNB = 14;
type Op = Partial<FurnaceOperatorConfig>;
type Fx = [number, number];

/** FM patch from operators named as on the chip (OP1-OP4); stored in register-slot order OP1, OP3, OP2, OP4. */
function fm(algorithm: number, feedback: number, ops: { op1: Op; op2: Op; op3: Op; op4: Op }): FurnaceConfig {
  const make = (o: Op): FurnaceOperatorConfig =>
    ({ ...DEFAULT_FURNACE.operators[0], dt: 3, rs: 0, ssg: 0, am: false, d2r: 0, ...o, enabled: true }) as FurnaceOperatorConfig;
  return {
    ...DEFAULT_FURNACE, chipType: OPNB, algorithm, feedback, fms: 0, ams: 0,
    operators: [make(ops.op1), make(ops.op3), make(ops.op2), make(ops.op4)],
    macros: [], opMacros: [{}, {}, {}, {}],
  } as FurnaceConfig;
}
const seqMacro = (code: number, data: number[], loop = -1): FurnaceMacro => ({ code, type: 0, data, loop, release: -1, mode: 0 });
function ssg(macros: FurnaceMacro[]): FurnaceConfig {
  return { ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_SSG, operators: [], macros, opMacros: [] } as FurnaceConfig;
}

export default function compareFable(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Afterburn Run - Stage 1', 6, 32);

  // ---- FM patches (dt 3 = no detune) -----------------------------------------------------------
  // Lead: two stacks (alg 4). Stack 1 = feedback saw (OP1 fb 6 -> OP2), stack 2 = mult 3 modulator for a nasal
  // "sync" edge that decays after the attack. Carriers detuned +2 / -2 for a chorused, wide sustain.
  const LEAD = s.addInstrument('Jet lead', fm(4, 6, {
    op1: { mult: 1, tl: 27, ar: 31, dr: 8, d2r: 1, sl: 3, rr: 8, rs: 1 },
    op2: { mult: 1, tl: 9, ar: 31, dr: 4, d2r: 0, sl: 1, rr: 8, dt: 5 },
    op3: { mult: 3, tl: 40, ar: 28, dr: 10, d2r: 2, sl: 4, rr: 8 },
    op4: { mult: 1, tl: 12, ar: 31, dr: 4, d2r: 0, sl: 1, rr: 8, dt: 1 },
  }));
  // Bass: one serial stack (alg 0). Modulators die quickly so each note is a bright pick that settles into a
  // round tone; the mult 2 operator in the middle adds the octave "clank" that cuts through on small speakers.
  const BASS = s.addInstrument('Pick bass', fm(0, 5, {
    op1: { mult: 1, tl: 33, ar: 31, dr: 12, d2r: 2, sl: 4, rr: 8 },
    op2: { mult: 2, tl: 38, ar: 31, dr: 14, d2r: 4, sl: 6, rr: 8 },
    op3: { mult: 1, tl: 24, ar: 31, dr: 10, d2r: 3, sl: 3, rr: 8 },
    op4: { mult: 1, tl: 6, ar: 31, dr: 8, d2r: 5, sl: 2, rr: 9, rs: 1 },
  }));
  // FM 2 as four operator channels, alg 7 (four carriers). OP1 has the feedback: it is the lead's echo and
  // decays so a held echo dies by itself. OP2-OP4 are detuned sine plucks: the chord stabs.
  const EXT = s.addInstrument('Echo + chord plucks (FM 2 ops)', fm(7, 5, {
    op1: { mult: 1, tl: 20, ar: 31, dr: 9, d2r: 6, sl: 4, rr: 8 },
    op2: { mult: 1, tl: 18, ar: 31, dr: 11, d2r: 5, sl: 6, rr: 9, dt: 5 },
    op3: { mult: 1, tl: 18, ar: 31, dr: 11, d2r: 5, sl: 6, rr: 9 },
    op4: { mult: 1, tl: 18, ar: 31, dr: 11, d2r: 5, sl: 6, rr: 9, dt: 1 },
  }));
  // Bell: mult 7 click into a mult 1 carrier, mult 4 into a mult 2 carrier: inharmonic strike, octave ring.
  const BELL = s.addInstrument('Star bell', fm(4, 0, {
    op1: { mult: 7, tl: 42, ar: 31, dr: 14, d2r: 5, sl: 15, rr: 7, rs: 2 },
    op2: { mult: 1, tl: 14, ar: 31, dr: 8, d2r: 4, sl: 4, rr: 6 },
    op3: { mult: 4, tl: 46, ar: 31, dr: 10, d2r: 4, sl: 10, rr: 6 },
    op4: { mult: 2, tl: 22, ar: 31, dr: 9, d2r: 5, sl: 5, rr: 6, dt: 4 },
  }));
  // Strings: slow attack on all four operators, detuned carriers. Counter-melody and pad line.
  const STR = s.addInstrument('Strings', fm(4, 4, {
    op1: { mult: 1, tl: 32, ar: 20, dr: 6, d2r: 1, sl: 3, rr: 6, dt: 4 },
    op2: { mult: 1, tl: 12, ar: 18, dr: 3, d2r: 0, sl: 1, rr: 6, dt: 5 },
    op3: { mult: 2, tl: 38, ar: 18, dr: 6, d2r: 1, sl: 3, rr: 6 },
    op4: { mult: 1, tl: 14, ar: 17, dr: 3, d2r: 0, sl: 1, rr: 6, dt: 1 },
  }));

  // ---- SSG -------------------------------------------------------------------------------------
  // Chord pluck: 12-tick decay to silence while the arp macro buzzes root / third / fifth every 2 ticks.
  // Both macros loop at step 12 (furtool keeps one loop point per instrument): the loop is the silent tail.
  const pluck = (third: number) => {
    const cycle = [0, 0, third, third, 7, 7];
    return ssg([
      seqMacro(0, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0], 12),
      seqMacro(1, [...cycle, ...cycle, ...cycle], 12),
    ]);
  };
  const PLUCK_MIN = s.addInstrument('Chord pluck minor', pluck(3));
  const PLUCK_MAJ = s.addInstrument('Chord pluck major', pluck(4));
  // Square that doubles the lead (slightly sharp via E5) and plays the runs: 1-tick octave chirp, then sustain.
  const PULSE = s.addInstrument('SSG pulse', ssg([seqMacro(0, [14, 13, 12, 11, 10, 10, 9, 9, 8]), seqMacro(1, [12, 0])]));
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [13, 8, 4, 2, 0]), seqMacro(3, [2])]));
  const OHAT = s.addInstrument('Hat open', ssg([seqMacro(0, [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 0]), seqMacro(3, [2])]));

  // ---- ADPCM-B drums: kick and snare share the channel (they never land on the same row) --------
  const sample = (name: string, path: string, seconds: number) => {
    const wav = readWavPcm16(readFileSync(`${repoRoot}/public/data/samples/packs/drumnibus/${path}`));
    const data = resample(trimWithFade(wav.data, wav.rate, seconds, 30), wav.rate, 18500, 0.9);
    return s.addInstrument(name, {
      ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_ADPCM_B, operators: [], macros: [], opMacros: [],
      userSample: { name: `afterburn ${name.toLowerCase()}`, data, rate: 18500 },
    } as unknown as FurnaceConfig);
  };
  const KICK = sample('Kick', 'kicks/BD_Romkick1.wav', 0.18);
  const SNARE = sample('Snare', 'snares/SD_electro7000.wav', 0.2);

  // ---- Harmony ---------------------------------------------------------------------------------
  type Chord = { root: string; stab: [string, string, string]; pluck: number; top: string };
  const C: Record<string, Chord> = {
    Dm: { root: 'D-2', stab: ['A-4', 'D-5', 'F-5'], pluck: PLUCK_MIN, top: 'D-5' },
    Bb: { root: 'Bb1', stab: ['Bb4', 'D-5', 'F-5'], pluck: PLUCK_MAJ, top: 'Bb4' },
    C: { root: 'C-2', stab: ['G-4', 'C-5', 'E-5'], pluck: PLUCK_MAJ, top: 'C-5' },
    A: { root: 'A-1', stab: ['A-4', 'C#5', 'E-5'], pluck: PLUCK_MAJ, top: 'A-4' },
    Am: { root: 'A-1', stab: ['A-4', 'C-5', 'E-5'], pluck: PLUCK_MIN, top: 'A-4' },
    Gm: { root: 'G-2', stab: ['G-4', 'Bb4', 'D-5'], pluck: PLUCK_MIN, top: 'G-4' },
    F: { root: 'F-2', stab: ['A-4', 'C-5', 'F-5'], pluck: PLUCK_MAJ, top: 'F-4' },
  };
  const up = (n: string, semis: number) => noteNumber(n) + semis;

  // ---- Part writers (bar = 16 rows, `o` = row of the bar start) ---------------------------------
  /** [row, note or null (effect only), effects]. */
  type Line = Array<[number, string | null, Fx[]?]>;
  const vib: Fx = [0x04, 0x34];
  const vibOn = new Map<number, boolean>();
  /** Writes a line; the first note after a vibrato gets 0400 so the vibrato never leaks into the next phrase. */
  function line(p: NeoGeoPattern, ch: number, o: number, l: Line, ins: number, vol: number) {
    for (const [r, n, fx = []] of l) {
      const out = [...fx];
      if (fx.some(([t, v]) => t === 0x04 && v)) vibOn.set(ch, true);
      else if (n !== null && vibOn.get(ch)) { out.push([0x04, 0]); vibOn.set(ch, false); }
      if (n === null) p.put(ch, o + r, { fx: out });
      else if (n === 'OFF') p.put(ch, o + r, { note: 'OFF', fx: out });
      else p.put(ch, o + r, { note: n, ins, vol, fx: out });
    }
  }

  /** Lead on FM 1, dotted-8th echo on FM 2 OP1 (-15 dB), optional SSG 2 double `double` semitones away. */
  function lead(p: NeoGeoPattern, o: number, l: Line, vol: number, double: number | null) {
    line(p, NEO.FM1, o, l, LEAD, vol);
    for (const [r, n] of l) {
      if (n === null) continue;
      if (n !== 'OFF' && o + r + 3 < 32) p.put(NEO.OP1, o + r + 3, { note: n, ins: EXT, vol: 107, fx: [[0xed, 1]] });
      if (double !== null) {
        if (n === 'OFF') p.put(NEO.SSG2, o + r, { note: 'OFF' });
        else p.put(NEO.SSG2, o + r, { note: up(n, double), ins: PULSE, vol: 8, fx: [[0xe5, 0x84]] });
      }
    }
  }

  type BassStyle = 'gallop' | 'eighths' | 'long';
  function bass(p: NeoGeoPattern, o: number, ch: Chord, style: BassStyle) {
    const hits: Array<[number, number]> = style === 'gallop'
      // 8th + two 16ths, octave pops on beats 2 and 4, fifth on beat 3, octave-fifth walk into the next bar.
      ? [[0, 0], [2, 0], [3, 0], [4, 12], [6, 0], [7, 0], [8, 0], [10, 7], [11, 7], [12, 12], [14, 12], [15, 7]]
      : style === 'eighths'
        ? [[0, 0], [2, 12], [4, 0], [6, 12], [8, 0], [10, 12], [12, 7], [14, 12]]
        : [[0, 0], [10, 0], [12, 12]];
    for (const [r, st] of hits) p.put(NEO.FM3, o + r, { note: up(ch.root, st), ins: BASS, vol: r % 4 === 0 ? 127 : 111 });
  }

  type DrumStyle = 'four' | 'drive' | 'half';
  function drums(p: NeoGeoPattern, o: number, style: DrumStyle, opts: { six?: boolean; fill?: boolean; crash?: boolean } = {}) {
    const kicks = style === 'four' ? [0, 4, 8, 12] : style === 'half' ? [0, 10] : opts.fill ? [0, 3] : [0, 3, 8, 10];
    const snares = style === 'four' ? [] : style === 'half' ? [8] : opts.fill ? [4, 8, 10, 12, 13, 14, 15] : [4, 12];
    // No volume column on ADPCM-B: the column tops out at 127 of 255 and would stick for every later hit.
    for (const r of kicks) p.put(NEO.B, o + r, { note: 'C-4', ins: KICK });
    for (const r of snares) p.put(NEO.B, o + r, { note: 'C-4', ins: SNARE });
    for (let r = 0; r < 16; r += opts.six ? 1 : 2) {
      if (opts.fill && r >= 8) break;
      const open = r === 14 || (opts.crash && r === 0);
      const vol = open ? 10 : style === 'half' ? 8 : r % 4 === 0 ? 12 : 8;
      p.put(NEO.SSG3, o + r, { note: 'C-6', ins: open ? OHAT : HAT, vol });
    }
  }

  /** Chord plucks on FM 2 OP2-OP4; OP4 strums one tick late. */
  function stabs(p: NeoGeoPattern, o: number, ch: Chord, rows: number[]) {
    for (const r of rows) ch.stab.forEach((n, i) => p.put(NEO.OP2 + i, o + r, { note: n, ins: EXT, vol: 119, fx: i === 2 ? [[0xed, 1]] : [] }));
  }

  /** SSG 1: 8th-note chord plucks, 3+3+2 accents, octave jumps. */
  function plucks(p: NeoGeoPattern, o: number, ch: Chord) {
    const semis = [0, 0, 12, 0, 0, 12, 0, 12], vols = [12, 8, 10, 8, 8, 10, 8, 10];
    semis.forEach((st, i) => p.put(NEO.SSG1, o + i * 2, { note: up(ch.top, st), ins: ch.pluck, vol: vols[i] }));
  }

  /** FM 4 bells, hard left / right ping-pong. `from` 0 = full bar of 8ths, 8 = 16th-note answer in the second half. */
  function bells(p: NeoGeoPattern, o: number, ch: Chord, from: 0 | 8) {
    const [a, b, c] = ch.stab.map((n) => noteNumber(n));
    const notes = from === 0 ? [a, b, c, a + 12, c, b, c, a + 12] : [b, c, a + 12, b + 12, c + 12, b + 12, a + 12, c];
    notes.forEach((n, i) => p.put(NEO.FM4, o + from + i * (from === 0 ? 2 : 1), {
      note: n, ins: BELL, vol: i % 2 ? 87 : 103, fx: [[0x08, i % 2 ? 0x0f : 0xf0]],
    }));
  }

  /** SSG 2 run, one note per row from row 8. */
  function run(p: NeoGeoPattern, o: number, notes: string[]) {
    notes.forEach((n, i) => p.put(NEO.SSG2, o + 8 + i, { note: n, ins: PULSE, vol: 12, fx: [[0xe5, 0x80]] }));
  }

  // ---- Sections --------------------------------------------------------------------------------
  interface Bar {
    ch: Chord;
    lead?: Line; leadVol?: number; double?: number | null;
    bass?: BassStyle; drums?: DrumStyle; six?: boolean; fill?: boolean;
    stabs?: number[]; plucks?: boolean;
    /** FM 4 / SSG 2 extras for this bar. */
    extra?: (p: NeoGeoPattern, o: number) => void;
  }
  const order: NeoGeoPattern[] = [];
  function section(bars: Bar[]) {
    for (let i = 0; i < bars.length; i += 2) {
      const p = s.pattern();
      for (let b = 0; b < 2; b++) {
        const bar = bars[i + b], o = b * 16;
        if (i + b === 0) {
          // Section seam (also the loop seam): stop whatever the previous section left ringing, centre FM 4.
          p.put(NEO.FM1, 0, { note: 'OFF' });
          p.put(NEO.FM4, 0, { note: 'OFF', fx: [[0x08, 0xff]] });
          p.put(NEO.SSG2, 0, { note: 'OFF' });
        }
        if (bar.bass) bass(p, o, bar.ch, bar.bass);
        if (bar.drums) drums(p, o, bar.drums, { six: bar.six, fill: bar.fill, crash: i + b === 0 });
        if (bar.stabs) stabs(p, o, bar.ch, bar.stabs);
        if (bar.plucks !== false) plucks(p, o, bar.ch);
        if (bar.lead) lead(p, o, bar.lead, bar.leadVol ?? 119, bar.double ?? null);
        bar.extra?.(p, o);
      }
      // 138.5 BPM: rows alternate 7 and 6 ticks.
      for (let r = 0; r < 32; r++) p.put(NEO.B, r, { fx: [[0x0f, r % 2 ? 6 : 7]] });
      order.push(p);
    }
  }
  const strLine = (l: Line) => (p: NeoGeoPattern, o: number) => line(p, NEO.FM4, o, l, STR, 95);

  // Intro: plucks + four-on-the-floor, then bass and the full kit, fill and an SSG run into the theme.
  section([
    { ch: C.Dm, bass: 'long', drums: 'four', stabs: [0, 6, 12] },
    { ch: C.Dm, bass: 'long', drums: 'four', stabs: [0, 6, 12] },
    { ch: C.Bb, bass: 'gallop', drums: 'drive', stabs: [0, 6, 12] },
    {
      ch: C.C, bass: 'gallop', drums: 'drive', fill: true, stabs: [0, 6, 12],
      extra: (p, o) => run(p, o, ['G-4', 'A-4', 'Bb4', 'C-5', 'D-5', 'E-5', 'G-5', 'C-6']),
    },
  ]);

  // Theme A: Dm Bb C Dm | Dm Bb C A. Rising 3+3+2 motif (D F A -> D), answered a bar later; second phrase climbs.
  const aChords = [C.Dm, C.Bb, C.C, C.Dm, C.Dm, C.Bb, C.C, C.A];
  const aLead: Line[] = [
    [[0, 'D-5'], [3, 'F-5'], [6, 'A-5'], [8, 'D-6'], [12, 'C-6'], [14, 'A-5']],
    [[0, 'Bb5'], [3, 'A-5'], [6, 'F-5'], [8, 'D-5'], [12, 'F-5'], [14, 'G-5']],
    [[0, 'G-5'], [3, 'E-5'], [6, 'G-5'], [8, 'C-6'], [12, 'G-5'], [14, 'E-5']],
    [[0, 'F-5'], [4, null, [vib]], [8, 'D-5'], [10, 'E-5'], [12, 'F-5'], [14, 'A-5']],
    [[0, 'D-5'], [3, 'F-5'], [6, 'A-5'], [8, 'D-6'], [12, 'E-6'], [14, 'F-6']],
    [[0, 'F-6'], [4, 'D-6'], [6, 'Bb5'], [8, 'D-6'], [12, 'C-6'], [14, 'Bb5']],
    [[0, 'C-6'], [3, 'G-5'], [6, 'C-6'], [8, 'E-6'], [12, 'D-6'], [14, 'C-6']],
    [[0, 'C#6'], [4, null, [vib]], [8, 'A-5'], [10, 'B-5'], [12, 'C#6'], [14, 'E-6']],
  ];
  const counter: Line[] = [
    [[0, 'A-4'], [8, 'D-5'], [12, 'F-5']],
    [[0, 'F-5'], [8, 'D-5'], [12, 'Bb4']],
    [[0, 'E-5'], [6, 'G-5'], [8, 'E-5'], [12, 'C-5']],
    [[0, 'A-4'], [4, 'D-5'], [8, 'A-5', [vib]], [14, 'OFF']],
    [[0, 'F-5'], [6, 'D-5'], [8, 'A-4'], [12, 'D-5']],
    [[0, 'D-5'], [4, 'F-5'], [8, 'Bb5', [vib]], [14, 'F-5']],
    [[0, 'G-5'], [6, 'E-5'], [8, 'G-5'], [12, 'E-5']],
    [[0, 'E-5'], [4, 'A-5', [vib]], [12, 'G-5'], [14, 'E-5']],
  ];
  const themeA = (second: boolean): Bar[] => aChords.map((ch, i) => ({
    ch, lead: aLead[i], double: second ? 0 : null,
    bass: 'gallop', drums: 'drive', six: second, fill: i === 7, stabs: [3, 6, 11, 14],
    // First pass: bells answer the long notes in bars 4 and 8. Second pass: string counter-melody.
    extra: second ? strLine(counter[i]) : i === 3 || i === 7 ? (p, o) => bells(p, o, ch, 8) : undefined,
  }));
  section(themeA(false));

  // B: Bb C Am Dm | Gm C F A. Longer notes, octave bass, off-beat chords, string pad line, SSG double an octave down.
  const bChords = [C.Bb, C.C, C.Am, C.Dm, C.Gm, C.C, C.F, C.A];
  const bLead: Line[] = [
    [[0, 'D-5'], [4, 'F-5'], [8, 'Bb5'], [14, 'A-5']],
    [[0, 'G-5'], [6, 'E-5'], [8, 'G-5'], [12, 'C-6']],
    [[0, 'C-6'], [4, 'A-5'], [6, 'E-5'], [8, 'A-5'], [12, 'G-5'], [14, 'E-5']],
    [[0, 'F-5'], [4, null, [vib]], [8, 'D-5'], [10, 'F-5'], [12, 'A-5'], [14, 'D-6']],
    [[0, 'Bb5'], [3, 'G-5'], [6, 'Bb5'], [8, 'D-6'], [12, 'C-6'], [14, 'Bb5']],
    [[0, 'C-6'], [3, 'G-5'], [6, 'C-6'], [8, 'E-6'], [12, 'D-6'], [14, 'C-6']],
    [[0, 'F-6'], [4, 'C-6'], [6, 'A-5'], [8, 'C-6'], [10, 'F-6'], [12, 'E-6'], [14, 'D-6']],
    [[0, 'C#6'], [4, null, [vib]], [8, 'E-6'], [14, 'OFF']],
  ];
  const bPad: Line[] = [
    [[0, 'F-4']], [[0, 'E-4']], [[0, 'E-4'], [8, 'C-4']], [[0, 'D-4'], [8, 'A-4']],
    [[0, 'D-4']], [[0, 'E-4']], [[0, 'F-4'], [8, 'A-4']], [[0, 'E-4'], [8, 'C#5']],
  ];
  section(bChords.map((ch, i) => ({
    ch, lead: bLead[i], double: -12,
    bass: 'eighths', drums: 'drive', fill: i === 7, stabs: [2, 6, 10, 14], extra: strLine(bPad[i]),
  })));

  section(themeA(true));

  // Bridge (Dm Bb Gm A): half-time kit, held bass, bells in 8ths, quiet lead. Build (Bb C Dm A): full kit with
  // 16th hats, rising lead with the SSG double, strings climbing, fill and a run up the A scale into the theme.
  const cChords = [C.Dm, C.Bb, C.Gm, C.A, C.Bb, C.C, C.Dm, C.A];
  const cLead: Line[] = [
    [[0, 'A-5'], [12, 'G-5'], [14, 'F-5']],
    [[0, 'D-5'], [8, 'F-5'], [12, 'Bb5']],
    [[0, 'G-5'], [12, 'F-5'], [14, 'D-5']],
    [[0, 'E-5'], [4, null, [vib]], [8, 'C#5'], [12, 'E-5'], [14, 'A-5']],
    [[0, 'D-5'], [3, 'F-5'], [6, 'Bb5'], [8, 'D-6'], [11, 'Bb5'], [14, 'D-6']],
    [[0, 'E-5'], [3, 'G-5'], [6, 'C-6'], [8, 'E-6'], [11, 'C-6'], [14, 'E-6']],
    [[0, 'F-6'], [2, 'D-6'], [4, 'A-5'], [6, 'D-6'], [8, 'F-6'], [10, 'D-6'], [12, 'A-5'], [14, 'D-6']],
    [[0, 'E-6'], [2, null, [vib]], [8, 'OFF']],
  ];
  const buildStr = ['D-5', 'E-5', 'F-5', 'A-5'];
  section(cChords.map((ch, i): Bar => i < 4
    ? { ch, lead: cLead[i], leadVol: 95, bass: 'long', drums: 'half', stabs: [0], extra: (p, o) => bells(p, o, ch, 0) }
    : {
      ch, lead: cLead[i], double: i < 7 ? 0 : null, bass: 'gallop', drums: 'drive', six: true, fill: i === 7,
      stabs: [0, 4, 8, 12],
      extra: (p, o) => {
        // Bells stop and FM 4 re-centres when the strings take over.
        p.put(NEO.FM4, o, { note: buildStr[i - 4], ins: STR, vol: 103, fx: [[0x08, 0xff]] });
        if (i === 7) {
          p.put(NEO.SSG2, o, { note: 'OFF' });
          run(p, o, ['A-5', 'B-5', 'C#6', 'D-6', 'E-6', 'F-6', 'G-6', 'A-6']);
        }
      },
    }));

  // Loop back to theme A (order 2); its first row silences FM 1, FM 4 and SSG 2.
  order[order.length - 1].put(NEO.FM1, 31, { fx: [[0x0b, 2]] });

  for (const p of order) s.order.push(s.indexOf(p));
  return s;
}
