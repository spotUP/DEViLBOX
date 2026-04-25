/**
 * MusicAnalysis — Key detection, scale detection, chord analysis, channel classification.
 *
 * Uses Krumhansl-Schmuckler key-finding algorithm for key detection,
 * interval histogram analysis for scale detection, and heuristics for
 * channel role classification.
 *
 * Note encoding: 1-96 where 1=C-0, 2=C#0, ..., 12=B-0, 13=C-1, etc.
 * Pitch class = (note - 1) % 12, Octave = Math.floor((note - 1) / 12)
 */

import type { Pattern, TrackerCell } from '../../types/tracker';

// ─── Constants ───────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles (correlation weights)
// From Krumhansl (1990) "Cognitive Foundations of Musical Pitch"
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Scale templates (pitch class sets)
const SCALES: Record<string, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:    [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:     [0, 2, 3, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor:  [0, 2, 4, 7, 9],
  pentatonicMinor:  [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Chord templates (intervals from root)
const CHORD_TEMPLATES: Record<string, number[]> = {
  'maj':  [0, 4, 7],
  'min':  [0, 3, 7],
  'dim':  [0, 3, 6],
  'aug':  [0, 4, 8],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  '7':    [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'min7': [0, 3, 7, 10],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pitchClass(note: number): number {
  return (note - 1) % 12;
}

function octave(note: number): number {
  return Math.floor((note - 1) / 12);
}

function noteName(pc: number): string {
  return NOTE_NAMES[pc % 12];
}

/** Extract all valid notes (1-96) from patterns */
export function extractNotes(patterns: Pattern[]): number[] {
  const notes: number[] = [];
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.note >= 1 && cell.note <= 96) {
          notes.push(cell.note);
        }
      }
    }
  }
  return notes;
}

/** Extract notes per channel */
function extractNotesPerChannel(patterns: Pattern[]): Map<number, number[]> {
  const channelNotes = new Map<number, number[]>();
  for (const pattern of patterns) {
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const existing = channelNotes.get(ch) || [];
      for (const cell of pattern.channels[ch].rows) {
        if (cell.note >= 1 && cell.note <= 96) {
          existing.push(cell.note);
        }
      }
      channelNotes.set(ch, existing);
    }
  }
  return channelNotes;
}

/** Build pitch class histogram (12 bins, normalized to sum=1) */
function pitchClassHistogram(notes: number[]): number[] {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pitchClass(n)]++;
  const total = notes.length || 1;
  return hist.map(v => v / total);
}

/** Pearson correlation between two arrays */
function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// ─── Key Detection (Krumhansl-Schmuckler) ────────────────────────────────────

export interface KeyResult {
  key: string;       // e.g., "C minor"
  root: string;      // e.g., "C"
  mode: string;      // "major" or "minor"
  confidence: number; // Correlation coefficient (0-1)
  pitchClass: number; // Root pitch class (0-11)
  allKeys: Array<{ key: string; confidence: number }>; // All 24 keys ranked
}

