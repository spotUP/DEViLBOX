/**
 * final-boss (BossGame, level 100: Peter's own grinning head), trimmed to fit the sound ROM (<= 550 bytes compiled).
 * C minor, speed 6 at 58.3 Hz (146 BPM), 7 patterns of 2 bars = 14 bars = 23 s loop. One AY-3-8910, 3 channels.
 *
 *   order 0  bars 1-2    A   Peter's motif in minor on the lead (C D Eb | G ^Eb | D B C), buzz-pluck 16th pulse
 *   order 1  bars 3-4    A'  answer phrase
 *   order 2  bars 5-6    B   pulse stops: drone C -> Db, heartbeat kick, motif head as stabs
 *   order 3  bars 7-8    B'  drone D -> G, the lead bends Eb up to E: minor turns major
 *   order 4  bars 9-10   C   Peter laughing: motif in major, octave-yodel lead, bouncing octave bass
 *   order 5  bars 11-12  C'  "ha ha ha" falling staccato, run up to C6, comic slide down
 *   order 6  bars 13-14  A'' answer again, heavy kicks on the motif rhythm; loops to order 0
 *
 * The second chip (channels 4-6), the answer/canon sections, the heavy A and the vibrato were cut for size.
 * No rhythm depends on a macro length and there is no 0F, so speed 5 works.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';
import { noteNumber, type NeoHit } from '@/lib/export/neogeo/neoGeoCompose';

// Furnace AY macro codes the builder does not name: auto envelope (envelope period follows the note) numerator / denominator.
const AUTO_ENV_NUM = 7;
const AUTO_ENV_DEN = 8;
const TONE = 1, NOISE = 2, ENV = 4;
type Hits = Array<[number, NeoHit]>;

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder('final-boss', 6, 32, 3);
  const ins = (name: string, macros: Parameters<typeof ayInstrument>[0]) => s.addInstrument(name, ayInstrument(macros));

  const lead = ins('Lead', [ayMacro(AY_MACRO.VOL, [15, 14, 13, 12], 3)]);
  // Octave yodel: the note flips an octave up every 3 ticks (9.7 Hz), Peter's laugh.
  const laugh = ins('Laugh lead', [ayMacro(AY_MACRO.VOL, [15, 14, 13, 12], 3), ayMacro(AY_MACRO.ARP, [0, 0, 0, 12, 12, 12], 0)]);
  // Buzz pluck: 3 ticks of tone gated by the saw envelope at the note's own pitch, then a plain tone tail.
  const buzz = ins('Buzz pluck bass', [
    ayMacro(AY_MACRO.MIXER, [TONE | ENV, TONE]), ayMacro(AY_MACRO.ENV_SHAPE, [8]),
    ayMacro(AUTO_ENV_NUM, [1]), ayMacro(AUTO_ENV_DEN, [1]), ayMacro(AY_MACRO.VOL, [12, 10, 8], 2)]);
  // Drums carry their own off-beat hat at tick 11: one tick early at speed 6, one tick late at speed 5.
  const kick = ins('Kick + hat', [
    ayMacro(AY_MACRO.VOL, [12, 11, 8, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0]),
    ayMacro(AY_MACRO.NOISE, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 30, 30]),
    ayMacro(AY_MACRO.MIXER, [TONE | NOISE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, TONE, NOISE, NOISE])]);
  const snare = ins('Snare + hat', [
    ayMacro(AY_MACRO.VOL, [12, 10, 6, 2, 0, 0, 0, 0, 0, 0, 0, 8, 0]),
    ayMacro(AY_MACRO.NOISE, [22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 30, 30]),
    ayMacro(AY_MACRO.MIXER, [NOISE])]);

  const motif = (i: number, third: string): Hits => [
    [0, { note: 'C-5', ins: i }], [3, { note: 'D-5', ins: i }], [6, { note: third, ins: i }],
    [8, { note: 'G-4', ins: i }], [11, { note: third, ins: i }], // the wink
    [16, { note: 'D-5', ins: i }], [19, { note: 'B-4', ins: i }], [22, { note: 'C-5', ins: i }],
  ];
  const motifMinor = motif(lead, 'D#5');
  const motifMajor = motif(laugh, 'E-5');
  const answer: Hits = [
    [0, { note: 'D#5', ins: lead }], [3, { note: 'F-5', ins: lead }], [6, { note: 'G-5', ins: lead }],
    [8, { note: 'C-5', ins: lead }], [11, { note: 'G#5', ins: lead }],
    [16, { note: 'G-5', ins: lead }], [19, { note: 'F-5', ins: lead }], [22, { note: 'D#5', ins: lead }],
    [24, { note: 'C-5', ins: lead }], [28, { note: 'C#5', ins: lead }], [30, { note: 'B-4', ins: lead }], // bVI, bII, V
  ];
  const stabsB: Hits = [ // motif head, then the same a semitone up
    [0, { note: 'C-5', ins: lead }], [3, { note: 'D-5', ins: lead }], [6, { note: 'D#5', ins: lead }], [8, { note: 'OFF' }],
    [16, { note: 'C#5', ins: lead }], [19, { note: 'D#5', ins: lead }], [22, { note: 'E-5', ins: lead }], [24, { note: 'OFF' }],
  ];
  const turn: Hits = [ // the head up a step, then the flat third bends up to the major third
    [0, { note: 'D-5', ins: lead }], [3, { note: 'E-5', ins: lead }], [6, { note: 'F-5', ins: lead }], [8, { note: 'G-5', ins: lead }],
    [16, { note: 'D#5', ins: lead }],
    [20, { note: 'E-5', ins: lead, fx: [[0x03, 0x02]] }],
    [31, { fx: [[0x03, 0x00]] }],
  ];
  const haHa: Hits = [
    [0, { note: 'G-5', ins: laugh }], [2, { note: 'G-5', ins: laugh }], [4, { note: 'E-5', ins: laugh }], [6, { note: 'E-5', ins: laugh }],
    [8, { note: 'C-5', ins: laugh }], [10, { note: 'C-5', ins: laugh }], [12, { note: 'G-4', ins: laugh }], [14, { note: 'OFF' }],
    [16, { note: 'E-5', ins: laugh }], [18, { note: 'G-5', ins: laugh }], [20, { note: 'C-6', ins: laugh }],
    [24, { fx: [[0x02, 0x08]] }], // comic slide down
    [31, { fx: [[0x02, 0x00]] }],
  ];

  // 16th pulse on the root, octave pops on the motif's accents (rows 3 6 11 14), then bVI, bII, V.
  const pulse: Hits = [];
  const pulseNotes = [
    'C-2', 'C-2', 'C-2', 'C-3', 'C-2', 'C-2', 'D#3', 'C-2', 'C-2', 'C-2', 'C-2', 'D#3', 'C-2', 'C-2', 'D-3', 'C-2',
    'C-2', 'C-2', 'C-2', 'D-3', 'C-2', 'C-2', 'C-3', 'C-2', 'G#1', 'G#1', 'G#2', 'G#1', 'C#2', 'C#2', 'G-1', 'G-2',
  ];
  pulseNotes.forEach((note, row) => pulse.push([row, { note, ins: buzz }]));
  const bounce: Hits = []; // major: octave-bouncing 8ths, I then V and home
  ['C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'C-2', 'C-3', 'G-1', 'G-2', 'G-1', 'G-2', 'C-2', 'C-3', 'C-2', 'C-3']
    .forEach((note, i) => bounce.push([i * 2, { note, ins: buzz }]));
  const droneB: Hits = [[0, { note: 'C-2', ins: buzz }], [16, { note: 'C#2', ins: buzz }]];
  const droneTurn: Hits = [[0, { note: 'D-2', ins: buzz }], [16, { note: 'G-1', ins: buzz }]];

  const K: NeoHit = { note: 'C-2', ins: kick };
  const S: NeoHit = { note: 'G-3', ins: snare };
  const beat: Hits = [[0, K], [4, S], [8, K], [12, S], [16, K], [20, S], [24, K], [28, S]];
  const heart: Hits = [[0, K], [4, K], [8, K], [12, K], [16, K], [20, K], [24, K], [28, S], [30, S]];

  const heavy: Hits = [ // kicks on the motif rhythm 3+3+2, 3+5
    [0, K], [3, K], [6, K], [8, S], [11, K], [14, K],
    [16, K], [19, K], [22, K], [24, S], [28, S], [30, S], [31, S],
  ];
  const orders: Array<[Hits, Hits, Hits]> = [
    [motifMinor, pulse, beat],
    [answer, pulse, beat],
    [stabsB, droneB, heart],
    [turn, droneTurn, beat],
    [motifMajor, bounce, beat],
    [haHa, bounce, beat],
    [answer, pulse, heavy],
  ];
  for (const [ld, bs, dr] of orders) {
    const p = s.pattern();
    p.seq(AY.LEAD, ld); p.seq(AY.BASS, bs); p.seq(AY.DRUMS, dr);
    s.order.push(s.indexOf(p));
  }
  return s;
}
