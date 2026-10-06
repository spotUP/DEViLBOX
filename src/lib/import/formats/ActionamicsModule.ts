/**
 * ActionamicsModule.ts - an Actionamics Sound Tool module as a model, and its
 * exact inverse.
 *
 * File layout (from the loader the WASM replayer ports, ActionamicsWorker):
 *   0   u16 BE  tempo
 *   2   u32 BE x15 section lengths
 *   62  "ACTIONAMICS SOUND TOOL", then the sections in order:
 *     [0] skipped, then the module info (u32 total length)  [1] skipped
 *     [2][3][4] position lists: track numbers, instrument transposes, note
 *               transposes - 4 voices x (length/4) positions each, one byte
 *     [5] instruments (32 bytes)   [6][7][8] 16-byte sample number /
 *     arpeggio / frequency lists   [9][10] skipped   [11] sub-songs (start,
 *     end, loop, speed)   [12] skipped   [13] samples (64-byte headers)
 *     [14] track offset table (u16 BE, one more than there are tracks), then
 *     the track data, then the sample PCM (ending at the total length)
 *
 * A track is a stream of events, one voice, read a row at a time:
 *   0x80..0xFF   delay: this row is empty and so are the next ~byte rows
 *   0x70..0x7F   effect, one argument byte
 *   0x00..0x6F   a note, then
 *                  delay byte / effect (0x70..) + argument /
 *                  instrument byte, then a delay byte or any effect byte
 *                  + argument
 * The decoder keeps every byte of every track as events (an event is the
 * bytes of one row and the delay run it carries), so encode(decode(file)) is
 * the file. Only the track region is re-encoded; every other byte is the
 * original's, with the total length corrected.
 */

export const AST_SIGNATURE = 'ACTIONAMICS SOUND TOOL';

/** One row's bytes and the empty rows its delay byte carries. */
export interface AstTrackEvent {
  /** 'delay': a delay byte alone; 'effect': effect + argument; 'note': note byte first. */
  form: 'delay' | 'effect' | 'note';
  /** The note byte (form 'note'). */
  note: number;
  /** The instrument byte, or null when the row names none (form 'note'). */
  instrument: number | null;
  /** The effect byte, or null (forms 'effect' and 'note'). */
  effect: number | null;
  arg: number;
  /** Empty rows that follow (from the delay byte), or null when the row has no delay byte. */
  delay: number | null;
}

export interface AstTrack {
  events: AstTrackEvent[];
  /** Bytes after the last whole event (a truncated event), kept verbatim. */
  tail: number[];
}

export interface AstPosition { track: number; noteTranspose: number; instrumentTranspose: number }

export interface AstInstrument {
  sampleList: number;
  arpeggioList: number;
  frequencyList: number;
  /** Signed: added to the note of every note the instrument plays. */
  noteTranspose: number;
}

export interface AstSample {
  name: string;
  length: number;
  loopStart: number;
  loopLength: number;
  /** The arpeggio list the sample names (high byte of its effect length). */
  arpeggioList: number;
  /** File offset of the 64-byte header. */
  headerOffset: number;
}

export interface AstSongInfo { start: number; end: number; loop: number; speed: number }

export interface ActionamicsModule {
  tempo: number;
  lengths: number[];
  /** positions[voice][position]. */
  positions: AstPosition[][];
  instruments: AstInstrument[];
  sampleLists: number[][];
  arpeggioLists: number[][];
  songs: AstSongInfo[];
  samples: AstSample[];
  tracks: AstTrack[];
  /** Offsets, for the encoder: the track offset table and the module info word. */
  tracksOffset: number;
  moduleInfoOffset: number;
  totalLength: number;
  /** Where the sample PCM starts and the sample PCM itself, as the file holds them. */
  samplePcm: Int8Array[];
  /** The file as read; encode copies everything outside the track region from it. */
  image: Uint8Array;
}

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const s8 = (v: number): number => (v < 128 ? v : v - 256);

export function isActionamicsModule(b: Uint8Array): boolean {
  if (b.length < 90) return false;
  for (let i = 0; i < AST_SIGNATURE.length; i++) if (b[62 + i] !== AST_SIGNATURE.charCodeAt(i)) return false;
  return true;
}