export function detectKey(notes: number[]): KeyResult {
  if (notes.length === 0) {
    return { key: 'Unknown', root: '?', mode: 'unknown', confidence: 0, pitchClass: 0, allKeys: [] };
  }

  const hist = pitchClassHistogram(notes);
  const results: Array<{ key: string; root: string; mode: string; confidence: number; pc: number }> = [];

  for (let root = 0; root < 12; root++) {
    // Rotate histogram so root is at index 0
    const rotated = hist.map((_, i) => hist[(i + root) % 12]);

    const majCorr = correlation(rotated, MAJOR_PROFILE);
    const minCorr = correlation(rotated, MINOR_PROFILE);

    results.push({
      key: `${noteName(root)} major`, root: noteName(root), mode: 'major',
      confidence: majCorr, pc: root,
    });
    results.push({
      key: `${noteName(root)} minor`, root: noteName(root), mode: 'minor',
      confidence: minCorr, pc: root,
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];

  return {
    key: best.key,
    root: best.root,
    mode: best.mode,
    confidence: +best.confidence.toFixed(4),
    pitchClass: best.pc,
    allKeys: results.slice(0, 6).map(r => ({ key: r.key, confidence: +r.confidence.toFixed(4) })),
  };
}

// ─── Scale Detection ─────────────────────────────────────────────────────────

export interface ScaleResult {
  name: string;
  intervals: number[];
  coverage: number;  // Fraction of notes that fit the scale
  outOfScale: number; // Count of notes outside the scale
}

export function detectScale(notes: number[], rootPc: number): ScaleResult {
  if (notes.length === 0) {
    return { name: 'unknown', intervals: [], coverage: 0, outOfScale: 0 };
  }

  let bestScale = '';
  let bestCoverage = 0;
  let bestIntervals: number[] = [];
  let bestOutOfScale = 0;

  for (const [name, intervals] of Object.entries(SCALES)) {
    // Transpose intervals to root
    const scaleSet = new Set(intervals.map(i => (i + rootPc) % 12));
    let inScale = 0;
    for (const n of notes) {
      if (scaleSet.has(pitchClass(n))) inScale++;
    }
    const coverage = inScale / notes.length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestScale = name;
      bestIntervals = intervals;
      bestOutOfScale = notes.length - inScale;
    }
  }

  return {
    name: bestScale,
    intervals: bestIntervals,
    coverage: +bestCoverage.toFixed(4),
    outOfScale: bestOutOfScale,
  };
}

// ─── Chord Detection ─────────────────────────────────────────────────────────

export function detectChord(pitchClasses: number[]): string {
  if (pitchClasses.length < 2) return '';

  const unique = [...new Set(pitchClasses)].sort((a, b) => a - b);
  if (unique.length < 2) return '';

  let bestMatch = '';
  let bestScore = 0;

  for (const root of unique) {
    const intervals = unique.map(pc => (pc - root + 12) % 12).sort((a, b) => a - b);

    for (const [name, template] of Object.entries(CHORD_TEMPLATES)) {
      let matches = 0;
      for (const interval of intervals) {
        if (template.includes(interval)) matches++;
      }
      const score = matches / Math.max(template.length, intervals.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = `${noteName(root)}${name === 'maj' ? '' : name}`;
      }
    }
  }

  return bestScore >= 0.6 ? bestMatch : '';
}

// ─── Channel Role Classification ─────────────────────────────────────────────

export type ChannelRole = 'bass' | 'lead' | 'chord' | 'percussion' | 'arpeggio' | 'pad' | 'empty' | 'skank';

export interface ChannelAnalysis {
  channel: number;
  role: ChannelRole;
  noteCount: number;
  avgOctave: number;
  avgPitch: number;
  density: number;       // Notes per row (0-1)
  uniqueNotes: number;
  pitchRange: number;    // Semitone range
  avgInterval: number;   // Average semitone distance between consecutive notes
}

export function classifyChannel(channelIndex: number, notes: number[], totalRows: number): ChannelAnalysis {
  const result: ChannelAnalysis = {
    channel: channelIndex,
    role: 'empty',
    noteCount: notes.length,
    avgOctave: 0,
    avgPitch: 0,
    density: 0,
    uniqueNotes: 0,
    pitchRange: 0,
    avgInterval: 0,
  };

  if (notes.length === 0) return result;

  // Basic stats
  const octaves = notes.map(n => octave(n));
  result.avgOctave = +(octaves.reduce((s, v) => s + v, 0) / notes.length).toFixed(2);
  result.avgPitch = +(notes.reduce((s, v) => s + v, 0) / notes.length).toFixed(2);
  result.density = +(notes.length / Math.max(totalRows, 1)).toFixed(4);
  result.uniqueNotes = new Set(notes.map(n => pitchClass(n))).size;
  result.pitchRange = Math.max(...notes) - Math.min(...notes);

  // Average interval between consecutive notes
  let intervalSum = 0;
  for (let i = 1; i < notes.length; i++) {
    intervalSum += Math.abs(notes[i] - notes[i - 1]);
  }
  result.avgInterval = notes.length > 1 ? +(intervalSum / (notes.length - 1)).toFixed(2) : 0;

  // Classification heuristics
  if (result.avgOctave <= 2.5 && result.uniqueNotes <= 4 && result.avgInterval <= 7) {
    result.role = 'bass';
  } else if (result.density >= 0.6 && result.avgInterval <= 4 && result.uniqueNotes <= 6) {
    result.role = 'arpeggio';
  } else if (result.density >= 0.3 && result.avgInterval >= 5 && result.avgOctave >= 3.5) {
    result.role = 'lead';
  } else if (result.uniqueNotes <= 3 && result.pitchRange <= 12) {
    result.role = 'pad';
  } else if (result.uniqueNotes >= 3 && result.avgInterval <= 5) {
    result.role = 'chord';
  } else if (notes.length > 0) {
    // Default: classify by octave
    result.role = result.avgOctave < 3 ? 'bass' : result.avgOctave > 4 ? 'lead' : 'chord';
  }

  return result;
}

/**
 * Detect reggae/dub skank patterns from raw row occupancy.
 *
 * A skank is characterized by off-beat placement: notes fall predominantly on
 * beats 2/4 (or the "and" beats) rather than the downbeat. We test multiple
 * bar-unit hypotheses (8 / 16 / 32 rows) and pick the strongest signal.
 *
 * Returns a confidence score (0..1). Caller should treat >= 0.65 as a skank.
 *
 * @param noteRows - array of row indices where notes occur (from pattern data)
 * @param totalRows - total rows in the pattern
 */
export function detectSkankPattern(noteRows: number[], totalRows: number): number {
  if (noteRows.length < 4) return 0;

  // Try bar lengths of 8, 16, 32 rows. For each, compute "upbeat fraction":
  // fraction of hits that fall in the SECOND half of each beat unit (i.e.
  // the off-beat / backbeat position). A strong skank shows upbeat > 0.65.
  const candidates = [8, 16, 32].filter(n => n <= totalRows);
  if (candidates.length === 0) return 0;

  let bestScore = 0;
  for (const barLen of candidates) {
    const half = barLen / 2;
    let upbeats = 0;
    let downbeats = 0;
    for (const row of noteRows) {
      const pos = row % barLen;
      if (pos < half) downbeats++; else upbeats++;
    }
    const total = upbeats + downbeats;
    if (total === 0) continue;

    // Additional check: are the upbeat hits CONSISTENT (not random scatter)?
    // Measure how many unique positions are hit vs how many hits — low unique/hit
    // ratio → consistent off-beat rhythm, high ratio → random (pad/lead scatter).
    const upbeatRows = noteRows.filter(r => (r % barLen) >= half);
    const uniqueUpbeatPos = new Set(upbeatRows.map(r => r % barLen)).size;
    const consistency = upbeatRows.length > 0 ? 1 - (uniqueUpbeatPos / upbeatRows.length) : 0;

    const upbeatRatio = upbeats / total;
    // Score: fraction off-beat × consistency. Max ~0.95 on a perfect 2+4 skank.
    const score = upbeatRatio * (0.5 + 0.5 * consistency);
    if (score > bestScore) bestScore = score;
  }
  return +(bestScore).toFixed(3);
}

/**
 * Classify every channel of a pattern in one pass. Post-processes
 * `classifyChannel`'s output with percussion heuristics — the base routine
 * has no 'percussion' branch, so we detect it from channel name (/noi|drum|
 * perc|hat|kick|snare|clap/) or statistical density (many short-interval
 * notes on few unique pitches = drum-like).
 *
 * Memoized by Pattern identity (WeakMap). Tracker store edits through immer
 * produce new Pattern objects, so the cache auto-invalidates on edit.
 */
const _patternCache = new WeakMap<Pattern, ChannelAnalysis[]>();

export function classifyPattern(pattern: Pattern): ChannelAnalysis[] {
  const cached = _patternCache.get(pattern);
  if (cached) return cached;

  const numRows = pattern.channels[0]?.rows.length || 0;
  const result: ChannelAnalysis[] = pattern.channels.map((ch, i) => {
    const notes: number[] = [];
    for (const cell of ch.rows) {
      if (cell && cell.note >= 1 && cell.note <= 96) notes.push(cell.note);
    }
    const analysis = classifyChannel(i, notes, numRows);
    if (analysis.role === 'empty') return analysis;
    if (isPercussionChannel(ch, analysis)) {
      analysis.role = 'percussion';
    }
    return analysis;
  });

  _patternCache.set(pattern, result);
  return result;
}

export const PERCUSSION_NAME_RE = /noi|noise|drum|perc|kit|hat|kick|snare|clap|cymbal|tom|ride/i;

function isPercussionChannel(
  ch: { name?: string; shortName?: string; channelMeta?: { hardwareName?: string } },
  analysis: ChannelAnalysis,
): boolean {
  if (ch.name && PERCUSSION_NAME_RE.test(ch.name)) return true;
  if (ch.shortName && PERCUSSION_NAME_RE.test(ch.shortName)) return true;
  if (ch.channelMeta?.hardwareName && PERCUSSION_NAME_RE.test(ch.channelMeta.hardwareName)) return true;
  // Statistical: many notes, tightly spaced pitches, few unique pitches —
  // looks like a drum pattern (kick/snare/hat rotating on one-two pitches).
  if (analysis.density >= 0.4
      && analysis.avgInterval <= 2.5
      && analysis.uniqueNotes <= 3
      && analysis.noteCount >= 4) {
    return true;
  }
  return false;
}

// ─── Chord Progression Detection ─────────────────────────────────────────────

export function detectChordProgression(
  patterns: Pattern[],
  _beatsPerRow: number = 1,
  rowsPerBeat: number = 4,
): string[] {
  const chords: string[] = [];

  for (const pattern of patterns) {
    const numRows = pattern.channels[0]?.rows.length || 0;

    for (let row = 0; row < numRows; row += rowsPerBeat) {
      // Collect all notes sounding at this beat
      const pcs: number[] = [];
      for (const channel of pattern.channels) {
        const cell = channel.rows[row];
        if (cell && cell.note >= 1 && cell.note <= 96) {
          pcs.push(pitchClass(cell.note));
        }
      }
      const chord = detectChord(pcs);
      if (chord && (chords.length === 0 || chords[chords.length - 1] !== chord)) {
        chords.push(chord);
      }
    }
  }

  return chords;
}

/**
 * Row-indexed variant of detectChordProgression. For a single pattern,
 * returns every row where the harmony CHANGES relative to the prior
 * sampled row — i.e. the musical "turnaround" moments where a cut or
 * phrase-boundary transition should land (or avoid).
 *
 * Rows that don't contain chord-defining notes (silence, percussion-only
 * rows) are skipped rather than counted as "no chord" — so a silent row
 * between two identical chords doesn't falsely register as a change.
 *
 * Scans every `rowsPerBeat` rows (default 4, matching detectChordProgression).
 * Used by Auto-DJ Smart Cuts to avoid firing a hard cut in the middle
 * of a chord transition.
 */
export function detectChordChangeRows(
  pattern: Pattern,
  rowsPerBeat: number = 4,
): Array<{ row: number; chord: string }> {
  const changes: Array<{ row: number; chord: string }> = [];
  const numRows = pattern.channels[0]?.rows.length || 0;
  let lastChord: string | null = null;

  for (let row = 0; row < numRows; row += rowsPerBeat) {
    const pcs: number[] = [];
    for (const channel of pattern.channels) {
      const cell = channel.rows[row];
      if (cell && cell.note >= 1 && cell.note <= 96) {
        pcs.push(pitchClass(cell.note));
      }
    }
    const chord = detectChord(pcs);
    if (!chord) continue;
    if (lastChord === null || chord !== lastChord) {
      changes.push({ row, chord });
      lastChord = chord;
    }
  }

  return changes;
}

// ─── Note Distribution ──────────────────────────────────────────────────────

export function getNoteDistribution(notes: number[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const n of notes) {
    const name = noteName(pitchClass(n));
    dist[name] = (dist[name] || 0) + 1;
  }
  return dist;
}

// ─── Full Song Analysis ──────────────────────────────────────────────────────

export interface SongAnalysis {
  key: KeyResult;
  scale: ScaleResult;
  noteDistribution: Record<string, number>;
  totalNotes: number;
  uniquePitchClasses: number;
  channelAnalysis: ChannelAnalysis[];
  chordProgression: string[];
  usedInstruments: number[];
}

export function analyzeSong(patterns: Pattern[]): SongAnalysis {
  const allNotes = extractNotes(patterns);
  const channelNotes = extractNotesPerChannel(patterns);
  const key = detectKey(allNotes);
  const scale = detectScale(allNotes, key.pitchClass);

  // Total rows across all patterns (for density calculation)
  let totalRows = 0;
  for (const p of patterns) totalRows += p.channels[0]?.rows.length || 0;

  // Channel analysis
  const channelAnalysis: ChannelAnalysis[] = [];
  for (const [ch, notes] of channelNotes) {
    channelAnalysis.push(classifyChannel(ch, notes, totalRows));
  }

  // Used instruments
  const instruments = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument > 0) instruments.add(cell.instrument);
      }
    }
  }

  return {
    key,
    scale,
    noteDistribution: getNoteDistribution(allNotes),
    totalNotes: allNotes.length,
    uniquePitchClasses: new Set(allNotes.map(n => pitchClass(n))).size,
    channelAnalysis,
    chordProgression: detectChordProgression(patterns),
    usedInstruments: [...instruments].sort((a, b) => a - b),
  };
}

