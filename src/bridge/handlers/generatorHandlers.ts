/**
 * MCP Bridge — Generator Handlers
 *
 * Pattern generation (euclidean, bass, drums, arpeggio, melody) and
 * musical transformations (reverse, rotate, invert, transpose).
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import {
  euclideanRhythm,
  getScaleNotes,
  pickScaleNote,
  reverseNotes,
  rotateCells,
  invertNotes,
  detectKey,
  detectScale,
  extractNotes,
} from '../analysis/MusicAnalysis';

// ─── Constants ───────────────────────────────────────────────────────────────

const NOTE_NAMES: Record<string, number> = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

const SCALE_INTERVALS: Record<string, number[]> = {
  major:         [0, 2, 4, 5, 7, 9, 11],
  minor:         [0, 2, 3, 5, 7, 8, 10],
  dorian:        [0, 2, 3, 5, 7, 9, 10],
  phrygian:      [0, 1, 3, 5, 7, 8, 10],
  lydian:        [0, 2, 4, 6, 7, 9, 11],
  mixolydian:    [0, 2, 4, 5, 7, 9, 10],
  pentatonic:    [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues:         [0, 3, 5, 6, 7, 10],
  chromatic:     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function resolveRoot(key: string): number {
  const upper = key.toUpperCase().replace('-', '').replace('B', 'B');
  // Try exact match first
  for (const [name, pc] of Object.entries(NOTE_NAMES)) {
    if (upper === name.toUpperCase()) return pc;
  }
  // Try first character
  const first = upper[0];
  const sharp = upper.length > 1 && upper[1] === '#';
  const base = NOTE_NAMES[first] ?? 0;
  return sharp ? (base + 1) % 12 : base;
}

// ─── Pattern Generation ──────────────────────────────────────────────────────

/** Generate a pattern using various algorithms */
export function generatePattern(params: Record<string, unknown>): Record<string, unknown> {
  try {
    const type = (params.type as string) || 'bass';
    const channel = (params.channel as number) ?? 0;
    const patternIndex = (params.patternIndex as number) ?? 0;
    const instrument = (params.instrument as number) ?? 1;
    const octaveParam = (params.octave as number) ?? 3;
    const density = (params.density as number) ?? 0.5;

    // Resolve key and scale
    let rootPc: number;
    let scaleIntervals: number[];

    const keyParam = params.key as string | undefined;
    const scaleParam = (params.scale as string) || 'minor';

    if (keyParam) {
      rootPc = resolveRoot(keyParam);
      scaleIntervals = SCALE_INTERVALS[scaleParam] || SCALE_INTERVALS.minor;
    } else {
      // Auto-detect from existing song
      const { patterns } = useTrackerStore.getState();
      const allNotes = extractNotes(patterns);
      if (allNotes.length > 10) {
        const detected = detectKey(allNotes);
        rootPc = detected.pitchClass;
        const scaleResult = detectScale(allNotes, rootPc);
        scaleIntervals = SCALE_INTERVALS[scaleResult.name] || SCALE_INTERVALS.minor;
      } else {
        rootPc = 0; // C
        scaleIntervals = SCALE_INTERVALS[scaleParam] || SCALE_INTERVALS.minor;
      }
    }

    const { patterns } = useTrackerStore.getState();
    const pattern = patterns[patternIndex];
    if (!pattern) return { error: `Pattern ${patternIndex} not found` };
    if (channel >= pattern.channels.length) return { error: `Channel ${channel} out of range` };

    const numRows = pattern.length;
    const setCell = useTrackerStore.getState().setCell;

    // Get scale notes in the target octave range
    const scaleNotes = getScaleNotes(rootPc, scaleIntervals, octaveParam - 1, octaveParam + 1);
    const chordTones = [0, scaleIntervals[2] || 4, scaleIntervals[4] || 7]; // 1st, 3rd, 5th

    // Algorithm params
    const algParams = (params.params as Record<string, number>) || {};
    let notesWritten = 0;

    switch (type) {
      case 'bass': {
        // Bass: root on strong beats, occasional 5th/octave, low octave
        const bassNotes = getScaleNotes(rootPc, scaleIntervals, octaveParam - 1, octaveParam);
        const rhythm = euclideanRhythm(numRows, Math.round(numRows * density));
        for (let row = 0; row < numRows; row++) {
          if (rhythm[row]) {
            const note = pickScaleNote(bassNotes, rootPc, [0, 7], 0.7);
            setCell(channel, row, { note, instrument });
            notesWritten++;
          }
        }
        break;
      }

      case 'drums': {
        // Drums: kick on 1/3, snare on 2/4, hats on 8ths/16ths
        // Treat different "notes" as different drum sounds
        const kick = (algParams.kick ?? 36); // C-3
        const snare = (algParams.snare ?? 38); // D-3
        const hihat = (algParams.hihat ?? 42); // F#3
        const rowsPerBeat = algParams.rowsPerBeat ?? 4;

        for (let row = 0; row < numRows; row++) {
          const beatPos = row % (rowsPerBeat * 4); // Position within a 4-beat bar

          if (beatPos === 0 || beatPos === rowsPerBeat * 2) {
            // Kick on beats 1, 3
            setCell(channel, row, { note: kick, instrument });
            notesWritten++;
          } else if (beatPos === rowsPerBeat || beatPos === rowsPerBeat * 3) {
            // Snare on beats 2, 4
            setCell(channel, row, { note: snare, instrument });
            notesWritten++;
          } else if (density > 0.3 && row % 2 === 0) {
            // Hi-hat on 8ths (if density allows)
            setCell(channel, row, { note: hihat, instrument });
            notesWritten++;
          } else if (density > 0.7) {
            // Hi-hat on 16ths (high density)
            setCell(channel, row, { note: hihat, instrument });
            notesWritten++;
          }
        }
        break;
      }

      case 'arpeggio': {
        // Arpeggio: cycle through chord tones at specified rate
        const arpRate = algParams.rate ?? 2; // Notes per beat
        const arpNotes = scaleNotes.filter(n => {
          const interval = ((n - 1) % 12 - rootPc + 12) % 12;
          return chordTones.includes(interval);
        });
        if (arpNotes.length === 0) break;

        let arpIdx = 0;
        for (let row = 0; row < numRows; row++) {
          if (row % Math.max(1, Math.round(4 / arpRate)) === 0) {
            setCell(channel, row, { note: arpNotes[arpIdx % arpNotes.length], instrument });
            arpIdx++;
            notesWritten++;
          }
        }
        break;
      }

      case 'chord': {
        // Chord: stack chord tones on beat positions
        const rowsPerBeat = algParams.rowsPerBeat ?? 4;
        const chordNotes = scaleNotes.filter(n => {
          const interval = ((n - 1) % 12 - rootPc + 12) % 12;
          return chordTones.includes(interval);
        }).slice(0, 4); // Max 4 chord notes

        for (let row = 0; row < numRows; row += rowsPerBeat) {
          // Write first chord note to target channel, rest if channels available
          if (chordNotes.length > 0) {
            setCell(channel, row, { note: chordNotes[0], instrument });
            notesWritten++;
          }
        }
        break;
      }

      case 'melody': {
        // Melody: scale-aware random walk with rhythmic variation
        const rhythm = euclideanRhythm(numRows, Math.round(numRows * density));
        let currentIdx = Math.floor(scaleNotes.length / 2); // Start in middle

        for (let row = 0; row < numRows; row++) {
          if (rhythm[row]) {
            const note = scaleNotes[currentIdx];
            setCell(channel, row, { note, instrument });
            notesWritten++;
            // Random walk: step +/- 1-3 scale degrees
            const step = Math.floor(Math.random() * 3) + 1;
            currentIdx += Math.random() < 0.5 ? step : -step;
            currentIdx = Math.max(0, Math.min(scaleNotes.length - 1, currentIdx));
          }
        }
        break;
      }

      case 'fill':
      case 'euclidean': {
        // Pure euclidean rhythm with scale notes
        const steps = algParams.steps ?? numRows;
        const pulses = algParams.pulses ?? Math.round(steps * density);
        const rhythm = euclideanRhythm(steps, pulses);

        for (let row = 0; row < Math.min(numRows, steps); row++) {
          if (rhythm[row]) {
            const note = pickScaleNote(scaleNotes, rootPc, chordTones, 0.5);
            setCell(channel, row, { note, instrument });
            notesWritten++;
          }
        }
        break;
      }

      default:
        return { error: `Unknown generator type: ${type}` };
    }

    return { ok: true, notesWritten, type, channel, patternIndex, key: Object.keys(NOTE_NAMES).find(k => NOTE_NAMES[k] === rootPc) || 'C', scale: scaleParam };
  } catch (e) {
    return { error: `generatePattern failed: ${(e as Error).message}` };
  }
}

