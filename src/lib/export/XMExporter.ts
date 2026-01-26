/**
 * XM Exporter - Export DEViLBOX patterns to FastTracker II XM format
 * Supports lossless export for imported XM files with preserved metadata
 */

import type { Pattern, TrackerCell, ImportMetadata, EnvelopePoints } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';

export interface XMExportOptions {
  channelLimit?: number; // Default 32 (XM max)
  downmixExtra?: boolean; // Downmix channels 33+ or truncate (default: truncate)
  bakeSynthsToSamples?: boolean; // Render synth instruments as samples (default: true)
  stripInstrumentEffects?: boolean; // XM doesn't support effect chains (default: true)
  defaultSpeed?: number; // Default 6 ticks/row
  defaultBPM?: number; // Default 125 BPM
  moduleName?: string; // Module name (20 chars max)
  trackerName?: string; // Tracker name (20 chars max)
}

export interface XMExportResult {
  data: Blob;
  warnings: string[];
  filename: string;
}

/**
 * Export patterns and instruments to XM format
 */
export async function exportAsXM(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  options: XMExportOptions = {}
): Promise<XMExportResult> {
  const warnings: string[] = [];

  // Set defaults
  const channelLimit = options.channelLimit || 32;
  const downmixExtra = options.downmixExtra ?? false;
  const bakeSynthsToSamples = options.bakeSynthsToSamples ?? true;
  const stripInstrumentEffects = options.stripInstrumentEffects ?? true;
  const defaultSpeed = options.defaultSpeed || 6;
  const defaultBPM = options.defaultBPM || 125;
  const moduleName = options.moduleName || 'DEViLBOX Export';
  const trackerName = options.trackerName || 'DEViLBOX v1.0';

  // Check if this was originally imported from XM (can do lossless export)
  const importMetadata = patterns[0]?.importMetadata;
  // const isReexport = importMetadata?.sourceFormat === 'XM'; // Future: use for optimized export path

  // Validate channel count
  const maxChannels = Math.max(...patterns.map(p => p.channels.length));
  if (maxChannels > channelLimit) {
    warnings.push(
      `Pattern has ${maxChannels} channels. XM supports max ${channelLimit}. ` +
      `Extra channels will be ${downmixExtra ? 'downmixed' : 'truncated'}.`
    );
  }

  const effectiveChannels = Math.min(maxChannels, channelLimit);

  // Convert instruments
  const xmInstruments: XMInstrumentData[] = [];
  for (const inst of instruments) {
    if (inst.synthType !== 'Sampler' && bakeSynthsToSamples) {
      warnings.push(`Synth instrument "${inst.name}" cannot be exported to XM (synth rendering not supported).`);
      // Note: Rendering synths to samples would require:
      // 1. OfflineAudioContext to render synth audio for each note
      // 2. Converting rendered audio to 8-bit/16-bit delta-encoded PCM
      // 3. Creating proper sample keymap (note-to-sample mapping)
      // This is complex and platform-dependent, so synths export as empty instruments
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    } else if (inst.synthType === 'Sampler') {
      // Convert sampler to XM instrument
      const xmInst = await convertSamplerToXMInstrument(inst, importMetadata);
      xmInstruments.push(xmInst);
    } else {
      warnings.push(`Instrument "${inst.name}" skipped (synth without sample).`);
      xmInstruments.push(createEmptyXMInstrument(inst.name));
    }

    // Check for instrument effects
    if (inst.effects && inst.effects.length > 0 && stripInstrumentEffects) {
      warnings.push(`Instrument "${inst.name}" has ${inst.effects.length} effects that will be lost.`);
    }
  }

  // Convert patterns
  const xmPatterns: XMPatternData[] = patterns.map((pattern, idx) =>
    convertPatternToXM(pattern, effectiveChannels, idx, warnings)
  );

  // Build XM file
  const xmData = buildXMFile({
    moduleName,
    trackerName,
    patterns: xmPatterns,
    instruments: xmInstruments,
    channelCount: effectiveChannels,
    defaultSpeed,
    defaultBPM,
    songLength: patterns.length,
    restartPosition: importMetadata?.modData?.restartPosition || 0,
    linearFrequency: !importMetadata?.modData?.amigaPeriods,
  });

  const blob = new Blob([xmData], { type: 'application/octet-stream' });
  const filename = `${moduleName.replace(/[^a-zA-Z0-9]/g, '_')}.xm`;

  return {
    data: blob,
    warnings,
    filename,
  };
}