/** Decode a track's bytes into events (every byte accounted for). */
export function decodeAstTrack(data: Uint8Array): AstTrack {
  const events: AstTrackEvent[] = [];
  let p = 0;
  let done = 0;   // bytes consumed by whole events
  const need = (n: number): boolean => p + n <= data.length;
  while (p < data.length) {
    const b0 = data[p];
    let ev: AstTrackEvent;
    if (b0 & 0x80) {
      ev = { form: 'delay', note: 0, instrument: null, effect: null, arg: 0, delay: (~b0) & 0xff };
      p += 1;
    } else if (b0 >= 0x70) {
      if (!need(2)) break;
      ev = { form: 'effect', note: 0, instrument: null, effect: b0, arg: data[p + 1], delay: null };
      p += 2;
    } else {
      if (!need(2)) break;
      const b1 = data[p + 1];
      if (b1 & 0x80) {
        ev = { form: 'note', note: b0, instrument: null, effect: null, arg: 0, delay: (~b1) & 0xff };
        p += 2;
      } else if (b1 >= 0x70) {
        if (!need(3)) break;
        ev = { form: 'note', note: b0, instrument: null, effect: b1, arg: data[p + 2], delay: null };
        p += 3;
      } else {
        if (!need(3)) break;
        const b2 = data[p + 2];
        if (b2 & 0x80) {
          ev = { form: 'note', note: b0, instrument: b1, effect: null, arg: 0, delay: (~b2) & 0xff };
          p += 3;
        } else {
          if (!need(4)) break;
          ev = { form: 'note', note: b0, instrument: b1, effect: b2, arg: data[p + 3], delay: null };
          p += 4;
        }
      }
    }
    events.push(ev);
    done = p;
  }
  return { events, tail: Array.from(data.subarray(done)) };
}

/** The bytes of a track. */
export function encodeAstTrack(track: AstTrack): Uint8Array {
  const out: number[] = [];
  for (const e of track.events) {
    if (e.form === 'delay') { out.push((~(e.delay ?? 0)) & 0xff); continue; }
    if (e.form === 'effect') { out.push(e.effect ?? 0x70, e.arg & 0xff); continue; }
    out.push(e.note & 0xff);
    if (e.instrument !== null) out.push(e.instrument & 0xff);
    if (e.effect !== null) out.push(e.effect & 0xff, e.arg & 0xff);
    else out.push((~(e.delay ?? 0)) & 0xff);
    continue;
  }
  out.push(...track.tail);
  return Uint8Array.from(out);
}

/** The event that starts at each row of a track and the rows it spans (rows without one are null). */
export function astTrackRows(track: AstTrack): Array<AstTrackEvent | null> {
  const rows: Array<AstTrackEvent | null> = [];
  for (const e of track.events) {
    rows.push(e);
    for (let i = 0; i < (e.delay ?? 0); i++) rows.push(null);
  }
  return rows;
}

function readLists(b: Uint8Array, offset: number, length: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < Math.floor(length / 16); i++) {
    out.push(Array.from({ length: 16 }, (_, j) => s8(b[offset + i * 16 + j])));
  }
  return out;
}

