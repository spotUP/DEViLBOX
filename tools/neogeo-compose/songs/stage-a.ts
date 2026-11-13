/**
 * stage-a.fur (BossGame): the main stage theme. C major, mixolydian B section. Speed 6 at 58.3 Hz (146 BPM),
 * 32-row patterns (two bars each).
 *
 *   order 0     pickup: half a bar (0D00 on row 7), G A B in thirds over a snare roll
 *   order 1-4   A: Peter's motif (bars 1-2) and its answer (bars 3-4), twice. The two chips trade the two
 *               phrases as a round: while the lead plays one, AY1 B plays the other, in thirds and sixths.
 *   order 5-8   B: the lead rests on three stabs a bar; a funk bass riff climbs F, G, Ab, Bb (twice) under
 *               fast major arpeggio chords.
 *   order 9     the motif once more
 *   order 10    break: tresillo kicks and a G pedal, then a snare roll, a scale run and the pickup; 0B01.
 *
 * Bytes (BossGame's compiler shares identical channel bodies, also across channels): the pickup names every
 * channel's instrument, so the loop bodies carry no instrument except the drum kit and AY1 B's chord. AY1 A
 * plays the lead's bytes through a 12-tick delayed-volume echo; AY1 B plays the other phrase's bytes. The last
 * note of every channel before a repeated body has the same length each time (the compiler's short note op
 * depends on the note before), so keep the pickup, the phrase ends and the break ends as they are.
 * Envelope only as a 3-tick thump (AY1 C): envelope mode ignores volume and plays at level 15.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import type { NeoGeoPattern } from '@/lib/export/neogeo/neoGeoCompose';

const TONE = 1, NOISE = 2, ENV = 4;
const AUTO_ENV_NUM = 7, AUTO_ENV_DEN = 8; // Furnace ex3 / alg macros: envelope period follows the note
const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
/** Note name of a semitone number, C-0 = 0. */
export const nn = (semi: number): string => `${NAMES[semi % 12]}${Math.floor(semi / 12)}`;
/** [row, note, instrument?] */
export type Line = Array<[number, string, number?]>;

