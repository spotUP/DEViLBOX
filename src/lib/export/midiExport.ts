/**
 * MIDI Export - Export patterns/songs as Standard MIDI Files
 */

import type { Pattern, ChannelData, TrackerCell } from '../../types/tracker';
import type { AutomationCurve } from '../../types/automation';
import { xmNoteToMidi } from '../xmConversions';
import {
  MIDI_TICKS_PER_QUARTER_NOTE,
  ROWS_PER_BEAT,
  META_EVENT,
  AUTOMATION_CC_MAP,
  type MIDIExportOptions,
  type MIDIEvent,
  type MIDITrack,
  DEFAULT_MIDI_EXPORT_OPTIONS,
} from './midiTypes';

/**
 * Export a single pattern to MIDI
 */
export function exportPatternToMIDI(
  pattern: Pattern,
  bpm: number,
  timeSignature: [number, number],
  options: Partial<MIDIExportOptions> = {}
): Uint8Array {
  const opts = { ...DEFAULT_MIDI_EXPORT_OPTIONS, ...options };

  // Create track(s) from pattern
  const tracks = createTracksFromPattern(pattern, opts);

  // Add tempo and time signature to first track
  addTempoAndTimeSignature(tracks[0], bpm, timeSignature);

  // Generate MIDI file
  return generateMIDIFile(tracks, opts.type);
}

/**
 * Export full song (sequence of patterns) to MIDI
 */
export function exportSongToMIDI(
  patterns: Pattern[],
  sequence: string[],
  bpm: number,
  timeSignature: [number, number],
  automationCurves: AutomationCurve[],
  options: Partial<MIDIExportOptions> = {}
): Uint8Array {
  const opts = { ...DEFAULT_MIDI_EXPORT_OPTIONS, ...options };

  // Build ordered pattern list from sequence
  const orderedPatterns = sequence
    .map((id) => patterns.find((p) => p.id === id))
    .filter((p): p is Pattern => p !== undefined);

  if (orderedPatterns.length === 0) {
    throw new Error('No patterns found in sequence');
  }

  // Calculate starting tick for each pattern
  let currentTick = 0;
  const patternStarts: Map<string, number> = new Map();

  for (const pattern of orderedPatterns) {
    patternStarts.set(pattern.id, currentTick);
    currentTick += patternLengthToTicks(pattern.length);
  }

  // Create tracks from all patterns
  const tracks = createTracksFromPatterns(orderedPatterns, patternStarts, opts);

  // Add automation CC events if enabled
  if (opts.includeAutomation && automationCurves.length > 0) {
    addAutomationToTracks(tracks, automationCurves, orderedPatterns, patternStarts);
  }

  // Add tempo and time signature to first track
  addTempoAndTimeSignature(tracks[0], bpm, timeSignature);

  // Generate MIDI file
  return generateMIDIFile(tracks, opts.type);
}

/**
 * Create tracks from a single pattern
 */
function createTracksFromPattern(
  pattern: Pattern,
  options: MIDIExportOptions
): MIDITrack[] {
  const tracks: MIDITrack[] = [];

  // Type 0: single track with all channels
  // Type 1: one track per channel
  if (options.type === 0) {
    const track: MIDITrack = { name: pattern.name || 'Pattern', events: [] };

    pattern.channels.forEach((channel, channelIndex) => {
      if (!options.exportMutedChannels && channel.muted) return;
      const midiChannel = channelIndex % 16;
      const events = channelToEvents(channel, midiChannel, 0, options);
      track.events.push(...events);
    });

    // Sort by tick
    track.events.sort((a, b) => a.tick - b.tick);
    tracks.push(track);
  } else {
    // Type 1: Tempo track + one track per channel
    tracks.push({ name: 'Tempo', events: [] });

    pattern.channels.forEach((channel, channelIndex) => {
      if (!options.exportMutedChannels && channel.muted) return;
      const midiChannel = channelIndex % 16;
      const track: MIDITrack = {
        name: channel.name || `Channel ${channelIndex + 1}`,
        events: channelToEvents(channel, midiChannel, 0, options),
      };
      tracks.push(track);
    });
  }

  return tracks;
}

/**
 * Create tracks from multiple patterns
 */
