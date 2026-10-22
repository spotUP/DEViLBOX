/**
 * MIDI Importer — Standard MIDI Files (.mid/.midi) → tracker patterns
 *
 * All MIDI tracks become channels within the same pattern(s).  Long songs are
 * split into sequential patterns of `defaultPatternLength` rows, chained via
 * song positions.  A melodic track that plays chords is spread over as many
 * channels as it has simultaneous voices, so no chord note is dropped.
 * Percussion tracks (MIDI ch 10) are expanded to one channel per unique drum
 * note.
 *
 * Timing: four rows per beat at replayer speed `MIDI_IMPORT_SPEED`, so the
 * imported BPM equals the MIDI tempo.  Notes that fall late of their row keep
 * their offset as an EDx note delay (one delay tick = 1/6 row) unless the
 * caller asks for the notes to be snapped to a row grid (`quantize` >= 1).
 * Notes shorter than a row keep their length as an ECx note cut.
 */

import { Midi, type Track } from '@tonejs/midi';
import type { Pattern, TrackerCell, ChannelData } from '@typedefs/tracker';
import { midiToXMNote } from '../xmConversions';
import {
  gmProgramToInstrument, gmPercussionNoteToInstrument, gmFluidInstrument, gmPercussionName,
  GM2_NAMES, GM_DRUM_BANK,
} from './GMSoundBank';
import type { InstrumentConfig } from '@typedefs/instrument';

function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface MIDIImportOptions {
  /** 0 keeps sub-row timing as note delays; 1 snaps to rows; 2+ snaps to that many rows. */
  quantize?: number;
  /** @deprecated ignored — tracks are always merged as channels */
  mergeChannels?: boolean;
  velocityToVolume?: boolean;
  defaultPatternLength?: number;
  /**
   * 'gm' plays every track on the General MIDI SoundFont through FluidSynth;
   * 'synth' uses DEViLBOX's built-in stand-in synths and drum machines.
   */
  soundFont?: 'gm' | 'synth';
}

/** Replayer speed (ticks per row) every imported MIDI song plays at. */
export const MIDI_IMPORT_SPEED = 6;

/** Rows per MIDI quarter note. With speed 6 this makes tracker BPM equal MIDI BPM. */
const ROWS_PER_BEAT = 4;

/** Drum trigger note for the 'synth' DrumMachine instruments (C-5). */
const DRUM_TRIGGER_NOTE = 61;

/** XM note-off. */
const NOTE_OFF = 97;

export const DEFAULT_MIDI_IMPORT_OPTIONS: Required<Omit<MIDIImportOptions, 'mergeChannels'>> = {
  quantize: 0,
  velocityToVolume: true,
  defaultPatternLength: 64,
  soundFont: 'gm',
};

export interface MIDIImportResult {
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  /** MIDI tempo kept to two decimals; the replayer accepts fractional BPM. */
  bpm: number;
  /** Replayer speed the patterns were laid out for (always MIDI_IMPORT_SPEED). */
  speed: number;
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
  const opts = {
    ...DEFAULT_MIDI_IMPORT_OPTIONS, ...options,
    // Callers pass the field through as undefined when unset; that keeps the default.
    soundFont: options.soundFont ?? DEFAULT_MIDI_IMPORT_OPTIONS.soundFont,
  };

  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const ppq = midi.header.ppq || 480;
  if (ppq === 0) throw new Error('Invalid MIDI file: PPQ cannot be zero');

  const bpm = midi.header.tempos.length > 0
    ? Math.round(midi.header.tempos[0].bpm * 100) / 100
    : 120;

  const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
    ? [midi.header.timeSignatures[0].timeSignature[0],
       midi.header.timeSignatures[0].timeSignature[1]]
    : [4, 4];

  const tracks = mergeSplitTracks(midi.tracks);
  const timing: Timing = { ppq, quantize: opts.quantize };

  // ── Build full-length channel data for every track ────────────────────

  const instruments: InstrumentConfig[] = [];
  const fullChannels: FullChannel[] = [];
  let nextInstId = 1;

