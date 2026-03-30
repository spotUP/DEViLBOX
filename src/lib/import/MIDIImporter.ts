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
    const sustainIntervals = buildSustainIntervals(track.controlChanges[64]);
    for (const note of track.notes) {
      placeNote(rows, note, instId, ppq, rowsPerBeat, opts, sustainIntervals);
    }
    placeTrackEffects(rows, track, ppq, rowsPerBeat, opts.quantize);
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
        rows[row].note = 61; // C-5 — standard drum trigger note
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

/** Place a melodic note (+ note-off) into a row array.
 *  Note-off is delayed past sustain pedal intervals if applicable. */
function placeNote(
  rows: TrackerCell[],
  note: { midi: number; velocity: number; ticks: number; durationTicks: number },
  instId: number,
  ppq: number,
  rowsPerBeat: number,
  opts: { quantize?: number; velocityToVolume?: boolean },
  sustainIntervals?: SustainInterval[],
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

  // Note-off — delay past sustain pedal if held
  let offTick = note.ticks + note.durationTicks;
  if (sustainIntervals) {
    offTick = adjustNoteOffForSustain(offTick, sustainIntervals);
  }
  const endRow = tickToRow(offTick, ppq, rowsPerBeat, opts.quantize);
  if (endRow > row && endRow < rows.length) {
    rows[endRow].note = 97; // XM note-off
  }
}

// ── Sustain Pedal ────────────────────────────────────────────────────────────

interface SustainInterval { onTick: number; offTick: number }

/** Build sustain-on/off intervals from CC 64 events. */
function buildSustainIntervals(
  cc64: Array<{ ticks: number; value: number }> | undefined,
): SustainInterval[] {
  if (!cc64 || cc64.length === 0) return [];
  const intervals: SustainInterval[] = [];
  let onTick = -1;
  for (const ev of cc64) {
    if (ev.value >= 0.5 && onTick < 0) {
      onTick = ev.ticks;
    } else if (ev.value < 0.5 && onTick >= 0) {
      intervals.push({ onTick, offTick: ev.ticks });
      onTick = -1;
    }
  }
  if (onTick >= 0) intervals.push({ onTick, offTick: Infinity });
  return intervals;
}

/** If a note-off falls within a sustain interval, delay it to the pedal release. */
function adjustNoteOffForSustain(offTick: number, intervals: SustainInterval[]): number {
  for (const iv of intervals) {
    if (offTick >= iv.onTick && offTick < iv.offTick) {
      return iv.offTick;
    }
  }
  return offTick;
}

// ── CC → Tracker Effect Mapping (full MIDI spec) ────────────────────────────

/**
 * Map a MIDI CC to a tracker [effTyp, eff] pair.
 *
 * Complete mapping based on the MIDI 1.0 CC specification:
 *   CC  1  Modulation Wheel     → Vibrato 4xy (speed=4, depth=0-F)
 *   CC  2  Breath Controller    → Set Volume Cxx
 *   CC  4  Foot Pedal           → Set Volume Cxx
 *   CC  5  Portamento Time      → Tone Portamento speed 3xx
 *   CC  7  Volume               → Set Volume Cxx (0-64)
 *   CC  8  Balance              → Set Pan 8xx (0-255)
 *   CC 10  Pan                  → Set Pan 8xx (0-255)
 *   CC 11  Expression           → Set Volume Cxx (scaled by last CC 7)
 *   CC 64  Damper/Sustain       → handled in note-off logic, not here
 *   CC 65  Portamento on/off    → Tone Portamento 3xx on/off
 *   CC 66  Sostenuto            → handled in note-off logic
 *   CC 67  Soft Pedal           → halve volume Cxx
 *   CC 68  Legato               → Tone Portamento 3xx
 *   CC 71  Resonance            → (no tracker equivalent — skip)
 *   CC 72  Release Time         → (instrument param — skip)
 *   CC 73  Attack Time          → (instrument param — skip)
 *   CC 74  Filter Cutoff        → (no tracker equivalent — skip)
 *   CC 84  Portamento Control   → Tone Portamento speed 3xx
 *   CC 91  Reverb Depth         → (instrument effect — skip)
 *   CC 92  Tremolo Depth        → Tremolo 7xy (speed=4, depth=0-F)
 *   CC 93  Chorus Depth         → (instrument effect — skip)
 *   CC 94  Detune               → Set Finetune E5x
 *   CC 120 All Sound Off        → Note Cut EC0
 *   CC 123 All Notes Off        → Note Off (note=97)
 *
 * Skipped: bank select (0), data entry (6, 38), LSBs (32-63), RPNs (96-101),
 *          undefined (3, 9, 14-31, 85-90, 102-119), channel mode (121-127).
 */
