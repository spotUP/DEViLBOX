/**
 * "Ironwing" - stage 1 theme for an original side-scrolling shoot-'em-up (Neo Geo MVS, YM2610 extended FM).
 * E minor, speed 6 at 60 Hz (150 BPM, 16 rows per bar), 32-row patterns (2 bars), 22 orders = 70.4 s per loop.
 * Orders: 0-1 intro, 2-5 A (hook), 6-9 A' (hook + counter-melody), 10-13 B (lift), 14-15 breakdown,
 * 16-17 build, 18-21 A'' (hook in thirds + counter), then 0B02 back to A.
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

/** FM patch from chip-named operators; stored in register-slot order OP1, OP3, OP2, OP4. DT 3 = no detune. */
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
const ssg = (macros: FurnaceMacro[]): FurnaceConfig =>
  ({ ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_SSG, operators: [], macros, opMacros: [] }) as FurnaceConfig;

export default function compareOpus(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Ironwing - Stage 1', 6, 32);

  // ---- Instruments -------------------------------------------------------------------------
  // Lead (alg 4): pair 1 = OP1 (feedback 6, ratio 1:1) -> OP2 = saw-like; pair 2 = OP3 at mult 2 -> OP4 = hollow,
  // square-like (odd harmonics). Carriers detuned -1/+1 for a chorus. 12xx on OP1 = brightness accent per note.
  const LEAD_TL = 28;
  const LEAD = s.addInstrument('Ironwing lead', fm(4, 6, {
    op1: { mult: 1, tl: LEAD_TL, ar: 31, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 2 },
    op2: { mult: 1, tl: 8, ar: 31, dr: 3, d2r: 1, sl: 1, rr: 6, dt: 2, rs: 1 },
    op3: { mult: 2, tl: 38, ar: 28, dr: 10, d2r: 3, sl: 6, rr: 6, dt: 4 },
    op4: { mult: 1, tl: 14, ar: 31, dr: 3, d2r: 1, sl: 1, rr: 6, dt: 4, rs: 1 },
  }));
  // Bass (alg 4): OP1 feedback saw with a fast decay = pluck that settles to a round tone; OP3 at mult 3 decays even
  // faster into OP4 = a metallic click on the attack. 12xx opens OP1 on the octave notes so they bite.
  const BASS_TL = 24;
  const BASS = s.addInstrument('Pick bass', fm(4, 5, {
    op1: { mult: 1, tl: BASS_TL, ar: 31, dr: 12, d2r: 3, sl: 6, rr: 9, dt: 3 },
    op2: { mult: 1, tl: 5, ar: 31, dr: 4, d2r: 2, sl: 2, rr: 10, dt: 3 },
    op3: { mult: 3, tl: 36, ar: 31, dr: 20, d2r: 8, sl: 15, rr: 12, dt: 4 },
    op4: { mult: 1, tl: 10, ar: 31, dr: 6, d2r: 3, sl: 3, rr: 10, dt: 2 },
  }));
  // FM 2 in 4-operator mode (alg 7, all carriers): OP1 with feedback is the lead's echo / harmony voice,
  // OP2-OP4 are octave-up sine stabs with a short decay, detuned apart.
  const EXT = s.addInstrument('Echo + stabs (FM 2 ops)', fm(7, 5, {
    op1: { mult: 1, tl: 20, ar: 31, dr: 6, d2r: 2, sl: 3, rr: 7, dt: 3 },
    op2: { mult: 2, tl: 18, ar: 31, dr: 12, d2r: 6, sl: 6, rr: 9, dt: 2 },
    op3: { mult: 2, tl: 18, ar: 31, dr: 12, d2r: 6, sl: 6, rr: 9, dt: 4 },
    op4: { mult: 1, tl: 20, ar: 31, dr: 10, d2r: 5, sl: 5, rr: 9, dt: 3 },
  }));
  // Counter reed (alg 4): mult 3 modulator = reedy odd partials, softer attack than the lead so the lines separate.
  const REED = s.addInstrument('Counter reed', fm(4, 2, {
    op1: { mult: 3, tl: 46, ar: 22, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 14, ar: 24, dr: 4, d2r: 1, sl: 2, rr: 6, dt: 4 },
    op3: { mult: 1, tl: 48, ar: 20, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 2 },
    op4: { mult: 1, tl: 16, ar: 24, dr: 4, d2r: 1, sl: 2, rr: 6, dt: 2 },
  }));
  // Glass bell (alg 4): mult 7 and mult 4 modulators that die fast over mult 1 / mult 2 carriers with long rings.
  const BELL = s.addInstrument('Glass bell', fm(4, 0, {
    op1: { mult: 7, tl: 40, ar: 31, dr: 10, d2r: 4, sl: 15, rr: 5, dt: 3 },
    op2: { mult: 1, tl: 14, ar: 31, dr: 5, d2r: 3, sl: 6, rr: 5, dt: 4 },
    op3: { mult: 4, tl: 42, ar: 31, dr: 9, d2r: 4, sl: 12, rr: 5, dt: 2 },
    op4: { mult: 2, tl: 22, ar: 31, dr: 6, d2r: 3, sl: 6, rr: 5, dt: 3 },
  }));
  // Breakdown pad (alg 4): slow carrier attack; SSG-EG triangle (8+6) on OP3 makes the tone breathe.
  const PAD = s.addInstrument('Breathing pad', fm(4, 1, {
    op1: { mult: 1, tl: 34, ar: 14, dr: 4, d2r: 0, sl: 3, rr: 5, dt: 2 },
    op2: { mult: 1, tl: 12, ar: 12, dr: 2, d2r: 0, sl: 1, rr: 5, dt: 4 },
    op3: { mult: 2, tl: 38, ar: 18, dr: 10, d2r: 0, sl: 7, rr: 5, dt: 3, ssg: 8 + 6 },
    op4: { mult: 1, tl: 14, ar: 12, dr: 2, d2r: 0, sl: 1, rr: 5, dt: 2 },
  }));

  // SSG. Both macros of an arp loop at step 8 (furtool keeps one loop point per instrument).
  const arpMacros = (third: number) => {
    const cycle = [0, 0, third, third, 7, 7, 12, 12];
    return [
      seqMacro(0, [11, 10, 9, 8, 7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 6, 6], 8),
      seqMacro(1, [...cycle, ...cycle], 8),
    ];
  };
  const ARP_MIN = s.addInstrument('Arp minor', ssg(arpMacros(3)));
  const ARP_MAJ = s.addInstrument('Arp major', ssg(arpMacros(4)));
  const RUN = s.addInstrument('Run pluck', ssg([seqMacro(0, [13, 11, 10, 9, 8, 8, 7, 6])]));
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [13, 9, 6, 3, 1, 0]), seqMacro(3, [2])]));
  const OHAT = s.addInstrument('Hat open', ssg([seqMacro(0, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]), seqMacro(3, [2])]));
  const CRASH = s.addInstrument('Noise crash', ssg([
    seqMacro(0, [15, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]),
    seqMacro(3, [2]),
  ]));
  // Snare: three ticks of tone + noise with a falling pitch blip (arp 9 -> 4 -> 0) for the body, then noise.
  const SNARE = s.addInstrument('Snare', ssg([
    seqMacro(0, [15, 14, 13, 11, 9, 8, 6, 5, 4, 3, 2, 1, 0]),
    seqMacro(1, [9, 4, 0]),
    seqMacro(3, [3, 3, 3, 2]),
  ]));
  // Kick on ADPCM-B: 0.2 s of a TR-style kick, 18.5 kHz, 25 ms fade.
  const wav = readWavPcm16(readFileSync(`${repoRoot}/public/data/samples/packs/drumnibus/kicks/BD_Romkick1.wav`));
  const KICK = s.addInstrument('Kick', {
    ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_ADPCM_B, operators: [], macros: [], opMacros: [],
    userSample: { name: 'ironwing kick', data: resample(trimWithFade(wav.data, wav.rate, 0.2, 25), wav.rate, 18500, 0.9), rate: 18500 },
  } as unknown as FurnaceConfig);

  // ---- Harmony -----------------------------------------------------------------------------
  type Chord = { root: string; stab: [string, string, string]; arp: number; arpNote: string };
  const C: Record<string, Chord> = {
    Em: { root: 'E-2', stab: ['G-4', 'B-4', 'E-5'], arp: ARP_MIN, arpNote: 'E-4' },
    C: { root: 'C-3', stab: ['G-4', 'C-5', 'E-5'], arp: ARP_MAJ, arpNote: 'C-4' },
    D: { root: 'D-3', stab: ['F#4', 'A-4', 'D-5'], arp: ARP_MAJ, arpNote: 'D-4' },
    G: { root: 'G-2', stab: ['G-4', 'B-4', 'D-5'], arp: ARP_MAJ, arpNote: 'G-4' },
    Am: { root: 'A-2', stab: ['A-4', 'C-5', 'E-5'], arp: ARP_MIN, arpNote: 'A-3' },
    B: { root: 'B-2', stab: ['F#4', 'B-4', 'D#5'], arp: ARP_MAJ, arpNote: 'B-3' },
  };
  const n = (x: string | number) => (typeof x === 'number' ? x : noteNumber(x));
  // E natural minor pitch classes (note numbers are octave*12 + pc + 1).
  const SCALE = [4, 6, 7, 9, 11, 0, 2];
  const pc = (x: number) => (x - 1) % 12;
  /** Scale step under the next root (a passing note into the next chord). */
  const approach = (next: string) => {
    const r = n(next);
    return SCALE.includes(pc(r - 2)) ? r - 2 : r - 1;
  };
  /** Diatonic third below in E minor; D# (the B-chord leading tone) is treated as D, giving B under it. */
  const thirdBelow = (x: number) => {
    const p = pc(x);
    const idx = SCALE.indexOf(p === 3 ? 2 : p);
    if (idx < 0) return x - 3;
    return x - ((p - SCALE[(idx + 5) % 7] + 12) % 12);
  };

  // ---- Parts (bar = 16 rows; `o` = the bar's row offset in its pattern) ---------------------
  // Bass: a galloping 16th drive (root / octave / ghost root), fifth on 12, a passing note on 14 into the next bar.
  function bass(p: NeoGeoPattern, o: number, ch: Chord, next: Chord, mode: 'drive' | 'half') {
    const r = n(ch.root);
    const hits: Array<[number, number, number, boolean]> = mode === 'half'
      ? [[0, r, 127, false], [6, r + 12, 95, true], [8, r, 111, false], [14, r + 7, 95, false]]
      : [[0, r, 127, false], [2, r + 12, 111, true], [3, r, 95, false], [4, r, 111, false], [6, r + 12, 111, true],
        [8, r, 127, false], [10, r + 12, 111, true], [11, r, 95, false], [12, r + 7, 111, false], [14, approach(next.root), 111, false]];
    for (const [row, note, vol, bite] of hits) p.put(NEO.FM3, o + row, { note, ins: BASS, vol, fx: [[0x12, bite ? BASS_TL - 8 : BASS_TL]] });
  }

  type DrumOpts = { hats?: 'eighths' | 'sixteenths' | 'none'; fill?: boolean; roll?: boolean; push?: boolean; crash?: boolean; half?: boolean };
  function drums(p: NeoGeoPattern, o: number, d: DrumOpts = {}) {
    const hats = d.hats ?? 'eighths';
    if (d.half) {
      p.put(NEO.B, o, { note: 'C-4', ins: KICK });
      p.put(NEO.B, o + 10, { note: 'C-4', ins: KICK });
      p.put(NEO.SSG3, o + 8, { note: 'A-4', ins: SNARE });
    } else if (d.roll) {
      // Build-up: four-on-the-floor kick under a 16th snare roll that climbs in level and pitch (even SSG volumes map exactly).
      for (const r of [0, 4, 8, 12]) p.put(NEO.B, o + r, { note: 'C-4', ins: KICK });
      for (let r = 0; r < 16; r++) p.put(NEO.SSG3, o + r, { note: noteNumber('F-4') + (r >> 1), ins: SNARE, vol: [6, 8, 10, 14][r >> 2] });
    } else {
      for (const r of [0, 8, 10]) p.put(NEO.B, o + r, { note: 'C-4', ins: KICK });
      if (d.push) p.put(NEO.B, o + 14, { note: 'C-4', ins: KICK });
      p.put(NEO.SSG3, o + 4, { note: 'A-4', ins: SNARE });
      if (d.fill) {
        p.put(NEO.SSG3, o + 10, { note: 'G-4', ins: SNARE, vol: 8 });
        p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
        p.put(NEO.SSG3, o + 13, { note: 'B-4', ins: SNARE, vol: 10 });
        p.put(NEO.SSG3, o + 14, { note: 'C-5', ins: SNARE, vol: 12 });
        p.put(NEO.SSG3, o + 15, { note: 'D-5', ins: SNARE });
        p.put(NEO.B, o + 15, { note: 'C-4', ins: KICK, fx: [[0xed, 3]] });
      } else {
        p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
      }
    }
    if (hats !== 'none') {
      for (let r = 0; r < 16; r += hats === 'sixteenths' ? 1 : 2) {
        if (d.fill && r >= 12) break;
        const open = r === 14 || (hats === 'eighths' && r === 6);
        p.put(NEO.SSG2, o + r, { note: 'C-6', ins: open ? OHAT : HAT, vol: hats === 'sixteenths' && r % 2 ? 8 : undefined });
      }
    }
    if (d.crash) p.put(NEO.SSG2, o, { note: 'C-5', ins: CRASH });
  }

  // Chord stabs on FM 2 OP2-OP4: top voice strummed one tick late; `echo` repeats each stab 2 rows later, quieter.
  function stabs(p: NeoGeoPattern, o: number, ch: Chord, rows: number[], echo = false, vol = 127) {
    for (const r of rows) {
      ch.stab.forEach((x, i) => p.put(NEO.OP2 + i, o + r, { note: x, ins: EXT, vol, fx: i === 2 ? [[0xed, 1]] : [] }));
      if (echo && r + 2 < 16) ch.stab.forEach((x, i) => p.put(NEO.OP2 + i, o + r + 2, { note: x, ins: EXT, vol: 103, fx: [[0xed, i]] }));
    }
  }
  const arps = (p: NeoGeoPattern, o: number, ch: Chord, vol = 12) => {
    p.put(NEO.SSG1, o, { note: ch.arpNote, ins: ch.arp, vol });
    p.put(NEO.SSG1, o + 8, { note: ch.arpNote, ins: ch.arp, vol });
  };

  // Lead: [row, note, accent?, fx?]. 12xx on every note (accent = brighter). OP1 doubles it: 'echo' = 2 rows late and
  // quieter, 'third' = a diatonic third below in time, 'none' = off.
  type Line = Array<[number, string, boolean?, Array<[number, number]>?]>;
  function lead(p: NeoGeoPattern, o: number, line: Line, dbl: 'echo' | 'third' | 'none', vol = 111) {
    for (const [r, x, accent, fx] of line) {
      const extra = x === 'OFF' ? fx ?? [] : [[0x12, accent ? LEAD_TL - 10 : LEAD_TL] as [number, number], ...(fx ?? [])];
      p.put(NEO.FM1, o + r, { note: x, ins: x === 'OFF' ? undefined : LEAD, vol: x === 'OFF' ? undefined : vol, fx: extra });
      if (dbl === 'echo' && x !== 'OFF' && o + r + 2 < 32) p.put(NEO.OP1, o + r + 2, { note: x, ins: EXT, vol: 103, fx: [[0xed, 2]] });
      if (dbl === 'third') p.put(NEO.OP1, o + r, x === 'OFF' ? { note: 'OFF' } : { note: thirdBelow(n(x)), ins: EXT, vol: 111 });
    }
  }
  const melody = (p: NeoGeoPattern, ch: number, ins: number, o: number, line: Line, vol: number) => {
    for (const [r, x, , fx] of line) p.put(ch, o + r, { note: x, ins: x === 'OFF' ? undefined : ins, vol: x === 'OFF' ? undefined : vol, fx: fx ?? [] });
  };

  // ---- Lines ---------------------------------------------------------------------------------
  const vib: [number, number] = [0x04, 0x35];
  const vibOff: [number, number] = [0x04, 0x00];
  // Hook (3+3+2 rhythm: rows 0, 3, 6), climbing a step each half, falling to the leading tone at the end.
  const hook: Line[] = [
    [[0, 'E-5', true], [3, 'G-5'], [6, 'B-5', true], [8, 'A-5'], [10, 'G-5'], [12, 'F#5'], [14, 'G-5']],
    [[0, 'E-5', true], [6, 'C-5'], [8, 'E-5'], [10, 'G-5'], [12, 'C-6', true], [14, 'B-5']],
    [[0, 'A-5', true], [3, 'F#5'], [6, 'D-5'], [8, 'F#5'], [10, 'A-5'], [12, 'D-6', true], [14, 'C-6']],
    [[0, 'B-5', true], [4, 'B-5', false, [vib]], [10, 'A-5', false, [vibOff]], [12, 'G-5'], [14, 'F#5']],
    [[0, 'E-5', true], [3, 'G-5'], [6, 'B-5', true], [8, 'A-5'], [10, 'G-5'], [12, 'F#5'], [14, 'G-5']],
    [[0, 'E-5', true], [6, 'C-5'], [8, 'E-5'], [10, 'G-5'], [12, 'C-6', true], [14, 'E-6', true]],
    [[0, 'C-6', true], [3, 'B-5'], [6, 'A-5', true], [8, 'E-5'], [10, 'A-5'], [12, 'C-6'], [14, 'B-5']],
    [[0, 'B-5', true, [[0x03, 0x00]]], [4, 'B-5', false, [vib]], [8, 'A-5', false, [vibOff]], [10, 'G-5'], [12, 'F#5'], [14, 'D#5']],
  ];
  const hookChords = [C.Em, C.C, C.D, C.Em, C.Em, C.C, C.Am, C.B];
  const counter: Line[] = [
    [[0, 'G-4', false, [[0x08, 0xff]]], [8, 'B-4'], [12, 'A-4']],
    [[0, 'G-4'], [8, 'E-4'], [12, 'G-4']],
    [[0, 'F#4'], [8, 'A-4'], [12, 'D-5']],
    [[0, 'E-5'], [4, 'D-5'], [8, 'B-4'], [12, 'G-4']],
    [[0, 'B-4'], [8, 'G-4'], [12, 'B-4']],
    [[0, 'C-5'], [8, 'G-4'], [12, 'E-5', false, [vib]]],
    [[0, 'E-5', false, [vibOff]], [6, 'C-5'], [8, 'A-4'], [12, 'C-5']],
    [[0, 'D#5', false, [[0x03, 0x20]]], [8, 'F#4', false, [[0x03, 0x00]]], [12, 'A-4'], [14, 'B-4']],
  ];
  // B: the lift. Longer notes, higher, through the relative major side (C D G), ending on a held dominant.
  const lift: Line[] = [
    [[0, 'G-5', true], [6, 'E-5'], [8, 'G-5'], [12, 'C-6', true], [14, 'D-6']],
    [[0, 'A-5', true], [4, 'A-5', false, [vib]], [8, 'F#5', false, [vibOff]], [12, 'A-5'], [14, 'D-6', true]],
    [[0, 'B-5', true], [4, 'D-6'], [6, 'B-5'], [8, 'G-5'], [12, 'B-5'], [14, 'C-6']],
    [[0, 'B-5', true], [4, 'B-5', false, [vib]], [8, 'G-5', false, [vibOff]], [10, 'A-5'], [12, 'B-5'], [14, 'G-5']],
    [[0, 'C-6', true], [3, 'B-5'], [6, 'A-5'], [8, 'E-5'], [12, 'A-5'], [14, 'B-5']],
    [[0, 'C-6', true], [3, 'A-5'], [6, 'F#5'], [8, 'D-5'], [12, 'F#5'], [14, 'A-5', true]],
    [[0, 'B-5', true], [3, 'D#6', true], [6, 'F#6', true], [8, 'D#6'], [10, 'B-5'], [12, 'A-5'], [14, 'F#5']],
    [[0, 'B-5', true, [[0x03, 0x00]]], [4, 'B-5', false, [vib]], [8, 'OFF', false, [vibOff]]],
  ];
  const liftChords = [C.C, C.D, C.G, C.Em, C.Am, C.D, C.B, C.B];
  // Breakdown: the bell sings the hook shape at half speed over a breathing pad.
  const bellLine: Line[] = [
    [[0, 'E-5', false, [[0x08, 0xff]]], [3, 'A-5'], [6, 'C-6'], [8, 'B-5'], [12, 'A-5']],
    [[0, 'G-5'], [6, 'B-5'], [8, 'E-5']],
    [[0, 'E-5'], [3, 'G-5'], [6, 'C-6'], [8, 'B-5'], [12, 'G-5']],
    [[0, 'F#5'], [6, 'D#5'], [8, 'B-4'], [12, 'OFF']],
  ];
  const padNotes = ['C-4', 'B-3', 'C-4', 'B-3'];
  const breakChords = [C.Am, C.Em, C.C, C.B];
  // Build: the lead climbs back in from A3 to the leading tone.
  const buildLine: Line[] = [
    [[0, 'A-4'], [3, 'C-5'], [6, 'E-5'], [8, 'A-5', true], [12, 'E-5']],
    [[0, 'G-5'], [3, 'E-5'], [6, 'B-4'], [8, 'E-5'], [12, 'G-5'], [14, 'B-5', true]],
    [[0, 'C-6', true], [4, 'C-6', false, [vib]], [8, 'G-5', false, [vibOff]], [12, 'E-5'], [14, 'G-5']],
    [[0, 'D#5'], [4, 'F#5'], [8, 'A-5', true], [12, 'B-5', true, [vib]]],
  ];
  // Fast run up E harmonic minor at the end of B (one note per row), handing over to the breakdown.
  const run = (p: NeoGeoPattern, o: number) => {
    ['B-4', 'C-5', 'D#5', 'E-5', 'F#5', 'G-5', 'A-5', 'B-5', 'C-6', 'D#6', 'E-6', 'F#6']
      .forEach((x, i) => p.put(NEO.SSG1, o + 4 + i, { note: x, ins: RUN }));
  };
  // Bell answer in the gap at the end of B bar 4: Em arpeggio, ping-pong panned.
  const bellAnswer = (p: NeoGeoPattern, o: number) => {
    ['E-5', 'G-5', 'B-5', 'E-6', 'G-6', 'E-6', 'B-5', 'G-5']
      .forEach((x, i) => p.put(NEO.FM4, o + 8 + i, { note: x, ins: BELL, vol: i % 2 ? 79 : 95, fx: [[0x08, i % 2 ? 0x0f : 0xf0]] }));
  };

  // ---- Patterns ------------------------------------------------------------------------------
  const order: NeoGeoPattern[] = [];
  const nextOf = (list: Chord[], bar: number, after: Chord) => list[bar + 1] ?? after;

  // Intro (4 bars, Em C D B): bass + arps + drums, stabs join in bar 3, snare fill and a lead pickup in bar 4.
  const introChords = [C.Em, C.C, C.D, C.B];
  for (let pi = 0; pi < 2; pi++) {
    const p = s.pattern();
    for (let b = 0; b < 2; b++) {
      const bar = pi * 2 + b, o = b * 16, ch = introChords[bar];
      bass(p, o, ch, nextOf(introChords, bar, C.Em), 'drive');
      arps(p, o, ch);
      drums(p, o, { hats: bar === 0 ? 'none' : 'eighths', fill: bar === 3, push: bar === 2, crash: bar === 0 });
      if (bar >= 2) stabs(p, o, ch, [6, 14]);
    }
    order.push(p);
  }
  order[1].put(NEO.B, 0, { fx: [[0x08, 0xff]] });
  lead(order[1], 16, [[8, 'F#4'], [10, 'A-4'], [12, 'B-4'], [14, 'D#5', true]], 'echo', 95);

  // A sections. kind: 'A' = hook alone with OP1 echo, "A'" = + counter reed, "A''" = + counter, lead in thirds, 16th hats.
  function hookSection(kind: 'A' | "A'" | "A''") {
    const first = order.length;
    for (let pi = 0; pi < 4; pi++) {
      const p = s.pattern();
      for (let b = 0; b < 2; b++) {
        const bar = pi * 2 + b, o = b * 16, ch = hookChords[bar];
        bass(p, o, ch, nextOf(hookChords, bar, C.Em), 'drive');
        drums(p, o, { hats: kind === "A''" ? 'sixteenths' : 'eighths', fill: bar === 7, push: bar % 2 === 1, crash: bar === 0 });
        stabs(p, o, ch, [6, 14], bar === 3 || bar === 7);
        arps(p, o, ch);
        lead(p, o, hook[bar], kind === "A''" ? 'third' : 'echo');
        if (kind !== 'A') melody(p, NEO.FM4, REED, o, counter[bar], 95);
      }
      if (pi === 0 && kind === 'A') {
        // Loop seam: stop the A'' counter and harmony voices carried over the 0B jump.
        p.put(NEO.FM4, 0, { note: 'OFF' });
        p.put(NEO.OP1, 0, { note: 'OFF' });
      }
      order.push(p);
    }
    return first;
  }
  const aStart = hookSection('A');
  hookSection("A'");

  // B: the lift, echo stabs on every bar, 16th hats in the second half, bells answer bar 4, run at the end.
  for (let pi = 0; pi < 4; pi++) {
    const p = s.pattern();
    for (let b = 0; b < 2; b++) {
      const bar = pi * 2 + b, o = b * 16, ch = liftChords[bar];
      bass(p, o, ch, nextOf(liftChords, bar, C.Am), 'drive');
      drums(p, o, { hats: bar >= 4 ? 'sixteenths' : 'eighths', push: true, fill: bar === 7, crash: bar === 0 || bar === 4 });
      stabs(p, o, ch, bar % 2 ? [2, 6, 10, 14] : [6, 14], true);
      if (bar === 7) run(p, o); else arps(p, o, ch);
      lead(p, o, lift[bar], 'echo');
      if (bar === 3) bellAnswer(p, o);
    }
    if (pi === 0) p.put(NEO.FM4, 0, { note: 'OFF' });
    order.push(p);
  }

  // Breakdown (Am Em C B): half-time bass and drums, no hats, pad on FM 1, bell melody on FM 4, soft held chords.
  for (let pi = 0; pi < 2; pi++) {
    const p = s.pattern();
    for (let b = 0; b < 2; b++) {
      const bar = pi * 2 + b, o = b * 16, ch = breakChords[bar];
      bass(p, o, ch, nextOf(breakChords, bar, C.Am), 'half');
      drums(p, o, { half: true, hats: 'none' });
      arps(p, o, ch, 10);
      p.put(NEO.FM1, o, { note: padNotes[bar], ins: PAD, vol: 62, fx: [[0x0a, 0x30]] });
      p.put(NEO.FM1, o + 12, { fx: [[0x0a, 0x00]] });
      stabs(p, o, ch, [0], false, 111);
      stabs(p, o, ch, [10], false, 103);
      melody(p, NEO.FM4, BELL, o, bellLine[bar], 111);
    }
    if (pi === 0) p.put(NEO.OP1, 0, { note: 'OFF' });
    order.push(p);
  }

  // Build (Am Em C B): the drive comes back, 16th hats, the lead climbs, snare roll in the last bar.
  for (let pi = 0; pi < 2; pi++) {
    const p = s.pattern();
    for (let b = 0; b < 2; b++) {
      const bar = pi * 2 + b, o = b * 16, ch = breakChords[bar];
      bass(p, o, ch, nextOf(breakChords, bar, C.Em), 'drive');
      drums(p, o, bar === 3 ? { roll: true, hats: 'none' } : { hats: 'sixteenths', push: true, crash: bar === 0 });
      stabs(p, o, ch, [6, 14]);
      arps(p, o, ch);
      lead(p, o, buildLine[bar], 'echo', bar >= 2 ? 111 : 95);
    }
    if (pi === 0) p.put(NEO.FM4, 0, { note: 'OFF' });
    order.push(p);
  }

  hookSection("A''");
  order[order.length - 1].put(NEO.FM1, 31, { fx: [[0x0b, aStart]] });

  for (const p of order) s.order.push(s.indexOf(p));
  return s;
}
