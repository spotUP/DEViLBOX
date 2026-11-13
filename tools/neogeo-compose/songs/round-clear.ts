/**
 * Peter's Game "round-clear" jingle: 1 s (60 ticks at speed 4), ends with FF, no loop.
 * The motif's last three notes D B C, then a quick run up the C chord: thumbs up.
 * 80 byte ROM budget: one self-decaying pluck plays everything, so no slide and no second instrument.
 * Channels 1-2 (lead, bass G to C) are the whole jingle; channel 4 takes the run one note higher.
 * Channels 3, 5 and 6 rest: a note there costs 5 to 7 bytes the budget does not have.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '@/lib/export/neogeo/scrambleCompose';

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder("Peter's Game round clear", 4, 16, 6);
  const pluck = s.addInstrument('Bright pluck', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 14, 13, 12, 11, 10, 8, 6, 4, 3, 2, 1])]));

  const p = s.pattern();
  ([[0, 'D-5'], [2, 'B-4'], [4, 'C-5'], [6, 'E-5'], [7, 'G-5'], [8, 'C-6']] as const)
    .forEach(([row, note]) => p.put(AY.LEAD, row, { note, ins: pluck }));
  p.put(AY.LEAD, 14, { fx: [[0xff, 0x00]] });
  // The pluck sounds on two channels at once, so the bass is 3 volume steps under the lead.
  p.put(AY.BASS, 0, { note: 'G-3', ins: pluck, vol: ayVol(12) });
  p.put(AY.BASS, 4, { note: 'C-3', ins: pluck });
  p.put(AY.AY1_A, 9, { note: 'E-6', ins: pluck }); // alone on its row: the run goes one note higher
  s.order.push(s.indexOf(p));
  return s;
}