/**
 * XM Instrument data structure
 */
interface XMInstrumentData {
  name: string;
  samples: XMSampleData[];
  volumeEnvelope?: EnvelopePoints;
  panningEnvelope?: EnvelopePoints;
  vibratoType: number;
  vibratoSweep: number;
  vibratoDepth: number;
  vibratoRate: number;
  volumeFadeout: number;
}

/**
 * XM Sample data structure
 */
interface XMSampleData {
  name: string;
  pcmData: ArrayBuffer; // 8-bit or 16-bit PCM
  loopStart: number; // In bytes
  loopLength: number; // In bytes
  volume: number; // 0-64
  finetune: number; // -128 to +127
  type: number; // Bit flags: loop type + bit depth
  panning: number; // 0-255
  relativeNote: number; // -96 to +95
}

/**
 * XM Pattern data structure
 */
interface XMPatternData {
  rows: XMNoteData[][];
}

/**
 * XM Note data structure
 */
interface XMNoteData {
  note: number; // 0=no note, 1-96=C-0 to B-7, 97=note off
  instrument: number; // 0=no instrument, 1-128
  volume: number; // 0=no volume, 0x10-0x50=volume, 0x60-0xFF=effects
  effectType: number; // 0-35 (0-Z)
  effectParam: number; // 0-255
}

/**
 * Convert DEViLBOX pattern to XM pattern
 */
function convertPatternToXM(
  pattern: Pattern,
  channelCount: number,
  _patternIndex: number,
  warnings: string[]
): XMPatternData {
  const rows: XMNoteData[][] = [];

  for (let row = 0; row < pattern.length; row++) {
    const rowNotes: XMNoteData[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const cell = pattern.channels[ch]?.rows[row];

      if (!cell) {
        // Empty cell
        rowNotes.push({ note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 });
        continue;
      }

      const xmNote = convertCellToXMNote(cell, warnings);
      rowNotes.push(xmNote);
    }

    rows.push(rowNotes);
  }

  return { rows };
}

/**
 * Convert TrackerCell to XM note
 */
function convertCellToXMNote(cell: TrackerCell, _warnings: string[]): XMNoteData {
  // Note is already in XM format (0 = empty, 1-96 = notes, 97 = note off)
  const note = cell.note ?? 0;

  // Convert instrument (0 = no instrument in XM format)
  const instrument = cell.instrument ?? 0;

  // Convert volume (combine direct volume and effect2 volume column)
  let volume = 0;
  if (cell.volume !== null) {
    // Direct volume set (0-64)
    volume = 0x10 + Math.min(cell.volume, 0x40);
  } else if (cell.effect2) {
    // Convert effect2 back to volume column effect
    volume = convertEffectToVolumeColumn(cell.effect2);
  }

  // Get effect (already in XM format)
  let effectType = cell.effTyp || 0;
  let effectParam = cell.eff || 0;

  return {
    note,
    instrument,
    volume,
    effectType,
    effectParam,
  };
}


/**
 * Parse FT2 effect string (XYZ) to type and param
 */
function parseEffect(effect: string): { type: number; param: number } {
  if (effect.length !== 3) return { type: 0, param: 0 };

  const effectChar = effect[0].toUpperCase();
  const param = parseInt(effect.substring(1), 16);

  // Map effect letters to numbers (0-9, A-Z)
  const effectLetters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const type = effectLetters.indexOf(effectChar);

  return {
    type: type === -1 ? 0 : type,
    param: isNaN(param) ? 0 : param,
  };
}

