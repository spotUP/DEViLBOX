/**
 * MIDI Importer - Import Standard MIDI Files (.mid/.midi) as tracker patterns
 */

import { Midi, Track } from '@tonejs/midi';
import type { Pattern, TrackerCell, ChannelData } from '@typedefs/tracker';
import { midiToXMNote } from '../xmConversions';
import { gmProgramToInstrument, gmPercussionNoteToInstrument } from './GMSoundBank';
import type { InstrumentConfig } from '@typedefs/instrument';

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
  const instruments: InstrumentConfig[] = [];

  if (opts.mergeChannels) {
    const trackToInstId = new Map<number, number>();
    let nextInstId = 1;

    // Non-percussion tracks → one instrument each
    midi.tracks.forEach((track, ti) => {
      if (track.notes.length === 0 || track.instrument.percussion) return;
      trackToInstId.set(ti, nextInstId);
      instruments.push(gmProgramToInstrument(track.instrument.number, nextInstId, false));
      nextInstId++;
    });

    // Build merged pattern from non-percussion tracks
    const mergedPattern = createPatternFromMIDI(midi, opts, ppq, rowsPerBeat, trackToInstId);

    // Percussion tracks → expand into per-note channels appended to merged pattern
    midi.tracks.forEach((track, ti) => {
      if (track.notes.length === 0 || !track.instrument.percussion) return;
      const perc = createPercussionPattern(track, ti, opts, ppq, rowsPerBeat, nextInstId);
      mergedPattern.channels.push(...perc.pattern.channels);
      instruments.push(...perc.instruments);
      nextInstId += perc.instruments.length;
    });

    patterns.push(mergedPattern);
  } else {
    let nextInstId = 1;
    for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex++) {
      const track = midi.tracks[trackIndex];
      if (track.notes.length === 0) continue;

      if (track.instrument.percussion) {
        const perc = createPercussionPattern(track, trackIndex, opts, ppq, rowsPerBeat, nextInstId);
        patterns.push(perc.pattern);
        instruments.push(...perc.instruments);
        nextInstId += perc.instruments.length;
      } else {
        instruments.push(gmProgramToInstrument(track.instrument.number, nextInstId, false));
        patterns.push(createPatternFromTrack(track, trackIndex, nextInstId, opts, ppq, rowsPerBeat));
        nextInstId++;
      }
    }
  }

  return {
    patterns,
    instruments,
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
 * Create a Pattern from a MIDI percussion track (channel 10).
 * One channel per unique MIDI note number, each channel has its own DrumMachine instrument.
 */
function createPercussionPattern(
  track: Track,
  trackIndex: number,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number,
  startInstId: number,
): { pattern: Pattern; instruments: InstrumentConfig[] } {
  // Calculate pattern length from actual content, rounded up to nearest 16 rows (1 bar).
  // Drum hits have near-zero durationTicks so we use the start tick of the latest hit.
  // Use exact division (no Math.round) so content lengths like 31.7 rows → 32 rows,
  // never inflated to 64 by coarse rounding.
  const lastNoteTick = track.notes.reduce((max, n) => Math.max(max, n.ticks), 0);
  const exactRows = (lastNoteTick / ppq) * rowsPerBeat; // exact, no rounding
  const patternLength = exactRows > 0
    ? Math.min(256, Math.ceil(exactRows / 16) * 16)
    : Math.min(256, options.defaultPatternLength || 16);

  // Group hits by MIDI note number
  const noteGroups = new Map<number, Array<{ tick: number; velocity: number }>>();
  track.notes.forEach(note => {
    if (!noteGroups.has(note.midi)) noteGroups.set(note.midi, []);
    noteGroups.get(note.midi)!.push({ tick: note.ticks, velocity: note.velocity });
  });

  const channels: ChannelData[] = [];
  const instruments: InstrumentConfig[] = [];
  let instId = startInstId;

  // Sort by MIDI note for consistent channel order (kick first, hi-hats later, etc.)
  Array.from(noteGroups.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([midiNote, hits]) => {
      const instrument = gmPercussionNoteToInstrument(midiNote, instId);
      instruments.push(instrument);

      const rows: TrackerCell[] = Array.from({ length: patternLength }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }));

      hits.forEach(({ tick, velocity }) => {
        const row = tickToRow(tick, ppq, rowsPerBeat, options.quantize);
        if (row < 0 || row >= patternLength) return;
        rows[row].note = 1; // trigger — DrumMachine ignores pitch
        rows[row].instrument = instId;
        if (options.velocityToVolume) {
          const vol = velocityToVolume(velocity * 127);
          rows[row].volume = 0x10 + Math.round((vol / 64) * 64);
        }
      });

      channels.push({
        id: generateId('channel'),
        name: instrument.name,
        instrumentId: instId,
        color: null,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 80,
        pan: 0,
        rows,
      });

      instId++;
    });

  return {
    pattern: {
      id: generateId('pattern'),
      name: track.name || `Drums ${trackIndex + 1}`,
      length: patternLength,
      channels,
    },
    instruments,
  };
}

/**
 * Create a single pattern from all MIDI tracks (merged)
 */
function createPatternFromMIDI(
  midi: Midi,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number,
  trackToInstId: Map<number, number>,
): Pattern {
  // Calculate pattern length from MIDI duration, rounded up to nearest 16 rows (1 bar).
  const durationRows = midi.duration * (midi.header.tempos[0]?.bpm || 120) / 60 * rowsPerBeat;
  const patternLength = durationRows > 0
    ? Math.min(256, Math.ceil(durationRows / 16) * 16)
    : Math.min(256, options.defaultPatternLength || 16);

  // Group notes by track index — each track becomes one tracker channel
  const channelNotes: Map<number, Array<{ tick: number; note: { midi: number; velocity: number; ticks: number; durationTicks: number } }>> = new Map();

  midi.tracks.forEach((track, trackIndex) => {
    track.notes.forEach(note => {
      if (!channelNotes.has(trackIndex)) {
        channelNotes.set(trackIndex, []);
      }
      channelNotes.get(trackIndex)!.push({
        tick: note.ticks,
        note,
      });
    });
  });

  // Create channels
  const channels = Array.from(channelNotes.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([trackIndex, notes]) => {
      const instId = trackToInstId.get(trackIndex) ?? 1;

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
        rows[row].instrument = instId;

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
        name: `Ch ${trackIndex + 1}`,
        instrumentId: instId,
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
  track: Track,
  trackIndex: number,
  instId: number,
  options: MIDIImportOptions,
  ppq: number,
  rowsPerBeat: number,
): Pattern {
  // Calculate pattern length from actual content, rounded up to nearest 16 rows (1 bar).
  // Do not use defaultPatternLength as a floor — only apply it for empty tracks.
  const lastNote = track.notes.length > 0 ? track.notes[track.notes.length - 1] : null;
  const durationTicks = lastNote ? lastNote.ticks + lastNote.durationTicks : 0;
  const durationRows = (durationTicks / ppq) * rowsPerBeat; // exact, no rounding
  const patternLength = durationRows > 0
    ? Math.min(256, Math.ceil(durationRows / 16) * 16)
    : Math.min(256, options.defaultPatternLength || 16);

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
  track.notes.forEach((note: { midi: number; velocity: number; ticks: number; durationTicks: number }) => {
    const row = tickToRow(note.ticks, ppq, rowsPerBeat, options.quantize);
    if (row < 0 || row >= patternLength) return;

    const xmNote = midiToXMNote(note.midi);
    if (!xmNote) return;

    rows[row].note = xmNote;
    rows[row].instrument = instId;

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
        instrumentId: instId,
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
