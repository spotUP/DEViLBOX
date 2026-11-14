/**
 * "crack intro" - a cold A-minor chiptune in the manner of an Amiga crack intro.
 * Speed 6 / tempo 125 (ProTracker defaults, set on the first row): one row is a 16th note at 125 BPM.
 * Channels: 1 bass, 2 arpeggio chords (0xy), 3 lead, 4 drums.
 * Order 0 1 2 3 4 1 5: intro, A, A', B, B', A, A' with the closing fill; B01 loops back to A.
 */
import { Pattern, pulse, saw, triangle, noiseBurst, kick, type ModSongSpec, type ChipSample } from '../compose';

const BASS = 1, ARP = 2, LEAD = 3, SAW = 4, TRI = 5, KICK = 6, SNARE = 7, HAT = 8;
const samples: ChipSample[] = [
  { name: 'square bass', pcm: pulse(64, 0.5), volume: 64, loop: true },
  { name: 'pulse 25', pcm: pulse(32, 0.25), volume: 36, loop: true },
  { name: 'pulse 12', pcm: pulse(32, 0.125), volume: 52, loop: true },
  { name: 'saw', pcm: saw(32), volume: 46, loop: true },
  { name: 'triangle', pcm: triangle(64), volume: 56, loop: true },
  { name: 'kick', pcm: kick(1400, 41, 166), volume: 64, loop: false },
  { name: 'noise snare', pcm: noiseBurst(2200, 500, false, 73), volume: 52, loop: false },
  { name: 'noise hat', pcm: noiseBurst(600, 110, true), volume: 28, loop: false },
];

/** A chord: bass root, the arpeggio's base note, and its 0xy intervals (voiced to move little between chords). */
interface Chord { bass: string; arp: string; fx: string }
const Am: Chord = { bass: 'A-1', arp: 'A-2', fx: '037' };
const F: Chord = { bass: 'F-1', arp: 'F-2', fx: '047' };
const G: Chord = { bass: 'G-1', arp: 'G-2', fx: '047' };
const C: Chord = { bass: 'C-2', arp: 'E-2', fx: '038' };
const E: Chord = { bass: 'E-1', arp: 'G#2', fx: '038' };
const Dm: Chord = { bass: 'D-1', arp: 'A-2', fx: '058' };
const Bb: Chord = { bass: 'A#1', arp: 'A#2', fx: '047' };

const octaveUp = (n: string): string => `${n.slice(0, 2)}${Number(n[2]) + 1}`;
const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');

const TRESILLO = [0, 3, 6, 8, 11, 14];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

/** Gated arpeggio chord: each hit retriggers, the arpeggio runs on the rows between, a C00 gap before the next hit. */
function arpBar(p: Pattern, bar: number, chord: Chord, hits: number[], fadeFrom = -1): void {
  hits.forEach((h, i) => {
    const next = hits[i + 1] ?? 16;
    // A faded hit spends its effect column on Cxx; the arpeggio starts on the next row.
    p.put(1, bar * 16 + h, chord.arp, ARP, fadeFrom >= 0 ? `C${hex2(Math.min(36, fadeFrom + i * 3))}` : chord.fx);
    for (let r = h + 1; r < next; r++) p.put(1, bar * 16 + r, '', 0, next - h >= 3 && r === next - 1 ? 'C00' : chord.fx);
  });
}

/** Driving bass: root on the beat, a short cut octave on the off-beat. */
function bassBar(p: Pattern, bar: number, chord: Chord, style: 'drive' | 'tresillo'): void {
  if (style === 'drive') {
    for (const r of EIGHTHS) {
      if (r % 4 === 0) p.put(0, bar * 16 + r, chord.bass, BASS);
      else p.put(0, bar * 16 + r, octaveUp(chord.bass), BASS, 'EC3');
    }
    p.put(0, bar * 16 + 15, chord.bass, BASS, 'C28');
  } else {
    for (const r of TRESILLO) p.put(0, bar * 16 + r, r === 14 ? octaveUp(chord.bass) : chord.bass, BASS, r === 14 ? 'EC3' : '');
  }
}

