/**
 * Peter's motif (BossGame): the 2-bar phrase every tune quotes. C major, speed 6 (146 BPM at 58.3 Hz).
 *
 *   C5 D5 E5 | G4 ^E5 | D5 B4 C5      rows 0 3 6 | 8 11 | 16 19 22 (16th rows, 32 = 2 bars)
 *
 * Rhythm 3+3+2, 3+5, 3+3+10: every half bar opens with the same two dotted 8ths. The wink is the
 * leap up a major 6th G4 -> E5, pushed one 16th early (row 11) and accented. Minor version: E -> Eb
 * (the leap becomes a minor 6th), B stays natural (harmonic minor leading tone).
 * One chip (3 channels) so BossGame's one-chip compiler can dump it; game tunes use all 6.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '@/lib/export/neogeo/scrambleCompose';

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder("Peter's motif", 6, 32, 3);
  const lead = s.addInstrument('Motif lead', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 15, 14, 13, 12, 12, 11], 6)]));
  const p = s.pattern();
  p.seq(AY.LEAD, [
    [0, { note: 'C-5', ins: lead, vol: ayVol(13), fx: [[0x04, 0x00]] }], // vibrato off again after the loop
    [3, { note: 'D-5', ins: lead }],
    [6, { note: 'E-5', ins: lead }],
    [8, { note: 'G-4', ins: lead }],
    [11, { note: 'E-5', ins: lead, vol: ayVol(15) }], // the wink
    [16, { note: 'D-5', ins: lead, vol: ayVol(13) }],
    [19, { note: 'B-4', ins: lead }],
    [22, { note: 'C-5', ins: lead, vol: ayVol(14) }],
    [26, { fx: [[0x04, 0x52]] }], // vibrato on the held last note
  ]);
  s.order.push(0);
  return s;
}
