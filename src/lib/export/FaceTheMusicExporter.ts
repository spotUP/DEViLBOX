/**
 * FaceTheMusicExporter.ts — Export TrackerSong as Face The Music (.ftm) format
 *
 * Reconstructs the native FTM binary from a TrackerSong. The format uses
 * 8 channels with compressed event streams and embedded IFF samples.
 *
 * File layout (all big-endian):
 *   Header (82 bytes):
 *     magic[4]        "FTMN"
 *     version(u8)     3
 *     numSamples(u8)  0-63
 *     numMeasures(u16BE)
 *     tempo(u16BE)    BPM → tempo = round(1777517.482 / BPM)
 *     tonality(u8)    0
 *     muteStatus(u8)  bitmask
 *     globalVolume(u8) 0-63
 *     flags(u8)       0x01 = embedded samples
 *     ticksPerRow(u8)
 *     rowsPerMeasure(u8)
 *     title[32]
 *     artist[32]
 *     numEffects(u8)  0
 *     padding(u8)     0
 *   Sample headers: numSamples × 32 bytes (name[30], unknown, iffOctave)
 *   Effect table: (empty, numEffects = 0)
 *   Channel data: 8 channels × (defaultSpacing(u16BE) + chunkSize(u32BE) + event stream)
 *   Sample data: per sample (loopStart(u16BE words) + loopLength(u16BE words) + PCM)
 *
 * Reference: FaceTheMusicParser.ts (authoritative parser)
 * Reference: FaceTheMusicEncoder.ts (event stream encoding, shared with the chip-RAM path)
 *
 * A loaded .ftm exports as its own bytes with edited channel streams spliced
 * in (rebuildFaceTheMusicModule); the from-scratch writer is for songs with
 * no FTM file behind them.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { EMPTY_CELL, type TrackerCell } from '@/types';
import { encodeFtmEventStream } from '@/engine/uade/encoders/FaceTheMusicEncoder';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { parseFaceTheMusicFile } from '@/lib/import/formats/FaceTheMusicParser';

// -- Constants ---------------------------------------------------------------

const NUM_CHANNELS = 8;
const HEADER_SIZE = 82;
const SAMPLE_HDR_SIZE = 32;
const MAX_SAMPLES = 63;

// -- Export result type ------------------------------------------------------

export interface FaceTheMusicExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// -- Binary helpers ----------------------------------------------------------

function writeU8(view: DataView, off: number, val: number): void {
  view.setUint8(off, val & 0xFF);
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val >>> 0, false);
}

function writeString(view: DataView, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    view.setUint8(off + i, i < str.length ? str.charCodeAt(i) & 0x7F : 0);
  }
}

// -- Channel event streams ---------------------------------------------------

/** One channel's grid rows across all measures, each measure padded to its row count. */
function channelRows(patterns: TrackerSong['patterns'], numMeasures: number, channelIdx: number, rowsPerMeasure: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let m = 0; m < numMeasures; m++) {
    const src = patterns[m]?.channels[channelIdx]?.rows ?? [];
    for (let r = 0; r < rowsPerMeasure; r++) rows.push(src[r] ?? EMPTY_CELL);
  }
  return rows;
}

/**
 * The loaded module with the grid's edits written in: every channel whose
 * rows differ from the file's own (re-parsed) grid gets a re-encoded event
 * stream under the file's default spacing; every other byte (header, effect
 * scripts, untouched channels, samples) is the original's. Null when the
 * original does not parse.
 */