function drumBar(p: Pattern, bar: number, style: 'basic' | 'full' | 'half' | 'fill'): void {
  const at = (r: number, inst: number, fx = ''): Pattern =>
    p.put(3, bar * 16 + r, inst === KICK ? 'C-2' : inst === SNARE ? 'A-2' : 'C-3', inst, fx);
  if (style === 'half') {
    at(0, KICK); at(4, HAT); at(8, SNARE); at(10, KICK, 'C30'); at(12, HAT);
    return;
  }
  at(0, KICK); at(4, SNARE); at(8, KICK);
  if (style === 'fill') {
    at(10, SNARE, 'C28'); at(12, SNARE); at(13, SNARE, 'C20'); at(14, SNARE, 'E93'); at(15, SNARE, 'E92');
    return;
  }
  at(12, SNARE);
  if (style === 'full') { at(2, HAT); at(6, HAT, 'C10'); at(10, KICK, 'C30'); at(14, HAT); }
}

/** Lead line: [row, note, effect?]; held notes (4 rows or more) get vibrato from their third row on. */
type LeadNote = [number, string, string?];
function lead(p: Pattern, inst: number, notes: LeadNote[]): void {
  notes.forEach(([row, name, fx], i) => {
    p.put(2, row, name, inst, fx ?? '');
    const next = notes[i + 1]?.[0] ?? 64;
    if (name && next - row >= 4) for (let r = row + 2; r < next; r++) p.put(2, r, '', 0, '446');
  });
}

const THEME_BAR_1: LeadNote[] = [[0, 'A-2'], [6, 'C-3'], [8, 'E-3'], [12, 'D-3'], [14, 'C-3']];
const THEME_BAR_3: LeadNote[] = [[32, 'A-2'], [38, 'C-3'], [40, 'F-3'], [44, 'E-3'], [46, 'C-3']];

function intro(): Pattern {
  const p = new Pattern();
  [Am, Am, F, E].forEach((c, bar) => arpBar(p, bar, c, TRESILLO, bar === 0 ? 6 : bar === 1 ? 22 : -1));
  // Triangle drone under the arpeggio: swells in, then rises into the first A section.
  p.put(2, 0, 'A-2', TRI, 'C00');
  for (let r = 1; r < 12; r++) p.put(2, r, '', 0, 'A01');
  for (let r = 12; r < 32; r++) p.put(2, r, '', 0, '443');
  p.put(2, 32, 'F-2', TRI);
  for (let r = 34; r < 48; r++) p.put(2, r, '', 0, '443');
  p.put(2, 48, 'E-2', TRI);
  for (let r = 50; r < 60; r++) p.put(2, r, '', 0, '443');
  for (let r = 60; r < 64; r++) p.put(2, r, '', 0, '104');
  // Bass and drums arrive for the second half.
  p.put(0, 32, 'F-1', BASS).put(0, 40, 'F-1', BASS).put(0, 46, 'F-2', BASS, 'EC3');
  bassBar(p, 3, E, 'drive');
  for (const r of [34, 38, 42, 46, 50, 54]) p.put(3, r, 'C-3', HAT);
  [8, 12, 20, 28, 36, 44].forEach((v, i) => p.put(3, 56 + i, 'A-2', SNARE, `C${hex2(v)}`));
  p.put(3, 62, 'A-2', SNARE, 'E93').put(3, 63, 'A-2', SNARE, 'E92');
  p.put(3, 0, '', 0, 'F06').put(0, 0, '', 0, 'F7D'); // speed 6, tempo 125
  return p;
}