  // Total rows cover the last note end and the last end-of-track marker,
  // rounded up to a whole bar of the file's time signature.
  let maxTick = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      maxTick = Math.max(maxTick, note.ticks + note.durationTicks);
    }
    if (track.notes.length > 0 && track.endOfTrackTicks !== undefined) {
      maxTick = Math.max(maxTick, track.endOfTrackTicks);
    }
  }
  const rowsPerBar = Math.max(1, Math.round(timeSignature[0] * ROWS_PER_BEAT * 4 / timeSignature[1]));
  const contentRows = Math.ceil((maxTick / ppq) * ROWS_PER_BEAT);
  const totalRows = Math.max(rowsPerBar, Math.ceil(contentRows / rowsPerBar) * rowsPerBar);

  // Non-percussion tracks — one channel per simultaneous voice
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (track.notes.length === 0 || track.instrument.percussion) continue;

    const instId = nextInstId++;
    const program = track.instrument.number;
    instruments.push(opts.soundFont === 'gm'
      ? gmFluidInstrument(program, 0, instId, GM2_NAMES[program] ?? `Program ${program}`)
      : gmProgramToInstrument(program, instId, false));

    const sustainIntervals = buildSustainIntervals(track.controlChanges[64]);
    const voices: Voice[] = [];
    const notes = [...track.notes].sort((a, b) => a.ticks - b.ticks || b.midi - a.midi);
    for (const note of notes) {
      const row = tickToRow(note.ticks, timing);
      if (row < 0 || row >= totalRows) continue;
      const offTick = adjustNoteOffForSustain(note.ticks + note.durationTicks, sustainIntervals);

      // A key struck again while it still sounds re-strikes it: a MIDI synth
      // ends the old voice, so the note goes on the voice that holds that key.
      // A new voice would sound both (a same-tick duplicate played 6 dB loud).
      let voice = voices.find((v) => v.busyUntilRow > row && v.midi === note.midi)
        ?? voices.find((v) => v.busyUntilRow <= row);
      if (!voice) {
        voice = { rows: makeEmptyRows(totalRows), busyUntilRow: 0, midi: -1 };
        voices.push(voice);
      }
      const freeRow = placeNote(voice.rows, row, offTick, note, instId, timing, opts.velocityToVolume);
      voice.busyUntilRow = Math.max(freeRow, voice.busyUntilRow > row ? voice.busyUntilRow : 0);
      voice.midi = note.midi;
    }

    const defaults = initialChannelDefaults(track);
    placeTrackEffects(voices[0].rows, track, timing);
    const baseName = track.name || `Channel ${track.channel + 1}`;
    voices.forEach((voice, vi) => {
      fullChannels.push({
        name: voices.length === 1 ? baseName : `${baseName} ${vi + 1}`,
        instId,
        rows: voice.rows,
        ...defaults,
      });
    });
  }

  // Percussion tracks — one channel per unique drum note
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (track.notes.length === 0 || !track.instrument.percussion) continue;

    const groups = new Map<number, typeof track.notes>();
    for (const note of track.notes) {
      if (!groups.has(note.midi)) groups.set(note.midi, []);
      groups.get(note.midi)!.push(note);
    }

    const defaults = initialChannelDefaults(track);
    for (const [midiNote, hits] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
      const instId = nextInstId++;
      // On the GM SoundFont every drum is the track's kit, played at its GM key.
      const gm = opts.soundFont === 'gm';
      const inst = gm
        ? gmFluidInstrument(track.instrument.number, GM_DRUM_BANK, instId, gmPercussionName(midiNote))
        : gmPercussionNoteToInstrument(midiNote, instId);
      const cellNote = gm ? midiToXMNote(midiNote) : DRUM_TRIGGER_NOTE;
      instruments.push(inst);

      // One cell holds one hit.  Two hits of the same drum that quantize to
      // the same row (a flam, a 32nd-note roll) go to an overflow voice
      // channel of the same instrument instead of overwriting each other.
      const voiceRows: TrackerCell[][] = [];
      for (const hit of hits) {
        const row = tickToRow(hit.ticks, timing);
        if (row < 0 || row >= totalRows) continue;
        let rows = voiceRows.find((r) => r[row].note === 0);
        if (!rows) {
          rows = makeEmptyRows(totalRows);
          voiceRows.push(rows);
        }
        rows[row].note = cellNote;
        rows[row].instrument = instId;
        if (opts.velocityToVolume) {
          rows[row].volume = velocityToVolumeColumn(hit.velocity);
        }
        placeNoteDelay(rows[row], hit.ticks, timing);
      }
      if (voiceRows.length === 0) voiceRows.push(makeEmptyRows(totalRows));
      voiceRows.forEach((rows, vi) => {
        fullChannels.push({
          name: vi === 0 ? inst.name : `${inst.name} ${vi + 1}`,
          instId, rows, ...defaults,
        });
      });
    }
  }

  // ── Tempo map: initial BPM is tempos[0]; every later change becomes Fxx ──

  placeTempoChanges(fullChannels, midi.header.tempos, bpm, timing, totalRows);

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
      volume: fc.volume,
      pan: fc.pan,
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
    speed: MIDI_IMPORT_SPEED,
    timeSignature,
    metadata: {
      name: songName,
      tracks: midi.tracks.length,
      totalTicks: midi.durationTicks,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Timing { ppq: number; quantize: number }

interface FullChannel {
  name: string;
  instId: number;
  rows: TrackerCell[];
  /** Channel volume 0-100 (from CC 7 before the first note, else 80). */
  volume: number;
  /** Channel pan -100..100 (from CC 10 before the first note, MIDI 64 = centre, else 0). */
  pan: number;
}

interface Voice {
  rows: TrackerCell[];
  /** First row this voice is free again (the row holding its note-off). */
  busyUntilRow: number;
  /** MIDI key of the last note placed on this voice. */
  midi: number;
}

function makeEmptyRows(length: number): TrackerCell[] {
  return Array.from({ length }, () => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));
}

