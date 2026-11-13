/**
 * final-boss (BossGame, level 100: Peter's own grinning head). C minor, speed 6 at 58.3 Hz (146 BPM),
 * 8 patterns of 2 bars = 16 bars = 26.3 s loop (22.0 s at speed 5). Two AY-3-8910, 6 channels.
 *
 *   order 0  bars 1-2    A   Peter's motif in minor on the lead (C D Eb | G ^Eb | D B C), buzz-pluck 16th pulse
 *   order 1  bars 3-4    A'  answer phrase, the motif again on AY1 B as a canon two bars late
 *   order 2  bars 5-6    B   pulse stops: sustained saw drone C -> Db, heartbeat kick, motif head as stabs
 *   order 3  bars 7-8    B'  drone D -> G, kick doubles, snare roll, the lead bends Eb up to E: minor turns major
 *   order 4  bars 9-10   C   Peter laughing: motif in major, octave-yodel lead, fast vibrato, bouncing octave bass
 *   order 5  bars 11-12  C'  "ha ha ha" falling staccato, run up to C6, comic slide down
 *   order 6  bars 13-14  A   minor again, heavier: kicks hit the motif rhythm, chord stabs between the drums,
 *                            triangle-envelope sub octave on the second chip
 *   order 7  bars 15-16  A'  answer + canon, loops to order 0
 *
 * Channels 1-3 (AY2) carry the whole tune. Channel 4 (AY1 A) is decoration only (the wink sparkle).
 * Everything is tick-timed by macros no longer than 13 ticks and there is no 0F, so speed 5 works.
 * ROM thrift: the motif pattern is one body on the lead and on AY1 B (same instrument), the bass pulse
 * and the plain drum pattern repeat, the B section bass is two long notes per pattern.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '@/lib/export/neogeo/scrambleCompose';
import type { NeoHit } from '@/lib/export/neogeo/neoGeoCompose';

// Furnace AY macro codes the builder does not name: auto envelope (envelope period follows the note) numerator / denominator.
const AUTO_ENV_NUM = 7;
const AUTO_ENV_DEN = 8;
const TONE = 1, NOISE = 2, ENV = 4;
type Hits = Array<[number, NeoHit]>;

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder('final-boss', 6, 32, 6);
  const ins = (name: string, macros: Parameters<typeof ayInstrument>[0]) => s.addInstrument(name, ayInstrument(macros));
  const autoEnv = [ayMacro(AUTO_ENV_NUM, [1]), ayMacro(AUTO_ENV_DEN, [1])];

  const lead = ins('Lead', [ayMacro(AY_MACRO.VOL, [15, 15, 14, 13, 12, 12, 11], 6)]);
  // Octave yodel: the note flips an octave up every 3 ticks (9.7 Hz), Peter's laugh.
  const laugh = ins('Laugh lead', [
    ayMacro(AY_MACRO.VOL, [15, 15, 14, 13, 12, 11, 10], 6), ayMacro(AY_MACRO.ARP, [0, 0, 0, 12, 12, 12], 0)]);
  // Buzz pluck: 3 ticks of tone gated by the saw envelope at the note's own pitch, then a plain tone tail.
  const buzz = ins('Buzz pluck bass', [
    ayMacro(AY_MACRO.MIXER, [TONE | ENV, TONE | ENV, TONE | ENV, TONE]), ayMacro(AY_MACRO.ENV_SHAPE, [8]), ...autoEnv,
    ayMacro(AY_MACRO.VOL, [12, 12, 12, 12, 11, 10, 9, 8])]);
  const saw = ins('Saw drone bass', [ayMacro(AY_MACRO.MIXER, [TONE | ENV]), ayMacro(AY_MACRO.ENV_SHAPE, [8]), ...autoEnv]);
  // Triangle envelope runs at half the saw rate: the written note sounds an octave lower.
  // The envelope always plays at full level, so the sub is a 6-tick thump, not a drone (a held one buries the core).
  const sub = ins('Triangle sub', [
    ayMacro(AY_MACRO.MIXER, [ENV, ENV, ENV, ENV, ENV, ENV, TONE]), ayMacro(AY_MACRO.VOL, [15, 15, 15, 15, 15, 15, 0]),
    ayMacro(AY_MACRO.ENV_SHAPE, [10]), ...autoEnv]);
  // Drums carry their own off-beat hat at tick 11: one tick early at speed 6, one tick late at speed 5.
  const kick = ins('Kick + hat', [
    ayMacro(AY_MACRO.VOL, [12, 12, 11, 9, 6, 0, 0, 0, 0, 0, 0, 8, 0]),
    ayMacro(AY_MACRO.ARP, [12, 7, 3, 0]),
    ayMacro(AY_MACRO.NOISE, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 30, 30]),
    ayMacro(AY_MACRO.MIXER, [TONE | NOISE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, NOISE, NOISE])]);
  const snare = ins('Snare + hat', [
    ayMacro(AY_MACRO.VOL, [12, 11, 10, 8, 6, 4, 2, 0, 0, 0, 0, 8, 0]),
    ayMacro(AY_MACRO.ARP, [5, 0]),
    ayMacro(AY_MACRO.NOISE, [22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 30, 30]),
    ayMacro(AY_MACRO.MIXER, [TONE | NOISE, TONE | NOISE, NOISE])]);
  const stab = ins('Minor stab', [
    ayMacro(AY_MACRO.VOL, [12, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 0]), ayMacro(AY_MACRO.ARP, [0, 3, 7], 0)]);

  // ---- lead bodies ----
  const motif = (i: number, third: string, accentFx: Array<[number, number]>, heldFx: Array<[number, number]>): Hits => [
    [0, { note: 'C-5', ins: i, fx: [[0x04, 0x00]] }],
    [3, { note: 'D-5', ins: i }],
    [6, { note: third, ins: i }],
    [8, { note: 'G-4', ins: i }],
    [11, { note: third, ins: i, fx: accentFx }], // the wink
    [16, { note: 'D-5', ins: i, fx: [[0x04, 0x00]] }],
    [19, { note: 'B-4', ins: i }],
    [22, { note: 'C-5', ins: i, fx: heldFx }],
  ];
  const motifMinor = motif(lead, 'D#5', [], [[0x04, 0x52]]);
  const motifMajor = motif(laugh, 'E-5', [[0x04, 0x84]], [[0x04, 0x84]]); // fast vibrato on the long notes only
  const answer: Hits = [
    [0, { note: 'D#5', ins: lead, fx: [[0x04, 0x00]] }], [3, { note: 'F-5', ins: lead }], [6, { note: 'G-5', ins: lead }],
    [8, { note: 'C-5', ins: lead }], [11, { note: 'G#5', ins: lead }],
    [16, { note: 'G-5', ins: lead }], [19, { note: 'F-5', ins: lead }], [22, { note: 'D#5', ins: lead }],
    [24, { note: 'C-5', ins: lead }], [28, { note: 'C#5', ins: lead }], [30, { note: 'B-4', ins: lead }], // bVI, bII, V
  ];
  const stabsB: Hits = [ // motif head, then the same a semitone up
    [0, { note: 'C-5', ins: lead, fx: [[0x04, 0x00]] }], [3, { note: 'D-5', ins: lead }], [6, { note: 'D#5', ins: lead }], [8, { note: 'OFF' }],
    [16, { note: 'C#5', ins: lead }], [19, { note: 'D#5', ins: lead }], [22, { note: 'E-5', ins: lead }], [24, { note: 'OFF' }],
  ];
  const turn: Hits = [ // up another semitone, then the flat third bends up to the major third
    [0, { note: 'D-5', ins: lead }], [3, { note: 'E-5', ins: lead }], [6, { note: 'F-5', ins: lead }], [8, { note: 'G-5', ins: lead }],
    [16, { note: 'D#5', ins: lead }],
    [20, { note: 'E-5', ins: lead, fx: [[0x03, 0x02]] }],
    [31, { fx: [[0x03, 0x00]] }],
  ];
  const haHa: Hits = [
    [0, { note: 'G-5', ins: laugh, fx: [[0x04, 0x00]] }], [2, { note: 'G-5', ins: laugh }], [4, { note: 'E-5', ins: laugh }], [6, { note: 'E-5', ins: laugh }],
    [8, { note: 'C-5', ins: laugh }], [10, { note: 'C-5', ins: laugh }], [12, { note: 'G-4', ins: laugh }], [14, { note: 'OFF' }],
    [16, { note: 'E-5', ins: laugh }], [18, { note: 'G-5', ins: laugh }], [20, { note: 'C-6', ins: laugh }],
    [24, { fx: [[0x02, 0x08]] }], // comic slide down
    [31, { fx: [[0x02, 0x00]] }],
  ];

  // ---- bass bodies ----
  // 16th pulse on the root, octave pops on the motif's own accents (rows 3 6 11 14), then bVI, bII, V.
  const pulse: Hits = [];
  const pulseNotes = [
    'C-2', 'C-2', 'C-2', 'C-3', 'C-2', 'C-2', 'D#3', 'C-2', 'C-2', 'C-2', 'C-2', 'D#3', 'C-2', 'C-2', 'D-3', 'C-2',
    'C-2', 'C-2', 'C-2', 'D-3', 'C-2', 'C-2', 'C-3', 'C-2', 'G#1', 'G#1', 'G#2', 'G#1', 'C#2', 'C#2', 'G-1', 'G-2',
  ];
  pulseNotes.forEach((note, row) => pulse.push([row, { note, ins: buzz }]));
  const bounce: Hits = []; // major: octave-bouncing 8ths, I then V and home
  ['C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'G-1', 'G-2', 'G-1', 'G-2', 'C-2', 'C-3', 'C-2', 'C-3']
    .forEach((note, i) => bounce.push([i * 2, { note, ins: buzz }]));
  const droneB: Hits = [[0, { note: 'C-2', ins: saw }], [16, { note: 'C#2', ins: saw }]];
  const droneTurn: Hits = [[0, { note: 'D-2', ins: saw }], [16, { note: 'G-1', ins: saw }]];

  // ---- drum bodies (one channel: kick, snare, hats inside both, chord stabs between them) ----
  const K: NeoHit = { note: 'C-2', ins: kick };
  const S: NeoHit = { note: 'G-3', ins: snare };
  const beat: Hits = [[0, K], [4, S], [8, K], [12, S], [16, K], [20, S], [24, K], [28, S]];
  const heart: Hits = [[0, K], [4, K], [8, K], [12, K], [16, K], [20, K], [24, K], [28, S], [30, S]];
  const roll: Hits = [
    ...[0, 2, 4, 6, 8, 10, 12, 14].map((r): [number, NeoHit] => [r, K]), // the heartbeat doubles
    ...[16, 18, 20, 22, 24, 25, 26, 27, 28, 29, 30, 31].map((r): [number, NeoHit] => [r, S]),
  ];
  const heavy: Hits = [ // kicks on the motif rhythm 3+3+2, 3+5; stabs juggled in between
    [0, K], [3, K], [6, K], [8, S], [11, K], [12, { note: 'C-4', ins: stab }], [14, K],
    [16, K], [19, K], [22, K], [24, S], [26, { note: 'G#3', ins: stab }], [28, S], [30, S], [31, S],
  ];

  // ---- extras on AY1 ----
  const wink = (third: string): Hits => [ // channel 4, decoration: a yodel sparkle on the wink and on the last note
    [11, { note: third, ins: laugh, vol: ayVol(8) }], [14, { note: 'OFF' }], [22, { note: 'C-6', ins: laugh }], [26, { note: 'OFF' }],
  ];
  const subLine: Hits = [[0, { note: 'C-2', ins: sub }], [8, { note: 'C-2', ins: sub }], [16, { note: 'C-2', ins: sub }], [24, { note: 'G#1', ins: sub }], [28, { note: 'C#2', ins: sub }], [30, { note: 'G-1', ins: sub }]];

  const OFF: Hits = [[0, { note: 'OFF' }]];
  const rows: Array<Partial<Record<number, Hits>>> = [
    { [AY.LEAD]: motifMinor, [AY.BASS]: pulse, [AY.DRUMS]: beat, [AY.AY1_A]: wink('D#6'), [AY.AY1_B]: [[0, { note: 'OFF', vol: ayVol(9) }]], [AY.AY1_C]: OFF },
    { [AY.LEAD]: answer, [AY.BASS]: pulse, [AY.DRUMS]: beat, [AY.AY1_B]: motifMinor },
    { [AY.LEAD]: stabsB, [AY.BASS]: droneB, [AY.DRUMS]: heart, [AY.AY1_B]: OFF },
    { [AY.LEAD]: turn, [AY.BASS]: droneTurn, [AY.DRUMS]: roll },
    { [AY.LEAD]: motifMajor, [AY.BASS]: bounce, [AY.DRUMS]: beat, [AY.AY1_A]: wink('E-6') },
    { [AY.LEAD]: haHa, [AY.BASS]: bounce, [AY.DRUMS]: beat, [AY.AY1_B]: motifMajor },
    { [AY.LEAD]: motifMinor, [AY.BASS]: pulse, [AY.DRUMS]: heavy, [AY.AY1_A]: wink('D#6'), [AY.AY1_B]: OFF, [AY.AY1_C]: subLine },
    { [AY.LEAD]: answer, [AY.BASS]: pulse, [AY.DRUMS]: heavy, [AY.AY1_B]: motifMinor, [AY.AY1_C]: subLine },
  ];
  for (const row of rows) {
    const p = s.pattern();
    for (const [ch, hits] of Object.entries(row)) p.seq(Number(ch), hits as Hits);
    s.order.push(s.indexOf(p));
  }
  return s;
}
