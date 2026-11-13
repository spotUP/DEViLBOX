/**
 * title.fur (BossGame): the title screen. C major, speed 6 at 58.3 Hz (146 BPM), 32-row patterns (two bars).
 * Built from the stage theme's phrases and instruments (stage-a.ts), in a different order and build-up.
 *
 *   order 0     Peter's motif alone on the lead; the last half bar is a snare roll and the pickups that name
 *               every other channel's instrument
 *   order 1     motif again, bass and drums join (AY1 only doubles the bass)
 *   order 2-4   full: answer, motif, answer, the two chips trading the two phrases as a round
 *   order 5-6   the climb F, G under fast major arpeggio chords, twice; the lead rests on stabs
 *   order 7-8   the motif an octave up on the lead and its echo, the original octave under it on AY1 B; answer
 *   order 9-10  the climb once more, the high motif; 0B01 back to the bass-and-drums statement
 *
 * No sound effects play on the title screen, so all six channels always sound.
 */
import { AY, ScrambleSongBuilder } from '@/lib/export/neogeo/scrambleCompose';
import { ANSWER, BOUNCE, MOTIF, THUMP, kit, type Line } from './stage-a';

/** The stage groove with fewer hats: every instrument change on the drum channel costs 3 bytes. */
const GROOVE = 'K...S.h.K.K.S...K...S.h.K..KS.hh';

export default function (): ScrambleSongBuilder {
  const s = new ScrambleSongBuilder('Title', 6, 32, 6);
  const k = kit(s, true);

  const alone = s.pattern();
  k.line(alone, AY.LEAD, MOTIF, k.lead);
  k.line(alone, AY.AY1_A, [[30, 'C-5']], k.echo); // silent: the echo starts 12 ticks late
  k.line(alone, AY.AY1_B, [[28, 'E-5'], [30, 'D-5']], k.twin);
  k.line(alone, AY.BASS, [[28, 'G-1'], [30, 'G-2']], k.bounce);
  k.line(alone, AY.AY1_C, [[28, 'G-1']], k.thump);
  k.drums(alone, `${'.'.repeat(24)}K.S.SSSS`);

  const join = k.bar(MOTIF, [[0, 'OFF']], BOUNCE, THUMP, GROOVE);
  const x = k.bar(MOTIF, ANSWER, BOUNCE, THUMP, GROOVE);
  const y = k.bar(ANSWER, MOTIF, BOUNCE, THUMP, GROOVE);
  const b1 = k.climb(29, 31, GROOVE); // F, G
  const high: Line = MOTIF.map(([row, note]) => [row, note.replace(/\d/, (d) => String(Number(d) + 1))]);
  const top = k.bar(high, MOTIF, BOUNCE, THUMP, GROOVE);
  const turn = k.bar(high, MOTIF, BOUNCE, THUMP, GROOVE);
  k.fx(turn, AY.DRUMS, 31, 0x0b, 1);

  s.order.push(...[alone, join, y, x, y, b1, b1, top, y, b1, turn].map((p) => s.indexOf(p)));
  return s;
}