/**
 * @tonejs/midi splits every MIDI track at each program change, so the events
 * that precede a track's first program change (track name, bank select,
 * initial volume and pan) end up in a note-less track of their own and the
 * track with the notes comes back nameless.  Fold each note-less track into
 * the track with notes that directly follows it.
 */
function mergeSplitTracks(tracks: Track[]): Track[] {
  const merged: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.notes.length > 0) { merged.push(track); continue; }
    // @tonejs/midi reports channel 0 for a split without notes whatever
    // channel its events used, so the channel cannot pair the two halves.
    // The splits of one MIDI track are emitted consecutively, so the
    // note-less half is always followed directly by its own notes.
    const target = tracks[i + 1];
    if (!target || target.notes.length === 0) continue;
    if (!target.name && track.name) target.name = track.name;
    for (const [ccStr, events] of Object.entries(track.controlChanges)) {
      const cc = parseInt(ccStr, 10);
      const existing = target.controlChanges[cc] ?? [];
      target.controlChanges[cc] = [...existing, ...events].sort((a, b) => a.ticks - b.ticks);
    }
    if (track.pitchBends.length > 0) {
      target.pitchBends = [...track.pitchBends, ...target.pitchBends].sort((a, b) => a.ticks - b.ticks);
    }
    if (track.endOfTrackTicks !== undefined) {
      target.endOfTrackTicks = Math.max(target.endOfTrackTicks ?? 0, track.endOfTrackTicks);
    }
  }
  return merged;
}

/**
 * CC 7 (volume) and CC 10 (pan) sent before the first note set up the mixer
 * channel; they are the channel's volume and pan, not a row effect that would
 * override the first note's velocity.
 */
function initialChannelDefaults(track: Track): { volume: number; pan: number } {
  const firstNoteTick = track.notes.length > 0 ? track.notes[0].ticks : 0;
  const initial = (cc: number): number | undefined => {
    const events = (track.controlChanges[cc] ?? []).filter((ev) => ev.ticks <= firstNoteTick);
    return events.length > 0 ? events[events.length - 1].value : undefined;
  };
  const volume = initial(7);
  const pan = initial(10);
  return {
    volume: volume === undefined ? 80 : Math.round(volume * 100),
    pan: pan === undefined ? 0 : Math.max(-100, Math.min(100, Math.round((pan * 127 - 64) / 63 * 100))),
  };
}

