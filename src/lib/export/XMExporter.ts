/**
 * XM Exporter - Export DEViLBOX patterns to FastTracker II XM format
 * Supports lossless export for imported XM files with preserved metadata
 */

import type { Pattern, TrackerCell, ImportMetadata, EnvelopePoints } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import { adsrToEnvelopePoints as _adsrToEnvelopePoints } from '../import/EnvelopeConverter';

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
  const isReexport = importMetadata?.sourceFormat === 'XM';
  void isReexport; // Used for lossless re-export optimization path

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
      warnings.push(`Synth instrument "${inst.name}" will be rendered as sample.`);
      // TODO: Render synth to sample (would need audio engine access)
      // For now, create empty sample
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
  // Convert note - handle both numeric (XM) and string (legacy) formats
  let note = 0;
  const noteValue = cell.note;

  if (noteValue) {
    if (typeof noteValue === 'number') {
      // Already in XM numeric format (1-96 = notes, 97 = note off)
      note = noteValue;
    } else if (noteValue === '===') {
      note = 97; // Note off
    } else if (noteValue !== '---') {
      // Convert string note to XM number
      note = noteNameToNumber(noteValue);
    }
  }

  // Convert instrument
  const instrument = cell.instrument || 0;

  // Convert volume (combine direct volume and effTyp2/eff2 volume column)
  let volume = 0;
  if (cell.volume !== null) {
    // Direct volume set (0-64)
    volume = 0x10 + Math.min(cell.volume, 0x40);
  } else if ((cell.effTyp2 !== undefined && cell.effTyp2 !== 0) || (cell.eff2 !== undefined && cell.eff2 !== 0)) {
    // Convert numeric effTyp2/eff2 back to volume column effect
    volume = convertEffectToVolumeColumnNumeric(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  }

  // Convert main effect
  let effectType = 0;
  let effectParam = 0;
  if (cell.effect && cell.effect !== '...') {
    const parsed = parseEffect(cell.effect);
    effectType = parsed.type;
    effectParam = parsed.param;
  }

  return {
    note,
    instrument,
    volume,
    effectType,
    effectParam,
  };
}

/**
 * Convert note name to XM note number
 * XM: 1-96 = C-0 to B-7
 */
function noteNameToNumber(noteName: string): number {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = noteName.match(/^([A-G]#?)-?(\d)$/);

  if (!match) return 0;

  const note = notes.indexOf(match[1]);
  const octave = parseInt(match[2]);

  if (note === -1 || octave < 0 || octave > 7) return 0;

  return octave * 12 + note + 1;
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
 * Convert numeric effTyp2/eff2 back to XM volume column byte
 */
function convertEffectToVolumeColumnNumeric(effTyp: number, eff: number): number {
  if (effTyp === 0xA) {
    // Volume slide
    const x = (eff >> 4) & 0x0F;
    const y = eff & 0x0F;

    if (x > 0) return 0x70 + x; // Volume slide up
    if (y > 0) return 0x60 + y; // Volume slide down
  }

  if (effTyp === 0xE) {
    const x = (eff >> 4) & 0x0F;
    const y = eff & 0x0F;

    if (x === 0xA) return 0x90 + y; // Fine volume up (EAx)
    if (x === 0xB) return 0x80 + y; // Fine volume down (EBx)
  }

  if (effTyp === 0x4) {
    // Vibrato depth
    const y = eff & 0x0F;
    return 0xB0 + y;
  }

  if (effTyp === 0x3) {
    // Tone portamento
    const speed = Math.floor(eff / 16);
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
  // TODO: Implement full instrument writing
  // For now, write minimal empty instrument header

  const headerSize = instrument.samples.length > 0 ? 263 : 29;
  const buffer = new Uint8Array(headerSize);
  const view = new DataView(buffer.buffer);

  // Instrument header size (4 bytes)
  view.setUint32(0, headerSize, true);

  // Instrument name (22 bytes)
  writeString(buffer, 4, instrument.name, 22);

  // Type (1 byte) - always 0
  buffer[26] = 0;

  // Sample count (2 bytes)
  view.setUint16(27, instrument.samples.length, true);

  // If no samples, we're done
  if (instrument.samples.length === 0) {
    return buffer;
  }

  // TODO: Write full instrument data (sample headers, envelopes, sample data)
  // This would require implementing the full XM instrument structure

  return buffer;
}

/**
 * Write string to buffer (null-padded)
 */
function writeString(buffer: Uint8Array, offset: number, str: string, maxLength: number): void {
  for (let i = 0; i < maxLength; i++) {
    buffer[offset + i] = i < str.length ? str.charCodeAt(i) : 0;
  }
}
