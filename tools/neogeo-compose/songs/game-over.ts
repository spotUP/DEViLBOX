/**
 * Peter's Game "game-over" jingle: 3.4 s (201 ticks), ends with FF, no loop. "Oops", a shrug and a laugh.
 * The motif's opening backwards (E D C), the same fall again a semitone sour and slower (Eb Db B over G),
 * two swelling "wah" notes slower still, a chromatic deflating fall of an octave, a rest, then a wink: G C E up.
 * Slowing down is 0F on the lead (5, 7, 9); the fall runs at speed 3, one semitone a row. No pitch-slide effect:
 * BossGame's player does not build 01/02, and re-struck semitones flutter, which is the comic part.
 * 180 byte ROM budget. Channels 1-2 (lead; bass and timpani) are the whole jingle, channel 3 rests; 5 adds thirds under the
 * two falls, 6 an envelope blat (2 ticks) under each wah, 4 the last note of the wink.
 * Every channel is at volume 0 or note off before the FF row, so nothing holds after the end.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '@/lib/export/neogeo/scrambleCompose';

const TONE = 1, NOISE = 2, ENV = 4;
const AUTO_ENV_NUM = 7, AUTO_ENV_DEN = 8; // Furnace ex3 / alg macros: envelope period follows the note

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder("Peter's Game game over", 5, 48, 6);
  const lead = s.addInstrument('Lead', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 14, 13])]));
  const wah = s.addInstrument('Wah', ayInstrument([ayMacro(AY_MACRO.VOL, [9, 12, 15, 14, 13])]));
  const DECAY = [12, 11, 10, 8, 6, 4, 2, 0]; // one table in the ROM for both struck voices
  // Noise on the first tick only: a timpani low down, a bell higher up. Decays to 0 by itself.
  const struck = s.addInstrument('Struck tone', ayInstrument([
    ayMacro(AY_MACRO.VOL, DECAY), ayMacro(AY_MACRO.MIXER, [TONE | NOISE, TONE]),
  ]));
  // Envelope only as a 2-tick accent (it plays at level 15 whatever the volume), then a short square tail to 0.
  const blat = s.addInstrument('Envelope blat', ayInstrument([
    ayMacro(AY_MACRO.VOL, DECAY), ayMacro(AY_MACRO.MIXER, [TONE | ENV, TONE | ENV, TONE]),
    ayMacro(AY_MACRO.ENV_SHAPE, [8]), ayMacro(AUTO_ENV_NUM, [1]), ayMacro(AUTO_ENV_DEN, [1]),
  ]));

  const p = s.pattern();
  // Lead: two falls, two wahs, the deflating fall, the wink.
  p.put(AY.LEAD, 0, { note: 'E-5', ins: lead });
  p.put(AY.LEAD, 2, { note: 'D-5' });
  p.put(AY.LEAD, 4, { note: 'C-5' });
  p.put(AY.LEAD, 6, { note: 'D#5', fx: [[0x0f, 7]] });
  p.put(AY.LEAD, 8, { note: 'C#5' });
  p.put(AY.LEAD, 10, { note: 'B-4' });
  p.put(AY.LEAD, 12, { note: 'A#4', ins: wah, fx: [[0x0f, 9]] });
  p.put(AY.LEAD, 14, { note: 'A-4' });
  p.put(AY.LEAD, 16, { note: 'G#4', ins: lead, fx: [[0x0f, 3]] });
  ['G-4', 'F#4', 'F-4', 'E-4', 'D#4', 'D-4', 'C#4', 'C-4', 'B-3', 'A#3', 'A-3', 'G#3'].forEach((note, i) => p.put(AY.LEAD, 20 + i, { note }));
  p.put(AY.LEAD, 32, { note: 'OFF' });
  p.put(AY.LEAD, 36, { note: 'G-5' });
  p.put(AY.LEAD, 38, { note: 'C-6' });
  p.put(AY.LEAD, 42, { note: 'OFF' });
  p.put(AY.LEAD, 46, { fx: [[0xff, 0x00]] });
  // Bass and timpani are one struck voice on the bass channel (a second channel for two hits costs 9 bytes more).
  ([[0, 'C-3'], [4, 'G-2'], [6, 'G-2'], [10, 'G-2'], [12, 'F-2']] as const).forEach(([row, note]) => p.put(AY.BASS, row, { note, ins: struck }));
  // Thirds under both falls: the lead's instrument again, so 3 volume steps under it.
  ['C-5', 'B-4', 'A-4', 'B-4', 'A-4', 'G-4'].forEach((note, i) =>
    p.put(AY.AY1_B, i * 2, i === 0 ? { note, ins: lead, vol: ayVol(12) } : { note }));
  p.put(AY.AY1_B, 12, { note: 'OFF' });
  [12, 14].forEach((row) => p.put(AY.AY1_C, row, { note: 'F-3', ins: blat }));
  p.put(AY.AY1_A, 39, { note: 'E-6', ins: struck }); // alone on its row: the wink goes one note higher
  s.order.push(s.indexOf(p));
  return s;
}