// ─── Pattern Transformations ─────────────────────────────────────────────────

/** Apply musical transformations to a channel in a pattern */
export function transformPattern(params: Record<string, unknown>): Record<string, unknown> {
  try {
    const patternIndex = (params.patternIndex as number) ?? 0;
    const channel = (params.channel as number) ?? 0;
    const operation = (params.operation as string) || 'reverse';
    const transformParams = (params.params as Record<string, number>) || {};

    const { patterns } = useTrackerStore.getState();
    const pattern = patterns[patternIndex];
    if (!pattern) return { error: `Pattern ${patternIndex} not found` };
    if (channel >= pattern.channels.length) return { error: `Channel ${channel} out of range` };

    const cells = pattern.channels[channel].rows;
    const setCell = useTrackerStore.getState().setCell;
    let cellsModified = 0;

    switch (operation) {
      case 'reverse': {
        const reversed = reverseNotes(cells);
        for (let row = 0; row < reversed.length; row++) {
          if (reversed[row].note !== cells[row].note) {
            setCell(channel, row, { note: reversed[row].note });
            cellsModified++;
          }
        }
        break;
      }

      case 'rotate': {
        const amount = transformParams.amount ?? 4;
        const rotated = rotateCells(cells, amount);
        for (let row = 0; row < rotated.length; row++) {
          if (rotated[row].note !== cells[row].note || rotated[row].instrument !== cells[row].instrument) {
            setCell(channel, row, {
              note: rotated[row].note,
              instrument: rotated[row].instrument,
              volume: rotated[row].volume,
            });
            cellsModified++;
          }
        }
        break;
      }

      case 'invert': {
        // Invert around pivot note (default: average note in channel)
        const notes = cells.filter(c => c.note >= 1 && c.note <= 96).map(c => c.note);
        const pivot = transformParams.pivot ?? (notes.length > 0
          ? Math.round(notes.reduce((s, n) => s + n, 0) / notes.length)
          : 48);
        const inverted = invertNotes(cells, pivot);
        for (let row = 0; row < inverted.length; row++) {
          if (inverted[row].note !== cells[row].note) {
            setCell(channel, row, { note: inverted[row].note });
            cellsModified++;
          }
        }
        break;
      }

      case 'transpose': {
        const semitones = transformParams.semitones ?? 0;
        for (let row = 0; row < cells.length; row++) {
          const cell = cells[row];
          if (cell.note >= 1 && cell.note <= 96) {
            const newNote = Math.max(1, Math.min(96, cell.note + semitones));
            if (newNote !== cell.note) {
              setCell(channel, row, { note: newNote });
              cellsModified++;
            }
          }
        }
        break;
      }

      case 'retrograde': {
        // Reverse note order but keep rhythm (note positions stay the same)
        const noteValues = cells.filter(c => c.note >= 1 && c.note <= 96).map(c => c.note);
        noteValues.reverse();
        let idx = 0;
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            if (noteValues[idx] !== cells[row].note) {
              setCell(channel, row, { note: noteValues[idx] });
              cellsModified++;
            }
            idx++;
          }
        }
        break;
      }

      case 'augment': {
        // Double note durations (spread notes apart)
        const noteRows: Array<{ row: number; note: number; instrument: number }> = [];
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            noteRows.push({ row, note: cells[row].note, instrument: cells[row].instrument });
          }
        }
        // Clear channel first
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            setCell(channel, row, { note: 0, instrument: 0 });
            cellsModified++;
          }
        }
        // Write at doubled positions
        for (let i = 0; i < noteRows.length; i++) {
          const newRow = i * 2 * (noteRows[1]?.row - noteRows[0]?.row || 1);
          if (newRow < cells.length) {
            setCell(channel, newRow, { note: noteRows[i].note, instrument: noteRows[i].instrument });
          }
        }
        break;
      }

      case 'diminish': {
        // Halve note durations (compress notes together)
        const noteRows2: Array<{ row: number; note: number; instrument: number }> = [];
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            noteRows2.push({ row, note: cells[row].note, instrument: cells[row].instrument });
          }
        }
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96) {
            setCell(channel, row, { note: 0, instrument: 0 });
            cellsModified++;
          }
        }
        for (let i = 0; i < noteRows2.length; i++) {
          const newRow = Math.round(i * 0.5 * (noteRows2[1]?.row - noteRows2[0]?.row || 2));
          if (newRow < cells.length) {
            setCell(channel, newRow, { note: noteRows2[i].note, instrument: noteRows2[i].instrument });
          }
        }
        break;
      }

      case 'humanize': {
        // Random velocity variation
        const amount = transformParams.amount ?? 0.2;
        for (let row = 0; row < cells.length; row++) {
          if (cells[row].note >= 1 && cells[row].note <= 96 && cells[row].volume > 0) {
            const variation = 1 + (Math.random() * 2 - 1) * amount;
            const newVol = Math.max(1, Math.min(255, Math.round(cells[row].volume * variation)));
            if (newVol !== cells[row].volume) {
              setCell(channel, row, { volume: newVol });
              cellsModified++;
            }
          }
        }
        break;
      }

      default:
        return { error: `Unknown transform: ${operation}` };
    }

    return { ok: true, cellsModified, operation, channel, patternIndex };
  } catch (e) {
    return { error: `transformPattern failed: ${(e as Error).message}` };
  }
}
