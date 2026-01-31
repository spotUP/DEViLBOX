/**
 * FastTracker II XM Format Parser
 * Native binary parser for .XM files with full sample and envelope extraction
 *
 * Based on XM Format Specification v1.04 and FastTracker II source code
 */

import type {
  ParsedInstrument,
  ParsedSample,
  EnvelopePoints,
  EnvelopePoint,
  AutoVibrato,
  ImportMetadata,
} from '../../../types/tracker';

/**
 * XM File Header (80 bytes)
 */
interface XMHeader {
  idText: string; // "Extended Module: "
  moduleName: string; // 20 bytes
  trackerName: string; // 20 bytes
  versionNumber: number; // 0x0104 = v1.04
  headerSize: number; // Header size (usually 276)
  songLength: number; // Pattern order table length
  restartPosition: number; // Restart position
  channelCount: number; // 2-32 channels
  patternCount: number; // Max 256
  instrumentCount: number; // Max 128
  flags: number; // Bit 0: 0=Amiga, 1=Linear frequency
  defaultTempo: number; // Ticks per row (speed)
  defaultBPM: number; // Beats per minute
  patternOrderTable: number[]; // 256 bytes
}

/**
 * XM Pattern Header - exported for documentation
 */
export interface XMPatternHeader {
  headerLength: number;
  packingType: number; // Always 0
  rowCount: number; // 1-256
  packedDataSize: number;
}

/**
 * XM Pattern Note (unpacked)
 */
export interface XMNote {
  note: number; // 0=no note, 1-96=C-0 to B-7, 97=note off
  instrument: number; // 0=no instrument, 1-128
  volume: number; // 0=no volume, 0x10-0x50=volume 0-64, 0x60-0xFF=effects
  effectType: number; // 0-35 (0-Z in hex)
  effectParam: number; // 0-255
}

/**
 * XM Instrument Header (243 bytes for v1.04) - exported for documentation
 */
export interface XMInstrumentHeader {
  size: number; // Header size
  name: string; // 22 bytes
  type: number; // Always 0
  sampleCount: number; // 0-16 samples per instrument
  sampleHeaderSize: number; // 40 bytes if samples > 0

  // Sample mapping (96 bytes) - note number to sample number
  sampleMap: number[];

  // Volume envelope (48 bytes)
  volumeEnvelope: EnvelopePoints;

  // Panning envelope (48 bytes)
  panningEnvelope: EnvelopePoints;

  volumeType: number; // Bit 0: on, 1: sustain, 2: loop
  panningType: number; // Bit 0: on, 1: sustain, 2: loop

  vibratoType: number; // 0-3
  vibratoSweep: number;
  vibratoDepth: number;
  vibratoRate: number;

  volumeFadeout: number; // 0-4095
}

/**
 * XM Sample Header (40 bytes)
 */
interface XMSampleHeader {
  length: number; // Sample length in bytes
  loopStart: number; // Loop start in bytes
  loopLength: number; // Loop length in bytes
  volume: number; // 0-64
  finetune: number; // -128 to +127
  type: number; // Bit 0-1: 0=no loop, 1=forward, 2=pingpong; Bit 4: 0=8-bit, 1=16-bit
  panning: number; // 0-255
  relativeNote: number; // -96 to +95 (signed)
  reserved: number;
  name: string; // 22 bytes
}

/**
 * Parse XM file from ArrayBuffer
 */