/** Decode a module; null when it is not one or its sections do not fit the file. */
export function decodeActionamicsModule(b: Uint8Array): ActionamicsModule | null {
  if (!isActionamicsModule(b)) return null;
  const len = b.length;
  const tempo = u16(b, 0);
  const lengths = Array.from({ length: 15 }, (_, i) => u32(b, 2 + i * 4));

  const moduleInfoOffset = 62 + lengths[0];
  if (moduleInfoOffset + 4 > len) return null;
  const totalLength = u32(b, moduleInfoOffset);

  const positionsOffset = moduleInfoOffset + lengths[1];
  const [trackLen, instrLen, noteLen] = [lengths[2], lengths[3], lengths[4]];
  if (trackLen !== instrLen || trackLen !== noteLen) return null;
  const numPositions = Math.floor(trackLen / 4);
  if (positionsOffset + trackLen * 3 > len) return null;
  const positions: AstPosition[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: numPositions }, () => ({ track: 0, noteTranspose: 0, instrumentTranspose: 0 })));
  let p = positionsOffset;
  for (let v = 0; v < 4; v++) for (let j = 0; j < numPositions; j++) positions[v][j].track = b[p++];
  for (let v = 0; v < 4; v++) for (let j = 0; j < numPositions; j++) positions[v][j].noteTranspose = s8(b[p++]);
  for (let v = 0; v < 4; v++) for (let j = 0; j < numPositions; j++) positions[v][j].instrumentTranspose = s8(b[p++]);

  const instrumentsOffset = positionsOffset + trackLen * 3;
  if (instrumentsOffset + lengths[5] > len) return null;
  const instruments: AstInstrument[] = [];
  for (let i = 0; i < Math.floor(lengths[5] / 32); i++) {
    const o = instrumentsOffset + i * 32;
    instruments.push({ sampleList: b[o], arpeggioList: b[o + 4], frequencyList: b[o + 8], noteTranspose: s8(b[o + 14]) });
  }

  const sampleListOffset = instrumentsOffset + lengths[5];
  const arpeggioOffset = sampleListOffset + lengths[6];
  const frequencyOffset = arpeggioOffset + lengths[7];
  const sampleLists = readLists(b, sampleListOffset, lengths[6]);
  const arpeggioLists = readLists(b, arpeggioOffset, lengths[7]);

  const songsOffset = frequencyOffset + lengths[8] + lengths[9] + lengths[10];
  if (songsOffset + lengths[11] > len) return null;
  const allSongs: AstSongInfo[] = [];
  for (let i = 0; i < Math.floor(lengths[11] / 4); i++) {
    const o = songsOffset + i * 4;
    allSongs.push({ start: b[o], end: b[o + 1], loop: b[o + 2], speed: b[o + 3] });
  }
  // The loader drops all-zero entries (start, end and loop 0).
  const songs = allSongs.filter((s) => s.start !== 0 || s.end !== 0 || s.loop !== 0);
  if (songs.length === 0) return null;

  const samplesOffset = songsOffset + lengths[11] + lengths[12];
  if (samplesOffset + lengths[13] > len) return null;
  const samples: AstSample[] = [];
  for (let i = 0; i < Math.floor(lengths[13] / 64); i++) {
    const o = samplesOffset + i * 64;
    let name = '';
    for (let k = 0; k < 32; k++) { const c = b[o + 32 + k]; if (c === 0) break; if (c >= 32 && c < 128) name += String.fromCharCode(c); }
    samples.push({
      name: name.trim(), length: u16(b, o + 4), loopStart: u16(b, o + 6), loopLength: u16(b, o + 8),
      arpeggioList: b[o + 12], headerOffset: o,
    });
  }

  const tracksOffset = samplesOffset + lengths[13];
  const numOffsets = Math.floor(lengths[14] / 2);
  if (numOffsets < 1 || tracksOffset + lengths[14] > len) return null;
  const offsets = Array.from({ length: numOffsets }, (_, i) => u16(b, tracksOffset + i * 2));
  const dataStart = tracksOffset + lengths[14];
  // Tracks must tile the data in order: that is what makes the re-encoding exact.
  if (offsets[0] !== 0) return null;
  for (let i = 1; i < numOffsets; i++) if (offsets[i] < offsets[i - 1]) return null;
  if (dataStart + offsets[numOffsets - 1] > len) return null;
  const tracks: AstTrack[] = [];
  for (let i = 0; i < numOffsets - 1; i++) {
    tracks.push(decodeAstTrack(b.subarray(dataStart + offsets[i], dataStart + offsets[i + 1])));
  }

  // The PCM: the last sum(length*2) bytes before the total length.
  const pcmBytes = samples.reduce((a, s) => a + s.length * 2, 0);
  const pcmStart = totalLength - pcmBytes;
  const samplePcm: Int8Array[] = [];
  if (pcmStart >= 0 && totalLength <= len) {
    let o = pcmStart;
    for (const s of samples) {
      samplePcm.push(new Int8Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + s.length * 2)));
      o += s.length * 2;
    }
  }

  return {
    tempo, lengths, positions, instruments, sampleLists, arpeggioLists, songs, samples, tracks,
    tracksOffset, moduleInfoOffset, totalLength, samplePcm, image: b.slice(),
  };
}

/** The module's bytes; identical to the decoded file until a track changes. */
export function encodeActionamicsModule(m: ActionamicsModule): Uint8Array {
  const img = m.image;
  const numOffsets = Math.floor(m.lengths[14] / 2);
  const dataStart = m.tracksOffset + m.lengths[14];
  const oldData = u16(img, m.tracksOffset + (numOffsets - 1) * 2);
  const encoded = m.tracks.map(encodeAstTrack);
  const offsets: number[] = [0];
  for (const t of encoded) offsets.push(offsets[offsets.length - 1] + t.length);
  const newData = offsets[offsets.length - 1];
  if (offsets.length !== numOffsets) throw new Error('Actionamics: the number of tracks cannot change');
  if (newData > 0xffff) throw new Error('Actionamics: track data does not fit the 16-bit offset table');
  const out = new Uint8Array(dataStart + newData + (img.length - dataStart - oldData));
  out.set(img.subarray(0, m.tracksOffset), 0);
  offsets.forEach((o, i) => { out[m.tracksOffset + i * 2] = o >> 8; out[m.tracksOffset + i * 2 + 1] = o & 0xff; });
  let w = dataStart;
  for (const t of encoded) { out.set(t, w); w += t.length; }
  out.set(img.subarray(dataStart + oldData), w);
  const total = (m.totalLength + newData - oldData) >>> 0;
  out[m.moduleInfoOffset] = total >>> 24; out[m.moduleInfoOffset + 1] = (total >>> 16) & 0xff;
  out[m.moduleInfoOffset + 2] = (total >>> 8) & 0xff; out[m.moduleInfoOffset + 3] = total & 0xff;
  return out;
}
