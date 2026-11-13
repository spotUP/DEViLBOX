/**
 * Gumbirds - game over jingle (Neo Geo MVS, YM2610 extended FM, nullsound via furtool).
 * D minor, speed 8 at 60 Hz (about 113 BPM), one 36-row pattern = 4.8 s. Does not loop (no 0B jump).
 * Bar 1: the gum hook rhythm (0, 3, 6, 8, 12, 14) and its wide leaps up, moved to D minor (A D F A F E).
 * Bar 2: D, a C# neighbour note, then the last D holds, wobbles and droops down (E2 note slide + fade):
 * a bubble losing air. Comic, not a funeral: bubble pops on SSG 1, a deflating whistle and an air hiss.
 * SSG volumes are even (0-14): only those map to an exact editor value.
 */
import { NEO, NeoGeoSongBuilder } from '@/lib/export/neogeo/neoGeoCompose';
import { fm, seqMacro, ssg, kick } from './gumbirds-common';

export default function gumbirdsGameOver(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Gumbirds - Game Over', 8, 36);

  // ---- Instruments -------------------------------------------------------------------------
  // Deflating horn (alg 4): rounder than the title brass (feedback 4, OP3 mult 1). OP3 sits at detune 7 against
  // the carriers at 3-4: a slow beating "wah" that makes the held last note sound a bit rubbery and comic.
  const LEAD = s.addInstrument('Deflating horn', fm(4, 4, {
    op1: { mult: 1, tl: 30, ar: 22, dr: 7, d2r: 2, sl: 3, rr: 6, dt: 3, rs: 1 },
    op2: { mult: 1, tl: 10, ar: 28, dr: 4, d2r: 1, sl: 2, rr: 5, dt: 4, rs: 1 },
    op3: { mult: 1, tl: 40, ar: 24, dr: 6, d2r: 1, sl: 3, rr: 6, dt: 7 },
    op4: { mult: 1, tl: 14, ar: 28, dr: 4, d2r: 1, sl: 2, rr: 5, dt: 3, rs: 1 },
  }));
  // Tuba slap bass (alg 4): the title slap with a lower click (OP3 mult 3, not 5) and a slower release, so the
  // low D sounds like a tuba "plop" and can droop with the lead.
  const BASS = s.addInstrument('Tuba slap bass', fm(4, 5, {
    op1: { mult: 1, tl: 26, ar: 31, dr: 11, d2r: 3, sl: 5, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 6, ar: 31, dr: 6, d2r: 2, sl: 3, rr: 6, dt: 3, rs: 1 },
    op3: { mult: 3, tl: 36, ar: 31, dr: 16, d2r: 8, sl: 15, rr: 10, dt: 4 },
    op4: { mult: 1, tl: 12, ar: 31, dr: 8, d2r: 3, sl: 4, rr: 6, dt: 2, rs: 1 },
  }));
  // FM 2 as four operator channels, alg 7 (all carriers), one shared patch. OP1 (feedback 3) is the lead echo.
  // OP2-OP4 are a soft mult 1 chord voice (warmer than the arena / round clear stabs at mult 2).
  const EXT = s.addInstrument('Droop echo + stab (FM 2 ops)', fm(7, 3, {
    op1: { mult: 1, tl: 18, ar: 31, dr: 8, d2r: 3, sl: 4, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 16, ar: 30, dr: 8, d2r: 2, sl: 4, rr: 6, dt: 4 },
    op3: { mult: 1, tl: 16, ar: 30, dr: 8, d2r: 2, sl: 4, rr: 6, dt: 2 },
    op4: { mult: 1, tl: 16, ar: 30, dr: 8, d2r: 2, sl: 4, rr: 6, dt: 3 },
  }));
  // Leaky pad (alg 4): slow carrier attack, SSG-EG on both modulators (OP1 mode 8+6 up/down, OP3 mode 8+2
  // down/up) so the tone breathes in and out like air going through a pinhole.
  const PAD = s.addInstrument('SSG-EG leaky pad', fm(4, 2, {
    op1: { mult: 1, tl: 32, ar: 18, dr: 12, d2r: 0, sl: 6, rr: 5, dt: 4, ssg: 8 + 6 },
    op2: { mult: 1, tl: 12, ar: 13, dr: 2, d2r: 0, sl: 1, rr: 4, dt: 3 },
    op3: { mult: 2, tl: 38, ar: 16, dr: 10, d2r: 0, sl: 7, rr: 5, dt: 2, ssg: 8 + 2 },
    op4: { mult: 1, tl: 14, ar: 12, dr: 2, d2r: 0, sl: 1, rr: 4, dt: 4 },
  }));
  // Bubble pop: a 6-tick square chirp rising root-fifth-octave-twelfth, fast decay. Gum bubbles popping.
  const POP = s.addInstrument('Bubble pop', ssg([seqMacro(0, [12, 10, 7, 4, 2, 0]), seqMacro(1, [0, 7, 12, 19, 24, 24])]));
  // Deflating whistle: square that holds, then fades over about 50 ticks while the E2 slide pulls it down.
  const whistleVol = [10, 10, 10, 10, 10, 10, 10, 10];
  for (let v = 9; v >= 1; v--) for (let k = 0; k < 5; k++) whistleVol.push(v);
  whistleVol.push(0);
  const WHISTLE = s.addInstrument('Deflating whistle', ssg([seqMacro(0, whistleVol)]));
  // Air hiss: quiet noise that swells a little and fades out (air leaking from the bubble).
  const HISS = s.addInstrument('Air hiss', ssg([
    seqMacro(0, [2, 3, 4, 5, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0]),
    seqMacro(3, [2]),
  ]));
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [12, 8, 5, 3, 1, 0]), seqMacro(3, [2])]));
  const SNARE = s.addInstrument('Snare', ssg([
    seqMacro(0, [15, 14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0]), seqMacro(1, [12, 5, 0]), seqMacro(3, [3, 3, 2]),
  ]));
  const KICK = s.addInstrument('Kick', kick(repoRoot));

  const p = s.pattern();
  const vib: [number, number] = [0x04, 0x34];

  // ---- Lead and its ext-FM echo ------------------------------------------------------------
  const lead: Array<[number, string, Array<[number, number]>]> = [
    [0, 'A-4', []], [3, 'D-5', []], [6, 'F-5', []], [8, 'A-5', [[0x12, 24]]], [12, 'F-5', [[0x12, 30]]], [14, 'E-5', []],
    [16, 'D-5', []], [19, 'C#5', []], [22, 'D-5', [[0x03, 0x20]]],
  ];
  for (const [r, n, fx] of lead) {
    p.put(NEO.FM1, r, { note: n, ins: LEAD, vol: 111, fx });
    if (r + 2 < 22) p.put(NEO.OP1, r + 2, { note: n, ins: EXT, vol: 103, fx: [[0xed, 3]] });
  }
  // The droop: wobble from row 24, then a slow note slide down a fifth with a fade; it rings to the end.
  p.put(NEO.FM1, 24, { fx: [vib] });
  p.put(NEO.FM1, 26, { fx: [[0xe2, 0x27], [0x04, 0x44], [0x0a, 0x02]] });

  // ---- Harmony: Dm | A7 (bar 1 end) | Gm A7 | Dm ---------------------------------------------
  const Dm = ['A-4', 'D-5', 'F-5'], A7 = ['G-4', 'C#5', 'E-5'], Gm = ['G-4', 'Bb4', 'D-5'];
  const stab = (r: number, ch: string[], vol: number, strum = false) =>
    ch.forEach((n, i) => p.put(NEO.OP2 + i, r, { note: n, ins: EXT, vol, fx: strum ? [[0xed, i * 2]] : i === 2 ? [[0xed, 1]] : [] }));
  stab(6, Dm, 127); stab(8, Dm, 103, true); // ext-FM echo stab
  stab(14, A7, 127); stab(16, Gm, 119); stab(19, A7, 119);
  stab(22, Dm, 119, true); // final chord strummed, rings, fades with the droop
  for (let i = 0; i < 3; i++) p.put(NEO.OP2 + i, 26, { fx: [[0x0a, 0x02]] });

  // Bass: tuba slap, octave plops; the last D droops with the lead.
  ([[0, 'D-2', 34], [6, 'D-3', 20], [8, 'A-2', 34], [12, 'F-2', 34], [14, 'A-2', 22], [16, 'G-2', 34], [19, 'A-2', 26], [22, 'D-2', 34]] as const)
    .forEach(([r, n, op3]) => p.put(NEO.FM3, r, { note: n, ins: BASS, vol: r === 22 ? 127 : 119, fx: [[0x14, op3]] }));
  p.put(NEO.FM3, 26, { fx: [[0xe2, 0x25], [0x0a, 0x02]] });

  // Pad: swells in under bar 1 (0A volume slide up), follows the chords, droops at the end.
  p.put(NEO.FM4, 0, { note: 'F-4', ins: PAD, vol: 95, fx: [[0x0a, 0x20], [0x08, 0xff]] });
  p.put(NEO.FM4, 12, { fx: [[0x0a, 0x00]] });
  p.put(NEO.FM4, 16, { note: 'D-4', ins: PAD, vol: 111 });
  p.put(NEO.FM4, 19, { note: 'E-4', ins: PAD, vol: 111, fx: [[0x03, 0x40]] });
  p.put(NEO.FM4, 22, { note: 'F-4', ins: PAD, vol: 111, fx: [[0x03, 0x40]] });
  p.put(NEO.FM4, 26, { fx: [[0xe2, 0x37], [0x0a, 0x02]] });

  // ---- Comic SSG layer -----------------------------------------------------------------------
  // Bubble pops answer the hook in its gaps.
  p.put(NEO.SSG1, 10, { note: 'D-6', ins: POP, vol: 10 });
  p.put(NEO.SSG1, 11, { note: 'F-6', ins: POP, vol: 8 });
  p.put(NEO.SSG1, 17, { note: 'A-5', ins: POP, vol: 8 });
  // Deflating whistle on the last note: wobbles, then slides down an octave as the air runs out.
  p.put(NEO.SSG1, 22, { note: 'D-6', ins: WHISTLE, fx: [[0x04, 0x63]] });
  p.put(NEO.SSG1, 25, { fx: [[0xe2, 0x2c]] });
  // Hats on 8ths through bar 1, then the air hiss.
  for (let r = 0; r < 16; r += 2) p.put(NEO.SSG2, r, { note: 'C-6', ins: HAT, vol: r % 4 ? 8 : 12 });
  p.put(NEO.SSG2, 22, { note: 'C-7', ins: HISS });
  // Snare backbeats, a late comic hit on the C#.
  p.put(NEO.SSG3, 4, { note: 'A-4', ins: SNARE });
  p.put(NEO.SSG3, 12, { note: 'A-4', ins: SNARE, vol: 12 });
  p.put(NEO.SSG3, 19, { note: 'C-5', ins: SNARE, vol: 10 });
  // Kick (ADPCM-B): beats, then the final thud on the last D, left-right on the pickup.
  for (const r of [0, 8, 16]) p.put(NEO.B, r, { note: 'C-4', ins: KICK, fx: r === 0 ? [[0x08, 0xff]] : [] });
  p.put(NEO.B, 20, { note: 'C-4', ins: KICK, fx: [[0x08, 0xf0]] });
  p.put(NEO.B, 21, { note: 'C-4', ins: KICK, fx: [[0x08, 0x0f]] });
  p.put(NEO.B, 22, { note: 'C-4', ins: KICK, fx: [[0x08, 0xff]] });

  // Ending safe for the driver's end-of-song stop (NSS_END): the 0A02 fades from row 26 bring every FM voice
  // near silence by row 31, all FM voices key off on row 32 and rows 33-35 stay empty, so the release tails end
  // inside the pattern. The whistle and hiss macros reach 0 by themselves (rows 29 and 26).
  for (const ch of [NEO.FM1, NEO.FM3, NEO.FM4, NEO.OP2, NEO.OP3, NEO.OP4]) p.put(ch, 32, { note: 'OFF' });

  s.order.push(s.indexOf(p));
  return s;
}
