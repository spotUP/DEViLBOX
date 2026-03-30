/**
 * MIDI Importer — Standard MIDI Files (.mid/.midi) → tracker patterns
 *
 * All MIDI tracks become channels within the same pattern(s).  Long songs are
 * split into sequential patterns of `defaultPatternLength` rows, chained via
 * song positions.  Percussion tracks (MIDI ch 10) are expanded to one channel
 * per unique drum note.
 */

import { Midi } from '@tonejs/midi';
import type { Pattern, TrackerCell, ChannelData } from '@typedefs/tracker';
import { midiToXMNote } from '../xmConversions';
import { gmProgramToInstrument, gmPercussionNoteToInstrument } from './GMSoundBank';
import type { InstrumentConfig } from '@typedefs/instrument';

function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface MIDIImportOptions {
  quantize?: number;
  /** @deprecated ignored — tracks are always merged as channels */
  mergeChannels?: boolean;
  velocityToVolume?: boolean;
  defaultPatternLength?: number;
}

const DEFAULT_OPTIONS: Required<Omit<MIDIImportOptions, 'mergeChannels'>> = {
  quantize: 1,
  velocityToVolume: true,
  defaultPatternLength: 64,
};

export interface MIDIImportResult {
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  bpm: number;
  timeSignature: [number, number];
  metadata: {
    name: string;
    tracks: number;
    totalTicks: number;
  };
}

/**
 * Import a MIDI file and convert to tracker patterns.
 *
 * Every MIDI track becomes one or more tracker channels within the same
 * pattern(s).  Songs longer than `defaultPatternLength` rows are split into
 * sequential patterns chained via the song-position list.
 */