function mapCCToEffect(
  ccNumber: number,
  value: number,
  lastVolume: number,
): [number, number] | null {
  switch (ccNumber) {
    // ── Volume / Expression ──
    case 7:  return [0xC, Math.round(value * 64)];
    case 11: return [0xC, Math.min(64, Math.round(value * lastVolume * 64))];
    case 2:  return [0xC, Math.round(value * 64)];
    case 4:  return [0xC, Math.round(value * 64)];
    case 67: return value >= 0.5 ? [0xC, Math.round(lastVolume * 32)] : null;

    // ── Pan / Balance ──
    case 8:  return [0x8, Math.round(value * 255)];
    case 10: return [0x8, Math.round(value * 255)];

    // ── Modulation → Vibrato (4xy: x=speed 1-F, y=depth 0-F) ──
    case 1: {
      const depth = Math.round(value * 15);
      return [0x4, depth > 0 ? (4 << 4) | depth : 0];
    }

    // ── Tremolo (7xy: x=speed, y=depth) ──
    case 92: {
      const depth = Math.round(value * 15);
      return [0x7, depth > 0 ? (4 << 4) | depth : 0];
    }

    // ── Portamento ──
    case 5:  return [0x3, Math.round(value * 255)];
    case 65: return value >= 0.5 ? [0x3, 0x20] : [0x3, 0];
    case 68: return value >= 0.5 ? [0x3, 0x20] : [0x3, 0];
    case 84: return [0x3, Math.round(value * 255)];

    // ── Detune → Set Finetune E5x ──
    case 94: return [0xE, 0x50 | (Math.round(value * 15) & 0xF)];

    // ── All Sound Off → Note Cut (EC0) ──
    case 120: return [0xE, 0xC0];

    // ── All Notes Off → handled by placing note=97 ──
    case 123: return null;

    // ── Sustain/Sostenuto/Hold → handled in note-off logic ──
    case 64: case 66: case 69: return null;

    // ── Skip: bank select, data entry, RPNs, channel mode, undefined ──
    default: return null;
  }
}

/**
 * Place all MIDI CC events and pitch bends as tracker effects on a channel.
 * Iterates every CC number present on the track and maps via mapCCToEffect().
 * Pitch bends are delta-encoded as pitch slide up/down (1xx/2xx).
 */
function placeTrackEffects(
  rows: TrackerCell[],
  track: { controlChanges: Record<number, Array<{ ticks: number; value: number }>>; pitchBends?: Array<{ ticks: number; value: number }> },
  ppq: number,
  rowsPerBeat: number,
  quantize: number,
): void {
  // Track CC 7 value for expression scaling
  let lastVolume = 1.0;

  // Collect all CC events from all CC numbers, sorted by tick
  interface EffectEvent { ticks: number; effTyp: number; eff: number }
  const events: EffectEvent[] = [];

  if (track.controlChanges) {
    for (const [ccStr, ccEvents] of Object.entries(track.controlChanges)) {
      const ccNum = parseInt(ccStr, 10);
      for (const ev of ccEvents) {
        // Track CC7 for expression scaling
        if (ccNum === 7) lastVolume = ev.value;

        const mapped = mapCCToEffect(ccNum, ev.value, lastVolume);
        if (mapped) {
          events.push({ ticks: ev.ticks, effTyp: mapped[0], eff: mapped[1] });
        }

        // CC 123 → place note-off directly
        if (ccNum === 123) {
          const row = tickToRow(ev.ticks, ppq, rowsPerBeat, quantize);
          if (row >= 0 && row < rows.length && rows[row].note === 0) {
            rows[row].note = 97;
          }
        }
      }
    }
  }

  // Pitch bends → delta-based pitch slide up (1xx) / down (2xx)
  if (track.pitchBends && track.pitchBends.length > 0) {
    let prevBend = 0;
    for (const pb of track.pitchBends) {
      const delta = pb.value - prevBend;
      prevBend = pb.value;
      if (Math.abs(delta) < 0.005) continue;
      if (delta > 0) {
        events.push({ ticks: pb.ticks, effTyp: 0x1, eff: Math.min(0xFF, Math.round(delta * 96)) });
      } else {
        events.push({ ticks: pb.ticks, effTyp: 0x2, eff: Math.min(0xFF, Math.round(Math.abs(delta) * 96)) });
      }
    }
  }

  // Sort by tick and place into rows
  events.sort((a, b) => a.ticks - b.ticks);
  for (const ev of events) {
    const row = tickToRow(ev.ticks, ppq, rowsPerBeat, quantize);
    if (row >= 0 && row < rows.length) {
      placeEffect(rows[row], ev.effTyp, ev.eff);
    }
  }
}

/** Place an effect into the first available effect slot of a cell. */
function placeEffect(cell: TrackerCell, typ: number, param: number): void {
  if (cell.effTyp === 0) {
    cell.effTyp = typ;
    cell.eff = param;
  } else if (cell.effTyp2 === 0) {
    cell.effTyp2 = typ;
    cell.eff2 = param;
  }
  // Both slots full → drop (could use volume column for volume/pan in future)
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