export async function parseXM(buffer: ArrayBuffer): Promise<{
  header: XMHeader;
  patterns: XMNote[][][]; // [pattern][row][channel]
  instruments: ParsedInstrument[];
  metadata: ImportMetadata;
}> {
  const view = new DataView(buffer);
  let offset = 0;

  // Read header
  const header = readXMHeader(view, offset);
  offset += header.headerSize;

  // Read patterns
  const patterns: XMNote[][][] = [];
  for (let i = 0; i < header.patternCount; i++) {
    const pattern = readXMPattern(view, offset, header.channelCount);
    patterns.push(pattern.notes);
    offset += pattern.totalSize;
  }

  // Read instruments
  const instruments: ParsedInstrument[] = [];
  for (let i = 0; i < header.instrumentCount; i++) {
    const instrument = readXMInstrument(view, offset);
    // XM instruments are 1-indexed (1-128) in pattern data
    instrument.parsed.id = i + 1;
    // Also update sample IDs to match
    instrument.parsed.samples.forEach((sample, _sampleIdx) => {
      sample.id = i + 1; // Use instrument ID for sample (XM typically has 1 sample per instrument)
    });
    instruments.push(instrument.parsed);
    offset += instrument.totalSize;
  }

  // Build metadata
  const metadata: ImportMetadata = {
    sourceFormat: 'XM',
    sourceFile: header.moduleName,
    importedAt: new Date().toISOString(),
    originalChannelCount: header.channelCount,
    originalPatternCount: header.patternCount,
    originalInstrumentCount: header.instrumentCount,
    modData: {
      moduleType: 'XM',
      initialSpeed: header.defaultTempo,
      initialBPM: header.defaultBPM,
      amigaPeriods: (header.flags & 0x01) === 0,
      channelNames: Array.from({ length: header.channelCount }, (_, i) => `Channel ${i + 1}`),
      songLength: header.songLength,
      restartPosition: header.restartPosition,
      patternOrderTable: header.patternOrderTable,
    },
    xmData: {
      frequencyType: (header.flags & 0x01) ? 'linear' : 'amiga',
      defaultPanning: Array.from({ length: header.channelCount }, () => 128),
    },
    originalSamples: {},
    envelopes: {},
  };

  // Store samples and envelopes in metadata
  instruments.forEach((inst) => {
    inst.samples.forEach((sample) => {
      metadata.originalSamples![sample.id] = sample;
    });

    metadata.envelopes![inst.id] = {
      volumeEnvelope: inst.volumeEnvelope,
      panningEnvelope: inst.panningEnvelope,
      autoVibrato: inst.autoVibrato,
      fadeout: inst.fadeout,
    };
  });

  return { header, patterns, instruments, metadata };
}

/**
 * Read XM header (80 + header extension bytes)
 */
function readXMHeader(view: DataView, offset: number): XMHeader {
  // Read ID text (17 bytes)
  const idText = readString(view, offset, 17);
  if (idText !== 'Extended Module: ') {
    throw new Error('Invalid XM file: incorrect header signature');
  }

  // Read module name (20 bytes)
  const moduleName = readString(view, offset + 17, 20).trim();

  // Skip 0x1A byte
  offset += 38;

  // Read tracker name (20 bytes)
  const trackerName = readString(view, offset, 20).trim();
  offset += 20;

  // Read version (2 bytes, little-endian)
  const versionNumber = view.getUint16(offset, true);
  offset += 2;

  // Read header size (4 bytes)
  const headerSize = view.getUint32(offset, true);
  offset += 4;

  // Read song length (2 bytes)
  const songLength = view.getUint16(offset, true);
  offset += 2;

  // Read restart position (2 bytes)
  const restartPosition = view.getUint16(offset, true);
  offset += 2;

  // Read channel count (2 bytes)
  const channelCount = view.getUint16(offset, true);
  offset += 2;

  // Read pattern count (2 bytes)
  const patternCount = view.getUint16(offset, true);
  offset += 2;

  // Read instrument count (2 bytes)
  const instrumentCount = view.getUint16(offset, true);
  offset += 2;

  // Read flags (2 bytes)
  const flags = view.getUint16(offset, true);
  offset += 2;

  // Read default tempo (2 bytes)
  const defaultTempo = view.getUint16(offset, true);
  offset += 2;

  // Read default BPM (2 bytes)
  const defaultBPM = view.getUint16(offset, true);
  offset += 2;

  // Read pattern order table (256 bytes)
  const patternOrderTable: number[] = [];
  for (let i = 0; i < 256; i++) {
    patternOrderTable.push(view.getUint8(offset + i));
  }

  return {
    idText,
    moduleName,
    trackerName,
    versionNumber,
    headerSize,
    songLength,
    restartPosition,
    channelCount,
    patternCount,
    instrumentCount,
    flags,
    defaultTempo,
    defaultBPM,
    patternOrderTable,
  };
}

/**
 * Read XM pattern
 */
