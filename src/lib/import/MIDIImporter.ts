/**
 * MIDI Importer - Import Standard MIDI Files (.mid/.midi) as tracker patterns
 */

import { Midi } from '@tonejs/midi';
import type { Pattern, TrackerCell } from '@typedefs/tracker';
import { midiToXMNote } from '../xmConversions';

// Generate unique ID
function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface MIDIImportOptions {
  quantize?: number; // Quantize notes to grid (in rows, 0 = no quantization)
  mergeChannels?: boolean; // Merge all MIDI channels into tracker channels
  velocityToVolume?: boolean; // Convert MIDI velocity to volume column
  defaultPatternLength?: number; // Default pattern length (64, 128, 256)
}

const DEFAULT_OPTIONS: MIDIImportOptions = {
  quantize: 1, // Quantize to 1 row
  mergeChannels: false,
  velocityToVolume: true,
  defaultPatternLength: 64,
};

export interface MIDIImportResult {
  patterns: Pattern[];
  bpm: number;
  timeSignature: [number, number];
  metadata: {
    name: string;
    tracks: number;
    totalTicks: number;
  };
}

/**
 * Import a MIDI file and convert to tracker patterns
 */
export async function importMIDIFile(
  file: File,
  options: Partial<MIDIImportOptions> = {}
): Promise<MIDIImportResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Parse MIDI using tonejs/midi
  const midi = new Midi(arrayBuffer);

  // Validate PPQ (Pulses Per Quarter note)
  const ppq = midi.header.ppq || 480; // Default to 480 if invalid
  if (ppq === 0) {
    throw new Error('Invalid MIDI file: PPQ (pulses per quarter note) cannot be zero');
  }

  // Extract tempo (use first tempo change or default to 120)
  const bpm = midi.header.tempos.length > 0
    ? Math.round(midi.header.tempos[0].bpm)
    : 120;

  // Extract time signature (use first or default to 4/4)
  const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
    ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]]
    : [4, 4];

  // Calculate rows per beat based on PPQ
  const rowsPerBeat = 4; // Standard tracker resolution

  // Convert each MIDI track to a tracker pattern
  const patterns: Pattern[] = [];

  if (opts.mergeChannels) {
    // Merge all MIDI tracks into a single pattern with multiple channels
    const pattern = createPatternFromMIDI(midi, opts, ppq, rowsPerBeat);
    patterns.push(pattern);
  } else {
    // Create separate patterns for each MIDI track
    for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex++) {
      const track = midi.tracks[trackIndex];
      if (track.notes.length === 0) continue; // Skip empty tracks

      const pattern = createPatternFromTrack(track, trackIndex, opts, ppq, rowsPerBeat);
      patterns.push(pattern);
    }
  }

  return {
    patterns,
    bpm,
    timeSignature,
    metadata: {
      name: midi.name || file.name.replace(/\.[^/.]+$/, ''),
      tracks: midi.tracks.length,
      totalTicks: midi.durationTicks,
    },
  };
}

/**
 * Create a single pattern from all MIDI tracks (merged)
 */
function createPatternFromMIDI(
  midi: Midi,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number
): Pattern {
  // Calculate pattern length from MIDI duration
  const durationInBeats = midi.duration * (midi.header.tempos[0]?.bpm || 120) / 60;
  const patternLength = Math.min(
    256,
    Math.max(
      options.defaultPatternLength || 64,
      Math.ceil(durationInBeats * rowsPerBeat)
    )
  );

  // Group notes by MIDI channel
  const channelNotes: Map<number, Array<{ tick: number; note: any }>> = new Map();

  midi.tracks.forEach(track => {
    track.notes.forEach(note => {
      const channel = note.midi % 16; // Use MIDI note mod 16 as channel
      if (!channelNotes.has(channel)) {
        channelNotes.set(channel, []);
      }
      channelNotes.get(channel)!.push({
        tick: note.ticks,
        note,
      });
    });
  });

  // Create channels
  const channels = Array.from(channelNotes.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([channelIndex, notes]) => {
      const rows: TrackerCell[] = Array.from({ length: patternLength }, () => ({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
      }));

      // Convert notes to tracker cells
      notes.forEach(({ tick, note }) => {
        const row = tickToRow(tick, ppq, rowsPerBeat, options.quantize);
        if (row < 0 || row >= patternLength) return;

        const xmNote = midiToXMNote(note.midi);
        if (!xmNote) return;

        rows[row].note = xmNote;

        if (options.velocityToVolume) {
          const volumeValue = velocityToVolume(note.velocity * 127); // tonejs uses 0-1, convert to 0-127
          rows[row].volume = 0x10 + Math.round((volumeValue / 64) * 64); // Convert to XM volume (0x10-0x50)
        }

        // Add note-off at end of note duration
        const endRow = tickToRow(tick + note.durationTicks, ppq, rowsPerBeat, options.quantize);
        if (endRow < patternLength && endRow > row) {
          rows[endRow].note = 97; // Note-off marker (XM format)
        }
      });

      return {
        id: generateId('channel'),
        name: `Ch ${channelIndex + 1}`,
        instrumentId: null,
        color: null,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80, // Default volume
        pan: 0, // Center pan
        rows,
      };
    });

  return {
    id: generateId('pattern'),
    name: midi.name || 'MIDI Import',
    length: patternLength,
    channels,
  };
}