function createTracksFromPatterns(
  patterns: Pattern[],
  patternStarts: Map<string, number>,
  options: MIDIExportOptions
): MIDITrack[] {
  const tracks: MIDITrack[] = [];

  // Find max channel count
  const maxChannels = Math.max(...patterns.map((p) => p.channels.length));

  if (options.type === 0) {
    const track: MIDITrack = { name: 'Song', events: [] };

    patterns.forEach((pattern) => {
      const startTick = patternStarts.get(pattern.id) || 0;
      pattern.channels.forEach((channel, channelIndex) => {
        if (!options.exportMutedChannels && channel.muted) return;
        const midiChannel = channelIndex % 16;
        const events = channelToEvents(channel, midiChannel, startTick, options);
        track.events.push(...events);
      });
    });

    track.events.sort((a, b) => a.tick - b.tick);
    tracks.push(track);
  } else {
    // Type 1: Tempo track + one track per channel
    tracks.push({ name: 'Tempo', events: [] });

    // Create tracks for each channel index
    for (let channelIndex = 0; channelIndex < maxChannels; channelIndex++) {
      const track: MIDITrack = {
        name: `Channel ${channelIndex + 1}`,
        events: [],
      };
      const midiChannel = channelIndex % 16;

      patterns.forEach((pattern) => {
        const startTick = patternStarts.get(pattern.id) || 0;
        const channel = pattern.channels[channelIndex];
        if (!channel) return;
        if (!options.exportMutedChannels && channel.muted) return;

        // Update track name from first non-empty channel
        if (channel.name && track.name === `Channel ${channelIndex + 1}`) {
          track.name = channel.name;
        }

        const events = channelToEvents(channel, midiChannel, startTick, options);
        track.events.push(...events);
      });

      if (track.events.length > 0) {
        tracks.push(track);
      }
    }
  }

  return tracks;
}

/**
 * Convert channel data to MIDI events
 */
function channelToEvents(
  channel: ChannelData,
  midiChannel: number,
  startTick: number,
  options: MIDIExportOptions
): MIDIEvent[] {
  const events: MIDIEvent[] = [];
  const patternLength = channel.rows.length;

  for (let row = 0; row < patternLength; row++) {
    const cell = channel.rows[row];
    // Skip empty cells (0)
    if (!cell.note || cell.note === 0) continue;

    // Note-off marker (97)
    if (cell.note === 97) continue;

    // Parse note
    const midiNote = xmNoteToMidi(cell.note);
    if (midiNote === null) continue;

    // Calculate tick position
    const tick = startTick + rowToTick(row);

    // Calculate velocity from volume column
    const velocity = volumeToVelocity(cell.volume, options.velocityScale);

    // Calculate note duration
    const durationRows = calculateNoteDuration(channel.rows, row, patternLength);
    const durationTicks = Math.max(1, rowToTick(durationRows));

    // Note on
    events.push({
      tick,
      type: 'noteOn',
      channel: midiChannel,
      data: [midiNote, velocity],
    });

    // Note off
    events.push({
      tick: tick + durationTicks,
      type: 'noteOff',
      channel: midiChannel,
      data: [midiNote, 0],
    });
  }

  return events;
}

/**
 * Calculate note duration (in rows) by scanning forward
 */
function calculateNoteDuration(
  rows: TrackerCell[],
  startRow: number,
  patternLength: number
): number {
  for (let row = startRow + 1; row < patternLength; row++) {
    const cell = rows[row];
    // Note-off marker ends the note (97)
    if (cell.note === 97) {
      return row - startRow;
    }
    // Next note starts (not empty)
    if (cell.note && cell.note !== 0 && cell.note !== 97) {
      return row - startRow;
    }
  }
  // Note extends to end of pattern
  return patternLength - startRow;
}

/**
 * Convert tracker row to MIDI tick
 */
function rowToTick(row: number): number {
  return row * (MIDI_TICKS_PER_QUARTER_NOTE / ROWS_PER_BEAT);
}

/**
 * Convert pattern length to total ticks
 */
function patternLengthToTicks(length: number): number {
  return length * (MIDI_TICKS_PER_QUARTER_NOTE / ROWS_PER_BEAT);
}

/**
 * Convert tracker volume (0x00-0x40) to MIDI velocity (1-127)
 */
function volumeToVelocity(volume: number | null, scale: number): number {
  const vol = volume ?? 64; // Default to max if null
  const velocity = Math.round((vol / 64) * 127 * scale);
  return Math.max(1, Math.min(127, velocity));
}

/**
 * Add tempo and time signature meta events
 */
function addTempoAndTimeSignature(
  track: MIDITrack,
  bpm: number,
  timeSignature: [number, number]
): void {
  // Tempo event (microseconds per quarter note)
  const microsecondsPerBeat = Math.round(60000000 / bpm);
  track.events.unshift({
    tick: 0,
    type: 'meta',
    channel: 0,
    data: [
      META_EVENT.SET_TEMPO,
      3, // Length
      (microsecondsPerBeat >> 16) & 0xff,
      (microsecondsPerBeat >> 8) & 0xff,
      microsecondsPerBeat & 0xff,
    ],
  });

  // Time signature event
  const [numerator, denominator] = timeSignature;
  const denomLog2 = Math.log2(denominator);
  track.events.unshift({
    tick: 0,
    type: 'meta',
    channel: 0,
    data: [
      META_EVENT.TIME_SIGNATURE,
      4, // Length
      numerator,
      denomLog2,
      24, // MIDI clocks per metronome tick
      8,  // 32nd notes per quarter note
    ],
  });
}

/**
 * Add automation curves as CC events
 */
