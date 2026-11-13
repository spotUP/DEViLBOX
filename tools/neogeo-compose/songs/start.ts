/**
 * Peter's Game "start" jingle: 1.5 s (90 ticks at speed 6), ends with FF, no loop.
 * The motif's opening C D E climbs on to G, held with vibrato while it fades.
 * 120 byte ROM budget: two instruments, default macro tables wherever one will do.
 * Channels 1-3 (lead, bass, timpani) are the whole jingle; 4-6 run C E C up under the held note.
 */
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro } from '@/lib/export/neogeo/scrambleCompose';

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder("Peter's Game start", 6, 16, 6);
  const lead = s.addInstrument('Fanfare lead', ayInstrument([]));
  // Noise on the first tick only: a timpani low down, a struck bell higher up.
  const stab = s.addInstrument('Struck tone', ayInstrument([
    ayMacro(AY_MACRO.VOL, [12, 10, 8, 6, 4, 2, 0]), ayMacro(AY_MACRO.MIXER, [3, 1]),
  ]));

  const p = s.pattern();
  ['C-5', 'D-5', 'E-5'].forEach((note, i) => p.put(AY.LEAD, i * 2, { note, ins: lead }));
  p.put(AY.LEAD, 6, { note: 'G-5', ins: lead, fx: [[0x04, 0x85], [0x0a, 0x01]] }); // vibrato, fading to the stop
  p.put(AY.LEAD, 14, { note: 'OFF', fx: [[0xff, 0x00]] });
  p.put(AY.BASS, 0, { note: 'C-3', ins: stab });
  p.put(AY.BASS, 6, { note: 'C-3', ins: stab });
  // One struck voice per row (bass 0 and 6, timpani 2 and 4, bells 7 8 9): the same instrument never stacks.
  [2, 4].forEach((row) => p.put(AY.DRUMS, row, { note: 'G-2', ins: stab }));
  ([[AY.AY1_A, 'C-5'], [AY.AY1_B, 'E-5'], [AY.AY1_C, 'C-6']] as const).forEach(([ch, note], i) => p.put(ch, 7 + i, { note, ins: stab }));
  s.order.push(s.indexOf(p));
  return s;
}