function sectionA(chords: Chord[], ending: 'G' | 'E', drums: 'basic' | 'full', denseArp: boolean): Pattern {
  const p = new Pattern();
  chords.forEach((c, bar) => {
    arpBar(p, bar, c, denseArp && bar % 2 === 1 ? EIGHTHS : TRESILLO);
    bassBar(p, bar, c, 'drive');
    drumBar(p, bar, bar === 3 ? 'fill' : drums);
  });
  const bar2: LeadNote[] = ending === 'G'
    ? [[16, 'B-2'], [19, 'C-3'], [22, 'A-2'], [28, 'E-2'], [30, 'G-2']]
    : [[16, 'E-3'], [19, 'D-3'], [22, 'C-3'], [28, 'G-2'], [30, 'C-3']];
  const bar4: LeadNote[] = ending === 'G'
    // B slides up to D (3xx), then the line turns back to the tonic.
    ? [[48, 'D-3'], [51, 'B-2'], [54, 'G-2'], [56, 'B-2'], [58, 'D-3', '306'], [59, '', '300'], [60, 'E-3'], [62, 'D-3']]
    // Harmonic-minor close on E: B slides up to E, then the leading tone G# is held.
    : [[48, 'E-3'], [50, 'D-3'], [52, 'B-2'], [54, 'G#2'], [56, 'B-2'], [58, 'E-3', '306'], [59, '', '300'], [60, 'G#3']];
  lead(p, LEAD, [...THEME_BAR_1, ...bar2, ...THEME_BAR_3, ...bar4]);
  return p;
}

function sectionB(second: boolean): Pattern {
  const p = new Pattern();
  [Dm, Am, Bb, E].forEach((c, bar) => {
    arpBar(p, bar, c, second ? EIGHTHS : TRESILLO);
    bassBar(p, bar, c, 'tresillo');
    drumBar(p, bar, bar === 3 && second ? 'fill' : second && bar === 2 ? 'full' : 'half');
  });
  const bar1: LeadNote[] = [[0, 'F-3'], [6, 'E-3'], [8, 'D-3'], [12, 'A-2'], [14, 'D-3']];
  const bar3: LeadNote[] = [[32, 'F-3'], [38, 'D-3'], [40, 'A#2'], [44, 'D-3'], [46, 'F-3']];
  if (!second) {
    lead(p, SAW, [...bar1, [16, 'E-3'], [22, 'C-3'], [24, 'A-2'], [28, 'C-3'], [30, 'E-3'], ...bar3,
      [48, 'E-3'], [54, 'G#2'], [56, 'B-2'], [58, 'D-3'], [60, 'E-3'], [62, '', '103'], [63, '', '103']]);
  } else {
    // Second time: the held notes break into eighth-note runs, the bass dives out of the section.
    lead(p, SAW, [...bar1,
      [16, 'E-3'], [18, 'C-3'], [20, 'A-2'], [22, 'C-3'], [24, 'E-3'], [26, 'A-3'], [28, 'E-3'], [30, 'C-3'], ...bar3,
      [48, 'E-3'], [50, 'G#2'], [52, 'B-2'], [54, 'E-3'], [56, 'G#3'], [58, 'E-3'], [60, 'B-2', 'A04'], [61, '', 'A04'], [62, '', 'A04'], [63, '', 'A04']]);
    for (let r = 59; r < 64; r++) p.clear(0, r);
    p.put(0, 59, 'E-1', BASS);
    for (let r = 60; r < 64; r++) p.put(0, r, '', 0, '208');
  }
  return p;
}

export default function song(): ModSongSpec {
  const closing = sectionA([Am, C, F, E], 'E', 'full', true);
  closing.put(2, 63, '', 0, 'B01'); // loop back to the first A section
  return {
    title: 'crack intro',
    samples,
    patterns: [
      intro(),
      sectionA([Am, Am, F, G], 'G', 'basic', false),
      sectionA([Am, C, F, E], 'E', 'full', false),
      sectionB(false),
      sectionB(true),
      closing,
    ],
    order: [0, 1, 2, 3, 4, 1, 5],
  };
}