// ─── Pattern Generation ──────────────────────────────────────────────────────

/** Bjorklund's algorithm for Euclidean rhythm generation */
export function euclideanRhythm(steps: number, pulses: number): boolean[] {
  if (pulses >= steps) return new Array(steps).fill(true);
  if (pulses <= 0) return new Array(steps).fill(false);

  let pattern: number[][] = [];
  for (let i = 0; i < steps; i++) {
    pattern.push(i < pulses ? [1] : [0]);
  }

  let level = 0;
  while (true) {
    const newPattern: number[][] = [];
    const remainder = pattern.filter(p => p[0] === 0);
    const front = pattern.filter(p => p[0] === 1);

    if (remainder.length <= 1) break;

    const minLen = Math.min(front.length, remainder.length);
    for (let i = 0; i < minLen; i++) {
      newPattern.push([...front[i], ...remainder[i]]);
    }
    // Append leftovers
    for (let i = minLen; i < front.length; i++) newPattern.push(front[i]);
    for (let i = minLen; i < remainder.length; i++) newPattern.push(remainder[i]);

    pattern = newPattern;
    level++;
    if (level > 32) break; // Safety
  }

  return pattern.flat().map(v => v === 1);
}

/** Get scale notes in a given octave range */
export function getScaleNotes(
  rootPc: number,
  scaleIntervals: number[],
  octaveLow: number,
  octaveHigh: number,
): number[] {
  const notes: number[] = [];
  for (let oct = octaveLow; oct <= octaveHigh; oct++) {
    for (const interval of scaleIntervals) {
      const note = oct * 12 + 1 + ((rootPc + interval) % 12);
      if (note >= 1 && note <= 96) notes.push(note);
    }
  }
  return notes.sort((a, b) => a - b);
}