/**
 * Convert effect2 command back to XM volume column
 */
function convertEffectToVolumeColumn(effect: string): number {
  const parsed = parseEffect(effect);

  // Map common effects back to volume column
  if (parsed.type === 0xA) {
    // Volume slide
    const x = (parsed.param >> 4) & 0x0F;
    const y = parsed.param & 0x0F;

    if (x > 0) return 0x70 + x; // Volume slide up
    if (y > 0) return 0x60 + y; // Volume slide down
  }

  if (parsed.type === 0xE) {
    const x = (parsed.param >> 4) & 0x0F;
    const y = parsed.param & 0x0F;

    if (x === 0xA) return 0x90 + y; // Fine volume up (EAx)
    if (x === 0xB) return 0x80 + y; // Fine volume down (EBx)
  }

  if (parsed.type === 0x4) {
    // Vibrato depth
    const y = parsed.param & 0x0F;
    return 0xB0 + y;
  }

  if (parsed.type === 0x3) {
    // Tone portamento
    const speed = Math.floor(parsed.param / 16);
    return 0xF0 + Math.min(speed, 0x0F);
  }

  return 0;
}

/**
 * Convert Sampler instrument to XM instrument
 */
async function convertSamplerToXMInstrument(
  inst: InstrumentConfig,
  importMetadata?: ImportMetadata
): Promise<XMInstrumentData> {
  // Check if we have preserved original sample
  const originalSample = importMetadata?.originalSamples?.[inst.id];

  if (originalSample) {
    // Use preserved original sample (lossless)
    return {
      name: inst.name.substring(0, 22),
      samples: [
        {
          name: originalSample.name.substring(0, 22),
          pcmData: originalSample.pcmData,
          loopStart: originalSample.loopStart * (originalSample.bitDepth === 16 ? 2 : 1),
          loopLength: originalSample.loopLength * (originalSample.bitDepth === 16 ? 2 : 1),
          volume: originalSample.volume,
          finetune: originalSample.finetune,
          type: buildTypeFlags(originalSample.loopType, originalSample.bitDepth),
          panning: originalSample.panning,
          relativeNote: originalSample.relativeNote,
        },
      ],
      volumeEnvelope: importMetadata?.envelopes?.[inst.id]?.volumeEnvelope,
      panningEnvelope: importMetadata?.envelopes?.[inst.id]?.panningEnvelope,
      vibratoType: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.type === 'sine' ? 0 : 1,
      vibratoSweep: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.sweep || 0,
      vibratoDepth: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.depth || 0,
      vibratoRate: importMetadata?.envelopes?.[inst.id]?.autoVibrato?.rate || 0,
      volumeFadeout: importMetadata?.envelopes?.[inst.id]?.fadeout || 0,
    };
  }

  // No preserved sample - would need to extract from current sample
  // For now, create empty instrument
  return createEmptyXMInstrument(inst.name);
}

/**
 * Build XM type flags byte
 */
function buildTypeFlags(loopType: 'none' | 'forward' | 'pingpong', bitDepth: 8 | 16): number {
  let flags = 0;

  // Loop type (bits 0-1)
  if (loopType === 'forward') flags |= 0x01;
  if (loopType === 'pingpong') flags |= 0x02;

  // Bit depth (bit 4)
  if (bitDepth === 16) flags |= 0x10;

  return flags;
}

/**
 * Create empty XM instrument
 */
function createEmptyXMInstrument(name: string): XMInstrumentData {
  return {
    name: name.substring(0, 22),
    samples: [],
    vibratoType: 0,
    vibratoSweep: 0,
    vibratoDepth: 0,
    vibratoRate: 0,
    volumeFadeout: 0,
  };
}

/**
 * Build XM file from components
 */
