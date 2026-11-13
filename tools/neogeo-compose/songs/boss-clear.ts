/**
 * Peter's Game "boss-clear" jingle: 3.2 s (185 ticks at speed 5), ends with FF, no loop. "YES".
 * The whole motif in C major as a fanfare (C D E | G ^E | D B C), a noise drum roll into the last note, then the
 * big chord: top C with vibrato, a fast C E G arpeggio chord, three bells climbing, timpani G G C, and a
 * hardware-envelope tail (one falling ramp, 1.2 s) under it all.
 * 250 byte ROM budget. Channels 1-3 (lead, bass and timpani, drum roll) are the whole fanfare; 5 adds the lower
 * harmony and the chord, 4 the bells (two in the fanfare, three climbing), 6 the envelope tail.
 * Every channel is at volume 0 or note off before the FF row, so nothing holds after the end.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '@/lib/export/neogeo/scrambleCompose';

const TONE = 1, NOISE = 2, ENV = 4;
const TAIL_PERIOD = 0x2000; // envelope ramp 256 * 8192 / 1789772 Hz = 1.17 s from level 15 to 0

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder("Peter's Game boss clear", 5, 40, 6);
  const lead = s.addInstrument('Fanfare lead', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 15, 14, 14, 13])]));
  // Noise on the first tick only: a timpani low down, a bell higher up. Decays to 0 by itself.
  const struck = s.addInstrument('Struck tone', ayInstrument([
    ayMacro(AY_MACRO.VOL, [12, 11, 10, 8, 6, 4, 2, 0]), ayMacro(AY_MACRO.MIXER, [TONE | NOISE, TONE]),
  ]));
  const roll = s.addInstrument('Roll', ayInstrument([
    ayMacro(AY_MACRO.VOL, [11, 9, 7, 4, 0]), ayMacro(AY_MACRO.NOISE, [18]), ayMacro(AY_MACRO.MIXER, [NOISE]),
  ]));
  // One note, three pitches a tick apart: reads as a C major chord at 58.3 Hz.
  const chord = s.addInstrument('Major chord', ayInstrument([
    ayMacro(AY_MACRO.VOL, [11, 10, 9]), ayMacro(AY_MACRO.ARP, [0, 4, 7], 0),
  ]));
  // Shape 9 is one falling ramp that then stays at 0: it starts at level 15 like every envelope note, for an
  // instant only, and is the one envelope voice of the tune. The volume table is never heard.
  const tail = s.addInstrument('Envelope tail', ayInstrument([
    ayMacro(AY_MACRO.MIXER, [TONE | ENV]), ayMacro(AY_MACRO.ENV_SHAPE, [9]), ayMacro(AY_MACRO.ENV_PERIOD, [TAIL_PERIOD]),
  ]));

  const END = 34; // note off row for the held voices; FF two rows later
  const p = s.pattern();
  ([[0, 'C-5'], [2, 'D-5'], [3, 'E-5'], [6, 'G-4'], [8, 'E-5'], [12, 'D-5'], [14, 'B-4']] as const)
    .forEach(([row, note], i) => p.put(AY.LEAD, row, i === 0 ? { note, ins: lead } : { note }));
  p.put(AY.LEAD, 16, { note: 'C-6', fx: [[0x04, 0x85]] });
  p.put(AY.LEAD, END, { note: 'OFF' });
  p.put(AY.LEAD, END + 2, { fx: [[0xff, 0x00]] });
  // Lower harmony on the lead's instrument, so 3 volume steps under it; the chord keeps that volume.
  ([[0, 'G-4'], [2, 'B-4'], [3, 'C-5'], [6, 'E-4'], [8, 'C-5'], [12, 'B-4'], [14, 'G-4']] as const)
    .forEach(([row, note], i) => p.put(AY.AY1_B, row, i === 0 ? { note, ins: lead, vol: ayVol(12) } : { note }));
  p.put(AY.AY1_B, 16, { note: 'C-5', ins: chord });
  p.put(AY.AY1_B, END, { note: 'OFF' });
  // Bass and timpani: one struck voice. Under the chord it plays G G C; the bells (same instrument, channel 4)
  // ring a fifth on the two fanfare accents and climb on rows 17-19.
  ([[0, 'C-3'], [6, 'G-2'], [8, 'C-3'], [16, 'C-3'], [20, 'G-2'], [22, 'G-2'], [24, 'C-3']] as const)
    .forEach(([row, note]) => p.put(AY.BASS, row, { note, ins: struck }));
  [10, 11, 12, 13, 14, 15].forEach((row) => p.put(AY.DRUMS, row, { note: 'C-4', ins: roll }));
  ([[0, 'G-5'], [8, 'G-5'], [17, 'E-6'], [18, 'G-6'], [19, 'C-7']] as const).forEach(([row, note]) => p.put(AY.AY1_A, row, { note, ins: struck }));
  p.put(AY.AY1_C, 16, { note: 'C-4', ins: tail });
  p.put(AY.AY1_C, END, { note: 'OFF' });
  s.order.push(s.indexOf(p));
  return s;
}