function readXMPattern(view: DataView, offset: number, channelCount: number): {
  notes: XMNote[][];
  totalSize: number;
} {
  const startOffset = offset;

  // Read pattern header (9 bytes)
  const headerLength = view.getUint32(offset, true);
  void headerLength; // Header length for format validation
  offset += 4;

  const packingType = view.getUint8(offset);
  void packingType; // Packing type (always 0 in current format)
  offset += 1;

  const rowCount = view.getUint16(offset, true) || 64; // Default to 64 if 0
  offset += 2;

  const packedDataSize = view.getUint16(offset, true);
  offset += 2;

  // Read packed pattern data
  const notes: XMNote[][] = [];
  const packedData = new Uint8Array(view.buffer, offset, packedDataSize);
  offset += packedDataSize;

  // Unpack pattern data
  let dataOffset = 0;
  for (let row = 0; row < rowCount; row++) {
    const rowNotes: XMNote[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const note: XMNote = {
        note: 0,
        instrument: 0,
        volume: 0,
        effectType: 0,
        effectParam: 0,
      };

      if (dataOffset >= packedData.length) {
        rowNotes.push(note);
        continue;
      }

      const packByte = packedData[dataOffset++];

      if (packByte & 0x80) {
        // Compressed note
        if (packByte & 0x01) note.note = packedData[dataOffset++];
        if (packByte & 0x02) note.instrument = packedData[dataOffset++];
        if (packByte & 0x04) note.volume = packedData[dataOffset++];
        if (packByte & 0x08) note.effectType = packedData[dataOffset++];
        if (packByte & 0x10) note.effectParam = packedData[dataOffset++];
      } else {
        // Uncompressed note (5 bytes)
        note.note = packByte;
        note.instrument = packedData[dataOffset++];
        note.volume = packedData[dataOffset++];
        note.effectType = packedData[dataOffset++];
        note.effectParam = packedData[dataOffset++];
      }

      rowNotes.push(note);
    }

    notes.push(rowNotes);
  }

  return {
    notes,
    totalSize: offset - startOffset,
  };
}

/**
 * Read XM instrument with samples
 */
function readXMInstrument(view: DataView, offset: number): {
  parsed: ParsedInstrument;
  totalSize: number;
} {
  const startOffset = offset;

  // Read instrument header size
  const headerSize = view.getUint32(offset, true);
  offset += 4;

  // Read instrument name (22 bytes)
  const name = readString(view, offset, 22).trim();
  offset += 22;

  // Read type (1 byte) - always 0 in XM format
  const instType = view.getUint8(offset);
  void instType; // Instrument type (reserved, always 0)
  offset += 1;

  // Read sample count (2 bytes)
  const sampleCount = view.getUint16(offset, true);
  offset += 2;

  let sampleHeaderSize = 0;
  let sampleMap: number[] = [];
  let volumeEnvelope: EnvelopePoints | undefined;
  let panningEnvelope: EnvelopePoints | undefined;
  let autoVibrato: AutoVibrato | undefined;
  let fadeout = 0;

  if (sampleCount > 0) {
    // Read sample header size (4 bytes)
    sampleHeaderSize = view.getUint32(offset, true);
    offset += 4;

    // Read sample map (96 bytes)
    sampleMap = [];
    for (let i = 0; i < 96; i++) {
      sampleMap.push(view.getUint8(offset + i));
    }
    offset += 96;

    // Read volume envelope points (48 bytes)
    volumeEnvelope = readEnvelope(view, offset);
    offset += 48;

    // Read panning envelope points (48 bytes)
    panningEnvelope = readEnvelope(view, offset);
    offset += 48;

    // Read envelope flags
    const volumeType = view.getUint8(offset);
    offset += 1;

    const panningType = view.getUint8(offset);
    offset += 1;

    volumeEnvelope.enabled = (volumeType & 0x01) !== 0;
    panningEnvelope.enabled = (panningType & 0x01) !== 0;

    // Read vibrato settings (4 bytes)
    const vibratoType = view.getUint8(offset);
    offset += 1;

    const vibratoSweep = view.getUint8(offset);
    offset += 1;

    const vibratoDepth = view.getUint8(offset);
    offset += 1;

    const vibratoRate = view.getUint8(offset);
    offset += 1;

    autoVibrato = {
      type: ['sine', 'square', 'rampDown', 'rampUp'][vibratoType] as any,
      sweep: vibratoSweep,
      depth: vibratoDepth,
      rate: vibratoRate,
    };

    // Read volume fadeout (2 bytes)
    fadeout = view.getUint16(offset, true);
    offset += 2;

    // Skip reserved bytes (22 bytes in v1.04)
    offset += 22;
  }

  // Align to header size
  offset = startOffset + headerSize;

  // Read sample headers
  const sampleHeaders: XMSampleHeader[] = [];
  for (let i = 0; i < sampleCount; i++) {
    sampleHeaders.push(readXMSampleHeader(view, offset));
    offset += sampleHeaderSize;
  }

  // Read sample data
  const samples: ParsedSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const header = sampleHeaders[i];
    const sampleData = readSampleData(view, offset, header);
    offset += header.length;

    samples.push({
      id: i,
      name: header.name,
      pcmData: sampleData,
      loopStart: header.loopStart / (header.type & 0x10 ? 2 : 1), // Convert bytes to frames
      loopLength: header.loopLength / (header.type & 0x10 ? 2 : 1),
      loopType: (header.type & 0x03) === 0 ? 'none' : (header.type & 0x03) === 1 ? 'forward' : 'pingpong',
      volume: header.volume,
      finetune: header.finetune,
      relativeNote: header.relativeNote,
      panning: header.panning,
      bitDepth: (header.type & 0x10) ? 16 : 8,
      sampleRate: 44100, // XM doesn't store sample rate, use standard
      length: header.length / (header.type & 0x10 ? 2 : 1),
    });
  }

  return {
    parsed: {
      id: 0, // Will be set by caller
      name,
      samples,
      volumeEnvelope,
      panningEnvelope,
      autoVibrato,
      fadeout,
      volumeType: 'envelope',
      panningType: 'envelope',
    },
    totalSize: offset - startOffset,
  };
}