function buildXMFile(config: {
  moduleName: string;
  trackerName: string;
  patterns: XMPatternData[];
  instruments: XMInstrumentData[];
  channelCount: number;
  defaultSpeed: number;
  defaultBPM: number;
  songLength: number;
  restartPosition: number;
  linearFrequency: boolean;
}): ArrayBuffer {
  const buffers: Uint8Array[] = [];

  // Write header
  buffers.push(writeXMHeader(config));

  // Write patterns
  for (const pattern of config.patterns) {
    buffers.push(writeXMPattern(pattern, config.channelCount));
  }

  // Write instruments
  for (const instrument of config.instruments) {
    buffers.push(writeXMInstrument(instrument));
  }

  // Concatenate all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result.buffer;
}

/**
 * Write XM header
 */
function writeXMHeader(config: any): Uint8Array {
  const buffer = new Uint8Array(336); // 80 + 256 pattern order table
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // ID text (17 bytes)
  const idText = 'Extended Module: ';
  for (let i = 0; i < 17; i++) {
    buffer[offset++] = idText.charCodeAt(i);
  }

  // Module name (20 bytes)
  writeString(buffer, offset, config.moduleName, 20);
  offset += 20;

  // 0x1A byte
  buffer[offset++] = 0x1A;

  // Tracker name (20 bytes)
  writeString(buffer, offset, config.trackerName, 20);
  offset += 20;

  // Version number (2 bytes, little-endian)
  view.setUint16(offset, 0x0104, true); // v1.04
  offset += 2;

  // Header size (4 bytes) - 276 for standard XM
  view.setUint32(offset, 276, true);
  offset += 4;

  // Song length (2 bytes)
  view.setUint16(offset, config.songLength, true);
  offset += 2;

  // Restart position (2 bytes)
  view.setUint16(offset, config.restartPosition, true);
  offset += 2;

  // Channel count (2 bytes)
  view.setUint16(offset, config.channelCount, true);
  offset += 2;

  // Pattern count (2 bytes)
  view.setUint16(offset, config.patterns.length, true);
  offset += 2;

  // Instrument count (2 bytes)
  view.setUint16(offset, config.instruments.length, true);
  offset += 2;

  // Flags (2 bytes) - bit 0: 0=Amiga, 1=Linear
  view.setUint16(offset, config.linearFrequency ? 0x01 : 0x00, true);
  offset += 2;

  // Default tempo (2 bytes)
  view.setUint16(offset, config.defaultSpeed, true);
  offset += 2;

  // Default BPM (2 bytes)
  view.setUint16(offset, config.defaultBPM, true);
  offset += 2;

  // Pattern order table (256 bytes)
  for (let i = 0; i < 256; i++) {
    buffer[offset++] = i < config.songLength ? i : 0;
  }

  return buffer;
}

/**
 * Write XM pattern
 */
function writeXMPattern(pattern: XMPatternData, channelCount: number): Uint8Array {
  // Pack pattern data
  const packedData = packPatternData(pattern.rows, channelCount);

  // Pattern header (9 bytes)
  const header = new Uint8Array(9);
  const view = new DataView(header.buffer);

  view.setUint32(0, 9, true); // Header length
  header[4] = 0; // Packing type (always 0)
  view.setUint16(5, pattern.rows.length, true); // Row count
  view.setUint16(7, packedData.length, true); // Packed data size

  // Concatenate header + packed data
  const result = new Uint8Array(header.length + packedData.length);
  result.set(header, 0);
  result.set(packedData, header.length);

  return result;
}

/**
 * Pack pattern data using XM bit-flag compression
 */
