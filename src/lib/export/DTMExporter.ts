/**
 * DTMExporter.ts — Export TrackerSong as Digital Tracker (.dtm) format
 *
 * Produces a valid DTM file with IFF-style chunked layout.
 * Supports two pattern formats:
 *   - PT format (ProTracker compatible, period-based cells)
 *   - 2.04 format (XM-style note-encoded cells)
 *
 * Binary layout:
 *   DTMFileHeader (22 bytes):
 *     +0  magic[4]          = "D.T."
 *     +4  headerSize        uint32BE — total header size including magic+size
 *     +8  type              uint16BE — 0
 *     +10 stereoMode        uint8    — 0xFF=panoramic, 0x00=old LRRL
 *     +11 bitDepth          uint8    — 8
 *     +12 reserved          uint16BE — 0
 *     +14 speed             uint16BE — initial ticks/row
 *     +16 tempo             uint16BE — initial BPM
 *     +18 forcedSampleRate  uint32BE — 0 for 2.04; sample rate for PT
 *     +22 song name         null-terminated, (headerSize - 14) bytes
 *   Then IFF chunks:
 *     S.Q.  — order list
 *     PATT  — pattern format info
 *     INST  — sample headers
 *     DAPT  — pattern data (one per pattern)
 *     DAIT  — sample PCM data (one per sample)
 *
 * Reference: DTMParser.ts (import) and DTMEncoder.ts (chip RAM encoder)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

/** Build a big-endian 32-bit magic number from a 4-character ASCII string. */
function magic(s: string): number {
  return (
    (s.charCodeAt(0) << 24) |
    (s.charCodeAt(1) << 16) |
    (s.charCodeAt(2) << 8) |
    s.charCodeAt(3)
  ) >>> 0;
}

/** Build an IFF chunk: 4-byte id + 4-byte length + data. Pads to even length. */
function iffChunk(id: string, data: Uint8Array): Uint8Array {
  const padded = data.length & 1 ? data.length + 1 : data.length;
  const result = new Uint8Array(8 + padded);
  for (let i = 0; i < 4; i++) result[i] = id.charCodeAt(i) & 0xFF;
  const view = new DataView(result.buffer);
  view.setUint32(4, data.length, false);
  result.set(data, 8);
  return result;
}

// ── Amiga period table for PT format ─────────────────────────────────────────

const AMIGA_PERIODS = [
  // Octave 0 (C-0 to B-0) — extended
  1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note number to Amiga period.
 * XM note 1 = C-0 (period 1712). XM note 13 = C-1 (period 856).
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0;
  const idx = xmNote - 1; // 0-based index into period table
  if (idx < 0 || idx >= AMIGA_PERIODS.length) return 0;
  return AMIGA_PERIODS[idx];
}

// ── Cell encoding ────────────────────────────────────────────────────────────

/**
 * Encode a TrackerCell as a PT-format cell (4 bytes, period-based).
 * Layout:
 *   byte[0] = (instrHi & 0xF0) | (periodHi & 0x0F)
 *   byte[1] = periodLo
 *   byte[2] = (instrLo << 4) | (effect & 0x0F)
 *   byte[3] = effectParam
 */