function rebuildFaceTheMusicModule(
  original: Uint8Array,
  patterns: TrackerSong['patterns'],
  warnings: string[],
): Uint8Array | null {
  const base = parseFaceTheMusicFile(original, 'original.ftm');
  const layout = base?.uadeVariableLayout;
  if (!base || !layout || layout.filePatternAddrs.length === 0) return null;
  const rowsPerMeasure = layout.rowsPerPattern as number;
  const numMeasures = base.patterns.length;
  if (patterns.length !== numMeasures) {
    warnings.push(`FTM keeps its ${numMeasures} measures; ${patterns.length} grid patterns were given.`);
  }

  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const parts: Uint8Array[] = [original.subarray(0, layout.filePatternAddrs[0] - 6)];
  let end = 0;
  layout.filePatternAddrs.forEach((addr, ch) => {
    const size = layout.filePatternSizes[ch];
    const defaultSpacing = view.getUint16(addr - 6, false);
    const edited = channelRows(patterns, numMeasures, ch, rowsPerMeasure);
    const loaded = channelRows(base.patterns, numMeasures, ch, rowsPerMeasure);
    const unchanged = edited.every((c, i) => cellFieldsEqual(c, loaded[i]));
    const stream = unchanged ? original.subarray(addr, addr + size) : encodeFtmEventStream(edited, defaultSpacing);
    const head = new Uint8Array(6);
    new DataView(head.buffer).setUint16(0, defaultSpacing, false);
    new DataView(head.buffer).setUint32(2, stream.length, false);
    parts.push(head, stream);
    end = addr + size;
  });
  parts.push(original.subarray(end));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// -- Sample extraction -------------------------------------------------------

interface SampleData {
  name: string;
  pcm: Uint8Array;
  loopStartWords: number;
  loopLengthWords: number;
}

function extractSample(
  inst: TrackerSong['instruments'][number],
  warnings: string[],
): SampleData | null {
  const name = (inst.name || '').slice(0, 30);
  if (!name) return null;

  const sample = inst.sample;
  if (!sample?.audioBuffer) return null;

  // Decode WAV audioBuffer to 8-bit signed PCM
  const wav = new DataView(sample.audioBuffer);

  // Find data chunk — simple WAV: data starts at offset 44
  // but be defensive about it
  let dataOffset = 44;
  let dataLen = 0;

  if (wav.byteLength >= 44) {
    dataLen = wav.getUint32(40, true);
  }
  if (dataLen === 0 || dataOffset + dataLen > wav.byteLength) {
    dataLen = wav.byteLength - dataOffset;
  }
  if (dataLen <= 0) return null;

  // Determine bits per sample from WAV header
  let bitsPerSample = 16;
  if (wav.byteLength >= 36) {
    bitsPerSample = wav.getUint16(34, true);
  }

  let frames: number;
  const bytesPerFrame = bitsPerSample / 8;
  frames = Math.floor(dataLen / bytesPerFrame);
  if (frames <= 0) return null;

  // Ensure even length (FTM stores lengths in words)
  if (frames % 2 !== 0) frames--;

  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    if (bitsPerSample === 16) {
      const s16 = wav.getInt16(dataOffset + j * 2, true);
      pcm[j] = (s16 >> 8) & 0xFF;
    } else {
      // 8-bit: unsigned in WAV → signed for FTM
      pcm[j] = (wav.getUint8(dataOffset + j) - 128) & 0xFF;
    }
  }

  const loopStart = sample.loopStart ?? 0;
  const loopEnd = sample.loopEnd ?? 0;
  const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;

  // Validate loop points against PCM length
  const clampedLoopStart = Math.min(loopStart, frames);
  const clampedLoopLength = loopLength > 0
    ? Math.min(loopLength, frames - clampedLoopStart)
    : 0;

  if (loopStart > frames || (loopLength > 0 && loopStart + loopLength > frames)) {
    warnings.push(`Sample "${name}": loop points clamped to fit PCM length.`);
  }

  return {
    name,
    pcm,
    loopStartWords: Math.floor(clampedLoopStart / 2),
    loopLengthWords: clampedLoopLength > 0 ? Math.floor(clampedLoopLength / 2) : Math.floor(frames / 2),
  };
}

// -- Main exporter -----------------------------------------------------------

