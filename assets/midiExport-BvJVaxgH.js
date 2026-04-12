import { di as xmNoteToMidi } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const MIDI_TICKS_PER_QUARTER_NOTE = 480;
const ROWS_PER_BEAT = 4;
const DEFAULT_MIDI_EXPORT_OPTIONS = {
  type: 1,
  includeAutomation: true,
  velocityScale: 1,
  exportMutedChannels: false
};
const AUTOMATION_CC_MAP = {
  cutoff: 74,
  // CC 74 - Brightness/Filter Cutoff
  resonance: 71,
  // CC 71 - Filter Resonance
  volume: 7,
  // CC 7 - Channel Volume
  pan: 10,
  // CC 10 - Pan Position
  envMod: 78,
  // CC 78 - Sound Control 9
  decay: 75,
  // CC 75 - Sound Control 6
  overdrive: 76,
  // CC 76 - Sound Control 7
  distortion: 76,
  // Same as overdrive
  delay: 91,
  // CC 91 - Effects Depth
  reverb: 91
  // CC 91 - Effects Depth
};
const META_EVENT = {
  TRACK_NAME: 3,
  END_OF_TRACK: 47,
  SET_TEMPO: 81,
  TIME_SIGNATURE: 88
};
function exportPatternToMIDI(pattern, bpm, timeSignature, options = {}) {
  const opts = { ...DEFAULT_MIDI_EXPORT_OPTIONS, ...options };
  const tracks = createTracksFromPattern(pattern, opts);
  addTempoAndTimeSignature(tracks[0], bpm, timeSignature);
  return generateMIDIFile(tracks, opts.type);
}
function exportSongToMIDI(patterns, sequence, bpm, timeSignature, automationCurves, options = {}) {
  const opts = { ...DEFAULT_MIDI_EXPORT_OPTIONS, ...options };
  const orderedPatterns = sequence.map((id) => patterns.find((p) => p.id === id)).filter((p) => p !== void 0);
  if (orderedPatterns.length === 0) {
    throw new Error("No patterns found in sequence");
  }
  let currentTick = 0;
  const patternStarts = /* @__PURE__ */ new Map();
  for (const pattern of orderedPatterns) {
    patternStarts.set(pattern.id, currentTick);
    currentTick += patternLengthToTicks(pattern.length);
  }
  const tracks = createTracksFromPatterns(orderedPatterns, patternStarts, opts);
  if (opts.includeAutomation && automationCurves.length > 0) {
    addAutomationToTracks(tracks, automationCurves, orderedPatterns, patternStarts);
  }
  addTempoAndTimeSignature(tracks[0], bpm, timeSignature);
  return generateMIDIFile(tracks, opts.type);
}
function createTracksFromPattern(pattern, options) {
  const tracks = [];
  if (options.type === 0) {
    const track = { name: pattern.name || "Pattern", events: [] };
    pattern.channels.forEach((channel, channelIndex) => {
      if (!options.exportMutedChannels && channel.muted) return;
      const midiChannel = channelIndex % 16;
      const events = channelToEvents(channel, midiChannel, 0, options);
      track.events.push(...events);
    });
    track.events.sort((a, b) => a.tick - b.tick);
    tracks.push(track);
  } else {
    tracks.push({ name: "Tempo", events: [] });
    pattern.channels.forEach((channel, channelIndex) => {
      if (!options.exportMutedChannels && channel.muted) return;
      const midiChannel = channelIndex % 16;
      const track = {
        name: channel.name || `Channel ${channelIndex + 1}`,
        events: channelToEvents(channel, midiChannel, 0, options)
      };
      tracks.push(track);
    });
  }
  return tracks;
}
function createTracksFromPatterns(patterns, patternStarts, options) {
  const tracks = [];
  const maxChannels = Math.max(...patterns.map((p) => p.channels.length));
  if (options.type === 0) {
    const track = { name: "Song", events: [] };
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
    tracks.push({ name: "Tempo", events: [] });
    for (let channelIndex = 0; channelIndex < maxChannels; channelIndex++) {
      const track = {
        name: `Channel ${channelIndex + 1}`,
        events: []
      };
      const midiChannel = channelIndex % 16;
      patterns.forEach((pattern) => {
        const startTick = patternStarts.get(pattern.id) || 0;
        const channel = pattern.channels[channelIndex];
        if (!channel) return;
        if (!options.exportMutedChannels && channel.muted) return;
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
function channelToEvents(channel, midiChannel, startTick, options) {
  const events = [];
  const patternLength = channel.rows.length;
  for (let row = 0; row < patternLength; row++) {
    const cell = channel.rows[row];
    if (!cell.note || cell.note === 0) continue;
    if (cell.note === 97) continue;
    const midiNote = xmNoteToMidi(cell.note);
    if (midiNote === null) continue;
    const tick = startTick + rowToTick(row);
    const velocity = volumeToVelocity(cell.volume, options.velocityScale);
    const durationRows = calculateNoteDuration(channel.rows, row, patternLength);
    const durationTicks = Math.max(1, rowToTick(durationRows));
    events.push({
      tick,
      type: "noteOn",
      channel: midiChannel,
      data: [midiNote, velocity]
    });
    events.push({
      tick: tick + durationTicks,
      type: "noteOff",
      channel: midiChannel,
      data: [midiNote, 0]
    });
  }
  return events;
}
function calculateNoteDuration(rows, startRow, patternLength) {
  for (let row = startRow + 1; row < patternLength; row++) {
    const cell = rows[row];
    if (cell.note === 97) {
      return row - startRow;
    }
    if (cell.note && cell.note !== 0 && cell.note !== 97) {
      return row - startRow;
    }
  }
  return patternLength - startRow;
}
function rowToTick(row) {
  return row * (MIDI_TICKS_PER_QUARTER_NOTE / ROWS_PER_BEAT);
}
function patternLengthToTicks(length) {
  return length * (MIDI_TICKS_PER_QUARTER_NOTE / ROWS_PER_BEAT);
}
function volumeToVelocity(volume, scale) {
  const vol = volume ?? 64;
  const velocity = Math.round(vol / 64 * 127 * scale);
  return Math.max(1, Math.min(127, velocity));
}
function addTempoAndTimeSignature(track, bpm, timeSignature) {
  const microsecondsPerBeat = Math.round(6e7 / bpm);
  track.events.unshift({
    tick: 0,
    type: "meta",
    channel: 0,
    data: [
      META_EVENT.SET_TEMPO,
      3,
      // Length
      microsecondsPerBeat >> 16 & 255,
      microsecondsPerBeat >> 8 & 255,
      microsecondsPerBeat & 255
    ]
  });
  const [numerator, denominator] = timeSignature;
  const denomLog2 = Math.log2(denominator);
  track.events.unshift({
    tick: 0,
    type: "meta",
    channel: 0,
    data: [
      META_EVENT.TIME_SIGNATURE,
      4,
      // Length
      numerator,
      denomLog2,
      24,
      // MIDI clocks per metronome tick
      8
      // 32nd notes per quarter note
    ]
  });
}
function addAutomationToTracks(tracks, curves, patterns, patternStarts) {
  for (const curve of curves) {
    if (!curve.enabled) continue;
    const ccNumber = AUTOMATION_CC_MAP[curve.parameter];
    if (!ccNumber) continue;
    const pattern = patterns.find((p) => p.id === curve.patternId);
    if (!pattern) continue;
    const startTick = patternStarts.get(curve.patternId) || 0;
    const midiChannel = curve.channelIndex % 16;
    let track;
    if (tracks.length > 1) {
      track = tracks.find(
        (t) => {
          var _a;
          return t.name.includes(`Channel ${curve.channelIndex + 1}`) || t.name === ((_a = pattern.channels[curve.channelIndex]) == null ? void 0 : _a.name);
        }
      );
    }
    if (!track) track = tracks[0];
    for (const point of curve.points) {
      const tick = startTick + rowToTick(point.row);
      const ccValue = Math.round(point.value * 127);
      track.events.push({
        tick,
        type: "cc",
        channel: midiChannel,
        data: [ccNumber, ccValue]
      });
    }
    track.events.sort((a, b) => a.tick - b.tick);
  }
}
function generateMIDIFile(tracks, type) {
  const chunks = [];
  chunks.push(generateHeader(type, tracks.length, MIDI_TICKS_PER_QUARTER_NOTE));
  for (const track of tracks) {
    chunks.push(generateTrackChunk(track));
  }
  return concatenateUint8Arrays(chunks);
}
function generateHeader(type, numTracks, ppq) {
  const header = new Uint8Array(14);
  const view = new DataView(header.buffer);
  header[0] = 77;
  header[1] = 84;
  header[2] = 104;
  header[3] = 100;
  view.setUint32(4, 6, false);
  view.setUint16(8, type, false);
  view.setUint16(10, numTracks, false);
  view.setUint16(12, ppq, false);
  return header;
}
function generateTrackChunk(track) {
  const eventData = [];
  const nameBytes = new TextEncoder().encode(track.name);
  eventData.push(writeVLQ(0));
  eventData.push(new Uint8Array([255, META_EVENT.TRACK_NAME, nameBytes.length]));
  eventData.push(nameBytes);
  const sortedEvents = [...track.events].sort((a, b) => a.tick - b.tick);
  let lastTick = 0;
  for (const event of sortedEvents) {
    const delta = event.tick - lastTick;
    eventData.push(writeVLQ(delta));
    eventData.push(encodeEvent(event));
    lastTick = event.tick;
  }
  eventData.push(writeVLQ(0));
  eventData.push(new Uint8Array([255, META_EVENT.END_OF_TRACK, 0]));
  const trackData = concatenateUint8Arrays(eventData);
  const chunk = new Uint8Array(8 + trackData.length);
  const view = new DataView(chunk.buffer);
  chunk[0] = 77;
  chunk[1] = 84;
  chunk[2] = 114;
  chunk[3] = 107;
  view.setUint32(4, trackData.length, false);
  chunk.set(trackData, 8);
  return chunk;
}
function encodeEvent(event) {
  switch (event.type) {
    case "noteOn":
      return new Uint8Array([144 | event.channel, event.data[0], event.data[1]]);
    case "noteOff":
      return new Uint8Array([128 | event.channel, event.data[0], event.data[1]]);
    case "cc":
      return new Uint8Array([176 | event.channel, event.data[0], event.data[1]]);
    case "meta":
      return new Uint8Array([255, ...event.data]);
    default:
      return new Uint8Array([]);
  }
}
function writeVLQ(value) {
  if (value === 0) {
    return new Uint8Array([0]);
  }
  const bytes = [];
  let v = value;
  bytes.push(v & 127);
  v >>= 7;
  while (v > 0) {
    bytes.push(v & 127 | 128);
    v >>= 7;
  }
  return new Uint8Array(bytes.reverse());
}
function concatenateUint8Arrays(arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
export {
  exportPatternToMIDI,
  exportSongToMIDI
};