function addAutomationToTracks(
  tracks: MIDITrack[],
  curves: AutomationCurve[],
  patterns: Pattern[],
  patternStarts: Map<string, number>
): void {
  for (const curve of curves) {
    if (!curve.enabled) continue;

    const ccNumber = AUTOMATION_CC_MAP[curve.parameter];
    if (!ccNumber) continue;

    const pattern = patterns.find((p) => p.id === curve.patternId);
    if (!pattern) continue;

    const startTick = patternStarts.get(curve.patternId) || 0;
    const midiChannel = curve.channelIndex % 16;

    // Find or create track for this channel
    let track: MIDITrack | undefined;
    if (tracks.length > 1) {
      track = tracks.find(
        (t) =>
          t.name.includes(`Channel ${curve.channelIndex + 1}`) ||
          t.name === pattern.channels[curve.channelIndex]?.name
      );
    }
    if (!track) track = tracks[0];

    // Add CC events for each automation point
    for (const point of curve.points) {
      const tick = startTick + rowToTick(point.row);
      const ccValue = Math.round(point.value * 127);

      track.events.push({
        tick,
        type: 'cc',
        channel: midiChannel,
        data: [ccNumber, ccValue],
      });
    }

    // Sort events
    track.events.sort((a, b) => a.tick - b.tick);
  }
}

/**
 * Generate MIDI file binary data
 */
function generateMIDIFile(tracks: MIDITrack[], type: 0 | 1): Uint8Array {
  const chunks: Uint8Array[] = [];

  // Header chunk
  chunks.push(generateHeader(type, tracks.length, MIDI_TICKS_PER_QUARTER_NOTE));

  // Track chunks
  for (const track of tracks) {
    chunks.push(generateTrackChunk(track));
  }

  // Concatenate all chunks
  return concatenateUint8Arrays(chunks);
}

/**
 * Generate MIDI header chunk
 */
function generateHeader(type: 0 | 1, numTracks: number, ppq: number): Uint8Array {
  const header = new Uint8Array(14);
  const view = new DataView(header.buffer);

  // "MThd" magic
  header[0] = 0x4d;
  header[1] = 0x54;
  header[2] = 0x68;
  header[3] = 0x64;

  // Header length (always 6)
  view.setUint32(4, 6, false);

  // Format type
  view.setUint16(8, type, false);

  // Number of tracks
  view.setUint16(10, numTracks, false);

  // Ticks per quarter note
  view.setUint16(12, ppq, false);

  return header;
}

/**
 * Generate a track chunk
 */
function generateTrackChunk(track: MIDITrack): Uint8Array {
  const eventData: Uint8Array[] = [];

  // Track name meta event
  const nameBytes = new TextEncoder().encode(track.name);
  eventData.push(writeVLQ(0)); // Delta time 0
  eventData.push(new Uint8Array([0xff, META_EVENT.TRACK_NAME, nameBytes.length]));
  eventData.push(nameBytes);

  // Sort events by tick
  const sortedEvents = [...track.events].sort((a, b) => a.tick - b.tick);

  // Convert to delta times and write events
  let lastTick = 0;
  for (const event of sortedEvents) {
    const delta = event.tick - lastTick;
    eventData.push(writeVLQ(delta));
    eventData.push(encodeEvent(event));
    lastTick = event.tick;
  }

  // End of track
  eventData.push(writeVLQ(0));
  eventData.push(new Uint8Array([0xff, META_EVENT.END_OF_TRACK, 0x00]));

  // Calculate track data length
  const trackData = concatenateUint8Arrays(eventData);

  // Build track chunk
  const chunk = new Uint8Array(8 + trackData.length);
  const view = new DataView(chunk.buffer);

  // "MTrk" magic
  chunk[0] = 0x4d;
  chunk[1] = 0x54;
  chunk[2] = 0x72;
  chunk[3] = 0x6b;

  // Track length
  view.setUint32(4, trackData.length, false);

  // Track data
  chunk.set(trackData, 8);

  return chunk;
}

/**
 * Encode a MIDI event to bytes
 */
function encodeEvent(event: MIDIEvent): Uint8Array {
  switch (event.type) {
    case 'noteOn':
      return new Uint8Array([0x90 | event.channel, event.data[0], event.data[1]]);
    case 'noteOff':
      return new Uint8Array([0x80 | event.channel, event.data[0], event.data[1]]);
    case 'cc':
      return new Uint8Array([0xb0 | event.channel, event.data[0], event.data[1]]);
    case 'meta':
      return new Uint8Array([0xff, ...event.data]);
    default:
      return new Uint8Array([]);
  }
}

/**
 * Write variable-length quantity (VLQ)
 */
function writeVLQ(value: number): Uint8Array {
  if (value === 0) {
    return new Uint8Array([0]);
  }

  const bytes: number[] = [];
  let v = value;

  bytes.push(v & 0x7f);
  v >>= 7;

  while (v > 0) {
    bytes.push((v & 0x7f) | 0x80);
    v >>= 7;
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}