function packPatternData(rows: XMNoteData[][], channelCount: number): Uint8Array {
  const packed: number[] = [];

  for (const row of rows) {
    for (let ch = 0; ch < channelCount; ch++) {
      const note = row[ch] || { note: 0, instrument: 0, volume: 0, effectType: 0, effectParam: 0 };

      // Check if note is empty
      if (
        note.note === 0 &&
        note.instrument === 0 &&
        note.volume === 0 &&
        note.effectType === 0 &&
        note.effectParam === 0
      ) {
        // Empty note - write compressed (just pack byte)
        packed.push(0x80);
        continue;
      }

      // Build pack byte
      let packByte = 0x80; // Compressed flag
      const data: number[] = [];

      if (note.note > 0) {
        packByte |= 0x01;
        data.push(note.note);
      }
      if (note.instrument > 0) {
        packByte |= 0x02;
        data.push(note.instrument);
      }
      if (note.volume > 0) {
        packByte |= 0x04;
        data.push(note.volume);
      }
      if (note.effectType > 0) {
        packByte |= 0x08;
        data.push(note.effectType);
      }
      if (note.effectParam > 0) {
        packByte |= 0x10;
        data.push(note.effectParam);
      }

      packed.push(packByte);
      packed.push(...data);
    }
  }

  return new Uint8Array(packed);
}

/**
 * Write XM instrument
 */
