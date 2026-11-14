/**
 * Gumbirds - title theme (Neo Geo MVS, YM2610 extended FM, nullsound via furtool).
 * F major, speed 7 at 60 Hz (about 129 BPM), 16 rows per bar, 32-row patterns (2 bars).
 * Orders: 0 intro (drums + bass), 1-4 hook A, 5-6 answer B (first and last pattern), 7-10 hook A + counter-melody,
 * then 0B01 back to hook A. About 41 s.
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

export default function gumbirdsTitle(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Gumbirds - Title', 7, 32);

  // ---- Instruments -------------------------------------------------------------------------
  // Lead brass: two 2-op stacks (alg 4). OP1 feedback gives the brass edge; its attack is a touch slower than the
  // carriers so each note "blooms". Carriers OP2/OP4 detuned +1/-1 for width. 12xx on OP1 opens the tone on accents.
  const LEAD = s.addInstrument('Lead brass', fm(4, 5, {
    op1: { mult: 1, tl: 30, ar: 24, dr: 9, d2r: 2, sl: 3, rr: 7, dt: 3, rs: 1 },
    op2: { mult: 1, tl: 10, ar: 31, dr: 5, d2r: 1, sl: 2, rr: 7, dt: 4, rs: 1 },
    op3: { mult: 2, tl: 42, ar: 26, dr: 11, d2r: 3, sl: 5, rr: 7, dt: 2 },
    op4: { mult: 1, tl: 14, ar: 31, dr: 4, d2r: 1, sl: 2, rr: 7, dt: 2, rs: 1 },
  }));
  // Slap bass (alg 4): OP1 (feedback 6) gives the growl, OP3 at mult 5 is a fast-dying click into OP4 = the slap.
  // 14xx lowers OP3 TL on octave-up notes to slap harder; the low notes reset it.
  const BASS = s.addInstrument('Slap bass', fm(4, 6, {
    op1: { mult: 1, tl: 24, ar: 31, dr: 13, d2r: 4, sl: 5, rr: 9, dt: 3 },
    op2: { mult: 1, tl: 6, ar: 31, dr: 7, d2r: 4, sl: 3, rr: 10, dt: 3, rs: 1 },
    op3: { mult: 5, tl: 34, ar: 31, dr: 19, d2r: 10, sl: 15, rr: 12, dt: 4 },
    op4: { mult: 1, tl: 12, ar: 31, dr: 9, d2r: 6, sl: 5, rr: 10, dt: 2, rs: 1 },
  }));
  // FM 2 split into 4 operator channels: one alg 7 patch (all carriers). OP1 has the feedback: the lead's echo.
  // OP2-OP4 play the chord stabs: quick decay, small spread of detune between them for width.
  const EXT = s.addInstrument('Echo + stab (FM 2 ops)', fm(7, 4, {
    op1: { mult: 1, tl: 4, ar: 31, dr: 8, d2r: 3, sl: 4, rr: 7, dt: 3 },
    op2: { mult: 2, tl: 8, ar: 31, dr: 14, d2r: 6, sl: 5, rr: 10, dt: 4 },
    op3: { mult: 2, tl: 8, ar: 31, dr: 14, d2r: 6, sl: 5, rr: 10, dt: 2 },
    op4: { mult: 2, tl: 8, ar: 31, dr: 14, d2r: 6, sl: 5, rr: 10, dt: 3 },
  }));
  // Bells (alg 4): mult 14 and mult 3 modulators over mult 2 / mult 1 carriers = glassy bell with a long ring.
  const BELL = s.addInstrument('Candy bell', fm(4, 0, {
    op1: { mult: 14, tl: 44, ar: 31, dr: 12, d2r: 4, sl: 15, rr: 6, dt: 3, rs: 2 },
    op2: { mult: 2, tl: 12, ar: 31, dr: 6, d2r: 3, sl: 5, rr: 5, dt: 4, rs: 1 },
    op3: { mult: 3, tl: 38, ar: 31, dr: 8, d2r: 3, sl: 9, rr: 5, dt: 2 },
    op4: { mult: 1, tl: 16, ar: 31, dr: 5, d2r: 2, sl: 4, rr: 5, dt: 3, rs: 1 },
  }));
  // Counter horn (alg 4): mellower than the lead (lower feedback, softer attack) so the two lines stay apart.
  const HORN = s.addInstrument('Counter horn', fm(4, 3, {
    op1: { mult: 2, tl: 40, ar: 22, dr: 7, d2r: 2, sl: 4, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 12, ar: 26, dr: 4, d2r: 1, sl: 2, rr: 6, dt: 4 },
    op3: { mult: 1, tl: 46, ar: 20, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 2 },
    op4: { mult: 1, tl: 14, ar: 26, dr: 4, d2r: 1, sl: 2, rr: 6, dt: 2 },
  }));
  // SSG. One loop point per instrument (furtool keeps one for all macros of an instrument).
  const arpMacro = (third: number, top: number) => {
    const cycle = [0, 0, third, third, 7, 7, top, top];
    return [
      // Pluck decay over 16 ticks, then a soft tail; the loop sits on the tail so the arp keeps cycling.
      // Starts at 15 and rests on 11 (1st fix 13 -> 7 measured 8.7 dB under the lead): the old 9 -> 2 curve with note volume 12 was inaudible (rmsAvg 0.0009 soloed).
      seqMacro(0, [15, 15, 14, 14, 13, 13, 12, 12, 12, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11], 16),
      seqMacro(1, [...cycle, ...cycle, ...cycle], 16),
    ];
  };
  const ARP_MAJ = s.addInstrument('Arp major', ssg(arpMacro(4, 12)));
  const ARP_MIN = s.addInstrument('Arp minor', ssg(arpMacro(3, 12)));
  const ARP_DOM = s.addInstrument('Arp dominant 7', ssg(arpMacro(4, 10)));
  // Run voice: a plucked square for the fast scale run (short tick of an octave up = attack sparkle).
  const RUN = s.addInstrument('SSG run pluck', ssg([
    seqMacro(0, [14, 13, 12, 11, 10, 9, 8, 8]),
    seqMacro(1, [12, 0]),
  ]));
  // Hats: noise only. Closed = 5-tick snap; open = 14-tick ring.
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [12, 8, 5, 3, 1, 0]), seqMacro(3, [2])]));
  const OHAT = s.addInstrument('Hat open', ssg([seqMacro(0, [11, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 0]), seqMacro(3, [2])]));
  // Snare: two ticks of tone + noise with a falling tone blip (arp 12 -> 5 -> 0), then noise tail.
  const SNARE = s.addInstrument('Snare', ssg([
    seqMacro(0, [15, 14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0]),
    seqMacro(1, [12, 5, 0]),
    seqMacro(3, [3, 3, 2]),
  ]));
  // Kick: 0.18 s of a TR-style kick, resampled to 18.5 kHz, 30 ms fade at the end.
  const wav = readWavPcm16(readFileSync(`${repoRoot}/public/data/samples/packs/drumnibus/kicks/BD_Romkick1.wav`));
  const kickData = resample(trimWithFade(wav.data, wav.rate, 0.18, 30), wav.rate, 18500, 0.9);
  const KICK = s.addInstrument('Kick', {
    ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_ADPCM_B, operators: [], macros: [], opMacros: [],
    userSample: { name: 'gumbirds kick', data: kickData, rate: 18500 },
  } as unknown as FurnaceConfig);

  // ---- Harmony -----------------------------------------------------------------------------
  type Chord = { root: string; stab: [string, string, string]; arp: number; arpNote: string };
  const C: Record<string, Chord> = {
    F: { root: 'F-2', stab: ['A-4', 'C-5', 'F-5'], arp: ARP_MAJ, arpNote: 'F-4' },
    Bb: { root: 'Bb2', stab: ['Bb4', 'D-5', 'F-5'], arp: ARP_MAJ, arpNote: 'Bb4' },
    C: { root: 'C-3', stab: ['G-4', 'C-5', 'E-5'], arp: ARP_MAJ, arpNote: 'C-5' },
    C7: { root: 'C-3', stab: ['G-4', 'Bb4', 'E-5'], arp: ARP_DOM, arpNote: 'C-5' },
    Gm: { root: 'G-2', stab: ['G-4', 'Bb4', 'D-5'], arp: ARP_MIN, arpNote: 'G-4' },
    Dm: { root: 'D-3', stab: ['A-4', 'D-5', 'F-5'], arp: ARP_MIN, arpNote: 'D-5' },
    Am: { root: 'A-2', stab: ['A-4', 'C-5', 'E-5'], arp: ARP_MIN, arpNote: 'A-4' },
  };
  const up = (n: string, semis: number) => noteNumber(n) + semis;

  // ---- Parts (bar = 16 rows; `o` = row offset of the bar in its pattern) --------------------
  // Slap bass: 8ths with octave jumps, slap (14xx) on the high notes, fifth on row 10.
  function bass(p: NeoGeoPattern, o: number, ch: Chord, half = false, fill = false) {
    if (half) {
      p.put(NEO.FM3, o, { note: ch.root, ins: BASS, vol: 127, fx: [[0x14, 34]] });
      p.put(NEO.FM3, o + 6, { note: up(ch.root, 12), ins: BASS, vol: 95, fx: [[0x14, 26]] });
      p.put(NEO.FM3, o + 8, { note: ch.root, ins: BASS, vol: 111, fx: [[0x14, 34]] });
      p.put(NEO.FM3, o + 14, { note: up(ch.root, 7), ins: BASS, vol: 95 });
      return;
    }
    const hits: Array<[number, number, number, boolean]> = [ // row, semitones, vol, slap
      [0, 0, 127, false], [2, 12, 111, true], [4, 0, 111, false], [6, 12, 111, true],
      [8, 0, 127, false], [10, 7, 95, false], [12, 12, 111, true], [14, fill ? 10 : 0, 95, false],
    ];
    for (const [r, st, vol, slap] of hits) {
      p.put(NEO.FM3, o + r, { note: up(ch.root, st), ins: BASS, vol, fx: [[0x14, slap ? 20 : 34]] });
    }
    if (fill) p.put(NEO.FM3, o + 15, { note: up(ch.root, 12), ins: BASS, vol: 111, fx: [[0x14, 18], [0xe1, 0x42]] });
  }

  // Drums. Kick on ADPCM-B, snare SSG 3, hats SSG 2 (8ths, or 16ths with accents when `sixteenths`).
  function drums(p: NeoGeoPattern, o: number, opts: { sixteenths?: boolean; fill?: boolean; push?: boolean } = {}) {
    for (const r of [0, 6, 8]) p.put(NEO.B, o + r, { note: 'C-4', ins: KICK });
    if (opts.push) p.put(NEO.B, o + 14, { note: 'C-4', ins: KICK });
    p.put(NEO.SSG3, o + 4, { note: 'A-4', ins: SNARE });
    if (opts.fill) {
      p.put(NEO.SSG3, o + 10, { note: 'G-4', ins: SNARE, vol: 8 });
      p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
      p.put(NEO.SSG3, o + 13, { note: 'B-4', ins: SNARE, vol: 10 });
      p.put(NEO.SSG3, o + 14, { note: 'C-5', ins: SNARE, vol: 12 });
      p.put(NEO.SSG3, o + 15, { note: 'D-5', ins: SNARE, fx: [[0xed, 3]] });
      p.put(NEO.B, o + 15, { note: 'C-4', ins: KICK, fx: [[0xed, 3]] });
    } else {
      p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
    }
    for (let r = 0; r < 16; r += opts.sixteenths ? 1 : 2) {
      if (opts.fill && r >= 12) break;
      const open = r === 6 || r === 14;
      const vol = opts.sixteenths && r % 2 ? 8 : undefined;
      p.put(NEO.SSG2, o + r, { note: 'C-6', ins: open ? OHAT : HAT, vol });
    }
  }

  // Chord stabs on the FM 2 operators: off-beat hits; OP4 strums 1 tick late. `echo` repeats the stab
  // 2 rows later, quieter (the ext-FM echo stab). Operator-channel volume is log scale (Furnace
  // ym2610ext: TL = 127 - (127 - opTL + vol - 127)), 0.75 dB per step: 127 = patch level, 103 = -18 dB.
  function stabs(p: NeoGeoPattern, o: number, ch: Chord, rows: number[], echo = false) {
    for (const r of rows) {
      ch.stab.forEach((n, i) => p.put(NEO.OP2 + i, o + r, { note: n, ins: EXT, vol: 127, fx: i === 2 ? [[0xed, 1]] : [] }));
      if (echo && r + 2 < 16) ch.stab.forEach((n, i) => p.put(NEO.OP2 + i, o + r + 2, { note: n, ins: EXT, vol: 103, fx: [[0xed, i]] }));
    }
  }

  function arps(p: NeoGeoPattern, o: number, ch: Chord) {
    p.put(NEO.SSG1, o, { note: ch.arpNote, ins: ch.arp });
    p.put(NEO.SSG1, o + 8, { note: ch.arpNote, ins: ch.arp });
  }

  // Lead line: [row, note, fx?]. The OP1 echo copies it 2 rows later, quieter, a touch delayed.
  type Line = Array<[number, string, Array<[number, number]>?]>;
  function lead(p: NeoGeoPattern, o: number, line: Line, echo = true, vol = 111) {
    for (const [r, n, fx] of line) {
      p.put(NEO.FM1, o + r, { note: n, ins: LEAD, vol, fx: fx ?? [] });
      if (echo && n !== 'OFF' && o + r + 2 < 32) p.put(NEO.OP1, o + r + 2, { note: n, ins: EXT, vol: 103, fx: [[0xed, 2]] });
    }
  }

  // ---- The gum hook (4 bars) and its answer ------------------------------------------------
  const vib: [number, number] = [0x04, 0x34];
  const hookA1: Line = [[0, 'C-5'], [3, 'F-5'], [6, 'A-5'], [8, 'C-6', [[0x12, 22]]], [12, 'A-5', [[0x12, 30]]], [14, 'G-5']];
  const hookA2: Line = [[0, 'F-5'], [3, 'D-5'], [6, 'Bb4'], [10, 'D-5'], [11, 'F-5'], [12, 'Bb5', [[0x12, 24]]], [14, 'A-5', [[0x12, 30]]]];
  const hookA3: Line = [[0, 'G-5'], [3, 'E-5'], [6, 'C-6', [[0x12, 22]]], [8, 'Bb5', [[0x12, 30]]], [10, 'A-5'], [12, 'G-5'], [14, 'E-5']];
  const hookA4: Line = [[0, 'F-5'], [4, 'F-5', [vib]], [8, 'F-5', [[0x0a, 0x02]]], [10, 'C-5', [[0x04, 0], [0x0a, 0]]], [12, 'D-5'], [14, 'E-5']];
  const hookA7: Line = [[0, 'G-5'], [3, 'Bb5'], [6, 'D-6', [[0x12, 20]]], [8, 'C-6', [[0x12, 30]]], [10, 'Bb5'], [12, 'A-5'], [14, 'G-5']];
  // Last bar: F lands with a portamento from G, vibrato, then the short falling tail (E2 note slide down).
  const hookA8: Line = [[0, 'F-5', [[0x03, 0x30]]], [4, 'F-5', [vib]], [12, 'F-5', [[0xe2, 0x45], [0x04, 0]]], [15, 'OFF']];

  const ansB: Line[] = [
    [[0, 'A-5'], [4, 'F-5'], [6, 'A-5'], [8, 'D-6', [[0x12, 20]]], [14, 'C-6', [[0x12, 30]]]],
    [[0, 'Bb5'], [6, 'A-5'], [8, 'F-5'], [12, 'D-5'], [14, 'F-5']],
    [[0, 'A-5'], [3, 'G-5'], [6, 'F-5'], [8, 'C-6', [[0x03, 0x40]]], [14, 'A-5']],
    [[0, 'G-5'], [4, 'G-5', [vib]], [8, 'OFF', [[0x04, 0]]]],
    [[0, 'F-5'], [2, 'A-5'], [4, 'D-6', [[0x12, 22]]], [6, 'C-6', [[0x12, 30]]], [8, 'A-5'], [12, 'F-5'], [14, 'A-5']],
    [[0, 'D-6'], [6, 'C-6'], [8, 'Bb5'], [10, 'A-5'], [12, 'Bb5'], [14, 'D-6']],
    [[0, 'C-6'], [3, 'Bb5'], [6, 'G-5'], [8, 'Bb5'], [10, 'C-6'], [12, 'D-6'], [14, 'E-6', [[0x12, 20]]]],
    [[0, 'E-6', [[0x0a, 0x01]]], [4, 'E-6', [vib]], [8, 'OFF', [[0x04, 0], [0x0a, 0], [0x12, 30]]]],
  ];
  // Bells answer the lead at the end of B bar 4 (ping-pong panning).
  const bellAnswer = (p: NeoGeoPattern, o: number) => {
    const notes = ['E-5', 'G-5', 'C-6', 'E-6', 'G-6', 'E-6', 'C-6', 'G-5'];
    notes.forEach((n, i) => p.put(NEO.FM4, o + 8 + i, { note: n, ins: BELL, vol: i % 2 ? 79 : 95, fx: [[0x08, i % 2 ? 0x0f : 0xf0]] }));
  };
  // Fast SSG run up two octaves of F major at the end of B (one note per row, A on top).
  const run = (p: NeoGeoPattern, o: number) => {
    const scale = ['C-5', 'D-5', 'E-5', 'F-5', 'G-5', 'A-5', 'Bb5', 'C-6', 'D-6', 'E-6', 'F-6', 'G-6'];
    scale.forEach((n, i) => p.put(NEO.SSG1, o + 4 + i, { note: n, ins: RUN }));
    p.put(NEO.SSG1, o + 15, { note: 'A-6', ins: RUN });
  };
  // Counter-melody for the repeat of hook A: longer notes in the gaps of the lead, octave 4-5.
  const counter: Line[] = [
    [[0, 'A-4'], [8, 'C-5'], [12, 'Bb4']],
    [[0, 'D-5', [vib]], [8, 'F-5'], [14, 'E-5']],
    [[0, 'E-5'], [4, 'G-5'], [8, 'E-5'], [12, 'C-5']],
    [[0, 'A-4'], [4, 'C-5'], [6, 'F-5', [[0x03, 0x20]]], [8, 'A-5', [vib]], [14, 'OFF', [[0x04, 0]]]],
    [[0, 'C-5'], [6, 'A-4'], [8, 'F-4'], [12, 'A-4']],
    [[0, 'Bb4'], [4, 'D-5'], [8, 'F-5', [vib]], [14, 'D-5', [[0x04, 0]]]],
    [[0, 'Bb4'], [6, 'D-5'], [8, 'E-5'], [12, 'G-5']],
    [[0, 'A-5', [[0x03, 0x30]]], [4, 'A-5', [vib]], [12, 'A-5', [[0xe2, 0x35], [0x04, 0]]], [15, 'OFF']],
  ];
  // ---- Patterns ----------------------------------------------------------------------------
  const order: NeoGeoPattern[] = [];

  // Intro: kick + snare + hats + slap bass, F | C, snare fill into the hook.
  const intro = s.pattern();
  bass(intro, 0, C.F); bass(intro, 16, C.C, false, true);
  drums(intro, 0); drums(intro, 16, { fill: true });
  intro.put(NEO.B, 0, { note: 'C-4', ins: KICK, fx: [[0x08, 0xff]] });
  order.push(intro);

  // Hook A (and A2 with the counter-melody and 16th hats).
  // Bar 2 is C7: the lead passes Bb5 there, so a C major arp (E) and stab would grind against it.
  const hookChords = [C.F, C.Bb, C.C7, C.F, C.F, C.Bb, C.Gm, C.F];
  const hookLines = [hookA1, hookA2, hookA3, hookA4, hookA1, hookA2, hookA7, hookA8];
  for (const withCounter of [false, true]) {
    for (let pi = 0; pi < 4; pi++) {
      const p = s.pattern();
      for (let b = 0; b < 2; b++) {
        const bar = pi * 2 + b, o = b * 16, ch = hookChords[bar];
        // Bar 6 is Gm | C7: two chords in one bar (lead C6 Bb5 A5 G5 over the C7 half).
        bass(p, o, bar === 6 ? C.Gm : ch, false, bar === 7);
        if (bar === 6) {
          p.put(NEO.FM3, o + 8, { note: 'C-3', ins: BASS, vol: 127, fx: [[0x14, 34]] });
          p.put(NEO.FM3, o + 10, { note: 'C-4', ins: BASS, vol: 111, fx: [[0x14, 20]] });
          p.put(NEO.FM3, o + 12, { note: 'G-2', ins: BASS, vol: 111, fx: [[0x14, 34]] });
          p.put(NEO.FM3, o + 14, { note: 'C-4', ins: BASS, vol: 111, fx: [[0x14, 20]] });
        }
        drums(p, o, { sixteenths: withCounter, fill: bar === 7, push: bar % 2 === 1 });
        stabs(p, o, bar === 6 ? C.Gm : ch, [6], bar === 3 || bar === 7);
        stabs(p, o, bar === 6 ? C.C7 : ch, [14], bar === 3 || bar === 7);
        arps(p, o, bar === 6 ? C.Gm : ch);
        if (bar === 6) p.put(NEO.SSG1, o + 8, { note: C.C7.arpNote, ins: C.C7.arp });
        lead(p, o, hookLines[bar], !withCounter || bar % 2 === 0);
        if (withCounter) {
          for (const [r, n, fx] of counter[bar]) p.put(NEO.FM4, o + r, { note: n, ins: HORN, vol: 95, fx: fx ?? [] });
        } else if (bar === 3) {
          bellAnswer(p, o);
        }
      }
      // Seam cleanup at the start of every hook A pass: stop notes carried over the loop jump.
      if (pi === 0) {
        if (!withCounter) p.put(NEO.FM4, 0, { note: 'OFF' });
        p.put(NEO.B, 0, { fx: [[0x08, 0xff]] });
      }
      order.push(p);
      if (pi === 3 && !withCounter) {
        // Answer B goes between the two hook passes.
        const bChords = [C.Dm, C.Bb, C.F, C.C, C.Dm, C.Bb, C.Gm, C.C7];
        for (const bi of [0, 3]) { // answer B cut to its first and last pattern (song length ~41 s)
          const q = s.pattern();
          for (let b = 0; b < 2; b++) {
            const bar = bi * 2 + b, o = b * 16, ch = bChords[bar];
            bass(q, o, ch, false, bar === 7);
            drums(q, o, { fill: bar === 7, push: true });
            // Echo stabs on every bar of B: the ext-FM showcase.
            stabs(q, o, ch, bar % 2 ? [2, 6, 10, 14] : [6, 14], true);
            if (bar === 7) run(q, o); else arps(q, o, ch);
            lead(q, o, ansB[bar]);
            if (bar === 3) bellAnswer(q, o);
            if (bar === 1 || bar === 5) {
              q.put(NEO.FM4, o + 14, { note: 'F-5', ins: BELL, vol: 79, fx: [[0x08, 0xf0]] });
              q.put(NEO.FM4, o + 15, { note: 'A-5', ins: BELL, vol: 79, fx: [[0x08, 0x0f]] });
            }
          }
          if (bi === 0) q.put(NEO.FM4, 0, { fx: [[0x08, 0xff]] });
          order.push(q);
        }
      }
    }
  }

  // Seam: the second hook pass ends on the snare fill; arps stop on the jump row, then back to hook A.
  const last = order[order.length - 1];
  last.put(NEO.SSG1, 31, { note: 'OFF' });
  last.put(NEO.FM4, 31, { note: 'OFF' });
  last.put(NEO.FM1, 31, { fx: [[0x0b, 1]] });

  for (const p of order) s.order.push(s.indexOf(p));
  return s;
}