/** Peter's motif (C D E | G ^E | D B C) and its answer, a third or a sixth away from it note for note. */
export const MOTIF: Line = [[0, 'C-5'], [3, 'D-5'], [6, 'E-5'], [8, 'G-4'], [11, 'E-5'], [16, 'D-5'], [19, 'B-4'], [22, 'C-5']];
export const ANSWER: Line = [[0, 'E-5'], [3, 'F-5'], [6, 'G-5'], [8, 'E-5'], [11, 'C-6'], [16, 'B-5'], [19, 'D-6'], [22, 'C-6'], [25, 'G-5'], [28, 'E-5'], [30, 'D-5']];
/** Octave bounce in 8ths: C | G, C at the motif's early landing, B leading back. */
export const BOUNCE: Line = ['C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'G-1', 'G-2', 'G-1', 'C-2', 'C-3', 'C-2', 'G-1', 'B-1']
  .map((note, i) => [i * 2, note]);
export const THUMP: Line = [[0, 'C-2'], [16, 'G-1'], [22, 'C-2']];
export const GROOVE = 'K.h.S.h.KKh.S.h.K.h.S.h.K.hKS.hh';

/** The shared instruments and cell writers of the stage and title tunes. `lean` (title, 650 bytes): shorter echo, AY1 B plays the bass instrument. */
export function kit(s: ScrambleSongBuilder, lean = false) {
  const ins = (name: string, macros: Array<[number, number[], number?]>) =>
    s.addInstrument(name, ayInstrument(macros.map(([code, data, loop]) => ayMacro(code, data, loop))));
  // Core (AY2)
  const lead = ins('Lead', [[AY_MACRO.VOL, [15, 15, 14, 14, 13, 13, 12, 12, 11, 10, 9, 8], 11], [AY_MACRO.MIXER, [TONE]]]);
  const bounce = ins('Bounce bass', [[AY_MACRO.VOL, [13, 13, 12, 12, 11], 4], [AY_MACRO.MIXER, [TONE]]]);
  const kick = ins('Kick', [[AY_MACRO.VOL, [12, 12, 11, 10, 8, 6, 3, 0]], [AY_MACRO.ARP, [24, 19, 12, 7, 3, 0]], [AY_MACRO.NOISE, [10]], [AY_MACRO.MIXER, [TONE | NOISE, TONE]]]);
  const snare = ins('Snare', [[AY_MACRO.VOL, [12, 11, 10, 8, 6, 4, 2, 0]], [AY_MACRO.NOISE, [16, 20, 22]], [AY_MACRO.MIXER, [TONE | NOISE, NOISE]]]);
  const hat = ins('Hat', [[AY_MACRO.VOL, [11, 6, 0]], [AY_MACRO.NOISE, [30]], [AY_MACRO.MIXER, [NOISE]]]);
  // Layers (AY1)
  // Echo: the lead's bytes 12 ticks late (lean: 6 ticks, shorter tail).
  const echo = ins('Echo', [[AY_MACRO.VOL, lean ? [0, 0, 0, 0, 0, 0, 9, 7, 5, 3, 1, 0] : [...new Array<number>(12).fill(0), 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]], [AY_MACRO.MIXER, [TONE]]]);
  const twin = lean ? bounce : ins('Twin lead', [[AY_MACRO.VOL, [12, 12, 11, 11, 10], 4], [AY_MACRO.MIXER, [TONE]]]);
  const chord = ins('Major chord', [[AY_MACRO.VOL, [11, 11, 10, 10, 9, 9, 8], 6], [AY_MACRO.ARP, [0, 4, 7], 0], [AY_MACRO.MIXER, [TONE]]]);
  // 3 ticks of sawtooth envelope at the note's pitch, then a square tail.
  const thump = ins('Envelope thump', [[AY_MACRO.VOL, [12, 12, 12, 11, 11, 10, 10, 9, 9, 8], 9], [AY_MACRO.MIXER, [TONE | ENV, TONE | ENV, TONE | ENV, TONE]],
    [AY_MACRO.ENV_SHAPE, [8]], [AUTO_ENV_NUM, [1]], [AUTO_ENV_DEN, [1]]]);

  const line = (p: NeoGeoPattern, ch: number, notes: Line, first?: number) =>
    notes.forEach(([row, note, i], k) => {
      const use = i ?? (k === 0 ? first : undefined);
      p.put(ch, row, use === undefined ? { note } : { note, ins: use });
    });
  /** Drum channel juggling: K kick, S snare, h hat, '.' nothing. */
  const drums = (p: NeoGeoPattern, rows: string) => [...rows].forEach((d, row) => {
    if (d === 'K') p.put(AY.DRUMS, row, { note: 'C-2', ins: kick });
    if (d === 'S') p.put(AY.DRUMS, row, { note: 'G-3', ins: snare });
    if (d === 'h') p.put(AY.DRUMS, row, { note: 'C-6', ins: hat });
  });
  /** Effect on a cell without touching its note (0B, 0D). */
  const fx = (p: NeoGeoPattern, ch: number, row: number, effTyp: number, eff: number) => {
    const rows = s.patterns[s.indexOf(p)].channels[ch].rows;
    rows[row] = { ...rows[row], effTyp, eff };
  };
  /** One pattern: lead (AY1 A echoes it), AY1 B, bass, AY1 C, drums. */
  const bar = (leadLine: Line, twinLine: Line, bass: Line, sub: Line, drm: string): NeoGeoPattern => {
    const p = s.pattern();
    line(p, AY.LEAD, leadLine);
    line(p, AY.AY1_A, leadLine);
    line(p, AY.AY1_B, twinLine);
    line(p, AY.BASS, bass);
    line(p, AY.AY1_C, sub);
    drums(p, drm);
    return p;
  };
  /** B section: one bar per root (semitone number of the bass root in octave 2). */
  const half = (root: number, at: number) => ({
    stabs: [[at + 4, nn(root + 40)], [at + 7, nn(root + 43)], [at + 10, nn(root + 40)], [at + 13, 'OFF']] as Line,
    riff: ([[0, 0], [3, 12], [4, 0], [6, 7], [8, 0], [11, 12], [12, 10], [14, 12]] as const).map(([row, d]) => [at + row, nn(root + d)]) as Line,
    pad: [[at, nn(root + 24), chord]] as Line,
    sub: [[at, nn(root - 12)]] as Line,
  });
  const climb = (r1: number, r2: number, drm = GROOVE): NeoGeoPattern => {
    const a = half(r1, 0), b = half(r2, 16);
    // AY1 B ends each pattern on a twin-lead note, so the chord instrument is named again every time (same bytes).
    return bar([...a.stabs, ...b.stabs], [...a.pad, ...b.pad, [28, 'D-5', twin]], [...a.riff, ...b.riff], [...a.sub, ...b.sub], drm);
  };
  return { lead, bounce, echo, twin, chord, thump, line, drums, fx, bar, climb };
}

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder('Stage A', 6, 32, 6);
  const k = kit(s);

  // Pickup: G A B (thirds above on AY1 B), every channel names its instrument here.
  const up: Line = [[2, 'G-4'], [4, 'A-4'], [6, 'B-4']];
  const up3: Line = [[2, 'B-4'], [4, 'C-5'], [6, 'D-5']];
  const i = s.pattern();
  k.line(i, AY.LEAD, up, k.lead);
  k.line(i, AY.AY1_A, up, k.echo);
  k.line(i, AY.AY1_B, up3, k.twin);
  k.line(i, AY.BASS, [[0, 'G-1'], [2, 'G-2'], [4, 'G-1'], [6, 'G-2']], k.bounce);
  k.line(i, AY.AY1_C, [[0, 'G-1']], k.thump);
  k.drums(i, 'K.S.SSSS');
  k.fx(i, AY.DRUMS, 7, 0x0d, 0);

  // A: the round.
  const x = k.bar(MOTIF, ANSWER, BOUNCE, THUMP, GROOVE);
  const y = k.bar(ANSWER, MOTIF, BOUNCE, THUMP, GROOVE);

  // B: the climb.
  const b1 = k.climb(29, 31); // F, G
  const b2 = k.climb(32, 34); // Ab, Bb

  // Break on G: tresillo, then the roll, the mixolydian scale run and the pickup again.
  const run = ['G-1', 'A-1', 'B-1', 'C-2', 'D-2', 'E-2', 'F-2', 'G-2'].map((note, n) => [16 + n * 2, note]) as Line;
  const br = k.bar(up.map(([row, note]) => [row + 24, note]),
    [[0, 'D-5'], ...up3.map(([row, note]) => [row + 24, note] as [number, string])],
    [[0, 'G-1'], [3, 'G-1'], [6, 'G-2'], [8, 'G-1'], [11, 'G-1'], [14, 'G-2'], ...run],
    [[0, 'G-1'], [16, 'G-1'], [24, 'G-1']],
    'K..K..K.K..K..K.K.K.KKKKSSSSSSSS');
  k.fx(br, AY.DRUMS, 31, 0x0b, 1);

  s.order.push(...[i, x, y, x, y, b1, b2, b1, b2, x, br].map((p) => s.indexOf(p)));
  return s;
}