export async function exportFaceTheMusic(
  song: TrackerSong,
): Promise<FaceTheMusicExportResult> {
  const warnings: string[] = [];
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.ftm`;

  // A loaded FTM: its own bytes with the edits written in (keeps the effect
  // scripts, artist, tempo and samples a from-scratch file cannot rebuild).
  if (song.faceTheMusicFileData) {
    const rebuilt = rebuildFaceTheMusicModule(new Uint8Array(song.faceTheMusicFileData), song.patterns, warnings);
    if (rebuilt) {
      return { data: new Blob([rebuilt as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), filename, warnings };
    }
  }

  // -- Determine format parameters ------------------------------------------

  const numChannels = Math.min(NUM_CHANNELS, song.numChannels ?? NUM_CHANNELS);
  if ((song.numChannels ?? NUM_CHANNELS) > NUM_CHANNELS) {
    warnings.push(`FTM supports max ${NUM_CHANNELS} channels; extra channels will be dropped.`);
  }

  const numSamples = Math.min(MAX_SAMPLES, song.instruments.length);
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`FTM supports max ${MAX_SAMPLES} samples; ${song.instruments.length - MAX_SAMPLES} will be dropped.`);
  }

  const numMeasures = song.songPositions.length;
  const initialBPM = song.initialBPM ?? 125;
  const tempo = Math.round(1777517.482 / initialBPM);
  const clampedTempo = Math.max(0x1000, Math.min(0x4FFF, tempo));

  const ticksPerRow = Math.max(1, Math.min(24, song.initialSpeed ?? 6));
  const rowsPerMeasure = Math.floor(96 / ticksPerRow);

  // Derive mute status from first pattern's channel mute flags
  let muteStatus = 0;
  if (song.patterns.length > 0) {
    const firstPat = song.patterns[song.songPositions[0] ?? 0];
    if (firstPat) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (firstPat.channels[ch]?.muted) {
          muteStatus |= (1 << ch);
        }
      }
    }
  }

  const globalVolume = 63; // FTM max

  // -- Collect sample data --------------------------------------------------

  const samples: (SampleData | null)[] = [];
  for (let i = 0; i < numSamples; i++) {
    const inst = song.instruments[i];
    if (inst) {
      samples.push(extractSample(inst, warnings));
    } else {
      samples.push(null);
    }
  }

  // -- Encode channel event streams -----------------------------------------

  const channelStreams: Uint8Array[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    if (ch < numChannels) {
      const measures = song.songPositions.map((p) => song.patterns[p]);
      channelStreams.push(encodeFtmEventStream(channelRows(measures, measures.length, ch, rowsPerMeasure), 0));
    } else {
      channelStreams.push(new Uint8Array(0));
    }
  }

  // -- Calculate total file size --------------------------------------------

  let totalSize = HEADER_SIZE;

  // Sample headers
  totalSize += numSamples * SAMPLE_HDR_SIZE;

  // No effects (numEffects = 0)

  // Channel data: per channel = 2 (defaultSpacing) + 4 (chunkSize) + stream bytes
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    totalSize += 2 + 4 + channelStreams[ch].length;
  }

  // Sample data: per sample with non-empty name = 4 (loop header) + PCM bytes
  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    if (sd && sd.name) {
      totalSize += 4 + sd.pcm.length;
    }
  }

  // -- Build the binary -----------------------------------------------------

  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  let pos = 0;

  // -- Header (82 bytes) ----------------------------------------------------

  // Magic "FTMN"
  bytes[0] = 0x46; bytes[1] = 0x54; bytes[2] = 0x4D; bytes[3] = 0x4E;
  pos = 4;

  writeU8(view, pos, 3);                      pos += 1; // version
  writeU8(view, pos, numSamples);              pos += 1; // numSamples
  writeU16BE(view, pos, numMeasures);          pos += 2; // numMeasures
  writeU16BE(view, pos, clampedTempo);         pos += 2; // tempo
  writeU8(view, pos, 0);                       pos += 1; // tonality
  writeU8(view, pos, muteStatus);              pos += 1; // muteStatus
  writeU8(view, pos, globalVolume);            pos += 1; // globalVolume
  writeU8(view, pos, 0x01);                    pos += 1; // flags (embedded samples)
  writeU8(view, pos, ticksPerRow);             pos += 1; // ticksPerRow
  writeU8(view, pos, rowsPerMeasure);          pos += 1; // rowsPerMeasure

  // title[32]
  const title = (song.name || '').slice(0, 32);
  writeString(view, pos, title, 32);           pos += 32;

  // artist[32] — no artist field in TrackerSong, leave blank
  writeString(view, pos, '', 32);              pos += 32;

  writeU8(view, pos, 0);                       pos += 1; // numEffects
  writeU8(view, pos, 0);                       pos += 1; // padding

  // -- Sample headers (numSamples × 32 bytes) --------------------------------

  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    const name = sd?.name || song.instruments[s]?.name || '';
    writeString(view, pos, name.slice(0, 30), 30);
    pos += 30;
    writeU8(view, pos, 0);                     pos += 1; // unknown
    writeU8(view, pos, 0);                     pos += 1; // iffOctave
  }

  // -- No effect table or scripts (numEffects = 0) ---------------------------

  // -- Channel data -----------------------------------------------------------

  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const stream = channelStreams[ch];
    writeU16BE(view, pos, 0);                  pos += 2; // defaultSpacing = 0
    writeU32BE(view, pos, stream.length);      pos += 4; // chunkSize
    bytes.set(stream, pos);                    pos += stream.length;
  }

  // -- Sample data (embedded) ------------------------------------------------

  for (let s = 0; s < numSamples; s++) {
    const sd = samples[s];
    if (!sd || !sd.name) continue;

    writeU16BE(view, pos, sd.loopStartWords);  pos += 2;
    writeU16BE(view, pos, sd.loopLengthWords); pos += 2;
    bytes.set(sd.pcm, pos);                    pos += sd.pcm.length;
  }

  // -- Build result -----------------------------------------------------------

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
