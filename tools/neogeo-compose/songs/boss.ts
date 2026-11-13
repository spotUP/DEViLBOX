/**
 * boss.fur (BossGame): the boss fight. C minor with phrygian (Db) and harmonic minor (B natural) colour.
 * Speed 6 at 58.3 Hz (146 BPM); the game drops to speed 5 at 50% boss health, so every rhythm is on rows
 * and every macro is a one-shot shorter than a row or a tick-based echo. 16-row patterns (one bar each).
 *
 *   order 0-1   entry: twin hardware-envelope rumble sliding up (25xx), heartbeat kick doubling to 16ths
 *   order 2-9   A, A': Peter's motif in minor on the buzz bass at half speed (C D Eb | G ^Eb | D B C)
 *   order 10-13 B: the riff climbs a semitone every bar (C, Db, D, Eb)
 *   order 14-15 C: G7b9 climb, heartbeat break, 0B02 back to A
 *
 * Bytes: BossGame's compiler shares identical channel bodies, also across channels. AY1 A, AY1 B and AY1 C
 * never name an instrument inside the loop, so they play the lead's and the bass's bytes through their own
 * instruments: a 12-tick delayed-volume echo (A), a static +7 arpeggio for power chords (B) and a square
 * body an octave above the bass, or in A a detuned unison that beats against it (C). The loop therefore costs calls only on AY1, and the core 3 sound complete alone.
 * Keep it that way: an `ins` inside a loop pattern on LEAD or BASS breaks the sharing (AY1 C has two, see the end).
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import type { NeoGeoPattern } from '@/lib/export/neogeo/neoGeoCompose';

const TONE = 1, NOISE = 2, ENV = 4;
const AUTO_ENV_NUM = 7, AUTO_ENV_DEN = 8; // Furnace ex3 / alg macros: envelope period follows the note
const BEAT_DETUNE = 0x94; // E5xx on AY1 C: 20/128 semitone sharp, one swell a bar at C-2 (0.6 Hz); 0x80 is in tune
type Line = Array<[number, string]>;

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder('Boss', 6, 16, 6);
  const ins = (name: string, macros: Array<[number, number[], number?]>) =>
    s.addInstrument(name, ayInstrument(macros.map(([code, data, loop]) => ayMacro(code, data, loop))));

  // Core (AY2)
  const stab = ins('Stab', [[AY_MACRO.VOL, [15, 14, 13, 12, 10, 8, 6, 4, 2, 0]], [AY_MACRO.ARP, [12, 12, 0]], [AY_MACRO.MIXER, [TONE]]]);
  // Sawtooth envelope alone for 2 ticks as the buzz attack, then a plain square at 13. Held tone + envelope on one channel phased
  // against each other and swung the bass level by 19 dB (measured solo); the envelope also always plays at 15.
  const buzz = ins('Buzz bass', [[AY_MACRO.VOL, [13]], [AY_MACRO.MIXER, [ENV, ENV, TONE]], [AY_MACRO.ENV_SHAPE, [8]], [AUTO_ENV_NUM, [1]], [AUTO_ENV_DEN, [1]]]);
  const rumble = ins('Rumble', [[AY_MACRO.VOL, [13]], [AY_MACRO.MIXER, [ENV]], [AY_MACRO.ENV_SHAPE, [8]]]);
  const kick = ins('Kick', [[AY_MACRO.VOL, [12, 12, 11, 10, 8, 6, 3, 0]], [AY_MACRO.ARP, [24, 19, 12, 7, 3, 0]], [AY_MACRO.NOISE, [10]], [AY_MACRO.MIXER, [TONE | NOISE, TONE]]]);
  const snare = ins('Snare', [[AY_MACRO.VOL, [12, 11, 10, 8, 6, 4, 2, 0]], [AY_MACRO.NOISE, [16, 20, 22]], [AY_MACRO.MIXER, [TONE | NOISE, NOISE]]]);
  const chug = ins('Chug', [[AY_MACRO.VOL, [11, 7, 3, 0]], [AY_MACRO.NOISE, [27]], [AY_MACRO.MIXER, [TONE | NOISE, TONE]]]);
  // Layers (AY1): same bytes as the core, other instruments. Doubling voices sit 2-5 steps under the voice they double.
  const echo = ins('Echo', [[AY_MACRO.VOL, [...new Array<number>(12).fill(0), 8, 6, 4, 2, 0]], [AY_MACRO.MIXER, [TONE]]]);
  const fifth = ins('Fifth', [[AY_MACRO.VOL, [10, 9, 8, 7, 6, 4, 3, 1, 0]], [AY_MACRO.ARP, [7]], [AY_MACRO.MIXER, [TONE]]]);
  // An octave above the bass: two squares at the same pitch on two chips add or cancel by their chance phase, a different level every note.
  const body = ins('Bass body', [[AY_MACRO.VOL, [10, 10, 9]], [AY_MACRO.ARP, [12]], [AY_MACRO.MIXER, [TONE]]]);

  // The two-chip bass effect in the A section: the same note on the other chip, a fixed E5xx detune and 4 volume steps under
  // the bass, so the pair swells and dips at a steady rate and can never cancel. Unison at equal level cancelled completely.
  const beat = ins('Bass beat', [[AY_MACRO.VOL, [9]], [AY_MACRO.MIXER, [TONE]]]);

  const LEADS = [AY.LEAD, AY.AY1_A, AY.AY1_B];
  const BASSES = [AY.BASS, AY.AY1_C];
  const line = (p: NeoGeoPattern, chans: number[], notes: Line) =>
    chans.forEach((ch) => notes.forEach(([row, note]) => p.put(ch, row, { note })));
  /** Drum channel juggling: K kick, S snare, c chug, C chug an octave up, '.' nothing. */
  const drums = (p: NeoGeoPattern, rows: string) => [...rows].forEach((d, row) => {
    if (d === 'K') p.put(AY.DRUMS, row, { note: 'C-2', ins: kick });
    if (d === 'S') p.put(AY.DRUMS, row, { note: 'G-3', ins: snare });
    if (d === 'c' || d === 'C') p.put(AY.DRUMS, row, { note: d === 'c' ? 'C-3' : 'C-4', ins: chug });
  });
  const GROOVE = 'KcCcScCcKcCcScCc', HEART = 'K.K.....K.K.SSSS';
  const bar = (lead: Line, bass: Line, drm: string): number => {
    const p = s.pattern();
    line(p, LEADS, lead);
    line(p, BASSES, bass);
    drums(p, drm);
    return s.indexOf(p);
  };

  // Entry: envelope period 0x18B / 0x193 (17.7 / 17.3 Hz) slides down 1.5 a tick into the G-1 pickup; the two chips beat faster as they rise.
  const i1 = s.pattern();
  i1.put(AY.BASS, 0, { note: 'C-2', ins: rumble, fx: [[0x23, 0x8b], [0x24, 0x01], [0x25, 0x0c]] });
  i1.put(AY.AY1_C, 0, { note: 'C-2', ins: rumble, fx: [[0x23, 0x93], [0x24, 0x01], [0x25, 0x0c]] });
  drums(i1, HEART.slice(0, 12) + '....');
  const i2 = s.pattern();
  drums(i2, 'K.K.K.K.KKKKSSSS');
  const pickup: Line = [[12, 'G-1'], [14, 'B-1']];
  ([[AY.BASS, buzz], [AY.AY1_C, beat]] as const).forEach(([ch, i]) => {
    i2.put(ch, 12, { note: 'G-1', ins: i, fx: ch === AY.AY1_C ? [[0x25, 0x00], [0xe5, BEAT_DETUNE]] : [[0x25, 0x00]] }); // slide off before the auto envelope takes the period
    i2.put(ch, 14, { note: 'B-1' });
  });
  ([[AY.LEAD, stab], [AY.AY1_A, echo], [AY.AY1_B, fifth]] as const).forEach(([ch, i]) =>
    pickup.forEach(([row, note]) => i2.put(ch, row, { note: note.replace('1', '4'), ins: i })));

  // A: the motif on the bass at half speed; stabs fall between its notes (bass 0 6 12, stabs 3 9 14).
  const a1 = bar([[3, 'C-5'], [9, 'C-5'], [14, 'C#5']], [[0, 'C-2'], [6, 'D-2'], [12, 'D#2']], GROOVE);
  const a2 = bar([[3, 'C-5'], [9, 'D#5'], [14, 'C#5']], [[0, 'G-1'], [6, 'D#2']], GROOVE);
  const a3 = bar([[3, 'G-4'], [9, 'G-4'], [14, 'C-5']], [[0, 'D-2'], [6, 'B-1'], [12, 'C-2']], GROOVE);
  const tail: Line = [[0, 'C-2'], [8, 'G-1'], [12, 'A#1'], [14, 'B-1']];
  const a4 = bar([[6, 'G-5'], [7, 'G#5'], [8, 'G-5'], [10, 'D#5'], [12, 'C#5'], [14, 'C-5']], tail, GROOVE);
  const a8 = bar([[6, 'G-5'], [7, 'G#5'], [8, 'G-5'], [10, 'A#5'], [12, 'C-6'], [14, 'C#6']], tail, GROOVE);

  // B: one riff, a semitone higher every bar.
  const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-'];
  const rise = [0, 1, 2, 3].map((k) => {
    const r = NAMES[k], lift = NAMES[k + 3], next = NAMES[k + 1];
    const lead: Line = k < 3 ? [[3, `${r}5`], [9, `${r}5`], [14, `${lift}5`]] : [[3, `${r}5`], [9, `${r}5`], [12, 'F-5'], [14, 'F#5']];
    const bass: Line = [[0, `${r}2`], [2, `${r}2`], [4, `${r}3`], [6, `${r}2`], [8, `${r}2`], [10, `${r}3`], [12, `${r}2`], [14, `${next}2`]];
    return bar(lead, bass, GROOVE);
  });

  // C: G7b9 climbing under the phrygian Ab (G B D F Ab), then the break: heartbeat and the motif's last notes D B (C is bar 1).
  const c3 = bar([[3, 'G#4'], [9, 'G#4'], [12, 'B-4'], [14, 'D-5']],
    [[0, 'G-1'], [2, 'G-1'], [4, 'B-1'], [6, 'B-1'], [8, 'D-2'], [10, 'D-2'], [12, 'F-2'], [14, 'G#2']], GROOVE);
  const c4 = bar([[6, 'D-5'], [9, 'B-4']], [[0, 'G-1'], [2, 'OFF']], HEART);
  s.patterns[c4].channels[AY.DRUMS].rows[15] = { ...s.patterns[c4].channels[AY.DRUMS].rows[15], effTyp: 0x0b, eff: 2 };

  // AY1 C changes instrument twice a loop: the beating unison for A (orders 2-9), the plain octave for B and C. These two cells cost
  // AY1 C its shared body in those two patterns; BASS itself still names no instrument.
  const ay1cIns = (pat: number, i: number, detune: number) => {
    const rows = s.patterns[pat].channels[AY.AY1_C].rows;
    if (rows[0].effTyp) throw new Error('boss: AY1 C row 0 already has an effect');
    rows[0] = { ...rows[0], instrument: i, effTyp: 0xe5, eff: detune };
  };
  ay1cIns(a1, beat, BEAT_DETUNE);
  ay1cIns(rise[0], body, 0x80);

  s.order.push(s.indexOf(i1), s.indexOf(i2), a1, a2, a3, a4, a1, a2, a3, a8, ...rise, c3, c4);
  return s;
}
