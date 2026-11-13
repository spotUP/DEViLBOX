/**
 * Gumbirds - round clear jingle (Neo Geo MVS, YM2610 extended FM, nullsound via furtool).
 * F major, speed 5 at 60 Hz (180 BPM), one 48-row pattern = 4.0 s. Does not loop (no 0B jump).
 * Rows 0-11: fast upward SSG run (one note per row) with an ext-FM echo of the run on FM 2 OP1, snare roll.
 * Rows 12-27: the gum hook rhythm (0, 3, 6, 8, 10, 12) as unison band hits, climbing to the leading tone.
 * SSG volumes are even (0-14): only those map to an exact editor value.
 * Row 28: bright F major chord on every voice, SSG noise cymbal tail, bells ping-pong, last notes ring out.
 */
import { NEO, NeoGeoSongBuilder } from '@/lib/export/neogeo/neoGeoCompose';
import { fm, seqMacro, ssg, kick, arpMacros } from './gumbirds-common';

export default function gumbirdsRoundClear(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Gumbirds - Round Clear', 5, 48);

  // ---- Instruments -------------------------------------------------------------------------
  // Fanfare brass (alg 4): brighter and faster than the title lead. OP1 feedback 6 for the edge, OP3 at mult 3
  // adds a reedy upper partial into the octave carrier OP4 (mult 2), so the high F at the end shines without
  // needing a louder level. Carrier sustain is high (sl 1-2) so the last note holds, then rr 5 lets it ring.
  const LEAD = s.addInstrument('Fanfare brass', fm(4, 6, {
    op1: { mult: 1, tl: 27, ar: 28, dr: 8, d2r: 2, sl: 3, rr: 6, dt: 3, rs: 1 },
    op2: { mult: 1, tl: 9, ar: 31, dr: 4, d2r: 1, sl: 1, rr: 5, dt: 4, rs: 1 },
    op3: { mult: 3, tl: 46, ar: 30, dr: 10, d2r: 3, sl: 5, rr: 6, dt: 2 },
    op4: { mult: 2, tl: 20, ar: 31, dr: 4, d2r: 1, sl: 2, rr: 5, dt: 2, rs: 1 },
  }));
  // Slap bass (alg 4): OP3 at mult 5 is the slap click into OP4; 14xx lowers OP3 TL for harder slaps.
  // Release is longer than the title bass (rr 6) so the final F-2 rings under the cymbal.
  const BASS = s.addInstrument('Clear slap bass', fm(4, 6, {
    op1: { mult: 1, tl: 24, ar: 31, dr: 12, d2r: 3, sl: 5, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 6, ar: 31, dr: 6, d2r: 2, sl: 3, rr: 6, dt: 3, rs: 1 },
    op3: { mult: 5, tl: 34, ar: 31, dr: 19, d2r: 10, sl: 15, rr: 12, dt: 4 },
    op4: { mult: 1, tl: 12, ar: 31, dr: 8, d2r: 3, sl: 4, rr: 6, dt: 2, rs: 1 },
  }));
  // FM 2 as four operator channels, alg 7 (all carriers). OP1 has the feedback (5): a buzzy echo of the run.
  // OP2-OP4 at mult 2 with spread detune are the chord stabs; decay is slower than the title stab so the final
  // chord sustains (sl 4, d2r 2).
  const EXT = s.addInstrument('Sparkle echo + stab (FM 2 ops)', fm(7, 5, {
    op1: { mult: 2, tl: 20, ar: 31, dr: 10, d2r: 4, sl: 5, rr: 7, dt: 3 },
    op2: { mult: 2, tl: 16, ar: 31, dr: 9, d2r: 2, sl: 4, rr: 6, dt: 4 },
    op3: { mult: 2, tl: 16, ar: 31, dr: 9, d2r: 2, sl: 4, rr: 6, dt: 2 },
    op4: { mult: 2, tl: 16, ar: 31, dr: 9, d2r: 2, sl: 4, rr: 6, dt: 3 },
  }));
  // Victory bell (alg 4, no feedback): mult 7 modulator over a mult 2 carrier + mult 3 over mult 1 = a bright,
  // slightly inharmonic chime; long d2r 1 / rr 4 tail so the ping-pong notes overlap like a ringing glockenspiel.
  const BELL = s.addInstrument('Victory bell', fm(4, 0, {
    op1: { mult: 7, tl: 42, ar: 31, dr: 10, d2r: 3, sl: 14, rr: 5, dt: 3, rs: 2 },
    op2: { mult: 2, tl: 14, ar: 31, dr: 5, d2r: 1, sl: 4, rr: 4, dt: 4, rs: 1 },
    op3: { mult: 3, tl: 36, ar: 31, dr: 8, d2r: 2, sl: 9, rr: 4, dt: 2 },
    op4: { mult: 1, tl: 18, ar: 31, dr: 4, d2r: 1, sl: 3, rr: 4, dt: 3, rs: 1 },
  }));
  // SSG run pluck: square with a one-tick octave-up sparkle on the attack, quick decay so the 12-note run stays
  // articulate at one note per row (5 ticks).
  const RUN = s.addInstrument('SSG run pluck', ssg([seqMacro(0, [14, 13, 12, 10, 9]), seqMacro(1, [12, 0])]));
  // Major arp for the final chord: starts at 11 (brighter than the arena bed), cycles F-A-C-F an octave up.
  const ARP = s.addInstrument('Arp major sparkle', ssg(arpMacros(4, 12, 11)));
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [12, 8, 5, 3, 1, 0]), seqMacro(3, [2])]));
  // Cymbal: noise only, 2 ticks at full level then a slow decay over about 90 ticks (1.5 s) = the crash tail
  // that the brief asks for under the final chord.
  const crashVol = [15, 15];
  for (let v = 14; v >= 1; v--) for (let k = 0; k < (v > 9 ? 4 : 7); k++) crashVol.push(v);
  crashVol.push(0);
  const CYMBAL = s.addInstrument('Noise cymbal', ssg([seqMacro(0, crashVol), seqMacro(3, [2])]));
  // Snare: tone + noise blip falling an octave, then noise tail (same voice as the title snare).
  const SNARE = s.addInstrument('Snare', ssg([
    seqMacro(0, [15, 14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0]), seqMacro(1, [12, 5, 0]), seqMacro(3, [3, 3, 2]),
  ]));
  const KICK = s.addInstrument('Kick', kick(repoRoot));

  const p = s.pattern();

  // ---- Rows 0-11: the run ------------------------------------------------------------------
  const run = ['C-5', 'D-5', 'E-5', 'F-5', 'G-5', 'A-5', 'Bb5', 'C-6', 'D-6', 'E-6', 'F-6', 'G-6'];
  run.forEach((n, i) => {
    p.put(NEO.SSG1, i, { note: n, ins: RUN });
    // Ext-FM echo: OP1 shadows the run a row and 2 ticks late, quieter (log scale, 103 = -18 dB).
    if (i + 1 < 12) p.put(NEO.OP1, i + 1, { note: n, ins: EXT, vol: 103, fx: [[0xed, 2]] });
  });
  // Snare roll: 8ths growing louder, then 16ths into the hook.
  [[0, 6], [2, 6], [4, 8], [6, 8], [8, 10], [9, 12], [10, 12], [11, 14]].forEach(([r, v]) =>
    p.put(NEO.SSG3, r, { note: 'A-4', ins: SNARE, vol: v }));
  // Bass walks up F A C E under the run, slapping on the top two (E1 slide up into the hook on row 10).
  p.put(NEO.FM3, 0, { note: 'F-2', ins: BASS, vol: 127, fx: [[0x14, 34]] });
  p.put(NEO.FM3, 4, { note: 'A-2', ins: BASS, vol: 111, fx: [[0x14, 34]] });
  p.put(NEO.FM3, 8, { note: 'C-3', ins: BASS, vol: 111, fx: [[0x14, 22]] });
  p.put(NEO.FM3, 10, { note: 'E-3', ins: BASS, vol: 119, fx: [[0x14, 18], [0xe1, 0x31]] });
  p.put(NEO.B, 0, { note: 'C-4', ins: KICK, fx: [[0x08, 0xff]] });
  p.put(NEO.B, 8, { note: 'C-4', ins: KICK });

  // ---- Rows 12-27: the gum hook rhythm as band hits -----------------------------------------
  // Lead: C F A C (wide leaps up, the hook's opening), then D E climbing to the leading tone.
  const lead: Array<[number, string, Array<[number, number]>]> = [
    [12, 'C-5', [[0x12, 30]]], [15, 'F-5', []], [18, 'A-5', []], [20, 'C-6', [[0x12, 22]]],
    [22, 'D-6', [[0x12, 26]]], [24, 'E-6', [[0x12, 20]]],
  ];
  for (const [r, n, fx] of lead) p.put(NEO.FM1, r, { note: n, ins: LEAD, vol: 111, fx });
  // Chords under the hits: F on the hook notes, Bb under D, C7 under E.
  const F = ['A-4', 'C-5', 'F-5'], Bb = ['Bb4', 'D-5', 'F-5'], C7 = ['G-4', 'Bb4', 'E-5'];
  const stab = (r: number, ch: string[], vol: number) =>
    ch.forEach((n, i) => p.put(NEO.OP2 + i, r, { note: n, ins: EXT, vol, fx: i === 2 ? [[0xed, 1]] : [] }));
  stab(12, F, 127); stab(15, F, 111); stab(18, F, 119); stab(20, F, 127); stab(22, Bb, 127); stab(24, C7, 127);
  // Ext-FM echo stab: the C7 repeats 2 rows later at -18 dB, one op per tick (a strummed echo).
  C7.forEach((n, i) => p.put(NEO.OP2 + i, 26, { note: n, ins: EXT, vol: 103, fx: [[0xed, i]] }));
  // Bass: root and octave slaps on the hits.
  ([[12, 'F-2', 34], [15, 'F-3', 20], [18, 'C-3', 34], [20, 'F-3', 20], [22, 'Bb2', 34], [24, 'C-3', 34], [26, 'C-4', 18]] as const)
    .forEach(([r, n, op3]) => p.put(NEO.FM3, r, { note: n, ins: BASS, vol: 119, fx: [[0x14, op3]] }));
  // Arp bed under the hook: F, then Bb, then C7 (arp dominant from the major voice + the E in the lead).
  p.put(NEO.SSG1, 12, { note: 'F-4', ins: ARP, vol: 10 });
  p.put(NEO.SSG1, 22, { note: 'Bb4', ins: ARP, vol: 10 });
  p.put(NEO.SSG1, 24, { note: 'C-5', ins: ARP, vol: 10 });
  // Drums: kick on the hits, snare backbeats, closed hats on 8ths, kick ping-pong pan into the chord.
  for (const r of [12, 18, 20, 24]) p.put(NEO.B, r, { note: 'C-4', ins: KICK });
  p.put(NEO.B, 26, { note: 'C-4', ins: KICK, fx: [[0x08, 0xf0]] });
  p.put(NEO.B, 27, { note: 'C-4', ins: KICK, fx: [[0x08, 0x0f]] });
  p.put(NEO.SSG3, 15, { note: 'A-4', ins: SNARE });
  p.put(NEO.SSG3, 22, { note: 'A-4', ins: SNARE });
  p.put(NEO.SSG3, 26, { note: 'B-4', ins: SNARE, vol: 10 });
  p.put(NEO.SSG3, 27, { note: 'C-5', ins: SNARE, vol: 12 });
  for (let r = 12; r < 28; r += 2) p.put(NEO.SSG2, r, { note: 'C-6', ins: HAT, vol: r % 4 ? 8 : 12 });

  // ---- Row 28: the bright F major chord, ringing out to the end --------------------------------
  // Lead lands on F-6 with a portamento from the E, vibrato from row 32, slow fade from row 36.
  p.put(NEO.FM1, 28, { note: 'F-6', ins: LEAD, vol: 119, fx: [[0x03, 0x30], [0x12, 22]] });
  p.put(NEO.FM1, 32, { fx: [[0x04, 0x34]] });
  // Chord on the operators an octave up (A C F), strummed one tick per op; FM 4 bells ping-pong the triad.
  ['A-5', 'C-6', 'F-6'].forEach((n, i) => p.put(NEO.OP2 + i, 28, { note: n, ins: EXT, vol: 127, fx: [[0xed, i]] }));
  ['C-6', 'F-6', 'A-6', 'C-7', 'A-6', 'F-6'].forEach((n, i) =>
    p.put(NEO.FM4, 28 + i * 2, { note: n, ins: BELL, vol: i < 4 ? 111 : 95, fx: [[0x08, i % 2 ? 0x0f : 0xf0]] }));
  p.put(NEO.FM4, 40, { note: 'F-6', ins: BELL, vol: 103, fx: [[0x08, 0xff]] });
  p.put(NEO.FM3, 28, { note: 'F-2', ins: BASS, vol: 127, fx: [[0x14, 20]] });
  p.put(NEO.SSG1, 28, { note: 'F-5', ins: ARP, vol: 12 });
  p.put(NEO.SSG2, 28, { note: 'C-7', ins: CYMBAL });
  p.put(NEO.SSG3, 28, { note: 'A-4', ins: SNARE });
  p.put(NEO.B, 28, { note: 'C-4', ins: KICK, fx: [[0x08, 0xff]] });

  // ---- Ending safe for the driver's end-of-song stop (NSS_END) -----------------------------------
  // The ring fades to near silence by row 42 (0A03 = 3 steps a tick), every voice keys off on row 44, and
  // rows 45-47 stay empty so the release tails finish inside the pattern: nothing is left for NSS_END to cut.
  p.put(NEO.FM1, 36, { fx: [[0x0a, 0x03]] });
  p.put(NEO.FM3, 36, { fx: [[0x0a, 0x03]] });
  for (let i = 0; i < 3; i++) p.put(NEO.OP2 + i, 36, { fx: [[0x0a, 0x03]] });
  p.put(NEO.FM4, 42, { fx: [[0x0a, 0x04]] });
  p.put(NEO.SSG1, 40, { note: 'OFF' });
  for (const ch of [NEO.FM1, NEO.FM3, NEO.FM4, NEO.OP2, NEO.OP3, NEO.OP4, NEO.SSG2]) p.put(ch, 44, { note: 'OFF' });

  s.order.push(s.indexOf(p));
  return s;
}