/**
 * Read envelope points
 */
function readEnvelope(view: DataView, offset: number): EnvelopePoints {
  const points: EnvelopePoint[] = [];

  // Read 12 points (4 bytes each: 2 bytes X, 2 bytes Y)
  for (let i = 0; i < 12; i++) {
    const tick = view.getUint16(offset + i * 4, true);
    const value = view.getUint16(offset + i * 4 + 2, true);
    points.push({ tick, value });
  }

  // Read number of points (1 byte)
  const numPoints = view.getUint8(offset + 48);

  // Read sustain point (1 byte)
  const sustainPoint = view.getUint8(offset + 49);

  // Read loop start/end (2 bytes)
  const loopStartPoint = view.getUint8(offset + 50);
  const loopEndPoint = view.getUint8(offset + 51);

  return {
    enabled: false, // Will be set from envelope type flags
    points: points.slice(0, numPoints),
    sustainPoint: numPoints > 0 ? sustainPoint : null,
    loopStartPoint: numPoints > 0 ? loopStartPoint : null,
    loopEndPoint: numPoints > 0 ? loopEndPoint : null,
  };
}

/**
 * Read XM sample header
 */
function readXMSampleHeader(view: DataView, offset: number): XMSampleHeader {
  const length = view.getUint32(offset, true);
  const loopStart = view.getUint32(offset + 4, true);
  const loopLength = view.getUint32(offset + 8, true);
  const volume = view.getUint8(offset + 12);
  const finetune = view.getInt8(offset + 13);
  const type = view.getUint8(offset + 14);
  const panning = view.getUint8(offset + 15);
  const relativeNote = view.getInt8(offset + 16);
  const reserved = view.getUint8(offset + 17);
  const name = readString(view, offset + 18, 22).trim();

  return {
    length,
    loopStart,
    loopLength,
    volume,
    finetune,
    type,
    panning,
    relativeNote,
    reserved,
    name,
  };
}

/**
 * Read sample PCM data
 */
function readSampleData(view: DataView, offset: number, header: XMSampleHeader): ArrayBuffer {
  const is16Bit = (header.type & 0x10) !== 0;
  const length = header.length;

  if (is16Bit) {
    // 16-bit delta-encoded
    const samples = new Int16Array(length / 2);
    let old = 0;
    for (let i = 0; i < samples.length; i++) {
      const delta = view.getInt16(offset + i * 2, true);
      old += delta;
      samples[i] = old;
    }
    return samples.buffer;
  } else {
    // 8-bit delta-encoded
    const samples = new Int8Array(length);
    let old = 0;
    for (let i = 0; i < samples.length; i++) {
      const delta = view.getInt8(offset + i);
      old += delta;
      samples[i] = old;
    }
    return samples.buffer;
  }
}

/**
 * Read null-terminated string
 */
function readString(view: DataView, offset: number, maxLength: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxLength; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return String.fromCharCode(...bytes);
}