function writeXMInstrument(instrument: XMInstrumentData): Uint8Array {
  // If no samples, write minimal header (29 bytes)
  if (instrument.samples.length === 0) {
    const buffer = new Uint8Array(29);
    const view = new DataView(buffer.buffer);
    
    view.setUint32(0, 29, true); // Instrument header size
    writeString(buffer, 4, instrument.name, 22);
    buffer[26] = 0; // Type
    view.setUint16(27, 0, true); // Num samples
    
    return buffer;
  }

  // Calculate total size
  // Instrument Header (263) + (NumSamples * SampleHeaderSize (40)) + SampleDataSize
  const instHeaderSize = 263;
  const sampleHeaderSize = 40;
  
  let totalSampleDataSize = 0;
  for (const sample of instrument.samples) {
    totalSampleDataSize += sample.pcmData.byteLength;
  }
  
  const totalSize = instHeaderSize + (instrument.samples.length * sampleHeaderSize) + totalSampleDataSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);
  
  // --- Instrument Header ---
  
  view.setUint32(0, instHeaderSize, true);
  writeString(buffer, 4, instrument.name, 22);
  buffer[26] = 0; // Type
  view.setUint16(27, instrument.samples.length, true);
  view.setUint32(29, sampleHeaderSize, true);
  
  // Note mapping (96 bytes)
  // Map all notes to sample 0 (first sample) for now, or use relativeNote info if available
  // In XM, sample numbers are 0-based in this array
  for (let i = 0; i < 96; i++) {
    buffer[33 + i] = 0; // Default to first sample
  }
  
  // Volume Envelope (48 bytes: 12 points * 4 bytes)
  if (instrument.volumeEnvelope && instrument.volumeEnvelope.points) {
    for (let i = 0; i < Math.min(instrument.volumeEnvelope.points.length, 12); i++) {
      const pt = instrument.volumeEnvelope.points[i];
      view.setUint16(129 + (i * 4), pt.tick, true); // Tick
      view.setUint16(129 + (i * 4) + 2, pt.value, true); // Value
    }
  }
  
  // Panning Envelope (48 bytes)
  if (instrument.panningEnvelope && instrument.panningEnvelope.points) {
    for (let i = 0; i < Math.min(instrument.panningEnvelope.points.length, 12); i++) {
      const pt = instrument.panningEnvelope.points[i];
      view.setUint16(177 + (i * 4), pt.tick, true);
      view.setUint16(177 + (i * 4) + 2, pt.value, true);
    }
  }
  
  // Envelope counts
  view.setUint8(225, instrument.volumeEnvelope?.points?.length || 0);
  view.setUint8(226, instrument.panningEnvelope?.points?.length || 0);

  // Volume Envelope Settings
  view.setUint8(227, instrument.volumeEnvelope?.sustainPoint ?? 0);
  view.setUint8(228, instrument.volumeEnvelope?.loopStartPoint ?? 0);
  view.setUint8(229, instrument.volumeEnvelope?.loopEndPoint ?? 0);
  
  // Panning Envelope Settings
  view.setUint8(230, instrument.panningEnvelope?.sustainPoint ?? 0);
  view.setUint8(231, instrument.panningEnvelope?.loopStartPoint ?? 0);
  view.setUint8(232, instrument.panningEnvelope?.loopEndPoint ?? 0);
  
  // Envelope flags
  let volFlags = 0;
  if (instrument.volumeEnvelope?.enabled) volFlags |= 1; // On
  if (instrument.volumeEnvelope?.sustainPoint !== null && instrument.volumeEnvelope?.sustainPoint !== undefined) volFlags |= 2; // Sustain
  if (instrument.volumeEnvelope?.loopStartPoint !== null && instrument.volumeEnvelope?.loopStartPoint !== undefined) volFlags |= 4; // Loop
  buffer[233] = volFlags;
  
  let panFlags = 0;
  if (instrument.panningEnvelope?.enabled) panFlags |= 1; // On
  if (instrument.panningEnvelope?.sustainPoint !== null && instrument.panningEnvelope?.sustainPoint !== undefined) panFlags |= 2; // Sustain
  if (instrument.panningEnvelope?.loopStartPoint !== null && instrument.panningEnvelope?.loopStartPoint !== undefined) panFlags |= 4; // Loop
  buffer[234] = panFlags;
  
  // Vibrato
  buffer[235] = instrument.vibratoType;
  buffer[236] = instrument.vibratoSweep;
  buffer[237] = instrument.vibratoDepth;
  buffer[238] = instrument.vibratoRate;
  
  view.setUint16(239, instrument.volumeFadeout, true);
  
  // --- Sample Headers ---
  
  let headerOffset = 263;
  let dataOffset = 263 + (instrument.samples.length * sampleHeaderSize);
  
  for (const sample of instrument.samples) {
    // Sample Length
    view.setUint32(headerOffset, sample.pcmData.byteLength, true);
    
    // Loop Start
    view.setUint32(headerOffset + 4, sample.loopStart, true);
    
    // Loop Length
    view.setUint32(headerOffset + 8, sample.loopLength, true);
    
    // Volume
    buffer[headerOffset + 12] = sample.volume;
    
    // Finetune
    buffer[headerOffset + 13] = sample.finetune;
    
    // Type (Loop type + Bit depth)
    buffer[headerOffset + 14] = sample.type;
    
    // Panning
    buffer[headerOffset + 15] = sample.panning;
    
    // Relative Note
    buffer[headerOffset + 16] = sample.relativeNote;
    
    // Reserved (17)
    buffer[headerOffset + 17] = 0;
    
    // Name (22 bytes)
    writeString(buffer, headerOffset + 18, sample.name, 22);
    
    // Write Sample Data (Delta Encoded)
    const is16Bit = (sample.type & 0x10) !== 0;
    const encodedData = deltaEncode(sample.pcmData, is16Bit);
    buffer.set(new Uint8Array(encodedData), dataOffset);
    
    // Advance offsets
    headerOffset += sampleHeaderSize;
    dataOffset += sample.pcmData.byteLength;
  }

  return buffer;
}

/**
 * Perform delta encoding on PCM data
 */
function deltaEncode(buffer: ArrayBuffer, is16Bit: boolean): ArrayBuffer {
  if (is16Bit) {
    const src = new Int16Array(buffer);
    const dest = new Int16Array(src.length);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      const current = src[i];
      dest[i] = current - prev;
      prev = current;
    }
    return dest.buffer;
  } else {
    const src = new Int8Array(buffer);
    const dest = new Int8Array(src.length);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      const current = src[i];
      dest[i] = current - prev;
      prev = current;
    }
    return dest.buffer;
  }
}

/**
 * Write string to buffer (null-padded)
 */
function writeString(buffer: Uint8Array, offset: number, str: string, maxLength: number): void {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