function encodePTCell(
  note: number,
  instrument: number,
  effTyp: number,
  eff: number,
): Uint8Array {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(note);
  const periodHi = (period >> 8) & 0x0F;
  const periodLo = period & 0xFF;
  const instrHi = instrument & 0xF0;

  // Standard MOD layout:
  //   byte0 = (instr & 0xF0) | periodHi
  //   byte2 = ((instr & 0x0F) << 4) | effect
  out[0] = instrHi | periodHi;
  out[1] = periodLo;
  out[2] = ((instrument & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;
  return out;
}

/**
 * Encode a TrackerCell as a DTM 2.04 cell (4 bytes, note-encoded).
 * Layout matches DTMEncoder.ts and the parser's decode204Cell.
 *
 * Note encoding: octave = (xmNote - 12) / 12, semitone = (xmNote - 12) % 12
 *   byte[0] = (octave << 4) | semitone
 *
 * The parser does: xmNote = ((d0 >> 4) * 12) + (d0 & 0x0F) + 12
 * So to reverse: raw = xmNote - 12, octave = floor(raw / 12), semi = raw % 12
 */
function encode204Cell(
  note: number,
  instrument: number,
  volume: number,
  effTyp: number,
  eff: number,
): Uint8Array {
  const out = new Uint8Array(4);

  // Byte 0: note as BCD
  if (note > 0 && note !== 97) {
    const raw = note - 12;
    if (raw >= 0) {
      const octave = Math.floor(raw / 12);
      const semi = raw % 12;
      out[0] = ((octave & 0x0F) << 4) | (semi & 0x0F);
    }
  }

  // Byte 1: (volume << 2) | instrHi
  // Parser: volField = d1 >> 2; volume = volField > 0 ? volField - 1 : 0
  // Reverse: volField = volume > 0 ? volume + 1 : 0 (but 0 means "no volume column")
  // If volume is 0, we still encode it as volField=1 if there is actual volume data.
  // The parser treats volField=0 as "no volume column". We use volField = vol + 1 always
  // when volume > 0, and 0 when volume == 0 (empty).
  const vol = Math.min(62, volume);
  const volField = vol > 0 ? vol + 1 : 0;
  out[1] = ((volField & 0x3F) << 2) | ((instrument >> 4) & 0x03);

  // Byte 2: (instrLo << 4) | effect
  out[2] = ((instrument & 0x0F) << 4) | (effTyp & 0x0F);

  // Byte 3: effect param
  out[3] = eff & 0xFF;

  return out;
}

// ── Sample extraction ────────────────────────────────────────────────────────

interface DTMSampleData {
  name: string;
  pcm8: Uint8Array;       // 8-bit signed PCM
  volume: number;         // 0–64
  finetune: number;       // MOD finetune 0–15
  loopStart: number;      // in bytes
  loopLength: number;     // in bytes
  sampleRate: number;     // Hz
}

function extractSample(inst: TrackerSong['instruments'][0]): DTMSampleData | null {
  if (!inst?.sample?.audioBuffer) return null;

  const wav = new DataView(inst.sample.audioBuffer);
  // Minimal WAV parsing — find data chunk
  if (wav.byteLength < 44) return null;

  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const sampleRate = wav.getUint32(24, true);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;

  const pcm8 = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm8[j] = (s16 >> 8) & 0xFF; // signed 8-bit
    }
  } else {
    // 8-bit WAV is unsigned; convert to signed
    for (let j = 0; j < frames; j++) {
      pcm8[j] = (wav.getUint8(44 + j) - 128) & 0xFF;
    }
  }

  // Loop info
  const loopStart = inst.sample?.loopStart ?? 0;
  const loopEnd = inst.sample?.loopEnd ?? 0;
  const loopLength = loopEnd > loopStart ? loopEnd - loopStart : 0;

  // Finetune: convert detune cents back to MOD finetune (0-15)
  const detuneCents = inst.sample?.detune ?? 0;
  let finetune = Math.round(detuneCents / (100 / 8));
  if (finetune < 0) finetune += 16; // negative → 8-15
  finetune = Math.max(0, Math.min(15, finetune));

  // Volume: from dB to 0-64
  const volDb = inst.volume ?? 0;
  const vol = volDb <= -60 ? 0 : Math.min(64, Math.round(Math.pow(10, volDb / 20) * 64));

  return {
    name: inst.name || `Sample`,
    pcm8,
    volume: vol,
    finetune,
    loopStart,
    loopLength,
    sampleRate: sampleRate || 8363,
  };
}

// ── Main exporter ────────────────────────────────────────────────────────────

