/**
 * Neo Geo FD / F8 / F9 rom-check song (not game music): proves ArcadeGame's patched nsstool_fx.py + nullsound.
 * BPM 100 at the start (Furnace virtual tempo 100/150 -> timer B 169, exact), BPM 145 from pattern 1 (Furnace FD91 -> timer B 196, exact): both N divide 8700, so timer B lands on Furnace's tick rate with no drift.
 * F8/F9 volume steps on FM 1, SSG 1 and ADPCM-B, so the volume registers (FM TL, SSG 08-0A, ADPCM-B 1B) move.
 */
import { NEO, NeoGeoSongBuilder } from '@/lib/export/neogeo/neoGeoCompose';
import { fm, seqMacro, ssg, kick } from './gumbirds-common';

export default function neoGeoFxTempo(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Neo Geo FX tempo check', 6, 32);
  s.bpm = 100;
  const LEAD = s.addInstrument('Check lead', fm(4, 5, {
    op1: { mult: 1, tl: 30, ar: 31, dr: 6, d2r: 1, sl: 2, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 1, rr: 6, dt: 3 },
    op3: { mult: 2, tl: 40, ar: 31, dr: 8, d2r: 1, sl: 3, rr: 6, dt: 3 },
    op4: { mult: 1, tl: 10, ar: 31, dr: 4, d2r: 0, sl: 1, rr: 6, dt: 3 },
  }));
  const TONE = s.addInstrument('Check square', ssg([seqMacro(0, [12])]));
  const KICK = s.addInstrument('Kick', kick(repoRoot));
  const notes = ['C-4', 'E-4', 'G-4', 'C-5', 'G-4', 'E-4', 'D-4', 'B-3'];
  const fill = (p: ReturnType<NeoGeoSongBuilder['pattern']>) => {
    notes.forEach((n, i) => p.put(NEO.FM1, i * 4, { note: n, ins: LEAD, fx: [[i % 2 ? 0xf8 : 0xf9, 0x06]] }));
    for (let r = 0; r < 32; r += 8) p.put(NEO.SSG1, r, { note: 'A-3', ins: TONE });
    for (let r = 2; r < 32; r += 8) p.put(NEO.SSG1, r, { fx: [[0xf9, 0x03]] }).put(NEO.SSG1, r + 2, { fx: [[0xf8, 0x02]] });
    for (let r = 0; r < 32; r += 8) p.put(NEO.B, r, { note: 'C-4', ins: KICK, fx: [[r % 16 ? 0xf9 : 0xf8, 0x30]] });
  };
  const p0 = s.pattern(); fill(p0);
  const p1 = s.pattern(); fill(p1);
  p1.put(NEO.FM3, 0, { fx: [[0xfd, 0x91]] }).put(NEO.FM3, 31, { fx: [[0x0b, 0]] });
  s.order.push(0, 1);
  return s;
}
