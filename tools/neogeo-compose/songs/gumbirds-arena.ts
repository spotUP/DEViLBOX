/**
 * Gumbirds - arena (in-game loop). Neo Geo MVS, YM2610 extended FM, nullsound via furtool.
 * F major, speed 6 at 60 Hz (150 BPM), 16 rows per bar, 32-row patterns (2 bars), 16 patterns = 32 bars.
 * Order 0 intro (drums, then bass), 1-2 groove (bass, drums, arps, danger growl), 3-6 melody A,
 * 7-8 gap (bass, drums, arps only; SSG arpeggio run), 9-12 melody B (the gum hook, varied, with a counter horn
 * and a coin-bell ping-pong), 13-14 breakdown (SSG-EG danger pad, SSG envelope buzz, half-time bass, kick pan),
 * 15 turnaround (C7, 16th drums, SSG run), then 0B01 back to the groove: the loop is 30 bars = 48 s.
 * Groove first, melody second: the lead is a short-note line over a busy slap bass, and it never holds long in
 * the 1-3 kHz band, so it sits under gameplay sound effects. ADPCM-A is not used (reserved for sound effects).
 * Volumes: FM even 0-64 or odd 65-127; SSG even 0-14 or omitted (15).
 */
import { NEO, NeoGeoSongBuilder, NeoGeoPattern, noteNumber } from '@/lib/export/neogeo/neoGeoCompose';
import { fm, seqMacro, ssg, kick, arpMacros } from './gumbirds-common';

type Fx = Array<[number, number]>;