export async function exportDTM(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = Math.min(32, song.numChannels);
  const numPatterns = song.patterns.length;
  const numInstruments = Math.min(255, song.instruments.length);

  // Determine pattern format: use 2.04 by default (more capable).
  // If the song was imported as DTM PT, use PT format.
  const usePTFormat = song.uadePatternLayout?.formatId === 'dtm_pt';
  const patternFormatId = usePTFormat ? 0x00000000 : magic('2.04');

  if (usePTFormat && numChannels > 4) {
    warnings.push(`PT format supports 4 channels; truncating ${numChannels} to 4.`);
  }
  const effectiveChannels = usePTFormat ? Math.min(4, numChannels) : numChannels;

  // ── Extract samples ──────────────────────────────────────────────────────
  const samples: (DTMSampleData | null)[] = [];
  for (let i = 0; i < numInstruments; i++) {
    samples.push(extractSample(song.instruments[i]));
  }

  // Count actual samples (with PCM data)
  const sampleCount = samples.filter(s => s !== null).length;
  if (sampleCount === 0 && numInstruments > 0) {
    warnings.push('No sample PCM data found; instruments will be empty.');
  }

  // ── File header (22 bytes + song name) ───────────────────────────────────
  const songName = song.name || 'Untitled';
  const songNameBytes = Math.max(1, songName.length + 1); // null-terminated
  const songNamePadded = (songNameBytes + 1) & ~1; // pad to even
  const headerSize = 14 + songNamePadded; // headerSize includes magic+size field (8) subtracted, so +14 for the data fields

  const fileHeader = new Uint8Array(22 + songNamePadded);
  const fileHeaderView = new DataView(fileHeader.buffer);

  // Magic: "D.T."
  fileHeader[0] = 0x44; // D
  fileHeader[1] = 0x2E; // .
  fileHeader[2] = 0x54; // T
  fileHeader[3] = 0x2E; // .

  // Header size (includes the 14 bytes of fixed fields after magic+size,
  // plus song name bytes)
  writeU32BE(fileHeaderView, 4, headerSize);

  // Type = 0
  writeU16BE(fileHeaderView, 8, 0);

  // Stereo mode: 0xFF = panoramic
  writeU8(fileHeader, 10, 0xFF);

  // Bit depth: 8
  writeU8(fileHeader, 11, 8);

  // Reserved
  writeU16BE(fileHeaderView, 12, 0);

  // Speed
  writeU16BE(fileHeaderView, 14, song.initialSpeed || 6);

  // Tempo/BPM
  writeU16BE(fileHeaderView, 16, song.initialBPM || 125);

  // Forced sample rate (0 for 2.04, or rate for PT)
  writeU32BE(fileHeaderView, 18, 0);

  // Song name (null-terminated)
  writeStr(fileHeader, 22, songName, songNamePadded);

  // ── S.Q. chunk — order list ──────────────────────────────────────────────
  const songLen = Math.min(256, song.songPositions.length);
  const restartPos = song.restartPosition ?? 0;
  const sqData = new Uint8Array(8 + songLen);
  const sqView = new DataView(sqData.buffer);
  writeU16BE(sqView, 0, songLen);      // ordLen
  writeU16BE(sqView, 2, restartPos);   // restartPos
  writeU32BE(sqView, 4, 0);           // reserved
  for (let i = 0; i < songLen; i++) {
    sqData[8 + i] = (song.songPositions[i] ?? 0) & 0xFF;
  }
  const sqChunk = iffChunk('S.Q.', sqData);

  // ── PATT chunk — pattern format info ─────────────────────────────────────
  const pattData = new Uint8Array(8);
  const pattView = new DataView(pattData.buffer);
  writeU16BE(pattView, 0, effectiveChannels);   // numChannels
  writeU16BE(pattView, 2, numPatterns);          // numStoredPatterns
  writeU32BE(pattView, 4, patternFormatId);      // pattern format
  const pattChunk = iffChunk('PATT', pattData);

  // ── INST chunk — sample headers ──────────────────────────────────────────
  // Each sample header is 50 bytes. The chunk starts with a u16 sample count.
  // If count has bit 15 set, each entry is preceded by a u16 real index.
  // We use the "new samples" format (bit 15 set) with explicit indices.
  const instEntries: Uint8Array[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const smp = samples[i];
    const entry = new Uint8Array(2 + 50); // 2 bytes index + 50 bytes header
    const ev = new DataView(entry.buffer);

    // Real sample index (0-based, will be read as realSample = value + 1)
    writeU16BE(ev, 0, i);

    // Sample header at offset 2:
    // +0  reserved  uint32BE
    writeU32BE(ev, 2, 0);

    if (smp) {
      // +4  length    uint32BE (bytes)
      writeU32BE(ev, 6, smp.pcm8.length);
      // +8  finetune  uint8
      writeU8(entry, 10, smp.finetune & 0x0F);
      // +9  volume    uint8
      writeU8(entry, 11, smp.volume & 0xFF);
      // +10 loopStart uint32BE
      writeU32BE(ev, 12, smp.loopStart);
      // +14 loopLength uint32BE
      writeU32BE(ev, 16, smp.loopLength);
      // +18 name (22 bytes)
      writeStr(entry, 20, smp.name, 22);
      // +40 stereo byte (0 = mono)
      writeU8(entry, 42, 0);
      // +41 bitDepth (8)
      writeU8(entry, 43, 8);
      // +42 transpose uint16BE (0)
      writeU16BE(ev, 44, 0);
      // +44 unknown uint16BE (0)
      writeU16BE(ev, 46, 0);
      // +46 sampleRate uint32BE
      writeU32BE(ev, 48, smp.sampleRate);
    } else {
      // Empty sample: all zeros except name
      const instName = song.instruments[i]?.name || `Sample ${i + 1}`;
      writeStr(entry, 20, instName, 22);
      writeU8(entry, 43, 8); // bitDepth = 8
    }

    instEntries.push(entry);
  }

  const instDataLen = 2 + instEntries.reduce((sum, e) => sum + e.length, 0);
  const instData = new Uint8Array(instDataLen);
  const instDataView = new DataView(instData.buffer);
  // Sample count with bit 15 set (new format with explicit indices)
  writeU16BE(instDataView, 0, numInstruments | 0x8000);
  let instOff = 2;
  for (const entry of instEntries) {
    instData.set(entry, instOff);
    instOff += entry.length;
  }
  const instChunk = iffChunk('INST', instData);

  // ── DAPT chunks — pattern data ───────────────────────────────────────────
  const daptChunks: Uint8Array[] = [];

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const numRows = pat?.length || 64;
    const cellDataSize = numRows * effectiveChannels * 4;

    // DAPT data: 4 bytes marker (FF FF FF FF) + 2 bytes patNum + 2 bytes numRows + cells
    const daptData = new Uint8Array(8 + cellDataSize);
    const daptView = new DataView(daptData.buffer);

    // Marker
    writeU32BE(daptView, 0, 0xFFFFFFFF);
    // Pattern number
    writeU16BE(daptView, 4, p);
    // Number of rows
    writeU16BE(daptView, 6, numRows);

    // Cell data (row-major order: for each row, for each channel)
    let cellOff = 8;
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < effectiveChannels; ch++) {
        const cell = pat?.channels[ch]?.rows[row];
        const note = cell?.note ?? 0;
        const instrument = cell?.instrument ?? 0;
        const volume = cell?.volume ?? 0;
        const effTyp = cell?.effTyp ?? 0;
        const eff = cell?.eff ?? 0;

        let cellBytes: Uint8Array;
        if (usePTFormat) {
          cellBytes = encodePTCell(note, instrument, effTyp, eff);
        } else {
          cellBytes = encode204Cell(note, instrument, volume, effTyp, eff);
        }

        daptData.set(cellBytes, cellOff);
        cellOff += 4;
      }
    }

    daptChunks.push(iffChunk('DAPT', daptData));
  }

  // ── DAIT chunks — sample PCM data ────────────────────────────────────────
  const daitChunks: Uint8Array[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const smp = samples[i];
    if (!smp || smp.pcm8.length === 0) continue;

    // DAIT data: 2 bytes sample index (0-based) + PCM bytes
    const daitData = new Uint8Array(2 + smp.pcm8.length);
    const daitView = new DataView(daitData.buffer);
    writeU16BE(daitView, 0, i); // 0-based index
    daitData.set(smp.pcm8, 2);

    daitChunks.push(iffChunk('DAIT', daitData));
  }

  // ── Assemble file ────────────────────────────────────────────────────────
  const totalSize = fileHeader.length
    + sqChunk.length
    + pattChunk.length
    + instChunk.length
    + daptChunks.reduce((sum, c) => sum + c.length, 0)
    + daitChunks.reduce((sum, c) => sum + c.length, 0);

  const output = new Uint8Array(totalSize);
  let pos = 0;

  output.set(fileHeader, pos); pos += fileHeader.length;
  output.set(sqChunk, pos); pos += sqChunk.length;
  output.set(pattChunk, pos); pos += pattChunk.length;
  output.set(instChunk, pos); pos += instChunk.length;
  for (const chunk of daptChunks) {
    output.set(chunk, pos); pos += chunk.length;
  }
  for (const chunk of daitChunks) {
    output.set(chunk, pos); pos += chunk.length;
  }

  // Generate filename
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const filename = `${baseName}.dtm`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