export async function importMIDIFile(
  file: File,
  options: Partial<MIDIImportOptions> = {}
): Promise<MIDIImportResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const ppq = midi.header.ppq || 480;
  if (ppq === 0) throw new Error('Invalid MIDI file: PPQ cannot be zero');

  const bpm = midi.header.tempos.length > 0
    ? Math.round(midi.header.tempos[0].bpm)
    : 120;

  const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
    ? [midi.header.timeSignatures[0].timeSignature[0],
       midi.header.timeSignatures[0].timeSignature[1]]
    : [4, 4];

  const rowsPerBeat = 4;

  // ── Build full-length channel data for every track ────────────────────

  const instruments: InstrumentConfig[] = [];
  const fullChannels: FullChannel[] = [];
  let nextInstId = 1;

  // Calculate total rows from all notes across all tracks
  let maxTick = 0;
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      const endTick = note.ticks + note.durationTicks;
      if (endTick > maxTick) maxTick = endTick;
    }
  }
  // Fit total rows to content, rounded up to nearest 16 (1 bar at 4 rows/beat)
  const contentRows = Math.ceil((maxTick / ppq) * rowsPerBeat);
  const totalRows = Math.max(16, Math.ceil(contentRows / 16) * 16);

  // Non-percussion tracks — one channel each
  for (let ti = 0; ti < midi.tracks.length; ti++) {
    const track = midi.tracks[ti];
    if (track.notes.length === 0 || track.instrument.percussion) continue;

    const instId = nextInstId++;
    instruments.push(gmProgramToInstrument(track.instrument.number, instId, false));

    const rows = makeEmptyRows(totalRows);
    for (const note of track.notes) {
      placeNote(rows, note, instId, ppq, rowsPerBeat, opts);
    }
    fullChannels.push({
      name: track.name || `Track ${ti + 1}`,
      instId,
      rows,
    });
  }

  // Percussion tracks — one channel per unique drum note
  for (let ti = 0; ti < midi.tracks.length; ti++) {
    const track = midi.tracks[ti];
    if (track.notes.length === 0 || !track.instrument.percussion) continue;

    const groups = new Map<number, typeof track.notes>();
    for (const note of track.notes) {
      if (!groups.has(note.midi)) groups.set(note.midi, []);
      groups.get(note.midi)!.push(note);
    }

    for (const [midiNote, hits] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      const instId = nextInstId++;
      const inst = gmPercussionNoteToInstrument(midiNote, instId);
      instruments.push(inst);

      const rows = makeEmptyRows(totalRows);
      for (const hit of hits) {
        const row = tickToRow(hit.ticks, ppq, rowsPerBeat, opts.quantize);
        if (row < 0 || row >= totalRows) continue;
        rows[row].note = 1; // trigger (drum machines ignore pitch)
        rows[row].instrument = instId;
        if (opts.velocityToVolume) {
          rows[row].volume = 0x10 + Math.round(velocityToVolume(hit.velocity * 127));
        }
      }
      fullChannels.push({ name: inst.name, instId, rows });
    }
  }

  // ── Split full-length channels into patterns ──────────────────────────

  const patLen = opts.defaultPatternLength;
  const numPatterns = Math.max(1, Math.ceil(totalRows / patLen));
  const patterns: Pattern[] = [];
  const songName = midi.name || file.name.replace(/\.[^/.]+$/, '');

  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * patLen;
    const endRow = Math.min(startRow + patLen, totalRows);
    const thisLen = endRow - startRow;

    const channels: ChannelData[] = fullChannels.map((fc) => ({
      id: generateId('channel'),
      name: fc.name,
      instrumentId: fc.instId,
      color: null,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 80,
      pan: 0,
      rows: fc.rows.slice(startRow, endRow),
    }));

    patterns.push({
      id: generateId('pattern'),
      name: numPatterns === 1
        ? songName
        : `${songName} (${p + 1}/${numPatterns})`,
      length: thisLen,
      channels,
    });
  }

  // Fallback: empty pattern if the MIDI had no usable tracks
  if (patterns.length === 0) {
    patterns.push({
      id: generateId('pattern'),
      name: songName || 'Empty MIDI',
      length: opts.defaultPatternLength,
      channels: [],
    });
  }

  return {
    patterns,
    instruments,
    bpm,
    timeSignature,
    metadata: {
      name: songName,
      tracks: midi.tracks.length,
      totalTicks: midi.durationTicks,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface FullChannel {
  name: string;
  instId: number;
  rows: TrackerCell[];
}

function makeEmptyRows(length: number): TrackerCell[] {
  return Array.from({ length }, () => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));
}

/** Place a melodic note (+ note-off) into a row array. */
function placeNote(
  rows: TrackerCell[],
  note: { midi: number; velocity: number; ticks: number; durationTicks: number },
  instId: number,
  ppq: number,
  rowsPerBeat: number,
  opts: { quantize?: number; velocityToVolume?: boolean },
): void {
  const row = tickToRow(note.ticks, ppq, rowsPerBeat, opts.quantize);
  if (row < 0 || row >= rows.length) return;

  const xmNote = midiToXMNote(note.midi);
  if (!xmNote) return;

  rows[row].note = xmNote;
  rows[row].instrument = instId;

  if (opts.velocityToVolume) {
    rows[row].volume = 0x10 + Math.round(velocityToVolume(note.velocity * 127));
  }

  // Note-off at end of duration
  const endRow = tickToRow(note.ticks + note.durationTicks, ppq, rowsPerBeat, opts.quantize);
  if (endRow > row && endRow < rows.length) {
    rows[endRow].note = 97; // XM note-off
  }
}

function tickToRow(tick: number, ppq: number, rowsPerBeat: number, quantize = 0): number {
  if (ppq === 0) return 0;
  const row = Math.round((tick / ppq) * rowsPerBeat);
  return quantize > 0 ? Math.round(row / quantize) * quantize : row;
}

function velocityToVolume(velocity: number): number {
  return (velocity / 127) * 0x40;
}

export function isMIDIFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext === '.mid' || ext === '.midi';
}

export function getSupportedMIDIExtensions(): string[] {
  return ['.mid', '.midi'];
}