/**
 * Place a melodic note into a voice's row array and end it where the MIDI
 * note ends.  A note that ends inside its own row (staccato shorter than a
 * row) is ended with an ECx note cut on that row, x = replayer ticks played.
 * A longer note gets a note-off on the row where it ends; a following note on
 * that row simply replaces the note-off.  Returns the first row on which the
 * voice is free again.
 */
function placeNote(
  rows: TrackerCell[],
  row: number,
  offTick: number,
  note: { midi: number; velocity: number; ticks: number },
  instId: number,
  timing: Timing,
  velocityToVolume: boolean,
): number {
  const xmNote = midiToXMNote(note.midi);
  if (!xmNote) return row + 1;

  rows[row].note = xmNote;
  rows[row].instrument = instId;
  if (velocityToVolume) {
    rows[row].volume = velocityToVolumeColumn(note.velocity);
  }
  const delayTicks = placeNoteDelay(rows[row], note.ticks, timing);

  const playedTicks = Math.round((tickToExactRow(offTick, timing.ppq) - row) * MIDI_IMPORT_SPEED);
  if (playedTicks < MIDI_IMPORT_SPEED && delayTicks + 1 < MIDI_IMPORT_SPEED) {
    const cutTick = Math.max(delayTicks + 1, playedTicks);
    placeEffect(rows[row], 0xE, 0xC0 | cutTick);
    return row + 1;
  }

  const offRow = Math.max(row + 1, tickToRow(offTick, timing));
  if (offRow < rows.length) {
    rows[offRow].note = NOTE_OFF;
  }
  return offRow;
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
 *   CC  7  Volume               → Set Volume Cxx (0-64); before the first note it is the channel volume instead
 *   CC  8  Balance              → Set Pan 8xx (0-255)
 *   CC 10  Pan                  → Set Pan 8xx (0-255); before the first note it is the channel pan instead
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
 * CC 7 and CC 10 up to the first note are the channel defaults (see
 * initialChannelDefaults) and are not placed as effects.
 * Pitch bends are delta-encoded as pitch slide up/down (1xx/2xx).
 */
function placeTrackEffects(
  rows: TrackerCell[],
  track: Track,
  timing: Timing,
): void {
  const firstNoteTick = track.notes.length > 0 ? track.notes[0].ticks : 0;

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

        if ((ccNum === 7 || ccNum === 10) && ev.ticks <= firstNoteTick) continue;

        const mapped = mapCCToEffect(ccNum, ev.value, lastVolume);
        if (mapped) {
          events.push({ ticks: ev.ticks, effTyp: mapped[0], eff: mapped[1] });
        }

        // CC 123 → place note-off directly
        if (ccNum === 123) {
          const row = tickToRow(ev.ticks, timing);
          if (row >= 0 && row < rows.length && rows[row].note === 0) {
            rows[row].note = NOTE_OFF;
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
    const row = tickToRow(ev.ticks, timing);
    if (row >= 0 && row < rows.length) {
      placeEffect(rows[row], ev.effTyp, ev.eff);
    }
  }
}

/**
 * XM Fxx: 01-1F sets speed (ticks per row), 20-FF sets BPM (EffectCommands.ts).
 * A row lasts speed * 2.5 / BPM seconds, so a tempo outside 32..255 BPM at the
 * import speed is re-expressed as another speed with a proportionally scaled
 * BPM (same row duration).  Fxx carries whole BPM only, so fractional tempos
 * are rounded.  Speed also scales the tick unit of the ECx/EDx note cut/delay
 * effects, so the speed only leaves MIDI_IMPORT_SPEED when the BPM is out of
 * range.  Tempos no speed can express are clamped to the nearest BPM.
 */
function tempoToFxx(bpm: number): { speed: number; param: number } {
  let best = { speed: MIDI_IMPORT_SPEED, param: Math.max(32, Math.min(255, Math.round(bpm))) };
  let bestDist = Infinity;
  for (let speed = 1; speed < 32; speed++) {
    const scaled = Math.round((bpm * speed) / MIDI_IMPORT_SPEED);
    if (scaled < 32 || scaled > 255) continue;
    const dist = Math.abs(speed - MIDI_IMPORT_SPEED);
    if (dist < bestDist) { bestDist = dist; best = { speed, param: scaled }; }
  }
  return best;
}

/** Put a song-level effect in the first free effect slot on `row` at/after channel `fromChannel`. Returns that channel index, or -1. */
function placeSongEffect(
  channels: FullChannel[], row: number, fromChannel: number, typ: number, param: number,
): number {
  for (let c = fromChannel; c < channels.length; c++) {
    const cell = channels[c].rows[row];
    if (cell.effTyp === 0 || cell.effTyp2 === 0) {
      placeEffect(cell, typ, param);
      return c;
    }
  }
  console.warn(`[MIDIImporter] no free effect slot on row ${row}; tempo change dropped`);
  return -1;
}

function placeTempoChanges(
  channels: FullChannel[],
  tempos: { ticks: number; bpm: number }[],
  initialBpm: number,
  timing: Timing,
  totalRows: number,
): void {
  if (channels.length === 0 || tempos.length < 2) return;
  const byRow = new Map<number, number>(); // last tempo on a row wins
  for (const t of tempos.slice(1)) {
    const row = tickToRow(t.ticks, timing);
    if (row >= 0 && row < totalRows) byRow.set(row, t.bpm);
  }
  let currentSpeed = MIDI_IMPORT_SPEED;
  let currentBpm = initialBpm;
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const target = tempoToFxx(byRow.get(row)!);
    let ch = 0;
    const speedChanged = target.speed !== currentSpeed;
    if (speedChanged) {
      ch = placeSongEffect(channels, row, 0, 0xF, target.speed);
      if (ch < 0) continue;
      currentSpeed = target.speed;
    }
    if (speedChanged || target.param !== currentBpm) {
      if (placeSongEffect(channels, row, ch, 0xF, target.param) >= 0) currentBpm = target.param;
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

/** Exact (fractional) row position of a MIDI tick. */
function tickToExactRow(tick: number, ppq: number): number {
  return (tick / ppq) * ROWS_PER_BEAT;
}

function tickToRow(tick: number, { ppq, quantize }: Timing): number {
  if (ppq === 0) return 0;
  const row = Math.round(tickToExactRow(tick, ppq));
  return quantize > 1 ? Math.round(row / quantize) * quantize : row;
}

/**
 * Keep the part of a note's timing that row rounding threw away.  A note that
 * sits late of its row by at least half a replayer tick gets an EDx note delay
 * (x = whole replayer ticks, 1/6 row each).  Notes early of their row stay on
 * the row: the tracker cannot play a note before its row.  Skipped when the
 * caller asked for notes to be snapped to a grid.  Returns the delay placed.
 */
function placeNoteDelay(cell: TrackerCell, tick: number, { ppq, quantize }: Timing): number {
  if (quantize >= 1) return 0;
  const exact = tickToExactRow(tick, ppq);
  const late = exact - Math.round(exact);
  const delayTicks = Math.round(late * MIDI_IMPORT_SPEED);
  if (delayTicks >= 1 && delayTicks < MIDI_IMPORT_SPEED) {
    placeEffect(cell, 0xE, 0xD0 | delayTicks);
    return delayTicks;
  }
  return 0;
}

/** MIDI velocity (0..1) to an XM volume-column "set volume" byte (0x10..0x50). */
function velocityToVolumeColumn(velocity: number): number {
  return 0x10 + Math.round(velocity * 0x40);
}

export function isMIDIFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext === '.mid' || ext === '.midi';
}

export function getSupportedMIDIExtensions(): string[] {
  return ['.mid', '.midi'];
}