/** Pick a random note from the scale, weighted toward chord tones */
export function pickScaleNote(
  scaleNotes: number[],
  rootPc: number,
  preferredIntervals: number[] = [0, 4, 7], // Root, major 3rd, 5th
  chordWeight: number = 0.6,
): number {
  if (scaleNotes.length === 0) return 1;

  const chordNotes = scaleNotes.filter(n => {
    const interval = (pitchClass(n) - rootPc + 12) % 12;
    return preferredIntervals.includes(interval);
  });

  if (chordNotes.length > 0 && Math.random() < chordWeight) {
    return chordNotes[Math.floor(Math.random() * chordNotes.length)];
  }
  return scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
}

// ─── Pattern Transformations ─────────────────────────────────────────────────

/** Reverse the note order within a channel (keep empty cells in place) */
export function reverseNotes(cells: TrackerCell[]): TrackerCell[] {
  const notes = cells.filter(c => c.note >= 1 && c.note <= 96);
  notes.reverse();
  let noteIdx = 0;
  return cells.map(c => {
    if (c.note >= 1 && c.note <= 96 && noteIdx < notes.length) {
      return { ...c, note: notes[noteIdx++].note };
    }
    return c;
  });
}

/** Rotate cells by N positions (circular shift) */
export function rotateCells(cells: TrackerCell[], amount: number): TrackerCell[] {
  const len = cells.length;
  if (len === 0) return cells;
  const shift = ((amount % len) + len) % len;
  return [...cells.slice(len - shift), ...cells.slice(0, len - shift)];
}

/** Invert intervals around a pivot note */
export function invertNotes(cells: TrackerCell[], pivotNote: number): TrackerCell[] {
  return cells.map(c => {
    if (c.note >= 1 && c.note <= 96) {
      const inverted = 2 * pivotNote - c.note;
      const clamped = Math.max(1, Math.min(96, inverted));
      return { ...c, note: clamped };
    }
    return c;
  });
}
