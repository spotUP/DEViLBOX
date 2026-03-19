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
 * Reference: FaceTheMusicEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

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

// -- Channel event stream encoder --------------------------------------------

/**
 * Encode one channel's pattern data across all measures into an FTM event stream.
 *
 * The event stream uses 2-byte event pairs with spacing updates to skip empty rows.
 * See FaceTheMusicEncoder.ts for the encoding reference.
 */
function encodeChannelStream(
  song: TrackerSong,
  channelIdx: number,
  rowsPerMeasure: number,
): Uint8Array {
  const buf: number[] = [];
  let currentSpacing = 0;
  let emptyRows = 0;

  const numMeasures = song.songPositions.length;

  for (let m = 0; m < numMeasures; m++) {
    const patIdx = song.songPositions[m];
    const pat = song.patterns[patIdx];
    if (!pat) continue;

    const channel = pat.channels[channelIdx];
    if (!channel) continue;

    for (let row = 0; row < rowsPerMeasure; row++) {
      const cell = channel.rows[row];
      if (!cell) {
        emptyRows++;
        continue;
      }

      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const volume = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;

      // Check if cell has any content worth encoding
      const hasContent =
        note !== 0 ||
        instr !== 0 ||
        (effTyp === 0x41 && volume !== 0) ||
        effTyp === 0x1C ||
        effTyp === 0x03 ||
        effTyp === 0x0A;

      if (!hasContent) {
        emptyRows++;
        continue;
      }

      // Emit spacing update if needed
      const neededSpacing = emptyRows;
      if (neededSpacing !== currentSpacing) {
        const sp = neededSpacing & 0xFFF;
        buf.push(0xF0 | ((sp >> 8) & 0x0F));
        buf.push(sp & 0xFF);
        currentSpacing = neededSpacing;
      }

      emptyRows = 0;

      // Encode note bits
      let noteBits = 0;
      if (note === 97) {
        noteBits = 35; // key-off
      } else if (note > 0) {
        noteBits = note - 48;
        if (noteBits < 1) noteBits = 1;
        if (noteBits > 34) noteBits = 34;
      }

      // Determine event type and encode
      let data0 = 0;
      let data1 = 0;

      const param = instr & 0x3F;
      const paramHi = (param >> 2) & 0x0F;
      const paramLo = param & 0x03;

      if (effTyp === 0x41) {
        // Volume set: volNibble = round(volume * 9 / 64) + 1, clamped 1-9
        let volNibble = Math.round(volume * 9 / 64) + 1;
        if (volNibble < 1) volNibble = 1;
        if (volNibble > 9) volNibble = 9;
        data0 = (volNibble << 4) | paramHi;
        data1 = (paramLo << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x1C) {
        // SEL effect
        const selParam = eff & 0x3F;
        data0 = 0xB0 | ((selParam >> 2) & 0x0F);
        data1 = ((selParam & 0x03) << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x03) {
        // Pitch bend
        const pbParam = eff & 0x3F;
        data0 = 0xC0 | ((pbParam >> 2) & 0x0F);
        data1 = ((pbParam & 0x03) << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x0A) {
        // Volume down
        const vdParam = eff & 0x3F;
        data0 = 0xD0 | ((vdParam >> 2) & 0x0F);
        data1 = ((vdParam & 0x03) << 6) | (noteBits & 0x3F);
      } else {
        // Default: set instrument (0x00 high nibble)
        data0 = 0x00 | paramHi;
        data1 = (paramLo << 6) | (noteBits & 0x3F);
      }

      buf.push(data0);
      buf.push(data1);

      currentSpacing = neededSpacing;
      emptyRows = 0;
    }
  }

  return new Uint8Array(buf);
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
      channelStreams.push(encodeChannelStream(song, ch, rowsPerMeasure));
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

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.ftm`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