/**
 * Create a pattern from a single MIDI track
 */
function createPatternFromTrack(
  track: any,
  trackIndex: number,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number
): Pattern {
  // Calculate pattern length from track duration
  const lastNote = track.notes.length > 0 ? track.notes[track.notes.length - 1] : null;
  const durationTicks = lastNote ? lastNote.ticks + lastNote.durationTicks : 0;
  const durationRows = tickToRow(durationTicks, ppq, rowsPerBeat, 0);
  const patternLength = Math.min(
    256,
    Math.max(
      options.defaultPatternLength || 64,
      Math.ceil(durationRows / 64) * 64 // Round up to nearest 64
    )
  );

  // Create single channel
  const rows: TrackerCell[] = Array.from({ length: patternLength }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  // Convert notes to tracker cells
  track.notes.forEach((note: any) => {
    const row = tickToRow(note.ticks, ppq, rowsPerBeat, options.quantize);
    if (row < 0 || row >= patternLength) return;

    const xmNote = midiToXMNote(note.midi);
    if (!xmNote) return;

    rows[row].note = xmNote;

    if (options.velocityToVolume) {
      // tonejs/midi uses 0-1 range, convert to 0-127 then to tracker volume
      const volumeValue = velocityToVolume(note.velocity * 127);
      rows[row].volume = 0x10 + Math.round((volumeValue / 64) * 64); // Convert to XM volume (0x10-0x50)
    }

    // Add note-off at end of note duration
    const endRow = tickToRow(note.ticks + note.durationTicks, ppq, rowsPerBeat, options.quantize);
    if (endRow < patternLength && endRow > row) {
      rows[endRow].note = 97; // Note-off marker (XM format)
    }
  });

  return {
    id: generateId('pattern'),
    name: track.name || `Track ${trackIndex + 1}`,
    length: patternLength,
    channels: [
      {
        id: generateId('channel'),
        name: 'Channel 1',
        instrumentId: null,
        color: null,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80, // Default volume
        pan: 0, // Center pan
        rows,
      },
    ],
  };
}

/**
 * Convert MIDI tick to tracker row
 */
function tickToRow(
  tick: number,
  ppq: number,
  rowsPerBeat: number,
  quantize: number = 0
): number {
  // Safety check for division by zero
  if (ppq === 0) {
    console.warn('PPQ is zero, defaulting to tick 0');
    return 0;
  }

  // Calculate row from tick
  const row = Math.round((tick / ppq) * rowsPerBeat);

  // Quantize if needed
  if (quantize > 0) {
    return Math.round(row / quantize) * quantize;
  }

  return row;
}

/**
 * Convert MIDI velocity (0-127) to tracker volume (0x00-0x40)
 */
function velocityToVolume(velocity: number): number {
  return Math.round((velocity / 127) * 0x40);
}

/**
 * Check if a file is a MIDI file
 */
export function isMIDIFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext === '.mid' || ext === '.midi';
}

/**
 * Get supported MIDI file extensions
 */
export function getSupportedMIDIExtensions(): string[] {
  return ['.mid', '.midi'];
}