export default function gumbirdsArena(repoRoot: string): NeoGeoSongBuilder {
  const s = new NeoGeoSongBuilder('Gumbirds - Arena', 6, 32);

  // ---- Instruments -------------------------------------------------------------------------
  // Arena lead (alg 4): OP1 feedback 6 gives a reedy edge; OP3 at mult 3 into the carrier OP4 adds a bright
  // upper partial so the line cuts at moderate level. Short release (rr 7) keeps the notes separate over the
  // groove. OP1 TL 28 is the reference for the 12xx accents (12 20-22 = brighter, 12 28 = back to the patch).
  const LEAD = s.addInstrument('Arena lead', fm(4, 6, {
    op1: { mult: 1, tl: 28, ar: 31, dr: 9, d2r: 2, sl: 3, rr: 7, dt: 3, rs: 1 },
    op2: { mult: 1, tl: 8, ar: 31, dr: 5, d2r: 2, sl: 2, rr: 6, dt: 4, rs: 1 },
    op3: { mult: 3, tl: 42, ar: 31, dr: 12, d2r: 4, sl: 6, rr: 7, dt: 2 },
    op4: { mult: 1, tl: 14, ar: 31, dr: 6, d2r: 2, sl: 2, rr: 6, dt: 2, rs: 1 },
  }));
  // Arena slap (alg 4): OP3 at mult 6 is a harder, shorter click than the title bass (dr 21, sl 15); 14xx sets
  // OP3 TL (34 = patch, 20 = slap, 18 = fill). Carriers decay faster (dr 7-9) for a tight, funky 8th line.
  const BASS = s.addInstrument('Arena slap bass', fm(4, 6, {
    op1: { mult: 1, tl: 22, ar: 31, dr: 13, d2r: 3, sl: 5, rr: 8, dt: 3 },
    op2: { mult: 1, tl: 6, ar: 31, dr: 7, d2r: 3, sl: 4, rr: 8, dt: 3, rs: 1 },
    op3: { mult: 6, tl: 34, ar: 31, dr: 21, d2r: 12, sl: 15, rr: 13, dt: 4 },
    op4: { mult: 1, tl: 10, ar: 31, dr: 9, d2r: 3, sl: 5, rr: 8, dt: 2, rs: 1 },
  }));
  // FM 2 as four operator channels, alg 7 (all carriers). OP1 (feedback 5, mult 2) is the lead echo; OP2-OP4
  // (mult 1, spread detune 2/3/4) are short punchy chord stabs that still hold a little (d2r 3) for the
  // breakdown chords.
  const EXT = s.addInstrument('Arena echo + stab (FM 2 ops)', fm(7, 5, {
    op1: { mult: 2, tl: 20, ar: 31, dr: 11, d2r: 4, sl: 6, rr: 8, dt: 3 },
    op2: { mult: 1, tl: 16, ar: 31, dr: 12, d2r: 3, sl: 7, rr: 8, dt: 4 },
    op3: { mult: 1, tl: 16, ar: 31, dr: 12, d2r: 3, sl: 7, rr: 8, dt: 2 },
    op4: { mult: 1, tl: 16, ar: 31, dr: 12, d2r: 3, sl: 7, rr: 8, dt: 3 },
  }));
  // Rival horn (alg 4, feedback 3): slower attack (ar 20-22) and full sustain, a soft brass counter-line for B.
  const HORN = s.addInstrument('Rival horn', fm(4, 3, {
    op1: { mult: 1, tl: 32, ar: 20, dr: 8, d2r: 1, sl: 3, rr: 6, dt: 3 },
    op2: { mult: 1, tl: 12, ar: 22, dr: 3, d2r: 1, sl: 1, rr: 6, dt: 4 },
    op3: { mult: 2, tl: 44, ar: 22, dr: 9, d2r: 1, sl: 5, rr: 6, dt: 2 },
    op4: { mult: 1, tl: 16, ar: 22, dr: 3, d2r: 1, sl: 1, rr: 6, dt: 2 },
  }));
  // Danger pad (alg 4): SSG-EG on both modulators (8+6 up/down triangle on OP1, 8+2 down/up on OP3 at mult 3)
  // makes the brightness pulse while the chord holds; slow carrier attack (ar 9-10) for a swell.
  const PAD = s.addInstrument('Danger pad (SSG-EG)', fm(4, 3, {
    op1: { mult: 1, tl: 28, ar: 16, dr: 10, d2r: 0, sl: 6, rr: 5, dt: 4, ssg: 8 + 6 },
    op2: { mult: 1, tl: 10, ar: 10, dr: 2, d2r: 0, sl: 1, rr: 5, dt: 3 },
    op3: { mult: 3, tl: 40, ar: 14, dr: 9, d2r: 0, sl: 7, rr: 5, dt: 1, ssg: 8 + 2 },
    op4: { mult: 1, tl: 14, ar: 9, dr: 2, d2r: 0, sl: 1, rr: 5, dt: 5 },
  }));
  // Coin bell (alg 4, no feedback): OP1 at mult 11 over a mult 2 carrier plus mult 4 over mult 1 = a bright
  // metallic ping, like a coin; fast decay so the ping-pong stays clear.
  const BELL = s.addInstrument('Coin bell', fm(4, 0, {
    op1: { mult: 11, tl: 44, ar: 31, dr: 12, d2r: 4, sl: 14, rr: 6, dt: 3, rs: 2 },
    op2: { mult: 2, tl: 14, ar: 31, dr: 6, d2r: 2, sl: 5, rr: 6, dt: 4, rs: 1 },
    op3: { mult: 4, tl: 38, ar: 31, dr: 10, d2r: 3, sl: 10, rr: 6, dt: 2 },
    op4: { mult: 1, tl: 18, ar: 31, dr: 5, d2r: 2, sl: 4, rr: 6, dt: 3, rs: 1 },
  }));
  // Danger growl (alg 4, feedback 7 = noisy OP1): two pairs at mult 1 detuned against each other (dt 0 vs 6)
  // so the low note beats and snarls. Used as a two-note semitone pulse (C, C# sliding back to C).
  const GROWL = s.addInstrument('Danger growl', fm(4, 7, {
    op1: { mult: 1, tl: 20, ar: 26, dr: 6, d2r: 1, sl: 2, rr: 7, dt: 3 },
    op2: { mult: 1, tl: 10, ar: 24, dr: 4, d2r: 1, sl: 2, rr: 7, dt: 3 },
    op3: { mult: 1, tl: 30, ar: 24, dr: 5, d2r: 1, sl: 3, rr: 7, dt: 0 },
    op4: { mult: 1, tl: 14, ar: 24, dr: 4, d2r: 1, sl: 2, rr: 7, dt: 6 },
  }));
  // SSG arp beds (pluck decay from 9, loop on a soft tail): major, minor, dominant 7.
  const ARP_MAJ = s.addInstrument('Arp major', ssg(arpMacros(4, 12)));
  const ARP_MIN = s.addInstrument('Arp minor', ssg(arpMacros(3, 12)));
  const ARP_DOM = s.addInstrument('Arp dominant 7', ssg(arpMacros(4, 10)));
  // Run pluck: one-tick octave-up sparkle, decay over 6 ticks = one row at speed 6.
  const RUN = s.addInstrument('SSG run pluck', ssg([seqMacro(0, [14, 13, 12, 10, 9, 8]), seqMacro(1, [12, 0])]));
  const HAT = s.addInstrument('Hat closed', ssg([seqMacro(0, [12, 8, 5, 3, 1, 0]), seqMacro(3, [2])]));
  const OHAT = s.addInstrument('Hat open', ssg([seqMacro(0, [11, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 0]), seqMacro(3, [2])]));
  const SNARE = s.addInstrument('Snare', ssg([
    seqMacro(0, [15, 14, 12, 10, 9, 7, 6, 4, 3, 2, 1, 0]), seqMacro(1, [12, 5, 0]), seqMacro(3, [3, 3, 2]),
  ]));
  // Buzz bass: SSG hardware envelope shape 10 (triangle) locked to the note; fixed level, so notes are gated.
  const BUZZ = s.addInstrument('SSG envelope buzz', ssg([
    seqMacro(0, [15]), seqMacro(3, [4]), seqMacro(6, [10]), seqMacro(7, [1]), seqMacro(8, [1]),
  ]));
  const KICK = s.addInstrument('Kick', kick(repoRoot));

  // ---- Harmony -----------------------------------------------------------------------------
  type Chord = { root: string; stab: [string, string, string]; arp: number; arpNote: string };
  const C: Record<string, Chord> = {
    F: { root: 'F-2', stab: ['A-4', 'C-5', 'F-5'], arp: ARP_MAJ, arpNote: 'F-4' },
    Bb: { root: 'Bb2', stab: ['Bb4', 'D-5', 'F-5'], arp: ARP_MAJ, arpNote: 'Bb4' },
    C7: { root: 'C-3', stab: ['G-4', 'Bb4', 'E-5'], arp: ARP_DOM, arpNote: 'C-5' },
    Gm: { root: 'G-2', stab: ['G-4', 'Bb4', 'D-5'], arp: ARP_MIN, arpNote: 'G-4' },
    Dm: { root: 'D-3', stab: ['A-4', 'D-5', 'F-5'], arp: ARP_MIN, arpNote: 'D-5' },
    A: { root: 'A-2', stab: ['A-4', 'C#5', 'E-5'], arp: ARP_MAJ, arpNote: 'A-4' },
  };
  const up = (n: string, semis: number) => noteNumber(n) + semis;
  // Chord at a row of a bar: a bar holds one chord or two (rows 0-7 / 8-15).
  const at = (cs: Chord[], r: number) => (r < 8 || cs.length === 1 ? cs[0] : cs[1]);

  // ---- Parts (`o` = row offset of the bar in its 32-row pattern) ------------------------------
  function bass(p: NeoGeoPattern, o: number, cs: Chord[], half = false, fill = false) {
    if (half) {
      const ch = cs[0];
      p.put(NEO.FM3, o, { note: ch.root, ins: BASS, vol: 127, fx: [[0x14, 34]] });
      p.put(NEO.FM3, o + 6, { note: up(ch.root, 12), ins: BASS, vol: 95, fx: [[0x14, 26]] });
      p.put(NEO.FM3, o + 8, { note: ch.root, ins: BASS, vol: 111, fx: [[0x14, 34]] });
      p.put(NEO.FM3, o + 14, { note: up(ch.root, 7), ins: BASS, vol: 95, fx: [[0x14, 34]] });
      return;
    }
    // row, semitones, vol, slap: 8ths with octave pops (slap 14 20) on the off-beats, fifth on row 10.
    const hits: Array<[number, number, number, boolean]> = [
      [0, 0, 127, false], [2, 12, 111, true], [4, 0, 111, false], [6, 12, 111, true],
      [8, 0, 127, false], [10, 7, 95, false], [12, 12, 111, true], [14, fill ? 10 : 0, 95, false],
    ];
    for (const [r, st, vol, slap] of hits) {
      p.put(NEO.FM3, o + r, { note: up(at(cs, r).root, st), ins: BASS, vol, fx: [[0x14, slap ? 20 : 34]] });
    }
    if (fill) p.put(NEO.FM3, o + 15, { note: up(at(cs, 15).root, 12), ins: BASS, vol: 111, fx: [[0x14, 18], [0xe1, 0x42]] });
  }

  function drums(p: NeoGeoPattern, o: number, opts: { sixteenths?: boolean; fill?: boolean; push?: boolean } = {}) {
    for (const r of [0, 6, 8]) p.put(NEO.B, o + r, { note: 'C-4', ins: KICK });
    if (opts.push) p.put(NEO.B, o + 14, { note: 'C-4', ins: KICK });
    p.put(NEO.SSG3, o + 4, { note: 'A-4', ins: SNARE });
    if (opts.fill) {
      p.put(NEO.SSG3, o + 10, { note: 'G-4', ins: SNARE, vol: 8 });
      p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
      p.put(NEO.SSG3, o + 13, { note: 'B-4', ins: SNARE, vol: 10 });
      p.put(NEO.SSG3, o + 14, { note: 'C-5', ins: SNARE, vol: 12 });
      p.put(NEO.SSG3, o + 15, { note: 'D-5', ins: SNARE, fx: [[0xed, 3]] });
      p.put(NEO.B, o + 15, { note: 'C-4', ins: KICK, fx: [[0xed, 3]] });
    } else {
      p.put(NEO.SSG3, o + 12, { note: 'A-4', ins: SNARE });
    }
    for (let r = 0; r < 16; r += opts.sixteenths ? 1 : 2) {
      if (opts.fill && r >= 12) break;
      const open = r === 6 || r === 14;
      const vol = opts.sixteenths && r % 2 ? 8 : undefined;
      p.put(NEO.SSG2, o + r, { note: 'C-6', ins: open ? OHAT : HAT, vol });
    }
  }

  // Breakdown drums: kick on 1, kick ping-pong pan on rows 10/11 then centre, snare on 3 (half-time feel).
  function sparseDrums(p: NeoGeoPattern, o: number) {
    p.put(NEO.B, o, { note: 'C-4', ins: KICK });
    p.put(NEO.B, o + 10, { note: 'C-4', ins: KICK, fx: [[0x08, 0xf0]] });
    p.put(NEO.B, o + 11, { note: 'C-4', ins: KICK, fx: [[0x08, 0x0f]] });
    p.put(NEO.B, o + 12, { fx: [[0x08, 0xff]] });
    p.put(NEO.SSG3, o + 8, { note: 'A-4', ins: SNARE });
  }

  // Ext-FM stabs on OP2-OP4 (OP4 strums one tick late); `echo` repeats each stab 2 rows later at -18 dB with
  // one op per tick (strummed echo). Operator volume is log scale: 127 = patch level, 103 = -18 dB.
  function stabs(p: NeoGeoPattern, o: number, cs: Chord[], rows: number[], echo = false) {
    for (const r of rows) {
      const ch = at(cs, r);
      ch.stab.forEach((n, i) => p.put(NEO.OP2 + i, o + r, { note: n, ins: EXT, vol: 127, fx: i === 2 ? [[0xed, 1]] : [] }));
      if (echo && r + 2 < 16) ch.stab.forEach((n, i) => p.put(NEO.OP2 + i, o + r + 2, { note: n, ins: EXT, vol: 103, fx: [[0xed, i]] }));
    }
  }

  function arps(p: NeoGeoPattern, o: number, cs: Chord[]) {
    for (const r of [0, 8]) p.put(NEO.SSG1, o + r, { note: at(cs, r).arpNote, ins: at(cs, r).arp, vol: 12 });
  }

  // Lead on FM 1 with the OP1 echo 2 rows later. Persistent effects are closed automatically: after a note
  // with a 12xx accent the next note restores 12 28 (patch OP1 TL), after vibrato it sends 0400, after a volume
  // slide 0A00. An OFF closes all of them, so every phrase ends clean (and the loop seam starts clean).
  type Line = Array<[number, string, Fx?, number?]>; // row, note, fx, vol
  const st = { acc: false, vib: false, slide: false };
  function lead(p: NeoGeoPattern, o: number, line: Line, vol = 111, echoVol = 103) {
    for (const [r, n, fx0, v] of line) {
      const fx: Fx = [...(fx0 ?? [])];
      const has = (code: number) => fx.some(([c]) => c === code);
      if (st.acc && !has(0x12)) fx.push([0x12, 28]);
      if (st.vib && !has(0x04)) fx.push([0x04, 0]);
      if (st.slide && !has(0x0a)) fx.push([0x0a, 0]);
      st.acc = fx.some(([c, x]) => c === 0x12 && x !== 28);
      st.vib = fx.some(([c, x]) => c === 0x04 && x !== 0);
      st.slide = fx.some(([c, x]) => c === 0x0a && x !== 0);
      if (n === 'OFF') { p.put(NEO.FM1, o + r, { note: 'OFF', fx }); continue; }
      p.put(NEO.FM1, o + r, { note: n, ins: LEAD, vol: v ?? vol, fx });
      if (o + r + 2 < 32) p.put(NEO.OP1, o + r + 2, { note: n, ins: EXT, vol: echoVol, fx: [[0xed, 2]] });
    }
  }

  // Counter horn on FM 4 (B section), vol 95.
  function horn(p: NeoGeoPattern, o: number, line: Line) {
    for (const [r, n, fx] of line) p.put(NEO.FM4, o + r, { note: n, ins: HORN, vol: 95, fx: fx ?? [] });
  }

  // Danger growl on FM 4: C then C# sliding back down to C (E2 21), keyed off at the end of the bar.
  function growl(p: NeoGeoPattern, o: number) {
    p.put(NEO.FM4, o + 10, { note: 'C-4', ins: GROWL, vol: 95 });
    p.put(NEO.FM4, o + 12, { note: 'C#4', ins: GROWL, vol: 95, fx: [[0xe2, 0x21]] });
    p.put(NEO.FM4, o + 15, { note: 'OFF' });
  }

  // ---- Melodies (all new; the gum hook rhythm 0-3-6-8 appears only in B) ----------------------
  const vib: [number, number] = [0x04, 0x34];
  const melA: Line[] = [
    [[0, 'A-5'], [3, 'A-5'], [6, 'G-5'], [8, 'F-5'], [10, 'G-5'], [11, 'A-5'], [12, 'C-6', [[0x12, 22]]]],
    [[0, 'D-6'], [2, 'C-6'], [4, 'A-5'], [8, 'G-5'], [10, 'F-5'], [12, 'G-5', [vib]]],
    [[0, 'F-5'], [3, 'F-5'], [6, 'D-5'], [8, 'F-5'], [10, 'G-5'], [11, 'A-5'], [12, 'Bb5', [[0x12, 22]]]],
    [[0, 'C-6', [[0x12, 20]]], [4, 'Bb5'], [6, 'A-5'], [8, 'G-5', [vib]], [14, 'E-5']],
    [[0, 'F-5'], [3, 'F-5'], [6, 'E-5'], [8, 'D-5'], [10, 'E-5'], [11, 'F-5'], [12, 'A-5', [[0x12, 22]]]],
    [[0, 'D-6'], [2, 'C-6'], [4, 'Bb5'], [8, 'A-5'], [10, 'G-5'], [12, 'F-5']],
    [[0, 'G-5'], [2, 'Bb5'], [4, 'D-6', [[0x12, 20]]], [6, 'C-6'], [8, 'Bb5'], [10, 'G-5'], [12, 'E-5'], [14, 'G-5']],
    [[0, 'F-5', [[0x03, 0x30]]], [4, 'F-5', [vib]], [12, 'F-5', [[0xe2, 0x32]]], [15, 'OFF']],
  ];
  const melB: Line[] = [
    [[0, 'C-5'], [3, 'F-5'], [6, 'A-5'], [8, 'C-6', [[0x12, 22]]], [10, 'D-6'], [12, 'C-6'], [14, 'A-5']],
    [[0, 'D-5'], [3, 'F-5'], [6, 'Bb5'], [8, 'D-6', [[0x12, 22]]], [12, 'C-6'], [14, 'Bb5']],
    [[0, 'D-5'], [3, 'G-5'], [6, 'Bb5'], [8, 'D-6', [[0x12, 22]]], [12, 'C-6'], [14, 'Bb5']],
    [[0, 'C-6', [[0x12, 22]]], [2, 'Bb5'], [4, 'G-5', [vib]], [10, 'G-5'], [12, 'E-5'], [14, 'G-5']],
    [[0, 'C-5'], [3, 'F-5'], [6, 'A-5'], [8, 'C-6', [[0x12, 20]]], [12, 'F-6', [[0x12, 22]]], [14, 'E-6']],
    [[0, 'F-5'], [3, 'A-5'], [6, 'D-6'], [8, 'F-6', [[0x12, 22]]], [12, 'E-6'], [14, 'D-6']],
    [[0, 'D-6'], [3, 'C-6'], [6, 'Bb5'], [8, 'A-5'], [10, 'G-5'], [12, 'E-5'], [14, 'G-5']],
    [[0, 'F-5', [[0x03, 0x30]]], [3, 'A-5'], [6, 'C-6'], [8, 'A-5', [vib]], [12, 'A-5', [[0xe2, 0x35]]], [15, 'OFF']],
  ];
  const hornB: Line[] = [
    [[0, 'A-4'], [8, 'C-5', [vib]]],
    [[0, 'Bb4', [[0x04, 0]]], [8, 'F-4']],
    [[0, 'G-4'], [8, 'Bb4', [vib]]],
    [[0, 'Bb4', [[0x04, 0]]], [8, 'G-4'], [12, 'E-4']],
    [[0, 'F-4'], [8, 'A-4'], [12, 'C-5']],
    [[0, 'D-5', [vib]], [8, 'A-4', [[0x04, 0]]]],
    [[0, 'F-4'], [8, 'E-4'], [14, 'OFF']],
  ];
  // Breakdown lead: quiet (79-95), each bar swells in with 0A10; the A-major bar climbs out of the danger.
  const melBreak: Line[] = [
    [[0, 'A-5', [[0x0a, 0x10]], 79], [8, 'G-5'], [12, 'F-5'], [14, 'E-5']],
    [[0, 'D-5', [[0x0a, 0x10]], 79], [8, 'F-5'], [12, 'Bb5', [vib]]],
    [[0, 'D-6', [[0x0a, 0x10]], 79], [8, 'C-6'], [10, 'Bb5'], [12, 'G-5'], [14, 'Bb5']],
    [[0, 'C#6'], [6, 'E-5'], [8, 'A-5'], [10, 'C#6'], [12, 'E-6', [[0x12, 22]], 111]],
  ];

  // ---- Bars --------------------------------------------------------------------------------
  type Bar = {
    c: Chord[]; drums?: 'full' | 'sparse' | 'none'; hats16?: boolean; fill?: boolean; push?: boolean;
    bass?: 'full' | 'half' | 'none'; arps?: boolean; stabs?: number[]; stabEcho?: boolean;
    lead?: Line; leadVol?: number; echoVol?: number; growl?: boolean; horn?: Line;
    extra?: (p: NeoGeoPattern, o: number) => void;
  };
  const bars: Bar[] = [];
  // Intro: drums alone, then the bass enters with a snare fill.
  bars.push({ c: [C.F], bass: 'none' });
  bars.push({ c: [C.F], fill: true });
  // Groove: F F Bb C7 with arps; growl pulse on bars 2 and 4.
  [[C.F], [C.F], [C.Bb], [C.C7]].forEach((c, i) => bars.push({ c, arps: true, growl: i % 2 === 1, fill: i === 3 }));
  // Melody A: F F Bb C7 Dm Bb Gm|C7 F. Stabs on the backbeats, growl on bars 2 and 4.
  [[C.F], [C.F], [C.Bb], [C.C7], [C.Dm], [C.Bb], [C.Gm, C.C7], [C.F]].forEach((c, i) =>
    bars.push({ c, arps: true, stabs: [4, 12], lead: melA[i], growl: i === 1 || i === 3, fill: i === 7 }));
  // Gap: bass, drums and arps only; the last bar is a one-note-per-row SSG arpeggio run over C7.
  [[C.F], [C.F], [C.Bb], [C.C7]].forEach((c, i) => bars.push({
    c, arps: i < 3, push: i === 3,
    extra: i === 3 ? (p, o) => ['C-5', 'E-5', 'G-5', 'Bb5', 'C-6', 'E-6', 'G-6', 'Bb6', 'G-6', 'E-6', 'C-6', 'Bb5', 'G-5', 'E-5', 'C-5', 'G-4']
      .forEach((n, r) => p.put(NEO.SSG1, o + r, { note: n, ins: RUN, vol: r < 8 ? 12 + (r % 2) * 2 : 12 })) : undefined,
  }));
  // Melody B: F Bb Gm C7 F Dm Bb|C7 F. 16th hats, echo stabs, counter horn; the last bar is a coin-bell
  // ping-pong instead of the horn.
  [[C.F], [C.Bb], [C.Gm], [C.C7], [C.F], [C.Dm], [C.Bb, C.C7], [C.F]].forEach((c, i) => bars.push({
    c, arps: true, hats16: true, push: i % 2 === 1, stabs: [4, 12], stabEcho: true, lead: melB[i], horn: hornB[i],
    extra: i === 7 ? (p, o) => ['C-6', 'F-6', 'A-6', 'C-7', 'A-6', 'F-6', 'C-6', 'A-5'].forEach((n, k) =>
      p.put(NEO.FM4, o + 8 + k, { note: n, ins: BELL, vol: k % 2 ? 79 : 95, fx: [[0x08, k % 2 ? 0x0f : 0xf0]] })) : undefined,
  }));
  // Breakdown: Dm Bb Gm A. Danger pad swell, buzz bass, half-time slap, sustained op chords, sparse kick with
  // pan ping-pong; the A-major bar builds back up with 16th hats and the full bass.
  const padNotes = ['F-4', 'D-4', 'D-4', 'C#4'];
  [[C.Dm], [C.Bb], [C.Gm], [C.A]].forEach((c, i) => bars.push({
    c, arps: true, bass: i === 3 ? 'full' : 'half', drums: i === 3 ? 'full' : 'sparse', hats16: true, push: i === 3,
    lead: melBreak[i], leadVol: 95, echoVol: 95,
    extra: (p, o) => {
      p.put(NEO.FM4, o, { note: padNotes[i], ins: PAD, vol: 62, fx: i === 0 ? [[0x0a, 0x30], [0x08, 0xff]] : [[0x0a, 0x30]] });
      p.put(NEO.FM4, o + 12, { fx: [[0x0a, 0x00]] });
      c[0].stab.forEach((n, k) => p.put(NEO.OP2 + k, o, { note: n, ins: EXT, vol: 119, fx: k === 2 ? [[0xed, 2]] : [] }));
      c[0].stab.forEach((n, k) => p.put(NEO.OP2 + k, o + 10, { note: n, ins: EXT, vol: 103, fx: [[0xed, k]] }));
      if (i < 3) {
        const buzzRoot = up(c[0].root, 12);
        p.put(NEO.SSG2, o, { note: buzzRoot, ins: BUZZ, fx: i > 0 ? [[0x03, 0x60]] : [] });
        p.put(NEO.SSG2, o + 4, { note: 'OFF' });
        p.put(NEO.SSG2, o + 6, { note: buzzRoot, ins: BUZZ });
        p.put(NEO.SSG2, o + 8, { note: buzzRoot + 7, ins: BUZZ });
        p.put(NEO.SSG2, o + 10, { note: 'OFF' });
        p.put(NEO.SSG2, o + 12, { note: buzzRoot + 12, ins: BUZZ, fx: [[0xec, 3]] });
      }
    },
  }));
  // Turnaround: two bars of C7, 16th drums, stab triplet push, lead pickup, SSG run, kick pan, fill.
  bars.push({
    c: [C.C7], arps: true, hats16: true, push: true, growl: true,
    lead: [[0, 'G-5'], [3, 'Bb5'], [6, 'C-6'], [8, 'E-6', [[0x12, 20]]], [12, 'OFF']],
    extra: (p, o) => {
      p.put(NEO.FM4, o, { note: 'OFF' }); // the breakdown pad (C#) must not ring over C7
      stabs(p, o, [C.C7], [0, 3]);
      stabs(p, o, [C.C7], [6], true);
    },
  });
  bars.push({
    c: [C.C7], hats16: true, fill: true, push: true, stabs: [0, 8], stabEcho: true,
    lead: [[0, 'Bb5'], [4, 'C-6', [vib]], [8, 'OFF']],
    extra: (p, o) => {
      p.put(NEO.SSG1, o, { note: C.C7.arpNote, ins: C.C7.arp, vol: 12 });
      ['C-5', 'D-5', 'E-5', 'F-5', 'G-5', 'A-5', 'Bb5', 'C-6', 'D-6', 'E-6', 'G-6', 'Bb6']
        .forEach((n, k) => p.put(NEO.SSG1, o + 4 + k, { note: n, ins: RUN }));
      p.put(NEO.B, o, { fx: [[0x08, 0xf0]] });
      p.put(NEO.B, o + 6, { fx: [[0x08, 0x0f]] });
      p.put(NEO.B, o + 8, { fx: [[0x08, 0xf0]] });
      p.put(NEO.B, o + 14, { fx: [[0x08, 0x0f]] });
    },
  });

  // ---- Patterns ----------------------------------------------------------------------------
  const order: NeoGeoPattern[] = [];
  for (let pi = 0; pi < bars.length / 2; pi++) {
    const p = s.pattern();
    for (let b = 0; b < 2; b++) {
      const bar = bars[pi * 2 + b], o = b * 16;
      const d = bar.drums ?? 'full';
      if (d === 'full') drums(p, o, { sixteenths: bar.hats16, fill: bar.fill, push: bar.push });
      else if (d === 'sparse') sparseDrums(p, o);
      const bm = bar.bass ?? 'full';
      if (bm !== 'none') bass(p, o, bar.c, bm === 'half', bar.fill);
      if (bar.arps) arps(p, o, bar.c);
      if (bar.stabs) stabs(p, o, bar.c, bar.stabs, bar.stabEcho);
      if (bar.growl) growl(p, o);
      if (bar.horn) horn(p, o, bar.horn);
      bar.extra?.(p, o);
      if (bar.lead) lead(p, o, bar.lead, bar.leadVol, bar.echoVol);
    }
    order.push(p);
  }
  // Intro bar 1: centre the kick (the loop never returns here; order 1 re-centres it below).
  order[0].put(NEO.B, 0, { fx: [[0x08, 0xff]] });
  // Seam: the turnaround ends on the snare fill; SSG 1, SSG 2, FM 4 and the stab ops stop on the jump row, then
  // 0B01 jumps to the groove, which re-centres the kick pan on its first row.
  const last = order[order.length - 1];
  for (const ch of [NEO.SSG1, NEO.FM4, NEO.OP2, NEO.OP3, NEO.OP4]) last.put(ch, 31, { note: 'OFF' });
  last.put(NEO.FM1, 31, { fx: [[0x0b, 1]] });
  order[1].put(NEO.B, 0, { fx: [[0x08, 0xff]] });

  for (const p of order) s.order.push(s.indexOf(p));
  return s;
}
